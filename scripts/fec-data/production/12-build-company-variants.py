#!/usr/bin/env python3
"""
自动构建公司名称变体映射表
从所有20,934个委员会记录中提取公司名称，使用模糊匹配自动分组变体

新增功能:
--cleanup: 清理空记录
--rebuild-from-index: 从fec_company_index重建variants
"""

import sys
import os
import argparse
from pathlib import Path
from datetime import datetime
from collections import defaultdict
import json
import re
import hashlib

try:
    import firebase_admin
    from firebase_admin import credentials, firestore
    from rapidfuzz import fuzz, process
    import requests
except ImportError as e:
    print(f'❌ 缺少依赖库: {e}')
    print('安装: pip install firebase-admin rapidfuzz requests')
    sys.exit(1)

PROJECT_ID = 'stanseproject'
REPORTS_DIR = Path(__file__).parent.parent / 'reports'
PROGRESS_FILE = REPORTS_DIR / '12-variant-building-progress.json'

db = None
gemini_api_key = None

# ============================================================================
# SP500 DATA - Import from unified data source
# ============================================================================
import sys
from pathlib import Path
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from data.sp500Companies import SP500_TICKERS, TICKER_TO_NAME

# Build SP500_COMPANIES dict from unified data (ticker -> name)
SP500_COMPANIES = {ticker: TICKER_TO_NAME[ticker] for ticker in SP500_TICKERS}

# 手动覆盖的9家已验证公司
VERIFIED_COMPANIES = {
    'GOOGLE': {
        'canonical_name': 'GOOGLE',
        'display_name': 'Google Inc.',
        'variants': ['GOOGLE INC', 'GOOGLE LLC', 'ALPHABET INC', 'ALPHABET', 'GOOGLE'],
        'stock_ticker': 'GOOGL',
        'industry': 'Technology'
    },
    'MICROSOFT': {
        'canonical_name': 'MICROSOFT',
        'display_name': 'Microsoft Corporation',
        'variants': ['MICROSOFT CORP', 'MICROSOFT CORPORATION', 'MICROSOFT'],
        'stock_ticker': 'MSFT',
        'industry': 'Technology'
    },
    'AMAZON': {
        'canonical_name': 'AMAZON',
        'display_name': 'Amazon.com Inc.',
        'variants': ['AMAZON.COM INC', 'AMAZON COM INC', 'AMAZON', 'AMAZON INC'],
        'stock_ticker': 'AMZN',
        'industry': 'Technology'
    },
    'APPLE': {
        'canonical_name': 'APPLE',
        'display_name': 'Apple Inc.',
        'variants': ['APPLE INC', 'APPLE COMPUTER INC', 'APPLE'],
        'stock_ticker': 'AAPL',
        'industry': 'Technology'
    },
    'META': {
        'canonical_name': 'META',
        'display_name': 'Meta Platforms Inc.',
        'variants': ['META PLATFORMS INC', 'FACEBOOK INC', 'FACEBOOK', 'META'],
        'stock_ticker': 'META',
        'industry': 'Technology'
    },
    'JPMORGAN': {
        'canonical_name': 'JPMORGAN',
        'display_name': 'JPMorgan Chase & Co.',
        'variants': ['JPMORGAN CHASE & CO', 'JP MORGAN CHASE', 'JPMORGAN', 'JPMORGAN CHASE'],
        'stock_ticker': 'JPM',
        'industry': 'Financial Services'
    },
    'GOLDMAN SACHS': {
        'canonical_name': 'GOLDMAN SACHS',
        'display_name': 'Goldman Sachs Group Inc.',
        'variants': ['GOLDMAN SACHS GROUP INC', 'GOLDMAN SACHS', 'GOLDMAN SACHS & CO'],
        'stock_ticker': 'GS',
        'industry': 'Financial Services'
    },
    'BOEING': {
        'canonical_name': 'BOEING',
        'display_name': 'The Boeing Company',
        'variants': ['BOEING CO', 'BOEING COMPANY', 'BOEING', 'THE BOEING COMPANY'],
        'stock_ticker': 'BA',
        'industry': 'Aerospace & Defense'
    },
    'LOCKHEED MARTIN': {
        'canonical_name': 'LOCKHEED MARTIN',
        'display_name': 'Lockheed Martin Corporation',
        'variants': ['LOCKHEED MARTIN CORP', 'LOCKHEED MARTIN CORPORATION', 'LOCKHEED MARTIN'],
        'stock_ticker': 'LMT',
        'industry': 'Aerospace & Defense'
    }
}

def init_firestore():
    """初始化Firestore - 使用ADC"""
    global db
    print('🔧 初始化Firestore连接...')

    try:
        if not firebase_admin._apps:
            print('  ℹ️  使用默认凭证链（gcloud/环境变量）...')
            firebase_admin.initialize_app(options={'projectId': PROJECT_ID})

        db = firestore.client()
        print(f'✅ Firestore已连接 (项目: {PROJECT_ID})\n')
        return db
    except Exception as e:
        print(f'❌ 失败: {e}')
        sys.exit(1)

