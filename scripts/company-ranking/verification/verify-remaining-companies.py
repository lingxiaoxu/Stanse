#!/usr/bin/env python3
"""
验证剩余公司是否真的在 fec_company_consolidated 中没有数据

已有数据的56个公司:
ABBV, ABT, AEP, APD, AVGO, BA, BAC, BLK, BMY, BRK.B, C, CAT, CCI, CMCSA, COP,
CVS, CVX, D, DE, DUK, FCX, GD, GE, GOOGL, GS, HON, INTC, JNJ, JPM, LLY, LMT,
LOW, MA, MCD, META, MRK, MSFT, NOC, ORCL, OXY, PEP, PFE, PSX, SO, SPG, T, TGT,
TMUS, UNH, V, VLO, WFC, WMT, XOM

需要验证的28个公司(84 - 56 = 28)
"""

import os
import sys
from google.cloud import firestore

# 所有84个 SP500 公司
ALL_SP500_TICKERS = [
    'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'AVGO', 'ORCL', 'CRM',
    'AMD', 'INTC', 'IBM', 'CSCO', 'ADBE', 'BRK.B', 'JPM', 'V', 'MA', 'BAC',
    'WFC', 'GS', 'MS', 'BLK', 'C', 'UNH', 'JNJ', 'LLY', 'PFE', 'MRK',
    'ABBV', 'TMO', 'ABT', 'CVS', 'BMY', 'WMT', 'PG', 'KO', 'PEP', 'COST',
    'HD', 'MCD', 'NKE', 'SBUX', 'TGT', 'LOW', 'DIS', 'XOM', 'CVX', 'COP',
    'SLB', 'EOG', 'OXY', 'PSX', 'VLO', 'GE', 'CAT', 'RTX', 'HON', 'UPS',
    'BA', 'LMT', 'DE', 'NOC', 'GD', 'NFLX', 'CMCSA', 'T', 'VZ', 'TMUS',
    'NEE', 'DUK', 'SO', 'D', 'AEP', 'LIN', 'APD', 'SHW', 'FCX', 'NEM',
    'PLD', 'AMT', 'CCI', 'EQIX', 'SPG'
]

# 已有数据的公司
HAS_DATA = [
    'ABBV', 'ABT', 'AEP', 'APD', 'AVGO', 'BA', 'BAC', 'BLK', 'BMY', 'BRK.B',
    'C', 'CAT', 'CCI', 'CMCSA', 'COP', 'CVS', 'CVX', 'D', 'DE', 'DUK',
    'FCX', 'GD', 'GE', 'GOOGL', 'GS', 'HON', 'INTC', 'JNJ', 'JPM', 'LLY',
    'LMT', 'LOW', 'MA', 'MCD', 'META', 'MRK', 'MSFT', 'NOC', 'ORCL', 'OXY',
    'PEP', 'PFE', 'PSX', 'SO', 'SPG', 'T', 'TGT', 'TMUS', 'UNH', 'V',
    'VLO', 'WFC', 'WMT', 'XOM'
]

# 计算缺失的公司
MISSING_COMPANIES = [ticker for ticker in ALL_SP500_TICKERS if ticker not in HAS_DATA]

print(f"总公司数: {len(ALL_SP500_TICKERS)}")
print(f"已有数据: {len(HAS_DATA)}")
print(f"缺失数据: {len(MISSING_COMPANIES)}")
print(f"\n缺失的公司: {MISSING_COMPANIES}")

# 公司名称映射
COMPANY_NAMES = {
    'AAPL': 'Apple',
    'AMZN': 'Amazon',
    'NVDA': 'NVIDIA',
    'TSLA': 'Tesla',
    'CRM': 'Salesforce',
    'AMD': 'Advanced Micro Devices',
    'IBM': 'IBM',
    'CSCO': 'Cisco',
    'ADBE': 'Adobe',
    'MS': 'Morgan Stanley',
    'TMO': 'Thermo Fisher',
    'PG': 'Procter & Gamble',
    'KO': 'Coca-Cola',
    'COST': 'Costco',
    'HD': 'Home Depot',
    'NKE': 'Nike',
    'SBUX': 'Starbucks',
    'DIS': 'Disney',
    'SLB': 'Schlumberger',
    'EOG': 'EOG Resources',
    'RTX': 'Raytheon',
    'UPS': 'UPS',
    'NFLX': 'Netflix',
    'VZ': 'Verizon',
    'NEE': 'NextEra',
    'LIN': 'Linde',
    'SHW': 'Sherwin-Williams',
    'NEM': 'Newmont',
    'PLD': 'Prologis',
    'AMT': 'American Tower',
    'EQIX': 'Equinix',
}

