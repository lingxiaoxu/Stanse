#!/usr/bin/env python3
"""
FEC Data Linking Test - 演示公司->PAC->捐款->候选人->政党的数据链接

这个脚本展示核心功能：给定公司名称，返回政治捐款分布
"""

import re
from collections import defaultdict
from pathlib import Path

# 数据文件路径
DATA_DIR = Path(__file__).parent / 'raw_data'

# 数据年份配置 (默认使用2024年数据，可修改为16/18/20/22/24)
DATA_YEAR = '24'  # 可选: '16', '18', '20', '22', '24'

def normalize_company_name(name):
    """标准化公司名称用于匹配"""
    if not name:
        return ''
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

def find_company_pacs(company_name, cm_file):
    """
    步骤1: 在Committee Master文件中查找公司的PAC ID

    返回: [(committee_id, committee_name, connected_org)]
    """
    print(f'\n🔍 步骤1: 查找 "{company_name}" 的PAC...')

    normalized_search = normalize_company_name(company_name)
    pacs = []

    with open(cm_file, 'r', encoding='latin-1') as f:
        for line_num, line in enumerate(f, 1):
            fields = line.strip().split('|')
            if len(fields) < 14:
                continue

            committee_id = fields[0]
            committee_name = fields[1]
            connected_org = fields[13]

            # 在connected_org或committee_name中搜索
            if normalized_search in normalize_company_name(connected_org) or \
               normalized_search in normalize_company_name(committee_name):
                pacs.append((committee_id, committee_name, connected_org))

    print(f'✓ 找到 {len(pacs)} 个PAC:')
    for pac_id, pac_name, org in pacs[:5]:  # 只显示前5个
        print(f'  - {pac_id}: {pac_name}')
        if org:
            print(f'    (Connected to: {org})')

    if len(pacs) > 5:
        print(f'  ... and {len(pacs) - 5} more')

    return pacs

def find_pac_contributions(pac_ids, pas2_file):
    """
    步骤2: 在Contributions文件中查找这些PAC的捐款记录

    返回: [(candidate_id, amount)]
    """
    print(f'\n💰 步骤2: 查找PAC的捐款记录...')

    pac_id_set = set(pac_id for pac_id, _, _ in pac_ids)
    contributions = []

    with open(pas2_file, 'r', encoding='latin-1') as f:
        for line_num, line in enumerate(f, 1):
            fields = line.strip().split('|')
            if len(fields) < 17:
                continue

            committee_id = fields[0]  # 捐款方PAC ID
            candidate_id = fields[16]  # 接受方候选人ID
            amount_str = fields[14]  # 金额

            if committee_id in pac_id_set and candidate_id:
                try:
                    amount = float(amount_str) if amount_str else 0
                    if amount > 0:
                        contributions.append((candidate_id, amount))
                except ValueError:
                    continue

    print(f'✓ 找到 {len(contributions)} 笔捐款记录')
    total = sum(amount for _, amount in contributions)
    print(f'  总金额: ${total:,.2f}')

    return contributions

def aggregate_by_party(contributions, cn_file):
    """
    步骤3: 在Candidate Master文件中查找候选人政党，聚合捐款

    返回: {party: total_amount}
    """
    print(f'\n🏛️  步骤3: 按政党聚合捐款...')

    # 首先建立candidate_id -> party映射
    candidate_parties = {}
    with open(cn_file, 'r', encoding='latin-1') as f:
        for line in f:
            fields = line.strip().split('|')
            if len(fields) < 3:
                continue
            candidate_id = fields[0]
            party = fields[2]
            if candidate_id and party:
                candidate_parties[candidate_id] = party

    # 聚合捐款
    party_totals = defaultdict(float)
    for candidate_id, amount in contributions:
        party = candidate_parties.get(candidate_id, 'UNKNOWN')
        party_totals[party] += amount

    # 显示结果
    print(f'✓ 政党捐款分布:')
    total = sum(party_totals.values())
    for party in sorted(party_totals.keys(), key=lambda p: party_totals[p], reverse=True):
        amount = party_totals[party]
        percentage = (amount / total * 100) if total > 0 else 0
        print(f'  {party:15s}: ${amount:12,.2f} ({percentage:5.1f}%)')

    return dict(party_totals)

def query_company_politics(company_name):
    """
    完整查询流程：公司名称 -> 政党捐款分布
    """
    print(f'\n{"="*70}')
    print(f'查询公司: {company_name}')
    print(f'{"="*70}')

    # 检查必需的文件
    cm_file = DATA_DIR / 'committees' / f'cm{DATA_YEAR}.txt'
    cn_file = DATA_DIR / 'candidates' / f'cn{DATA_YEAR}.txt'
    pas2_file = DATA_DIR / 'contributions' / f'itpas2{DATA_YEAR}.txt'

    missing_files = []
    if not cm_file.exists():
        missing_files.append(str(cm_file))
    if not cn_file.exists():
        missing_files.append(str(cn_file))
    if not pas2_file.exists():
        missing_files.append(str(pas2_file))

    if missing_files:
        print('\n❌ 错误: 缺少必需的数据文件:')
        for file in missing_files:
            print(f'  - {file}')
        print('\n请先运行: python3 download_fec_data.py')
        return None

    # 执行三步查询
    pacs = find_company_pacs(company_name, cm_file)
    if not pacs:
        print(f'\n❌ 未找到 "{company_name}" 的PAC')
        return None

    contributions = find_pac_contributions(pacs, pas2_file)
    if not contributions:
        print(f'\n⚠️  未找到捐款记录')
        return {}

    party_totals = aggregate_by_party(contributions, cn_file)

    print(f'\n{"="*70}')
    print(f'✅ 查询完成!')
    print(f'{"="*70}\n')

    return party_totals

def main():
    """测试几个知名公司"""
    test_companies = [
        'Microsoft',
        'ExxonMobil',
        'American Medical Association',
        'Hallmark'
    ]

    results = {}
    for company in test_companies:
        party_totals = query_company_politics(company)
        if party_totals:
            results[company] = party_totals
        input('\n按Enter键继续下一个查询...')

    # 总结
    print('\n' + '='*70)
    print('📊 查询总结')
    print('='*70)
    for company, totals in results.items():
        total = sum(totals.values())
        print(f'\n{company}: ${total:,.2f} total')
        for party, amount in sorted(totals.items(), key=lambda x: x[1], reverse=True):
            print(f'  {party}: ${amount:,.2f}')

if __name__ == '__main__':
    # 如果数据文件不存在，给出提示
    if not (DATA_DIR / 'committees' / f'cm{DATA_YEAR}.txt').exists():
        print('\n⚠️  需要先下载FEC数据文件')
        print('\n运行以下命令下载数据（只下载2024年测试）:')
        print('  python3 -c "import test_data_linking; test_data_linking.download_test_data()"')
        print('\n或运行完整下载:')
        print('  python3 download_fec_data.py')
    else:
        main()
