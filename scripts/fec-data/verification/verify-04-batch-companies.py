#!/usr/bin/env python3
"""
批量验证公司 FEC 数据并生成报告

自动验证多个公司的数据完整性，生成详细的验证报告
"""

import sys
import os
import subprocess
import json
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

def verify_single_company(company_name):
    """
    验证单个公司的数据

    Returns:
        dict: 验证结果
    """
    print(f'\n{"="*90}')
    print(f'🔍 验证: {company_name}')
    print(f'{"="*90}')

    result = {
        'company_name': company_name,
        'timestamp': datetime.now().isoformat(),
        'passed': False,
        'committees': [],
        'contribution_count': 0,
        'candidate_count': 0,
        'party_distribution': {},
        'issues': [],
        'sample_contributions': []
    }

    try:
        # Step 1: 获取委员会
        print('\n1️⃣ 查询委员会...')
        committees_ref = db.collection('fec_raw_committees')
        committees_docs = list(committees_ref.where('connected_org_name', '==', company_name.upper()).stream())

        if not committees_docs:
            result['issues'].append('未找到委员会记录')
            print('   ❌ 未找到委员会记录')
            return result

        committee_ids = []
        for doc in committees_docs:
            data = doc.to_dict()
            committee_info = {
                'id': data.get('committee_id'),
                'name': data.get('committee_name', ''),
                'type': data.get('committee_type', '')
            }
            committee_ids.append(committee_info['id'])
            result['committees'].append(committee_info)

        print(f'   ✅ 找到 {len(committee_ids)} 个委员会')

        # Step 2: 查询捐款记录
        print('\n2️⃣ 查询捐款记录...')
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

        result['contribution_count'] = len(all_contributions)
        print(f'   ✅ 找到 {len(all_contributions)} 条捐款记录')

        if duplicates:
            result['issues'].append(f'发现 {len(duplicates)} 条重复记录')
            print(f'   ⚠️  发现 {len(duplicates)} 条重复记录')

        if not all_contributions:
            result['issues'].append('未找到捐款记录')
            print('   ❌ 未找到捐款记录')
            return result

        # 收集候选人 ID
        candidate_ids = set(c.get('candidate_id') for c in all_contributions if c.get('candidate_id'))
        result['candidate_count'] = len(candidate_ids)
        print(f'   ✅ 涉及 {len(candidate_ids)} 位候选人')

        # Step 3: 验证候选人党派标签
        print('\n3️⃣ 验证候选人党派标签...')
        candidates_ref = db.collection('fec_raw_candidates')

        candidate_data_map = {}
        batch_size = 10
        candidate_id_list = list(candidate_ids)

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

        missing_candidates = candidate_ids - set(candidate_data_map.keys())
        if missing_candidates:
            result['issues'].append(f'{len(missing_candidates)} 位候选人缺失党派信息')
            print(f'   ⚠️  {len(missing_candidates)} 位候选人缺失党派信息')
        else:
            print(f'   ✅ 所有候选人都有党派标签')

        # Step 4: 党派聚合
        print('\n4️⃣ 党派聚合统计...')
        party_totals = defaultdict(lambda: {'amount': 0, 'count': 0})

        for contrib in all_contributions:
            cand_id = contrib.get('candidate_id')
            amount_cents = contrib.get('transaction_amount', 0)

            if cand_id in candidate_data_map:
                party = candidate_data_map[cand_id]['party']
                party_totals[party]['amount'] += amount_cents
                party_totals[party]['count'] += 1

        # 存储党派分布
        for party, data in party_totals.items():
            result['party_distribution'][party] = {
                'amount_cents': data['amount'],
                'amount_dollars': data['amount'] / 100,
                'count': data['count']
            }

        # 显示结果
        total_cents = sum(p['amount'] for p in party_totals.values())
        total_dollars = total_cents / 100

        print(f'\n   {"党派":<20} {"金额":<15} {"百分比":<10} {"次数":<8}')
        print(f'   {"-"*60}')

        for party in sorted(party_totals.keys(), key=lambda p: -party_totals[p]['amount']):
            amount = party_totals[party]['amount'] / 100
            count = party_totals[party]['count']
            pct = (party_totals[party]['amount'] / total_cents * 100) if total_cents > 0 else 0

            party_name = {
                'DEM': '民主党',
                'REP': '共和党',
                'LIB': '自由党',
                'IND': '独立',
                'UNK': '未知'
            }.get(party, party)

            print(f'   {party_name:<20} ${amount:>12,.2f} {pct:>8.1f}% {count:>6}')

        print(f'   {"-"*60}')
        print(f'   {"总计":<20} ${total_dollars:>12,.2f} {"100.0%":>9} {len(all_contributions):>6}')

        # 保存样本数据（前 5 条）
        for contrib in all_contributions[:5]:
            cand_id = contrib.get('candidate_id')
            if cand_id in candidate_data_map:
                cand_info = candidate_data_map[cand_id]
                result['sample_contributions'].append({
                    'amount_cents': contrib.get('transaction_amount', 0),
                    'candidate_name': cand_info['name'],
                    'party': cand_info['party'],
                    'date': contrib.get('transaction_date', '')
                })

        # 最终判断
        all_checks_passed = (
            len(committee_ids) > 0 and
            len(all_contributions) > 0 and
            len(duplicates) == 0 and
            len(missing_candidates) == 0
        )

        result['passed'] = all_checks_passed

        if all_checks_passed:
            print(f'\n   ✅ {company_name} 数据验证通过！')
        else:
            print(f'\n   ⚠️  {company_name} 数据存在问题')

    except Exception as e:
        result['issues'].append(f'验证出错: {str(e)}')
        print(f'   ❌ 验证出错: {e}')

    return result

