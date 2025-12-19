#!/usr/bin/env python3
"""
删除已损坏的FEC数据
1. 删除所有 fec_raw_contributions_pac_to_candidate (701,559条 - 日期字段错误)
2. 删除所有 fec_company_party_summary (基于错误数据构建的汇总)
3. 删除所有 fec_company_index (基于错误数据构建的索引)
"""

import sys
import os
import subprocess
import time
from pathlib import Path

try:
    import firebase_admin
    from firebase_admin import credentials, firestore
except ImportError:
    print('❌ Firebase库未安装')
    sys.exit(1)

PROJECT_ID = 'stanseproject'
DATA_YEAR = '24'  # 可选: '16', '18', '20', '22', '24'
db = None

def init_firestore():
    """初始化Firestore - 使用gcloud auth"""
    global db
    print('🔧 初始化Firestore连接...')

    try:
        if not firebase_admin._apps:
            # 直接使用 Firebase Admin，它会自动查找凭证
            # 按顺序尝试: 环境变量 -> ADC -> gcloud auth
            print('  ℹ️  使用默认凭证链（gcloud/环境变量）...')
            firebase_admin.initialize_app(options={'projectId': PROJECT_ID})

        db = firestore.client()
        print(f'✅ Firestore已连接 (项目: {PROJECT_ID})')
        print(f'  💡 使用已登录的 gcloud 凭证\n')
        return db
    except Exception as e:
        print(f'❌ 失败: {e}')
        sys.exit(1)

def delete_collection(collection_name, batch_size=500):
    """删除整个collection"""
    print(f'\n🗑️  删除 {collection_name}...')

    deleted = 0
    while True:
        docs = list(db.collection(collection_name).limit(batch_size).stream())

        if not docs:
            break

        batch = db.batch()
        for doc in docs:
            batch.delete(doc.reference)
            deleted += 1

        batch.commit()
        print(f'  已删除 {deleted} 条记录...')
        time.sleep(0.5)  # 避免配额限制

    print(f'✅ 成功删除 {deleted} 条记录\n')
    return deleted

def main():
    """主函数"""
    print('\n' + '='*80)
    print('🗑️  删除损坏的FEC数据')
    print('='*80 + '\n')

    print('⚠️  此脚本将删除：')
    print(f'   1. fec_raw_contributions_pac_to_candidate_{DATA_YEAR} (~701,559条)')
    print('   2. fec_company_party_summary (所有年度汇总)')
    print('   3. fec_company_index (所有公司索引)')
    print('\n原因：transaction_date字段包含金额而非日期，导致所有数据不可用\n')

    response = input('确认删除？输入 "DELETE" 继续: ')
    if response != 'DELETE':
        print('❌ 已取消')
        sys.exit(0)

    init_firestore()

    # 删除错误的contributions
    print('\n' + '='*80)
    print('步骤1/3: 删除错误的contributions')
    print('='*80)
    delete_collection(f'fec_raw_contributions_pac_to_candidate_{DATA_YEAR}')

    # 删除错误的party summary
    print('\n' + '='*80)
    print('步骤2/3: 删除错误的party summary')
    print('='*80)
    delete_collection('fec_company_party_summary')

    # 删除错误的company index
    print('\n' + '='*80)
    print('步骤3/3: 删除错误的company index')
    print('='*80)
    delete_collection('fec_company_index')

    print('\n' + '='*80)
    print('✅ 删除完成！')
    print('='*80)
    print(f'\n下一步:')
    print(f'  1. 清空progress文件:')
    print(f'     python3 -c "import json; json.dump({{}}, open(\'../reports/01-upload-progress.json\', \'w\'), indent=2)"')
    print(f'  2. 重新上传contributions (使用修复后的脚本):')
    print(f'     python3 02-upload-incremental.py')
    print(f'  3. 重建索引:')
    print(f'     python3 10-create-manual-indexes.py')
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