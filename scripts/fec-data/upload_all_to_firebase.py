#!/usr/bin/env python3
"""
完整的FEC数据上传到Firebase

这个脚本将:
1. 解析所有下载的FEC数据文件
2. 上传所有原始数据到Firestore各collection
3. 构建处理后的数据（公司索引、汇总等）
4. 记录元数据
5. 清理本地文件（可选）
"""

import sys
import re
import time
from pathlib import Path
from datetime import datetime
from collections import defaultdict
import subprocess

# 尝试导入Firebase
try:
    import firebase_admin
    from firebase_admin import credentials, firestore
    from google.cloud import firestore as gcloud_firestore
except ImportError:
    print('❌ Firebase库未安装')
    print('请运行: pip install firebase-admin google-cloud-firestore')
    sys.exit(1)

# 配置
DATA_DIR = Path(__file__).parent / 'raw_data'
PROJECT_ID = 'stanseproject'
BATCH_SIZE = 200  # Firestore批次大小（降低以避免配额问题）
DELETE_LOCAL_AFTER_UPLOAD = False  # 上传后是否删除本地文件
DELAY_BETWEEN_BATCHES = 0.5  # 批次之间延迟（秒）
SKIP_IF_EXISTS = True  # 如果文档已存在则跳过

# 全局变量
db = None

def init_firestore():
    """初始化Firestore连接"""
    global db
    print('\n🔧 初始化Firestore连接...')

    try:
        if not firebase_admin._apps:
            try:
                # 使用gcloud access token
                result = subprocess.run(
                    ['gcloud', 'auth', 'print-access-token'],
                    capture_output=True, text=True, check=True
                )
                access_token = result.stdout.strip()

                from google.oauth2 import credentials as oauth_creds
                cred = oauth_creds.Credentials(access_token)
                firebase_admin.initialize_app(cred, options={'projectId': PROJECT_ID})
                print('  ✓ 使用gcloud access token认证')

            except subprocess.CalledProcessError:
                firebase_admin.initialize_app(options={'projectId': PROJECT_ID})
                print('  ✓ 使用Application Default Credentials')

        db = firestore.client()

        # 测试连接
        test_ref = db.collection('_connection_test').document('test')
        test_ref.set({'timestamp': datetime.utcnow()})
        test_ref.delete()

        print(f'✅ Firestore已连接 (项目: {PROJECT_ID})')
        return db

    except Exception as e:
        print(f'❌ Firestore连接失败: {e}')
        print('\n💡 请运行: gcloud auth login')
        sys.exit(1)


def normalize_company_name(name):
    """标准化公司名称用于匹配"""
    if not name:
        return ''
    normalized = name.lower()
    # 移除常见后缀
    suffixes = ['corporation', 'corp', 'inc', 'incorporated', 'company', 'co',
                'llc', 'lp', 'ltd', 'limited', 'political action committee', 'pac']
    for suffix in suffixes:
        normalized = re.sub(rf'\b{suffix}\b\.?', '', normalized)
    # 移除标点和多余空格
    normalized = re.sub(r'[^\w\s]', '', normalized)
    normalized = re.sub(r'\s+', '', normalized).strip()
    return normalized


def upload_committees(year, year_suffix):
    """上传委员会数据到 fec_raw_committees"""
    collection_name = 'fec_raw_committees'
    file_path = DATA_DIR / 'committees' / 'cm.txt'

    if not file_path.exists():
        print(f'⚠️  文件不存在: {file_path}')
        return 0

    print(f'\n📤 上传委员会数据 ({year})...')

    uploaded = 0
    batch = db.batch()
    batch_count = 0

    with open(file_path, 'r', encoding='latin-1') as f:
        for line in f:
            fields = line.strip().split('|')
            if len(fields) < 15:
                continue

            committee_id = fields[0]
            if not committee_id:
                continue

            doc_id = f'{committee_id}_{year}'
            doc_ref = db.collection(collection_name).document(doc_id)

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
                'data_year': year,
                'election_cycle': f'{year-1}-{year}',
                'source_file': f'cm{year_suffix}.zip',
                'uploaded_at': datetime.utcnow(),
                'last_updated': datetime.utcnow()
            }

            batch.set(doc_ref, doc_data)
            batch_count += 1
            uploaded += 1

            # 每BATCH_SIZE条提交一次
            if batch_count >= BATCH_SIZE:
                batch.commit()
                print(f'  已上传 {uploaded} 条记录...')
                time.sleep(DELAY_BETWEEN_BATCHES)  # 延迟以避免配额问题
                batch = db.batch()
                batch_count = 0

    # 提交剩余的记录
    if batch_count > 0:
        batch.commit()
        time.sleep(DELAY_BETWEEN_BATCHES)

    print(f'✅ 成功上传 {uploaded} 条委员会记录')
    return uploaded


