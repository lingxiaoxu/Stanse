#!/usr/bin/env python3
"""
验证公司在FEC数据中的捐款记录
- 查询公司名称
- 验证捐款记录的完整性
- 检查政党标签
- 聚合金额
"""

import sys
import firebase_admin
from firebase_admin import credentials, firestore
from collections import defaultdict
from datetime import datetime

PROJECT_ID = 'stanseproject'

# 测试公司列表（知名美国公司）
TEST_COMPANIES = [
    'JPMORGAN',
    'GOLDMAN SACHS',
    'MICROSOFT',
    'GOOGLE',
    'AMAZON',
    'APPLE',
    'META',
    'TESLA',
    'BOEING',
    'LOCKHEED MARTIN'
]

def init_firestore():
    """初始化Firestore"""
    global db
    if not firebase_admin._apps:
        firebase_admin.initialize_app(options={'projectId': PROJECT_ID})
    return firestore.client()

def find_committees_by_company(db, company_name):
    """
    查找包含公司名称的委员会
    """
    print(f'\n🔍 查找包含 "{company_name}" 的委员会...')

    committees_ref = db.collection('fec_raw_committees')

    # 查询connected_org_name包含公司名称的委员会
    results = []

    # Firestore不支持LIKE，需要client-side过滤
    # 获取所有委员会然后过滤
    all_committees = committees_ref.stream()

    for doc in all_committees:
        data = doc.to_dict()
        org_name = data.get('connected_org_name', '').upper()
        committee_name = data.get('committee_name', '').upper()

        if company_name.upper() in org_name or company_name.upper() in committee_name:
            results.append({
                'id': doc.id,
                'committee_id': data.get('committee_id'),
                'committee_name': data.get('committee_name'),
                'connected_org_name': data.get('connected_org_name'),
                'committee_type': data.get('committee_type'),
                'party': data.get('party')
            })

    print(f'  找到 {len(results)} 个相关委员会')
    return results

def get_contributions_for_committee(db, committee_id):
    """
    获取某个委员会的所有捐款记录
    """
    print(f'\n  📊 查询委员会 {committee_id} 的捐款记录...')

    contributions_ref = db.collection('fec_raw_contributions_pac_to_candidate')

    # 查询以committee_id开头的文档
    query = contributions_ref.where('committee_id', '==', committee_id)

    contributions = []
    for doc in query.stream():
        data = doc.to_dict()
        contributions.append({
            'id': doc.id,
            'committee_id': data.get('committee_id'),
            'candidate_id': data.get('candidate_id'),
            'amount_cents': data.get('transaction_amount', 0),
            'transaction_date': data.get('transaction_date'),
            'name': data.get('name'),
            'entity_type': data.get('entity_type')
        })

    print(f'    找到 {len(contributions)} 条捐款记录')
    return contributions

def get_candidate_info(db, candidate_id, year=2024):
    """
    获取候选人信息（包括政党）
    """
    doc_id = f'{candidate_id}_{year}'
    doc_ref = db.collection('fec_raw_candidates').document(doc_id)
    doc = doc_ref.get()

    if doc.exists:
        data = doc.to_dict()
        return {
            'candidate_id': candidate_id,
            'name': data.get('candidate_name'),
            'party': data.get('party_affiliation'),
            'office': data.get('office_sought'),
            'state': data.get('state')
        }
    return None

def aggregate_by_party(db, contributions):
    """
    按政党聚合捐款
    """
    print('\n  🎯 按政党聚合捐款...')

    party_totals = defaultdict(int)
    party_counts = defaultdict(int)
    detailed_records = defaultdict(list)

    candidates_cache = {}

    for contrib in contributions:
        candidate_id = contrib['candidate_id']
        amount = contrib['amount_cents']

        # 获取候选人信息
        if candidate_id not in candidates_cache:
            candidate_info = get_candidate_info(db, candidate_id)
            candidates_cache[candidate_id] = candidate_info

        candidate_info = candidates_cache[candidate_id]

        if candidate_info:
            party = candidate_info['party']
            party_totals[party] += amount
            party_counts[party] += 1
            detailed_records[party].append({
                'candidate': candidate_info['name'],
                'amount_cents': amount,
                'amount_usd': amount / 100,
                'office': candidate_info['office'],
                'state': candidate_info['state'],
                'date': contrib['transaction_date']
            })

    # 转换为美元并显示
    result = {}
    for party, amount_cents in party_totals.items():
        amount_usd = amount_cents / 100
        result[party] = {
            'amount_usd': amount_usd,
            'count': party_counts[party],
            'records': detailed_records[party]
        }

    return result

