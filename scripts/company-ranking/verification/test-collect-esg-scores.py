#!/usr/bin/env python3
"""
临时测试脚本 - 测试3个公司的ESG数据采集
从 Google Secret Manager 安全获取 API key
"""

import sys
import os
import subprocess

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
        print(f"❌ Error fetching secret: {e}")
        sys.exit(1)

def patch_tickers():
    """在导入前修改SP500_TICKERS"""
    import importlib
    import importlib.util

    # 从 Secret Manager 获取 API key（安全方式）
    print("📡 Fetching API key from Google Secret Manager...")
    api_key = get_secret_from_manager("gen-lang-client-0960644135", "FMP_API_KEY")
    os.environ['FMP_API_KEY'] = api_key
    print("✅ API key loaded securely\n")

    # 加载模块但不执行
    spec = importlib.util.spec_from_file_location("esg_module", "02-collect-esg-scores.py")
    module = importlib.util.module_from_spec(spec)

    # 修改全局变量
    spec.loader.exec_module(module)

    # 修改 SP500_TICKERS 为仅3个公司进行测试
    module.SP500_TICKERS = ['AAPL', 'MSFT', 'GOOGL']

    # 重新执行main
    module.main()

if __name__ == "__main__":
    patch_tickers()
