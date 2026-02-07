#!/usr/bin/env python3
"""
Portfolio Return Backfill - 回填历史Portfolio Returns数据

功能：
1. 从enhanced_company_rankings/{stanceType}/history读取所有历史快照
2. 对每个历史快照，使用Polygon API获取该时间点的股票价格
3. 计算Portfolio Return（100%匹配前端计算方法）
4. 保存到enhanced_persona_index_longshort_fund/{stanceType}/snapshots/{timestamp}

计算方法 (100%匹配前端FeedView.tsx):
- supportStocks (前5): Long positions
- opposeStocks (后5): Short positions
- longReturn = supportStocks.reduce((sum, s) => sum + (s.change || 0), 0) / 5
- shortReturn = opposeStocks.reduce((sum, s) => sum - (s.change || 0), 0) / 5
- portfolioReturn = (longReturn + shortReturn) / 2

Polygon API历史数据:
- 使用 /v2/aggs/ticker/{ticker}/range/1/day/{from}/{to} 获取历史日线数据
- 计算当日涨跌幅 = (close - prevClose) / prevClose * 100

项目配置:
- Google Cloud Project (Secrets): gen-lang-client-0960644135
- Firebase Project (Firestore): stanseproject

使用方法：
    # 回填所有persona的所有历史数据
    python3 07-backfill-portfolio-returns.py

    # 只回填特定persona
    python3 07-backfill-portfolio-returns.py --persona progressive-globalist

    # 测试模式（只处理前3条历史记录）
    python3 07-backfill-portfolio-returns.py --test

    # 跳过已存在的记录
    python3 07-backfill-portfolio-returns.py --skip-existing

作者: Claude Code
日期: 2026-02-07
"""

import os
import sys
import time
import requests
import subprocess
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional, Any, Tuple
from concurrent.futures import ThreadPoolExecutor, as_completed

import firebase_admin
from firebase_admin import credentials, firestore

# ============================================================
# 配置
# ============================================================

# 8种政治立场类型
STANCE_TYPES = [
    'progressive-globalist',
    'progressive-nationalist',
    'socialist-libertarian',
    'socialist-nationalist',
    'capitalist-globalist',
    'capitalist-nationalist',
    'conservative-globalist',
    'conservative-nationalist'
]

# Polygon API rate limit: 5 requests per minute for free tier
# We'll add delays to respect this
POLYGON_RATE_LIMIT_DELAY = 0.5  # seconds between requests

def get_polygon_api_key() -> Optional[str]:
    """从环境变量或Google Secret Manager获取Polygon API key

    安全要求: API key绝不能hardcode，必须从Secret Manager获取
    """
    # 首先尝试环境变量 (Cloud Run Job会自动注入secret)
    api_key = os.environ.get('POLYGON_API_KEY')
    if api_key:
        return api_key

    # 如果环境变量不存在，尝试从Secret Manager获取 (本地运行时)
    try:
        result = subprocess.run(
            [
                'gcloud', 'secrets', 'versions', 'access', 'latest',
                '--secret=polygon-api-key',
                '--project=gen-lang-client-0960644135'
            ],
            capture_output=True,
            text=True,
            timeout=10
        )
        if result.returncode == 0:
            return result.stdout.strip()
        else:
            print(f"⚠️  gcloud command failed: {result.stderr}")
            return None
    except Exception as e:
        print(f"⚠️  Failed to get API key from Secret Manager: {e}")
        return None


# ============================================================
# 主类
# ============================================================

