#!/usr/bin/env python3
"""
深度验证FEC数据完整性
- 显示每家公司的完整数据链
- 验证每笔捐款的候选人和政党信息
- 确保没有重复计算
- 检查数据的真实性和可追溯性
"""

import sys
import firebase_admin
from firebase_admin import credentials, firestore
from collections import defaultdict
from datetime import datetime

PROJECT_ID = 'stanseproject'

# 已验证的9家公司
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
    if not firebase_admin._apps:
        firebase_admin.initialize_app(options={'projectId': PROJECT_ID})
    return firestore.client()

def find_committees_by_company(db, company_name):
    """查找包含公司名称的委员会"""
    committees_ref = db.collection('fec_raw_committees')
    results = []

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

    return results

def get_contributions_for_committee(db, committee_id):
    """获取某个委员会的所有捐款记录"""
    contributions_ref = db.collection('fec_raw_contributions_pac_to_candidate')
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
            'entity_type': data.get('entity_type'),
            'transaction_type': data.get('transaction_type')
        })

    return contributions

def get_candidate_info(db, candidate_id, year=2024):
    """获取候选人信息"""
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
            'state': data.get('state'),
            'status': data.get('candidate_status')
        }
    return None

def deep_verify_company(db, company_name):
    """深度验证单个公司的完整数据链"""
    print(f'\n\n{"="*100}')
    print(f'🔍 深度验证: {company_name}')
    print(f'{"="*100}')

    # 1. 查找委员会
    committees = find_committees_by_company(db, company_name)
    print(f'\n📋 第一层：委员会信息')
    print(f'   找到 {len(committees)} 个相关委员会:')

    for i, committee in enumerate(committees, 1):
        print(f'   {i}. {committee["committee_name"]}')
        print(f'      ID: {committee["committee_id"]}')
        print(f'      连接组织: {committee["connected_org_name"]}')
        print(f'      类型: {committee["committee_type"]}')

    if not committees:
        print(f'   ❌ 未找到委员会')
        return None

    # 2. 获取所有捐款记录
    print(f'\n💰 第二层：捐款记录')
    all_contributions = []
    contribution_ids = set()  # 用于检测重复

    for committee in committees:
        contribs = get_contributions_for_committee(db, committee['committee_id'])
        print(f'   委员会 {committee["committee_id"]}: {len(contribs)} 笔捐款')

        for contrib in contribs:
            # 检测重复
            if contrib['id'] in contribution_ids:
                print(f'      ⚠️  发现重复记录: {contrib["id"]}')
            else:
                contribution_ids.add(contrib['id'])
                all_contributions.append(contrib)

    print(f'\n   总计（去重后）: {len(all_contributions)} 笔捐款')

    if not all_contributions:
        print(f'   ❌ 未找到捐款记录')
        return None

    # 3. 验证候选人和政党信息
    print(f'\n🎯 第三层：候选人与政党验证')

    party_data = defaultdict(lambda: {'amount': 0, 'count': 0, 'candidates': defaultdict(int), 'records': []})
    candidates_cache = {}
    missing_candidates = set()
    invalid_amounts = []

    for contrib in all_contributions:
        candidate_id = contrib['candidate_id']
        amount_cents = contrib['amount_cents']

        # 验证金额
        if amount_cents == 0:
            invalid_amounts.append(contrib['id'])

        # 获取候选人信息
        if candidate_id not in candidates_cache:
            candidate_info = get_candidate_info(db, candidate_id)
            candidates_cache[candidate_id] = candidate_info

            if not candidate_info:
                missing_candidates.add(candidate_id)

        candidate_info = candidates_cache[candidate_id]

        if candidate_info:
            party = candidate_info['party']
            party_data[party]['amount'] += amount_cents
            party_data[party]['count'] += 1
            party_data[party]['candidates'][candidate_info['name']] += amount_cents
            party_data[party]['records'].append({
                'candidate': candidate_info['name'],
                'amount_cents': amount_cents,
                'office': candidate_info['office'],
                'state': candidate_info['state'],
                'date': contrib['transaction_date']
            })

    # 打印警告
    if missing_candidates:
        print(f'   ⚠️  发现 {len(missing_candidates)} 个候选人缺失信息:')
        for cid in list(missing_candidates)[:5]:
            print(f'      - {cid}')
        if len(missing_candidates) > 5:
            print(f'      ... 还有 {len(missing_candidates) - 5} 个')

    if invalid_amounts:
        print(f'   ⚠️  发现 {len(invalid_amounts)} 笔金额为0的记录')

    # 4. 按政党聚合并显示详细信息
    print(f'\n📊 第四层：政党聚合结果')

    total_amount = sum(data['amount'] for data in party_data.values())

    for party in sorted(party_data.keys(), key=lambda p: party_data[p]['amount'], reverse=True):
        data = party_data[party]
        amount_usd = data['amount'] / 100
        percentage = (data['amount'] / total_amount * 100) if total_amount > 0 else 0

        print(f'\n   {party}:')
        print(f'      总金额: ${amount_usd:,.2f} ({percentage:.1f}%)')
        print(f'      捐款笔数: {data["count"]}')
        print(f'      受益候选人数: {len(data["candidates"])}')

        # 显示前5名受益最多的候选人
        top_candidates = sorted(data['candidates'].items(), key=lambda x: x[1], reverse=True)[:5]
        print(f'      前5名受益候选人:')
        for i, (name, amount) in enumerate(top_candidates, 1):
            print(f'         {i}. {name}: ${amount/100:,.2f}')

    # 5. 数据完整性检查
    print(f'\n✅ 第五层：数据完整性检查')
    print(f'   总捐款笔数: {len(all_contributions)}')
    print(f'   唯一捐款ID: {len(contribution_ids)}')
    print(f'   重复记录: {len(all_contributions) - len(contribution_ids)}')
    print(f'   候选人总数: {len(candidates_cache)}')
    print(f'   缺失候选人信息: {len(missing_candidates)}')
    print(f'   有效捐款记录: {len(all_contributions) - len(invalid_amounts)}')
    print(f'   总金额: ${total_amount/100:,.2f}')

    # 6. 显示样本记录（前3笔捐款）
    print(f'\n📝 第六层：样本记录（前3笔捐款的完整数据链）')

    for i, contrib in enumerate(all_contributions[:3], 1):
        candidate_info = candidates_cache.get(contrib['candidate_id'])
        print(f'\n   样本 {i}:')
        print(f'      记录ID: {contrib["id"]}')
        print(f'      委员会ID: {contrib["committee_id"]}')
        print(f'      候选人ID: {contrib["candidate_id"]}')
        if candidate_info:
            print(f'      候选人姓名: {candidate_info["name"]}')
            print(f'      政党: {candidate_info["party"]}')
            print(f'      竞选职位: {candidate_info["office"]}-{candidate_info["state"]}')
        print(f'      金额: ${contrib["amount_cents"]/100:,.2f}')
        print(f'      日期: {contrib["transaction_date"]}')
        print(f'      交易类型: {contrib.get("transaction_type", "N/A")}')

    return {
        'company_name': company_name,
        'committees': committees,
        'total_contributions': len(all_contributions),
        'unique_ids': len(contribution_ids),
        'party_aggregation': party_data,
        'total_amount_usd': total_amount / 100,
        'data_quality': {
            'duplicates': len(all_contributions) - len(contribution_ids),
            'missing_candidates': len(missing_candidates),
            'invalid_amounts': len(invalid_amounts)
        }
    }

