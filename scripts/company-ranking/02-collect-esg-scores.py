#!/usr/bin/env python3
"""
ESG Scores Data Collection for Company Rankings

使用 Financial Modeling Prep (FMP) API 获取 SP500 公司 ESG 评分数据
输出: Firebase `company_esg_by_ticker/{ticker}`

运行方式:
    export FMP_API_KEY=your_api_key  # 或从 Google Secret Manager 获取
    python3 02-collect-esg-scores.py

FMP API 文档:
    - ESG Investment Search: https://financialmodelingprep.com/stable/esg-disclosures?symbol=AAPL
    - ESG Ratings: https://financialmodelingprep.com/stable/esg-ratings?symbol=AAPL
    - ESG Benchmark: https://financialmodelingprep.com/stable/esg-benchmark?year=2024

数据结构:
    - 读取: FMP API (Paid Plan) - 3个API端点
    - 写入: company_esg_by_ticker/{ticker}
    - 保存完整的3个API响应 + summary汇总数据
"""

import os
import sys
import json
from datetime import datetime
from typing import Dict, List, Any, Optional
import firebase_admin
from firebase_admin import credentials, firestore
import requests
import time

# 添加项目根目录到 path
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(os.path.dirname(SCRIPT_DIR))

# 导入邮件通知模块
sys.path.insert(0, SCRIPT_DIR)
from email_notifier import log_completion_notification, send_success_email

# Import from unified data module
from pathlib import Path
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from data.sp500Companies import SP500_TICKERS

