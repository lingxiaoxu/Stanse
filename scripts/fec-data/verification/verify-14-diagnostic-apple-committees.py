#!/usr/bin/env python3
"""
诊断: 查找 committee_name 中包含 "APPLE" 的委员会
目标: 解释为什么这些委员会不属于 Apple Inc
"""

import sys
import os

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

print("="*70)
print("🔍 诊断: 查找 committee_name 中包含 'APPLE' 的委员会")
print("="*70)

# 查询 committee_name 中包含 "APPLE" 的所有委员会
committee_ref = db.collection('fec_raw_committees')

# 使用范围查询查找所有包含 "APPLE" 的委员会
docs = list(committee_ref.where(
    filter=firestore.FieldFilter('committee_name', '>=', 'APPLE')
).where(
    filter=firestore.FieldFilter('committee_name', '<=', 'APPLE\uf8ff')
).limit(10).stream())

print(f"\n📊 找到 {len(docs)} 个委员会名称包含 'APPLE':\n")

for i, doc in enumerate(docs, 1):
    data = doc.to_dict()
    print(f"委员会 #{i}:")
    print(f"  Committee ID: {data.get('committee_id', 'N/A')}")
    print(f"  Committee Name: {data.get('committee_name', 'N/A')}")
    print(f"  Connected Org: {data.get('connected_org_name', 'N/A')}")
    print(f"  Committee Type: {data.get('committee_type', 'N/A')}")
    print(f"  Year: {data.get('year', 'N/A')}")
    print()

if len(docs) == 0:
    print("❌ 未找到任何包含 'APPLE' 的委员会")
else:
    print("\n" + "="*70)
    print("💡 分析:")
    print("="*70)
    print("这些委员会虽然名称中包含 'APPLE'，但:")
    print("  1. 检查 'Connected Org' 字段是否为 Apple Inc")
    print("  2. 如果不是，则这些委员会与苹果公司无关")
    print("  3. 可能是个人名字中包含 Apple，或者其他组织")
    print("="*70)
