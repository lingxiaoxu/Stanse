#!/usr/bin/env python3
"""
验证"无数据"的公司是否真的在 fec_company_consolidated 中没有数据

检查策略:
1. 获取所有显示"无数据"的公司列表
2. 在 fec_company_consolidated 中搜索这些公司的可能变体
3. 报告哪些公司实际上有数据但未被找到
"""

import os
import sys
import re
from google.cloud import firestore

# 添加父目录到 path
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PARENT_DIR = os.path.dirname(SCRIPT_DIR)
sys.path.insert(0, PARENT_DIR)

# 从日志中提取的"无数据"公司列表
NO_DATA_COMPANIES = [
    ('AAPL', 'Apple'),
    ('AMZN', 'Amazon'),
    ('NVDA', 'NVIDIA'),
    ('TSLA', 'Tesla'),
    ('CRM', 'CRM'),
    ('AMD', 'AMD'),
    ('IBM', 'IBM'),
    ('CSCO', 'CSCO'),
    ('ADBE', 'ADBE'),
    ('MA', 'MA'),
    ('MS', 'MS'),
    ('LLY', 'LLY'),
    ('ABBV', 'ABBV'),
    ('TMO', 'TMO'),
    ('PG', 'PG'),
    ('KO', 'KO'),
    ('PEP', 'PEP'),
    ('COST', 'COST'),
    ('HD', 'HD'),
    ('MCD', 'MCD'),
    ('NKE', 'NKE'),
    ('SBUX', 'SBUX'),
    ('LOW', 'LOW'),
    ('DIS', 'DIS'),
    ('COP', 'COP'),
    ('SLB', 'SLB'),
    ('EOG', 'EOG'),
    ('GE', 'GE'),
    ('RTX', 'Raytheon'),
    ('HON', 'HON'),
    ('UPS', 'UPS'),
    ('DE', 'DE'),
    ('NFLX', 'NFLX'),
    ('CMCSA', 'CMCSA'),
    ('T', 'T'),
    ('VZ', 'VZ'),
    ('NEE', 'NEE'),
    ('SO', 'SO'),
    ('D', 'D'),
    ('LIN', 'LIN'),
    ('SHW', 'SHW'),
    ('NEM', 'NEM'),
    ('PLD', 'PLD'),
    ('AMT', 'AMT'),
    ('CCI', 'CCI'),
    ('EQIX', 'EQIX'),
]

# 常见公司名称映射（用于搜索）
COMPANY_KEYWORDS = {
    'AAPL': ['apple'],
    'AMZN': ['amazon'],
    'NVDA': ['nvidia'],
    'TSLA': ['tesla'],
    'CRM': ['salesforce'],
    'AMD': ['advanced micro devices', 'amd'],
    'IBM': ['international business machines', 'ibm'],
    'CSCO': ['cisco'],
    'ADBE': ['adobe'],
    'MA': ['mastercard'],
    'MS': ['morgan stanley'],
    'LLY': ['eli lilly', 'lilly'],
    'ABBV': ['abbvie'],
    'TMO': ['thermo fisher'],
    'PG': ['procter gamble', 'procter'],
    'KO': ['coca cola', 'coca-cola'],
    'PEP': ['pepsi'],
    'COST': ['costco'],
    'HD': ['home depot'],
    'MCD': ['mcdonald'],
    'NKE': ['nike'],
    'SBUX': ['starbucks'],
    'LOW': ['lowes', "lowe's"],
    'DIS': ['disney', 'walt disney'],
    'COP': ['conocophillips'],
    'SLB': ['schlumberger'],
    'EOG': ['eog resources'],
    'GE': ['general electric'],
    'RTX': ['raytheon'],
    'HON': ['honeywell'],
    'UPS': ['united parcel service'],
    'DE': ['deere', 'john deere'],
    'NFLX': ['netflix'],
    'CMCSA': ['comcast'],
    'T': ['att', 'at&t'],
    'VZ': ['verizon'],
    'NEE': ['nextera'],
    'SO': ['southern company'],
    'D': ['dominion'],
    'LIN': ['linde'],
    'SHW': ['sherwin williams', 'sherwin-williams'],
    'NEM': ['newmont'],
    'PLD': ['prologis'],
    'AMT': ['american tower'],
    'CCI': ['crown castle'],
    'EQIX': ['equinix'],
}


def search_in_consolidated(ticker: str, company_name: str, db):
    """在 fec_company_consolidated 中搜索公司"""

    # 获取搜索关键词
    keywords = COMPANY_KEYWORDS.get(ticker, [company_name.lower()])

    # 获取所有文档
    all_docs = db.collection('fec_company_consolidated').stream()

    matches = []

    for doc in all_docs:
        data = doc.to_dict()
        normalized_name = data.get('normalized_name', '').lower()
        original_name = data.get('original_name', '').lower()

        # 在 normalized_name 和 original_name 中搜索
        for keyword in keywords:
            if keyword.lower() in normalized_name or keyword.lower() in original_name:
                matches.append({
                    'doc_id': doc.id,
                    'normalized_name': data.get('normalized_name'),
                    'original_name': data.get('original_name'),
                    'keyword': keyword
                })
                break

    return matches


def main():
    print("="*70)
    print("🔍 验证'无数据'公司")
    print("="*70)
    print(f"总共需要验证: {len(NO_DATA_COMPANIES)} 个公司")
    print()

    # 初始化 Firebase
    db = firestore.Client(project='stanseproject')
    print("✅ Firebase initialized\n")

    found_companies = []
    truly_missing = []

    for ticker, company_name in NO_DATA_COMPANIES:
        print(f"[{ticker}] 搜索 '{company_name}'...")

        matches = search_in_consolidated(ticker, company_name, db)

        if matches:
            print(f"  ✅ 找到 {len(matches)} 个匹配:")
            for match in matches[:3]:  # 只显示前3个
                print(f"     - {match['normalized_name']}")
                print(f"       (原始名: {match['original_name']})")
            found_companies.append((ticker, company_name, matches))
        else:
            print(f"  ❌ 确实没有数据")
            truly_missing.append((ticker, company_name))

        print()

    # 总结
    print("="*70)
    print("📊 验证总结")
    print("="*70)
    print(f"实际有数据但未找到: {len(found_companies)}/{len(NO_DATA_COMPANIES)}")
    print(f"确实没有数据: {len(truly_missing)}/{len(NO_DATA_COMPANIES)}")
    print()

    if found_companies:
        print("⚠️  以下公司有数据但未被找到:")
        print("-"*70)
        for ticker, company_name, matches in found_companies:
            print(f"\n{ticker} ({company_name}):")
            for match in matches[:3]:
                print(f"  - {match['normalized_name']}")
        print()

    if truly_missing:
        print("✅ 以下公司确实没有数据:")
        print("-"*70)
        for ticker, company_name in truly_missing:
            print(f"  - {ticker} ({company_name})")

    print()
    print("="*70)


if __name__ == "__main__":
    main()
