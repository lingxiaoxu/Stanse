#!/usr/bin/env python3
"""
Portfolio Return Tracker - 记录每个Persona的Long/Short Portfolio每日收益

功能：
1. 每个weekday 10am-4pm EST 每小时运行一次
2. 从enhanced_company_rankings读取每个persona的最新top5 support/oppose
3. 调用Polygon API获取当前股价和当日涨跌幅 (通过Google Secret Manager安全获取API key)
4. 计算Portfolio Return = (Long平均涨幅 + Short平均跌幅) / 2
5. 保存快照到Firestore (stanseproject): enhanced_persona_index_longshort_fund/{stanceType}/snapshots/{timestamp}

计算方法 (100%匹配前端FeedView.tsx):
- supportStocks (前5): Long positions
- opposeStocks (后5): Short positions
- longReturn = supportStocks.reduce((sum, s) => sum + (s.change || 0), 0) / 5
- shortReturn = opposeStocks.reduce((sum, s) => sum - (s.change || 0), 0) / 5
- portfolioReturn = (longReturn + shortReturn) / 2

数据结构:
enhanced_persona_index_longshort_fund/{stanceType}/
  ├── (主文档 - 最新快照)
  │   ├── portfolioReturn: number (总收益率%)
  │   ├── longReturn: number (Long组合收益率%)
  │   ├── shortReturn: number (Short组合收益率%)
  │   ├── timestamp: string (ISO格式UTC时间)
  │   ├── marketDate: string (YYYY-MM-DD)
  │   ├── marketTime: string (HH:MM EST)
  │   └── positions: {
  │       long: [{ symbol, name, price, change, weight }],
  │       short: [{ symbol, name, price, change, weight }]
  │   }
  │
  └── snapshots/{YYYYMMdd_HHMMSS}/ (历史快照subcollection)
      ├── portfolioReturn: number
      ├── longReturn: number
      ├── shortReturn: number
      ├── timestamp: string
      ├── marketDate: string
      ├── marketTime: string
      └── positions: {
          long: [{ symbol, name, price, change, weight }],
          short: [{ symbol, name, price, change, weight }]
      }

项目配置:
- Google Cloud Project (Secrets/Cloud Run): gen-lang-client-0960644135
- Firebase Project (Firestore): stanseproject

使用方法：
    # 运行一次（记录所有8个persona的当前快照）
    python3 06-track-portfolio-returns.py

    # 测试模式（只处理1个persona）
    python3 06-track-portfolio-returns.py --test

    # 指定特定persona
    python3 06-track-portfolio-returns.py --persona capitalist-globalist

作者: Claude Code
日期: 2026-02-06
"""

import os
import sys
import time
import json
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

# EST timezone offset (UTC-5, or UTC-4 during DST)
EST_OFFSET = timedelta(hours=-5)

def get_polygon_api_key() -> Optional[str]:
    """从环境变量或Google Secret Manager获取Polygon API key"""
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

