#!/usr/bin/env python3
"""
验证 fec_company_consolidated 数据完整性

检查项:
1. 所有linkage公司都被包含
2. 所有PAC公司都被包含
3. 金额正确累加
4. 没有数据丢失
"""

import sys
import os

# 添加项目根目录到Python路径
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../..')))

import firebase_admin
from firebase_admin import credentials, firestore

# 初始化Firebase
if not firebase_admin._apps:
    cred = credentials.ApplicationDefault()
    firebase_admin.initialize_app(cred, {'projectId': 'stanseproject'})

db = firestore.client()


def verify_completeness(year: int = 2024):
    """验证consolidated数据完整性"""
    print('=' * 70)
    print(f'🔍 验证 fec_company_consolidated 数据完整性 (Year: {year})')
    print('=' * 70)

    # 1. 收集所有公司
    print('\n📂 步骤1: 收集所有源数据公司...')

    linkage_companies = set()
    linkage_query = db.collection('fec_company_party_summary').where(
        filter=firestore.FieldFilter('data_year', '==', year)
    )
    for doc in linkage_query.stream():
        data = doc.to_dict()
        linkage_companies.add(data.get('normalized_name'))

    print(f'  ✅ Linkage公司: {len(linkage_companies)}')

    pac_companies = set()
    pac_query = db.collection('fec_company_pac_transfers_summary').where(
        filter=firestore.FieldFilter('data_year', '==', year)
    )
    for doc in pac_query.stream():
        data = doc.to_dict()
        pac_companies.add(data.get('normalized_name'))

    print(f'  ✅ PAC公司: {len(pac_companies)}')

    all_source_companies = linkage_companies | pac_companies
    print(f'  📊 总计unique公司: {len(all_source_companies)}')
    print(f'  📊 两者重叠: {len(linkage_companies & pac_companies)}')

    # 2. 检查consolidated
    print('\n📂 步骤2: 检查consolidated collection...')

    consolidated_companies = set()
    consolidated_query = db.collection('fec_company_consolidated').where(
        filter=firestore.FieldFilter('data_year', '==', year)
    )
    for doc in consolidated_query.stream():
        data = doc.to_dict()
        consolidated_companies.add(data.get('normalized_name'))

    print(f'  ✅ Consolidated公司: {len(consolidated_companies)}')

    # 3. 验证完整性
    print('\n📊 步骤3: 验证数据完整性...')

    missing_in_consolidated = all_source_companies - consolidated_companies
    extra_in_consolidated = consolidated_companies - all_source_companies

    if missing_in_consolidated:
        print(f'\n❌ 缺失公司: {len(missing_in_consolidated)}')
        for company in list(missing_in_consolidated)[:10]:
            print(f'  - {company}')
        if len(missing_in_consolidated) > 10:
            print(f'  ... 还有 {len(missing_in_consolidated) - 10} 个')
    else:
        print('\n✅ 没有缺失公司')

    if extra_in_consolidated:
        print(f'\n⚠️  多余公司: {len(extra_in_consolidated)}')
        for company in list(extra_in_consolidated)[:10]:
            print(f'  - {company}')
    else:
        print('\n✅ 没有多余公司')

    # 4. 抽样验证金额累加正确性
    print('\n📊 步骤4: 抽样验证金额累加...')

    overlap_companies = list(linkage_companies & pac_companies)
    if overlap_companies:
        sample_size = min(5, len(overlap_companies))
        print(f'  检查 {sample_size} 个重叠公司的金额累加...')

        errors = []
        for company in overlap_companies[:sample_size]:
            # 获取linkage数据
            linkage_doc = db.collection('fec_company_party_summary').document(
                f'{company}_{year}'
            ).get()
            linkage_total = linkage_doc.to_dict().get('total_contributed', 0) if linkage_doc.exists else 0

            # 获取PAC数据
            pac_doc = db.collection('fec_company_pac_transfers_summary').document(
                f'{company}_{year}'
            ).get()
            pac_total = pac_doc.to_dict().get('total_contributed', 0) if pac_doc.exists else 0

            # 获取consolidated数据
            cons_doc = db.collection('fec_company_consolidated').document(
                f'{company}_{year}'
            ).get()

            if cons_doc.exists:
                cons_data = cons_doc.to_dict()
                cons_total = cons_data.get('total_contributed', 0)
                cons_linkage = cons_data.get('linkage_total', 0)
                cons_pac = cons_data.get('pac_transfer_total', 0)

                expected_total = linkage_total + pac_total

                if cons_total != expected_total:
                    errors.append({
                        'company': company,
                        'expected': expected_total,
                        'actual': cons_total,
                        'linkage': linkage_total,
                        'pac': pac_total
                    })
                else:
                    print(f'  ✅ {company}: ${cons_total/100:.2f} = ${linkage_total/100:.2f} + ${pac_total/100:.2f}')
            else:
                errors.append({'company': company, 'error': 'missing consolidated record'})

        if errors:
            print(f'\n❌ 发现 {len(errors)} 个累加错误:')
            for err in errors:
                print(f'  - {err}')
        else:
            print(f'\n✅ 所有抽样公司金额累加正确')

    # 5. 总结
    print('\n' + '=' * 70)
    print('📋 验证总结')
    print('=' * 70)
    print(f'源数据公司总数: {len(all_source_companies)}')
    print(f'Consolidated公司总数: {len(consolidated_companies)}')
    print(f'缺失公司: {len(missing_in_consolidated)}')
    print(f'多余公司: {len(extra_in_consolidated)}')

    if not missing_in_consolidated and not extra_in_consolidated:
        print('\n✅ 数据完整性验证通过！')
        return True
    else:
        print('\n❌ 数据完整性验证失败！')
        return False


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='验证consolidated数据完整性')
    parser.add_argument('--year', type=int, default=2024, help='数据年份')
    args = parser.parse_args()

    success = verify_completeness(args.year)
    sys.exit(0 if success else 1)