class FMPESGCollector:
    """Financial Modeling Prep ESG 数据采集器"""

    def __init__(self, credentials_path: Optional[str] = None):
        """初始化 Firebase 连接和 FMP API"""
        # Firebase initialization
        if not firebase_admin._apps:
            if credentials_path:
                cred = credentials.Certificate(credentials_path)
            else:
                # 使用默认凭证（Cloud Run 环境）
                cred = credentials.ApplicationDefault()

            firebase_admin.initialize_app(cred, {
                'projectId': 'stanseproject'
            })

        self.db = firestore.client()
        print(f"✅ Firebase initialized (project: stanseproject)")

        # FMP API key from environment variable
        # IMPORTANT: NEVER hardcode API keys in source code!
        # Set via environment variable or Google Secret Manager
        self.fmp_api_key = os.getenv('FMP_API_KEY')

        if not self.fmp_api_key:
            print("❌ ERROR: FMP_API_KEY not found in environment")
            print("   Please set FMP_API_KEY environment variable")
            print("   For local testing: export FMP_API_KEY=your_key")
            print("   For Cloud Run: Configure Secret Manager")
            sys.exit(1)

        self.base_url = "https://financialmodelingprep.com/stable"
        print(f"✅ FMP API key loaded")

    def safe_float(self, value) -> Optional[float]:
        """安全转换为 float"""
        if value is None or value == '':
            return None
        try:
            return float(value)
        except (ValueError, TypeError):
            return None

    def fetch_esg_disclosures(self, ticker: str) -> Optional[Dict[str, Any]]:
        """
        从 FMP API 获取 ESG Disclosures
        Endpoint: /stable/esg-disclosures?symbol=AAPL

        返回格式:
        {
            "date": "2024-12-28",
            "symbol": "AAPL",
            "environmentalScore": 52.52,
            "socialScore": 45.18,
            "governanceScore": 60.74,
            "ESGScore": 52.81,
            "url": "..."
        }
        """
        url = f"{self.base_url}/esg-disclosures"

        params = {
            'symbol': ticker,
            'apikey': self.fmp_api_key
        }

        try:
            response = requests.get(url, params=params, timeout=15)

            if response.status_code == 429:
                print(f"  ⚠️  Rate limit")
                return None

            if response.status_code == 401 or response.status_code == 403:
                print(f"  ❌ API key invalid")
                return None

            if response.status_code != 200:
                print(f"  ❌ HTTP {response.status_code}")
                return None

            data = response.json()

            if not data or len(data) == 0:
                return None

            # Get the most recent record (first item)
            latest = data[0] if isinstance(data, list) else data

            return latest

        except requests.exceptions.Timeout:
            print(f"  ❌ Timeout")
            return None
        except requests.exceptions.RequestException as e:
            print(f"  ❌ Request error: {str(e)[:50]}")
            return None
        except (ValueError, KeyError) as e:
            print(f"  ❌ Parse error: {str(e)[:50]}")
            return None

    def fetch_esg_ratings(self, ticker: str) -> Optional[Dict[str, Any]]:
        """
        从 FMP API 获取 ESG Ratings (行业排名)
        Endpoint: /stable/esg-ratings?symbol=AAPL

        返回格式:
        {
            "symbol": "AAPL",
            "companyName": "Apple Inc.",
            "industry": "CONSUMER ELECTRONICS",
            "fiscalYear": 2024,  # 注意：API 有时返回错误年份，脚本会自动修正
            "ESGRiskRating": "B",
            "industryRank": "4 out of 5"
        }
        """
        url = f"{self.base_url}/esg-ratings"

        params = {
            'symbol': ticker,
            'apikey': self.fmp_api_key
        }

        try:
            response = requests.get(url, params=params, timeout=15)

            if response.status_code != 200:
                return None

            data = response.json()

            if not data or len(data) == 0:
                return None

            # Get the first record
            latest = data[0] if isinstance(data, list) else data

            return latest

        except:
            return None

    def fetch_esg_benchmark(self, year: int = 2024) -> Optional[Dict[str, Any]]:
        """
        从 FMP API 获取 ESG Benchmark (全行业基准数据)
        Endpoint: /stable/esg-benchmark?year=2024

        返回格式:
        [
            {
                "fiscalYear": 2024,
                "sector": "APPAREL RETAIL",
                "environmentalScore": 61.36,
                "socialScore": 67.44,
                "governanceScore": 68.1,
                "ESGScore": 65.63
            },
            ...
        ]
        """
        url = f"{self.base_url}/esg-benchmark"

        params = {
            'year': year,
            'apikey': self.fmp_api_key
        }

        try:
            response = requests.get(url, params=params, timeout=15)

            if response.status_code != 200:
                return None

            data = response.json()

            if not data or len(data) == 0:
                return None

            # 返回所有行业的基准数据
            return data

        except:
            return None

    def fetch_esg_data(self, ticker: str, benchmark_data: Optional[List[Dict]] = None) -> Optional[Dict[str, Any]]:
        """
        综合获取 ESG 数据（Disclosures + Ratings + Benchmark）

        返回格式:
        {
            'ticker': 'AAPL',
            'disclosures': {...},  # 完整的 ESG Investment Search 数据
            'ratings': {...},       # 完整的 ESG Ratings 数据
            'benchmark': {...},     # 对应行业的 Benchmark 数据
            'summary': {            # 汇总数据用于快速访问
                'environmentalScore': 52.52,
                'socialScore': 45.18,
                'governanceScore': 60.74,
                'ESGScore': 52.81,
                'progressive_lean_score': -1.67
            }
        }
        """
        print(f"\n📊 Processing {ticker}...", end='')

        # 1. 获取ESG Disclosures (投资搜索数据)
        print(f" [1/3 Disclosures]", end='')
        esg_disclosures = self.fetch_esg_disclosures(ticker)
        time.sleep(0.3)  # API间隔

        if not esg_disclosures:
            print(f"\n  └─ No ESG data")
            return None

        # 2. 获取ESG Ratings (行业排名)
        print(f" [2/3 Ratings]", end='')
        esg_ratings = self.fetch_esg_ratings(ticker)
        time.sleep(0.3)  # API间隔

        # 3. 查找对应行业的Benchmark数据
        print(f" [3/3 Benchmark]", end='')
        company_industry = esg_ratings.get('industry') if esg_ratings else None
        company_benchmark = None

        if benchmark_data and company_industry:
            # 在benchmark数据中查找匹配的行业
            for sector_data in benchmark_data:
                if sector_data.get('sector', '').upper() == company_industry.upper():
                    company_benchmark = sector_data
                    break

        # 修正 ratings 中的错误 fiscalYear
        # FMP API 有时返回错误的年份（例如 AAPL 返回 2001），使用 benchmark 的年份修正
        if esg_ratings and company_benchmark:
            corrected_ratings = esg_ratings.copy()
            corrected_ratings['fiscalYear'] = company_benchmark.get('fiscalYear', 2024)
            esg_ratings = corrected_ratings

        # 构建完整结果
        result = {
            'ticker': ticker,
            'data_source': 'fmp_api',
            'collected_at': datetime.now().isoformat(),

            # 保存所有3个API的完整原始数据（ratings 已修正 fiscalYear）
            'disclosures': esg_disclosures,
            'ratings': esg_ratings,
            'benchmark': company_benchmark,
        }

        # 创建汇总数据（用于快速访问和排名算法）
        summary = {
            'companyName': esg_disclosures.get('companyName', ticker),
            'date': esg_disclosures.get('date'),
            'environmentalScore': self.safe_float(esg_disclosures.get('environmentalScore')),
            'socialScore': self.safe_float(esg_disclosures.get('socialScore')),
            'governanceScore': self.safe_float(esg_disclosures.get('governanceScore')),
            'ESGScore': self.safe_float(esg_disclosures.get('ESGScore')),
        }

        # 从 disclosures 的 date 字段提取正确的年份
        # 修复 FMP API 返回错误 fiscalYear 的问题（例如 AAPL 返回 2001 而不是 2024）
        fiscal_year = None
        disclosure_date = esg_disclosures.get('date')
        if disclosure_date:
            try:
                # 解析日期格式 "2025-09-27" 并提取年份
                year = int(disclosure_date.split('-')[0])
                # 如果日期是 2025 年初，可能对应 2024 财年
                # 简单处理：直接使用 benchmark 的年份作为财年
                fiscal_year = 2024 if company_benchmark else year
            except (ValueError, IndexError):
                # 如果解析失败，回退到 benchmark 年份或 ratings 的年份
                fiscal_year = company_benchmark.get('fiscalYear') if company_benchmark else esg_ratings.get('fiscalYear') if esg_ratings else None

        # 添加Ratings信息到汇总
        if esg_ratings:
            summary['industry'] = esg_ratings.get('industry')
            summary['fiscalYear'] = fiscal_year  # 使用修正后的年份
            summary['ESGRiskRating'] = esg_ratings.get('ESGRiskRating')
            summary['industryRank'] = esg_ratings.get('industryRank')

        # 添加Benchmark对比信息
        if company_benchmark:
            summary['industrySectorAvg'] = {
                'environmentalScore': self.safe_float(company_benchmark.get('environmentalScore')),
                'socialScore': self.safe_float(company_benchmark.get('socialScore')),
                'governanceScore': self.safe_float(company_benchmark.get('governanceScore')),
                'ESGScore': self.safe_float(company_benchmark.get('ESGScore'))
            }

        result['summary'] = summary

        # 检查是否有有效数据
        has_valid_score = any([
            summary.get('ESGScore') is not None,
            summary.get('environmentalScore') is not None,
            summary.get('socialScore') is not None,
            summary.get('governanceScore') is not None
        ])

        if not has_valid_score:
            print(f"\n  └─ No valid scores")
            return None

        # 计算进步倾向分数
        # FMP的分数是 0-100，分数越高越好
        env_score = summary.get('environmentalScore')
        social_score = summary.get('socialScore')

        if env_score is not None and social_score is not None:
            # 归一化到 -50 到 +50 范围
            # 分数越高 = 更重视环境和社会责任 = 进步倾向
            progressive_lean = (env_score + social_score) / 2 - 50
            summary['progressive_lean_score'] = round(progressive_lean, 2)

        # 打印摘要
        print()  # 换行
        if summary.get('ESGScore') is not None:
            print(f"  ├─ Total ESG: {summary['ESGScore']:.1f}")
        if summary.get('environmentalScore') is not None:
            print(f"  ├─ Environment: {summary['environmentalScore']:.1f}")
        if summary.get('socialScore') is not None:
            print(f"  ├─ Social: {summary['socialScore']:.1f}")
        if summary.get('governanceScore') is not None:
            print(f"  ├─ Governance: {summary['governanceScore']:.1f}")
        if summary.get('ESGRiskRating'):
            print(f"  ├─ Risk Rating: {summary['ESGRiskRating']}")
        if company_benchmark:
            print(f"  ├─ Industry: {summary.get('industry')} (Sector Avg ESG: {company_benchmark.get('ESGScore'):.1f})")
        if summary.get('progressive_lean_score') is not None:
            lean = summary['progressive_lean_score']
            label = 'PROGRESSIVE' if lean > 10 else 'BALANCED' if lean > -10 else 'TRADITIONAL'
            print(f"  └─ Progressive Lean: {lean:+.1f} ({label})")

        return result

    def save_to_firebase(self, ticker: str, data: Dict[str, Any]):
        """
        保存到 company_esg_by_ticker collection，并保存历史版本

        版本控制策略（统一方案）：
        1. 构建完整的新数据（包含所有字段）
        2. 先将新数据保存到 history/{当前时间戳} 作为快照
        3. 然后用新数据更新主文档（merge=True 保留其他字段）

        结果：
        - history 里的最新版本 = 主文档当前内容（有重叠是正常的）
        - 主文档永远是最新数据
        - 所有嵌套字段（disclosures, ratings, benchmark, summary）都完整保留

        数据结构:
        - 主文档: company_esg_by_ticker/{ticker}
          - ticker: "AAPL"
          - data_source: "fmp_api"
          - collected_at: "2025-12-27T..."
          - disclosures: {...}  (完整的 ESG Investment Search 数据)
          - ratings: {...}      (完整的 ESG Ratings 数据)
          - benchmark: {...}    (对应行业的 Benchmark 数据)
          - summary: {...}      (汇总指标)

        - 历史版本: company_esg_by_ticker/{ticker}/history/{YYYYmmdd_HHMMSS}
          - (该时刻的所有字段，与主文档相同结构)
        """
        # 1. 生成时间戳
        now = datetime.now()
        timestamp_str = now.strftime('%Y%m%d_%H%M%S')

        # 2. 新数据已经包含完整结构（data 参数来自 fetch_esg_data）
        # data 包含: ticker, data_source, collected_at, disclosures, ratings, benchmark, summary
        doc_ref = self.db.collection('company_esg_by_ticker').document(ticker)

        # 3. 先保存新数据到 history（作为当前时刻的快照）
        history_ref = doc_ref.collection('history').document(timestamp_str)
        history_ref.set(data)  # 保留所有嵌套字段
        print(f"  📦 Saved to history: {timestamp_str}")

        # 4. 然后更新主文档（merge=True 保留其他脚本可能添加的字段）
        doc_ref.set(data, merge=True)

        print(f"  ✅ Saved to Firebase: company_esg_by_ticker/{ticker}")

    def run(self, batch_size: int = 10, delay_between_requests: float = 1.5, tickers_to_process: Optional[List[str]] = None):
        """
        运行完整的数据采集流程

        参数:
            batch_size: 每批处理的公司数量
            delay_between_requests: 请求之间的延迟（秒）- 默认1.5秒避免API限流
            tickers_to_process: 可选的ticker列表，如果提供则只处理这些公司
        """
        start_time = time.time()

        tickers = tickers_to_process if tickers_to_process else SP500_TICKERS

        print(f"\n{'='*60}")
        print(f"🔄 FMP ESG Scores Data Collection")
        print(f"{'='*60}")
        print(f"📦 Total companies to process: {len(tickers)}")
        print(f"⚙️  Batch size: {batch_size}, Delay: {delay_between_requests}s")
        print(f"🕒 Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

        # 先获取一次全行业的 Benchmark 数据（避免为每个公司重复调用）
        print(f"\n📈 Fetching industry benchmark data...")
        benchmark_data = self.fetch_esg_benchmark(2024)

        if benchmark_data:
            print(f"  ✅ Loaded {len(benchmark_data)} industry sectors")
        else:
            print(f"  ⚠️  Benchmark data unavailable, continuing without comparison")
            benchmark_data = None

        success_count = 0
        no_data_count = 0
        error_count = 0
        failed_tickers = []

        for i, ticker in enumerate(tickers, 1):
            try:
                print(f"\n[{i}/{len(tickers)}] {ticker}", end='')

                # 传入 benchmark_data 避免重复调用
                esg_data = self.fetch_esg_data(ticker, benchmark_data)

                if esg_data:
                    self.save_to_firebase(ticker, esg_data)
                    success_count += 1
                else:
                    no_data_count += 1

                # 请求间延迟（避免API限流）
                if i < len(tickers):
                    time.sleep(delay_between_requests)

                # 批次间额外延迟
                if i % batch_size == 0 and i < len(tickers):
                    print(f"\n  ⏸️  Batch complete ({i}/{len(tickers)}), pausing...")
                    time.sleep(2.0)  # 批次间延迟增加到2秒

            except Exception as e:
                print(f"\n  ❌ Unexpected error: {str(e)}")
                import traceback
                traceback.print_exc()
                error_count += 1
                failed_tickers.append(ticker)
                time.sleep(2)

        execution_time = time.time() - start_time

        print(f"\n\n{'='*60}")
        print(f"✅ FMP ESG Data Collection Complete")
        print(f"{'='*60}")
        print(f"✅ Success: {success_count}/{len(tickers)} ({success_count*100/len(tickers):.1f}%)")
        print(f"⚠️  No Data: {no_data_count}/{len(tickers)} ({no_data_count*100/len(tickers):.1f}%)")
        print(f"❌ Errors: {error_count}/{len(tickers)}")
        print(f"🕒 Completed at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"{'='*60}\n")

        # 发送完成通知（日志方式）
        log_completion_notification(
            job_name="ESG Scores Collector",
            total_companies=len(tickers),
            successful_companies=success_count,
            failed_companies=failed_tickers,
            execution_time_seconds=execution_time
        )

        # 发送邮件通知
        send_success_email(
            job_name="ESG Scores Collector",
            total_companies=len(tickers),
            successful_companies=success_count,
            failed_companies=failed_tickers,
            execution_time_seconds=execution_time
        )


def main():
    """主函数"""
    # 从环境变量或参数获取凭证路径
    credentials_path = os.getenv('FIREBASE_CREDENTIALS_PATH')
    tickers_file = None
    tickers_to_process = None

    # 解析命令行参数
    if len(sys.argv) > 1:
        # 如果参数是 .txt 文件，则作为ticker文件
        if sys.argv[1].endswith('.txt'):
            tickers_file = sys.argv[1]
        else:
            credentials_path = sys.argv[1]

    # 如果提供了ticker文件，读取文件内容
    if tickers_file:
        with open(tickers_file, 'r') as f:
            tickers_to_process = [
                line.strip()
                for line in f
                if line.strip() and not line.strip().startswith('#')
            ]
        print(f"📝 Processing {len(tickers_to_process)} tickers from {tickers_file}")

    # 创建采集器
    collector = FMPESGCollector(credentials_path)

    # 运行采集
    # - 每批10个公司处理后暂停
    # - 公司间隔1.5秒（每个公司内部调用3个API，已有0.3秒间隔）
    # - 总共84个公司，预计耗时约 84 * 1.5s = 2分钟
    collector.run(batch_size=10, delay_between_requests=1.5, tickers_to_process=tickers_to_process)


if __name__ == "__main__":
    main()
