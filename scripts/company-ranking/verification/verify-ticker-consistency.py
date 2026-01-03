#!/usr/bin/env python3
"""
Verify Ticker Consistency Across Company Ranking Collections

Ensures that company_rankings_by_ticker, company_esg_by_ticker, and company_news_by_ticker
all have the same distinct list of tickers.

If tickers are missing from any collection, creates placeholder documents to ensure consistency.

Running:
    python3 verify-ticker-consistency.py
"""

import os
import sys
import firebase_admin
from firebase_admin import credentials, firestore
from typing import Set, Dict, List, Any
from datetime import datetime

# Add parent directory to path
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PARENT_DIR = os.path.dirname(SCRIPT_DIR)
sys.path.insert(0, PARENT_DIR)

# Import SP500_TICKERS from parent scripts
SP500_TICKERS = [
    # Technology
    'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'AVGO', 'ORCL', 'CRM',
    'AMD', 'INTC', 'IBM', 'CSCO', 'ADBE',

    # Financial
    'BRK.B', 'JPM', 'V', 'MA', 'BAC', 'WFC', 'GS', 'MS', 'BLK', 'C',

    # Healthcare
    'UNH', 'JNJ', 'LLY', 'PFE', 'MRK', 'ABBV', 'TMO', 'ABT', 'CVS', 'BMY',

    # Consumer
    'WMT', 'PG', 'KO', 'PEP', 'COST', 'HD', 'MCD', 'NKE', 'SBUX', 'TGT', 'LOW', 'DIS',

    # Energy
    'XOM', 'CVX', 'COP', 'SLB', 'EOG', 'OXY', 'PSX', 'VLO',

    # Industrial
    'GE', 'CAT', 'RTX', 'HON', 'UPS', 'BA', 'LMT', 'DE', 'NOC', 'GD',

    # Communications
    'NFLX', 'CMCSA', 'T', 'VZ', 'TMUS',

    # Utilities
    'NEE', 'DUK', 'SO', 'D',

    # Materials
    'LIN', 'APD', 'SHW', 'FCX', 'NEM',

    # Real Estate
    'PLD', 'AMT', 'CCI', 'EQIX', 'SPG'
]


