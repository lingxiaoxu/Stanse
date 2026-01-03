#!/usr/bin/env python3
"""
发现所有有PAC数据的公司

目标:
1. 扫描 fec_raw_committees 中所有 PAC (type='Q')
2. 检查每个PAC是否有transfers数据
3. 按照connected_org_name分组，找出所有有PAC捐款的公司
4. 输出公司列表，准备进行后续处理

运行方式:
    python3 13-discover-all-pac-companies.py --scan
    python3 13-discover-all-pac-companies.py --update-index  # 更新fec_company_index和fec_company_name_variants

输出:
    - logs/fec-data/discovered_pac_companies.json
    - 包含所有有PAC数据的公司及其相关信息
"""

import os
import sys
import json
import argparse
import time
from datetime import datetime
from typing import Dict, List, Optional, Tuple, Set
from collections import defaultdict

# 添加项目根目录到Python路径
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.abspath(os.path.join(SCRIPT_DIR, '../../..')))

# 导入Firebase Admin
import firebase_admin
from firebase_admin import credentials, firestore

# 初始化Firebase
if not firebase_admin._apps:
    cred = credentials.ApplicationDefault()
    firebase_admin.initialize_app(cred, {
        'projectId': 'stanseproject'
    })

db = firestore.client()

# 日志目录
LOGS_DIR = os.path.join(SCRIPT_DIR, '../../../logs/fec-data')
os.makedirs(LOGS_DIR, exist_ok=True)


