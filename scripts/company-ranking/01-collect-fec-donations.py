#!/usr/bin/env python3
"""
FEC Political Donations Data Collection for Company Rankings

从 Firebase FEC 数据库构建 SP500 公司政治捐款报告
输出: Firebase `company_rankings/{ticker}/fec_data`

运行方式:
    python3 01-collect-fec-donations.py

数据结构:
    - 读取: fec_company_party_summary (每家公司的年度/政党汇总数据)
    - 写入: company_rankings/{ticker}/fec_data
"""

import os
import sys
import json
import subprocess
from datetime import datetime
from typing import Dict, List, Any, Optional, Tuple
import firebase_admin
from firebase_admin import credentials, firestore
from google.cloud.firestore_v1.base_query import FieldFilter
import time
import requests

# 添加项目根目录到 path，以便导入 SP500 公司列表
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(os.path.dirname(SCRIPT_DIR))

# 导入邮件通知模块
sys.path.insert(0, SCRIPT_DIR)
from email_notifier import log_completion_notification, send_success_email

# Import from unified data module
from pathlib import Path
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from data.sp500Companies import SP500_TICKERS, TICKER_TO_NAME, get_company_name

# Company name mapping is now loaded dynamically from fec_company_name_variants collection
# This allows AI-generated variants and ticker-based search without hardcoding

