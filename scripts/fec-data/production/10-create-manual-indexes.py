#!/usr/bin/env python3
"""
为9家已验证公司手动创建索引
快速完成，让查询功能立即可用
"""

import sys
import os
import re
import subprocess
from pathlib import Path
from collections import defaultdict
from datetime import datetime

try:
    import firebase_admin
    from firebase_admin import credentials, firestore
except ImportError:
    print('❌ Firebase库未安装')
    sys.exit(1)

PROJECT_ID = 'stanseproject'
db = None

# 9家已验证的公司（使用与深度验证相同的名称）
VERIFIED_COMPANIES = [
    'JPMORGAN',
    'GOLDMAN SACHS',
    'MICROSOFT',
    'GOOGLE',
    'AMAZON',
    'APPLE',
    'META',
    'BOEING',
    'LOCKHEED MARTIN'
]

def init_firestore():
    """初始化Firestore"""
    global db
    print('🔧 初始化Firestore连接...')

    try:
        if not firebase_admin._apps:
            access_token = os.environ.get('GCLOUD_ACCESS_TOKEN')

            if not access_token:
                result = subprocess.run(
                    ['gcloud', 'auth', 'print-access-token'],
                    capture_output=True, text=True, check=True
                )
                access_token = result.stdout.strip()

            from google.oauth2 import credentials as oauth_creds
            cred = oauth_creds.Credentials(access_token)
            firebase_admin.initialize_app(cred, options={'projectId': PROJECT_ID})

        db = firestore.client()
        print(f'✅ Firestore已连接 (项目: {PROJECT_ID})\n')
        return db
    except Exception as e:
        print(f'❌ 失败: {e}')
        sys.exit(1)

def normalize_company_name(name):
    """标准化公司名称用于索引"""
    if not name:
        return ''
    normalized = name.lower()
    suffixes = ['corporation', 'corp', 'inc', 'incorporated', 'company', 'co',
                'llc', 'lp', 'ltd', 'limited', 'the', 'group', 'platforms']
    for suffix in suffixes:
        normalized = re.sub(rf'\b{suffix}\b\.?', '', normalized)
    normalized = re.sub(r'[^\w\s]', '', normalized)
    normalized = re.sub(r'\s+', ' ', normalized).strip()
    return normalized

def generate_search_keywords(name):
    """生成搜索关键词"""
    normalized = normalize_company_name(name)
    words = normalized.split()
    keywords = set()

    # 添加单个词
    for word in words:
        if len(word) >= 3:  # 只添加长度>=3的词
            keywords.add(word)

    # 添加组合词
    if len(words) >= 2:
        keywords.add(' '.join(words[:2]))  # 前两个词

    return list(keywords)

def create_company_index(company_name):
    """为单个公司创建fec_company_index记录"""
    print(f'\n📝 处理公司: {company_name}')

    # 查找该公司的所有委员会
    committees_ref = db.collection('fec_raw_committees')
    committees = []

    # 使用公司名称的多种变体查询
    company_upper = company_name.upper()

    all_docs = []
    for doc in committees_ref.stream():
        data = doc.to_dict()
        connected_org = data.get('connected_org_name', '').upper()
        committee_name = data.get('committee_name', '').upper()

        if company_upper in connected_org or company_upper in committee_name:
            all_docs.append(doc)

    if not all_docs:
        print(f'   ⚠️  未找到委员会')
        return False

    print(f'   找到 {len(all_docs)} 个委员会')

    # 收集委员会信息（包含年份）
    committee_ids_with_year = []
    committee_ids_set = set()

    for doc in all_docs:
        data = doc.to_dict()
        committee_id = data.get('committee_id')

        if committee_id and committee_id not in committee_ids_set:
            committee_ids_set.add(committee_id)

            # 从contributions查找该委员会的活跃年份
            contribs_ref = db.collection('fec_raw_contributions_pac_to_candidate')
            contribs = list(contribs_ref.where('committee_id', '==', committee_id).limit(1).stream())

            year = 2024  # 默认年份
            if contribs:
                date_str = contribs[0].to_dict().get('transaction_date', '')
                if date_str and len(date_str) >= 4:
                    try:
                        year = int(date_str[:4])
                    except:
                        year = 2024

            committee_ids_with_year.append({
                'committee_id': committee_id,
                'year': year
            })

    # 创建索引文档
    normalized_name = normalize_company_name(company_name)
    search_keywords = generate_search_keywords(company_name)

    index_doc = {
        'company_name': company_name,
        'normalized_name': normalized_name,
        'search_keywords': search_keywords,
        'committee_ids': committee_ids_with_year,
        'created_at': firestore.SERVER_TIMESTAMP,
        'updated_at': firestore.SERVER_TIMESTAMP
    }

    # 使用normalized_name作为文档ID
    doc_ref = db.collection('fec_company_index').document(normalized_name)
    doc_ref.set(index_doc)

    print(f'   ✅ 创建索引: {normalized_name}')
    print(f'   关键词: {search_keywords}')

    return True