def upload_candidates(year, year_suffix):
    """上传候选人数据到 fec_raw_candidates"""
    collection_name = 'fec_raw_candidates'
    file_path = DATA_DIR / 'candidates' / 'cn.txt'

    if not file_path.exists():
        print(f'⚠️  文件不存在: {file_path}')
        return 0

    print(f'\n📤 上传候选人数据 ({year})...')

    uploaded = 0
    batch = db.batch()
    batch_count = 0

    with open(file_path, 'r', encoding='latin-1') as f:
        for line in f:
            fields = line.strip().split('|')
            if len(fields) < 15:
                continue

            candidate_id = fields[0]
            if not candidate_id:
                continue

            doc_id = f'{candidate_id}_{year}'
            doc_ref = db.collection(collection_name).document(doc_id)

            doc_data = {
                'candidate_id': fields[0],
                'candidate_name': fields[1],
                'party_affiliation': fields[2],
                'election_year': int(fields[3]) if fields[3] else year,
                'office_sought': fields[4],
                'state': fields[5],
                'district': fields[6],
                'incumbent_challenger_status': fields[7],
                'candidate_status': fields[8],
                'principal_committee_id': fields[9],
                'street_1': fields[10],
                'street_2': fields[11],
                'city': fields[12],
                'state_full': fields[13],
                'zip': fields[14],

                # 元数据
                'data_year': year,
                'election_cycle': f'{year-1}-{year}',
                'source_file': f'cn{year_suffix}.zip',
                'uploaded_at': datetime.utcnow(),
                'last_updated': datetime.utcnow()
            }

            batch.set(doc_ref, doc_data)
            batch_count += 1
            uploaded += 1

            if batch_count >= BATCH_SIZE:
                batch.commit()
                print(f'  已上传 {uploaded} 条记录...')
                batch = db.batch()
                batch_count = 0

    if batch_count > 0:
        batch.commit()

    print(f'✅ 成功上传 {uploaded} 条候选人记录')
    return uploaded


def upload_contributions_pac_to_candidate(year, year_suffix):
    """上传PAC对候选人捐款数据到 fec_raw_contributions_pac_to_candidate"""
    collection_name = 'fec_raw_contributions_pac_to_candidate'

    # FEC使用不同的文件名
    file_path = DATA_DIR / 'contributions' / 'itpas2.txt'
    if not file_path.exists():
        file_path = DATA_DIR / 'contributions' / 'pas2.txt'

    if not file_path.exists():
        print(f'⚠️  文件不存在: {file_path}')
        return 0

    print(f'\n📤 上传PAC捐款数据 ({year})...')

    uploaded = 0
    batch = db.batch()
    batch_count = 0

    with open(file_path, 'r', encoding='latin-1') as f:
        for line in f:
            fields = line.strip().split('|')
            if len(fields) < 17:
                continue

            committee_id = fields[0]
            candidate_id = fields[16]
            if not committee_id or not candidate_id:
                continue

            # 使用auto-generated ID
            doc_ref = db.collection(collection_name).document()

            # 解析金额（以美分为单位）
            try:
                amount_str = fields[14]
                amount = int(float(amount_str) * 100) if amount_str else 0
            except (ValueError, IndexError):
                amount = 0

            doc_data = {
                'committee_id': fields[0],
                'amendment_indicator': fields[1],
                'report_type': fields[2],
                'primary_general_indicator': fields[3],
                'image_number': fields[4],
                'transaction_type': fields[5],
                'entity_type': fields[6],
                'contributor_name': fields[7],
                'city': fields[8],
                'state': fields[9],
                'zip': fields[10],
                'employer': fields[11],
                'occupation': fields[12],
                'transaction_date': fields[13],
                'transaction_amount': amount,
                'other_id': fields[15],
                'candidate_id': fields[16],
                'transaction_id': fields[17] if len(fields) > 17 else '',
                'file_number': fields[18] if len(fields) > 18 else '',
                'memo_code': fields[19] if len(fields) > 19 else '',
                'memo_text': fields[20] if len(fields) > 20 else '',

                # 元数据
                'data_year': year,
                'election_cycle': f'{year-1}-{year}',
                'source_file': f'pas2{year_suffix}.zip',
                'uploaded_at': datetime.utcnow(),
                'last_updated': datetime.utcnow()
            }

            batch.set(doc_ref, doc_data)
            batch_count += 1
            uploaded += 1

            if batch_count >= BATCH_SIZE:
                batch.commit()
                print(f'  已上传 {uploaded} 条记录...')
                batch = db.batch()
                batch_count = 0

    if batch_count > 0:
        batch.commit()

    print(f'✅ 成功上传 {uploaded} 条PAC捐款记录')
    return uploaded