def normalize_name(name):
    """标准化公司名称"""
    if not name:
        return ''

    # 转大写
    name = name.upper().strip()

    # 移除常见后缀
    suffixes = [
        ' INC', ' CORP', ' LLC', ' LLP', ' LP', ' LTD', ' CO',
        ' CORPORATION', ' INCORPORATED', ' COMPANY', ' LIMITED',
        ' & CO', ' AND CO', ',', '.'
    ]

    for suffix in suffixes:
        if name.endswith(suffix):
            name = name[:-len(suffix)].strip()

    # 移除特殊字符
    name = re.sub(r'[^\w\s&-]', '', name)

    # 标准化空格
    name = ' '.join(name.split())

    return name

def is_verified_company(normalized_name):
    """检查是否是已验证的公司（或其变体）"""
    for canonical, data in VERIFIED_COMPANIES.items():
        for variant in data['variants']:
            if normalize_name(variant) == normalized_name:
                return canonical
    return None

def extract_all_company_names():
    """从所有委员会中提取公司名称"""
    print('📥 从Firestore读取所有委员会记录...')

    companies = {}  # {normalized_name: {'original': [原始名], 'committee_ids': [id]}}
    verified_mapping = {}  # {normalized_name: canonical_name} for verified companies

    try:
        # 读取所有委员会
        committees_ref = db.collection('fec_raw_committees')
        docs = committees_ref.stream()

        count = 0
        for doc in docs:
            count += 1
            if count % 1000 == 0:
                print(f'  处理中: {count} 条委员会记录...')

            data = doc.to_dict()
            committee_id = data.get('committee_id', '')
            org_name = data.get('connected_org_name', '').strip()

            if not org_name or org_name == '':
                continue

            # 标准化名称
            normalized = normalize_name(org_name)
            if not normalized:
                continue

            # 检查是否是已验证公司
            verified = is_verified_company(normalized)
            if verified:
                if normalized not in verified_mapping:
                    verified_mapping[normalized] = verified
                continue  # 跳过已验证公司，稍后单独处理

            # 添加到公司列表
            if normalized not in companies:
                companies[normalized] = {
                    'original': [],
                    'committee_ids': []
                }

            if org_name not in companies[normalized]['original']:
                companies[normalized]['original'].append(org_name)

            if committee_id not in companies[normalized]['committee_ids']:
                companies[normalized]['committee_ids'].append(committee_id)

        print(f'\n✅ 处理完成: {count} 条委员会记录')
        print(f'  发现 {len(companies)} 个独特标准化公司名称')
        print(f'  发现 {len(verified_mapping)} 个已验证公司变体\n')

        return companies, verified_mapping

    except Exception as e:
        print(f'❌ 读取失败: {e}')
        sys.exit(1)

def group_similar_companies(companies, similarity_threshold=85):
    """使用模糊匹配将相似的公司名称分组"""
    print(f'🔍 分组相似公司名称 (相似度阈值: {similarity_threshold}%)...')

    company_names = list(companies.keys())
    grouped = {}  # {canonical_name: [variant_names]}
    processed = set()

    for i, name in enumerate(company_names):
        if name in processed:
            continue

        if (i + 1) % 500 == 0:
            print(f'  处理中: {i + 1}/{len(company_names)} 公司...')

        # 找出所有相似的名称
        similar = [name]
        processed.add(name)

        # 与剩余名称比较
        for other_name in company_names[i+1:]:
            if other_name in processed:
                continue

            # 使用token_sort_ratio处理词序不同的情况
            score = fuzz.token_sort_ratio(name, other_name)

            if score >= similarity_threshold:
                similar.append(other_name)
                processed.add(other_name)

        # 选择最短的名称作为canonical name
        canonical = min(similar, key=len)
        grouped[canonical] = similar

    print(f'\n✅ 分组完成:')
    print(f'  {len(company_names)} 个名称 → {len(grouped)} 个公司组')
    print(f'  平均每组 {len(company_names)/len(grouped):.1f} 个变体\n')

    return grouped

def build_variant_documents(grouped, companies):
    """构建variant文档"""
    print('📝 构建variant文档...')

    variant_docs = []

    for canonical, variants in grouped.items():
        # 收集所有committee_ids和原始名称
        all_committee_ids = []
        all_original_names = []

        for variant in variants:
            all_committee_ids.extend(companies[variant]['committee_ids'])
            all_original_names.extend(companies[variant]['original'])

        # 去重
        all_committee_ids = list(set(all_committee_ids))
        all_original_names = list(set(all_original_names))

        # 选择最常见的原始名称作为display_name
        display_name = max(all_original_names, key=len) if all_original_names else canonical

        doc = {
            'canonical_name': canonical,
            'display_name': display_name,
            'variants': variants,
            'original_names': all_original_names,
            'committee_ids': all_committee_ids,
            'committee_count': len(all_committee_ids),
            'variant_count': len(variants),
            'created_at': datetime.utcnow(),
            'last_updated': datetime.utcnow(),
            'is_verified': False
        }

        variant_docs.append(doc)

    print(f'✅ 创建了 {len(variant_docs)} 个variant文档\n')
    return variant_docs