class TickerConsistencyVerifier:
    """Verify and fix ticker consistency across collections"""

    def __init__(self, credentials_path: str = None):
        """Initialize Firebase connection"""
        # Check for required API keys if we might need to re-collect data
        self.check_api_keys()

        if not firebase_admin._apps:
            if credentials_path:
                cred = credentials.Certificate(credentials_path)
            else:
                cred = credentials.ApplicationDefault()

            firebase_admin.initialize_app(cred, {
                'projectId': 'stanseproject'
            })

        self.db = firestore.client()
        print(f"✅ Firebase initialized (project: stanseproject)\n")

    def check_api_keys(self):
        """检查必需的API密钥是否已设置"""
        warnings = []

        if not os.getenv('POLYGON_API_KEY'):
            warnings.append("POLYGON_API_KEY not set (needed for re-collecting news data)")

        if not os.getenv('FMP_API_KEY'):
            warnings.append("FMP_API_KEY not set (needed for re-collecting ESG data)")

        if warnings:
            print(f"⚠️  API Key Warnings:")
            for warning in warnings:
                print(f"  └─ {warning}")
            print(f"\nTo set API keys:")
            print(f"  export POLYGON_API_KEY=$(gcloud secrets versions access latest --secret=polygon-api-key --project=gen-lang-client-0960644135)")
            print(f"  export FMP_API_KEY=$(gcloud secrets versions access latest --secret=FMP_API_KEY --project=gen-lang-client-0960644135)\n")

    def get_tickers_in_collection(self, collection_name: str) -> Set[str]:
        """Get all ticker symbols from a collection"""
        print(f"📊 Fetching tickers from {collection_name}...")

        docs = self.db.collection(collection_name).stream()
        tickers = {doc.id for doc in docs}

        print(f"  └─ Found {len(tickers)} tickers\n")
        return tickers

    def collect_fec_for_ticker(self, ticker: str):
        """重新运行 FEC 数据采集（仅针对单个ticker）"""
        print(f"  ├─ Running FEC collection for {ticker}...")

        # Import and run FEC collector for single ticker
        sys.path.insert(0, PARENT_DIR)
        try:
            from importlib import import_module
            fec_module = import_module('01-collect-fec-donations')

            collector = fec_module.FECDonationCollector()
            fec_data = collector.collect_fec_for_company(ticker)

            if fec_data:
                collector.save_to_firebase(ticker, fec_data)
                print(f"  └─ ✅ FEC data collected for {ticker}")
                return True
            else:
                print(f"  └─ ⚠️  No FEC data found for {ticker}")
                return False
        except Exception as e:
            print(f"  └─ ❌ FEC collection failed: {str(e)}")
            return False

    def collect_esg_for_ticker(self, ticker: str):
        """重新运行 ESG 数据采集（仅针对单个ticker）"""
        print(f"  ├─ Running ESG collection for {ticker}...")

        sys.path.insert(0, PARENT_DIR)
        try:
            from importlib import import_module
            esg_module = import_module('02-collect-esg-scores')

            collector = esg_module.FMPESGCollector()

            # 获取 benchmark 数据（避免重复调用）
            benchmark_data = collector.fetch_esg_benchmark(2024)
            esg_data = collector.fetch_esg_data(ticker, benchmark_data)

            if esg_data:
                collector.save_to_firebase(ticker, esg_data)
                print(f"  └─ ✅ ESG data collected for {ticker}")
                return True
            else:
                print(f"  └─ ⚠️  No ESG data found for {ticker}")
                return False
        except Exception as e:
            print(f"  └─ ❌ ESG collection failed: {str(e)}")
            return False

    def collect_news_for_ticker(self, ticker: str):
        """重新运行 Polygon News 数据采集（仅针对单个ticker）"""
        print(f"  ├─ Running Polygon News collection for {ticker}...")

        sys.path.insert(0, PARENT_DIR)
        try:
            from importlib import import_module
            import time

            news_module = import_module('03-collect-polygon-news')

            collector = news_module.PolygonNewsCollector()
            news_data = collector.fetch_news_for_ticker(ticker, limit=20)

            if news_data:
                collector.save_to_firebase(ticker, news_data)
                print(f"  └─ ✅ News data collected for {ticker}")
                # Polygon API rate limit: 5 calls/min (free tier)
                time.sleep(12.0)
                return True
            else:
                print(f"  └─ ⚠️  No news data found for {ticker}")
                return False
        except Exception as e:
            print(f"  └─ ❌ News collection failed: {str(e)}")
            return False

    def verify_and_fix(self):
        """Verify ticker consistency across collections"""
        print(f"{'='*70}")
        print(f"🔍 Ticker Consistency Verification")
        print(f"{'='*70}\n")

        # Get tickers from each collection
        fec_tickers = self.get_tickers_in_collection('company_rankings_by_ticker')
        esg_tickers = self.get_tickers_in_collection('company_esg_by_ticker')
        news_tickers = self.get_tickers_in_collection('company_news_by_ticker')

        print(f"📋 Current Status:")
        print(f"  ├─ FEC tickers: {len(fec_tickers)}")
        print(f"  ├─ ESG tickers: {len(esg_tickers)}")
        print(f"  └─ News tickers: {len(news_tickers)}\n")

        # Find tickers that exist in some collections but not others
        # 如果一个ticker在FEC中存在，它必须在ESG和News中也存在
        # 如果一个ticker在ESG中存在，它必须在FEC和News中也存在
        # 如果一个ticker在News中存在，它必须在FEC和ESG中也存在

        # 找出每个collection中缺失的ticker（相对于其他collection的并集）
        all_tickers = fec_tickers | esg_tickers | news_tickers  # 所有出现过的ticker

        missing_in_fec = all_tickers - fec_tickers  # 在ESG或News中存在，但FEC中不存在
        missing_in_esg = all_tickers - esg_tickers  # 在FEC或News中存在，但ESG中不存在
        missing_in_news = all_tickers - news_tickers  # 在FEC或ESG中存在，但News中不存在

        print(f"🔍 Inconsistency Analysis:")
        print(f"  ├─ Tickers in (ESG or News) but NOT in FEC: {len(missing_in_fec)}")
        if missing_in_fec:
            print(f"     └─ {sorted(list(missing_in_fec))}")
        print(f"  ├─ Tickers in (FEC or News) but NOT in ESG: {len(missing_in_esg)}")
        if missing_in_esg:
            print(f"     └─ {sorted(list(missing_in_esg))}")
        print(f"  └─ Tickers in (FEC or ESG) but NOT in News: {len(missing_in_news)}")
        if missing_in_news:
            print(f"     └─ {sorted(list(missing_in_news))}\n")

        # Check if we need to re-collect data
        total_missing = len(missing_in_fec) + len(missing_in_esg) + len(missing_in_news)

        if total_missing == 0:
            print(f"✅ Perfect! All collections have the same ticker list.\n")
            print(f"{'='*70}")
            print(f"✅ Verification Complete - No Action Needed")
            print(f"{'='*70}\n")
            return

        # Re-collect missing data to ensure consistency
        print(f"\n{'='*70}")
        print(f"🔧 Re-collecting Data for Missing Tickers")
        print(f"{'='*70}\n")

        fec_success = 0
        fec_failed = 0
        esg_success = 0
        esg_failed = 0
        news_success = 0
        news_failed = 0

        if missing_in_fec:
            print(f"📝 Re-collecting FEC data for {len(missing_in_fec)} tickers...")
            for ticker in sorted(missing_in_fec):
                if self.collect_fec_for_ticker(ticker):
                    fec_success += 1
                else:
                    fec_failed += 1
            print(f"  └─ ✅ Success: {fec_success}, ⚠️  Failed/No Data: {fec_failed}\n")

        if missing_in_esg:
            print(f"📝 Re-collecting ESG data for {len(missing_in_esg)} tickers...")
            for ticker in sorted(missing_in_esg):
                if self.collect_esg_for_ticker(ticker):
                    esg_success += 1
                else:
                    esg_failed += 1
            print(f"  └─ ✅ Success: {esg_success}, ⚠️  Failed/No Data: {esg_failed}\n")

        if missing_in_news:
            print(f"📝 Re-collecting News data for {len(missing_in_news)} tickers...")
            print(f"  ⏱️  Note: Polygon API has rate limits (5 calls/min), this may take ~{len(missing_in_news) * 12 / 60:.1f} minutes")
            for ticker in sorted(missing_in_news):
                if self.collect_news_for_ticker(ticker):
                    news_success += 1
                else:
                    news_failed += 1
            print(f"  └─ ✅ Success: {news_success}, ⚠️  Failed/No Data: {news_failed}\n")

        # Verify again
        print(f"{'='*70}")
        print(f"🔄 Re-verification After Data Collection")
        print(f"{'='*70}\n")

        fec_tickers_after = self.get_tickers_in_collection('company_rankings_by_ticker')
        esg_tickers_after = self.get_tickers_in_collection('company_esg_by_ticker')
        news_tickers_after = self.get_tickers_in_collection('company_news_by_ticker')

        print(f"📋 Final Status:")
        print(f"  ├─ FEC tickers: {len(fec_tickers_after)}")
        if missing_in_fec:
            print(f"  │  └─ Successfully re-collected: {fec_success}, Failed/No Data: {fec_failed}")
        print(f"  ├─ ESG tickers: {len(esg_tickers_after)}")
        if missing_in_esg:
            print(f"  │  └─ Successfully re-collected: {esg_success}, Failed/No Data: {esg_failed}")
        print(f"  └─ News tickers: {len(news_tickers_after)}")
        if missing_in_news:
            print(f"     └─ Successfully re-collected: {news_success}, Failed/No Data: {news_failed}")
        print()

        # Check for remaining inconsistencies
        all_tickers_after = fec_tickers_after | esg_tickers_after | news_tickers_after
        still_missing_in_fec = all_tickers_after - fec_tickers_after
        still_missing_in_esg = all_tickers_after - esg_tickers_after
        still_missing_in_news = all_tickers_after - news_tickers_after

        if still_missing_in_fec or still_missing_in_esg or still_missing_in_news:
            print(f"⚠️  Still Inconsistent After Re-collection:")
            if still_missing_in_fec:
                print(f"  ├─ Missing in FEC: {sorted(list(still_missing_in_fec))}")
            if still_missing_in_esg:
                print(f"  ├─ Missing in ESG: {sorted(list(still_missing_in_esg))}")
            if still_missing_in_news:
                print(f"  └─ Missing in News: {sorted(list(still_missing_in_news))}\n")
            print(f"{'='*70}")
            print(f"⚠️  Partial Success - Some inconsistencies remain")
            print(f"{'='*70}")
            print(f"Note: Some tickers may genuinely have no data available from APIs.\n")
        else:
            # All collections have the same ticker list
            print(f"✅ All collections now have the same {len(fec_tickers_after)} tickers!\n")
            print(f"{'='*70}")
            print(f"✅ Verification Complete - All Collections Consistent!")
            print(f"{'='*70}\n")


def main():
    """Main function"""
    credentials_path = os.getenv('FIREBASE_CREDENTIALS_PATH')

    if len(sys.argv) > 1:
        credentials_path = sys.argv[1]

    verifier = TickerConsistencyVerifier(credentials_path)
    verifier.verify_and_fix()


if __name__ == "__main__":
    main()
