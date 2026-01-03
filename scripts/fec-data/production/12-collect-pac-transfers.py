#!/usr/bin/env python3
"""
FEC PAC Transfers Collection Script

目标: 从 fec_raw_committees 和 fec_raw_transfers 收集企业PAC捐款数据
输出: fec_company_pac_transfers_summary/{ticker}

重要原则:
1. 数据保存到独立的 fec_company_pac_transfers_summary collection
2. 极其谨慎，不污染 fec_company_name_variants 和 fec_company_index
3. 使用只读模式，不修改任何现有collection
4. 新发现的name variants保存到 fec_pac_discovered_variants (临时collection)

运行方式:
    # 测试模式 (5个公司)
    python3 12-collect-pac-transfers.py --test

    # 生产模式 (所有SP500)
    python3 12-collect-pac-transfers.py --production

    # 所有发现的公司模式
    python3 12-collect-pac-transfers.py --all-discovered
    python3 12-collect-pac-transfers.py --all-discovered --start 0 --end 100

数据流:
    fec_raw_committees (connected_org_name) → 找到公司的PAC
           ↓
    fec_raw_transfers (committee_id) → 获取PAC的转账记录
           ↓
    按party分组统计 → fec_company_pac_transfers_summary
"""

import os
import sys
import json
import argparse
import time
from datetime import datetime
from typing import Dict, List, Optional, Tuple
from collections import defaultdict

# 添加项目根目录到Python路径
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.abspath(os.path.join(SCRIPT_DIR, '../../..')))

# 导入Firebase Admin
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
        # 重新获取Firestore客户端
        # Firebase Admin SDK会自动刷新ADC token
        db = firestore.client()
        print('  ✅ Token已刷新')
        return True
    except Exception as e:
        print(f'  ❌刷新失败: {e}')
        return False

# 日志目录
LOGS_DIR = os.path.join(SCRIPT_DIR, '../../../logs/fec-data')

# ============================================================================
# SP500 DATA - Import from unified data source
# ============================================================================
import sys
from pathlib import Path
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from data.sp500Companies import SP500_TICKERS

# 测试公司 (已知有PAC的公司)
TEST_TICKERS = ['MSFT', 'META', 'JPM', 'V', 'KO']