def add_verified_companies(variant_docs):
    """添加已验证的公司"""
    print('✅ 添加9个已验证公司...')

    # 为每个已验证公司创建文档
    for canonical, data in VERIFIED_COMPANIES.items():
        # 收集committee_ids
        committee_ids = []
        for variant in data['variants']:
            normalized = normalize_name(variant)
            # 在Firestore中查找匹配的委员会
            committees_ref = db.collection('fec_raw_committees')
            query = committees_ref.where('connected_org_nm', '>=', variant.upper()).where('connected_org_nm', '<=', variant.upper() + '\uf8ff')

            for doc in query.stream():
                committee_ids.append(doc.to_dict().get('committee_id'))

        doc = {
            'canonical_name': canonical,
            'display_name': data['display_name'],
            'variants': data['variants'],
            'original_names': data['variants'],
            'committee_ids': list(set(committee_ids)),
            'committee_count': len(set(committee_ids)),
            'variant_count': len(data['variants']),
            'stock_ticker': data.get('stock_ticker', ''),
            'industry': data.get('industry', ''),
            'created_at': datetime.utcnow(),
            'last_updated': datetime.utcnow(),
            'is_verified': True
        }

        variant_docs.append(doc)
        print(f'  ✓ {canonical}: {len(set(committee_ids))} 个委员会')

    print()
    return variant_docs

def upload_variants(variant_docs, batch_size=500):
    """上传variant文档到Firestore"""
    print(f'📤 上传 {len(variant_docs)} 个variant文档到Firestore...')

    collection_ref = db.collection('fec_company_name_variants')
    uploaded = 0

    # 按batch上传
    for i in range(0, len(variant_docs), batch_size):
        batch = db.batch()
        batch_docs = variant_docs[i:i+batch_size]

        for doc in batch_docs:
            # 使用canonical_name作为document ID
            doc_id = doc['canonical_name'].lower().replace(' ', '_')
            doc_ref = collection_ref.document(doc_id)
            batch.set(doc_ref, doc)
            uploaded += 1

        batch.commit()
        print(f'  已上传 {uploaded}/{len(variant_docs)} 个文档...')

    print(f'\n✅ 上传完成: {uploaded} 个文档\n')
    return uploaded

def cleanup_empty_variants():
    """清理空的variant记录"""
    print('='*80)
    print('🧹 清理空的variant记录')
    print('='*80 + '\n')

    docs = list(db.collection('fec_company_name_variants').stream())

    empty_docs = []
    for doc in docs:
        data = doc.to_dict()
        normalized_name = data.get('normalized_name', '')
        variant_name = data.get('variant_name', '')

        if not normalized_name or not variant_name:
            empty_docs.append(doc.id)

    print(f'📊 总记录数: {len(docs)}')
    print(f'📊 空记录数: {len(empty_docs)}')

    if not empty_docs:
        print('✅ 没有空记录需要清理\n')
        return 0

    print(f'\n🗑️  删除 {len(empty_docs)} 个空记录...')

    # 批量删除
    batch_size = 500
    deleted = 0

    for i in range(0, len(empty_docs), batch_size):
        batch = db.batch()
        batch_docs = empty_docs[i:i+batch_size]

        for doc_id in batch_docs:
            doc_ref = db.collection('fec_company_name_variants').document(doc_id)
            batch.delete(doc_ref)
            deleted += 1

        batch.commit()
        print(f'  已删除 {deleted}/{len(empty_docs)}...')

    print(f'\n✅ 清理完成: 删除了 {deleted} 个空记录\n')
    return deleted


