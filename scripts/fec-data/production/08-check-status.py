#!/usr/bin/env python3
"""
检查Firebase中已上传的FEC数据状态
"""

import sys
import subprocess
from pathlib import Path

try:
    import firebase_admin
    from firebase_admin import credentials, firestore
except ImportError:
    print('❌ Firebase库未安装')
    sys.exit(1)

PROJECT_ID = 'stanseproject'
DATA_YEAR = '24'  # 可选: '16', '18', '20', '22', '24'
db = None

def init_firestore():
    """初始化Firestore"""
    global db

    if not firebase_admin._apps:
        try:
            result = subprocess.run(
                ['gcloud', 'auth', 'print-access-token'],
                capture_output=True, text=True, check=True
            )
            access_token = result.stdout.strip()

            from google.oauth2 import credentials as oauth_creds
            cred = oauth_creds.Credentials(access_token)
            firebase_admin.initialize_app(cred, options={'projectId': PROJECT_ID})
        except:
            firebase_admin.initialize_app(options={'projectId': PROJECT_ID})

    db = firestore.client()
    return db

def count_documents(collection_name):
    """计算collection中的文档数量"""
    try:
        # Firestore doesn't have a direct count, so we need to iterate
        docs = db.collection(collection_name).limit(1).stream()
        exists = any(True for _ in docs)

        if not exists:
            return 0

        # For actual count, we'd need to stream all docs, but let's sample instead
        # Get first 1000 to see if there's data
        docs = db.collection(collection_name).limit(1000).stream()
        count = sum(1 for _ in docs)

        if count == 1000:
            return f'1000+ (sample)'
        return count
    except Exception as e:
        return f'Error: {e}'

def get_sample_documents(collection_name, limit=3):
    """获取collection的样本文档"""
    try:
        docs = db.collection(collection_name).limit(limit).stream()
        samples = []
        for doc in docs:
            data = doc.to_dict()
            samples.append({
                'id': doc.id,
                'data': data
            })
        return samples
    except Exception as e:
        return [{'error': str(e)}]

def main():
    """检查所有collections的状态"""
    print('\n' + '='*70)
    print('📊 Firebase FEC数据状态检查')
    print('='*70)

    init_firestore()

    collections_to_check = [
        ('fec_raw_committees', '委员会原始数据'),
        ('fec_raw_candidates', '候选人原始数据'),
        (f'fec_raw_contributions_pac_to_candidate_{DATA_YEAR}', 'PAC捐款原始数据'),
        ('fec_company_index', '公司索引'),
        ('fec_company_party_summary', '公司政党汇总'),
        ('fec_data_metadata', '数据元信息'),
    ]

    for collection_name, description in collections_to_check:
        print(f'\n{"="*70}')
        print(f'Collection: {collection_name}')
        print(f'描述: {description}')
        print(f'{"="*70}')

        count = count_documents(collection_name)
        print(f'文档数量: {count}')

        if count and count != 0:
            print(f'\n样本文档:')
            samples = get_sample_documents(collection_name, limit=2)
            for i, sample in enumerate(samples, 1):
                print(f'\n  样本 {i}:')
                print(f'  ID: {sample.get("id", "N/A")}')
                if 'error' in sample:
                    print(f'  Error: {sample["error"]}')
                else:
                    data = sample.get('data', {})
                    # 只显示关键字段
                    if collection_name == 'fec_raw_committees':
                        print(f'    committee_id: {data.get("committee_id")}')
                        print(f'    committee_name: {data.get("committee_name")}')
                        print(f'    connected_org_name: {data.get("connected_org_name")}')
                        print(f'    data_year: {data.get("data_year")}')
                    elif collection_name == 'fec_raw_candidates':
                        print(f'    candidate_id: {data.get("candidate_id")}')
                        print(f'    candidate_name: {data.get("candidate_name")}')
                        print(f'    party_affiliation: {data.get("party_affiliation")}')
                        print(f'    data_year: {data.get("data_year")}')
                    elif collection_name == 'fec_company_party_summary':
                        print(f'    company_name: {data.get("company_name")}')
                        print(f'    data_year: {data.get("data_year")}')
                        print(f'    total_contributed: ${data.get("total_contributed", 0)/100:,.2f}')
                        party_totals = data.get('party_totals', {})
                        for party, info in party_totals.items():
                            amount = info.get('total_amount', 0) / 100
                            print(f'      {party}: ${amount:,.2f}')
                    else:
                        # 显示所有字段（截断长文本）
                        for key, value in list(data.items())[:5]:
                            str_value = str(value)
                            if len(str_value) > 50:
                                str_value = str_value[:50] + '...'
                            print(f'    {key}: {str_value}')

    print('\n' + '='*70)
    print('✅ 状态检查完成')
    print('='*70)
    print()

if __name__ == '__main__':
    main()