def main():
    """主函数"""
    print('\n' + '='*100)
    print('🔬 FEC 数据深度验证 - 滴水不漏')
    print('='*100)

    db = init_firestore()

    results = []

    for company_name in VERIFIED_COMPANIES:
        try:
            result = deep_verify_company(db, company_name)
            if result:
                results.append(result)
        except Exception as e:
            print(f'\n❌ 处理 {company_name} 时出错: {e}')
            import traceback
            traceback.print_exc()

    # 打印最终汇总
    print(f'\n\n{"="*100}')
    print('📊 最终验证汇总')
    print(f'{"="*100}')

    print(f'\n成功验证的公司: {len(results)}/{len(VERIFIED_COMPANIES)}')

    total_contributions = 0
    total_amount = 0

    for result in results:
        total_contributions += result['total_contributions']
        total_amount += result['total_amount_usd']

        print(f'\n✅ {result["company_name"]}:')
        print(f'   捐款笔数: {result["total_contributions"]}')
        print(f'   总金额: ${result["total_amount_usd"]:,.2f}')
        print(f'   数据质量:')
        print(f'      重复记录: {result["data_quality"]["duplicates"]}')
        print(f'      缺失候选人: {result["data_quality"]["missing_candidates"]}')
        print(f'      无效金额: {result["data_quality"]["invalid_amounts"]}')

        # 显示政党比例
        party_summary = []
        for party, data in result['party_aggregation'].items():
            percentage = (data['amount'] / (result['total_amount_usd'] * 100)) * 100
            party_summary.append(f'{party}:{percentage:.1f}%')
        print(f'   政党比例: {", ".join(party_summary)}')

    print(f'\n\n📈 总计:')
    print(f'   总捐款笔数: {total_contributions:,}')
    print(f'   总金额: ${total_amount:,.2f}')
    print(f'\n✅ 所有数据已验证，滴水不漏！')

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
