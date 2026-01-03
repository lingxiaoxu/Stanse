#!/usr/bin/env python3
"""
测试 FEC 政治捐款采集脚本（3个公司）

测试 FEC 数据采集和 Firebase 上传
新增：测试 AI 验证功能（Gemini 2.5 Flash）
"""

import os
import sys
import subprocess

# 添加父目录到 path
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PARENT_DIR = os.path.dirname(SCRIPT_DIR)
sys.path.insert(0, PARENT_DIR)


def test_ai_verification():
    """测试 AI 验证功能（关键测试：确保拒绝错误匹配）"""
    print("\n" + "="*60)
    print("🤖 Testing AI Verification Function")
    print("="*60)

    # 确保 GEMINI_API_KEY 已设置
    if not os.getenv('GEMINI_API_KEY'):
        print("⚠️  GEMINI_API_KEY not set, getting from Secret Manager...")
        api_key = subprocess.check_output([
            'gcloud', 'secrets', 'versions', 'access', 'latest',
            '--secret', 'gemini-api-key',
            '--project', 'gen-lang-client-0960644135'
        ], text=True).strip()
        os.environ['GEMINI_API_KEY'] = api_key
        print("✅ GEMINI_API_KEY loaded from Secret Manager")

    # Import collector module
    from importlib import import_module
    collector_module = import_module('01-collect-fec-donations')

    # Create collector instance
    collector = collector_module.FECDonationCollector()

    # Test case 1: Should REJECT "us apple association" for AAPL
    print("\n📋 Test Case 1: AAPL vs 'us apple association'")
    print("  Expected: REJECT (different company)")
    ticker = 'AAPL'
    company_name = 'Apple'
    candidate = 'us apple association'

    is_match, reason = collector.verify_company_match_with_ai(ticker, company_name, candidate)

    if is_match:
        print(f"  ❌ FAILED: AI incorrectly accepted '{candidate}'")
        print(f"     Reason: {reason}")
        return False
    else:
        print(f"  ✅ PASSED: AI correctly rejected '{candidate}'")
        print(f"     Reason: {reason}")

    # Test case 2: Should ACCEPT correct Apple PAC
    print("\n📋 Test Case 2: AAPL vs 'apple inc political action committee'")
    print("  Expected: ACCEPT (correct PAC)")
    candidate2 = 'apple inc political action committee'

    is_match2, reason2 = collector.verify_company_match_with_ai(ticker, company_name, candidate2)

    if is_match2:
        print(f"  ✅ PASSED: AI correctly accepted '{candidate2}'")
        print(f"     Reason: {reason2}")
    else:
        print(f"  ⚠️  WARNING: AI rejected correct PAC '{candidate2}'")
        print(f"     Reason: {reason2}")

    # Test case 3: Should REJECT unrelated company
    print("\n📋 Test Case 3: GOOGL vs 'goldman sachs'")
    print("  Expected: REJECT (completely different)")
    ticker3 = 'GOOGL'
    company_name3 = 'Alphabet'
    candidate3 = 'goldman sachs'

    is_match3, reason3 = collector.verify_company_match_with_ai(ticker3, company_name3, candidate3)

    if is_match3:
        print(f"  ❌ FAILED: AI incorrectly accepted '{candidate3}'")
        print(f"     Reason: {reason3}")
        return False
    else:
        print(f"  ✅ PASSED: AI correctly rejected '{candidate3}'")
        print(f"     Reason: {reason3}")

    print("\n✅ AI Verification Tests Complete!")
    return True


def test_data_collection():
    """测试数据采集功能（原有功能）"""
    print("\n" + "="*60)
    print("📊 Testing FEC Data Collection")
    print("="*60)

    # Import and modify the collector
    from importlib import import_module
    collector_module = import_module('01-collect-fec-donations')

    # Override SP500_TICKERS to test only 3 companies
    # 选择有FEC数据的公司进行测试
    collector_module.SP500_TICKERS = ['META', 'BA', 'CVX']

    print("\n🧪 Testing with 3 companies: META, BA, CVX")
    print("="*60)

    # Create collector and run
    collector = collector_module.FECDonationCollector()

    # Run the collection process
    collector.run()

    print("\n✅ Data Collection Test Complete!")
    print("   Check Firebase company_rankings_by_ticker collection")


if __name__ == "__main__":
    print("🧪 FEC Donation Collection Test Suite")
    print("="*60)
    print("Tests:")
    print("  1. AI Verification (Gemini 2.5 Flash)")
    print("  2. Data Collection (3 companies)")
    print("="*60)

    # Run tests
    ai_test_passed = test_ai_verification()
    test_data_collection()

    print("\n" + "="*60)
    print("📊 Test Summary")
    print("="*60)
    print(f"AI Verification: {'✅ PASSED' if ai_test_passed else '❌ FAILED'}")
    print(f"Data Collection: ✅ COMPLETED (check Firebase)")
    print("="*60)
