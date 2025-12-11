#!/usr/bin/env python3
"""
测试Firebase上传 - 上传少量2024年FEC数据到Firestore

这个脚本测试：
1. Firebase连接
2. 数据解析
3. 小规模上传（前100条记录）
4. 查询验证
"""

import sys
from pathlib import Path
from datetime import datetime

# 尝试导入Firebase
try:
    import firebase_admin
    from firebase_admin import credentials, firestore
    from google.cloud import firestore as gcloud_firestore
except ImportError:
    print('❌ Firebase库未安装')
    print('请运行: pip install firebase-admin google-cloud-firestore')
    sys.exit(1)

# 数据目录
DATA_DIR = Path(__file__).parent / 'raw_data'
PROJECT_ID = 'stanseproject'

def init_firestore():
    """初始化Firestore使用gcloud认证"""
    print('🔧 初始化Firestore连接...')

    try:
        # 尝试多种认证方式
        if not firebase_admin._apps:
            try:
                # 方法1: 尝试使用Application Default Credentials
                import os
                import subprocess

                # 先尝试用gcloud auth application-default print-access-token
                try:
                    result = subprocess.run(
                        ['gcloud', 'auth', 'print-access-token'],
                        capture_output=True, text=True, check=True
                    )
                    access_token = result.stdout.strip()

                    # 使用access token创建临时凭据
                    from google.oauth2 import credentials as oauth_creds
                    cred = oauth_creds.Credentials(access_token)
                    firebase_admin.initialize_app(cred, options={'projectId': PROJECT_ID})
                    print('  ✓ 使用gcloud access token认证')

                except subprocess.CalledProcessError:
                    # 如果失败，尝试使用默认凭据
                    firebase_admin.initialize_app(options={'projectId': PROJECT_ID})
                    print('  ✓ 使用Application Default Credentials')

            except Exception as e:
                print(f'  ⚠️  认证警告: {e}')
                # 最后尝试直接初始化
                firebase_admin.initialize_app(options={'projectId': PROJECT_ID})

        db = firestore.client()

        # 测试连接
        test_ref = db.collection('_connection_test').document('test')
        test_ref.set({'timestamp': datetime.utcnow()})
        test_ref.delete()

        print(f'✅ Firestore已连接 (项目: {PROJECT_ID})')
        return db
    except Exception as e:
        print(f'❌ Firestore连接失败: {e}')
        print('\n💡 请运行以下命令：')
        print('   gcloud auth application-default login')
        print('   gcloud config set project stanseproject')
        sys.exit(1)

def test_upload_committees(db, limit=10):
    """
    测试上传委员会数据（前limit条）

    集合名称: fec_raw_committees
    """
    print(f'\n📤 测试上传委员会数据（前{limit}条）...')

    cm_file = DATA_DIR / 'committees' / 'cm.txt'
    if not cm_file.exists():
        print(f'❌ 文件不存在: {cm_file}')
        return

    uploaded = 0
    batch = db.batch()

    with open(cm_file, 'r', encoding='latin-1') as f:
        for i, line in enumerate(f):
            if uploaded >= limit:
                break

            fields = line.strip().split('|')
            if len(fields) < 15:
                continue

            committee_id = fields[0]
            if not committee_id:
                continue

            # 构建文档
            doc_id = f'{committee_id}_2024'
            doc_ref = db.collection('fec_raw_committees').document(doc_id)

            doc_data = {
                'committee_id': fields[0],
                'committee_name': fields[1],
                'treasurer_name': fields[2],
                'street_1': fields[3],
                'street_2': fields[4],
                'city': fields[5],
                'state': fields[6],
                'zip': fields[7],
                'designation': fields[8],
                'committee_type': fields[9],
                'party': fields[10],
                'filing_frequency': fields[11],
                'interest_group_category': fields[12],
                'connected_org_name': fields[13],
                'candidate_id': fields[14],

                # 元数据
                'data_year': 2024,
                'election_cycle': '2023-2024',
                'source_file': 'cm24.zip',
                'uploaded_at': datetime.utcnow(),
                'last_updated': datetime.utcnow()
            }

            batch.set(doc_ref, doc_data)
            uploaded += 1

            if uploaded % 10 == 0:
                print(f'  已准备 {uploaded} 条记录...')

    # 提交批次
    try:
        batch.commit()
        print(f'✅ 成功上传 {uploaded} 条委员会记录')
    except Exception as e:
        print(f'❌ 上传失败: {e}')

