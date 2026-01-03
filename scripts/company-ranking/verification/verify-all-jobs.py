#!/usr/bin/env python3
"""
综合验证脚本 - 验证所有4个Cloud Run Jobs的数据采集和Firebase存储
运行方式: python3 scripts/company-ranking/verification/verify-all-jobs.py
"""

import sys
import os
from datetime import datetime, timedelta
from typing import Dict, List, Optional

# 添加项目根目录到Python路径
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../..')))

# 导入Firebase Admin
import firebase_admin
from firebase_admin import credentials, firestore

# 初始化Firebase
if not firebase_admin._apps:
    cred = credentials.ApplicationDefault()
    firebase_admin.initialize_app(cred, {
        'projectId': 'stanseproject'
    })

db = firestore.client()

# ============================================================================
# 验证配置
# ============================================================================

# 测试公司列表 (验证这3个公司的数据)
TEST_TICKERS = ['AAPL', 'MSFT', 'GOOGL']

# 时间阈值 (最近7天内的数据被认为是新鲜的)
FRESHNESS_THRESHOLD = timedelta(days=7)

class VerificationResult:
    def __init__(self, job_name: str):
        self.job_name = job_name
        self.total_checked = 0
        self.passed = 0
        self.failed = 0
        self.warnings = []
        self.errors = []

    def add_pass(self):
        self.passed += 1
        self.total_checked += 1

    def add_fail(self, error_msg: str):
        self.failed += 1
        self.total_checked += 1
        self.errors.append(error_msg)

    def add_warning(self, warning_msg: str):
        self.warnings.append(warning_msg)

    def print_summary(self):
        print(f"\n{'='*70}")
        print(f"📊 {self.job_name} - Verification Summary")
        print(f"{'='*70}")
        print(f"Total Checks: {self.total_checked}")
        print(f"✅ Passed: {self.passed}")
        print(f"❌ Failed: {self.failed}")

        if self.warnings:
            print(f"\n⚠️  Warnings ({len(self.warnings)}):")
            for warning in self.warnings:
                print(f"   - {warning}")

        if self.errors:
            print(f"\n❌ Errors ({len(self.errors)}):")
            for error in self.errors:
                print(f"   - {error}")

        if self.failed == 0 and not self.errors:
            print("\n✅ All checks passed!")

        print(f"{'='*70}\n")

# ============================================================================
# Job 1: FEC Donations Collector
# ============================================================================

def verify_fec_donations() -> VerificationResult:
    """验证 FEC 政治捐款数据采集"""
    result = VerificationResult("FEC Donations Collector")
    print(f"\n🔍 Verifying FEC Donations Data...")

    collection_name = 'company_rankings_by_ticker'

    for ticker in TEST_TICKERS:
        print(f"  Checking {ticker}...")
        try:
            doc_ref = db.collection(collection_name).document(ticker)
            doc = doc_ref.get()

            if not doc.exists:
                result.add_fail(f"{ticker}: Document not found in {collection_name}")
                continue

            data = doc.to_dict()

            # 验证必需字段
            if 'fec_data' not in data:
                result.add_fail(f"{ticker}: Missing 'fec_data' field")
                continue

            fec_data = data['fec_data']

            # 验证FEC数据结构 - check for party_totals and total_usd
            if 'party_totals' not in fec_data:
                result.add_fail(f"{ticker}: Missing 'party_totals' in fec_data")
                continue

            if 'total_usd' not in fec_data:
                result.add_fail(f"{ticker}: Missing 'total_usd' in fec_data")
                continue

            party_totals = fec_data['party_totals']

            # Check for DEM and REP party data
            if 'DEM' not in party_totals or 'REP' not in party_totals:
                result.add_fail(f"{ticker}: Missing DEM or REP in party_totals")
                continue

            # 验证数据新鲜度
            if 'last_updated' in data:
                # last_updated is a DatetimeWithNanoseconds object
                last_updated = data['last_updated']
                if hasattr(last_updated, 'replace'):
                    # Convert to timezone-aware datetime
                    from datetime import timezone
                    now = datetime.now(timezone.utc)
                    if now - last_updated > FRESHNESS_THRESHOLD:
                        result.add_warning(f"{ticker}: Data is older than {FRESHNESS_THRESHOLD.days} days")

            result.add_pass()
            total_usd = fec_data.get('total_usd', 0)
            dem_usd = party_totals.get('DEM', {}).get('total_amount_usd', 0)
            rep_usd = party_totals.get('REP', {}).get('total_amount_usd', 0)
            print(f"    ✅ FEC data valid (Total: ${total_usd:,.0f}, DEM: ${dem_usd:,.0f}, REP: ${rep_usd:,.0f})")

        except Exception as e:
            result.add_fail(f"{ticker}: Exception - {str(e)}")

    result.print_summary()
    return result

