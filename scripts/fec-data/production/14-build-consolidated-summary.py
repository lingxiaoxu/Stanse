#!/usr/bin/env python3
"""
合并 fec_company_party_summary 和 fec_company_pac_transfers_summary
创建统一的 fec_company_consolidated collection

这个脚本会:
1. 从两个源collection读取数据
2. 按 (normalized_name, data_year) 合并数据
3. 保持与旧schema完全兼容的数据格式
4. 添加元数据字段标识数据来源
5. 写入到 fec_company_consolidated collection

Document ID format: {normalized_name}_{year}
Example: jpmorgan chase_2024
"""

import sys
import os
from collections import defaultdict
from typing import Dict, List, Optional
from datetime import datetime

# 添加项目根目录到Python路径
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.abspath(os.path.join(SCRIPT_DIR, '../../..')))

import firebase_admin
from firebase_admin import credentials, firestore
from google.api_core.exceptions import Unauthenticated

# 初始化Firebase
if not firebase_admin._apps:
    cred = credentials.ApplicationDefault()
    firebase_admin.initialize_app(cred, {
        'projectId': 'stanseproject'
    })

db = firestore.client()


def refresh_firestore_client():
    """刷新Firestore客户端和token"""
    global db
    print('  🔄 刷新Firestore连接和token...')

    try:
        db = firestore.client()
        print('  ✅ Token已刷新')
        return True
    except Exception as e:
        print(f'  ❌刷新失败: {e}')
        return False


