#!/usr/bin/env python3
"""
测试公司名称变体匹配功能
目的：验证不同的公司名称输入能正确匹配到FEC数据

测试案例：
- Google / Google Inc / Alphabet / google.com
- JPMorgan / JPM / JP Morgan Chase
- Microsoft / MSFT / Microsoft Corporation
- Boeing / The Boeing Company
"""

import sys
import os
import subprocess
from pathlib import Path

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
            result = subprocess.run(
                ['gcloud', 'auth', 'print-access-token'],
                capture_output=True, text=True, check=True
            )
            access_token = result.stdout.strip()

            from google.oauth2 import credentials as oauth_creds
            cred = oauth_creds.Credentials(access_token)
            firebase_admin.initialize_app(cred, options={'projectId': PROJECT_ID})

        db = firestore.client()
        print(f'✅ Firestore已连接 (项目: {PROJECT_ID})')
        return db
    except Exception as e:
        print(f'❌ 失败: {e}')
        sys.exit(1)

def normalize_company_name(name):
    """
    标准化公司名称用于索引
    与06-build-indexes.py中的逻辑保持一致
    """
    if not name:
        return ''

    import re

    normalized = name.lower()

    # 移除常见后缀
    suffixes = ['corporation', 'corp', 'inc', 'incorporated', 'company', 'co',
                'llc', 'lp', 'ltd', 'limited', 'political action committee', 'pac']
    for suffix in suffixes:
        normalized = re.sub(rf'\b{suffix}\b\.?', '', normalized)

    # 移除标点和多余空格
    normalized = re.sub(r'[^\w\s]', '', normalized)
    normalized = re.sub(r'\s+', ' ', normalized).strip()

    return normalized

def query_company_donations(company_name):
    """
    查询公司的FEC捐款数据
    返回: (normalized_name, data) 或 None
    """
    normalized = normalize_company_name(company_name)

    print(f'  查询: "{company_name}" → 标准化: "{normalized}"')

    # 1. 查找公司索引
    company_index_ref = db.collection('fec_company_index').document(normalized)
    company_index = company_index_ref.get()

    if not company_index.exists:
        print(f'  ❌ 未找到公司索引')
        return None

    company_data = company_index.to_dict()
    display_name = company_data.get('company_name', company_name)

    # 2. 查询该公司所有年份的党派汇总
    summaries_ref = db.collection('fec_company_party_summary')
    summaries = summaries_ref.where('normalized_name', '==', normalized).stream()

    summaries_list = list(summaries)
    if not summaries_list:
        print(f'  ⚠️  找到公司索引，但无捐款汇总数据')
        return normalized, None

    # 3. 聚合所有年份的数据
    party_totals = {}
    total_contributed = 0
    years = []

    for summary_doc in summaries_list:
        summary = summary_doc.to_dict()
        year = summary.get('data_year')
        if year:
            years.append(year)

        total = summary.get('total_contributed', 0)
        total_contributed += total

        party_data = summary.get('party_totals', {})
        for party, data in party_data.items():
            if party not in party_totals:
                party_totals[party] = {'total_amount': 0, 'contribution_count': 0}

            party_totals[party]['total_amount'] += data.get('total_amount', 0)
            party_totals[party]['contribution_count'] += data.get('contribution_count', 0)

    # 转换为美元
    total_usd = total_contributed / 100.0
    for party in party_totals:
        party_totals[party]['total_amount_usd'] = party_totals[party]['total_amount'] / 100.0

    # 计算百分比
    party_percentages = {}
    if total_contributed > 0:
        for party, totals in party_totals.items():
            percentage = (totals['total_amount'] / total_contributed) * 100.0
            party_percentages[party] = percentage

    print(f'  ✅ 找到数据: {display_name}')
    print(f'     总捐款: ${total_usd:,.2f}')
    print(f'     年份范围: {min(years)}-{max(years)} ({len(years)} 年)')
    print(f'     政党分布:')
    for party in sorted(party_percentages.keys(), key=lambda p: party_percentages[p], reverse=True):
        pct = party_percentages[party]
        amount = party_totals[party]['total_amount_usd']
        count = party_totals[party]['contribution_count']
        print(f'       {party}: {pct:.1f}% (${amount:,.2f}, {count} 笔)')

    return normalized, {
        'display_name': display_name,
        'normalized_name': normalized,
        'total_usd': total_usd,
        'party_totals': party_totals,
        'party_percentages': party_percentages,
        'years': years
    }