def print_company_summary(company_name, committees, all_contributions, party_aggregation):
    """
    打印公司捐款摘要
    """
    print(f'\n{"="*80}')
    print(f'📋 公司: {company_name}')
    print(f'{"="*80}')

    print(f'\n委员会数量: {len(committees)}')
    for committee in committees[:5]:  # 只显示前5个
        print(f'  - {committee["committee_name"]} ({committee["committee_id"]})')
        print(f'    类型: {committee["committee_type"]}, 政党: {committee.get("party", "N/A")}')

    if len(committees) > 5:
        print(f'  ... 还有 {len(committees) - 5} 个委员会')

    print(f'\n总捐款记录: {len(all_contributions)}')

    print(f'\n按政党聚合:')
    total_amount = 0
    for party, data in sorted(party_aggregation.items(), key=lambda x: x[1]['amount_usd'], reverse=True):
        amount = data['amount_usd']
        count = data['count']
        total_amount += amount
        print(f'  {party}: ${amount:,.2f} ({count} 笔)')

    print(f'\n总计: ${total_amount:,.2f}')

    # 计算政党倾向百分比
    if total_amount > 0:
        print(f'\n政党倾向比例:')
        for party, data in sorted(party_aggregation.items(), key=lambda x: x[1]['amount_usd'], reverse=True):
            percentage = (data['amount_usd'] / total_amount) * 100
            print(f'  {party}: {percentage:.1f}%')

def verify_company(db, company_name):
    """
    验证单个公司的完整数据链
    """
    print(f'\n\n{"#"*80}')
    print(f'验证公司: {company_name}')
    print(f'{"#"*80}')

    # 1. 查找委员会
    committees = find_committees_by_company(db, company_name)

    if not committees:
        print(f'  ⚠️  未找到任何相关委员会')
        return None

    # 2. 获取所有捐款记录
    all_contributions = []
    for committee in committees:
        contribs = get_contributions_for_committee(db, committee['committee_id'])
        all_contributions.extend(contribs)

    if not all_contributions:
        print(f'  ⚠️  未找到任何捐款记录')
        return None

    # 3. 聚合按政党
    party_aggregation = aggregate_by_party(db, all_contributions)

    # 4. 打印摘要
    print_company_summary(company_name, committees, all_contributions, party_aggregation)

    # 5. 打印前5条详细记录（每个政党）
    print(f'\n详细捐款记录（每个政党前5条）:')
    for party, data in party_aggregation.items():
        print(f'\n  {party}:')
        for i, record in enumerate(data['records'][:5], 1):
            print(f'    {i}. {record["candidate"]} ({record["office"]}-{record["state"]}): '
                  f'${record["amount_usd"]:,.2f} on {record["date"]}')
        if len(data['records']) > 5:
            print(f'    ... 还有 {len(data["records"]) - 5} 条记录')

    return {
        'company_name': company_name,
        'committees': committees,
        'total_contributions': len(all_contributions),
        'party_aggregation': party_aggregation
    }

