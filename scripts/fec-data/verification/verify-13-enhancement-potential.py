#!/usr/bin/env python3
"""
分析 FEC Transfer & Linkage 数据的提升潜力

目标:
1. 统计当前有多少公司有 FEC 数据 (baseline)
2. 统计有多少公司能通过 committees + transfers 获得新数据
3. 计算数据覆盖率提升
4. 估算捐款金额的提升

测试范围: SP500 84个公司
"""

import sys
import os
from typing import Dict, List, Optional, Tuple
from collections import defaultdict

# 添加项目根目录到Python路径
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../..')))

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

# SP500 companies (与 01-collect-fec-donations.py 保持一致)
SP500_TICKERS = [
    # Technology
    'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'AVGO', 'ORCL', 'CRM',
    'AMD', 'INTC', 'IBM', 'CSCO', 'ADBE',

    # Financial
    'BRK.B', 'JPM', 'V', 'MA', 'BAC', 'WFC', 'GS', 'MS', 'BLK', 'C',

    # Healthcare
    'UNH', 'JNJ', 'LLY', 'PFE', 'MRK', 'ABBV', 'TMO', 'ABT', 'CVS', 'BMY',

    # Consumer
    'WMT', 'PG', 'KO', 'PEP', 'COST', 'HD', 'MCD', 'NKE', 'SBUX', 'TGT', 'LOW', 'DIS',

    # Energy
    'XOM', 'CVX', 'COP', 'SLB', 'EOG', 'OXY', 'PSX', 'VLO',

    # Industrial
    'GE', 'CAT', 'RTX', 'HON', 'UPS', 'BA', 'LMT', 'DE', 'NOC', 'GD',

    # Communications
    'NFLX', 'CMCSA', 'T', 'VZ', 'TMUS',

    # Utilities
    'NEE', 'DUK', 'SO', 'D',

    # Materials
    'LIN', 'APD', 'SHW', 'FCX', 'NEM',

    # Real Estate
    'PLD', 'AMT', 'CCI', 'EQIX', 'SPG'
]

