#!/usr/bin/env python3
"""
检查 Firebase 数据库中的实际字段名
Check actual field names in Firebase database for FEC, ESG, Executive, and News data
"""

import firebase_admin
from firebase_admin import credentials, firestore

def main():
    # Initialize Firebase using Application Default Credentials
    if not firebase_admin._apps:
        cred = credentials.ApplicationDefault()
        firebase_admin.initialize_app(cred, {'projectId': 'stanseproject'})
    db = firestore.client()

    # Test ticker
    ticker = 'JPM'

    print(f"\n{'='*80}")
    print(f"检查 {ticker} 的 Firebase 文档结构")
    print(f"Checking Firebase document structure for {ticker}")
    print(f"{'='*80}\n")

    # 1. FEC Data
    print("1️⃣  FEC Data (company_rankings_by_ticker)")
    print("-" * 80)
    fec_ref = db.collection('company_rankings_by_ticker').document(ticker)
    fec_doc = fec_ref.get()
    if fec_doc.exists:
        data = fec_doc.to_dict()
        print(f"✅ Document exists")
        print(f"📋 Top-level keys: {list(data.keys())}")
        if 'fec_data' in data:
            print(f"✅ HAS 'fec_data' field")
            fec_data = data['fec_data']
            print(f"   fec_data type: {type(fec_data)}")
            if isinstance(fec_data, dict):
                print(f"   fec_data keys: {list(fec_data.keys())}")
                # Show sample of nested structure
                import json
                print(f"   Full structure:")
                print(json.dumps(fec_data, indent=4, default=str))
        else:
            print(f"❌ NO 'fec_data' field")
            print(f"   Available fields: {list(data.keys())}")
    else:
        print(f"❌ Document does NOT exist")

    print(f"\n")

    # 2. ESG Data
    print("2️⃣  ESG Data (company_esg_by_ticker)")
    print("-" * 80)
    esg_ref = db.collection('company_esg_by_ticker').document(ticker)
    esg_doc = esg_ref.get()
    if esg_doc.exists:
        data = esg_doc.to_dict()
        print(f"✅ Document exists")
        print(f"📋 Top-level keys: {list(data.keys())}")
        if 'esg_data' in data:
            print(f"✅ HAS 'esg_data' field")
            print(f"   Content sample: {str(data['esg_data'])[:200]}...")
        else:
            print(f"❌ NO 'esg_data' field")
        if 'summary' in data:
            print(f"✅ HAS 'summary' field")
            print(f"   Content sample: {str(data['summary'])[:200]}...")
        else:
            print(f"❌ NO 'summary' field")
    else:
        print(f"❌ Document does NOT exist")

    print(f"\n")

    # 3. Executive Data
    print("3️⃣  Executive Data (company_executive_statements_by_ticker)")
    print("-" * 80)
    exec_ref = db.collection('company_executive_statements_by_ticker').document(ticker)
    exec_doc = exec_ref.get()
    if exec_doc.exists:
        data = exec_doc.to_dict()
        print(f"✅ Document exists")
        print(f"📋 Top-level keys: {list(data.keys())}")
        if 'analysis' in data:
            print(f"✅ HAS 'analysis' field")
            print(f"   Content sample: {str(data['analysis'])[:200]}...")
        else:
            print(f"❌ NO 'analysis' field")
            print(f"   Available fields: {list(data.keys())}")
    else:
        print(f"❌ Document does NOT exist")

    print(f"\n")

    # 4. News Data
    print("4️⃣  News Data (company_news_by_ticker)")
    print("-" * 80)
    news_ref = db.collection('company_news_by_ticker').document(ticker)
    news_doc = news_ref.get()
    if news_doc.exists:
        data = news_doc.to_dict()
        print(f"✅ Document exists")
        print(f"📋 Top-level keys: {list(data.keys())}")
        if 'articles' in data:
            print(f"✅ HAS 'articles' field")
            if isinstance(data['articles'], list):
                print(f"   Type: list, Count: {len(data['articles'])}")
                if len(data['articles']) > 0:
                    print(f"   First article keys: {list(data['articles'][0].keys())}")
            else:
                print(f"   Type: {type(data['articles'])}")
        else:
            print(f"❌ NO 'articles' field")
            print(f"   Available fields: {list(data.keys())}")
    else:
        print(f"❌ Document does NOT exist")

    print(f"\n{'='*80}")
    print("Summary:")
    print(f"{'='*80}")
    print(f"")
    print(f"✅ Correct Field Names for TypeScript:")
    print(f"   - FEC:       data.fec_data       (collection: company_rankings_by_ticker)")
    print(f"   - ESG:       data.summary         (collection: company_esg_by_ticker)")
    print(f"   - Executive: data.analysis        (collection: company_executive_statements_by_ticker)")
    print(f"   - News:      data.articles        (collection: company_news_by_ticker)")
    print(f"")

if __name__ == '__main__':
    main()
