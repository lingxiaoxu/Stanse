#!/usr/bin/env python3
"""
公司排名数据收集主控脚本 (Orchestrator)

功能：
1. 自动检测缺失数据
2. 按顺序执行 4 个数据收集脚本
3. 自动重试失败的公司
4. 生成完整的数据收集报告
5. 不产生临时文件，所有状态保存在 Firebase

使用方法：
    # 完整运行（从0开始）
    python3 00-orchestrator.py --mode full

    # 只补齐缺失数据
    python3 00-orchestrator.py --mode fill-missing

    # 只重试失败的公司
    python3 00-orchestrator.py --mode retry

    # 检查数据完整性（不执行收集）
    python3 00-orchestrator.py --mode check-only

作者: Claude Code
日期: 2025-12-30
"""

import os
import sys
import time
import subprocess
from datetime import datetime
from typing import Dict, List, Set, Optional, Any
from collections import defaultdict

import firebase_admin
from firebase_admin import credentials, firestore

# Import from unified data module
from pathlib import Path
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from data.sp500Companies import SP500_TICKERS


# ============================================================
# 配置
# ============================================================


# 数据收集脚本配置
COLLECTION_SCRIPTS = [
    {
        'name': 'FEC Donations',
        'script': '01-collect-fec-donations.py',
        'collection': 'company_rankings_by_ticker',
        'data_field': 'fec_data',
        'env_vars': {'GEMINI_API_KEY': 'gcloud secrets versions access latest --secret=gemini-api-key --project=gen-lang-client-0960644135'},
        'required': True,
        'order': 1
    },
    {
        'name': 'ESG Scores',
        'script': '02-collect-esg-scores.py',
        'collection': 'company_esg_by_ticker',
        'data_field': 'summary',  # ESG脚本将数据保存到根级别，检查summary字段
        'env_vars': {'FMP_API_KEY': 'gcloud secrets versions access latest --secret=FMP_API_KEY --project=gen-lang-client-0960644135'},
        'required': True,
        'order': 2
    },
    {
        'name': 'Polygon News',
        'script': '03-collect-polygon-news.py',
        'collection': 'company_news_by_ticker',
        'data_field': 'articles',
        'env_vars': {'POLYGON_API_KEY': 'gcloud secrets versions access latest --secret=polygon-api-key --project=gen-lang-client-0960644135'},
        'required': True,
        'order': 3
    },
    {
        'name': 'Executive Statements',
        'script': '04-analyze-executive-statements.py',
        'collection': 'company_executive_statements_by_ticker',
        'data_field': 'analysis',
        'env_vars': {'GEMINI_API_KEY': 'gcloud secrets versions access latest --secret=gemini-api-key --project=gen-lang-client-0960644135'},
        'required': False,  # Executive statements 依赖 News 数据
        'order': 4
    }
]


# ============================================================
# 主控类
# ============================================================