def test_company_variants():
    """测试各种公司名称变体"""

    test_cases = [
        # Google variants
        ('Google', ['google', 'Google Inc', 'Google LLC', 'Alphabet', 'google.com']),

        # JPMorgan variants
        ('JPMORGAN', ['JPM', 'JP Morgan', 'JPMorgan Chase', 'JPMORGAN CHASE & CO']),

        # Microsoft variants
        ('MICROSOFT', ['MSFT', 'Microsoft Corp', 'Microsoft Corporation']),

        # Boeing variants
        ('THE BOEING COMPANY', ['Boeing', 'Boeing Company', 'The Boeing Co']),

        # Goldman Sachs variants (use full name from investigation)
        ('THE GOLDMAN SACHS GROUP', ['Goldman Sachs', 'The Goldman Sachs Group Inc', 'GS', 'Goldman']),

        # Walmart variants (has index but no summary - skip for now)
        # ('WALMART', ['Wal-Mart', 'Walmart Inc', 'WMT']),

        # AT&T variants
        ('AT&T', ['ATT', 'AT&T Inc', 'AT and T']),

        # Lockheed Martin variants
        ('LOCKHEED MARTIN', ['Lockheed', 'LMT', 'Lockheed Martin Corporation']),

        # RTX variants (use correct name from investigation)
        ('RTX', ['RTX Corporation', 'RTX', 'Raytheon', 'Raytheon Technologies']),
    ]

    print('\n' + '='*80)
    print('🧪 测试公司名称变体匹配')
    print('='*80)

    results = {}

    for canonical_name, variants in test_cases:
        print(f'\n📌 测试组: {canonical_name}')
        print(f'   变体: {", ".join(variants)}')
        print()

        normalized_names = set()

        for variant in variants:
            result = query_company_donations(variant)
            if result:
                normalized, data = result
                normalized_names.add(normalized)

        # 检查一致性
        if len(normalized_names) == 0:
            print(f'\n  ⚠️  所有变体都未找到数据')
            results[canonical_name] = 'NOT_FOUND'
        elif len(normalized_names) == 1:
            print(f'\n  ✅ 所有变体映射到同一公司: {list(normalized_names)[0]}')
            results[canonical_name] = 'CONSISTENT'
        else:
            print(f'\n  ❌ 变体映射到不同公司: {normalized_names}')
            print(f'     这需要手动创建别名映射！')
            results[canonical_name] = 'INCONSISTENT'

    # 汇总结果
    print('\n' + '='*80)
    print('📊 测试汇总')
    print('='*80)

    consistent = sum(1 for v in results.values() if v == 'CONSISTENT')
    inconsistent = sum(1 for v in results.values() if v == 'INCONSISTENT')
    not_found = sum(1 for v in results.values() if v == 'NOT_FOUND')

    print(f'\n  ✅ 一致匹配: {consistent}/{len(test_cases)}')
    print(f'  ❌ 不一致: {inconsistent}/{len(test_cases)}')
    print(f'  ⚠️  未找到: {not_found}/{len(test_cases)}')

    if inconsistent > 0:
        print(f'\n  需要创建别名映射的公司:')
        for name, status in results.items():
            if status == 'INCONSISTENT':
                print(f'    - {name}')

def main():
    """主函数"""
    print('\n' + '='*80)
    print('🔍 FEC公司名称匹配测试')
    print('='*80)

    init_firestore()
    test_company_variants()

    print('\n')

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