class FECDonationCollector:
    """FEC 捐款数据采集器"""

    def __init__(self, credentials_path: Optional[str] = None):
        """初始化 Firebase 连接"""
        if not firebase_admin._apps:
            if credentials_path:
                cred = credentials.Certificate(credentials_path)
            else:
                # 使用默认凭证（Cloud Run 环境）
                cred = credentials.ApplicationDefault()

            firebase_admin.initialize_app(cred, {
                'projectId': 'stanseproject'
            })

        self.db = firestore.client()
        print(f"✅ Firebase initialized (project: stanseproject)")

        # 初始化 Gemini API (用于 AI 验证)
        self.gemini_api_key = os.getenv('GEMINI_API_KEY')

        # 如果环境变量中没有，从 Google Secret Manager 获取
        if not self.gemini_api_key:
            try:
                print("🔑 Loading GEMINI_API_KEY from Secret Manager...")
                result = subprocess.run(
                    [
                        'gcloud', 'secrets', 'versions', 'access', 'latest',
                        '--secret', 'gemini-api-key',
                        '--project', 'gen-lang-client-0960644135'
                    ],
                    capture_output=True,
                    text=True,
                    check=True
                )
                self.gemini_api_key = result.stdout.strip()
                print("✅ GEMINI_API_KEY loaded from Secret Manager")
            except Exception as e:
                print(f"⚠️  Failed to load GEMINI_API_KEY from Secret Manager: {e}")

        self.gemini_api_url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

        if self.gemini_api_key:
            print(f"✅ Gemini 2.5 Flash API initialized for AI verification")
        else:
            print(f"⚠️  Gemini API key not found, AI verification disabled")

        # 初始化搜索关键词缓存（从 fec_company_name_variants 加载）
        self._search_keywords_cache = {}

        # 初始化 ticker 到 company_name 映射缓存
        self._ticker_to_name_cache = {}

    def _get_company_name_from_db(self, ticker: str) -> str:
        """从统一数据源获取公司名称"""
        # 使用统一的 SP500 数据源
        company_name = get_company_name(ticker)
        if company_name:
            print(f"  📝 Resolved {ticker} → {company_name}")
            return company_name
        # Fallback: 返回 ticker 本身
        print(f"  ⚠️  No name found for {ticker}, using ticker as name")
        return ticker

    def normalize_company_name(self, name: str) -> str:
        """
        标准化公司名称（与 fecService.ts 逻辑一致）
        """
        if not name:
            return ''

        normalized = name.lower().strip()

        # 移除常见后缀
        suffixes = [
            'corporation', 'corp', 'inc', 'incorporated', 'company', 'co',
            'llc', 'lp', 'ltd', 'limited', 'political action committee', 'pac'
        ]

        for suffix in suffixes:
            import re
            pattern = r'\b' + suffix + r'\b\.?'
            normalized = re.sub(pattern, '', normalized, flags=re.IGNORECASE)

        # 移除标点和多余空格
        normalized = re.sub(r'[^\w\s]', '', normalized)
        normalized = re.sub(r'\s+', ' ', normalized).strip()

        return normalized

    def verify_company_match_with_ai(self, ticker: str, company_name: str, candidate_name: str) -> Tuple[bool, str]:
        """
        使用 AI 验证候选公司是否是目标公司

        Args:
            ticker: 股票代码 (如 'AAPL')
            company_name: 目标公司名 (如 'Apple')
            candidate_name: 候选公司名 (如 'us apple association')

        Returns:
            (is_match: bool, reason: str)
        """
        if not self.gemini_api_key:
            # 如果没有 API key，默认接受（fallback 到旧行为）
            return (True, "AI verification disabled")

        # 构建 prompt
        prompt = f"""You are a company name matching expert. Your task is to determine if a candidate company name matches a target company.

Target Company:
- Stock Ticker: {ticker}
- Company Name: {company_name}

Candidate Company Name: {candidate_name}

Question: Is "{candidate_name}" the same as "{company_name}" (ticker: {ticker}), or a PAC/subsidiary/affiliate directly associated with {company_name}?

Answer with ONLY one of these responses:
- YES: If it's the same company or directly affiliated
- NO: If it's a completely different company

Provide your reasoning in one sentence after your answer.

Format:
Answer: YES/NO
Reason: <one sentence explanation>"""

        # Call Gemini API
        try:
            request_body = {
                "contents": [{
                    "parts": [{"text": prompt}]
                }],
                "generationConfig": {
                    "temperature": 0.1,  # 低温度确保稳定输出
                    "maxOutputTokens": 200,
                }
            }

            response = requests.post(
                f"{self.gemini_api_url}?key={self.gemini_api_key}",
                json=request_body,
                headers={"Content-Type": "application/json"},
                timeout=10
            )

            if response.status_code != 200:
                print(f"  ⚠️  AI verification API error: {response.status_code}")
                return (True, f"API error {response.status_code}, accepting match")

            result = response.json()

            # 提取 AI 响应
            try:
                text = result['candidates'][0]['content']['parts'][0]['text']

                # 解析响应
                lines = text.strip().split('\n')
                answer_line = None
                reason_line = None

                for line in lines:
                    if 'Answer:' in line:
                        answer_line = line
                    elif 'Reason:' in line:
                        reason_line = line

                if answer_line:
                    is_match = 'YES' in answer_line.upper()
                    reason = reason_line.split(':', 1)[1].strip() if reason_line else text
                    return (is_match, reason)
                else:
                    # Fallback: 如果格式不对，检查是否包含 YES/NO
                    is_match = 'YES' in text.upper() and 'NO' not in text.upper()
                    return (is_match, text[:100])

            except (KeyError, IndexError) as e:
                print(f"  ⚠️  AI response parsing error: {e}")
                return (True, "Parse error, accepting match")

        except requests.exceptions.Timeout:
            print(f"  ⚠️  AI verification timeout")
            return (True, "Timeout, accepting match")
        except Exception as e:
            print(f"  ⚠️  AI verification error: {str(e)}")
            return (True, f"Error: {str(e)}, accepting match")

    def _get_company_name_from_db(self, ticker: str) -> str:
        """
        从 fec_company_name_variants collection 加载 ticker 对应的公司名称
        使用缓存避免重复查询

        返回: company_full_name 或 company_name, fallback 到 ticker
        """
        # 检查缓存
        if ticker in self._ticker_to_name_cache:
            return self._ticker_to_name_cache[ticker]

        # 从数据库加载
        try:
            # 查询该 ticker 的文档
            docs = self.db.collection('fec_company_name_variants').where('ticker', '==', ticker).limit(1).stream()

            for doc in docs:
                data = doc.to_dict()
                # 优先使用 company_full_name，fallback 到 company_name
                company_name = data.get('company_full_name') or data.get('company_name', ticker)

                # 缓存结果
                self._ticker_to_name_cache[ticker] = company_name
                return company_name

            # 没找到，使用 ticker 作为 fallback
            self._ticker_to_name_cache[ticker] = ticker
            return ticker

        except Exception as e:
            print(f"  ⚠️  Error loading company name for {ticker}: {e}")
            return ticker

    def _load_search_keywords_from_db(self, ticker: str) -> List[str]:
        """
        从 fec_company_name_variants collection 加载指定 ticker 的搜索关键词
        使用缓存避免重复查询

        新数据结构: 每个公司一个文档,variants 是数组
        {
            'normalized_name': 'att',
            'ticker': 'T',
            'variants': [
                {'variant_name': 'AT&T INC.', 'variant_name_lower': 'at&t inc.'},
                {'variant_name': 'att', 'variant_name_lower': 'att'}
            ]
        }
        """
        # 检查缓存
        if ticker in self._search_keywords_cache:
            return self._search_keywords_cache[ticker]

        # 从数据库加载
        try:
            # 查询该 ticker 的文档
            docs = self.db.collection('fec_company_name_variants').where('ticker', '==', ticker).stream()

            keywords = []
            for doc in docs:
                data = doc.to_dict()
                variants = data.get('variants', [])

                # 从 variants 数组中提取所有 variant_name_lower
                for variant in variants:
                    variant_lower = variant.get('variant_name_lower', '').strip()
                    if variant_lower and variant_lower not in keywords:
                        keywords.append(variant_lower)

            # 缓存结果
            self._search_keywords_cache[ticker] = keywords

            if keywords:
                print(f"  📖 Loaded {len(keywords)} search keywords from database for {ticker}")
            return keywords

        except Exception as e:
            print(f"  ⚠️  Error loading search keywords for {ticker}: {e}")
            return []

    def find_variants_by_fuzzy_search(self, ticker: str, company_name: str) -> List[str]:
        """
        直接在 fec_company_consolidated 中通过公司名模糊匹配查找文档
        搜索每个文档的 normalized_name 字段（而不是文档 ID）
        返回匹配的 normalized_name 列表

        优化策略：
        1. 搜索文档的 normalized_name 字段（不是文档 ID）
        2. 要求关键词作为独立单词出现（word boundary）
        3. 最小关键词长度 >= 3 字符（避免单字母误匹配）
        4. 使用 AI 验证最终匹配
        """
        import re

        # 从数据库加载搜索关键词（带缓存）
        search_keywords = self._load_search_keywords_from_db(ticker)

        # 如果数据库中没有找到关键词，使用公司名作为后备
        if not search_keywords:
            search_keywords = [company_name.lower()]
            print(f"  ⚠️  No search keywords found in database for {ticker}, using company name: {company_name}")

        # 过滤掉太短的关键词（< 3 字符），避免误匹配
        search_keywords = [kw for kw in search_keywords if len(kw) >= 3]

        # 如果过滤后没有关键词，使用公司名
        if not search_keywords:
            search_keywords = [company_name.lower()]

        # 获取所有 fec_company_consolidated 文档
        # 重要：我们需要读取文档的 normalized_name 字段，而不是文档 ID
        all_docs = self.db.collection('fec_company_consolidated').stream()

        # 查找匹配的文档 (with AI verification)
        matched_normalized_names = set()
        rejected_candidates = []  # 记录被 AI 拒绝的候选
        total_checked = 0

        for doc in all_docs:
            data = doc.to_dict()
            normalized_name = data.get('normalized_name', '')

            if not normalized_name:
                continue

            normalized_name_lower = normalized_name.lower()

            # 在 normalized_name 字段中搜索关键词
            for keyword in search_keywords:
                # 使用 word boundary 确保关键词是独立单词
                # \b 确保 "visa" 不会匹配 "television"
                pattern = r'\b' + re.escape(keyword.lower()) + r'\b'

                if re.search(pattern, normalized_name_lower):
                    total_checked += 1

                    # 🤖 AI 验证: 确认这个候选公司是否真的是目标公司
                    is_match, reason = self.verify_company_match_with_ai(
                        ticker, company_name, normalized_name
                    )

                    if is_match:
                        print(f"  ✅ AI verified: '{normalized_name}' matches {ticker}")
                        print(f"     Reason: {reason}")
                        matched_normalized_names.add(normalized_name)
                    else:
                        print(f"  ❌ AI rejected: '{normalized_name}' does NOT match {ticker}")
                        print(f"     Reason: {reason}")
                        rejected_candidates.append((normalized_name, reason))

                    break  # 找到关键词匹配后，跳过该文档的其他关键词检查

        # 输出被拒绝的候选（用于调试）
        if rejected_candidates:
            print(f"  📋 AI rejected {len(rejected_candidates)} candidates for {ticker}:")
            for candidate, reason in rejected_candidates[:3]:  # 只显示前3个
                print(f"     - {candidate}: {reason}")

        print(f"  📊 Fuzzy search stats: {total_checked} candidates checked, {len(matched_normalized_names)} accepted")

        return list(matched_normalized_names)

    def find_company_variants(self, ticker: str) -> List[str]:
        """
        查找公司的所有变体名称
        """
        # 从 ticker 获取公司名 (从数据库加载)
        company_name = self._get_company_name_from_db(ticker)
        normalized = self.normalize_company_name(company_name)

        # 查询 fec_company_name_variants collection
        variants_ref = self.db.collection('fec_company_name_variants')

        # 尝试直接匹配
        canonical_upper = company_name.upper()
        doc_ref = variants_ref.document(canonical_upper)
        doc = doc_ref.get()

        if doc.exists:
            data = doc.to_dict()
            variants = data.get('variants', [])
            # Extract variant_name_lower from dict objects
            variant_names = []
            for variant in variants:
                if isinstance(variant, dict):
                    variant_names.append(variant.get('variant_name_lower', ''))
                elif isinstance(variant, str):
                    variant_names.append(variant.lower())
            print(f"  └─ Found {len(variant_names)} variants for {ticker} ({company_name})")
            return variant_names

        # 如果直接匹配失败，尝试模糊搜索
        # 查询所有包含公司名关键词的文档
        all_docs = variants_ref.stream()
        matched_variants = []

        for doc in all_docs:
            doc_id = doc.id
            data = doc.to_dict()

            if normalized in self.normalize_company_name(doc_id):
                variants = data.get('variants', [])
                matched_variants.extend(variants)

        if matched_variants:
            # Extract variant_name_lower from each dict and deduplicate
            variant_names = []
            for variant_dict in matched_variants:
                if isinstance(variant_dict, dict):
                    name_lower = variant_dict.get('variant_name_lower', '')
                    if name_lower and name_lower not in variant_names:
                        variant_names.append(name_lower)
                elif isinstance(variant_dict, str):
                    # Handle legacy string format
                    name_lower = variant_dict.lower()
                    if name_lower and name_lower not in variant_names:
                        variant_names.append(name_lower)
            print(f"  └─ Found {len(variant_names)} variants via fuzzy match for {ticker}")
            return variant_names

        # Fallback: 直接在 fec_company_consolidated 中搜索公司名
        print(f"  └─ No variants found, trying direct fuzzy search in fec_company_consolidated...")
        fuzzy_variants = self.find_variants_by_fuzzy_search(ticker, company_name)
        if fuzzy_variants:
            print(f"  └─ Found {len(fuzzy_variants)} matches via direct fuzzy search")
            return fuzzy_variants

        print(f"  └─ No FEC data found for {ticker} ({company_name})")
        return []  # 返回空列表，表示没有找到任何数据

    def collect_fec_for_company(self, ticker: str) -> Optional[Dict[str, Any]]:
        """
        查询 FEC 数据库，汇总该公司的捐款情况

        查询 fec_company_party_summary collection，该 collection 的数据结构：
        - normalized_name: 公司标准化名称
        - data_year: 数据年份
        - party_totals: {DEM: {...}, REP: {...}, OTH: {...}}
        - total_contributed: 总捐款金额（cents）
        """
        print(f"\n📊 Processing {ticker}...")

        # 查找公司变体
        variants = self.find_company_variants(ticker)

        if not variants:
            print(f"  └─ No data found, skipping")
            return None

        # 初始化汇总数据
        party_totals = {
            'DEM': {'total_amount': 0, 'count': 0},
            'REP': {'total_amount': 0, 'count': 0},
            'OTH': {'total_amount': 0, 'count': 0}
        }
        years_found = set()

        # Normalize variants for querying (convert to lowercase, remove spaces)
        import re
        normalized_variants = []
        for variant in variants:
            # 使用与 fecService.ts 相同的标准化逻辑
            normalized = variant.lower().strip()
            suffixes = [
                'corporation', 'corp', 'inc', 'incorporated', 'company', 'co',
                'llc', 'lp', 'ltd', 'limited', 'political action committee', 'pac'
            ]
            for suffix in suffixes:
                pattern = r'\b' + suffix + r'\b\.?'
                normalized = re.sub(pattern, '', normalized, flags=re.IGNORECASE)
            normalized = re.sub(r'[^\w\s]', '', normalized)
            normalized = re.sub(r'\s+', ' ', normalized).strip()
            if normalized:
                normalized_variants.append(normalized)

        print(f"  ├─ Normalized variants: {len(normalized_variants)}")

        # 查询 fec_company_consolidated collection (包含 linkage + PAC transfer data)
        summary_ref = self.db.collection('fec_company_consolidated')

        # 对每个标准化的变体，查询其所有数据
        for normalized_variant in normalized_variants:
            query = summary_ref.where(filter=FieldFilter('normalized_name', '==', normalized_variant))
            docs = query.stream()

            for doc in docs:
                data = doc.to_dict()
                year = data.get('data_year')  # 注意字段名是 data_year
                party_data = data.get('party_totals', {})  # party_totals 是一个对象

                if year:
                    years_found.add(year)

                # 聚合 party_totals 中的数据
                for party, amounts in party_data.items():
                    if party not in party_totals:
                        party_totals[party] = {'total_amount': 0, 'count': 0}

                    party_totals[party]['total_amount'] += amounts.get('total_amount', 0)
                    party_totals[party]['count'] += amounts.get('contribution_count', 0)

        # 确保至少有 DEM, REP, OTH 三个政党
        for party in ['DEM', 'REP', 'OTH']:
            if party not in party_totals:
                party_totals[party] = {'total_amount': 0, 'count': 0}

        # 计算总额和百分比
        total_cents = sum(p['total_amount'] for p in party_totals.values())
        total_usd = total_cents / 100

        if total_usd == 0:
            print(f"  └─ No donation data found")
            return None

        # 计算百分比
        for party in party_totals:
            party_totals[party]['percentage'] = (
                party_totals[party]['total_amount'] / total_cents * 100
                if total_cents > 0 else 0
            )
            party_totals[party]['total_amount_usd'] = party_totals[party]['total_amount'] / 100

        # 计算政治倾向分数 (-100 to 100)
        # -100 = 100% REP, 0 = 平衡, +100 = 100% DEM
        dem_pct = party_totals['DEM']['percentage']
        rep_pct = party_totals['REP']['percentage']
        political_lean_score = dem_pct - rep_pct

        result = {
            'ticker': ticker,
            'display_name': self._get_company_name_from_db(ticker),
            'variants_found': variants,
            'normalized_variants': normalized_variants,
            'party_totals': party_totals,
            'total_contributed_cents': int(total_cents),
            'total_usd': total_usd,
            'political_lean_score': round(political_lean_score, 2),
            'years': sorted(list(years_found), reverse=True),
            'last_updated': firestore.SERVER_TIMESTAMP,
            'data_source': 'fec_company_consolidated'  # 包含 linkage + PAC transfer data
        }

        print(f"  ├─ Total: ${total_usd:,.0f}")
        print(f"  ├─ DEM: {dem_pct:.1f}% | REP: {rep_pct:.1f}% | OTH: {party_totals['OTH']['percentage']:.1f}%")
        print(f"  └─ Political Lean: {political_lean_score:+.1f} ({'DEM' if political_lean_score > 0 else 'REP' if political_lean_score < 0 else 'BALANCED'})")

        return result

    def save_to_firebase(self, ticker: str, data: Dict[str, Any]):
        """
        保存到 company_rankings_by_ticker collection，并保存历史版本

        版本控制策略（统一方案）：
        1. 构建完整的新数据（fec_data + ticker + last_updated）
        2. 先将新数据保存到 history/{当前时间戳} 作为快照
        3. 然后用新数据更新主文档（merge=True 保留其他脚本添加的字段）

        结果：
        - history 里的最新版本 = 主文档当前内容（有重叠是正常的）
        - 主文档永远是最新数据
        - merge=True 确保 ESG/News 等其他脚本添加的字段不被覆盖

        数据结构:
        - 主文档: company_rankings_by_ticker/{ticker}
          - fec_data: {...}  (FEC 数据的完整结构)
          - ticker: "AAPL"
          - last_updated: timestamp
          - (可能还有其他字段如 esg_data, news_data 等)

        - 历史版本: company_rankings_by_ticker/{ticker}/history/{YYYYmmdd_HHMMSS}
          - fec_data: {...}  (该时刻的 FEC 数据快照)
          - ticker: "AAPL"
          - last_updated: timestamp
          - (该时刻的所有其他字段)
        """
        # 1. 生成时间戳
        now = datetime.now()
        timestamp_str = now.strftime('%Y%m%d_%H%M%S')

        # 2. 构建完整的新数据
        new_data = {
            'fec_data': data,  # 保留完整的 FEC 数据结构（包含所有嵌套字段）
            'ticker': ticker,
            'last_updated': firestore.SERVER_TIMESTAMP
        }

        doc_ref = self.db.collection('company_rankings_by_ticker').document(ticker)

        # 3. 先保存新数据到 history（作为当前时刻的快照）
        history_ref = doc_ref.collection('history').document(timestamp_str)
        history_ref.set(new_data)
        print(f"  📦 Saved to history: {timestamp_str}")

        # 4. 然后更新主文档（merge=True 保留其他字段）
        doc_ref.set(new_data, merge=True)

        print(f"  ✅ Saved to Firebase: company_rankings_by_ticker/{ticker}/fec_data")

    def run(self, tickers_to_process: Optional[List[str]] = None):
        """
        运行完整的数据采集流程

        参数:
            tickers_to_process: 可选的 ticker 列表，如果提供则只处理这些公司
        """
        start_time = time.time()

        # 如果指定了特定的 tickers，使用它们；否则使用完整列表
        tickers = tickers_to_process if tickers_to_process else SP500_TICKERS

        print(f"\n{'='*60}")
        print(f"🔄 FEC Political Donations Data Collection")
        print(f"{'='*60}")
        print(f"📦 Total companies to process: {len(tickers)}")
        if tickers_to_process:
            print(f"📋 Processing specific tickers (retry mode)")
        print(f"🕒 Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

        success_count = 0
        no_data_count = 0
        error_count = 0
        failed_tickers = []

        for i, ticker in enumerate(tickers, 1):
            try:
                print(f"\n[{i}/{len(tickers)}] {ticker}", end='')

                fec_data = self.collect_fec_for_company(ticker)

                if fec_data:
                    self.save_to_firebase(ticker, fec_data)
                    success_count += 1
                else:
                    no_data_count += 1

            except Exception as e:
                print(f"  ❌ Error: {str(e)}")
                error_count += 1
                failed_tickers.append(ticker)

        execution_time = time.time() - start_time

        print(f"\n\n{'='*60}")
        print(f"✅ FEC Data Collection Complete")
        print(f"{'='*60}")
        print(f"✅ Success: {success_count}/{len(SP500_TICKERS)}")
        print(f"⚠️  No Data: {no_data_count}/{len(SP500_TICKERS)}")
        print(f"❌ Errors: {error_count}/{len(SP500_TICKERS)}")
        print(f"🕒 Completed at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"{'='*60}\n")

        # 发送完成通知（日志方式）
        log_completion_notification(
            job_name="FEC Donations Collector",
            total_companies=len(SP500_TICKERS),
            successful_companies=success_count,
            failed_companies=failed_tickers,
            execution_time_seconds=execution_time
        )

        # 发送邮件通知
        send_success_email(
            job_name="FEC Donations Collector",
            total_companies=len(tickers),
            successful_companies=success_count,
            failed_companies=failed_tickers,
            execution_time_seconds=execution_time
        )


def main():
    """主函数"""
    credentials_path = os.getenv('FIREBASE_CREDENTIALS_PATH')
    tickers_file = None
    tickers_to_process = None

    # 解析命令行参数
    if len(sys.argv) > 1:
        # 如果第一个参数是 .txt 文件，认为是 ticker 列表文件
        if sys.argv[1].endswith('.txt'):
            tickers_file = sys.argv[1]
        # 如果第一个参数是 .json 文件，认为是 credentials 文件
        elif sys.argv[1].endswith('.json'):
            credentials_path = sys.argv[1]
        else:
            # 其他情况也尝试作为 credentials（向后兼容）
            credentials_path = sys.argv[1]

    # 如果提供了 ticker 文件，读取它
    if tickers_file:
        try:
            with open(tickers_file, 'r') as f:
                # 读取所有非空行，去除空格和换行符
                tickers_to_process = [
                    line.strip()
                    for line in f
                    if line.strip() and not line.strip().startswith('#')
                ]
            print(f"📋 Loaded {len(tickers_to_process)} tickers from {tickers_file}")
        except FileNotFoundError:
            print(f"❌ ERROR: Ticker file not found: {tickers_file}")
            sys.exit(1)

    collector = FECDonationCollector(credentials_path)
    collector.run(tickers_to_process=tickers_to_process)


if __name__ == "__main__":
    main()