def rebuild_variants_from_index():
    """从 fec_company_index 重建 variants"""
    print('='*80)
    print('🔨 从 fec_company_index 重建 variants')
    print('='*80 + '\n')

    # 获取现有variants
    print('📂 加载现有 variants...')
    existing_docs = list(db.collection('fec_company_name_variants').stream())
    variants_by_normalized = {}

    for doc in existing_docs:
        data = doc.to_dict()
        normalized_name = data.get('normalized_name', '')
        variant_name = data.get('variant_name', '')

        if normalized_name and variant_name:
            if normalized_name not in variants_by_normalized:
                variants_by_normalized[normalized_name] = set()
            variants_by_normalized[normalized_name].add(variant_name)

    print(f'  已有 {len(variants_by_normalized)} 个公司的 variants')

    # 获取所有 index 中的公司
    print('\n📂 加载 fec_company_index...')
    index_docs = list(db.collection('fec_company_index').stream())
    print(f'  找到 {len(index_docs)} 个公司')

    # 找出缺失的 variants
    missing_variants = []

    for doc in index_docs:
        data = doc.to_dict()
        normalized_name = data.get('normalized_name', '')
        company_name = data.get('company_name', '')  # 使用company_name而不是original_names

        if not normalized_name:
            continue

        # 检查是否已有variant
        if normalized_name not in variants_by_normalized:
            # 完全缺失,需要添加company_name作为variant
            if company_name:
                missing_variants.append({
                    'normalized_name': normalized_name,
                    'variant_name': company_name,
                    'variant_name_lower': company_name.lower(),
                    'source': 'rebuild_from_index'
                })
        else:
            # 已存在,检查company_name是否在variants中
            existing = variants_by_normalized[normalized_name]
            if company_name and company_name not in existing:
                missing_variants.append({
                    'normalized_name': normalized_name,
                    'variant_name': company_name,
                    'variant_name_lower': company_name.lower(),
                    'source': 'rebuild_from_index'
                })

    print(f'\n📊 需要添加 {len(missing_variants)} 个缺失的 variant 记录')

    if not missing_variants:
        print('✅ 没有缺失的 variants\n')
        return 0

    print(f'\n📝 添加 {len(missing_variants)} 个 variant 记录...')

    # 批量添加
    batch_size = 500
    added = 0

    for i in range(0, len(missing_variants), batch_size):
        batch = db.batch()
        batch_docs = missing_variants[i:i+batch_size]

        for variant in batch_docs:
            # 生成doc_id (避免特殊字符)
            norm_clean = variant['normalized_name'].replace('/', '-').replace('\\', '-')
            var_clean = variant['variant_name'].lower().replace(' ', '_').replace('/', '-').replace('\\', '-')
            doc_id = f"{norm_clean}_{var_clean}"[:1500]  # Firestore doc ID limit

            doc_ref = db.collection('fec_company_name_variants').document(doc_id)
            batch.set(doc_ref, variant)
            added += 1

        batch.commit()
        print(f'  已添加 {added}/{len(missing_variants)}...')

    print(f'\n✅ 重建完成: 添加了 {added} 个 variant 记录\n')
    return added


def init_gemini_api():
    """初始化 Gemini API"""
    global gemini_api_key

    gemini_api_key = os.getenv('GEMINI_API_KEY')
    if not gemini_api_key:
        try:
            import subprocess
            result = subprocess.run(
                ['gcloud', 'secrets', 'versions', 'access', 'latest',
                 '--secret', 'gemini-api-key', '--project', 'gen-lang-client-0960644135'],
                capture_output=True, text=True, check=True
            )
            gemini_api_key = result.stdout.strip()
            print('✅ Gemini API Key loaded from Secret Manager\n')
        except Exception as e:
            print(f'❌ Failed to load Gemini API Key: {e}')
            print('   Set environment variable: export GEMINI_API_KEY=...')
            sys.exit(1)
    else:
        print('✅ Gemini API Key loaded from environment\n')

    return gemini_api_key


def generate_variants_with_ai(company_name, normalized_name):
    """使用 Gemini AI 生成公司名称变体"""
    prompt = f"""Given the company name: "{company_name}"

Generate at least 2 realistic name variations that would appear in FEC political donation records.
Include:
- Official full name
- Common abbreviations
- Name without legal suffixes (Inc., Corp., etc.)

Return ONLY a JSON array of strings, no explanation.
Example: ["Apple Inc.", "Apple Computer Inc.", "Apple"]
"""

    try:
        url = f'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key={gemini_api_key}'
        payload = {
            'contents': [{'parts': [{'text': prompt}]}],
            'generationConfig': {'temperature': 0.3, 'maxOutputTokens': 200}
        }

        response = requests.post(url, json=payload, timeout=30)
        response.raise_for_status()

        result = response.json()
        text = result['candidates'][0]['content']['parts'][0]['text'].strip()

        # Extract JSON array
        import json as json_lib
        match = re.search(r'\[.*\]', text, re.DOTALL)
        if match:
            variants = json_lib.loads(match.group(0))
            return variants if len(variants) >= 2 else [company_name, normalized_name]

        return [company_name, normalized_name]

    except Exception as e:
        # Fallback to simple variants
        return [company_name, normalized_name]


def match_sp500_ticker(normalized_name):
    """匹配 SP500 ticker (如果有的话)"""
    normalized_lower = normalized_name.lower()

    for ticker, full_name in SP500_COMPANIES.items():
        norm_sp500 = normalize_name(full_name).lower()

        # Exact match or very close match
        if normalized_lower == norm_sp500 or normalized_lower in norm_sp500:
            return ticker

    return None


