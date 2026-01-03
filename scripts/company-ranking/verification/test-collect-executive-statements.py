#!/usr/bin/env python3
"""
测试 Executive Statements 分析脚本（3个公司）

使用 Google Secret Manager 获取 Gemini API key，测试高管言论分析
"""

import os
import sys
import subprocess

# 添加父目录到 path
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PARENT_DIR = os.path.dirname(SCRIPT_DIR)
sys.path.insert(0, PARENT_DIR)

def get_secret_from_manager(project_id: str, secret_id: str) -> str:
    """从 Google Secret Manager 获取 secret（使用 gcloud CLI）"""
    try:
        result = subprocess.run(
            ['gcloud', 'secrets', 'versions', 'access', 'latest',
             '--secret', secret_id, '--project', project_id],
            capture_output=True,
            text=True,
            check=True
        )
        return result.stdout.strip()
    except subprocess.CalledProcessError as e:
        print(f"❌ Error fetching secret '{secret_id}': {e.stderr}")
        sys.exit(1)

if __name__ == "__main__":
    print("🔐 Fetching GEMINI_API_KEY from Google Secret Manager...")

    # Fetch API key from Secret Manager
    # Secret name is 'gemini-api-key' (lowercase with hyphen)
    api_key = get_secret_from_manager("gen-lang-client-0960644135", "gemini-api-key")

    if not api_key:
        print("❌ Failed to fetch GEMINI_API_KEY")
        sys.exit(1)

    # Set environment variable
    os.environ['GEMINI_API_KEY'] = api_key
    print(f"✅ GEMINI_API_KEY loaded: {'*' * (len(api_key) - 4)}{api_key[-4:]}")

    # Import and modify the analyzer
    from importlib import import_module
    analyzer_module = import_module('04-analyze-executive-statements')

    # Override SP500_TICKERS to test only 3 companies
    analyzer_module.SP500_TICKERS = ['AAPL', 'MSFT', 'GOOGL']

    print("\n🧪 Testing with 3 companies: AAPL, MSFT, GOOGL")
    print("="*60)

    # Create analyzer and run
    analyzer = analyzer_module.ExecutiveStatementAnalyzer()

    # Run the analysis
    # Note: This will use Gemini API which may take some time
    analyzer.run()

    print("\n✅ Test complete! Check Firebase company_executive_statements_by_ticker collection")
