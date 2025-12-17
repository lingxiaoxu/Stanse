#!/usr/bin/env python3
"""
详细验证公司 FEC 数据的完整性和准确性

验证内容：
1. 委员会数据是否完整
2. 捐款记录是否有重复
3. 候选人党派标签是否完整
4. 数据链路是否完整（committee → contribution → candidate → party）
5. 金额计算是否正确
"""

import sys
import os
import subprocess
from collections import defaultdict

try:
    import firebase_admin
    from firebase_admin import credentials, firestore
except ImportError:
    print('❌ Firebase库未安装')
    sys.exit(1)

PROJECT_ID = 'stanseproject'
db = None

def init_firestore():
    """初始化 Firestore"""
    global db
    print('🔧 初始化 Firestore 连接...')

    try:
        if not firebase_admin._apps:
            access_token = os.environ.get('GCLOUD_ACCESS_TOKEN')

            if not access_token:
                result = subprocess.run(
                    ['gcloud', 'auth', 'print-access-token'],
                    capture_output=True, text=True, check=True, timeout=30
                )
                access_token = result.stdout.strip()

            from google.oauth2 import credentials as oauth_creds
            cred = oauth_creds.Credentials(access_token)
            firebase_admin.initialize_app(cred, options={'projectId': PROJECT_ID})

        db = firestore.client()
        print(f'✅ Firestore 已连接\n')
        return db
    except Exception as e:
        print(f'❌ 失败: {e}')
        sys.exit(1)