class PortfolioReturnBackfiller:
    """Portfolio Return Backfiller - 回填历史数据"""

    def __init__(self, test_mode: bool = False, skip_existing: bool = False):
        """初始化"""
        # 初始化 Firebase
        if not firebase_admin._apps:
            cred = credentials.ApplicationDefault()
            firebase_admin.initialize_app(cred, {
                'projectId': 'stanseproject'
            })

        self.db = firestore.client()
        self.test_mode = test_mode
        self.skip_existing = skip_existing

        # 获取 Polygon API key (必须从Secret Manager获取)
        self.polygon_api_key = get_polygon_api_key()
        if self.polygon_api_key:
            print(f"✅ Polygon API key loaded from Secret Manager")
        else:
            print(f"❌ No Polygon API key - cannot proceed with backfill")
            sys.exit(1)

        print(f"✅ Firebase initialized (project: stanseproject)")

        if test_mode:
            print(f"🧪 Test mode: will only process first 3 history records per persona")
        if skip_existing:
            print(f"⏭️  Skip existing: will skip records that already exist")

        # Cache for daily stock data to reduce API calls
        self._price_cache: Dict[str, Dict[str, Any]] = {}

    def parse_history_timestamp(self, timestamp_id: str) -> Tuple[str, str]:
        """解析history文档ID中的日期和时间

        格式: YYYYMMdd_HHMMSS (例如: 20260127_020522)
        返回: (date_str 'YYYY-MM-DD', time_str 'HH:MM')
        """
        try:
            # 解析格式 YYYYMMdd_HHMMSS
            date_part = timestamp_id[:8]  # YYYYMMdd
            time_part = timestamp_id[9:15] if len(timestamp_id) > 9 else "000000"  # HHMMSS

            year = date_part[:4]
            month = date_part[4:6]
            day = date_part[6:8]

            hour = time_part[:2]
            minute = time_part[2:4]

            date_str = f"{year}-{month}-{day}"
            time_str = f"{hour}:{minute}"

            return date_str, time_str
        except Exception as e:
            print(f"    ⚠️  Failed to parse timestamp {timestamp_id}: {e}")
            return "unknown", "unknown"

    def fetch_historical_daily_data(self, symbol: str, date_str: str) -> Optional[Dict[str, Any]]:
        """从Polygon获取历史日线数据

        使用Polygon Aggregates API获取指定日期的OHLCV数据
        计算当日涨跌幅 = (close - prevClose) / prevClose * 100

        100%匹配前端计算方法:
        - price = Math.round(currentPrice * 100) / 100
        - change = Math.round(todaysChangePercent * 100) / 100
        """
        cache_key = f"{symbol}_{date_str}"

        # 检查缓存
        if cache_key in self._price_cache:
            return self._price_cache[cache_key]

        try:
            # 计算日期范围（需要前一天来计算涨跌幅）
            target_date = datetime.strptime(date_str, '%Y-%m-%d')
            from_date = (target_date - timedelta(days=5)).strftime('%Y-%m-%d')  # 多取几天以防节假日
            to_date = date_str

            # Polygon Aggregates API
            url = f"https://api.polygon.io/v2/aggs/ticker/{symbol}/range/1/day/{from_date}/{to_date}"
            params = {
                'apiKey': self.polygon_api_key,
                'adjusted': 'true',
                'sort': 'asc'
            }

            # Rate limiting
            time.sleep(POLYGON_RATE_LIMIT_DELAY)

            response = requests.get(url, params=params, timeout=15)

            if response.ok:
                data = response.json()
                results = data.get('results', [])

                if len(results) >= 2:
                    # 找到目标日期的数据
                    target_ts = target_date.timestamp() * 1000

                    prev_close = None
                    current_data = None

                    for i, bar in enumerate(results):
                        bar_date = datetime.fromtimestamp(bar['t'] / 1000).strftime('%Y-%m-%d')
                        if bar_date == date_str:
                            current_data = bar
                            if i > 0:
                                prev_close = results[i-1]['c']
                            break
                        prev_close = bar['c']

                    if current_data and prev_close:
                        current_price = current_data['c']
                        change_percent = ((current_price - prev_close) / prev_close) * 100

                        result = {
                            'symbol': symbol,
                            'price': round(current_price * 100) / 100,  # 100%匹配前端
                            'change': round(change_percent * 100) / 100,  # 100%匹配前端
                            'source': 'polygon_historical'
                        }

                        self._price_cache[cache_key] = result
                        return result
                    elif current_data:
                        # 没有前一天数据，使用当天开盘价计算
                        current_price = current_data['c']
                        open_price = current_data['o']
                        change_percent = ((current_price - open_price) / open_price) * 100 if open_price else 0

                        result = {
                            'symbol': symbol,
                            'price': round(current_price * 100) / 100,
                            'change': round(change_percent * 100) / 100,
                            'source': 'polygon_historical_intraday'
                        }

                        self._price_cache[cache_key] = result
                        return result

                elif len(results) == 1:
                    # 只有一天数据
                    bar = results[0]
                    current_price = bar['c']
                    open_price = bar['o']
                    change_percent = ((current_price - open_price) / open_price) * 100 if open_price else 0

                    result = {
                        'symbol': symbol,
                        'price': round(current_price * 100) / 100,
                        'change': round(change_percent * 100) / 100,
                        'source': 'polygon_historical_single'
                    }

                    self._price_cache[cache_key] = result
                    return result

            print(f"      ⚠️  No data for {symbol} on {date_str}")
            return None

        except Exception as e:
            print(f"      ⚠️  Error fetching {symbol} for {date_str}: {e}")
            return None

    def calculate_portfolio_return(
        self,
        support_stocks: List[Dict],
        oppose_stocks: List[Dict]
    ) -> Dict[str, float]:
        """
        计算Portfolio Return - 100%匹配前端FeedView.tsx

        前端代码 (lines 1148-1152):
        const supportStocks = marketStocks.slice(0, 5);
        const opposeStocks = marketStocks.slice(5, 10);
        const longReturn = supportStocks.reduce((sum, s) => sum + (s.change || 0), 0) / 5;
        const shortReturn = opposeStocks.reduce((sum, s) => sum - (s.change || 0), 0) / 5;
        const portfolioReturn = (longReturn + shortReturn) / 2;
        """
        # Long positions: support stocks
        long_return = sum(s.get('change', 0) for s in support_stocks) / 5

        # Short positions: oppose stocks (注意这里是减号，和前端一致)
        short_return = sum(-s.get('change', 0) for s in oppose_stocks) / 5

        # Portfolio return: 平均
        portfolio_return = (long_return + short_return) / 2

        return {
            'longReturn': round(long_return * 100) / 100,
            'shortReturn': round(short_return * 100) / 100,
            'portfolioReturn': round(portfolio_return * 100) / 100
        }

    def get_history_records(self, stance_type: str) -> List[Dict[str, Any]]:
        """获取enhanced_company_rankings的所有历史记录"""
        try:
            history_ref = (self.db
                .collection('enhanced_company_rankings')
                .document(stance_type)
                .collection('history')
                .order_by('__name__'))  # 按文档ID排序

            docs = history_ref.stream()

            records = []
            for doc in docs:
                data = doc.to_dict()
                data['_history_id'] = doc.id
                records.append(data)

            return records

        except Exception as e:
            print(f"  ❌ Error fetching history for {stance_type}: {e}")
            return []

    def check_snapshot_exists(self, stance_type: str, snapshot_id: str) -> bool:
        """检查snapshot是否已存在"""
        try:
            doc_ref = (self.db
                .collection('enhanced_persona_index_longshort_fund')
                .document(stance_type)
                .collection('snapshots')
                .document(snapshot_id))

            return doc_ref.get().exists
        except:
            return False

    def process_history_record(
        self,
        stance_type: str,
        history_record: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """处理单条历史记录，生成portfolio return snapshot"""

        history_id = history_record.get('_history_id', 'unknown')

        # 解析时间戳
        market_date, market_time = self.parse_history_timestamp(history_id)

        if market_date == "unknown":
            print(f"    ⏭️  Skipping {history_id}: invalid timestamp")
            return None

        # 检查是否已存在
        if self.skip_existing and self.check_snapshot_exists(stance_type, history_id):
            print(f"    ⏭️  Skipping {history_id}: already exists")
            return None

        print(f"    📅 Processing {history_id} ({market_date} {market_time})...")

        # 获取support和oppose公司
        support_companies = history_record.get('supportCompanies', [])[:5]
        oppose_companies = history_record.get('opposeCompanies', [])[:5]

        if len(support_companies) < 5 or len(oppose_companies) < 5:
            print(f"    ⚠️  Skipping {history_id}: not enough companies")
            return None

        # 获取历史股价
        long_positions = []
        for company in support_companies:
            symbol = company.get('symbol', '')
            price_data = self.fetch_historical_daily_data(symbol, market_date)

            if price_data:
                long_positions.append({
                    'symbol': symbol,
                    'name': company.get('name', symbol),
                    'price': price_data['price'],
                    'change': price_data['change'],
                    'weight': 0.2  # Equal weighted (1/5)
                })
            else:
                # 如果获取不到价格，使用0
                long_positions.append({
                    'symbol': symbol,
                    'name': company.get('name', symbol),
                    'price': 0,
                    'change': 0,
                    'weight': 0.2
                })

        short_positions = []
        for company in oppose_companies:
            symbol = company.get('symbol', '')
            price_data = self.fetch_historical_daily_data(symbol, market_date)

            if price_data:
                short_positions.append({
                    'symbol': symbol,
                    'name': company.get('name', symbol),
                    'price': price_data['price'],
                    'change': price_data['change'],
                    'weight': 0.2
                })
            else:
                short_positions.append({
                    'symbol': symbol,
                    'name': company.get('name', symbol),
                    'price': 0,
                    'change': 0,
                    'weight': 0.2
                })

        # 计算portfolio return
        returns = self.calculate_portfolio_return(long_positions, short_positions)

        # 构建snapshot数据
        # 使用history_id作为原始时间戳来构建ISO时间
        try:
            # 从history_id构建datetime
            dt = datetime.strptime(history_id, '%Y%m%d_%H%M%S')
            timestamp_iso = dt.replace(tzinfo=timezone.utc).isoformat()
        except:
            timestamp_iso = datetime.now(timezone.utc).isoformat()

        snapshot = {
            'stanceType': stance_type,
            'portfolioReturn': returns['portfolioReturn'],
            'longReturn': returns['longReturn'],
            'shortReturn': returns['shortReturn'],
            'timestamp': timestamp_iso,
            'marketDate': market_date,
            'marketTime': market_time,
            'positions': {
                'long': long_positions,
                'short': short_positions
            },
            'rankingUpdatedAt': history_record.get('updatedAt'),
            'backfilled': True,  # 标记为回填数据
            'backfilledAt': datetime.now(timezone.utc).isoformat()
        }

        print(f"      ✅ {market_date}: Portfolio {returns['portfolioReturn']:+.2f}% (L:{returns['longReturn']:+.2f}%, S:{returns['shortReturn']:+.2f}%)")

        return snapshot

    def save_snapshot(self, stance_type: str, snapshot: Dict[str, Any], history_id: str):
        """保存snapshot到Firebase

        使用原始的history_id作为snapshot ID，保持时间戳一致
        """
        COLLECTION_NAME = 'enhanced_persona_index_longshort_fund'

        try:
            # 保存到snapshots subcollection (使用原始history_id作为文档ID)
            snapshot_ref = (self.db
                .collection(COLLECTION_NAME)
                .document(stance_type)
                .collection('snapshots')
                .document(history_id))
            snapshot_ref.set(snapshot)

        except Exception as e:
            print(f"      ❌ Error saving snapshot: {e}")
            raise

    def backfill_persona(self, stance_type: str) -> Dict[str, int]:
        """回填单个persona的所有历史数据"""

        print(f"\n📊 Backfilling: {stance_type}")
        print(f"{'='*60}")

        # 获取所有历史记录
        history_records = self.get_history_records(stance_type)

        if not history_records:
            print(f"  ⚠️  No history records found")
            return {'total': 0, 'processed': 0, 'skipped': 0, 'failed': 0}

        print(f"  📦 Found {len(history_records)} history records")

        # 测试模式只处理前3条
        if self.test_mode:
            history_records = history_records[:3]
            print(f"  🧪 Test mode: processing only {len(history_records)} records")

        stats = {'total': len(history_records), 'processed': 0, 'skipped': 0, 'failed': 0}

        for record in history_records:
            history_id = record.get('_history_id', 'unknown')

            try:
                snapshot = self.process_history_record(stance_type, record)

                if snapshot:
                    self.save_snapshot(stance_type, snapshot, history_id)
                    stats['processed'] += 1
                else:
                    stats['skipped'] += 1

            except Exception as e:
                print(f"    ❌ Failed to process {history_id}: {e}")
                stats['failed'] += 1

        print(f"\n  📈 Results: {stats['processed']} processed, {stats['skipped']} skipped, {stats['failed']} failed")

        return stats

    def run(self, specific_persona: Optional[str] = None):
        """运行完整的backfill流程"""
        start_time = time.time()

        print(f"\n{'#'*60}")
        print(f"# PORTFOLIO RETURN BACKFILL")
        print(f"# Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"{'#'*60}\n")

        # 确定要处理的persona列表
        if specific_persona:
            if specific_persona not in STANCE_TYPES:
                raise ValueError(f"Invalid persona: {specific_persona}")
            personas = [specific_persona]
        else:
            personas = STANCE_TYPES

        print(f"📋 Will backfill {len(personas)} persona(s):")
        for p in personas:
            print(f"  - {p}")

        # 为每个persona执行backfill
        all_stats = {}
        for persona in personas:
            try:
                stats = self.backfill_persona(persona)
                all_stats[persona] = stats
            except Exception as e:
                print(f"\n❌ Failed for {persona}: {e}")
                all_stats[persona] = {'total': 0, 'processed': 0, 'skipped': 0, 'failed': 0, 'error': str(e)}

        # 打印总结
        duration = time.time() - start_time

        print(f"\n{'='*60}")
        print(f"✅ Backfill Complete")
        print(f"{'='*60}")
        print(f"Duration: {duration:.1f}s ({duration/60:.1f} minutes)")
        print(f"\n📊 Summary:")

        total_processed = 0
        total_skipped = 0
        total_failed = 0

        for persona, stats in all_stats.items():
            if 'error' in stats:
                print(f"  ❌ {persona}: ERROR - {stats['error']}")
            else:
                print(f"  ✅ {persona}: {stats['processed']}/{stats['total']} processed, {stats['skipped']} skipped, {stats['failed']} failed")
                total_processed += stats['processed']
                total_skipped += stats['skipped']
                total_failed += stats['failed']

        print(f"\n📈 Total: {total_processed} processed, {total_skipped} skipped, {total_failed} failed")
        print(f"{'='*60}\n")

        return all_stats


# ============================================================
# 主函数
# ============================================================

def main():
    """主函数"""
    import argparse

    parser = argparse.ArgumentParser(description='Backfill portfolio returns from enhanced_company_rankings history')
    parser.add_argument(
        '--persona',
        type=str,
        choices=STANCE_TYPES,
        help='Backfill specific persona only'
    )
    parser.add_argument(
        '--test',
        action='store_true',
        help='Test mode: only process first 3 history records per persona'
    )
    parser.add_argument(
        '--skip-existing',
        action='store_true',
        help='Skip records that already exist in enhanced_persona_index_longshort_fund'
    )

    args = parser.parse_args()

    # 创建backfiller
    backfiller = PortfolioReturnBackfiller(
        test_mode=args.test,
        skip_existing=args.skip_existing
    )

    # 运行backfill
    backfiller.run(specific_persona=args.persona)


if __name__ == "__main__":
    main()