# ============================================================================
# Job 2: ESG Scores Collector
# ============================================================================

def verify_esg_scores() -> VerificationResult:
    """验证 ESG 评分数据采集"""
    result = VerificationResult("ESG Scores Collector")
    print(f"\n🔍 Verifying ESG Scores Data...")

    collection_name = 'company_esg_by_ticker'

    for ticker in TEST_TICKERS:
        print(f"  Checking {ticker}...")
        try:
            doc_ref = db.collection(collection_name).document(ticker)
            doc = doc_ref.get()

            if not doc.exists:
                result.add_fail(f"{ticker}: Document not found in {collection_name}")
                continue

            data = doc.to_dict()

            # ESG scores are nested in 'summary' field
            if 'summary' not in data:
                result.add_fail(f"{ticker}: Missing 'summary' field")
                continue

            esg_data = data['summary']

            # 验证ESG数据结构
            required_fields = ['environmentalScore', 'socialScore', 'governanceScore']
            missing_fields = [f for f in required_fields if f not in esg_data]

            if missing_fields:
                result.add_fail(f"{ticker}: Missing ESG fields in summary: {missing_fields}")
                continue

            # 验证分数范围 (0-100)
            for field in required_fields:
                score = esg_data.get(field, -1)
                if not (0 <= score <= 100):
                    result.add_warning(f"{ticker}: {field} out of range (0-100): {score}")

            result.add_pass()
            print(f"    ✅ ESG data valid (E:{esg_data.get('environmentalScore', 0):.1f}, S:{esg_data.get('socialScore', 0):.1f}, G:{esg_data.get('governanceScore', 0):.1f})")

        except Exception as e:
            result.add_fail(f"{ticker}: Exception - {str(e)}")

    result.print_summary()
    return result

# ============================================================================
# Job 3: Polygon News Collector
# ============================================================================

def verify_polygon_news() -> VerificationResult:
    """验证 Polygon 新闻数据采集"""
    result = VerificationResult("Polygon News Collector")
    print(f"\n🔍 Verifying Polygon News Data...")

    collection_name = 'company_news_by_ticker'

    for ticker in TEST_TICKERS:
        print(f"  Checking {ticker}...")
        try:
            doc_ref = db.collection(collection_name).document(ticker)
            doc = doc_ref.get()

            if not doc.exists:
                result.add_fail(f"{ticker}: Document not found in {collection_name}")
                continue

            data = doc.to_dict()

            # 验证必需字段
            if 'articles' not in data:
                result.add_fail(f"{ticker}: Missing 'articles' field")
                continue

            articles = data['articles']

            if not isinstance(articles, list):
                result.add_fail(f"{ticker}: 'articles' is not a list")
                continue

            if len(articles) == 0:
                result.add_warning(f"{ticker}: No articles found")

            # 验证文章结构
            for i, article in enumerate(articles[:3]):  # 只检查前3篇
                required_fields = ['title', 'published_utc', 'article_url']
                missing_fields = [f for f in required_fields if f not in article]

                if missing_fields:
                    result.add_warning(f"{ticker}: Article {i} missing fields: {missing_fields}")

            result.add_pass()
            print(f"    ✅ News data valid ({len(articles)} articles)")

        except Exception as e:
            result.add_fail(f"{ticker}: Exception - {str(e)}")

    result.print_summary()
    return result