# 手动映射: normalized_name -> (ticker, full_name)
# 这个映射用于直接为 SP500 公司添加 ticker 字段
MANUAL_TICKER_MAPPING = {
    'apple': ('AAPL', 'Apple Inc.'),
    'microsoft': ('MSFT', 'Microsoft Corporation'),
    'alphabet': ('GOOGL', 'Alphabet Inc.'),
    'google': ('GOOGL', 'Alphabet Inc.'),
    'amazon': ('AMZN', 'Amazon.com Inc.'),
    'nvidia': ('NVDA', 'NVIDIA Corporation'),
    'meta platforms': ('META', 'Meta Platforms Inc.'),
    'facebook': ('META', 'Meta Platforms Inc.'),
    'tesla': ('TSLA', 'Tesla Inc.'),
    'broadcom': ('AVGO', 'Broadcom Inc.'),
    'oracle': ('ORCL', 'Oracle Corporation'),
    'salesforce': ('CRM', 'Salesforce Inc.'),
    'advanced micro devices': ('AMD', 'Advanced Micro Devices Inc.'),
    'intel': ('INTC', 'Intel Corporation'),
    'international business machines': ('IBM', 'International Business Machines Corporation'),
    'ibm': ('IBM', 'International Business Machines Corporation'),
    'cisco systems': ('CSCO', 'Cisco Systems Inc.'),
    'cisco': ('CSCO', 'Cisco Systems Inc.'),
    'adobe': ('ADBE', 'Adobe Inc.'),
    'berkshire hathaway': ('BRK.B', 'Berkshire Hathaway Inc.'),
    'jpmorgan chase': ('JPM', 'JPMorgan Chase & Co.'),
    'jp morgan chase': ('JPM', 'JPMorgan Chase & Co.'),
    'visa': ('V', 'Visa Inc.'),
    'mastercard': ('MA', 'Mastercard Incorporated'),
    'bank of america': ('BAC', 'Bank of America Corporation'),
    'wells fargo': ('WFC', 'Wells Fargo & Company'),
    'goldman sachs': ('GS', 'Goldman Sachs Group Inc.'),
    'morgan stanley': ('MS', 'Morgan Stanley'),
    'blackrock': ('BLK', 'BlackRock Inc.'),
    'citigroup': ('C', 'Citigroup Inc.'),
    'unitedhealth': ('UNH', 'UnitedHealth Group Incorporated'),
    'johnson': ('JNJ', 'Johnson & Johnson'),
    'eli lilly': ('LLY', 'Eli Lilly and Company'),
    'pfizer': ('PFE', 'Pfizer Inc.'),
    'merck': ('MRK', 'Merck & Co. Inc.'),
    'abbvie': ('ABBV', 'AbbVie Inc.'),
    'thermo fisher scientific': ('TMO', 'Thermo Fisher Scientific Inc.'),
    'abbott laboratories': ('ABT', 'Abbott Laboratories'),
    'abbott': ('ABT', 'Abbott Laboratories'),
    'cvs health': ('CVS', 'CVS Health Corporation'),
    'bristol-myers squibb': ('BMY', 'Bristol-Myers Squibb Company'),
    'walmart': ('WMT', 'Walmart Inc.'),
    'procter': ('PG', 'The Procter & Gamble Company'),
    'coca-cola': ('KO', 'The Coca-Cola Company'),
    'pepsico': ('PEP', 'PepsiCo Inc.'),
    'costco wholesale': ('COST', 'Costco Wholesale Corporation'),
    'costco': ('COST', 'Costco Wholesale Corporation'),
    'home depot': ('HD', 'The Home Depot Inc.'),
    'mcdonald': ('MCD', 'McDonald\'s Corporation'),
    'nike': ('NKE', 'Nike Inc.'),
    'starbucks': ('SBUX', 'Starbucks Corporation'),
    'target': ('TGT', 'Target Corporation'),
    'lowe': ('LOW', 'Lowe\'s Companies Inc.'),
    'walt disney': ('DIS', 'The Walt Disney Company'),
    'disney': ('DIS', 'The Walt Disney Company'),
    'exxon mobil': ('XOM', 'Exxon Mobil Corporation'),
    'chevron': ('CVX', 'Chevron Corporation'),
    'conocophillips': ('COP', 'ConocoPhillips'),
    'schlumberger': ('SLB', 'Schlumberger Limited'),
    'eog resources': ('EOG', 'EOG Resources Inc.'),
    'occidental petroleum': ('OXY', 'Occidental Petroleum Corporation'),
    'phillips 66': ('PSX', 'Phillips 66'),
    'valero energy': ('VLO', 'Valero Energy Corporation'),
    'valero': ('VLO', 'Valero Energy Corporation'),
    'general electric': ('GE', 'General Electric Company'),
    'caterpillar': ('CAT', 'Caterpillar Inc.'),
    'raytheon technologies': ('RTX', 'Raytheon Technologies Corporation'),
    'raytheon': ('RTX', 'Raytheon Technologies Corporation'),
    'honeywell international': ('HON', 'Honeywell International Inc.'),
    'honeywell': ('HON', 'Honeywell International Inc.'),
    'united parcel service': ('UPS', 'United Parcel Service Inc.'),
    'ups': ('UPS', 'United Parcel Service Inc.'),
    'boeing': ('BA', 'The Boeing Company'),
    'lockheed martin': ('LMT', 'Lockheed Martin Corporation'),
    'deere': ('DE', 'Deere & Company'),
    'john deere': ('DE', 'Deere & Company'),
    'northrop grumman': ('NOC', 'Northrop Grumman Corporation'),
    'general dynamics': ('GD', 'General Dynamics Corporation'),
    'netflix': ('NFLX', 'Netflix Inc.'),
    'comcast': ('CMCSA', 'Comcast Corporation'),
    'att': ('T', 'AT&T Inc.'),
    'verizon communications': ('VZ', 'Verizon Communications Inc.'),
    'verizon': ('VZ', 'Verizon Communications Inc.'),
    't-mobile': ('TMUS', 'T-Mobile US Inc.'),
    'nextera energy': ('NEE', 'NextEra Energy Inc.'),
    'nextera': ('NEE', 'NextEra Energy Inc.'),
    'duke energy': ('DUK', 'Duke Energy Corporation'),
    'southern': ('SO', 'The Southern Company'),
    'dominion energy': ('D', 'Dominion Energy Inc.'),
    'dominion': ('D', 'Dominion Energy Inc.'),
    'american electric power': ('AEP', 'American Electric Power Company Inc.'),
    'linde': ('LIN', 'Linde plc'),
    'air products': ('APD', 'Air Products and Chemicals Inc.'),
    'sherwin-williams': ('SHW', 'The Sherwin-Williams Company'),
    'freeport-mcmoran': ('FCX', 'Freeport-McMoRan Inc.'),
    'newmont': ('NEM', 'Newmont Corporation'),
    'prologis': ('PLD', 'Prologis Inc.'),
    'american tower': ('AMT', 'American Tower Corporation'),
    'crown castle': ('CCI', 'Crown Castle Inc.'),
    'equinix': ('EQIX', 'Equinix Inc.'),
    'simon property': ('SPG', 'Simon Property Group Inc.'),
}