# Ticker到公司名称映射 (用于委员会搜索)
TICKER_TO_COMPANY_NAME = {
    'AAPL': 'APPLE INC',
    'MSFT': 'MICROSOFT CORPORATION',
    'GOOGL': 'ALPHABET INC',
    'AMZN': 'AMAZON.COM INC',
    'NVDA': 'NVIDIA CORPORATION',
    'META': 'META PLATFORMS INC',
    'TSLA': 'TESLA INC',
    'AVGO': 'BROADCOM INC',
    'ORCL': 'ORACLE CORPORATION',
    'CRM': 'SALESFORCE INC',
    'AMD': 'ADVANCED MICRO DEVICES INC',
    'INTC': 'INTEL CORPORATION',
    'IBM': 'INTERNATIONAL BUSINESS MACHINES CORPORATION',
    'CSCO': 'CISCO SYSTEMS INC',
    'ADBE': 'ADOBE INC',
    'JPM': 'JPMORGAN CHASE & CO',
    'V': 'VISA INC',
    'MA': 'MASTERCARD INCORPORATED',
    'BAC': 'BANK OF AMERICA CORPORATION',
    'WFC': 'WELLS FARGO & COMPANY',
    'GS': 'GOLDMAN SACHS GROUP INC',
    'MS': 'MORGAN STANLEY',
    'BLK': 'BLACKROCK INC',
    'C': 'CITIGROUP INC',
    'UNH': 'UNITEDHEALTH GROUP INCORPORATED',
    'JNJ': 'JOHNSON & JOHNSON',
    'LLY': 'ELI LILLY AND COMPANY',
    'PFE': 'PFIZER INC',
    'MRK': 'MERCK & CO INC',
    'ABBV': 'ABBVIE INC',
    'TMO': 'THERMO FISHER SCIENTIFIC INC',
    'ABT': 'ABBOTT LABORATORIES',
    'CVS': 'CVS HEALTH CORPORATION',
    'BMY': 'BRISTOL-MYERS SQUIBB COMPANY',
    'WMT': 'WALMART INC',
    'PG': 'PROCTER & GAMBLE COMPANY',
    'KO': 'COCA-COLA COMPANY',
    'PEP': 'PEPSICO INC',
    'COST': 'COSTCO WHOLESALE CORPORATION',
    'HD': 'HOME DEPOT INC',
    'MCD': 'MCDONALD\'S CORPORATION',
    'NKE': 'NIKE INC',
    'SBUX': 'STARBUCKS CORPORATION',
    'TGT': 'TARGET CORPORATION',
    'LOW': 'LOWE\'S COMPANIES INC',
    'DIS': 'WALT DISNEY COMPANY',
    'XOM': 'EXXON MOBIL CORPORATION',
    'CVX': 'CHEVRON CORPORATION',
    'COP': 'CONOCOPHILLIPS',
    'SLB': 'SCHLUMBERGER LIMITED',
    'EOG': 'EOG RESOURCES INC',
    'OXY': 'OCCIDENTAL PETROLEUM CORPORATION',
    'PSX': 'PHILLIPS 66',
    'VLO': 'VALERO ENERGY CORPORATION',
    'GE': 'GENERAL ELECTRIC COMPANY',
    'CAT': 'CATERPILLAR INC',
    'RTX': 'RAYTHEON TECHNOLOGIES CORPORATION',
    'HON': 'HONEYWELL INTERNATIONAL INC',
    'UPS': 'UNITED PARCEL SERVICE INC',
    'BA': 'BOEING COMPANY',
    'LMT': 'LOCKHEED MARTIN CORPORATION',
    'DE': 'DEERE & COMPANY',
    'NOC': 'NORTHROP GRUMMAN CORPORATION',
    'GD': 'GENERAL DYNAMICS CORPORATION',
    'NFLX': 'NETFLIX INC',
    'CMCSA': 'COMCAST CORPORATION',
    'T': 'AT&T INC',
    'VZ': 'VERIZON COMMUNICATIONS INC',
    'TMUS': 'T-MOBILE US INC',
    'NEE': 'NEXTERA ENERGY INC',
    'DUK': 'DUKE ENERGY CORPORATION',
    'SO': 'SOUTHERN COMPANY',
    'D': 'DOMINION ENERGY INC',
    'LIN': 'LINDE PLC',
    'APD': 'AIR PRODUCTS AND CHEMICALS INC',
    'SHW': 'SHERWIN-WILLIAMS COMPANY',
    'FCX': 'FREEPORT-MCMORAN INC',
    'NEM': 'NEWMONT CORPORATION',
    'PLD': 'PROLOGIS INC',
    'AMT': 'AMERICAN TOWER CORPORATION',
    'CCI': 'CROWN CASTLE INTERNATIONAL CORP',
    'EQIX': 'EQUINIX INC',
    'SPG': 'SIMON PROPERTY GROUP INC',
}


