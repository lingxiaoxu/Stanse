#!/usr/bin/env python3
"""
自动构建公司名称变体映射表
从所有20,934个委员会记录中提取公司名称，使用模糊匹配自动分组变体
"""

import sys
import os
from pathlib import Path
from datetime import datetime
from collections import defaultdict
import json
import re

try:
    import firebase_admin
    from firebase_admin import credentials, firestore
    from rapidfuzz import fuzz, process
except ImportError as e:
    print(f'❌ 缺少依赖库: {e}')
    print('安装: pip install firebase-admin rapidfuzz')
    sys.exit(1)

PROJECT_ID = 'stanseproject'
REPORTS_DIR = Path(__file__).parent.parent / 'reports'
PROGRESS_FILE = REPORTS_DIR / '12-variant-building-progress.json'

db = None

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
    print('\n' + '='*80)
    print('🏢 自动构建公司名称变体映射表')
    print('='*80 + '\n')

    # 初始化Firestore
    init_firestore()

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