def add_sp500_tickers_manually():
    """手动为 SP500 公司添加 ticker 字段"""
    print('='*80)
    print('🏷️  手动为 SP500 公司添加 ticker 字段')
    print('='*80 + '\n')

    print(f'📂 加载现有 fec_company_name_variants...')
    all_docs = list(db.collection('fec_company_name_variants').stream())
    print(f'   找到 {len(all_docs)} 个文档\n')

    updated_count = 0
    already_has_ticker = 0
    not_found = 0

    print('🔍 匹配并更新 SP500 公司...\n')

    for doc in all_docs:
        data = doc.to_dict()
        normalized_name = data.get('normalized_name', '').lower()

        # 检查是否已有 ticker
        if data.get('ticker'):
            already_has_ticker += 1
            continue

        # 在手动映射中查找
        if normalized_name in MANUAL_TICKER_MAPPING:
            ticker, full_name = MANUAL_TICKER_MAPPING[normalized_name]

            # 更新文档
            doc.reference.update({
                'ticker': ticker,
                'company_full_name': full_name,
                'last_updated': datetime.utcnow()
            })

            updated_count += 1
            print(f'  ✅ [{ticker:6s}] {normalized_name:40s} → {full_name}')
        else:
            not_found += 1

    print(f'\n{"="*80}')
    print('📊 更新结果')
    print('='*80)
    print(f'  更新了 ticker: {updated_count} 个公司')
    print(f'  已有 ticker: {already_has_ticker} 个公司')
    print(f'  未找到匹配: {not_found} 个公司')
    print(f'  总文档数: {len(all_docs)}')
    print()

    return updated_count


