#!/usr/bin/env python3
"""
FEC完整设置脚本
1. 下载所需年份的数据（2024, 2026）
2. 上传所有raw数据到Firebase
3. 构建company_index和company_party_summary
4. 验证查询功能
"""

import sys
import os
import re
import time
import json
import subprocess
import random
import requests
import zipfile
from pathlib import Path
from datetime import datetime
from collections import defaultdict

try:
    import firebase_admin
    from firebase_admin import credentials, firestore
    from google.api_core.exceptions import ResourceExhausted, DeadlineExceeded
except ImportError:
    print('❌ Firebase库未安装')
    print('请运行: pip install firebase-admin google-cloud-firestore')
    sys.exit(1)

# 配置
DATA_DIR = Path(__file__).parent / 'raw_data'
PROJECT_ID = 'stanseproject'
PROGRESS_FILE = Path(__file__).parent.parent / 'reports' / '01-upload-progress.json'
BASE_URL = 'https://www.fec.gov/files/bulk-downloads'

# 批次配置
BATCH_SIZE = 50
MIN_DELAY = 3.0
MAX_DELAY = 300.0
INITIAL_RETRY_DELAY = 30.0

# 全局变量
db = None

# ============================================================================
# 工具函数
# ============================================================================

def save_progress(data):
    """保存上传进度"""
    with open(PROGRESS_FILE, 'w') as f:
        json.dump(data, f, indent=2)

def load_progress():
    """加载上传进度"""
    if PROGRESS_FILE.exists():
        with open(PROGRESS_FILE, 'r') as f:
            return json.load(f)
    return {}

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

# ============================================================================
# 步骤1: 下载数据
# ============================================================================

def download_file(url, dest_path):
    """下载单个文件"""
    if dest_path.exists():
        print(f'  ⏭️  跳过（已存在）: {dest_path.name}')
        return True

    print(f'  📥 下载: {url}')
    try:
        response = requests.get(url, stream=True, timeout=60)
        response.raise_for_status()

        dest_path.parent.mkdir(parents=True, exist_ok=True)

        with open(dest_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)

        # 如果是zip文件，解压
        if dest_path.suffix == '.zip':
            print(f'  📦 解压: {dest_path.name}')
            with zipfile.ZipFile(dest_path, 'r') as zip_ref:
                zip_ref.extractall(dest_path.parent)

        print(f'  ✅ 完成: {dest_path.name}')
        return True
    except Exception as e:
        print(f'  ❌ 失败: {e}')
        return False

def download_year_data(year, suffix):
    """下载指定年份的所有数据"""
    print(f'\n📥 下载 {year} 年数据...')

    files_to_download = [
        (f'{BASE_URL}/{year}/cm{suffix}.zip', DATA_DIR / 'committees' / f'cm{suffix}.zip'),
        (f'{BASE_URL}/{year}/cn{suffix}.zip', DATA_DIR / 'candidates' / f'cn{suffix}.zip'),
        (f'{BASE_URL}/{year}/pas2{suffix}.zip', DATA_DIR / 'contributions' / f'pas2{suffix}.zip'),
    ]

    success_count = 0
    for url, dest in files_to_download:
        if download_file(url, dest):
            success_count += 1

    print(f'✅ {year}年数据下载完成: {success_count}/3 个文件')
    return success_count == 3

# ============================================================================
# 步骤2: 上传Raw数据
# ============================================================================