def check_jpmorgan_data(db):
    """
    详细检查JPMORGAN在Firebase中的数据完整性
    """
    print('\n' + '#'*80)
    print('🔍 JPMORGAN 数据完整性检查')
    print('#'*80)

    # 检查可能的normalized names
    possible_names = ['jpmorgan', 'jpmorgan chase', 'jp morgan', 'jp morgan chase']

    print('\n1. 检查 fec_company_index')
    print('='*80)

    found_indexes = {}
    for name in possible_names:
        doc_ref = db.collection('fec_company_index').document(name)
        doc = doc_ref.get()

        if doc.exists:
            data = doc.to_dict()
            found_indexes[name] = data
            print(f'\n✅ 找到索引: {name}')
            print(f'   company_name: {data.get("company_name")}')
            print(f'   normalized_name: {data.get("normalized_name")}')
            print(f'   search_keywords: {data.get("search_keywords")}')
            print(f'   committee_count: {data.get("committee_count")}')
        else:
            print(f'\n❌ 未找到索引: {name}')

    print('\n2. 检查 fec_company_name_variants')
    print('='*80)

    # 检查可能的canonical names
    possible_canonical = ['JPMORGAN', 'JPMORGAN CHASE', 'JP MORGAN', 'JP MORGAN CHASE']

    found_variants = {}
    for name in possible_canonical:
        doc_ref = db.collection('fec_company_name_variants').document(name)
        doc = doc_ref.get()

        if doc.exists:
            data = doc.to_dict()
            found_variants[name] = data
            print(f'\n✅ 找到变体记录: {name}')
            print(f'   canonical_name: {data.get("canonical_name")}')
            print(f'   display_name: {data.get("display_name")}')
            print(f'   variants: {data.get("variants")}')
            print(f'   ai_updated: {data.get("ai_updated")}')
        else:
            print(f'\n❌ 未找到变体记录: {name}')

    print('\n3. 检查 fec_company_party_summary')
    print('='*80)

    found_summaries = {}
    for name in possible_names:
        summaries = db.collection('fec_company_party_summary').where('normalized_name', '==', name).stream()
        summaries_list = list(summaries)

        if summaries_list:
            print(f'\n✅ 找到 {len(summaries_list)} 条汇总记录: {name}')
            total = 0
            for s in summaries_list:
                data = s.to_dict()
                amount = data.get('total_contributed', 0) / 100
                year = data.get('data_year')
                print(f'   {year}: ${amount:,.2f}')
                total += amount
            print(f'   总计: ${total:,.2f}')
            found_summaries[name] = {'total': total, 'count': len(summaries_list)}
        else:
            print(f'\n❌ 无汇总记录: {name}')

    # 汇总结果
    print('\n' + '='*80)
    print('📊 JPMORGAN 数据完整性汇总')
    print('='*80)

    print(f'\n索引记录数: {len(found_indexes)}')
    print(f'变体记录数: {len(found_variants)}')
    print(f'汇总记录: {len(found_summaries)} 个normalized name有数据')

    # 检查数据一致性
    if len(found_indexes) == 0:
        print('\n⚠️  警告: 未找到任何索引记录')
    elif len(found_indexes) > 1:
        print('\n⚠️  警告: 找到多个索引记录，可能存在重复')
        for name, data in found_indexes.items():
            print(f'   - {name}: {data.get("company_name")}')
    else:
        print('\n✅ 索引记录正常（唯一）')

    if len(found_variants) == 0:
        print('⚠️  警告: 未找到任何变体记录')
    elif len(found_variants) > 1:
        print('⚠️  警告: 找到多个变体记录，可能存在重复')
        for name, data in found_variants.items():
            print(f'   - {name}: {len(data.get("variants", []))} 个变体')
    else:
        print('✅ 变体记录正常（唯一）')

    if len(found_summaries) == 0:
        print('⚠️  警告: 未找到任何汇总记录')
    elif len(found_summaries) > 1:
        print('⚠️  警告: 找到多个汇总记录，可能需要合并')
        for name, info in found_summaries.items():
            print(f'   - {name}: ${info["total"]:,.2f} ({info["count"]} 年)')
    else:
        print('✅ 汇总记录正常（唯一）')

def main():
    """主函数"""
    print('\n' + '='*80)
    print('🔍 FEC 数据验证 - 公司政治捐款分析')
    print('='*80)

    db = init_firestore()

    # 首先检查JPMORGAN数据完整性
    check_jpmorgan_data(db)

    results = []

    for company_name in TEST_COMPANIES:
        try:
            result = verify_company(db, company_name)
            if result:
                results.append(result)
        except Exception as e:
            print(f'\n❌ 处理 {company_name} 时出错: {e}')
            import traceback
            traceback.print_exc()

    # 打印最终汇总
    print(f'\n\n{"="*80}')
    print('📊 验证汇总')
    print(f'{"="*80}')

    print(f'\n成功验证的公司: {len(results)}/{len(TEST_COMPANIES)}')

    for result in results:
        total = sum(data['amount_usd'] for data in result['party_aggregation'].values())
        print(f'\n  ✓ {result["company_name"]}: '
              f'{result["total_contributions"]} 笔捐款, 总计 ${total:,.2f}')

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