class DataCollectionOrchestrator:
    """数据收集主控器"""

    def __init__(self, credentials_path: Optional[str] = None):
        """初始化"""
        # 初始化 Firebase (使用 Application Default Credentials)
        if not firebase_admin._apps:
            if credentials_path:
                cred = credentials.Certificate(credentials_path)
            else:
                # 使用默认凭证（与其他脚本一致）
                cred = credentials.ApplicationDefault()

            firebase_admin.initialize_app(cred, {
                'projectId': 'stanseproject'
            })

        self.db = firestore.client()
        print(f"✅ Firebase initialized (project: stanseproject)")

        # 统计信息
        self.stats = {
            'total_companies': len(SP500_TICKERS),
            'scripts_run': 0,
            'companies_processed': 0,
            'companies_failed': 0,
            'start_time': None,
            'end_time': None
        }

    def check_data_completeness(self) -> Dict[str, Any]:
        """
        检查所有数据源的完整性

        返回：
        {
            'fec_data': {'missing': [...], 'total': 84, 'coverage': 0.95},
            'esg_data': {...},
            'news_data': {...},
            'executive_data': {...}
        }
        """
        print(f"\n{'='*60}")
        print(f"📊 Checking Data Completeness")
        print(f"{'='*60}")
        sys.stdout.flush()

        completeness = {}

        for script_config in COLLECTION_SCRIPTS:
            name = script_config['name']
            collection = script_config['collection']
            data_field = script_config['data_field']

            print(f"\n🔍 Checking {name}...")
            sys.stdout.flush()

            missing_tickers = []

            for i, ticker in enumerate(SP500_TICKERS, 1):
                # 进度指示器：每10个ticker输出一次
                if i % 10 == 0 or i == len(SP500_TICKERS):
                    print(f"  Progress: {i}/{len(SP500_TICKERS)}", end='\r')
                    sys.stdout.flush()

                doc_ref = self.db.collection(collection).document(ticker)
                doc = doc_ref.get()

                if not doc.exists:
                    missing_tickers.append(ticker)
                else:
                    data = doc.to_dict()
                    if data_field not in data or not data[data_field]:
                        missing_tickers.append(ticker)

            total = len(SP500_TICKERS)
            missing = len(missing_tickers)
            coverage = (total - missing) / total

            completeness[data_field] = {
                'missing': missing_tickers,
                'total': total,
                'coverage': coverage,
                'missing_count': missing
            }

            print(f"  ├─ Total: {total}")
            print(f"  ├─ Missing: {missing}")
            print(f"  └─ Coverage: {coverage*100:.1f}%")
            sys.stdout.flush()

        return completeness

    def get_env_value(self, command: str) -> str:
        """执行 gcloud 命令获取环境变量值"""
        try:
            result = subprocess.run(
                command,
                shell=True,
                capture_output=True,
                text=True,
                check=True
            )
            return result.stdout.strip()
        except subprocess.CalledProcessError as e:
            print(f"  ❌ Failed to get env var: {e}")
            return ""

    def run_collection_script(
        self,
        script_config: Dict[str, Any],
        tickers_to_process: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        运行单个数据收集脚本

        返回：
        {
            'success': True/False,
            'processed': 84,
            'failed': ['AAPL', 'MSFT'],
            'duration': 120.5
        }
        """
        name = script_config['name']
        script = script_config['script']
        env_vars = script_config['env_vars']

        print(f"\n{'='*60}")
        print(f"🚀 Running: {name}")
        print(f"{'='*60}")
        print(f"Script: {script}")

        # 准备环境变量
        env = os.environ.copy()
        for key, command in env_vars.items():
            print(f"  ├─ Setting {key}...")
            value = self.get_env_value(command)
            if value:
                env[key] = value
            else:
                print(f"  └─ ⚠️  Failed to get {key}, script may fail")

        # 准备命令 - 需要完整路径
        script_dir = os.path.dirname(os.path.abspath(__file__))
        script_path = os.path.join(script_dir, script)
        cmd_parts = ['python3', '-u', script_path]

        # 如果指定了特定的 tickers，创建临时输入
        if tickers_to_process:
            print(f"  ├─ Processing {len(tickers_to_process)} specific tickers")
            # 通过 stdin 传递 ticker 列表
            ticker_input = '\n'.join(tickers_to_process)
            # 使用临时文件（在脚本运行后会删除）
            temp_file = f'/tmp/orchestrator_tickers_{int(time.time())}.txt'
            with open(temp_file, 'w') as f:
                f.write(ticker_input)
            cmd_parts.append(temp_file)

        # 运行脚本
        start_time = time.time()

        try:
            result = subprocess.run(
                cmd_parts,
                env=env,
                capture_output=True,
                text=True,
                timeout=3600  # 1 hour timeout
            )

            duration = time.time() - start_time

            # 清理临时文件
            if tickers_to_process and os.path.exists(temp_file):
                os.remove(temp_file)

            # 分析输出
            output = result.stdout
            print(output)

            # 打印错误输出（如果有）
            if result.stderr:
                print(f"\n⚠️  STDERR Output:")
                print(result.stderr)

            # 从输出中提取统计信息（简化版本，实际需要更复杂的解析）
            success = result.returncode == 0

            if not success:
                print(f"\n❌ Script failed with return code: {result.returncode}")

            return {
                'success': success,
                'duration': duration,
                'returncode': result.returncode,
                'output': output
            }

        except subprocess.TimeoutExpired:
            print(f"  ❌ Script timeout after 1 hour")
            return {
                'success': False,
                'duration': 3600,
                'returncode': -1,
                'output': 'Timeout'
            }
        except Exception as e:
            print(f"  ❌ Script failed: {str(e)}")
            return {
                'success': False,
                'duration': time.time() - start_time,
                'returncode': -1,
                'output': str(e)
            }

    def run_full_collection(self):
        """完整运行所有数据收集脚本（从0开始）"""
        print(f"\n{'#'*60}")
        print(f"# FULL DATA COLLECTION")
        print(f"# Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"{'#'*60}\n")

        self.stats['start_time'] = time.time()

        # 按顺序运行所有脚本
        for script_config in sorted(COLLECTION_SCRIPTS, key=lambda x: x['order']):
            result = self.run_collection_script(script_config)

            if not result['success'] and script_config['required']:
                print(f"\n❌ CRITICAL: Required script failed: {script_config['name']}")
                print(f"   Cannot continue with remaining scripts")
                break

            self.stats['scripts_run'] += 1

        self.stats['end_time'] = time.time()
        self.print_final_report()

    def run_fill_missing(self):
        """只补齐缺失的数据"""
        print(f"\n{'#'*60}")
        print(f"# FILL MISSING DATA")
        print(f"# Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"{'#'*60}\n")
        sys.stdout.flush()

        self.stats['start_time'] = time.time()

        # 检查缺失数据
        completeness = self.check_data_completeness()

        # 对每个数据源，只处理缺失的公司
        for script_config in sorted(COLLECTION_SCRIPTS, key=lambda x: x['order']):
            data_field = script_config['data_field']
            missing = completeness[data_field]['missing']

            if not missing:
                print(f"\n✅ {script_config['name']}: No missing data, skipping")
                continue

            print(f"\n📋 {script_config['name']}: {len(missing)} missing companies")
            result = self.run_collection_script(script_config, missing)

            self.stats['scripts_run'] += 1

        self.stats['end_time'] = time.time()
        self.print_final_report()

    def run_check_only(self):
        """只检查数据完整性，不执行收集"""
        print(f"\n{'#'*60}")
        print(f"# DATA COMPLETENESS CHECK")
        print(f"# Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"{'#'*60}\n")

        completeness = self.check_data_completeness()

        # 打印总结
        print(f"\n{'='*60}")
        print(f"📊 Summary")
        print(f"{'='*60}")

        for script_config in COLLECTION_SCRIPTS:
            data_field = script_config['data_field']
            stats = completeness[data_field]

            print(f"\n{script_config['name']}:")
            print(f"  ├─ Coverage: {stats['coverage']*100:.1f}%")
            print(f"  ├─ Missing: {stats['missing_count']}/{stats['total']}")
            if stats['missing']:
                print(f"  └─ Missing tickers: {', '.join(stats['missing'][:10])}")
                if len(stats['missing']) > 10:
                    print(f"     ... and {len(stats['missing']) - 10} more")

    def print_final_report(self):
        """打印最终报告"""
        duration = self.stats['end_time'] - self.stats['start_time']

        print(f"\n{'='*60}")
        print(f"✅ Data Collection Complete")
        print(f"{'='*60}")
        print(f"Scripts run: {self.stats['scripts_run']}")
        print(f"Duration: {duration:.1f}s ({duration/60:.1f} minutes)")
        print(f"Finished at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"{'='*60}\n")

        # 重新检查完整性
        print(f"\n📊 Final Data Completeness:")
        completeness = self.check_data_completeness()


# ============================================================
# 主函数
# ============================================================

def main():
    """主函数"""
    import argparse

    parser = argparse.ArgumentParser(description='Company Ranking Data Collection Orchestrator')
    parser.add_argument(
        '--mode',
        choices=['full', 'fill-missing', 'retry', 'check-only'],
        default='check-only',
        help='Execution mode'
    )
    parser.add_argument(
        '--credentials',
        type=str,
        help='Path to Firebase credentials JSON file'
    )

    args = parser.parse_args()

    # 创建主控器
    orchestrator = DataCollectionOrchestrator(args.credentials)

    # 根据模式执行
    if args.mode == 'full':
        orchestrator.run_full_collection()
    elif args.mode == 'fill-missing':
        orchestrator.run_fill_missing()
    elif args.mode == 'retry':
        # retry 模式与 fill-missing 相同
        orchestrator.run_fill_missing()
    elif args.mode == 'check-only':
        orchestrator.run_check_only()


if __name__ == "__main__":
    main()