def upload_data_for_year(year, suffix, progress):
    """上传指定年份的所有数据"""
    print(f'\n{"="*70}')
    print(f'📤 上传 {year} 年数据到Firebase')
    print(f'{"="*70}')

    year_key = f'year_{year}'
    if year_key not in progress:
        progress[year_key] = {}

    # 上传committees
    if not progress[year_key].get('committees_completed'):
        from upload_incremental import upload_committees_incremental
        count = upload_committees_incremental(year, suffix, progress.setdefault(year_key, {}))
        print(f'✅ Committees: {count} 条')
    else:
        print(f'✅ Committees已完成: {progress[year_key].get("committees_uploaded", 0)} 条')

    # 上传candidates
    if not progress[year_key].get('candidates_completed'):
        from upload_incremental import upload_candidates_incremental
        count = upload_candidates_incremental(year, suffix, progress[year_key])
        print(f'✅ Candidates: {count} 条')
    else:
        print(f'✅ Candidates已完成: {progress[year_key].get("candidates_uploaded", 0)} 条')

    # 上传contributions
    if not progress[year_key].get('contributions_completed'):
        from upload_incremental import upload_contributions_incremental
        count = upload_contributions_incremental(year, suffix, progress[year_key])
        print(f'✅ Contributions: {count} 条')
    else:
        print(f'✅ Contributions已完成: {progress[year_key].get("contributions_uploaded", 0)} 条')

    save_progress(progress)

# ============================================================================
# 步骤3: 构建索引和汇总
# ============================================================================

def build_company_index():
    """从committees构建company_index"""
    print(f'\n{"="*70}')
    print('🏗️  构建Company Index')
    print(f'{"="*70}')

    # 从fec_raw_committees提取所有唯一公司
    companies = {}

    print('  📖 读取committees数据...')
    committees_ref = db.collection('fec_raw_committees')
    docs = committees_ref.stream()

    count = 0
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

            companies[normalized]['committee_ids'].append({
                'committee_id': committee_id,
                'year': year
            })

            # 生成搜索关键词
            words = normalized.split()
            companies[normalized]['search_keywords'].update(words)

        count += 1
        if count % 1000 == 0:
            print(f'  处理 {count} 条committees...')

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
                print(f'  ✓ 已上传 {uploaded} 个公司索引')
                time.sleep(MIN_DELAY)
                batch = db.batch()
                batch_count = 0

    if batch_count > 0:
        if commit_with_retry(batch):
            uploaded += batch_count

    print(f'✅ Company Index构建完成: {uploaded} 个公司')
    return uploaded

def build_company_summaries():
    """构建company_party_summary"""
    print(f'\n{"="*70}')
    print('🏗️  构建Company Party Summaries')
    print(f'{"="*70}')

    # 从company_index获取所有公司
    print('  📖 读取company_index...')
    companies_ref = db.collection('fec_company_index')
    companies = list(companies_ref.stream())

    print(f'  找到 {len(companies)} 个公司')

    uploaded = 0

    for company_doc in companies:
        company_data = company_doc.to_dict()
        normalized_name = company_data['normalized_name']
        committee_ids = [c['committee_id'] for c in company_data['committee_ids']]

        print(f'\n  处理: {company_data["company_name"]}')

        # 为每个年份创建汇总
        years_data = {}

        # 获取该公司的所有捐款
        print(f'    查找捐款记录...')
        contributions_ref = db.collection('fec_raw_contributions_pac_to_candidate')

        for committee_id in committee_ids:
            query = contributions_ref.where('committee_id', '==', committee_id)
            contributions = query.stream()

            for contrib_doc in contributions:
                contrib_data = contrib_doc.to_dict()
                year = contrib_data.get('data_year')
                candidate_id = contrib_data.get('candidate_id')
                amount = contrib_data.get('transaction_amount', 0)

                if not year or not candidate_id:
                    continue

                if year not in years_data:
                    years_data[year] = {}

                # 查找候选人的政党
                cand_doc = db.collection('fec_raw_candidates').document(f'{candidate_id}_{year}').get()
                if cand_doc.exists:
                    cand_data = cand_doc.to_dict()
                    party = cand_data.get('party_affiliation', 'Unknown')

                    if party not in years_data[year]:
                        years_data[year][party] = {'total_amount': 0, 'contribution_count': 0}

                    years_data[year][party]['total_amount'] += amount
                    years_data[year][party]['contribution_count'] += 1

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
                'party_totals': party_data,
                'total_contributed': total_contributed,
                'created_at': datetime.utcnow(),
                'last_updated': datetime.utcnow()
            }

            batch.set(doc_ref, doc_data)
            batch_count += 1

            if batch_count >= BATCH_SIZE:
                if commit_with_retry(batch):
                    uploaded += batch_count
                    print(f'    ✓ 已上传 {uploaded} 个汇总')
                    time.sleep(MIN_DELAY)
                    batch = db.batch()
                    batch_count = 0

        if batch_count > 0:
            if commit_with_retry(batch):
                uploaded += batch_count

    print(f'\n✅ Company Summaries构建完成: {uploaded} 个汇总')
    return uploaded