class PACTransfersCollector:
    """PAC Transfers 数据收集器"""

    def __init__(self, dry_run: bool = False, data_year: int = 2024):
        """
        初始化收集器

        Args:
            dry_run: 如果为True，只打印日志不写入Firebase
            data_year: 数据年份 (默认2024)
        """
        self.db = db
        self.dry_run = dry_run
        self.data_year = data_year
        self.discovered_variants = []  # 新发现的name variants
        self.discovered_companies = {}  # 用于 --all-discovered 模式

        print(f"✅ Firebase initialized (project: stanseproject)")
        print(f"📅 Data year: {data_year}")
        if dry_run:
            print(f"⚠️  DRY RUN MODE - No data will be written to Firebase")

    def load_discovered_companies(self):
        """加载discovered companies JSON"""
        json_file = os.path.join(LOGS_DIR, f'discovered_pac_companies_{self.data_year}.json')

        if not os.path.exists(json_file):
            print(f"❌ Discovery file not found: {json_file}")
            print(f"   Please run 13-discover-all-pac-companies.py --scan first")
            sys.exit(1)

        with open(json_file, 'r', encoding='utf-8') as f:
            report = json.load(f)

        self.discovered_companies = report['companies']

        print(f"📂 Loaded {len(self.discovered_companies)} discovered companies")
        print(f"   New companies: {report['new_companies']}")
        print(f"   Existing companies: {report['existing_companies']}")
        print()

    def normalize_company_name(self, name: str) -> str:
        """规范化公司名称"""
        if not name:
            return ""
        return name.upper().strip()

    def find_pac_committees(self, ticker: str) -> List[Dict]:
        """
        在 fec_raw_committees 中查找该公司的PAC委员会

        策略:
        1. 使用 TICKER_TO_COMPANY_NAME 映射获取公司标准名称
        2. 在 connected_org_name 中搜索
        3. 只选择类型为 'Q' (PAC) 的委员会
        """
        if ticker not in TICKER_TO_COMPANY_NAME:
            return []

        company_name = TICKER_TO_COMPANY_NAME[ticker]
        normalized_name = self.normalize_company_name(company_name)

        # 生成搜索变体
        search_terms = [
            normalized_name,
            normalized_name.replace(' INC', ''),
            normalized_name.replace(' INCORPORATED', ''),
            normalized_name.replace(' CORPORATION', ''),
            normalized_name.replace(' CORP', ''),
            normalized_name.replace(' & CO', ''),
            normalized_name.replace(',', ''),
        ]

        # 去重
        search_terms = list(set([t for t in search_terms if t]))

        committee_ref = self.db.collection('fec_raw_committees')
        found_committees = []

        for term in search_terms:
            try:
                docs = list(committee_ref.where(
                    filter=firestore.FieldFilter('connected_org_name', '>=', term)
                ).where(
                    filter=firestore.FieldFilter('connected_org_name', '<=', term + '\uf8ff')
                ).limit(10).stream())

                for doc in docs:
                    data = doc.to_dict()

                    # 只选择 PAC (类型 Q)
                    if data.get('committee_type') == 'Q':
                        cmte_id = data.get('committee_id', '')
                        if cmte_id and cmte_id not in [c['committee_id'] for c in found_committees]:
                            found_committees.append({
                                'committee_id': cmte_id,
                                'committee_name': data.get('committee_name', ''),
                                'connected_org_name': data.get('connected_org_name', ''),
                                'committee_type': data.get('committee_type', ''),
                                'year': data.get('year')
                            })

            except Exception as e:
                # 静默失败，继续下一个搜索term
                continue

        return found_committees

    def get_committee_candidate_id(self, committee_id: str) -> Optional[str]:
        """
        从 fec_raw_committees 获取委员会关联的候选人ID

        Args:
            committee_id: 委员会ID (如 C00326801)

        Returns:
            candidate_id 或 None
        """
        if not committee_id:
            return None

        try:
            # 查询该committee_id的所有记录（可能有多个年份）
            committee_ref = self.db.collection('fec_raw_committees')
            docs = list(committee_ref.where(
                filter=firestore.FieldFilter('committee_id', '==', committee_id)
            ).limit(1).stream())

            if docs:
                data = docs[0].to_dict()
                return data.get('candidate_id', '')

        except Exception:
            pass

        return None

    def get_candidate_party(self, candidate_id: str) -> Optional[str]:
        """
        从 fec_raw_candidates 获取候选人政党

        Returns:
            原始party code (DEM, REP, IND, LIB, GRE, UNK等) 或 None
        """
        if not candidate_id:
            return None

        try:
            # 查询该candidate_id的记录
            candidate_ref = self.db.collection('fec_raw_candidates')
            docs = list(candidate_ref.where(
                filter=firestore.FieldFilter('candidate_id', '==', candidate_id)
            ).limit(1).stream())

            if docs:
                data = docs[0].to_dict()
                party = data.get('party_affiliation', '').strip().upper()

                # 返回原始party code,保持与fec_company_party_summary一致
                # 常见的codes: DEM, REP, IND, LIB, GRE, UNK, NNE, PNP等
                return party if party else 'UNK'

        except Exception:
            pass

        return None

    def get_pac_transfers_by_party(self, committee_id: str) -> Dict:
        """
        查询该PAC在 fec_raw_transfers 中的按政党分组的捐款

        策略:
        1. 查询所有 committee_id == committee_id 的transfers
        2. 对于每个transfer，查询recipient的政党
        3. 按政党分组统计 (使用与fec_company_party_summary相同的结构)

        Returns:
            {
                'party_totals': {
                    'DEM': {'total_amount': float, 'contribution_count': int},
                    'REP': {'total_amount': float, 'contribution_count': int},
                    ...其他party codes
                },
                'total_usd': float,
                'total_count': int
            }
        """
        transfer_ref = self.db.collection('fec_raw_transfers')

        # 使用defaultdict动态收集所有party codes
        from collections import defaultdict
        party_totals = defaultdict(lambda: {'total_amount': 0.0, 'contribution_count': 0})

        try:
            # 查询该委员会的所有转账记录
            # 注意: 这里可能返回很多records，需要分批查询
            docs = list(transfer_ref.where(
                filter=firestore.FieldFilter('committee_id', '==', committee_id)
            ).limit(5000).stream())  # 限制5000条，避免查询过大

            for doc in docs:
                data = doc.to_dict()
                amount = data.get('transaction_amount', 0)

                if amount and amount > 0:
                    # 获取收款方committee_id
                    receiver_committee_id = data.get('receiver_committee_id', '')

                    # 从committee获取candidate_id
                    candidate_id = self.get_committee_candidate_id(receiver_committee_id)

                    # 查询候选人政党
                    party = self.get_candidate_party(candidate_id) if candidate_id else None

                    if party is None:
                        # 如果找不到candidate，归为UNK (Unknown)
                        party = 'UNK'

                    # 动态添加到party_totals
                    party_totals[party]['total_amount'] += amount
                    party_totals[party]['contribution_count'] += 1

        except Unauthenticated as e:
            print(f"      ⚠️  Token过期，正在刷新并重试...")
            if refresh_firestore_client():
                # 重新查询
                try:
                    transfer_ref = self.db.collection('fec_raw_transfers')
                    docs = list(transfer_ref.where(
                        filter=firestore.FieldFilter('committee_id', '==', committee_id)
                    ).limit(5000).stream())

                    for doc in docs:
                        data = doc.to_dict()
                        amount = data.get('transaction_amount', 0)

                        if amount and amount > 0:
                            receiver_committee_id = data.get('receiver_committee_id', '')
                            candidate_id = self.get_committee_candidate_id(receiver_committee_id)
                            party = self.get_candidate_party(candidate_id) if candidate_id else None

                            if party is None:
                                party = 'UNK'

                            party_totals[party]['total_amount'] += amount
                            party_totals[party]['contribution_count'] += 1

                except Exception as retry_e:
                    print(f"      ❌ 重试失败: {str(retry_e)}")
            else:
                print(f"      ❌ Token刷新失败")
        except Exception as e:
            print(f"      ⚠️  Error querying transfers: {str(e)}")

        # 计算总计
        total_usd = sum(p['total_amount'] for p in party_totals.values())
        total_count = sum(p['contribution_count'] for p in party_totals.values())

        # 转换defaultdict为普通dict
        result = {
            'party_totals': dict(party_totals),
            'total_usd': total_usd,
            'total_count': total_count
        }

        return result

    def collect_pac_transfers_for_ticker(self, ticker: str) -> Optional[Dict]:
        """
        收集单个ticker的PAC transfer数据

        Returns:
            {
                'company_name': str,
                'normalized_name': str,
                'data_year': int,
                'party_totals': Dict[str, Dict],
                'total_contributed': float,
                'committees': List[Dict],  # PAC特有字段
                'data_source': 'pac_transfers',  # PAC特有字段
                'created_at': timestamp,
                'last_updated': timestamp
            }
        """
        # Step 1: 查找PAC委员会
        committees = self.find_pac_committees(ticker)

        if not committees:
            return None

        print(f"    ✅ Found {len(committees)} PAC committee(s)")

        # Step 2: 收集每个委员会的transfers (使用defaultdict动态收集所有parties)
        from collections import defaultdict
        all_party_totals = defaultdict(lambda: {'total_amount': 0.0, 'contribution_count': 0})

        for committee in committees:
            cmte_id = committee['committee_id']
            print(f"      Querying transfers for {cmte_id}...", end='')

            transfers = self.get_pac_transfers_by_party(cmte_id)

            # 合并到总计 - 动态合并所有parties
            for party, values in transfers['party_totals'].items():
                all_party_totals[party]['total_amount'] += values['total_amount']
                all_party_totals[party]['contribution_count'] += values['contribution_count']

            committee['transfer_totals'] = transfers['party_totals']
            committee['transfer_total_usd'] = transfers['total_usd']
            committee['transfer_count'] = transfers['total_count']

            print(f" ${transfers['total_usd']:,.0f} ({transfers['total_count']} txns)")

        # Step 3: 构建结果 (与fec_company_party_summary结构完全一致)
        company_name = TICKER_TO_COMPANY_NAME.get(ticker, ticker)
        normalized_name = self.normalize_company_name(company_name).lower().strip()

        # 移除常见的符号和后缀 (与fec_company_party_summary保持一致)
        # 移除 "&", ",", "." 等符号
        normalized_name = normalized_name.replace('&', '').replace(',', '').replace('.', '')

        # 移除常见后缀
        for suffix in [' inc', ' incorporated', ' corporation', ' corp', ' company', ' co', ' ltd']:
            if normalized_name.endswith(suffix):
                normalized_name = normalized_name[:-len(suffix)].strip()

        # 清理多余空格
        normalized_name = ' '.join(normalized_name.split())

        total_contributed = sum(p['total_amount'] for p in all_party_totals.values())

        result = {
            'company_name': company_name,
            'normalized_name': normalized_name,
            'data_year': self.data_year,
            'party_totals': dict(all_party_totals),  # 转换为普通dict
            'total_contributed': total_contributed,

            # PAC特有字段
            'committees': committees,
            'data_source': 'pac_transfers',

            'created_at': firestore.SERVER_TIMESTAMP,
            'last_updated': firestore.SERVER_TIMESTAMP
        }

        return result

    def sanitize_doc_id(self, doc_id: str) -> str:
        """
        清理document ID中的非法字符

        Firestore document IDs不允许包含: /
        """
        # 替换 / 为 -
        doc_id = doc_id.replace('/', '-')

        # 移除其他可能的非法字符
        doc_id = doc_id.replace('\\', '-')

        return doc_id

    def save_to_firebase(self, data: Dict):
        """
        保存到 fec_company_pac_transfers_summary collection

        Document ID格式: {normalized_company_name}_{year}
        例如: "microsoft_2024", "jpmorgan chase_2024"

        注意: 不修改 fec_company_name_variants 或 fec_company_index
        """
        # 构建document ID: {normalized_name}_{year}
        raw_doc_id = f"{data['normalized_name']}_{data['data_year']}"
        doc_id = self.sanitize_doc_id(raw_doc_id)

        if self.dry_run:
            print(f"    [DRY RUN] Would save to fec_company_pac_transfers_summary/{doc_id}")
            return

        try:
            doc_ref = self.db.collection('fec_company_pac_transfers_summary').document(doc_id)
            doc_ref.set(data, merge=True)
            print(f"    ✅ Saved to fec_company_pac_transfers_summary/{doc_id}")
        except Unauthenticated as e:
            print(f"    ⚠️  Token过期，正在刷新并重试...")
            if refresh_firestore_client():
                # Token刷新后，用新的db客户端重新尝试
                try:
                    doc_ref = self.db.collection('fec_company_pac_transfers_summary').document(doc_id)
                    doc_ref.set(data, merge=True)
                    print(f"    ✅ Saved to fec_company_pac_transfers_summary/{doc_id}")
                except Exception as retry_e:
                    print(f"    ❌ 重试失败: {str(retry_e)}")
            else:
                print(f"    ❌ Token刷新失败")
        except Exception as e:
            print(f"    ❌ Error saving to Firebase: {str(e)}")

    def collect_pac_transfers_for_company(self, company_info: Dict) -> Optional[Dict]:
        """
        收集单个discovered company的PAC transfer数据

        Args:
            company_info: discovered companies JSON中的公司信息

        Returns:
            与collect_pac_transfers_for_ticker相同的格式
        """
        normalized_name = company_info['normalized_name']
        original_name = company_info['original_name']
        committees = company_info['committees']

        if not committees:
            return None

        print(f"    ✅ Found {len(committees)} PAC committee(s)")

        # 收集每个委员会的transfers
        all_party_totals = defaultdict(lambda: {'total_amount': 0.0, 'contribution_count': 0})
        committees_with_data = []

        for committee in committees:
            cmte_id = committee['committee_id']
            print(f"      Querying {cmte_id}...", end='')

            transfers = self.get_pac_transfers_by_party(cmte_id)

            # 合并到总计
            for party, values in transfers['party_totals'].items():
                all_party_totals[party]['total_amount'] += values['total_amount']
                all_party_totals[party]['contribution_count'] += values['contribution_count']

            # 添加transfer信息到committee
            committee_data = {
                'committee_id': cmte_id,
                'committee_name': committee.get('committee_name', ''),
                'connected_org_name': committee.get('connected_org_name', ''),
                'transfer_totals': transfers['party_totals'],
                'transfer_total_usd': transfers['total_usd'],
                'transfer_count': transfers['total_count']
            }
            committees_with_data.append(committee_data)

            print(f" ${transfers['total_usd']:,.0f} ({transfers['total_count']} txns)")

        total_contributed = sum(p['total_amount'] for p in all_party_totals.values())

        result = {
            'company_name': original_name,
            'normalized_name': normalized_name,
            'data_year': self.data_year,
            'party_totals': dict(all_party_totals),
            'total_contributed': total_contributed,

            # PAC特有字段
            'committees': committees_with_data,
            'data_source': 'pac_transfers',

            'created_at': firestore.SERVER_TIMESTAMP,
            'last_updated': firestore.SERVER_TIMESTAMP
        }

        return result

    def run(self, tickers: List[str]):
        """运行完整的数据收集流程"""
        start_time = time.time()

        print(f"\n{'='*70}")
        print(f"🔄 FEC PAC Transfers Collection")
        print(f"{'='*70}")
        print(f"📦 Total companies to process: {len(tickers)}")
        print(f"🕒 Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"{'='*70}\n")

        success_count = 0
        no_pac_count = 0
        no_transfers_count = 0
        error_count = 0
        failed_tickers = []

        for i, ticker in enumerate(tickers, 1):
            try:
                print(f"[{i}/{len(tickers)}] {ticker}")

                pac_data = self.collect_pac_transfers_for_ticker(ticker)

                if pac_data:
                    if pac_data['total_contributed'] > 0:
                        self.save_to_firebase(pac_data)
                        success_count += 1
                        print(f"    💰 Total: ${pac_data['total_contributed']:,.0f}")
                    else:
                        print(f"    ⚠️  PAC found but no transfers")
                        no_transfers_count += 1
                else:
                    print(f"    ⚠️  No PAC found")
                    no_pac_count += 1

            except Exception as e:
                print(f"    ❌ Error: {str(e)}")
                import traceback
                traceback.print_exc()
                error_count += 1
                failed_tickers.append(ticker)

        execution_time = time.time() - start_time

        # 打印汇总
        print(f"\n{'='*70}")
        print(f"✅ PAC Transfers Collection Complete")
        print(f"{'='*70}")
        print(f"✅ Success (with transfers): {success_count}/{len(tickers)}")
        print(f"⚠️  PAC found but no transfers: {no_transfers_count}/{len(tickers)}")
        print(f"⚠️  No PAC found: {no_pac_count}/{len(tickers)}")
        print(f"❌ Errors: {error_count}/{len(tickers)}")
        print(f"🕒 Finished at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"⏱️  Execution time: {execution_time:.1f} seconds")
        print(f"{'='*70}\n")

        if failed_tickers:
            print(f"Failed tickers: {', '.join(failed_tickers)}")

    def run_all_discovered(self, start_index: int = 0, end_index: Optional[int] = None):
        """
        运行所有discovered companies的收集流程

        Args:
            start_index: 起始索引 (0-based)
            end_index: 结束索引 (不包含), None表示处理到最后
        """
        start_time = time.time()

        # 准备公司列表
        all_companies = list(self.discovered_companies.items())

        if end_index is None:
            end_index = len(all_companies)

        companies_to_process = all_companies[start_index:end_index]

        print(f"\n{'='*70}")
        print(f"🔄 All Discovered Companies PAC Transfers Collection")
        print(f"{'='*70}")
        print(f"📦 Total companies in discovery: {len(all_companies)}")
        print(f"📦 Processing range: {start_index} to {end_index}")
        print(f"📦 Companies to process: {len(companies_to_process)}")
        print(f"🕒 Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"{'='*70}\n")

        success_count = 0
        no_transfers_count = 0
        error_count = 0
        failed_companies = []

        for i, (normalized_name, company_info) in enumerate(companies_to_process, 1):
            try:
                absolute_index = start_index + i
                print(f"[{absolute_index}/{len(all_companies)}] {company_info['original_name']}")

                pac_data = self.collect_pac_transfers_for_company(company_info)

                if pac_data:
                    if pac_data['total_contributed'] > 0:
                        self.save_to_firebase(pac_data)
                        success_count += 1
                        print(f"    💰 Total: ${pac_data['total_contributed']:,.0f}")
                    else:
                        print(f"    ⚠️  PAC found but no transfers")
                        no_transfers_count += 1
                else:
                    print(f"    ⚠️  No committees found")
                    no_transfers_count += 1

            except Exception as e:
                print(f"    ❌ Error: {str(e)}")
                import traceback
                traceback.print_exc()
                error_count += 1
                failed_companies.append(company_info['original_name'])

        execution_time = time.time() - start_time

        # 打印汇总
        print(f"\n{'='*70}")
        print(f"✅ PAC Transfers Collection Complete")
        print(f"{'='*70}")
        print(f"✅ Success (with transfers): {success_count}/{len(companies_to_process)}")
        print(f"⚠️  No transfers: {no_transfers_count}/{len(companies_to_process)}")
        print(f"❌ Errors: {error_count}/{len(companies_to_process)}")
        print(f"🕒 Finished at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"⏱️  Execution time: {execution_time:.1f} seconds")
        print(f"{'='*70}\n")

        if failed_companies:
            print(f"Failed companies ({len(failed_companies)}):")
            for company in failed_companies[:20]:  # 只显示前20个
                print(f"  • {company}")
            if len(failed_companies) > 20:
                print(f"  ... and {len(failed_companies) - 20} more")


def main():
    parser = argparse.ArgumentParser(description='Collect FEC PAC Transfers data')
    parser.add_argument('--test', action='store_true', help='Test mode (5 companies)')
    parser.add_argument('--production', action='store_true', help='Production mode (all SP500)')
    parser.add_argument('--all-discovered', action='store_true', help='Process all discovered companies')
    parser.add_argument('--start', type=int, help='Start index (for --all-discovered)')
    parser.add_argument('--end', type=int, help='End index (for --all-discovered)')
    parser.add_argument('--dry-run', action='store_true', help='Dry run mode (no writes)')

    args = parser.parse_args()

    collector = PACTransfersCollector(dry_run=args.dry_run)

    if args.test:
        tickers = TEST_TICKERS
        print(f"🧪 TEST MODE: Processing {len(tickers)} companies")
        collector.run(tickers)
    elif args.production:
        tickers = SP500_TICKERS
        print(f"🚀 PRODUCTION MODE: Processing {len(tickers)} companies")
        collector.run(tickers)
    elif args.all_discovered:
        # 加载discovered companies
        collector.load_discovered_companies()

        start = args.start or 0
        end = args.end

        if start or end:
            print(f"🚀 ALL DISCOVERED MODE: Processing companies {start} to {end or 'end'}")
        else:
            print(f"🚀 ALL DISCOVERED MODE: Processing all {len(collector.discovered_companies)} companies")

        collector.run_all_discovered(start_index=start, end_index=end)
    else:
        print("❌ Please specify --test, --production, or --all-discovered")
        print("   Examples:")
        print("     python3 12-collect-pac-transfers.py --test")
        print("     python3 12-collect-pac-transfers.py --production")
        print("     python3 12-collect-pac-transfers.py --all-discovered")
        print("     python3 12-collect-pac-transfers.py --all-discovered --start 0 --end 100")
        sys.exit(1)


if __name__ == "__main__":
    main()