def build_company_index():
    """构建公司索引 - fec_company_index"""
    print('\n🔨 构建公司索引...')

    # 从所有委员会记录中提取公司名称
    companies = defaultdict(lambda: {
        'original_names': set(),
        'committee_ids': defaultdict(set)
    })

    # 查询所有委员会
    committees_ref = db.collection('fec_raw_committees')
    docs = committees_ref.stream()

    count = 0
    for doc in docs:
        data = doc.to_dict()
        connected_org = data.get('connected_org_name', '')
        committee_id = data.get('committee_id', '')
        data_year = data.get('data_year', 0)

        if connected_org and committee_id:
            normalized = normalize_company_name(connected_org)
            if normalized:
                companies[normalized]['original_names'].add(connected_org)
                companies[normalized]['committee_ids'][committee_id].add(data_year)

        count += 1
        if count % 1000 == 0:
            print(f'  已处理 {count} 条委员会记录...')

    # 上传公司索引
    print(f'\n  上传 {len(companies)} 个公司索引...')
    batch = db.batch()
    batch_count = 0
    uploaded = 0

    for normalized_name, info in companies.items():
        doc_ref = db.collection('fec_company_index').document(normalized_name)

        # 提取搜索关键词
        search_keywords = set()
        for name in info['original_names']:
            words = re.findall(r'\w+', name.lower())
            search_keywords.update(words)
        search_keywords.add(normalized_name)

        # 格式化committee_ids
        committee_ids_list = []
        for cid, years in info['committee_ids'].items():
            committee_ids_list.append({
                'committee_id': cid,
                'years': sorted(list(years), reverse=True)
            })

        doc_data = {
            'normalized_name': normalized_name,
            'original_names': list(info['original_names']),
            'search_keywords': list(search_keywords),
            'committee_ids': committee_ids_list,
            'total_committees': len(committee_ids_list),
            'created_at': datetime.utcnow(),
            'last_updated': datetime.utcnow()
        }

        batch.set(doc_ref, doc_data)
        batch_count += 1
        uploaded += 1

        if batch_count >= BATCH_SIZE:
            batch.commit()
            batch = db.batch()
            batch_count = 0

    if batch_count > 0:
        batch.commit()

    print(f'✅ 成功构建 {uploaded} 个公司索引')
    return uploaded


def calculate_company_summaries(year):
    """计算每个公司的政党捐款汇总 - fec_company_party_summary"""
    print(f'\n🔨 计算公司汇总 ({year})...')

    # 1. 读取公司索引
    company_index = {}
    index_ref = db.collection('fec_company_index')
    for doc in index_ref.stream():
        data = doc.to_dict()
        normalized = data['normalized_name']
        company_index[normalized] = data

    print(f'  找到 {len(company_index)} 个公司')

    # 2. 获取候选人政党映射
    candidate_parties = {}
    candidates_ref = db.collection('fec_raw_candidates').where('data_year', '==', year)
    for doc in candidates_ref.stream():
        data = doc.to_dict()
        candidate_parties[data['candidate_id']] = data.get('party_affiliation', 'UNKNOWN')

    print(f'  找到 {len(candidate_parties)} 个候选人')

    # 3. 计算每个公司的捐款汇总
    summaries_uploaded = 0
    batch = db.batch()
    batch_count = 0

    for normalized_name, company_data in company_index.items():
        # 获取该公司的所有PAC ID
        committee_ids = [item['committee_id'] for item in company_data['committee_ids']]

        if not committee_ids:
            continue

        # 查询这些PAC的所有捐款
        contributions_ref = db.collection('fec_raw_contributions_pac_to_candidate') \
            .where('committee_id', 'in', committee_ids[:10]) \
            .where('data_year', '==', year)

        party_totals = defaultdict(lambda: {
            'total_amount': 0,
            'contribution_count': 0,
            'recipients': defaultdict(int)
        })

        for doc in contributions_ref.stream():
            data = doc.to_dict()
            candidate_id = data.get('candidate_id')
            amount = data.get('transaction_amount', 0)

            if candidate_id and amount > 0:
                party = candidate_parties.get(candidate_id, 'UNKNOWN')
                party_totals[party]['total_amount'] += amount
                party_totals[party]['contribution_count'] += 1
                party_totals[party]['recipients'][candidate_id] += amount

        if not party_totals:
            continue

        # 构建汇总文档
        party_totals_formatted = {}
        total_contributed = 0
        total_contributions = 0

        for party, info in party_totals.items():
            # Top recipients
            top_recipients = sorted(
                info['recipients'].items(),
                key=lambda x: x[1],
                reverse=True
            )[:5]

            party_totals_formatted[party] = {
                'total_amount': info['total_amount'],
                'contribution_count': info['contribution_count'],
                'top_recipients': [
                    {'candidate_id': cid, 'amount': amt}
                    for cid, amt in top_recipients
                ]
            }

            total_contributed += info['total_amount']
            total_contributions += info['contribution_count']

        # 上传汇总
        doc_id = f'{normalized_name}_{year}'
        doc_ref = db.collection('fec_company_party_summary').document(doc_id)

        doc_data = {
            'company_name': company_data['original_names'][0],
            'normalized_name': normalized_name,
            'data_year': year,
            'election_cycle': f'{year-1}-{year}',
            'party_totals': party_totals_formatted,
            'total_contributed': total_contributed,
            'total_contributions': total_contributions,
            'committee_ids': committee_ids,
            'calculated_at': datetime.utcnow(),
            'last_updated': datetime.utcnow()
        }

        batch.set(doc_ref, doc_data)
        batch_count += 1
        summaries_uploaded += 1

        if batch_count >= BATCH_SIZE:
            batch.commit()
            print(f'  已上传 {summaries_uploaded} 个公司汇总...')
            batch = db.batch()
            batch_count = 0

    if batch_count > 0:
        batch.commit()

    print(f'✅ 成功计算 {summaries_uploaded} 个公司汇总')
    return summaries_uploaded