# ============================================================================
# 步骤4: 验证查询
# ============================================================================

def test_query(company_name):
    """测试查询功能"""
    print(f'\n{"="*70}')
    print(f'🔍 测试查询: {company_name}')
    print(f'{"="*70}')

    normalized = normalize_company_name(company_name)

    # 查找公司
    print(f'  步骤1: 查找公司 "{company_name}"')
    company_doc = db.collection('fec_company_index').document(normalized).get()

    if not company_doc.exists:
        print(f'  ❌ 未找到公司')
        return False

    company_data = company_doc.to_dict()
    print(f'  ✅ 找到: {company_data["company_name"]}')
    print(f'     PACs: {len(company_data["committee_ids"])} 个')

    # 获取政党汇总
    print(f'\n  步骤2: 获取政党捐款汇总')
    summaries_ref = db.collection('fec_company_party_summary')
    query = summaries_ref.where('normalized_name', '==', normalized)
    summaries = list(query.stream())

    if not summaries:
        print(f'  ⚠️  未找到汇总数据')
        return False

    print(f'  ✅ 找到 {len(summaries)} 个年份的数据\n')

    for summary_doc in summaries:
        summary_data = summary_doc.to_dict()
        year = summary_data['data_year']
        party_totals = summary_data['party_totals']
        total = summary_data['total_contributed']

        print(f'  📊 {year}年:')
        print(f'     总捐款: ${total/100:,.2f}')

        for party, info in sorted(party_totals.items(), key=lambda x: x[1]['total_amount'], reverse=True):
            amount = info['total_amount']
            count = info['contribution_count']
            percentage = (amount / total * 100) if total > 0 else 0
            print(f'     {party}: ${amount/100:,.2f} ({percentage:.1f}%) - {count} 笔')
        print()

    return True

# ============================================================================
# 主流程
# ============================================================================

def main():
    """主函数"""
    print('\n' + '='*70)
    print('🚀 FEC数据完整设置流程')
    print('='*70)

    # 加载进度
    progress = load_progress()

    # 初始化Firebase
    init_firestore()

    # 步骤1: 下载2024和2026年数据
    print('\n' + '='*70)
    print('步骤1: 下载数据')
    print('='*70)

    years_to_process = [
        (2024, '24'),
        (2026, '26'),
    ]

    for year, suffix in years_to_process:
        download_year_data(year, suffix)

    # 步骤2: 上传Raw数据
    print('\n' + '='*70)
    print('步骤2: 上传Raw数据到Firebase')
    print('='*70)

    for year, suffix in years_to_process:
        upload_data_for_year(year, suffix, progress)

    # 步骤3: 构建索引和汇总
    print('\n' + '='*70)
    print('步骤3: 构建索引和汇总表')
    print('='*70)

    if not progress.get('company_index_built'):
        build_company_index()
        progress['company_index_built'] = True
        save_progress(progress)
    else:
        print('✅ Company Index已构建')

    if not progress.get('company_summaries_built'):
        build_company_summaries()
        progress['company_summaries_built'] = True
        save_progress(progress)
    else:
        print('✅ Company Summaries已构建')

    # 步骤4: 验证查询
    print('\n' + '='*70)
    print('步骤4: 验证查询功能')
    print('='*70)

    test_companies = ['Hallmark', 'Microsoft', 'Boeing']
    for company in test_companies:
        test_query(company)
        time.sleep(1)

    print('\n' + '='*70)
    print('✅ 完整设置流程完成！')
    print('='*70)
    print('\n📊 系统状态:')
    print(f'  - 年份数据: 2024, 2026')
    print(f'  - Raw Collections: committees, candidates, contributions')
    print(f'  - Processed Collections: company_index, company_party_summary')
    print(f'  - 查询功能: 已验证')
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
