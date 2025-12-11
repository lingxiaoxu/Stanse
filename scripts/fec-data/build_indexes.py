#!/usr/bin/env python3
"""
构建FEC索引和汇总表
- fec_company_index: 从committees提取公司索引
- fec_company_party_summary: 按年份汇总每个公司的政党捐款
"""

import sys
import os
import re
import time
import random
import subprocess
from pathlib import Path
from datetime import datetime
from collections import defaultdict

try:
    import firebase_admin
    from firebase_admin import credentials, firestore
    from google.api_core.exceptions import ResourceExhausted, DeadlineExceeded
except ImportError:
    print('❌ Firebase库未安装')
    sys.exit(1)

# 配置
PROJECT_ID = 'stanseproject'
BATCH_SIZE = 50
MIN_DELAY = 3.0
MAX_DELAY = 300.0
INITIAL_RETRY_DELAY = 30.0

db = None

def init_firestore():
    """初始化Firestore"""
    global db
    print('\n🔧 初始化Firestore连接...')

    try:
        if not firebase_admin._apps:
            access_token = os.environ.get('GCLOUD_ACCESS_TOKEN')

            if not access_token:
                print('  ℹ️  从gcloud获取access token...')
                result = subprocess.run(
                    ['gcloud', 'auth', 'print-access-token'],
                    capture_output=True, text=True, check=True
                )
                access_token = result.stdout.strip()
            else:
                print('  ✓ 使用环境变量中的access token')

            from google.oauth2 import credentials as oauth_creds
            cred = oauth_creds.Credentials(access_token)
            firebase_admin.initialize_app(cred, options={'projectId': PROJECT_ID})

        db = firestore.client()
        print(f'✅ Firestore已连接 (项目: {PROJECT_ID})')
        return db
    except Exception as e:
        print(f'❌ 失败: {e}')
        sys.exit(1)

def commit_with_retry(batch, retry_count=0, max_retries=10):
    """提交批次，带指数退避重试"""
    try:
        batch.commit()
        return True
    except (ResourceExhausted, DeadlineExceeded) as e:
        if retry_count >= max_retries:
            print(f'  ❌ 达到最大重试次数 ({max_retries})')
            return False

        delay = min(
            INITIAL_RETRY_DELAY * (2 ** retry_count) + random.uniform(0, 5),
            MAX_DELAY
        )

        print(f'  ⚠️  配额限制，等待 {delay:.1f} 秒后重试（第 {retry_count + 1}/{max_retries} 次）...')
        time.sleep(delay)

        return commit_with_retry(batch, retry_count + 1, max_retries)
    except Exception as e:
        print(f'  ❌ 未知错误: {e}')
        return False

def normalize_company_name(name):
    """标准化公司名称用于索引"""
    if not name:
        return ''
    normalized = name.lower()
    suffixes = ['corporation', 'corp', 'inc', 'incorporated', 'company', 'co',
                'llc', 'lp', 'ltd', 'limited', 'political action committee', 'pac']
    for suffix in suffixes:
        normalized = re.sub(rf'\b{suffix}\b\.?', '', normalized)
    normalized = re.sub(r'[^\w\s]', '', normalized)
    normalized = re.sub(r'\s+', ' ', normalized).strip()
    return normalized

def build_company_index():
    """从committees构建company_index"""
    print(f'\n{"="*70}')
    print('🏗️  步骤1: 构建Company Index')
    print(f'{"="*70}')

    # 从fec_raw_committees提取所有唯一公司
    companies = {}

    print('  📖 读取committees数据...')
    committees_ref = db.collection('fec_raw_committees')

    # 分页读取以避免内存问题
    page_size = 1000
    last_doc = None
    total_processed = 0

    while True:
        query = committees_ref.order_by('__name__').limit(page_size)
        if last_doc:
            query = query.start_after(last_doc)

        docs = list(query.stream())
        if not docs:
            break

        for doc in docs:
            data = doc.to_dict()
            connected_org = data.get('connected_org_name', '').strip()
            committee_id = data.get('committee_id')
            year = data.get('data_year')

            if connected_org and committee_id:
                normalized = normalize_company_name(connected_org)

                if normalized not in companies:
                    companies[normalized] = {
                        'company_name': connected_org,
                        'normalized_name': normalized,
                        'committee_ids': [],
                        'search_keywords': set()
                    }

                # 避免重复
                if not any(c['committee_id'] == committee_id and c['year'] == year
                          for c in companies[normalized]['committee_ids']):
                    companies[normalized]['committee_ids'].append({
                        'committee_id': committee_id,
                        'year': year
                    })

                # 生成搜索关键词
                words = normalized.split()
                companies[normalized]['search_keywords'].update(words)

            total_processed += 1

        last_doc = docs[-1]
        print(f'  处理 {total_processed} 条committees...')

    print(f'  ✅ 提取到 {len(companies)} 个唯一公司')

    # 上传到fec_company_index
    print('  📤 上传到fec_company_index...')
    batch = db.batch()
    batch_count = 0
    uploaded = 0

    for normalized_name, company_data in companies.items():
        doc_ref = db.collection('fec_company_index').document(normalized_name)

        doc_data = {
            'company_name': company_data['company_name'],
            'normalized_name': normalized_name,
            'committee_ids': company_data['committee_ids'],
            'search_keywords': list(company_data['search_keywords']),
            'created_at': datetime.utcnow(),
            'last_updated': datetime.utcnow()
        }

        batch.set(doc_ref, doc_data)
        batch_count += 1

        if batch_count >= BATCH_SIZE:
            if commit_with_retry(batch):
                uploaded += batch_count
                print(f'  ✓ 已上传 {uploaded}/{len(companies)} 个公司索引')
                time.sleep(MIN_DELAY)
                batch = db.batch()
                batch_count = 0
            else:
                print(f'  ❌ 上传失败，已完成 {uploaded} 个')
                return uploaded

    if batch_count > 0:
        if commit_with_retry(batch):
            uploaded += batch_count

    print(f'✅ Company Index构建完成: {uploaded} 个公司')
    return uploaded