def record_metadata(data_type, year, year_suffix, records_count):
    """记录上传元数据到 fec_data_metadata"""
    doc_id = f'{data_type}_{year}'
    doc_ref = db.collection('fec_data_metadata').document(doc_id)

    doc_data = {
        'data_type': data_type,
        'data_year': year,
        'election_cycle': f'{year-1}-{year}',
        'source_file': f'{data_type}{year_suffix}.zip',
        'source_url': f'https://www.fec.gov/files/bulk-downloads/{year}/{data_type}{year_suffix}.zip',
        'records_count': records_count,
        'upload_completed_at': datetime.utcnow(),
        'upload_status': 'completed'
    }

    doc_ref.set(doc_data)


def cleanup_local_files():
    """清理本地数据文件"""
    if not DELETE_LOCAL_AFTER_UPLOAD:
        print('\n💡 本地文件保留（DELETE_LOCAL_AFTER_UPLOAD=False）')
        return

    print('\n🧹 清理本地文件...')
    import shutil

    if DATA_DIR.exists():
        shutil.rmtree(DATA_DIR)
        print('✅ 本地文件已删除')


def main():
    """主函数"""
    print('\n' + '='*70)
    print('🚀 FEC数据完整上传到Firebase')
    print('='*70)

    # 1. 初始化Firebase
    init_firestore()

    # 2. 检查数据目录
    if not DATA_DIR.exists():
        print(f'\n❌ 数据目录不存在: {DATA_DIR}')
        print('请先运行: python3 download_fec_data.py')
        sys.exit(1)

    # 定义要处理的年份
    years_to_process = [
        (2024, '24'),
        (2022, '22'),
        (2020, '20'),
        (2018, '18'),
        (2016, '16'),
    ]

    # 3. 上传每年的数据
    for year, year_suffix in years_to_process:
        print(f'\n{"="*70}')
        print(f'处理 {year} 年数据')
        print(f'{"="*70}')

        # 上传原始数据
        committees_count = upload_committees(year, year_suffix)
        candidates_count = upload_candidates(year, year_suffix)
        contributions_count = upload_contributions_pac_to_candidate(year, year_suffix)

        # 记录元数据
        record_metadata('committees', year, year_suffix, committees_count)
        record_metadata('candidates', year, year_suffix, candidates_count)
        record_metadata('contributions', year, year_suffix, contributions_count)

    # 4. 构建公司索引（只需要运行一次，因为它会汇总所有年份）
    build_company_index()

    # 5. 计算每年的公司汇总
    for year, _ in years_to_process:
        calculate_company_summaries(year)

    # 6. 清理本地文件
    cleanup_local_files()

    print('\n' + '='*70)
    print('✅ 所有数据上传完成！')
    print('='*70)
    print('\n💡 下一步:')
    print('  1. 访问 Firebase Console 确认数据')
    print('  2. 构建前端查询API')
    print('  3. 设置定期更新计划')
    print()


if __name__ == '__main__':
    main()