class PortfolioReturnTracker:
    """Portfolio Return Tracker - 记录每个Persona的收益快照"""

    def __init__(self, test_mode: bool = False):
        """初始化"""
        # 初始化 Firebase
        if not firebase_admin._apps:
            cred = credentials.ApplicationDefault()
            firebase_admin.initialize_app(cred, {
                'projectId': 'stanseproject'
            })

        self.db = firestore.client()
        self.test_mode = test_mode

        # 获取 Polygon API key
        self.polygon_api_key = get_polygon_api_key()
        if self.polygon_api_key:
            print(f"✅ Polygon API key loaded")
        else:
            print(f"⚠️  No Polygon API key - will use mock prices")

        print(f"✅ Firebase initialized (project: stanseproject)")

        if test_mode:
            print(f"🧪 Test mode: will only process 1 persona")

    def get_current_est_time(self) -> Tuple[str, str, datetime]:
        """获取当前EST时间

        Returns:
            Tuple of (date_str YYYY-MM-DD, time_str HH:MM, datetime object)
        """
        utc_now = datetime.now(timezone.utc)
        est_now = utc_now + EST_OFFSET

        date_str = est_now.strftime('%Y-%m-%d')
        time_str = est_now.strftime('%H:%M')

        return date_str, time_str, est_now

    def fetch_ranking_for_persona(self, stance_type: str) -> Optional[Dict[str, Any]]:
        """从enhanced_company_rankings获取persona的最新排名"""
        try:
            doc_ref = self.db.collection('enhanced_company_rankings').document(stance_type)
            doc = doc_ref.get()

            if doc.exists:
                data = doc.to_dict()
                return {
                    'supportCompanies': data.get('supportCompanies', []),
                    'opposeCompanies': data.get('opposeCompanies', []),
                    'updatedAt': data.get('updatedAt'),
                    'stanceType': data.get('stanceType')
                }
            else:
                print(f"  ⚠️  No ranking found for {stance_type}")
                return None

        except Exception as e:
            print(f"  ❌ Error fetching ranking for {stance_type}: {e}")
            return None

    def fetch_stock_price(self, symbol: str) -> Dict[str, Any]:
        """
        从Polygon API获取股票当前价格和当日涨跌幅

        100%匹配前端FeedView.tsx的逻辑:
        - 使用Polygon.io Snapshot API
        - currentPrice = ticker.day?.c || ticker.lastTrade?.p || ticker.prevDay?.c || 100
        - todaysChangePercent = ticker.todaysChangePerc || 0
        - price = Math.round(currentPrice * 100) / 100
        - change = Math.round(todaysChangePercent * 100) / 100
        """
        # Mock price fallback (100%匹配前端)
        def get_mock_price():
            hash_code = sum(ord(c) << (5 * i) for i, c in enumerate(symbol))
            hash_code = hash_code & 0xFFFFFFFF  # Keep it as 32-bit
            if hash_code > 0x7FFFFFFF:
                hash_code -= 0x100000000

            base_price = 50 + abs(hash_code % 300)
            change = ((hash_code % 100) - 50) / 10

            return {
                'symbol': symbol,
                'price': round(base_price * 100) / 100,
                'change': round(change * 100) / 100,
                'source': 'mock'
            }

        if not self.polygon_api_key:
            return get_mock_price()

        try:
            # Polygon.io Snapshot API - 和前端完全一致
            url = f"https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/{symbol}"
            params = {'apiKey': self.polygon_api_key}

            response = requests.get(url, params=params, timeout=10)

            if response.ok:
                data = response.json()
                ticker = data.get('ticker', {})

                if ticker:
                    # 100%匹配前端计算逻辑
                    day = ticker.get('day', {})
                    last_trade = ticker.get('lastTrade', {})
                    prev_day = ticker.get('prevDay', {})

                    current_price = day.get('c') or last_trade.get('p') or prev_day.get('c') or 100
                    todays_change_perc = ticker.get('todaysChangePerc', 0)

                    return {
                        'symbol': symbol,
                        'price': round(current_price * 100) / 100,
                        'change': round(todays_change_perc * 100) / 100,
                        'source': 'polygon'
                    }
                else:
                    return get_mock_price()
            else:
                print(f"    ⚠️  Polygon API error for {symbol}: {response.status_code}")
                return get_mock_price()

        except Exception as e:
            print(f"    ⚠️  Failed to fetch price for {symbol}: {e}")
            return get_mock_price()

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

    def track_persona_return(self, stance_type: str) -> Optional[Dict[str, Any]]:
        """跟踪单个persona的portfolio return"""
        print(f"\n📊 Tracking: {stance_type}")

        # 1. 获取当前ranking
        ranking = self.fetch_ranking_for_persona(stance_type)
        if not ranking:
            return None

        support_companies = ranking.get('supportCompanies', [])[:5]
        oppose_companies = ranking.get('opposeCompanies', [])[:5]

        if len(support_companies) < 5 or len(oppose_companies) < 5:
            print(f"  ⚠️  Not enough companies (support: {len(support_companies)}, oppose: {len(oppose_companies)})")
            return None

        # 2. 获取所有股票价格 (并行)
        all_symbols = [c['symbol'] for c in support_companies + oppose_companies]
        stock_prices = {}

        print(f"  📈 Fetching prices for {len(all_symbols)} stocks...")
        with ThreadPoolExecutor(max_workers=10) as executor:
            future_to_symbol = {
                executor.submit(self.fetch_stock_price, symbol): symbol
                for symbol in all_symbols
            }

            for future in as_completed(future_to_symbol):
                symbol = future_to_symbol[future]
                try:
                    result = future.result()
                    stock_prices[symbol] = result
                except Exception as e:
                    print(f"    ❌ Error for {symbol}: {e}")
                    stock_prices[symbol] = {'symbol': symbol, 'price': 100, 'change': 0, 'source': 'error'}

        # 3. 构建positions数据
        long_positions = []
        for company in support_companies:
            symbol = company['symbol']
            price_data = stock_prices.get(symbol, {'price': 100, 'change': 0})
            long_positions.append({
                'symbol': symbol,
                'name': company.get('name', symbol),
                'price': price_data['price'],
                'change': price_data['change'],
                'weight': 0.2  # Equal weighted (1/5)
            })

        short_positions = []
        for company in oppose_companies:
            symbol = company['symbol']
            price_data = stock_prices.get(symbol, {'price': 100, 'change': 0})
            short_positions.append({
                'symbol': symbol,
                'name': company.get('name', symbol),
                'price': price_data['price'],
                'change': price_data['change'],
                'weight': 0.2  # Equal weighted (1/5)
            })

        # 4. 计算portfolio return
        returns = self.calculate_portfolio_return(long_positions, short_positions)

        # 5. 获取时间戳
        market_date, market_time, est_now = self.get_current_est_time()
        timestamp_str = est_now.strftime('%Y%m%d_%H%M%S')

        # 6. 构建快照数据
        snapshot = {
            'stanceType': stance_type,
            'portfolioReturn': returns['portfolioReturn'],
            'longReturn': returns['longReturn'],
            'shortReturn': returns['shortReturn'],
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'marketDate': market_date,
            'marketTime': market_time,
            'positions': {
                'long': long_positions,
                'short': short_positions
            },
            'rankingUpdatedAt': ranking.get('updatedAt')
        }

        print(f"  ✅ Portfolio Return: {returns['portfolioReturn']:+.2f}% (Long: {returns['longReturn']:+.2f}%, Short: {returns['shortReturn']:+.2f}%)")

        return snapshot

    def save_snapshot(self, snapshot: Dict[str, Any]):
        """保存快照到Firestore (stanseproject)

        Collection: enhanced_persona_index_longshort_fund
        """
        stance_type = snapshot['stanceType']

        # 生成时间戳ID
        timestamp_str = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')

        # Collection名称
        COLLECTION_NAME = 'enhanced_persona_index_longshort_fund'

        try:
            # 1. 保存到snapshots subcollection (历史记录)
            snapshot_ref = (self.db
                .collection(COLLECTION_NAME)
                .document(stance_type)
                .collection('snapshots')
                .document(timestamp_str))
            snapshot_ref.set(snapshot)
            print(f"  📦 Saved snapshot: {COLLECTION_NAME}/{stance_type}/snapshots/{timestamp_str}")

            # 2. 更新主文档 (最新状态)
            current_ref = (self.db
                .collection(COLLECTION_NAME)
                .document(stance_type))
            current_ref.set(snapshot, merge=True)
            print(f"  ✅ Updated current: {COLLECTION_NAME}/{stance_type}")

        except Exception as e:
            print(f"  ❌ Error saving snapshot: {e}")
            raise

    def run(self, specific_persona: Optional[str] = None):
        """运行完整的tracking流程"""
        start_time = time.time()

        market_date, market_time, est_now = self.get_current_est_time()

        print(f"\n{'#'*60}")
        print(f"# PORTFOLIO RETURN TRACKER")
        print(f"# Market Date: {market_date}")
        print(f"# Market Time: {market_time} EST")
        print(f"# UTC Time: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"{'#'*60}\n")

        # 确定要处理的persona列表
        if specific_persona:
            if specific_persona not in STANCE_TYPES:
                raise ValueError(f"Invalid persona: {specific_persona}")
            personas = [specific_persona]
        elif self.test_mode:
            personas = [STANCE_TYPES[0]]  # 只处理第一个
        else:
            personas = STANCE_TYPES

        print(f"📋 Will track {len(personas)} persona(s):")
        for p in personas:
            print(f"  - {p}")

        # 为每个persona tracking
        results = {}
        for persona in personas:
            try:
                snapshot = self.track_persona_return(persona)
                if snapshot:
                    self.save_snapshot(snapshot)
                    results[persona] = f"SUCCESS: {snapshot['portfolioReturn']:+.2f}%"
                else:
                    results[persona] = "SKIPPED: No data"
            except Exception as e:
                print(f"\n❌ Failed for {persona}: {e}")
                results[persona] = f"FAILED: {str(e)}"

        # 打印总结
        duration = time.time() - start_time

        print(f"\n{'='*60}")
        print(f"✅ Tracking Complete")
        print(f"{'='*60}")
        print(f"Duration: {duration:.1f}s")
        print(f"Market Time: {market_date} {market_time} EST")
        print(f"\n📊 Results:")
        for persona, status in results.items():
            emoji = '✅' if 'SUCCESS' in status else ('⏭️' if 'SKIPPED' in status else '❌')
            print(f"  {emoji} {persona}: {status}")
        print(f"{'='*60}\n")

        return results


# ============================================================
# 主函数
# ============================================================

def main():
    """主函数"""
    import argparse

    parser = argparse.ArgumentParser(description='Track portfolio returns for all personas')
    parser.add_argument(
        '--persona',
        type=str,
        choices=STANCE_TYPES,
        help='Track specific persona only'
    )
    parser.add_argument(
        '--test',
        action='store_true',
        help='Test mode: only process 1 persona'
    )

    args = parser.parse_args()

    # 创建tracker
    tracker = PortfolioReturnTracker(test_mode=args.test)

    # 运行tracking
    tracker.run(specific_persona=args.persona)


if __name__ == "__main__":
    main()
