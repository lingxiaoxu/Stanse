#!/usr/bin/env python3
"""
验证fec_company_index和fec_company_name_variants的数据质量

检查项:
1. fec_company_index 中是否有重复的 normalized_name
2. fec_company_name_variants 中是否有重复的记录
3. 验证最近添加的公司(source='pac_discovery')是否有效
4. 检查数据一致性
"""

import sys
import os
from collections import defaultdict

# 添加项目根目录到Python路径
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../..')))

import firebase_admin
from firebase_admin import credentials, firestore

# 初始化Firebase
if not firebase_admin._apps:
    cred = credentials.ApplicationDefault()
    firebase_admin.initialize_app(cred, {'projectId': 'stanseproject'})

db = firestore.client()


def check_index_duplicates():
    """检查 fec_company_index 中的重复项"""
    print("=" * 70)
    print("🔍 Checking fec_company_index for duplicates")
    print("=" * 70)

    docs = list(db.collection('fec_company_index').stream())

    # 统计每个normalized_name出现的次数
    normalized_names = {}
    duplicates = []

    for doc in docs:
        data = doc.to_dict()
        normalized_name = data.get('normalized_name', '')

        if normalized_name in normalized_names:
            duplicates.append({
                'normalized_name': normalized_name,
                'doc_ids': [normalized_names[normalized_name], doc.id]
            })
        else:
            normalized_names[normalized_name] = doc.id

    print(f"\n📊 Total documents in fec_company_index: {len(docs)}")
    print(f"📊 Unique normalized_names: {len(normalized_names)}")

    if duplicates:
        print(f"\n⚠️  Found {len(duplicates)} duplicates:")
        for dup in duplicates[:10]:  # 只显示前10个
            print(f"  • {dup['normalized_name']}: doc_ids = {dup['doc_ids']}")
        if len(duplicates) > 10:
            print(f"  ... and {len(duplicates) - 10} more")
    else:
        print(f"\n✅ No duplicates found in fec_company_index")

    return len(duplicates) == 0


def check_variants_duplicates():
    """检查 fec_company_name_variants 中的重复项"""
    print("\n" + "=" * 70)
    print("🔍 Checking fec_company_name_variants for duplicates")
    print("=" * 70)

    docs = list(db.collection('fec_company_name_variants').stream())

    # 统计每个 (normalized_name, variant_name) 组合
    variants_map = defaultdict(list)
    doc_id_counts = defaultdict(int)

    for doc in docs:
        data = doc.to_dict()
        normalized_name = data.get('normalized_name', '')
        variant_name = data.get('variant_name', '')
        key = (normalized_name, variant_name)

        variants_map[key].append(doc.id)
        doc_id_counts[doc.id] += 1

    # 检查重复的variant组合
    duplicates = {k: v for k, v in variants_map.items() if len(v) > 1}

    # 检查重复的document ID
    duplicate_doc_ids = {k: v for k, v in doc_id_counts.items() if v > 1}

    print(f"\n📊 Total documents in fec_company_name_variants: {len(docs)}")
    print(f"📊 Unique (normalized_name, variant_name) combinations: {len(variants_map)}")

    if duplicates:
        print(f"\n⚠️  Found {len(duplicates)} duplicate variants:")
        for (norm, var), doc_ids in list(duplicates.items())[:10]:
            print(f"  • ({norm}, {var}): {len(doc_ids)} copies")
        if len(duplicates) > 10:
            print(f"  ... and {len(duplicates) - 10} more")
    else:
        print(f"\n✅ No duplicate variants found")

    if duplicate_doc_ids:
        print(f"\n⚠️  Found {len(duplicate_doc_ids)} documents with duplicate IDs")

    return len(duplicates) == 0 and len(duplicate_doc_ids) == 0