# ============================================================================
# Job 4: Executive Statements Analyzer
# ============================================================================

def verify_executive_statements() -> VerificationResult:
    """验证 CEO/高管言论分析"""
    result = VerificationResult("Executive Statements Analyzer")
    print(f"\n🔍 Verifying Executive Statements Data...")

    collection_name = 'company_executive_statements_by_ticker'

    for ticker in TEST_TICKERS:
        print(f"  Checking {ticker}...")
        try:
            doc_ref = db.collection(collection_name).document(ticker)
            doc = doc_ref.get()

            if not doc.exists:
                result.add_fail(f"{ticker}: Document not found in {collection_name}")
                continue

            data = doc.to_dict()

            # 验证必需字段
            if 'analysis' not in data:
                result.add_fail(f"{ticker}: Missing 'analysis' field")
                continue

            analysis = data['analysis']

            # 验证分析结构
            required_fields = ['has_executive_statements', 'recommendation_score']
            missing_fields = [f for f in required_fields if f not in analysis]

            if missing_fields:
                result.add_fail(f"{ticker}: Missing analysis fields: {missing_fields}")
                continue

            # 如果有高管言论，验证详细分析
            if analysis.get('has_executive_statements', False):
                if 'political_stance' not in analysis:
                    result.add_warning(f"{ticker}: Has statements but missing 'political_stance'")

                # 验证推荐分数范围
                rec_score = analysis.get('recommendation_score', -1)
                if not (0 <= rec_score <= 100):
                    result.add_warning(f"{ticker}: recommendation_score out of range: {rec_score}")

            result.add_pass()
            has_statements = "Yes" if analysis.get('has_executive_statements') else "No"
            print(f"    ✅ Executive analysis valid (Has statements: {has_statements}, Score: {analysis.get('recommendation_score', 'N/A')})")

        except Exception as e:
            result.add_fail(f"{ticker}: Exception - {str(e)}")

    result.print_summary()
    return result

# ============================================================================
# 主函数
# ============================================================================

def main():
    print("=" * 70)
    print("🧪 Company Ranking Data Collection Verification")
    print("=" * 70)
    print(f"Testing {len(TEST_TICKERS)} companies: {', '.join(TEST_TICKERS)}")
    print(f"Freshness threshold: {FRESHNESS_THRESHOLD.days} days")
    print("=" * 70)

    # 运行所有验证
    results = []
    results.append(verify_fec_donations())
    results.append(verify_esg_scores())
    results.append(verify_polygon_news())
    results.append(verify_executive_statements())

    # 总结
    print("\n" + "=" * 70)
    print("📈 Overall Summary")
    print("=" * 70)

    total_passed = sum(r.passed for r in results)
    total_failed = sum(r.failed for r in results)
    total_warnings = sum(len(r.warnings) for r in results)

    for result in results:
        status = "✅ PASS" if result.failed == 0 else "❌ FAIL"
        print(f"{status} - {result.job_name}: {result.passed}/{result.total_checked} checks passed")

    print(f"\nTotal Checks: {total_passed + total_failed}")
    print(f"✅ Passed: {total_passed}")
    print(f"❌ Failed: {total_failed}")
    print(f"⚠️  Warnings: {total_warnings}")

    if total_failed == 0:
        print("\n🎉 All verifications passed!")
        sys.exit(0)
    else:
        print(f"\n⚠️  {total_failed} checks failed. Please review the errors above.")
        sys.exit(1)

if __name__ == "__main__":
    main()