def rebuild_with_ai():
    """使用 AI 从 fec_company_index 重建 variants"""
    print('='*80)
    print('🤖 使用 AI 从 fec_company_index 重建 variants')
    print('='*80 + '\n')

    # Initialize Gemini API
    init_gemini_api()

    # Step 1: 清理现有 collection
    print('🗑️  Step 1: 清理现有 fec_company_name_variants...')
    try:
        # Delete in batches
        batch_size = 500
        while True:
            docs = db.collection('fec_company_name_variants').limit(batch_size).stream()
            deleted = 0

            batch = db.batch()
            for doc in docs:
                batch.delete(doc.reference)
                deleted += 1

            if deleted == 0:
                break

            batch.commit()
            print(f'  Deleted {deleted} documents...')

        print('✅ Collection cleared\n')
    except Exception as e:
        print(f'❌ Failed to clear collection: {e}')
        sys.exit(1)

    # Step 2: 从 index 获取所有公司
    print('📂 Step 2: Loading companies from fec_company_index...')
    index_docs = list(db.collection('fec_company_index').stream())
    print(f'✅ Found {len(index_docs)} companies\n')

    # Step 3: 为每个公司生成 variants
    print(f'🤖 Step 3: Generating variants with AI for {len(index_docs)} companies...')
    print('   (This may take a while...)\n')

    created_count = 0
    failed_count = 0
    progress_interval = 10

    for i, doc in enumerate(index_docs, 1):
        data = doc.to_dict()
        normalized_name = data.get('normalized_name', '')
        company_name = data.get('company_name', normalized_name)

        if not normalized_name:
            continue

        # Progress update
        if i % progress_interval == 0 or i == len(index_docs):
            print(f'  [{i}/{len(index_docs)}] Processing: {company_name}...')

        # Match SP500 ticker
        ticker = match_sp500_ticker(normalized_name)

        # Generate variants with AI
        try:
            variants = generate_variants_with_ai(company_name, normalized_name)

            # Create a SINGLE document for the company with ALL variants
            doc_id = normalized_name[:1500]  # Use normalized_name as doc ID

            # Prepare variant objects array
            variant_objects = []
            for variant in variants:
                variant_lower = variant.lower()
                variant_objects.append({
                    'variant_name': variant,
                    'variant_name_lower': variant_lower,
                    'source': 'ai_generated'
                })

            doc_data = {
                'normalized_name': normalized_name,
                'company_name': company_name,
                'variants': variant_objects,
                'created_at': datetime.utcnow(),
                'last_updated': datetime.utcnow()
            }

            # Add ticker if matched
            if ticker:
                doc_data['ticker'] = ticker
                doc_data['company_full_name'] = SP500_COMPANIES[ticker]

            db.collection('fec_company_name_variants').document(doc_id).set(doc_data)
            created_count += 1

        except Exception as e:
            failed_count += 1
            if failed_count <= 10:  # Only print first 10 failures
                print(f'    ⚠️  Failed: {company_name} - {e}')

    print(f'\n✅ Rebuild complete!')
    print(f'   Created: {created_count} variants')
    print(f'   Failed: {failed_count} companies')
    print()

    return created_count


def verify_data_consistency():
    """验证数据一致性"""
    print('='*80)
    print('✅ 验证数据一致性')
    print('='*80 + '\n')

    # 获取index中的所有normalized_names
    index_docs = list(db.collection('fec_company_index').stream())
    index_names = {doc.to_dict().get('normalized_name', '') for doc in index_docs if doc.to_dict().get('normalized_name')}

    # 获取variants中的所有normalized_names
    variant_docs = list(db.collection('fec_company_name_variants').stream())
    variant_names = {doc.to_dict().get('normalized_name', '') for doc in variant_docs if doc.to_dict().get('normalized_name')}

    print(f'📊 Index 公司数: {len(index_names)}')
    print(f'📊 Variant 公司数: {len(variant_names)}')

    # 检查缺失
    missing_in_variants = index_names - variant_names
    only_in_variants = variant_names - index_names

    # 检查空记录
    empty_count = sum(1 for doc in variant_docs if not doc.to_dict().get('normalized_name') or not doc.to_dict().get('variant_name'))

    print()
    if missing_in_variants:
        print(f'⚠️  {len(missing_in_variants)} 个公司在 index 中但不在 variants 中')
    else:
        print(f'✅ 所有 index 公司都有对应的 variants')

    if only_in_variants:
        print(f'⚠️  {len(only_in_variants)} 个公司在 variants 中但不在 index 中')
    else:
        print(f'✅ 所有 variant 公司都在 index 中')

    if empty_count > 0:
        print(f'⚠️  仍有 {empty_count} 个空记录')
    else:
        print(f'✅ 没有空记录')

    print()

    return len(missing_in_variants) == 0 and empty_count == 0


def save_report(variant_docs):
    """保存详细报告"""
    report_file = REPORTS_DIR / '12-company-variants-report.json'

    print(f'💾 保存报告到 {report_file}...')

    # 统计信息
    stats = {
        'total_companies': len(variant_docs),
        'verified_companies': sum(1 for d in variant_docs if d.get('is_verified')),
        'auto_detected_companies': sum(1 for d in variant_docs if not d.get('is_verified')),
        'total_committees': sum(d['committee_count'] for d in variant_docs),
        'avg_variants_per_company': sum(d['variant_count'] for d in variant_docs) / len(variant_docs),
        'generated_at': datetime.utcnow().isoformat()
    }

    # Top 20 companies by committee count
    top_20 = sorted(variant_docs, key=lambda x: x['committee_count'], reverse=True)[:20]

    report = {
        'statistics': stats,
        'top_20_companies': [
            {
                'canonical_name': d['canonical_name'],
                'display_name': d['display_name'],
                'committee_count': d['committee_count'],
                'variant_count': d['variant_count'],
                'is_verified': d.get('is_verified', False)
            }
            for d in top_20
        ]
    }

    with open(report_file, 'w', encoding='utf-8') as f:
        json.dump(report, f, indent=2, ensure_ascii=False, default=str)

    print(f'✅ 报告已保存\n')

    # 打印统计
    print('📊 统计信息:')
    print(f'  总公司数: {stats["total_companies"]}')
    print(f'  已验证公司: {stats["verified_companies"]}')
    print(f'  自动检测公司: {stats["auto_detected_companies"]}')
    print(f'  总委员会数: {stats["total_committees"]}')
    print(f'  平均每公司变体数: {stats["avg_variants_per_company"]:.1f}')
    print()

    print('🏆 Top 10 公司 (按委员会数):')
    for i, company in enumerate(top_20[:10], 1):
        verified = '✓' if company['is_verified'] else ' '
        print(f'  {i:2d}. [{verified}] {company["canonical_name"]:30s} - {company["committee_count"]:3d} 个委员会, {company["variant_count"]} 个变体')
    print()

