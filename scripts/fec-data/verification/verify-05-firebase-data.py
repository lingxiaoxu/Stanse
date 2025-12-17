#!/usr/bin/env python3
"""
完整验证Firebase中的FEC数据：检查collection存在性、文档数量、是否匹配预期、是否有重复
"""

import sys
import json
import subprocess
from pathlib import Path
from datetime import datetime
from collections import defaultdict

try:
    import firebase_admin
    from firebase_admin import credentials, firestore
except ImportError:
    print('❌ Firebase库未安装')
    sys.exit(1)

PROJECT_ID = 'stanseproject'
PROGRESS_FILE = Path(__file__).parent.parent / 'reports' / '01-upload-progress.json'
db = None

def init_firestore():
    """初始化Firestore"""
    global db

    if not firebase_admin._apps:
        try:
            result = subprocess.run(
                ['gcloud', 'auth', 'print-access-token'],
                capture_output=True, text=True, check=True
            )
            access_token = result.stdout.strip()

            from google.oauth2 import credentials as oauth_creds
            cred = oauth_creds.Credentials(access_token)
            firebase_admin.initialize_app(cred, options={'projectId': PROJECT_ID})
        except:
            firebase_admin.initialize_app(options={'projectId': PROJECT_ID})

    db = firestore.client()
    return db

def load_progress():
    """加载上传进度文件"""
    if PROGRESS_FILE.exists():
        with open(PROGRESS_FILE, 'r') as f:
            return json.load(f)
    return {}

def count_all_documents(collection_name, show_progress=True):
    """计算collection中的所有文档数量并检查重复"""
    try:
        if show_progress:
            print(f'   正在计数 {collection_name}...', end='', flush=True)

        doc_ids = []
        batch_size = 1000
        last_doc = None

        while True:
            query = db.collection(collection_name).limit(batch_size)
            if last_doc:
                query = query.start_after(last_doc)

            docs = list(query.stream())
            if not docs:
                break

            for doc in docs:
                doc_ids.append(doc.id)

            if show_progress and len(doc_ids) % 5000 == 0:
                print(f'\r   正在计数 {collection_name}... {len(doc_ids):,}', end='', flush=True)

            if len(docs) < batch_size:
                break

            last_doc = docs[-1]

        if show_progress:
            print(f'\r   正在计数 {collection_name}... {len(doc_ids):,} ✓')

        # 检查重复
        unique_ids = set(doc_ids)
        duplicates = len(doc_ids) - len(unique_ids)

        # 查找重复的ID
        duplicate_ids = []
        if duplicates > 0:
            id_counts = defaultdict(int)
            for doc_id in doc_ids:
                id_counts[doc_id] += 1
            duplicate_ids = [doc_id for doc_id, count in id_counts.items() if count > 1]

        return {
            'total': len(doc_ids),
            'unique': len(unique_ids),
            'duplicates': duplicates,
            'duplicate_ids': duplicate_ids[:10]  # 只返回前10个重复ID
        }
    except Exception as e:
        return {
            'error': str(e),
            'total': 0,
            'unique': 0,
            'duplicates': 0
        }