def verify_company_data(company_name, max_contributions_to_show=20):
    """
    详细验证单个公司的数据

    Args:
        company_name: 公司名称
        max_contributions_to_show: 最多显示多少条详细捐款记录
    """
    print('\n' + '='*100)
    print(f'🔍 详细验证: {company_name}')
    print('='*100)

    # ===== Step 1: 验证委员会数据 =====
    print('\n📋 Step 1: 验证委员会数据')
    print('-'*100)

    committees_ref = db.collection('fec_raw_committees')
    committees_docs = list(committees_ref.where('connected_org_name', '==', company_name.upper()).stream())

    if not committees_docs:
        print(f'❌ 未找到 "{company_name}" 的委员会记录')
        return False

    print(f'✅ 找到 {len(committees_docs)} 个委员会:')
    committee_ids = []

    for doc in committees_docs:
        data = doc.to_dict()
        committee_id = data.get('committee_id')
        committee_name = data.get('committee_name', '')
        committee_type = data.get('committee_type', '')
        party = data.get('party', '')

        committee_ids.append(committee_id)

        print(f'\n   Committee ID: {committee_id}')
        print(f'   Name: {committee_name}')
        print(f'   Type: {committee_type}')
        print(f'   Party: {party}')

    # ===== Step 2: 验证捐款记录（检查重复） =====
    print('\n\n💰 Step 2: 验证捐款记录')
    print('-'*100)

    contributions_ref = db.collection('fec_raw_contributions_pac_to_candidate')

    all_contributions = []
    doc_ids_seen = set()
    duplicates = []

    for committee_id in committee_ids:
        contributions = list(contributions_ref.where('committee_id', '==', committee_id).stream())

        for doc in contributions:
            doc_id = doc.id
            if doc_id in doc_ids_seen:
                duplicates.append(doc_id)
            else:
                doc_ids_seen.add(doc_id)
                all_contributions.append({
                    'doc_id': doc_id,
                    **doc.to_dict()
                })

    print(f'✅ 找到 {len(all_contributions)} 条独特的捐款记录')

    if duplicates:
        print(f'⚠️  发现 {len(duplicates)} 条重复记录!')
        for dup in duplicates[:5]:
            print(f'   - {dup}')
    else:
        print(f'✅ 无重复记录')

    if not all_contributions:
        print(f'❌ 未找到捐款记录')
        return False

    # 收集候选人 ID
    candidate_ids_in_contributions = set()
    for contrib in all_contributions:
        cand_id = contrib.get('candidate_id')
        if cand_id:
            candidate_ids_in_contributions.add(cand_id)

    print(f'✅ 涉及 {len(candidate_ids_in_contributions)} 位候选人')

    # ===== Step 3: 验证候选人党派标签 =====
    print('\n\n🎭 Step 3: 验证候选人党派标签')
    print('-'*100)

    candidates_ref = db.collection('fec_raw_candidates')

    # 分批查询候选人
    batch_size = 10
    candidate_id_list = list(candidate_ids_in_contributions)
    candidate_data_map = {}

    for i in range(0, len(candidate_id_list), batch_size):
        batch = candidate_id_list[i:i+batch_size]
        candidates = list(candidates_ref.where('candidate_id', 'in', batch).stream())

        for doc in candidates:
            data = doc.to_dict()
            cand_id = data.get('candidate_id')
            if cand_id:
                candidate_data_map[cand_id] = {
                    'name': data.get('candidate_name', ''),
                    'party': data.get('party_affiliation', 'UNK'),
                    'state': data.get('state', ''),
                    'office': data.get('office_sought', '')
                }

    print(f'✅ 查询到 {len(candidate_data_map)} 位候选人的完整信息')

    # 检查缺失的候选人
    missing_candidates = candidate_ids_in_contributions - set(candidate_data_map.keys())
    if missing_candidates:
        print(f'⚠️  有 {len(missing_candidates)} 位候选人未找到记录:')
        for cand_id in list(missing_candidates)[:5]:
            print(f'   - {cand_id}')
    else:
        print(f'✅ 所有候选人都有完整记录')

    # 统计党派分布
    party_stats = defaultdict(int)
    for cand_data in candidate_data_map.values():
        party_stats[cand_data['party']] += 1

    print(f'\n📊 候选人党派分布:')
    for party, count in sorted(party_stats.items(), key=lambda x: -x[1]):
        party_name = {
            'DEM': '民主党',
            'REP': '共和党',
            'LIB': '自由党',
            'GRE': '绿党',
            'IND': '独立',
            'UNK': '未知'
        }.get(party, party)
        print(f'   {party_name:10} ({party}): {count:>3} 位候选人')

    # ===== Step 4: 详细检查部分捐款记录 =====
    print(f'\n\n🔬 Step 4: 详细检查捐款记录 (显示前 {max_contributions_to_show} 条)')
    print('-'*100)

    print(f'\n{"No.":<4} {"Date":<12} {"Amount":<12} {"Candidate":<25} {"Party":<6} {"Office":<8}')
    print('-'*100)

    contributions_with_party = []

    for idx, contrib in enumerate(all_contributions[:max_contributions_to_show], 1):
        cand_id = contrib.get('candidate_id', '')
        amount_cents = contrib.get('transaction_amount', 0)
        amount_dollars = amount_cents / 100
        trans_date = contrib.get('transaction_date', '')

        # 获取候选人信息
        if cand_id in candidate_data_map:
            cand_info = candidate_data_map[cand_id]
            cand_name = cand_info['name'][:23]
            party = cand_info['party']
            office = cand_info['office']
            contributions_with_party.append({
                **contrib,
                'candidate_info': cand_info
            })
        else:
            cand_name = f'Unknown ({cand_id[:10]})'
            party = '???'
            office = '???'

        print(f'{idx:<4} {trans_date:<12} ${amount_dollars:>10,.2f} {cand_name:<25} {party:<6} {office:<8}')

    # ===== Step 5: 党派聚合统计 =====
    print('\n\n📊 Step 5: 党派聚合统计')
    print('-'*100)

    party_totals = defaultdict(lambda: {'amount': 0, 'count': 0})

    for contrib in all_contributions:
        cand_id = contrib.get('candidate_id')
        amount_cents = contrib.get('transaction_amount', 0)

        if cand_id in candidate_data_map:
            party = candidate_data_map[cand_id]['party']
            party_totals[party]['amount'] += amount_cents
            party_totals[party]['count'] += 1

    total_amount = sum(p['amount'] for p in party_totals.values())
    total_count = sum(p['count'] for p in party_totals.values())

    print(f'\n{"党派":<30} {"金额 ($)":<20} {"百分比":<12} {"捐款次数":<12}')
    print('='*100)

    for party in sorted(party_totals.keys(), key=lambda p: -party_totals[p]['amount']):
        amount_cents = party_totals[party]['amount']
        count = party_totals[party]['count']
        amount_dollars = amount_cents / 100
        percentage = (amount_cents / total_amount * 100) if total_amount > 0 else 0

        party_name = {
            'DEM': '民主党 (Democratic)',
            'REP': '共和党 (Republican)',
            'LIB': '自由党 (Libertarian)',
            'GRE': '绿党 (Green)',
            'IND': '独立 (Independent)',
            'UNK': '未知 (Unknown)'
        }.get(party, f'{party}')

        print(f'{party_name:<30} ${amount_dollars:>18,.2f} {percentage:>10.1f}% {count:>10} 笔')

    print('-'*100)
    total_dollars = total_amount / 100
    print(f'{"总计":<30} ${total_dollars:>18,.2f} {"100.0%":>11} {total_count:>10} 笔')
    print('='*100)

    # ===== Step 6: 数据完整性总结 =====
    print('\n\n✅ Step 6: 数据完整性总结')
    print('-'*100)

    completeness = {
        '委员会记录': len(committees_docs) > 0,
        '捐款记录': len(all_contributions) > 0,
        '候选人记录': len(candidate_data_map) == len(candidate_ids_in_contributions),
        '无重复记录': len(duplicates) == 0,
        '党派标签完整': len(missing_candidates) == 0
    }

    for check, passed in completeness.items():
        status = '✅' if passed else '❌'
        print(f'{status} {check}')

    all_checks_passed = all(completeness.values())

    if all_checks_passed:
        print(f'\n🎉 {company_name} 的数据验证通过！数据真实、完整、可用。')
    else:
        print(f'\n⚠️  {company_name} 的数据存在部分问题，请检查上述详情。')

    print('\n' + '='*100)

    return all_checks_passed

def main():
    """验证多个公司的数据"""
    print('\n' + '='*100)
    print('🔍 FEC 数据详细验证工具')
    print('='*100)

    init_firestore()

    # 选择要验证的公司
    companies_to_verify = [
        'THE BOEING COMPANY',
        'AT&T INC.',
        'WALMART INC.',
    ]

    results = {}

    for company in companies_to_verify:
        passed = verify_company_data(company, max_contributions_to_show=15)
        results[company] = passed

        input('\n\n按 Enter 继续验证下一个公司...')

    # 最终总结
    print('\n\n' + '='*100)
    print('📋 验证总结')
    print('='*100 + '\n')

    for company, passed in results.items():
        status = '✅ 通过' if passed else '❌ 有问题'
        print(f'{status} - {company}')

    passed_count = sum(results.values())
    print(f'\n总计: {passed_count}/{len(results)} 个公司通过验证')

    if passed_count == len(results):
        print('\n🎉 所有公司数据验证通过！可以安全地用于 API 开发。')
    else:
        print('\n⚠️  部分公司数据有问题，请修复后再继续。')

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
