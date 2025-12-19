#!/usr/bin/env python3
"""
查找 Firebase 中有有效捐款记录的公司

目的：从已上传的数据中找出有实际捐款记录的公司，用于测试 FEC 查询功能
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
DATA_YEAR = '24'  # 可选: '16', '18', '20', '22', '24'
db = None

def init_firestore():
    """初始化 Firestore"""
    global db
    print('🔧 初始化 Firestore 连接...')

    try:
        if not firebase_admin._apps:
            # 获取 access token
            access_token = os.environ.get('GCLOUD_ACCESS_TOKEN')

            if not access_token:
                print('  从 gcloud 获取 access token...')
                result = subprocess.run(
                    ['gcloud', 'auth', 'print-access-token'],
                    capture_output=True, text=True, check=True, timeout=30
                )
                access_token = result.stdout.strip()

            from google.oauth2 import credentials as oauth_creds
            cred = oauth_creds.Credentials(access_token)
            firebase_admin.initialize_app(cred, options={'projectId': PROJECT_ID})

        db = firestore.client()
        print(f'✅ Firestore 已连接 (项目: {PROJECT_ID})')
        return db
    except Exception as e:
        print(f'❌ 失败: {e}')
        sys.exit(1)

def find_companies_with_contributions():
    """查找有捐款记录的公司"""
    print('\n📊 分析已上传的数据...\n')

    # 1. 获取所有委员会（有 connected_org_name 的）
    print('1️⃣ 查询委员会数据...')
    committees_ref = db.collection('fec_raw_committees')
    committees = committees_ref.stream()

    # 建立 committee_id → company_name 映射
    committee_to_company = {}
    company_committees = defaultdict(list)

    for doc in committees:
        data = doc.to_dict()
        committee_id = data.get('committee_id')
        company_name = data.get('connected_org_name', '').strip()

        if committee_id and company_name:
            committee_to_company[committee_id] = company_name
            company_committees[company_name].append(committee_id)

    print(f'   找到 {len(committee_to_company)} 个有公司关联的委员会')
    print(f'   对应 {len(company_committees)} 个独特公司名\n')

    # 2. 查询捐款记录，统计每个公司的捐款
    print('2️⃣ 查询捐款记录...')
    contributions_ref = db.collection(f'fec_raw_contributions_pac_to_candidate_{DATA_YEAR}')
    contributions = contributions_ref.limit(50000).stream()  # 只查询部分用于测试

    # 统计每个公司的捐款
    company_contributions = defaultdict(lambda: {'count': 0, 'total_cents': 0, 'candidates': set()})

    contribution_count = 0
    for doc in contributions:
        data = doc.to_dict()
        committee_id = data.get('committee_id')
        candidate_id = data.get('candidate_id')
        amount_cents = data.get('transaction_amount', 0)

        if committee_id in committee_to_company:
            company_name = committee_to_company[committee_id]
            company_contributions[company_name]['count'] += 1
            company_contributions[company_name]['total_cents'] += amount_cents
            if candidate_id:
                company_contributions[company_name]['candidates'].add(candidate_id)

        contribution_count += 1
        if contribution_count % 10000 == 0:
            print(f'   已处理 {contribution_count} 条捐款记录...')

    print(f'   总计处理 {contribution_count} 条捐款记录\n')

    # 3. 排序并显示结果
    print('3️⃣ 有捐款记录的公司 TOP 20:\n')
    print(f'{"序号":<4} {"公司名":<50} {"捐款次数":<10} {"捐款总额":<15} {"候选人数"}')
    print('=' * 110)

    # 按捐款次数排序
    sorted_companies = sorted(
        company_contributions.items(),
        key=lambda x: x[1]['count'],
        reverse=True
    )[:20]

    valid_companies = []
    for idx, (company_name, stats) in enumerate(sorted_companies, 1):
        total_dollars = stats['total_cents'] / 100
        candidate_count = len(stats['candidates'])

        print(f'{idx:<4} {company_name[:48]:<50} {stats["count"]:<10} ${total_dollars:>12,.2f} {candidate_count:>10}')

        if stats['count'] >= 5:  # 至少 5 次捐款才算有效
            valid_companies.append({
                'name': company_name,
                'count': stats['count'],
                'total': total_dollars,
                'candidates': candidate_count
            })

    print('\n' + '=' * 110)
    print(f'\n✅ 找到 {len(valid_companies)} 个有效公司（至少 5 次捐款）\n')

    if valid_companies:
        print('🎯 推荐用于测试的公司（TOP 3）:\n')
        for idx, company in enumerate(valid_companies[:3], 1):
            print(f'{idx}. {company["name"]}')
            print(f'   - 捐款 {company["count"]} 次')
            print(f'   - 总额 ${company["total"]:,.2f}')
            print(f'   - 涉及 {company["candidates"]} 位候选人\n')

    return valid_companies

def main():
    """主函数"""
    print('\n' + '='*110)
    print('🔍 查找有有效 FEC 捐款记录的公司')
    print('='*110 + '\n')

    init_firestore()
    valid_companies = find_companies_with_contributions()

    print('='*110)
    print('✅ 分析完成！')
    print('='*110 + '\n')

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