def create_company_party_summary(company_name):
    """为单个公司创建fec_company_party_summary记录"""
    print(f'\n💰 创建政党汇总: {company_name}')

    normalized_name = normalize_company_name(company_name)

    # 从company_index获取委员会列表
    index_doc = db.collection('fec_company_index').document(normalized_name).get()

    if not index_doc.exists:
        print(f'   ⚠️  索引不存在')
        return False

    index_data = index_doc.to_dict()
    committee_ids = [c['committee_id'] for c in index_data['committee_ids']]

    # 按年份分组汇总
    years_data = defaultdict(lambda: defaultdict(lambda: {'total_amount': 0, 'contribution_count': 0}))

    for committee_id in committee_ids:
        # 获取该委员会的所有捐款
        contribs_ref = db.collection('fec_raw_contributions_pac_to_candidate')
        contribs = list(contribs_ref.where('committee_id', '==', committee_id).stream())

        for contrib in contribs:
            data = contrib.to_dict()
            candidate_id = data.get('candidate_id')
            amount = data.get('transaction_amount', 0)
            date_str = data.get('transaction_date', '')

            # 提取年份
            year = 2024
            if date_str and len(date_str) >= 4:
                try:
                    year = int(date_str[:4])
                except:
                    pass

            # 查找候选人党派
            if candidate_id:
                cand_doc = db.collection('fec_raw_candidates').where('candidate_id', '==', candidate_id).limit(1).stream()
                cand_data = None

                for c in cand_doc:
                    cand_data = c.to_dict()
                    break

                if cand_data:
                    party = cand_data.get('party_affiliation', 'UNK')

                    years_data[year][party]['total_amount'] += amount
                    years_data[year][party]['contribution_count'] += 1

    # 为每个年份创建汇总文档
    created_count = 0
    for year, party_data in years_data.items():
        total_contributed = sum(p['total_amount'] for p in party_data.values())

        party_totals = {}
        for party, info in party_data.items():
            party_totals[party] = {
                'total_amount': info['total_amount'],
                'contribution_count': info['contribution_count']
            }

        summary_doc = {
            'normalized_name': normalized_name,
            'company_name': company_name,
            'data_year': year,
            'party_totals': party_totals,
            'total_contributed': total_contributed,
            'created_at': firestore.SERVER_TIMESTAMP,
            'updated_at': firestore.SERVER_TIMESTAMP
        }

        # 文档ID: normalized_name + _ + year
        doc_id = f'{normalized_name}_{year}'
        doc_ref = db.collection('fec_company_party_summary').document(doc_id)
        doc_ref.set(summary_doc)

        created_count += 1

        # 显示该年的汇总
        print(f'   {year}年: ${total_contributed/100:,.2f}')
        for party in sorted(party_totals.keys()):
            amount = party_totals[party]['total_amount']
            count = party_totals[party]['contribution_count']
            pct = (amount / total_contributed * 100) if total_contributed > 0 else 0
            print(f'      {party}: ${amount/100:,.2f} ({pct:.1f}%) - {count}笔')

    print(f'   ✅ 创建了 {created_count} 个年份的汇总')
    return True

def main():
    """主函数"""
    print('\n' + '='*80)
    print('🚀 手动为9家验证公司创建索引')
    print('='*80 + '\n')

    init_firestore()

    success_count = 0

    for company in VERIFIED_COMPANIES:
        try:
            # 创建company_index
            if create_company_index(company):
                # 创建company_party_summary
                if create_company_party_summary(company):
                    success_count += 1
        except Exception as e:
            print(f'   ❌ 错误: {e}')
            import traceback
            traceback.print_exc()

    print('\n' + '='*80)
    print(f'✅ 完成！成功创建 {success_count}/{len(VERIFIED_COMPANIES)} 个公司的索引')
    print('='*80 + '\n')

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
