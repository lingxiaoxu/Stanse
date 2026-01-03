#!/usr/bin/env python3
"""
验证PAC Transfers数据收集

查看fec_company_pac_transfers_summary中的数据
"""

import sys
import os

# 添加项目根目录到Python路径
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../..')))

import firebase_admin
from firebase_admin import credentials, firestore
import json

# 初始化Firebase
if not firebase_admin._apps:
    cred = credentials.ApplicationDefault()
    firebase_admin.initialize_app(cred, {'projectId': 'stanseproject'})

db = firestore.client()

# 查看收集到的数据
tickers = ['MSFT', 'META', 'JPM', 'V']

print("="*70)
print("📊 PAC Transfers Data Verification")
print("="*70)

for ticker in tickers:
    doc = db.collection('fec_company_pac_transfers_summary').document(ticker).get()
    if doc.exists:
        data = doc.to_dict()
        print(f"\n{'-'*70}")
        print(f"{ticker} - PAC Transfers Data")
        print(f"{'-'*70}")
        print(f"Company: {data.get('company_name')}")
        print(f"Total USD: ${data.get('total_usd'):,.0f}")
        print(f"Total Transfers: {data.get('total_count')}")
        print(f"\nParty Breakdown:")
        for party, totals in data.get('party_totals', {}).items():
            print(f"  {party}: ${totals.get('total_amount'):,.0f} ({totals.get('count')} txns)")
        print(f"\nCommittees ({len(data.get('committees', []))}):")
        for comm in data.get('committees', []):
            print(f"  • {comm.get('committee_name')}")
            print(f"    ID: {comm.get('committee_id')}")
            print(f"    Transfers: ${comm.get('transfer_total_usd'):,.0f} ({comm.get('transfer_count')} txns)")
    else:
        print(f"\n{ticker}: No data found")

print(f"\n{'='*70}")
print("✅ Verification Complete")
print("="*70)
