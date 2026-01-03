#!/usr/bin/env python3
"""
测试 Polygon 新闻采集脚本（3个公司）

使用 Google Secret Manager 获取 API key，测试 Polygon API 集成
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
    print("🔐 Fetching POLYGON_API_KEY from Google Secret Manager...")

    # Fetch API key from Secret Manager
    # Secret name is 'polygon-api-key' (lowercase with hyphen)
    api_key = get_secret_from_manager("gen-lang-client-0960644135", "polygon-api-key")

    if not api_key:
        print("❌ Failed to fetch POLYGON_API_KEY")
        sys.exit(1)

    # Set environment variable
    os.environ['POLYGON_API_KEY'] = api_key
    print(f"✅ POLYGON_API_KEY loaded: {'*' * (len(api_key) - 4)}{api_key[-4:]}")

    # Import and modify the collector
    from importlib import import_module
    collector_module = import_module('03-collect-polygon-news')

    # Override SP500_TICKERS to test only 3 companies
    collector_module.SP500_TICKERS = ['AAPL', 'MSFT', 'GOOGL']

    print("\n🧪 Testing with 3 companies: AAPL, MSFT, GOOGL")
    print("="*60)

    # Create collector and run
    collector = collector_module.PolygonNewsCollector()

    # Run with shorter delay for testing (2 seconds)
    # Note: Polygon free tier is 5 calls/min, so 12s is safer
    # For testing, we use 2s assuming paid tier or low usage
    collector.run(batch_size=10, delay_between_requests=2.0)

    print("\n✅ Test complete! Check Firebase company_news_by_ticker collection")