def main():
    """主验证流程"""
    print('\n' + '='*80)
    print('📊 Firebase FEC数据完整性验证')
    print('='*80)
    print(f'\n时间: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}\n')

    # 初始化Firebase
    try:
        init_firestore()
        print('✅ Firebase连接成功\n')
    except Exception as e:
        print(f'❌ Firebase连接失败: {e}')
        sys.exit(1)

    # 加载预期值
    progress = load_progress()

    # 定义要检查的collections
    collections_to_check = [
        {
            'name': 'fec_raw_committees',
            'description': '委员会原始数据',
            'expected': progress.get('committees_uploaded', 0),
            'status': '✅ 完成' if progress.get('committees_completed') else '⏳ 进行中'
        },
        {
            'name': 'fec_raw_candidates',
            'description': '候选人原始数据',
            'expected': progress.get('candidates_uploaded', 0),
            'status': '✅ 完成' if progress.get('candidates_completed') else '⏳ 进行中'
        },
        {
            'name': 'fec_raw_contributions_pac_to_candidate',
            'description': 'PAC捐款原始数据',
            'expected': progress.get('contributions_uploaded', 0),
            'status': '✅ 完成' if progress.get('contributions_completed') else '⏳ 进行中'
        },
        {
            'name': 'fec_company_index',
            'description': '公司索引',
            'expected': 0,
            'status': '⏹️ 未构建'
        },
        {
            'name': 'fec_company_party_summary',
            'description': '公司政党汇总',
            'expected': 1,  # 测试数据
            'status': '⏹️ 仅测试数据'
        }
    ]

    print('='*80)
    print('开始验证...\n')

    results = []

    for collection_info in collections_to_check:
        collection_name = collection_info['name']
        expected = collection_info['expected']
        description = collection_info['description']
        status = collection_info['status']

        print(f'📁 Collection: {collection_name}')
        print(f'   描述: {description}')
        print(f'   状态: {status}')
        print(f'   预期文档数: {expected:,}')

        # 计数并检查重复
        count_result = count_all_documents(collection_name)

        if 'error' in count_result:
            print(f'   ❌ 错误: {count_result["error"]}\n')
            results.append({
                'collection': collection_name,
                'expected': expected,
                'actual': 'ERROR',
                'match': False,
                'duplicates': 0,
                'error': count_result['error']
            })
            continue

        actual = count_result['total']
        duplicates = count_result['duplicates']

        print(f'   实际文档数: {actual:,}')

        # 检查是否匹配
        match = (actual == expected)
        if match:
            print(f'   ✅ 匹配预期')
        else:
            diff = actual - expected
            if diff > 0:
                print(f'   ⚠️  多了 {diff:,} 条')
            else:
                print(f'   ⚠️  少了 {abs(diff):,} 条')

        # 检查重复
        if duplicates > 0:
            print(f'   ❌ 发现 {duplicates:,} 个重复文档')
            if count_result['duplicate_ids']:
                print(f'   重复ID示例: {", ".join(count_result["duplicate_ids"][:3])}...')
        else:
            print(f'   ✅ 无重复文档')

        print()

        results.append({
            'collection': collection_name,
            'description': description,
            'expected': expected,
            'actual': actual,
            'match': match,
            'duplicates': duplicates,
            'duplicate_ids': count_result.get('duplicate_ids', [])
        })

    # 总结
    print('='*80)
    print('📊 验证总结')
    print('='*80)
    print()

    total_collections = len(results)
    matching = sum(1 for r in results if r.get('match', False))
    with_duplicates = sum(1 for r in results if r.get('duplicates', 0) > 0)
    with_errors = sum(1 for r in results if 'error' in r)

    print(f'检查的Collections数量: {total_collections}')
    print(f'匹配预期的Collections: {matching}/{total_collections}')
    print(f'有重复记录的Collections: {with_duplicates}')
    print(f'发生错误的Collections: {with_errors}')
    print()

    # 详细表格
    print(f'{"Collection":<50} {"预期":>12} {"实际":>12} {"重复":>8} {"状态":>8}')
    print('─' * 92)

    for r in results:
        actual_str = f"{r['actual']:,}" if isinstance(r['actual'], int) else str(r['actual'])
        duplicates_str = f"{r['duplicates']:,}" if r['duplicates'] > 0 else "-"

        if 'error' in r:
            status = "❌ 错误"
        elif not r['match']:
            status = "⚠️  不匹配"
        elif r['duplicates'] > 0:
            status = "⚠️  重复"
        else:
            status = "✅ 正常"

        print(f"{r['collection']:<50} {r['expected']:>12,} {actual_str:>12} {duplicates_str:>8} {status:>8}")

    print()
    print('='*80)

    # 最终判断
    all_good = (
        matching == total_collections and
        with_duplicates == 0 and
        with_errors == 0
    )

    if all_good:
        print('✅ 所有检查通过！')
        print('   - 所有collections存在')
        print('   - 所有文档数量匹配预期')
        print('   - 没有发现重复记录')
    else:
        print('⚠️  发现问题：')
        if matching < total_collections:
            print(f'   - {total_collections - matching} 个collection的文档数量不匹配预期')
        if with_duplicates > 0:
            print(f'   - {with_duplicates} 个collection有重复记录')
        if with_errors > 0:
            print(f'   - {with_errors} 个collection发生错误')

    print('='*80)
    print()

    # 保存结果到JSON
    result_file = Path(__file__).parent.parent / 'reports' / '05-verification-result.json'
    with open(result_file, 'w') as f:
        json.dump({
            'timestamp': datetime.now().isoformat(),
            'summary': {
                'total_collections': total_collections,
                'matching': matching,
                'with_duplicates': with_duplicates,
                'with_errors': with_errors,
                'all_good': all_good
            },
            'results': results
        }, f, indent=2, ensure_ascii=False)

    print(f'验证结果已保存到: {result_file}')
    print()

if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print('\n\n中断验证。')
        sys.exit(0)
    except Exception as e:
        print(f'\n❌ 发生错误: {e}')
        import traceback
        traceback.print_exc()
        sys.exit(1)