class PACCompanyDiscovery:
    def __init__(self, data_year: int = 2024, dry_run: bool = False):
        self.db = db
        self.data_year = data_year
        self.dry_run = dry_run

        # 发现的公司信息
        self.discovered_companies = {}  # {normalized_name: company_info}
        self.existing_index = set()  # 现有的index中的normalized_name

        print(f"✅ Firebase initialized (project: stanseproject)")
        print(f"📅 Data year: {data_year}")
        if dry_run:
            print(f"🔍 DRY RUN MODE - No writes to Firebase")
        print()

    def normalize_company_name(self, name: str) -> str:
        """规范化公司名称"""
        if not name:
            return ""

        # 转小写，去空格
        normalized = name.lower().strip()

        # 移除符号
        normalized = normalized.replace('&', '').replace(',', '').replace('.', '').replace("'", '')

        # 移除常见后缀
        for suffix in [' inc', ' incorporated', ' corporation', ' corp', ' company', ' co', ' ltd', ' llc', ' limited']:
            if normalized.endswith(suffix):
                normalized = normalized[:-len(suffix)].strip()

        # 清理多余空格
        normalized = ' '.join(normalized.split())

        return normalized

    def extract_company_from_committee_name(self, committee_name: str) -> str:
        """
        从committee_name中提取公司名称

        适用于connected_org_name='NONE'的情况

        示例:
        - "ALASKA STATE MEDICAL ASSOCIATION POLITICAL ACTION COMMITTEE (ALPAC)" → "ALASKA STATE MEDICAL ASSOCIATION"
        - "AKIN GUMP STRAUSS HAUER & FELD LLP CIVIC ACTION COMMITTEE" → "AKIN GUMP STRAUSS HAUER & FELD LLP"
        - "BRACEPAC" → "BRACEPAC"
        """
        if not committee_name:
            return ""

        name = committee_name.strip()
        original_name = name

        # 移除括号及其内容 (如 "(ALPAC)") - 先做这个
        import re
        name = re.sub(r'\([^)]*\)', '', name).strip()

        # 移除常见的PAC/委员会相关后缀 - 但要小心不要移除太多
        # 按顺序尝试，从最具体的到最通用的
        pac_suffixes = [
            ' POLITICAL ACTION COMMITTEE',
            ' CIVIC ACTION COMMITTEE',
            ' FEDERAL POLITICAL ACTION COMMITTEE',
            ' FEDERAL PAC',
        ]

        # 尝试匹配并移除 (需要有前导空格，避免误匹配)
        for suffix in pac_suffixes:
            if name.upper().endswith(suffix.strip()):
                name = name[:-(len(suffix.strip()))].strip()
                break

        # 如果没有匹配到上述长后缀，检查是否以单独的PAC或COMMITTEE结尾
        # 但只在有多个词的情况下才移除 (避免"BRACEPAC"变成"BRACE")
        if ' ' in name:
            if name.upper().endswith(' PAC'):
                name = name[:-4].strip()
            elif name.upper().endswith(' COMMITTEE'):
                name = name[:-10].strip()

        # 如果提取后的名称太短（可能提取失败），返回原名
        if len(name) < 3:
            return original_name

        return name

    def load_existing_index(self):
        """加载现有的fec_company_index"""
        print("📂 Loading existing fec_company_index...")

        try:
            docs = self.db.collection('fec_company_index').stream()
            count = 0
            for doc in docs:
                data = doc.to_dict()
                normalized_name = data.get('normalized_name', '')
                if normalized_name:
                    self.existing_index.add(normalized_name)
                    count += 1

            print(f"   ✅ Loaded {count} existing companies from index\\n")
        except Exception as e:
            print(f"   ⚠️  Error loading index: {str(e)}\\n")

    def scan_all_pac_committees(self) -> Dict[str, List[Dict]]:
        """
        扫描所有PAC委员会，按照connected_org_name分组

        Returns:
            {connected_org_name: [committee1, committee2, ...]}
        """
        print("=" * 70)
        print("🔍 Scanning all PAC committees (type='Q')...")
        print("=" * 70)

        committees_by_org = defaultdict(list)

        try:
            # 查询所有 PAC (committee_type='Q')
            committee_ref = self.db.collection('fec_raw_committees')

            # Firestore doesn't support offset-based pagination well, so we'll use cursor-based
            batch_size = 1000
            last_doc = None
            total_pacs = 0

            while True:
                # 只查询 committee_type='Q', 不限制year (因为year字段可能不存在或格式不一致)
                query = committee_ref.where(
                    filter=firestore.FieldFilter('committee_type', '==', 'Q')
                ).limit(batch_size)

                if last_doc:
                    query = query.start_after(last_doc)

                docs = list(query.stream())

                if not docs:
                    break

                for doc in docs:
                    data = doc.to_dict()
                    connected_org = data.get('connected_org_name', '').strip()
                    committee_name = data.get('committee_name', '').strip()

                    # 如果connected_org是NONE，从committee_name提取公司名
                    if connected_org.upper() == 'NONE':
                        extracted_org = self.extract_company_from_committee_name(committee_name)
                        if extracted_org:
                            connected_org = extracted_org
                        else:
                            # 提取失败，跳过
                            continue

                    # 跳过空值
                    if connected_org:
                        committees_by_org[connected_org].append({
                            'committee_id': data.get('committee_id', ''),
                            'committee_name': committee_name,
                            'connected_org_name': connected_org
                        })
                        total_pacs += 1

                last_doc = docs[-1]
                print(f"   Processed {total_pacs} PACs so far...")

                if len(docs) < batch_size:
                    break

            print(f"\\n   ✅ Found {total_pacs} PAC committees from {len(committees_by_org)} organizations\\n")

        except Exception as e:
            print(f"   ❌ Error scanning committees: {str(e)}\\n")
            import traceback
            traceback.print_exc()

        return dict(committees_by_org)

    def check_committee_has_transfers(self, committee_id: str) -> Tuple[bool, int, float]:
        """
        检查委员会是否有转账记录

        Returns:
            (has_transfers, transfer_count, total_amount)
        """
        try:
            transfer_ref = self.db.collection('fec_raw_transfers')

            # 只查询1条记录来快速检查
            docs = list(transfer_ref.where(
                filter=firestore.FieldFilter('committee_id', '==', committee_id)
            ).limit(1).stream())

            has_transfers = len(docs) > 0

            if has_transfers:
                # 如果有transfer，统计总数和金额
                # 由于Firestore没有聚合查询，我们暂时返回has_transfers即可
                # 后续收集时会详细统计
                return True, 1, 0.0

            return False, 0, 0.0

        except Exception as e:
            return False, 0, 0.0

    def analyze_pac_companies(self, committees_by_org: Dict[str, List[Dict]]):
        """
        分析每个组织的PAC，检查是否有transfers
        """
        print("=" * 70)
        print("🔍 Analyzing PAC transfers for each organization...")
        print("=" * 70)

        total_orgs = len(committees_by_org)
        orgs_with_transfers = 0
        orgs_without_transfers = 0

        for i, (org_name, committees) in enumerate(committees_by_org.items(), 1):
            if i % 100 == 0:
                print(f"   Progress: {i}/{total_orgs} organizations...")

            # 检查至少一个committee有transfers
            has_any_transfer = False
            total_committees = len(committees)
            committees_with_transfers = []

            for committee in committees:
                has_transfer, count, amount = self.check_committee_has_transfers(committee['committee_id'])
                if has_transfer:
                    has_any_transfer = True
                    committees_with_transfers.append(committee)

            if has_any_transfer:
                # 规范化公司名称
                normalized_name = self.normalize_company_name(org_name)

                # 检查是否已在index中
                is_new = normalized_name not in self.existing_index

                # 保存公司信息
                self.discovered_companies[normalized_name] = {
                    'original_name': org_name,
                    'normalized_name': normalized_name,
                    'total_pac_committees': total_committees,
                    'committees_with_transfers': len(committees_with_transfers),
                    'committees': committees_with_transfers,
                    'is_new_company': is_new,
                    'data_year': self.data_year
                }

                orgs_with_transfers += 1
            else:
                orgs_without_transfers += 1

        print(f"\\n   ✅ Analysis complete:")
        print(f"      Organizations with transfers: {orgs_with_transfers}")
        print(f"      Organizations without transfers: {orgs_without_transfers}")
        print(f"      New companies (not in index): {sum(1 for c in self.discovered_companies.values() if c['is_new_company'])}")
        print()

    def save_discovery_report(self):
        """保存发现报告到JSON文件"""
        output_file = os.path.join(LOGS_DIR, f'discovered_pac_companies_{self.data_year}.json')

        report = {
            'scan_date': datetime.now().isoformat(),
            'data_year': self.data_year,
            'total_companies': len(self.discovered_companies),
            'new_companies': sum(1 for c in self.discovered_companies.values() if c['is_new_company']),
            'existing_companies': sum(1 for c in self.discovered_companies.values() if not c['is_new_company']),
            'companies': self.discovered_companies
        }

        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(report, f, indent=2, ensure_ascii=False)

        print(f"📄 Discovery report saved to: {output_file}")
        print()

    def update_company_index_and_variants(self):
        """
        为新发现的公司更新 fec_company_index 和 fec_company_name_variants

        注意: 只更新is_new_company=True的公司
        """
        print("=" * 70)
        print("📝 Updating fec_company_index and fec_company_name_variants...")
        print("=" * 70)

        new_companies = [c for c in self.discovered_companies.values() if c['is_new_company']]

        if not new_companies:
            print("   ℹ️  No new companies to add")
            return

        print(f"   📊 {len(new_companies)} new companies to add\\n")

        success_count = 0
        error_count = 0

        for i, company_info in enumerate(new_companies, 1):
            try:
                normalized_name = company_info['normalized_name']
                original_name = company_info['original_name']

                print(f"   [{i}/{len(new_companies)}] {original_name}")

                if self.dry_run:
                    print(f"      [DRY RUN] Would add to index: {normalized_name}")
                    success_count += 1
                    continue

                # Sanitize document IDs (Firestore不允许"/"字符)
                safe_normalized_name = normalized_name.replace('/', '-').replace('\\', '-')
                safe_original_name = original_name.replace('/', '-').replace('\\', '-')

                # 1. 添加到 fec_company_index
                index_ref = self.db.collection('fec_company_index').document(safe_normalized_name)
                index_ref.set({
                    'normalized_name': normalized_name,
                    'original_names': [original_name],
                    'has_pac_data': True,
                    'created_at': firestore.SERVER_TIMESTAMP,
                    'last_updated': firestore.SERVER_TIMESTAMP,
                    'source': 'pac_discovery'
                }, merge=True)

                # 2. 添加到 fec_company_name_variants
                variant_doc_id = f"{safe_normalized_name}_{safe_original_name.lower().replace(' ', '_')}"
                variant_ref = self.db.collection('fec_company_name_variants').document(variant_doc_id)
                variant_ref.set({
                    'normalized_name': normalized_name,
                    'variant_name': original_name,
                    'variant_name_lower': original_name.lower(),
                    'created_at': firestore.SERVER_TIMESTAMP,
                    'source': 'pac_discovery'
                })

                print(f"      ✅ Added to index and variants")
                success_count += 1

            except Exception as e:
                print(f"      ❌ Error: {str(e)}")
                error_count += 1

        print(f"\\n   ✅ Update complete:")
        print(f"      Success: {success_count}")
        print(f"      Errors: {error_count}")
        print()

    def run_discovery(self):
        """运行完整的发现流程"""
        start_time = time.time()

        print(f"\\n{'='*70}")
        print(f"🔍 PAC Company Discovery")
        print(f"{'='*70}")
        print(f"🕒 Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"{'='*70}\\n")

        # 1. 加载现有index
        self.load_existing_index()

        # 2. 扫描所有PAC委员会
        committees_by_org = self.scan_all_pac_committees()

        # 3. 分析每个组织的transfers
        self.analyze_pac_companies(committees_by_org)

        # 4. 保存发现报告
        self.save_discovery_report()

        execution_time = time.time() - start_time

        print(f"{'='*70}")
        print(f"✅ Discovery Complete")
        print(f"{'='*70}")
        print(f"📊 Total companies found: {len(self.discovered_companies)}")
        print(f"🆕 New companies: {sum(1 for c in self.discovered_companies.values() if c['is_new_company'])}")
        print(f"♻️  Existing companies: {sum(1 for c in self.discovered_companies.values() if not c['is_new_company'])}")
        print(f"🕒 Finished at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"⏱️  Execution time: {execution_time:.1f} seconds")
        print(f"{'='*70}\\n")


def main():
    parser = argparse.ArgumentParser(description='Discover all companies with PAC donation data')
    parser.add_argument('--scan', action='store_true', help='Scan and discover all PAC companies')
    parser.add_argument('--update-index', action='store_true', help='Update fec_company_index and variants for new companies')
    parser.add_argument('--year', type=int, default=2024, help='Data year (default: 2024)')
    parser.add_argument('--dry-run', action='store_true', help='Dry run mode (no writes)')

    args = parser.parse_args()

    if not args.scan and not args.update_index:
        print("❌ Please specify --scan or --update-index")
        print("   Example: python3 13-discover-all-pac-companies.py --scan")
        sys.exit(1)

    discovery = PACCompanyDiscovery(data_year=args.year, dry_run=args.dry_run)

    if args.scan:
        discovery.run_discovery()

    if args.update_index:
        # Load discovery report
        report_file = os.path.join(LOGS_DIR, f'discovered_pac_companies_{args.year}.json')
        if not os.path.exists(report_file):
            print(f"❌ Discovery report not found: {report_file}")
            print(f"   Please run --scan first")
            sys.exit(1)

        with open(report_file, 'r', encoding='utf-8') as f:
            report = json.load(f)

        discovery.discovered_companies = report['companies']
        discovery.load_existing_index()
        discovery.update_company_index_and_variants()


if __name__ == "__main__":
    main()
