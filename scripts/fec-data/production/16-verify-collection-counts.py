#!/usr/bin/env python3
"""
Verify that source and destination collections have the same document count
"""

import sys
try:
    import firebase_admin
    from firebase_admin import credentials, firestore
except ImportError:
    print('❌ Firebase库未安装')
    print('  请运行: pip install firebase-admin')
    sys.exit(1)

# Configuration
PROJECT_ID = 'stanseproject'
OLD_COLLECTION = 'fec_raw_contributions_pac_to_candidate'
NEW_COLLECTION = 'fec_raw_contributions_pac_to_candidate_24'

def init_firestore():
    """初始化Firestore"""
    print('🔧 初始化Firestore连接...')
    try:
        if not firebase_admin._apps:
            firebase_admin.initialize_app(options={'projectId': PROJECT_ID})
        db = firestore.client()
        print(f'✅ Firestore已连接 (项目: {PROJECT_ID})\n')
        return db
    except Exception as e:
        print(f'❌ 失败: {e}')
        sys.exit(1)

def count_collection_fast(db, collection_name):
    """
    快速估算集合文档数量
    使用聚合查询API (比流式读取快得多)
    """
    from google.cloud.firestore_v1.aggregation import AggregationQuery
    from google.cloud.firestore_v1 import FieldFilter

    print(f'📊 正在计算 {collection_name} 的文档数量...')
    print('   (使用聚合查询API - 这可能需要几分钟)')

    try:
        collection_ref = db.collection(collection_name)

        # 使用聚合查询 - 这是最快的方法
        from google.cloud.firestore_v1.base_query import FieldFilter
        from google.cloud import firestore as firestore_pkg

        # 创建聚合查询来计数
        query = collection_ref
        agg_query = firestore_pkg.aggregation.AggregationQuery(query)
        agg_query = agg_query.count(alias='total_count')

        # 执行聚合查询
        result = agg_query.get()
        count = result[0][0].value

        return count
    except Exception as e:
        print(f'   ⚠️  聚合查询失败: {e}')
        print(f'   尝试备用方法 (stream + limit)...')

        # 备用方法: 使用limit估算
        # 这不是精确计数,但可以快速验证数量级是否正确
        sample_size = 10000
        docs = list(collection_ref.limit(sample_size).stream())

        if len(docs) < sample_size:
            # 如果返回的文档少于sample_size,说明总数就是这么多
            return len(docs)
        else:
            print(f'   ⚠️  无法精确计数,集合至少有 {sample_size:,} 个文档')
            return None

def main():
    print('='*70)
    print('📦 FEC Collection Count Verification')
    print('='*70)
    print(f'\n比较两个集合的文档数量:')
    print(f'  旧集合: {OLD_COLLECTION}')
    print(f'  新集合: {NEW_COLLECTION}\n')

    # Initialize Firestore
    db = init_firestore()

    # Count both collections
    old_count = count_collection_fast(db, OLD_COLLECTION)
    print(f'   ✓ 旧集合文档数: {old_count:,}\n' if old_count else '   ⚠️  无法精确计数旧集合\n')

    new_count = count_collection_fast(db, NEW_COLLECTION)
    print(f'   ✓ 新集合文档数: {new_count:,}\n' if new_count else '   ⚠️  无法精确计数新集合\n')

    # Compare
    print('='*70)
    if old_count is not None and new_count is not None:
        if old_count == new_count:
            print('✅ 验证成功! 两个集合的文档数量一致')
            print(f'   共 {old_count:,} 个文档已成功迁移')
        else:
            print('⚠️  警告: 文档数量不一致!')
            print(f'   旧集合: {old_count:,}')
            print(f'   新集合: {new_count:,}')
            print(f'   差异:   {abs(old_count - new_count):,} 个文档')

            if new_count > old_count:
                print(f'\n   💡 新集合比旧集合多 {new_count - old_count:,} 个文档')
                print(f'      这可能是因为:')
                print(f'      1. 迁移过程中旧集合有新文档写入')
                print(f'      2. 目标集合已经包含一些文档')
            else:
                print(f'\n   ⚠️  新集合比旧集合少 {old_count - new_count:,} 个文档')
                print(f'      需要调查原因!')
    else:
        print('⚠️  无法进行完整验证 (聚合查询不可用)')
        print('   建议: 在Firebase Console手动检查两个集合的大小')
    print('='*70)

if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print('\n\n⚠️  验证被用户中断')
        sys.exit(1)
    except Exception as e:
        print(f'\n\n❌ 验证失败: {e}')
        import traceback
        traceback.print_exc()
        sys.exit(1)