def build_company_summaries():
    """构建company_party_summary"""
    print(f'\n{"="*70}')
    print('🏗️  步骤2: 构建Company Party Summaries')
    print(f'{"="*70}')

    # 从company_index获取所有公司
    print('  📖 读取company_index...')
    companies_ref = db.collection('fec_company_index')
    companies = list(companies_ref.stream())

    print(f'  找到 {len(companies)} 个公司')

    uploaded = 0
    skipped = 0

    for idx, company_doc in enumerate(companies, 1):
        company_data = company_doc.to_dict()
        normalized_name = company_data['normalized_name']
        committee_ids = [c['committee_id'] for c in company_data['committee_ids']]

        print(f'\n  [{idx}/{len(companies)}] 处理: {company_data["company_name"]}')
        print(f'    PACs: {len(committee_ids)} 个')

        # 按年份汇总
        years_data = defaultdict(lambda: defaultdict(lambda: {'total_amount': 0, 'contribution_count': 0}))

        # 获取该公司所有PAC的捐款
        contributions_ref = db.collection('fec_raw_contributions_pac_to_candidate')

        for committee_id in committee_ids:
            query = contributions_ref.where('committee_id', '==', committee_id)
            contributions = list(query.stream())

            for contrib_doc in contributions:
                contrib_data = contrib_doc.to_dict()
                year = contrib_data.get('data_year')
                candidate_id = contrib_data.get('candidate_id')
                amount = contrib_data.get('transaction_amount', 0)

                if not year or not candidate_id:
                    continue

                # 查找候选人的政党
                cand_ref = db.collection('fec_raw_candidates').document(f'{candidate_id}_{year}')
                cand_doc = cand_ref.get()

                if cand_doc.exists:
                    cand_data = cand_doc.to_dict()
                    party = cand_data.get('party_affiliation', 'Unknown').strip()

                    if not party:
                        party = 'Unknown'

                    years_data[year][party]['total_amount'] += amount
                    years_data[year][party]['contribution_count'] += 1

        if not years_data:
            print(f'    ⚠️  无捐款数据，跳过')
            skipped += 1
            continue

        # 为每个年份创建汇总文档
        batch = db.batch()
        batch_count = 0

        for year, party_data in years_data.items():
            doc_id = f'{normalized_name}_{year}'
            doc_ref = db.collection('fec_company_party_summary').document(doc_id)

            total_contributed = sum(p['total_amount'] for p in party_data.values())

            doc_data = {
                'company_name': company_data['company_name'],
                'normalized_name': normalized_name,
                'data_year': year,
                'party_totals': dict(party_data),
                'total_contributed': total_contributed,
                'created_at': datetime.utcnow(),
                'last_updated': datetime.utcnow()
            }

            batch.set(doc_ref, doc_data)
            batch_count += 1

        if batch_count > 0:
            if commit_with_retry(batch):
                uploaded += batch_count
                print(f'    ✓ 上传 {batch_count} 个年份的汇总')
                time.sleep(MIN_DELAY)
            else:
                print(f'    ❌ 上传失败')

    print(f'\n✅ Company Summaries构建完成:')
    print(f'   上传: {uploaded} 个汇总')
    print(f'   跳过: {skipped} 个公司（无数据）')
    return uploaded

def main():
    """主函数"""
    print('\n' + '='*70)
    print('🚀 FEC索引和汇总表构建')
    print('='*70)

    init_firestore()

    # 步骤1: 构建公司索引
    company_count = build_company_index()

    # 步骤2: 构建公司汇总
    summary_count = build_company_summaries()

    print('\n' + '='*70)
    print('✅ 构建完成！')
    print('='*70)
    print(f'\n📊 统计:')
    print(f'  Company Index: {company_count} 个公司')
    print(f'  Company Summaries: {summary_count} 个汇总')
    print()

if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print('\n\n⚠️  用户中断')
        sys.exit(0)
    except Exception as e:
        print(f'\n❌ 错误: {e}')
        import traceback
        traceback.print_exc()
        sys.exit(1)