def check_pac_discovery_companies():
    """检查最近添加的 source='pac_discovery' 公司"""
    print("\n" + "=" * 70)
    print("🔍 Checking companies added from PAC discovery")
    print("=" * 70)

    # 从 fec_company_index 查询 source='pac_discovery'
    docs = list(db.collection('fec_company_index').where(
        filter=firestore.FieldFilter('source', '==', 'pac_discovery')
    ).stream())

    print(f"\n📊 Total PAC discovery companies in index: {len(docs)}")

    if len(docs) > 0:
        print(f"\n📋 Sample companies (first 10):")
        for i, doc in enumerate(docs[:10], 1):
            data = doc.to_dict()
            print(f"  {i}. {data.get('normalized_name', 'N/A')}")
            print(f"     Original names: {data.get('original_names', [])}")
            print(f"     Has PAC data: {data.get('has_pac_data', False)}")

    # 检查这些公司是否在 fec_company_name_variants 中也存在
    print(f"\n🔗 Checking if PAC discovery companies have corresponding variants...")

    missing_variants = []
    for doc in docs[:20]:  # 只检查前20个
        data = doc.to_dict()
        normalized_name = data.get('normalized_name', '')

        # 查询该normalized_name在variants中的记录
        variant_docs = list(db.collection('fec_company_name_variants').where(
            filter=firestore.FieldFilter('normalized_name', '==', normalized_name)
        ).limit(1).stream())

        if not variant_docs:
            missing_variants.append(normalized_name)

    if missing_variants:
        print(f"\n⚠️  {len(missing_variants)} companies missing from variants:")
        for name in missing_variants[:10]:
            print(f"  • {name}")
    else:
        print(f"\n✅ All checked companies have corresponding variants")

    return len(docs) > 0


def check_data_consistency():
    """检查数据一致性"""
    print("\n" + "=" * 70)
    print("🔍 Checking data consistency between index and variants")
    print("=" * 70)

    # 获取所有index中的normalized_names
    index_docs = list(db.collection('fec_company_index').stream())
    index_names = {doc.to_dict().get('normalized_name', '') for doc in index_docs}

    # 获取所有variants中的normalized_names
    variant_docs = list(db.collection('fec_company_name_variants').stream())
    variant_names = {doc.to_dict().get('normalized_name', '') for doc in variant_docs}

    print(f"\n📊 Normalized names in fec_company_index: {len(index_names)}")
    print(f"📊 Normalized names in fec_company_name_variants: {len(variant_names)}")

    # 检查variants中有但index中没有的
    only_in_variants = variant_names - index_names

    # 检查index中有但variants中没有的
    only_in_index = index_names - variant_names

    if only_in_variants:
        print(f"\n⚠️  {len(only_in_variants)} names in variants but not in index:")
        for name in list(only_in_variants)[:10]:
            print(f"  • {name}")
        if len(only_in_variants) > 10:
            print(f"  ... and {len(only_in_variants) - 10} more")

    if only_in_index:
        print(f"\n⚠️  {len(only_in_index)} names in index but not in variants:")
        for name in list(only_in_index)[:10]:
            print(f"  • {name}")
        if len(only_in_index) > 10:
            print(f"  ... and {len(only_in_index) - 10} more")

    if not only_in_variants and not only_in_index:
        print(f"\n✅ Perfect consistency between index and variants")

    return len(only_in_variants) == 0 and len(only_in_index) == 0


def main():
    print("\n" + "=" * 70)
    print("📊 FEC Company Index & Variants Quality Check")
    print("=" * 70)

    results = {}

    # 1. 检查index重复
    results['index_no_duplicates'] = check_index_duplicates()

    # 2. 检查variants重复
    results['variants_no_duplicates'] = check_variants_duplicates()

    # 3. 检查PAC discovery公司
    results['pac_discovery_exists'] = check_pac_discovery_companies()

    # 4. 检查数据一致性
    results['data_consistent'] = check_data_consistency()

    # 总结
    print("\n" + "=" * 70)
    print("📋 Summary")
    print("=" * 70)

    all_passed = all(results.values())

    for check, passed in results.items():
        status = "✅" if passed else "❌"
        print(f"{status} {check}")

    print("\n" + "=" * 70)
    if all_passed:
        print("✅ All checks passed! Data quality is good.")
    else:
        print("⚠️  Some checks failed. Please review the issues above.")
    print("=" * 70 + "\n")


if __name__ == "__main__":
    main()