class ConsolidatedBuilder:
    def __init__(self, data_year: int = 2024, dry_run: bool = False):
        self.db = db
        self.data_year = data_year
        self.dry_run = dry_run

        print(f'=' * 70)
        print(f'📊 FEC Consolidated Summary Builder')
        print(f'=' * 70)
        print(f'Data year: {data_year}')
        print(f'Dry run: {dry_run}')
        print()

    def merge_party_totals(self,
                          party_totals1: Dict,
                          party_totals2: Dict) -> Dict:
        """
        合并两个party_totals字典

        party_totals格式:
        {
            "DEM": {
                "total_amount": 12345,
                "contribution_count": 10
            },
            "REP": { ... }
        }
        """
        merged = defaultdict(lambda: {
            'total_amount': 0,
            'contribution_count': 0
        })

        # 添加第一个来源的数据
        for party, data in (party_totals1 or {}).items():
            merged[party]['total_amount'] += data.get('total_amount', 0)
            merged[party]['contribution_count'] += data.get('contribution_count', 0)

        # 添加第二个来源的数据
        for party, data in (party_totals2 or {}).items():
            merged[party]['total_amount'] += data.get('total_amount', 0)
            merged[party]['contribution_count'] += data.get('contribution_count', 0)

        # 转换为普通dict
        return dict(merged)

    def get_company_linkage_data(self, normalized_name: str) -> Optional[Dict]:
        """
        从 fec_company_party_summary 获取公司的linkage数据
        """
        try:
            doc_id = f"{normalized_name}_{self.data_year}"
            doc_ref = self.db.collection('fec_company_party_summary').document(doc_id)
            doc_snap = doc_ref.get()

            if doc_snap.exists:
                return doc_snap.to_dict()
            return None

        except Exception as e:
            print(f'  ⚠️  Error fetching linkage data for {normalized_name}: {e}')
            return None

    def get_company_pac_data(self, normalized_name: str) -> Optional[Dict]:
        """
        从 fec_company_pac_transfers_summary 获取公司的PAC数据
        Note: PAC collection sanitizes '/' to '-' in document IDs
        """
        try:
            # Sanitize document ID (replace / with -)
            sanitized_name = normalized_name.replace('/', '-')
            doc_id = f"{sanitized_name}_{self.data_year}"
            doc_ref = self.db.collection('fec_company_pac_transfers_summary').document(doc_id)
            doc_snap = doc_ref.get()

            if doc_snap.exists:
                return doc_snap.to_dict()
            return None

        except Exception as e:
            print(f'  ⚠️  Error fetching PAC data for {normalized_name}: {e}')
            return None

    def build_consolidated_record(self,
                                  normalized_name: str,
                                  linkage_data: Optional[Dict],
                                  pac_data: Optional[Dict]) -> Dict:
        """
        构建consolidated记录

        返回格式完全兼容 fec_company_party_summary 的schema:
        {
            "normalized_name": str,
            "company_name": str,
            "data_year": int,
            "total_contributed": int,  # cents
            "party_totals": {
                "DEM": {"total_amount": int, "contribution_count": int},
                "REP": {...}
            },
            "created_at": timestamp,
            "last_updated": timestamp,

            # 额外的元数据字段
            "data_sources": ["linkage", "pac_transfers"],  # 标识数据来源
            "linkage_total": int,        # linkage贡献的金额
            "pac_transfer_total": int,   # PAC transfer贡献的金额
            "has_linkage_data": bool,
            "has_pac_data": bool,
            "pac_committees": [],        # PAC委员会列表(来自pac_transfers)
        }
        """
        # 获取display name (优先使用linkage的company_name)
        company_name = None
        if linkage_data:
            company_name = linkage_data.get('company_name')
        if not company_name and pac_data:
            company_name = pac_data.get('company_name')
        if not company_name:
            company_name = normalized_name.upper()

        # 合并party_totals
        linkage_party_totals = linkage_data.get('party_totals', {}) if linkage_data else {}
        pac_party_totals = pac_data.get('party_totals', {}) if pac_data else {}
        merged_party_totals = self.merge_party_totals(linkage_party_totals, pac_party_totals)

        # 计算总金额
        linkage_total = linkage_data.get('total_contributed', 0) if linkage_data else 0
        pac_total = pac_data.get('total_contributed', 0) if pac_data else 0
        total_contributed = linkage_total + pac_total

        # 构建数据来源列表
        data_sources = []
        if linkage_data:
            data_sources.append('linkage')
        if pac_data:
            data_sources.append('pac_transfers')

        # 获取PAC委员会信息
        pac_committees = []
        if pac_data and 'committees' in pac_data:
            pac_committees = pac_data['committees']

        # 构建consolidated记录
        now = firestore.SERVER_TIMESTAMP

        consolidated = {
            # 基本字段 (兼容旧schema)
            'normalized_name': normalized_name,
            'company_name': company_name,
            'data_year': self.data_year,
            'total_contributed': total_contributed,
            'party_totals': merged_party_totals,
            'created_at': linkage_data.get('created_at') if linkage_data else now,
            'last_updated': now,

            # 元数据字段 (新增)
            'data_sources': data_sources,
            'linkage_total': linkage_total,
            'pac_transfer_total': pac_total,
            'has_linkage_data': bool(linkage_data),
            'has_pac_data': bool(pac_data),
            'pac_committees': pac_committees,
        }

        return consolidated

    def save_consolidated_record(self, normalized_name: str, data: Dict):
        """保存consolidated记录到Firestore
        Note: Sanitize '/' to '-' in document IDs for Firestore compatibility
        """
        # Sanitize document ID (replace / with -)
        sanitized_name = normalized_name.replace('/', '-')
        doc_id = f"{sanitized_name}_{self.data_year}"

        if self.dry_run:
            print(f'    [DRY RUN] Would save to fec_company_consolidated/{doc_id}')
            print(f'    Total: ${data["total_contributed"] / 100:.2f}')
            print(f'    Sources: {data["data_sources"]}')
            return

        try:
            doc_ref = self.db.collection('fec_company_consolidated').document(doc_id)
            doc_ref.set(data, merge=False)  # 完全覆盖，不merge
            print(f'    ✅ Saved to fec_company_consolidated/{doc_id}')

        except Unauthenticated as e:
            print(f'    ⚠️  Token过期，正在刷新并重试...')
            if refresh_firestore_client():
                try:
                    doc_ref = self.db.collection('fec_company_consolidated').document(doc_id)
                    doc_ref.set(data, merge=False)
                    print(f'    ✅ Saved to fec_company_consolidated/{doc_id}')
                except Exception as retry_e:
                    print(f'    ❌ 重试失败: {str(retry_e)}')
            else:
                print(f'    ❌ Token刷新失败')

        except Exception as e:
            print(f'    ❌ Error saving: {str(e)}')

    def collect_all_companies(self) -> List[str]:
        """
        收集所有需要处理的公司名称
        从两个源collection中获取所有normalized_name
        """
        print('📂 Collecting all companies from both sources...')

        all_companies = set()

        # 1. 从 fec_company_party_summary 收集
        print('  Scanning fec_company_party_summary...')
        try:
            query = self.db.collection('fec_company_party_summary').where(
                filter=firestore.FieldFilter('data_year', '==', self.data_year)
            )
            docs = list(query.stream())

            for doc in docs:
                data = doc.to_dict()
                normalized_name = data.get('normalized_name')
                if normalized_name:
                    all_companies.add(normalized_name)

            print(f'    Found {len(docs)} records')

        except Exception as e:
            print(f'    ⚠️  Error: {e}')

        # 2. 从 fec_company_pac_transfers_summary 收集
        print('  Scanning fec_company_pac_transfers_summary...')
        try:
            query = self.db.collection('fec_company_pac_transfers_summary').where(
                filter=firestore.FieldFilter('data_year', '==', self.data_year)
            )
            docs = list(query.stream())

            for doc in docs:
                data = doc.to_dict()
                normalized_name = data.get('normalized_name')
                if normalized_name:
                    all_companies.add(normalized_name)

            print(f'    Found {len(docs)} records')

        except Exception as e:
            print(f'    ⚠️  Error: {e}')

        companies_list = sorted(all_companies)
        print(f'\n📊 Total unique companies to process: {len(companies_list)}\n')

        return companies_list

    def build_all_consolidated(self):
        """构建所有公司的consolidated记录"""
        print('=' * 70)
        print(f'🚀 Building Consolidated Summary for {self.data_year}')
        print('=' * 70)
        print()

        # 收集所有需要处理的公司
        all_companies = self.collect_all_companies()

        if not all_companies:
            print('⚠️  No companies found to process')
            return

        print(f'Processing {len(all_companies)} companies...\n')

        success_count = 0
        error_count = 0

        for i, normalized_name in enumerate(all_companies, 1):
            print(f'[{i}/{len(all_companies)}] {normalized_name}')

            try:
                # 1. 获取两个来源的数据
                linkage_data = self.get_company_linkage_data(normalized_name)
                pac_data = self.get_company_pac_data(normalized_name)

                # 2. 构建consolidated记录
                consolidated = self.build_consolidated_record(
                    normalized_name,
                    linkage_data,
                    pac_data
                )

                # 3. 保存
                self.save_consolidated_record(normalized_name, consolidated)

                # 打印summary
                sources = consolidated['data_sources']
                total_usd = consolidated['total_contributed'] / 100.0
                print(f'    💰 Total: ${total_usd:,.2f} (sources: {", ".join(sources)})')

                success_count += 1

            except Exception as e:
                print(f'    ❌ Error: {str(e)}')
                error_count += 1

        # 最终报告
        print()
        print('=' * 70)
        print('📋 Summary')
        print('=' * 70)
        print(f'✅ Success: {success_count}/{len(all_companies)}')
        print(f'❌ Errors: {error_count}/{len(all_companies)}')
        print()


def main():
    import argparse

    parser = argparse.ArgumentParser(description='构建FEC consolidated summary')
    parser.add_argument('--year', type=int, default=2024, help='数据年份 (default: 2024)')
    parser.add_argument('--dry-run', action='store_true', help='Dry run (不实际写入数据)')

    args = parser.parse_args()

    builder = ConsolidatedBuilder(
        data_year=args.year,
        dry_run=args.dry_run
    )

    builder.build_all_consolidated()


if __name__ == '__main__':
    main()