def main():
    """主函数"""
    parser = argparse.ArgumentParser(description='构建和管理公司名称变体映射表')
    parser.add_argument('--cleanup', action='store_true', help='清理空的variant记录')
    parser.add_argument('--rebuild-from-index', action='store_true', help='从fec_company_index重建缺失的variants')
    parser.add_argument('--rebuild-with-ai', action='store_true', help='使用AI重建所有variants (清空collection并重新生成)')
    parser.add_argument('--verify', action='store_true', help='验证数据一致性')
    parser.add_argument('--add-tickers', action='store_true', help='手动为SP500公司添加ticker字段')
    args = parser.parse_args()

    print('\n' + '='*80)
    print('🏢 公司名称变体映射表管理')
    print('='*80 + '\n')

    # 初始化Firestore
    init_firestore()

    # 如果指定了特定操作，执行对应操作
    if args.cleanup:
        deleted = cleanup_empty_variants()
        print(f'\n✅ 清理完成: 删除了 {deleted} 个空记录')
        return

    if args.add_tickers:
        updated = add_sp500_tickers_manually()
        print(f'\n✅ Ticker添加完成: 更新了 {updated} 个公司')
        return

    if args.rebuild_with_ai:
        # 初始化 Gemini API
        init_gemini_api()

        print('='*80)
        print('🤖 使用 AI 重建所有 variants')
        print('='*80 + '\n')
        print('⚠️  这将清空现有的 fec_company_name_variants collection')
        print('⚠️  并使用 Gemini AI 为所有公司生成新的 name variants')
        print()

        # 执行重建
        rebuild_with_ai()

        # 重建后自动验证
        print('\n')
        verify_data_consistency()

        print('\n✅ AI 重建完成！')
        return

    if args.rebuild_from_index:
        added = rebuild_variants_from_index()
        print(f'\n✅ 重建完成: 添加了 {added} 个variant记录')

        # 重建后自动验证
        print('\n')
        verify_data_consistency()
        return

    if args.verify:
        is_consistent = verify_data_consistency()
        if is_consistent:
            print('✅ 数据一致性验证通过')
        else:
            print('⚠️  数据存在不一致，建议运行 --cleanup 和 --rebuild-from-index')
        return

    # 默认行为: 构建variants (原有逻辑)
    print('='*80)
    print('🏢 自动构建公司名称变体映射表')
    print('='*80 + '\n')

    # 步骤1: 提取所有公司名称
    print('='*80)
    print('步骤 1/5: 提取公司名称')
    print('='*80 + '\n')
    companies, verified_mapping = extract_all_company_names()

    # 步骤2: 分组相似公司
    print('='*80)
    print('步骤 2/5: 分组相似公司')
    print('='*80 + '\n')
    grouped = group_similar_companies(companies, similarity_threshold=85)

    # 步骤3: 构建variant文档
    print('='*80)
    print('步骤 3/5: 构建variant文档')
    print('='*80 + '\n')
    variant_docs = build_variant_documents(grouped, companies)

    # 步骤4: 添加已验证公司
    print('='*80)
    print('步骤 4/5: 添加已验证公司')
    print('='*80 + '\n')
    variant_docs = add_verified_companies(variant_docs)

    # 步骤5: 上传到Firestore
    print('='*80)
    print('步骤 5/5: 上传到Firestore')
    print('='*80 + '\n')

    print(f'准备上传 {len(variant_docs)} 个variant文档到Firestore...\n')
    uploaded = upload_variants(variant_docs)

    # 保存报告
    save_report(variant_docs)

    print('='*80)
    print('✅ 完成！')
    print('='*80)
    print(f'\n下一步:')
    print(f'  1. 在Firebase Console验证 fec_company_name_variants collection')
    print(f'  2. 查看报告: {REPORTS_DIR / "12-company-variants-report.json"}')
    print(f'  3. 开始上传contributions: python3 02-upload-incremental.py')
    print()

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