def main():
    """批量验证多个公司"""
    print('\n' + '='*90)
    print('🔍 批量验证 FEC 公司数据')
    print('='*90)

    init_firestore()

    # 要验证的公司列表
    companies_to_verify = [
        'THE BOEING COMPANY',
        'AT&T INC.',
        'WALMART INC.',
        'COMCAST CORPORATION',
        'HONEYWELL INTERNATIONAL',
        'AMERICAN BANKERS ASSOCIATION (ABA)',
        'NATIONAL ASSOCIATION OF REALTORS',
        'RTX CORPORATION',
    ]

    all_results = []

    for company in companies_to_verify:
        result = verify_single_company(company)
        all_results.append(result)

    # 生成总结报告
    print('\n\n' + '='*90)
    print('📊 验证总结报告')
    print('='*90 + '\n')

    passed_companies = [r for r in all_results if r['passed']]
    failed_companies = [r for r in all_results if not r['passed']]

    print(f'✅ 通过验证: {len(passed_companies)}/{len(all_results)} 个公司\n')

    if passed_companies:
        print('通过验证的公司:')
        for r in passed_companies:
            print(f'  ✅ {r["company_name"]}')
            print(f'     - {r["contribution_count"]} 笔捐款, {r["candidate_count"]} 位候选人')
            if 'DEM' in r['party_distribution'] and 'REP' in r['party_distribution']:
                dem = r['party_distribution']['DEM']['amount_dollars']
                rep = r['party_distribution']['REP']['amount_dollars']
                total = dem + rep
                if total > 0:
                    dem_pct = (dem / total) * 100
                    rep_pct = (rep / total) * 100
                    print(f'     - 民主党 {dem_pct:.1f}% | 共和党 {rep_pct:.1f}%')
            print()

    if failed_companies:
        print('\n未通过验证的公司:')
        for r in failed_companies:
            print(f'  ❌ {r["company_name"]}')
            for issue in r['issues']:
                print(f'     - {issue}')
            print()

    # 保存详细报告到 JSON
    report_file = Path(__file__).parent.parent / 'reports' / '02-company-verification-report.json'
    with open(report_file, 'w', encoding='utf-8') as f:
        json.dump({
            'timestamp': datetime.now().isoformat(),
            'total_companies': len(all_results),
            'passed_count': len(passed_companies),
            'failed_count': len(failed_companies),
            'results': all_results
        }, f, indent=2, ensure_ascii=False)

    print(f'\n📄 详细报告已保存至: {report_file}')
    print('\n' + '='*90)

    # 返回通过验证的公司列表
    if passed_companies:
        print(f'\n🎯 推荐使用的公司 (已通过所有验证):')
        for idx, r in enumerate(passed_companies[:5], 1):
            print(f'{idx}. {r["company_name"]}')

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