class EnhancementAnalyzer:
    def __init__(self):
        self.db = db

        # 统计数据
        self.current_coverage = {
            'has_data': [],
            'no_data': []
        }

        self.enhancement_potential = {
            'new_companies': [],  # 原本无数据，现在有PAC
            'enhanced_companies': [],  # 原本有数据，PAC增强
            'still_no_data': []  # 仍然无数据
        }

        self.company_details = {}

    def normalize_company_name(self, name: str) -> str:
        """规范化公司名称用于匹配"""
        if not name:
            return ""
        return name.upper().strip()

    def get_ticker_display_name(self, ticker: str) -> str:
        """获取ticker的标准公司名称"""
        # 简化版本 - 实际可以从 fec_company_name_variants 获取
        TICKER_TO_NAME = {
            'AAPL': 'APPLE INC',
            'MSFT': 'MICROSOFT CORPORATION',
            'GOOGL': 'ALPHABET INC',
            'AMZN': 'AMAZON.COM INC',
            'META': 'META PLATFORMS INC',
            'TSLA': 'TESLA INC',
            'JPM': 'JPMORGAN CHASE & CO',
            'BAC': 'BANK OF AMERICA CORPORATION',
            'WMT': 'WALMART INC',
            'XOM': 'EXXON MOBIL CORPORATION',
            'CVX': 'CHEVRON CORPORATION',
            'JNJ': 'JOHNSON & JOHNSON',
            'PG': 'PROCTER & GAMBLE COMPANY',
            'V': 'VISA INC',
            'MA': 'MASTERCARD INCORPORATED',
        }
        return TICKER_TO_NAME.get(ticker, ticker)

    def check_current_fec_data(self, ticker: str) -> Tuple[bool, float]:
        """
        检查当前production数据中该公司是否有FEC数据

        Returns:
            (has_data, total_usd)
        """
        doc_ref = self.db.collection('company_rankings_by_ticker').document(ticker)
        doc = doc_ref.get()

        if not doc.exists:
            return False, 0.0

        data = doc.to_dict()
        fec_data = data.get('fec_data', {})

        total_usd = fec_data.get('total_usd', 0)

        # 如果有捐款金额，认为有数据
        return total_usd > 0, total_usd

    def find_pac_committees(self, ticker: str) -> List[Dict]:
        """
        在 fec_raw_committees 中查找该公司的PAC委员会

        策略:
        1. 使用公司标准名称搜索 connected_org_name
        2. 只选择类型为 'Q' (PAC) 的委员会
        """
        company_name = self.get_ticker_display_name(ticker)
        normalized_name = self.normalize_company_name(company_name)

        # 搜索 connected_org_name
        committee_ref = self.db.collection('fec_raw_committees')

        # 查询所有可能的变体
        search_terms = [
            normalized_name,
            normalized_name.replace(' INC', ''),
            normalized_name.replace(' CORPORATION', ''),
            normalized_name.replace(' CORP', ''),
        ]

        found_committees = []

        for term in search_terms:
            try:
                docs = list(committee_ref.where(
                    filter=firestore.FieldFilter('connected_org_name', '>=', term)
                ).where(
                    filter=firestore.FieldFilter('connected_org_name', '<=', term + '\uf8ff')
                ).limit(5).stream())

                for doc in docs:
                    data = doc.to_dict()

                    # 只选择 PAC (类型 Q)
                    if data.get('committee_type') == 'Q':
                        found_committees.append({
                            'cmte_id': data.get('committee_id', ''),
                            'cmte_nm': data.get('committee_name', ''),
                            'connected_org': data.get('connected_org_name', ''),
                            'cmte_type': data.get('committee_type', '')
                        })
            except Exception:
                continue

        # 去重
        unique_committees = {}
        for c in found_committees:
            cmte_id = c['cmte_id']
            if cmte_id not in unique_committees:
                unique_committees[cmte_id] = c

        return list(unique_committees.values())

    def get_pac_transfer_totals(self, cmte_id: str) -> Tuple[float, int]:
        """
        查询该PAC在 fec_raw_transfers 中的总捐款金额

        Returns:
            (total_amount, transaction_count)
        """
        transfer_ref = self.db.collection('fec_raw_transfers')

        try:
            # 查询该委员会的所有转账记录
            docs = list(transfer_ref.where(
                filter=firestore.FieldFilter('committee_id', '==', cmte_id)
            ).limit(1000).stream())  # 限制1000条，避免查询过大

            total_amount = 0.0
            count = 0

            for doc in docs:
                data = doc.to_dict()
                amount = data.get('transaction_amount', 0)
                if amount and amount > 0:
                    total_amount += amount
                    count += 1

            return total_amount, count

        except Exception as e:
            print(f"    ⚠️  Error querying transfers for {cmte_id}: {str(e)}")
            return 0.0, 0

    def analyze_ticker(self, ticker: str, index: int, total: int):
        """分析单个ticker的提升潜力"""
        print(f"\n[{index}/{total}] {ticker}", end='')

        # Step 1: 检查当前数据
        has_current_data, current_amount = self.check_current_fec_data(ticker)

        if has_current_data:
            print(f" - Current: ${current_amount:,.0f}", end='')
            self.current_coverage['has_data'].append(ticker)
        else:
            print(f" - Current: No data", end='')
            self.current_coverage['no_data'].append(ticker)

        # Step 2: 查找PAC委员会
        committees = self.find_pac_committees(ticker)

        if not committees:
            print(f" | PAC: None found")
            self.enhancement_potential['still_no_data'].append(ticker)
            self.company_details[ticker] = {
                'current_amount': current_amount,
                'pac_amount': 0,
                'pac_committees': [],
                'enhancement': 'no_pac'
            }
            return

        print(f" | PAC: Found {len(committees)}", end='')

        # Step 3: 查询PAC的transfer金额
        total_pac_amount = 0.0
        total_pac_transactions = 0

        for committee in committees:
            amount, count = self.get_pac_transfer_totals(committee['cmte_id'])
            committee['transfer_amount'] = amount
            committee['transfer_count'] = count
            total_pac_amount += amount
            total_pac_transactions += count

        print(f" | Transfer: ${total_pac_amount:,.0f} ({total_pac_transactions} txns)")

        # Step 4: 分类增强类型
        if has_current_data:
            if total_pac_amount > 0:
                self.enhancement_potential['enhanced_companies'].append(ticker)
                enhancement_type = 'enhanced'
            else:
                self.enhancement_potential['still_no_data'].append(ticker)
                enhancement_type = 'pac_found_no_transfers'
        else:
            if total_pac_amount > 0:
                self.enhancement_potential['new_companies'].append(ticker)
                enhancement_type = 'new_data'
            else:
                self.enhancement_potential['still_no_data'].append(ticker)
                enhancement_type = 'pac_found_no_transfers'

        self.company_details[ticker] = {
            'current_amount': current_amount,
            'pac_amount': total_pac_amount,
            'pac_committees': committees,
            'pac_transactions': total_pac_transactions,
            'enhancement': enhancement_type
        }

    def run_analysis(self):
        """运行完整分析"""
        print("="*70)
        print("📊 FEC Transfer & Linkage Enhancement Potential Analysis")
        print("="*70)
        print(f"测试范围: {len(SP500_TICKERS)} SP500 companies")
        print("="*70)

        for i, ticker in enumerate(SP500_TICKERS, 1):
            try:
                self.analyze_ticker(ticker, i, len(SP500_TICKERS))
            except Exception as e:
                print(f"\n  ❌ Error analyzing {ticker}: {str(e)}")
                import traceback
                traceback.print_exc()

        self.print_summary()

    def print_summary(self):
        """打印分析总结"""
        print("\n\n" + "="*70)
        print("📈 Enhancement Potential Summary")
        print("="*70)

        # 当前状态
        current_has_data = len(self.current_coverage['has_data'])
        current_no_data = len(self.current_coverage['no_data'])
        total = len(SP500_TICKERS)

        print(f"\n🔹 Current State (Baseline):")
        print(f"  ✅ Has FEC data: {current_has_data}/{total} ({current_has_data*100/total:.1f}%)")
        print(f"  ❌ No FEC data: {current_no_data}/{total} ({current_no_data*100/total:.1f}%)")

        # 增强潜力
        new_companies = len(self.enhancement_potential['new_companies'])
        enhanced_companies = len(self.enhancement_potential['enhanced_companies'])
        still_no_data = len(self.enhancement_potential['still_no_data'])

        print(f"\n🔹 Enhancement Potential:")
        print(f"  🆕 New companies (原本无数据，PAC有数据): {new_companies}/{total} ({new_companies*100/total:.1f}%)")
        print(f"  ⬆️  Enhanced companies (原本有数据，PAC增强): {enhanced_companies}/{total} ({enhanced_companies*100/total:.1f}%)")
        print(f"  ⚠️  Still no data (仍然无数据): {still_no_data}/{total} ({still_no_data*100/total:.1f}%)")

        # 覆盖率提升
        after_enhancement = current_has_data + new_companies
        coverage_increase = after_enhancement - current_has_data

        print(f"\n🔹 Coverage Improvement:")
        print(f"  Before: {current_has_data}/{total} ({current_has_data*100/total:.1f}%)")
        print(f"  After: {after_enhancement}/{total} ({after_enhancement*100/total:.1f}%)")
        print(f"  Increase: +{coverage_increase} companies (+{coverage_increase*100/total:.1f} percentage points)")

        # 金额提升
        total_current_amount = sum(d['current_amount'] for d in self.company_details.values())
        total_pac_amount = sum(d['pac_amount'] for d in self.company_details.values())
        total_after = total_current_amount + total_pac_amount

        print(f"\n🔹 Donation Amount Enhancement:")
        print(f"  Current (Individual): ${total_current_amount:,.0f}")
        print(f"  PAC Transfers: ${total_pac_amount:,.0f}")
        print(f"  Combined Total: ${total_after:,.0f}")
        if total_current_amount > 0:
            increase_pct = (total_pac_amount / total_current_amount) * 100
            print(f"  Increase: +{increase_pct:.1f}%")

        # 详细列表
        if new_companies > 0:
            print(f"\n🔹 New Companies (获得新数据):")
            for ticker in self.enhancement_potential['new_companies'][:10]:  # 只显示前10个
                details = self.company_details[ticker]
                print(f"  • {ticker}: ${details['pac_amount']:,.0f} (PAC) | {len(details['pac_committees'])} committees")
            if new_companies > 10:
                print(f"  ... and {new_companies - 10} more")

        if enhanced_companies > 0:
            print(f"\n🔹 Enhanced Companies (数据增强):")
            for ticker in self.enhancement_potential['enhanced_companies'][:10]:
                details = self.company_details[ticker]
                before = details['current_amount']
                pac = details['pac_amount']
                after = before + pac
                increase = (pac / before * 100) if before > 0 else 0
                print(f"  • {ticker}: ${before:,.0f} → ${after:,.0f} (+{increase:.0f}%)")
            if enhanced_companies > 10:
                print(f"  ... and {enhanced_companies - 10} more")

        print("\n" + "="*70)
        print("✅ Analysis Complete")
        print("="*70)

def main():
    analyzer = EnhancementAnalyzer()
    analyzer.run_analysis()

if __name__ == "__main__":
    main()