def test_query_committees(db):
    """测试查询刚上传的数据"""
    print('\n🔍 测试查询委员会数据...')

    try:
        docs = db.collection('fec_raw_committees') \
            .where('data_year', '==', 2024) \
            .limit(5) \
            .get()

        count = 0
        for doc in docs:
            data = doc.to_dict()
            print(f'  {data["committee_id"]}: {data["committee_name"]}')
            if data.get('connected_org_name'):
                print(f'    → Connected to: {data["connected_org_name"]}')
            count += 1

        print(f'\n✅ 查询成功，找到 {count} 条记录')
    except Exception as e:
        print(f'❌ 查询失败: {e}')

def test_upload_company_summary(db):
    """
    测试上传公司汇总数据（从本地计算的结果）

    集合名称: fec_company_party_summary
    """
    print('\n📤 测试上传公司汇总数据...')

    # 使用之前test_data_linking.py计算的结果
    test_summary = {
        'company_name': 'Hallmark Cards',
        'normalized_name': 'hallmarkcards',
        'data_year': 2024,
        'election_cycle': '2023-2024',

        'party_totals': {
            'DEM': {
                'total_amount': 4350000,  # $43,500
                'contribution_count': 18,
                'top_recipients': []
            },
            'REP': {
                'total_amount': 3650000,  # $36,500
                'contribution_count': 15,
                'top_recipients': []
            }
        },

        'total_contributed': 8000000,  # $80,000
        'total_contributions': 33,
        'committee_ids': ['C00000059'],

        'calculated_at': datetime.utcnow(),
        'last_updated': datetime.utcnow()
    }

    try:
        doc_ref = db.collection('fec_company_party_summary') \
            .document('hallmarkcards_2024')
        doc_ref.set(test_summary)
        print('✅ 成功上传Hallmark Cards汇总数据')
    except Exception as e:
        print(f'❌ 上传失败: {e}')

def test_query_summary(db):
    """测试查询公司汇总"""
    print('\n🔍 测试查询公司汇总...')

    try:
        doc = db.collection('fec_company_party_summary') \
            .document('hallmarkcards_2024') \
            .get()

        if doc.exists:
            data = doc.to_dict()
            print(f'  公司: {data["company_name"]}')
            print(f'  总捐款: ${data["total_contributed"] / 100:,.2f}')
            print(f'  政党分布:')
            for party, info in data['party_totals'].items():
                amount = info['total_amount'] / 100
                pct = (info['total_amount'] / data['total_contributed']) * 100
                print(f'    {party}: ${amount:,.2f} ({pct:.1f}%)')
            print('\n✅ 查询汇总数据成功')
        else:
            print('❌ 文档不存在')
    except Exception as e:
        print(f'❌ 查询失败: {e}')

def main():
    """主测试流程"""
    print('\n' + '='*70)
    print('🧪 Firebase FEC数据上传测试')
    print('='*70)

    # 1. 初始化Firestore
    db = init_firestore()

    # 2. 测试上传委员会原始数据（前10条）
    test_upload_committees(db, limit=10)

    # 3. 测试查询委员会数据
    test_query_committees(db)

    # 4. 测试上传公司汇总数据
    test_upload_company_summary(db)

    # 5. 测试查询汇总数据
    test_query_summary(db)

    print('\n' + '='*70)
    print('✅ 所有测试完成！')
    print('='*70)
    print('\n💡 下一步:')
    print('  1. 检查Firebase Console确认数据已上传')
    print('  2. 运行完整的parse_and_upload.py上传所有数据')
    print('  3. 构建前端查询API')
    print()

if __name__ == '__main__':
    main()
