#!/usr/bin/env python3
"""
Polygon News Data Collection for Company Rankings

使用 Polygon.io API 获取 SP500 公司最新新闻数据
输出: Firebase `company_news_by_ticker/{ticker}`

运行方式:
    export POLYGON_API_KEY=your_api_key  # 或从 Google Secret Manager 获取
    python3 03-collect-polygon-news.py

Polygon API 文档:
    - News API: https://polygon.io/docs/stocks/get_v2_reference_news

数据结构:
    - 读取: Polygon API - News endpoint
    - 写入: company_news_by_ticker/{ticker}
    - 保存最近20篇新闻 + metadata
"""

import os
import sys
import json
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
import firebase_admin
from firebase_admin import credentials, firestore
import requests
import time

# 添加项目根目录到 path
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

# 导入邮件通知模块
sys.path.insert(0, SCRIPT_DIR)
from email_notifier import log_completion_notification, send_success_email

# Import from unified data module
from pathlib import Path
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from data.sp500Companies import SP500_TICKERS

class PolygonNewsCollector:
    """Polygon.io 新闻数据采集器"""

    def __init__(self, credentials_path: Optional[str] = None):
        """初始化 Firebase 连接和 Polygon API"""
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

        # Polygon API configuration
        self.polygon_api_key = os.getenv('POLYGON_API_KEY')

        if not self.polygon_api_key:
            print("❌ ERROR: POLYGON_API_KEY not found in environment")
            print("   Please set POLYGON_API_KEY environment variable")
            print("   For local testing: export POLYGON_API_KEY=your_key")
            print("   For production: Use Google Secret Manager")
            sys.exit(1)

        self.base_url = "https://api.polygon.io/v2/reference/news"
        print(f"✅ Polygon API key loaded")

    def fetch_news_for_ticker(self, ticker: str, limit: int = 20) -> Optional[Dict[str, Any]]:
        """
        从 Polygon API 获取特定公司的新闻
        Endpoint: /v2/reference/news?ticker=AAPL

        返回格式:
        {
            "results": [
                {
                    "title": "Article title",
                    "author": "Author name",
                    "published_utc": "2024-12-26T10:00:00Z",
                    "article_url": "https://...",
                    "tickers": ["AAPL"],
                    "publisher": {"name": "Publisher", "homepage_url": "..."},
                    "description": "Article description..."
                }
            ],
            "status": "OK",
            "count": 20
        }
        """
        params = {
            'ticker': ticker,
            'order': 'desc',
            'limit': limit,
            'sort': 'published_utc',
            'apiKey': self.polygon_api_key
        }

        try:
            response = requests.get(self.base_url, params=params, timeout=15)
            response.raise_for_status()

            data = response.json()

            if data.get('status') != 'OK':
                print(f"  ⚠️  API returned non-OK status: {data.get('status')}")
                return None

            results = data.get('results', [])

            if not results:
                print(f"  ⚠️  No news found")
                return None

            # 解析新闻数据
            articles = []
            for item in results:
                articles.append({
                    'title': item.get('title', ''),
                    'author': item.get('author', 'Unknown'),
                    'published_utc': item.get('published_utc', ''),
                    'article_url': item.get('article_url', ''),
                    'publisher_name': item.get('publisher', {}).get('name', 'Unknown'),
                    'publisher_url': item.get('publisher', {}).get('homepage_url', ''),
                    'description': item.get('description', '')[:300],  # 限制300字符
                    'tickers': item.get('tickers', [])
                })

            print(f"  ✅ Found {len(articles)} articles")

            return {
                'ticker': ticker,
                'data_source': 'polygon_api',
                'collected_at': datetime.now().isoformat(),
                'articles': articles,
                'count': len(articles)
            }

        except requests.exceptions.Timeout:
            print(f"  ❌ Timeout error")
            return None
        except requests.exceptions.RequestException as e:
            print(f"  ❌ Request error: {str(e)}")
            return None
        except Exception as e:
            print(f"  ❌ Unexpected error: {str(e)}")
            return None

    def save_to_firebase(self, ticker: str, data: Dict[str, Any]):
        """
        保存到 company_news_by_ticker collection，并保存历史版本

        版本控制策略（统一方案）：
        1. 构建完整的新数据（包含所有字段）
        2. 先将新数据保存到 history/{当前时间戳} 作为快照
        3. 然后用新数据更新主文档（merge=True 保留其他字段）

        结果：
        - history 里的最新版本 = 主文档当前内容（有重叠是正常的）
        - 主文档永远是最新数据
        - 所有字段（ticker, data_source, collected_at, articles, count）都完整保留

        数据结构:
        - 主文档: company_news_by_ticker/{ticker}
          - ticker: "AAPL"
          - data_source: "polygon_api"
          - collected_at: "2025-12-27T..."
          - articles: [{...}, {...}]  (最新20篇新闻)
          - count: 20

        - 历史版本: company_news_by_ticker/{ticker}/history/{YYYYmmdd_HHMMSS}
          - (该时刻的所有字段，与主文档相同结构)
        """
        # 1. 生成时间戳
        now = datetime.now()
        timestamp_str = now.strftime('%Y%m%d_%H%M%S')

        # 2. 新数据已经包含完整结构（data 参数来自 fetch_news_for_ticker）
        # data 包含: ticker, data_source, collected_at, articles, count
        doc_ref = self.db.collection('company_news_by_ticker').document(ticker)

        # 3. 先保存新数据到 history（作为当前时刻的快照）
        history_ref = doc_ref.collection('history').document(timestamp_str)
        history_ref.set(data)  # 保留所有字段
        print(f"  📦 Saved to history: {timestamp_str}")

        # 4. 然后更新主文档（merge=True 保留其他脚本可能添加的字段）
        doc_ref.set(data, merge=True)

        print(f"  ✅ Saved to Firebase: company_news_by_ticker/{ticker}")

    def run(self, batch_size: int = 10, delay_between_requests: float = 12.0):
        """
        运行完整的数据采集流程

        参数:
            batch_size: 每批处理的公司数量
            delay_between_requests: 请求之间的延迟（秒）
                                   Polygon free tier: 5 calls/min = 12s间隔
                                   Polygon paid tier 可以缩短
        """
        start_time = time.time()

        print(f"\n{'='*60}")
        print(f"🔄 Polygon News Data Collection")
        print(f"{'='*60}")
        print(f"📦 Total companies to process: {len(SP500_TICKERS)}")
        print(f"⚙️  Batch size: {batch_size}, Delay: {delay_between_requests}s")
        print(f"🕒 Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

        success_count = 0
        no_data_count = 0
        error_count = 0
        failed_tickers = []

        for i, ticker in enumerate(SP500_TICKERS, 1):
            try:
                print(f"\n[{i}/{len(SP500_TICKERS)}] {ticker}", end='')

                news_data = self.fetch_news_for_ticker(ticker, limit=20)

                if news_data:
                    self.save_to_firebase(ticker, news_data)
                    success_count += 1
                else:
                    no_data_count += 1

                # 请求间延迟（避免API限流）
                if i < len(SP500_TICKERS):
                    time.sleep(delay_between_requests)

                # 批次间额外延迟
                if i % batch_size == 0 and i < len(SP500_TICKERS):
                    print(f"\n  ⏸️  Batch complete ({i}/{len(SP500_TICKERS)}), pausing...")
                    time.sleep(5.0)

            except Exception as e:
                print(f"\n  ❌ Unexpected error: {str(e)}")
                import traceback
                traceback.print_exc()
                error_count += 1
                failed_tickers.append(ticker)
                time.sleep(5)

        execution_time = time.time() - start_time

        # 打印汇总
        print(f"\n{'='*60}")
        print(f"✅ Polygon News Collection Complete")
        print(f"{'='*60}")
        print(f"✅ Success: {success_count}/{len(SP500_TICKERS)}")
        print(f"⚠️  No Data: {no_data_count}/{len(SP500_TICKERS)}")
        print(f"❌ Errors: {error_count}/{len(SP500_TICKERS)}")
        print(f"🕒 Finished at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"{'='*60}\n")

        # 发送完成通知（日志方式）
        log_completion_notification(
            job_name="Polygon News Collector",
            total_companies=len(SP500_TICKERS),
            successful_companies=success_count,
            failed_companies=failed_tickers,
            execution_time_seconds=execution_time
        )

        # 发送邮件通知
        send_success_email(
            job_name="Polygon News Collector",
            total_companies=len(SP500_TICKERS),
            successful_companies=success_count,
            failed_companies=failed_tickers,
            execution_time_seconds=execution_time
        )


def main():
    credentials_path = os.getenv('FIREBASE_CREDENTIALS_PATH')

    if len(sys.argv) > 1:
        credentials_path = sys.argv[1]

    # 创建采集器
    collector = PolygonNewsCollector(credentials_path)

    # 运行采集
    # - 每批10个公司处理后暂停
    # - Polygon free tier 限制: 5 calls/min，所以12秒间隔
    # - 如果是 paid tier，可以缩短到 1-2 秒
    # - 总共125个公司，预计耗时约 125 * 12s = 25分钟 (free tier)
    collector.run(batch_size=10, delay_between_requests=12.0)


if __name__ == "__main__":
    main()
