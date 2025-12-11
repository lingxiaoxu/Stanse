#!/usr/bin/env python3
"""
测试FEC查询功能
验证完整的数据链路：Company → PAC → Contributions → Candidates → Party
"""

import sys
import os
import re
import subprocess
from datetime import datetime

try:
    import firebase_admin
    from firebase_admin import credentials, firestore
except ImportError:
    print('❌ Firebase库未安装')
    sys.exit(1)

PROJECT_ID = 'stanseproject'
db = None

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
    """标准化公司名称用于查询"""
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

def search_companies(search_term):
    """搜索公司（支持模糊搜索）"""
    print(f'🔍 搜索公司: "{search_term}"')

    normalized_search = normalize_company_name(search_term)
    search_words = set(normalized_search.split())

    # 方法1: 直接匹配normalized_name
    doc_ref = db.collection('fec_company_index').document(normalized_search)
    doc = doc_ref.get()

    if doc.exists:
        return [doc]

    # 方法2: 使用search_keywords搜索
    print('  使用关键词搜索...')
    results = []
    companies_ref = db.collection('fec_company_index')

    for word in search_words:
        if len(word) < 3:  # 跳过太短的词
            continue
        query = companies_ref.where('search_keywords', 'array_contains', word)
        docs = list(query.stream())
        results.extend(docs)

    # 去重
    unique_results = {}
    for doc in results:
        if doc.id not in unique_results:
            unique_results[doc.id] = doc

    return list(unique_results.values())

def query_company(company_name):
    """查询公司的政党捐款信息"""
    print(f'\n{"="*70}')
    print(f'📊 查询公司: {company_name}')
    print(f'{"="*70}\n')

    # 步骤1: 搜索公司
    companies = search_companies(company_name)

    if not companies:
        print(f'❌ 未找到公司: {company_name}')
        return False

    if len(companies) > 1:
        print(f'找到 {len(companies)} 个匹配的公司:\n')
        for idx, company_doc in enumerate(companies, 1):
            data = company_doc.to_dict()
            print(f'  {idx}. {data["company_name"]}')
            print(f'     (PACs: {len(data["committee_ids"])} 个)')
        print()

    # 使用第一个匹配的公司
    company_doc = companies[0]
    company_data = company_doc.to_dict()
    normalized_name = company_data['normalized_name']

    print(f'✅ 公司: {company_data["company_name"]}')
    print(f'   标准化名称: {normalized_name}')
    print(f'   PACs数量: {len(company_data["committee_ids"])} 个\n')

    # 显示PAC详情
    print('📋 关联的PACs:')
    for idx, pac_info in enumerate(company_data['committee_ids'][:5], 1):
        print(f'   {idx}. {pac_info["committee_id"]} (年份: {pac_info["year"]})')
    if len(company_data['committee_ids']) > 5:
        print(f'   ... 还有 {len(company_data["committee_ids"]) - 5} 个')

    # 步骤2: 获取政党汇总
    print(f'\n{"="*70}')
    print('💰 政党捐款汇总')
    print(f'{"="*70}\n')

    summaries_ref = db.collection('fec_company_party_summary')
    query = summaries_ref.where('normalized_name', '==', normalized_name)
    summaries = list(query.stream())

    if not summaries:
        print('⚠️  未找到汇总数据')
        print('   可能原因：')
        print('   1. Contributions数据还未上传完成')
        print('   2. Company summaries还未构建')
        print('   3. 该公司的PAC没有捐款记录')
        return False

    print(f'找到 {len(summaries)} 个年份的数据:\n')

    # 按年份排序
    summaries_sorted = sorted(summaries, key=lambda x: x.to_dict()['data_year'], reverse=True)

    for summary_doc in summaries_sorted:
        summary_data = summary_doc.to_dict()
        year = summary_data['data_year']
        party_totals = summary_data['party_totals']
        total = summary_data['total_contributed']

        print(f'📅 {year}年:')
        print(f'   总捐款: ${total/100:,.2f}\n')

        # 按金额排序政党
        parties_sorted = sorted(party_totals.items(),
                               key=lambda x: x[1]['total_amount'],
                               reverse=True)

        for party, info in parties_sorted:
            amount = info['total_amount']
            count = info['contribution_count']
            percentage = (amount / total * 100) if total > 0 else 0

            # 使用颜色标记（如果终端支持）
            if party == 'DEM':
                party_display = '🔵 DEM'
            elif party == 'REP':
                party_display = '🔴 REP'
            else:
                party_display = f'⚪ {party}'

            print(f'   {party_display:12} ${amount/100:>12,.2f} ({percentage:5.1f}%) - {count:4} 笔捐款')

        print()

    return True

def test_multiple_companies():
    """测试多个知名公司"""
    print('\n' + '='*70)
    print('🧪 测试多个公司查询')
    print('='*70)

    test_companies = [
        'Hallmark',
        'Microsoft',
        'Boeing',
        'Google',
        'Amazon',
    ]

    results = {}

    for company in test_companies:
        try:
            success = query_company(company)
            results[company] = '✅' if success else '❌'
        except Exception as e:
            print(f'❌ 查询 {company} 时出错: {e}')
            results[company] = '❌'

        print('\n' + '-'*70 + '\n')

    # 汇总结果
    print('='*70)
    print('📊 测试结果汇总')
    print('='*70)
    for company, status in results.items():
        print(f'  {status} {company}')
    print()

def main():
    """主函数"""
    init_firestore()

    if len(sys.argv) > 1:
        # 命令行指定公司名称
        company_name = ' '.join(sys.argv[1:])
        query_company(company_name)
    else:
        # 测试多个公司
        test_multiple_companies()

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