# 更详细的搜索关键词
SEARCH_KEYWORDS = {
    'AAPL': ['apple inc', 'apple computer'],
    'AMZN': ['amazon', 'amazon.com', 'amazon web services'],
    'NVDA': ['nvidia'],
    'TSLA': ['tesla', 'tesla motors'],
    'CRM': ['salesforce'],
    'AMD': ['advanced micro devices', 'amd inc'],
    'IBM': ['international business machines', 'ibm corporation'],
    'CSCO': ['cisco systems'],
    'ADBE': ['adobe systems', 'adobe inc'],
    'MS': ['morgan stanley'],
    'TMO': ['thermo fisher scientific'],
    'PG': ['procter gamble', 'procter & gamble'],
    'KO': ['coca-cola', 'coca cola company'],
    'COST': ['costco wholesale'],
    'HD': ['home depot'],
    'NKE': ['nike inc'],
    'SBUX': ['starbucks corporation'],
    'DIS': ['walt disney', 'disney company'],
    'SLB': ['schlumberger'],
    'EOG': ['eog resources'],
    'RTX': ['raytheon technologies'],
    'UPS': ['united parcel service'],
    'NFLX': ['netflix'],
    'VZ': ['verizon communications'],
    'NEE': ['nextera energy'],
    'LIN': ['linde plc'],
    'SHW': ['sherwin-williams', 'sherwin williams'],
    'NEM': ['newmont corporation', 'newmont mining'],
    'PLD': ['prologis'],
    'AMT': ['american tower corporation'],
    'EQIX': ['equinix'],
}


def search_comprehensive(ticker: str, db):
    """在 fec_company_consolidated 中进行全面搜索"""
    keywords = SEARCH_KEYWORDS.get(ticker, [COMPANY_NAMES.get(ticker, ticker).lower()])

    all_docs = db.collection('fec_company_consolidated').stream()
    matches = []

    for doc in all_docs:
        data = doc.to_dict()
        normalized_name = data.get('normalized_name', '').lower()

        for keyword in keywords:
            # 使用 'in' 而不是精确匹配,更宽松的搜索
            if keyword.lower() in normalized_name:
                matches.append({
                    'normalized_name': data.get('normalized_name'),
                    'keyword': keyword
                })
                break

    return matches


def main():
    print("="*70)
    print("🔍 验证剩余28个公司在 fec_company_consolidated 中的情况")
    print("="*70)
    print()

    # 初始化 Firebase
    db = firestore.Client(project='stanseproject')
    print("✅ Firebase initialized\n")

    found = []
    truly_missing = []

    for ticker in MISSING_COMPANIES:
        company_name = COMPANY_NAMES.get(ticker, ticker)
        print(f"[{ticker}] 搜索 '{company_name}'...")

        matches = search_comprehensive(ticker, db)

        if matches:
            print(f"  ✅ 找到 {len(matches)} 个可能匹配:")
            for match in matches[:5]:  # 显示前5个
                print(f"     - {match['normalized_name']} (关键词: {match['keyword']})")
            found.append((ticker, company_name, matches))
        else:
            print(f"  ❌ 确实没有数据")
            truly_missing.append((ticker, company_name))
        print()

    # 总结
    print("="*70)
    print("📊 最终验证结果")
    print("="*70)
    print(f"在 fec_company_consolidated 中找到数据: {len(found)}/{len(MISSING_COMPANIES)}")
    print(f"确实没有数据: {len(truly_missing)}/{len(MISSING_COMPANIES)}")
    print()

    if found:
        print("⚠️  以下公司有数据但未被采集:")
        print("-"*70)
        for ticker, company_name, matches in found:
            print(f"\n{ticker} ({company_name}): {len(matches)} 个匹配")
            for match in matches[:3]:
                print(f"  - {match['normalized_name']}")
        print()

    if truly_missing:
        print("✅ 以下公司确实没有FEC数据:")
        print("-"*70)
        for ticker, company_name in truly_missing:
            print(f"  - {ticker} ({company_name})")

    print()
    print("="*70)
    print(f"📈 数据覆盖率: {len(HAS_DATA) + len(found)}/{len(ALL_SP500_TICKERS)} "
          f"({100 * (len(HAS_DATA) + len(found)) / len(ALL_SP500_TICKERS):.1f}%)")
    print("="*70)


if __name__ == "__main__":
    main()
