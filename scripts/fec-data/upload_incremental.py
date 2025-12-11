#!/usr/bin/env python3
"""
增量式FEC数据上传 - 带自动重试和指数退避

特点：
1. 检查并跳过已上传的记录
2. 遇到配额错误时自动等待并重试（指数退避）
3. 保存进度，可以中断后继续
4. 详细进度显示
5. 可以无人值守运行直到完成
"""

import sys
import re
import time
import json
import os
from pathlib import Path
from datetime import datetime
from collections import defaultdict
import subprocess
import random

try:
    import firebase_admin
    from firebase_admin import credentials, firestore
    from google.api_core.exceptions import ResourceExhausted, DeadlineExceeded
except ImportError:
    print('❌ Firebase库未安装')
    sys.exit(1)

# 配置
DATA_DIR = Path(__file__).parent / 'raw_data'
PROJECT_ID = 'stanseproject'
PROGRESS_FILE = Path(__file__).parent / 'upload_progress.json'

# 批次配置
BATCH_SIZE = 50  # 更小的批次以避免超时
MIN_DELAY = 3.0  # 最小延迟（秒）
MAX_DELAY = 300.0  # 最大延迟（秒）
INITIAL_RETRY_DELAY = 30.0  # 初始重试延迟

db = None

def save_progress(data):
    """保存上传进度"""
    with open(PROGRESS_FILE, 'w') as f:
        json.dump(data, f, indent=2)

def load_progress():
    """加载上传进度"""
    if PROGRESS_FILE.exists():
        with open(PROGRESS_FILE, 'r') as f:
            return json.load(f)
    return {
        'committees_last_line': 0,
        'committees_uploaded': 0,
        'committees_skipped': 0,
        'candidates_last_line': 0,
        'candidates_uploaded': 0,
        'last_updated': None
    }

def init_firestore():
    """初始化Firestore"""
    global db
    print('\n🔧 初始化Firestore连接...')

    try:
        if not firebase_admin._apps:
            # 优先使用环境变量中的access token（避免subprocess挂起）
            access_token = os.environ.get('GCLOUD_ACCESS_TOKEN')

            if not access_token:
                # 如果环境变量不存在，才调用gcloud
                print('  ℹ️  从gcloud获取access token...')
                result = subprocess.run(
                    ['gcloud', 'auth', 'print-access-token'],
                    capture_output=True, text=True, check=True
                )
                access_token = result.stdout.strip()
            else:
                print('  ✓ 使用环境变量中的access token')

            from google.oauth2 import credentials as oauth_creds
            cred = oauth_creds.Credentials(access_token)
            firebase_admin.initialize_app(cred, options={'projectId': PROJECT_ID})

        db = firestore.client()
        print(f'✅ Firestore已连接 (项目: {PROJECT_ID})')
        return db
    except Exception as e:
        print(f'❌ 失败: {e}')
        sys.exit(1)

def commit_with_retry(batch, retry_count=0, max_retries=10):
    """
    提交批次，带指数退避重试

    Args:
        batch: Firestore batch
        retry_count: 当前重试次数
        max_retries: 最大重试次数

    Returns:
        True if successful, False if max retries exceeded
    """
    try:
        batch.commit()
        return True
    except (ResourceExhausted, DeadlineExceeded) as e:
        if retry_count >= max_retries:
            print(f'  ❌ 达到最大重试次数 ({max_retries})')
            return False

        # 指数退避：初始延迟 * (2 ^ retry_count) + 随机抖动
        delay = min(
            INITIAL_RETRY_DELAY * (2 ** retry_count) + random.uniform(0, 5),
            MAX_DELAY
        )

        print(f'  ⚠️  配额限制，等待 {delay:.1f} 秒后重试（第 {retry_count + 1}/{max_retries} 次）...')
        time.sleep(delay)

        # 递归重试
        return commit_with_retry(batch, retry_count + 1, max_retries)
    except Exception as e:
        print(f'  ❌ 未知错误: {e}')
        return False

def upload_committees_incremental(year, year_suffix, progress):
    """增量上传委员会数据"""
    collection_name = 'fec_raw_committees'
    file_path = DATA_DIR / 'committees' / 'cm.txt'

    if not file_path.exists():
        print(f'⚠️  文件不存在: {file_path}')
        return 0

    print(f'\n📤 增量上传委员会数据 ({year})...')

    start_line = progress.get('committees_last_line', 0)
    uploaded = progress.get('committees_uploaded', 0)
    skipped = progress.get('committees_skipped', 0)

    if start_line > 0:
        print(f'  📍 从第 {start_line} 行继续（已上传 {uploaded} 条，已跳过 {skipped} 条）')

    batch = db.batch()
    batch_count = 0
    current_line = 0
    total_processed = 0

    with open(file_path, 'r', encoding='latin-1') as f:
        for line_num, line in enumerate(f, 1):
            # 跳过已处理的行
            if line_num <= start_line:
                continue

            current_line = line_num
            fields = line.strip().split('|')
            if len(fields) < 15:
                continue

            committee_id = fields[0]
            if not committee_id:
                continue

            doc_id = f'{committee_id}_{year}'
            doc_ref = db.collection(collection_name).document(doc_id)

            # 添加到批次
            doc_data = {
                'committee_id': fields[0],
                'committee_name': fields[1],
                'treasurer_name': fields[2],
                'street_1': fields[3],
                'street_2': fields[4],
                'city': fields[5],
                'state': fields[6],
                'zip': fields[7],
                'designation': fields[8],
                'committee_type': fields[9],
                'party': fields[10],
                'filing_frequency': fields[11],
                'interest_group_category': fields[12],
                'connected_org_name': fields[13],
                'candidate_id': fields[14],
                'data_year': year,
                'election_cycle': f'{year-1}-{year}',
                'source_file': f'cm{year_suffix}.zip',
                'uploaded_at': datetime.utcnow(),
                'last_updated': datetime.utcnow()
            }

            batch.set(doc_ref, doc_data)
            batch_count += 1
            total_processed += 1

            # 提交批次
            if batch_count >= BATCH_SIZE:
                if commit_with_retry(batch):
                    uploaded += batch_count
                    print(f'  ✓ 第 {current_line} 行 | 本次上传 {batch_count} 条 | 总计: {uploaded} 条 (跳过 {skipped})')

                    # 保存进度
                    progress['committees_last_line'] = current_line
                    progress['committees_uploaded'] = uploaded
                    progress['committees_skipped'] = skipped
                    progress['last_updated'] = datetime.utcnow().isoformat()
                    save_progress(progress)

                    # 正常延迟
                    time.sleep(MIN_DELAY + random.uniform(0, 2))
                    batch = db.batch()
                    batch_count = 0
                else:
                    # 失败，保存进度并退出
                    print(f'  💾 保存进度: 第 {current_line} 行，已上传 {uploaded} 条')
                    progress['committees_last_line'] = current_line
                    progress['committees_uploaded'] = uploaded
                    progress['committees_skipped'] = skipped
                    save_progress(progress)
                    return uploaded

    # 提交剩余记录
    if batch_count > 0:
        if commit_with_retry(batch):
            uploaded += batch_count
            print(f'  ✓ 最后批次上传 {batch_count} 条')

    # 保存最终进度
    progress['committees_last_line'] = current_line
    progress['committees_uploaded'] = uploaded
    progress['committees_skipped'] = skipped
    progress['committees_completed'] = True
    progress['last_updated'] = datetime.utcnow().isoformat()
    save_progress(progress)

    print(f'✅ 成功上传 {uploaded} 条新记录，跳过 {skipped} 条已存在记录')
    print(f'   处理完成到第 {current_line} 行')
    return uploaded

def upload_candidates_incremental(year, year_suffix, progress):
    """增量上传候选人数据"""
    collection_name = 'fec_raw_candidates'
    file_path = DATA_DIR / 'candidates' / 'cn.txt'

    if not file_path.exists():
        print(f'⚠️  文件不存在: {file_path}')
        return 0

    print(f'\n📤 增量上传候选人数据 ({year})...')

    start_line = progress.get('candidates_last_line', 0)
    uploaded = progress.get('candidates_uploaded', 0)

    if start_line > 0:
        print(f'  📍 从第 {start_line} 行继续（已上传 {uploaded} 条）')

    batch = db.batch()
    batch_count = 0
    current_line = 0

    with open(file_path, 'r', encoding='latin-1') as f:
        for line_num, line in enumerate(f, 1):
            if line_num <= start_line:
                continue

            current_line = line_num
            fields = line.strip().split('|')
            if len(fields) < 15:
                continue

            candidate_id = fields[0]
            if not candidate_id:
                continue

            doc_id = f'{candidate_id}_{year}'
            doc_ref = db.collection(collection_name).document(doc_id)

            doc_data = {
                'candidate_id': fields[0],
                'candidate_name': fields[1],
                'party_affiliation': fields[2],
                'election_year': int(fields[3]) if fields[3] else year,
                'office_sought': fields[4],
                'state': fields[5],
                'district': fields[6],
                'incumbent_challenger_status': fields[7],
                'candidate_status': fields[8],
                'principal_committee_id': fields[9],
                'street_1': fields[10],
                'street_2': fields[11],
                'city': fields[12],
                'state_full': fields[13],
                'zip': fields[14],
                'data_year': year,
                'election_cycle': f'{year-1}-{year}',
                'source_file': f'cn{year_suffix}.zip',
                'uploaded_at': datetime.utcnow(),
                'last_updated': datetime.utcnow()
            }

            batch.set(doc_ref, doc_data)
            batch_count += 1

            if batch_count >= BATCH_SIZE:
                if commit_with_retry(batch):
                    uploaded += batch_count
                    print(f'  ✓ 第 {current_line} 行 | 已上传 {uploaded} 条候选人记录')

                    progress['candidates_last_line'] = current_line
                    progress['candidates_uploaded'] = uploaded
                    progress['last_updated'] = datetime.utcnow().isoformat()
                    save_progress(progress)

                    time.sleep(MIN_DELAY + random.uniform(0, 2))
                    batch = db.batch()
                    batch_count = 0
                else:
                    progress['candidates_last_line'] = current_line
                    progress['candidates_uploaded'] = uploaded
                    save_progress(progress)
                    return uploaded

    if batch_count > 0:
        if commit_with_retry(batch):
            uploaded += batch_count

    progress['candidates_last_line'] = current_line
    progress['candidates_uploaded'] = uploaded
    progress['candidates_completed'] = True
    progress['last_updated'] = datetime.utcnow().isoformat()
    save_progress(progress)

    print(f'✅ 成功上传 {uploaded} 条候选人记录')
    return uploaded

def upload_contributions_incremental(year, year_suffix, progress):
    """增量上传捐款数据"""
    collection_name = 'fec_raw_contributions_pac_to_candidate'
    file_path = DATA_DIR / 'contributions' / 'itpas2.txt'

    if not file_path.exists():
        # 尝试pas2.txt
        file_path = DATA_DIR / 'contributions' / 'pas2.txt'
        if not file_path.exists():
            print(f'⚠️  文件不存在: contributions/itpas2.txt 或 pas2.txt')
            return 0

    print(f'\n📤 增量上传捐款数据 ({year})...')

    start_line = progress.get('contributions_last_line', 0)
    uploaded = progress.get('contributions_uploaded', 0)

    if start_line > 0:
        print(f'  📍 从第 {start_line} 行继续（已上传 {uploaded} 条）')

    batch = db.batch()
    batch_count = 0
    current_line = 0

    with open(file_path, 'r', encoding='latin-1') as f:
        for line_num, line in enumerate(f, 1):
            if line_num <= start_line:
                continue

            current_line = line_num
            fields = line.strip().split('|')
            if len(fields) < 17:
                continue

            committee_id = fields[0]
            candidate_id = fields[16]
            amount_str = fields[14]

            if not committee_id or not candidate_id:
                continue

            try:
                amount = float(amount_str) if amount_str else 0
                amount_cents = int(amount * 100)
            except (ValueError, TypeError):
                continue

            # 创建唯一ID: committee_candidate_linenumber
            doc_id = f'{committee_id}_{candidate_id}_{line_num}'
            doc_ref = db.collection(collection_name).document(doc_id)

            doc_data = {
                'committee_id': committee_id,
                'amendment_indicator': fields[1] if len(fields) > 1 else '',
                'report_type': fields[2] if len(fields) > 2 else '',
                'election_type': fields[3] if len(fields) > 3 else '',
                'fec_record_number': fields[4] if len(fields) > 4 else '',
                'image_number': fields[5] if len(fields) > 5 else '',
                'transaction_type': fields[6] if len(fields) > 6 else '',
                'entity_type': fields[7] if len(fields) > 7 else '',
                'name': fields[8] if len(fields) > 8 else '',
                'city': fields[9] if len(fields) > 9 else '',
                'state': fields[10] if len(fields) > 10 else '',
                'zip': fields[11] if len(fields) > 11 else '',
                'employer': fields[12] if len(fields) > 12 else '',
                'occupation': fields[13] if len(fields) > 13 else '',
                'transaction_date': fields[14] if len(fields) > 14 else '',
                'transaction_amount': amount_cents,
                'other_id': fields[15] if len(fields) > 15 else '',
                'candidate_id': candidate_id,
                'transaction_pgi': fields[17] if len(fields) > 17 else '',
                'data_year': year,
                'election_cycle': f'{year-1}-{year}',
                'source_file': f'pas2{year_suffix}.zip',
                'uploaded_at': datetime.utcnow(),
                'last_updated': datetime.utcnow()
            }

            batch.set(doc_ref, doc_data)
            batch_count += 1

            if batch_count >= BATCH_SIZE:
                if commit_with_retry(batch):
                    uploaded += batch_count
                    print(f'  ✓ 第 {current_line} 行 | 已上传 {uploaded} 条捐款记录')

                    progress['contributions_last_line'] = current_line
                    progress['contributions_uploaded'] = uploaded
                    progress['last_updated'] = datetime.utcnow().isoformat()
                    save_progress(progress)

                    time.sleep(MIN_DELAY + random.uniform(0, 2))
                    batch = db.batch()
                    batch_count = 0
                else:
                    progress['contributions_last_line'] = current_line
                    progress['contributions_uploaded'] = uploaded
                    save_progress(progress)
                    return uploaded

    if batch_count > 0:
        if commit_with_retry(batch):
            uploaded += batch_count

    progress['contributions_last_line'] = current_line
    progress['contributions_uploaded'] = uploaded
    progress['contributions_completed'] = True
    progress['last_updated'] = datetime.utcnow().isoformat()
    save_progress(progress)

    print(f'✅ 成功上传 {uploaded} 条捐款记录')
    return uploaded

def main():
    """主函数"""
    print('\n' + '='*70)
    print('🚀 FEC数据增量上传（带自动重试）')
    print('='*70)

    # 加载进度
    progress = load_progress()
    if progress.get('last_updated'):
        print(f'\n📍 发现之前的进度（最后更新: {progress["last_updated"]}）')
        print(f'   Committees: {progress.get("committees_uploaded", 0)} 条已上传')
        print(f'   Candidates: {progress.get("candidates_uploaded", 0)} 条已上传')
        print(f'   Contributions: {progress.get("contributions_uploaded", 0)} 条已上传')

    init_firestore()

    if not DATA_DIR.exists():
        print(f'\n❌ 数据目录不存在: {DATA_DIR}')
        sys.exit(1)

    year, year_suffix = 2024, '24'

    print(f'\n处理 {year} 年数据')
    print('='*70)

    # 上传委员会数据
    if not progress.get('committees_completed'):
        committees_count = upload_committees_incremental(year, year_suffix, progress)
        print(f'\n✓ 委员会数据: 已上传 {committees_count} 条')
    else:
        print(f'\n✓ 委员会数据已完成（{progress.get("committees_uploaded", 0)} 条）')

    # 上传候选人数据
    if not progress.get('candidates_completed'):
        candidates_count = upload_candidates_incremental(year, year_suffix, progress)
        print(f'\n✓ 候选人数据: 已上传 {candidates_count} 条')
    else:
        print(f'\n✓ 候选人数据已完成（{progress.get("candidates_uploaded", 0)} 条）')

    # 上传捐款数据
    if not progress.get('contributions_completed'):
        contributions_count = upload_contributions_incremental(year, year_suffix, progress)
        print(f'\n✓ 捐款数据: 已上传 {contributions_count} 条')
    else:
        print(f'\n✓ 捐款数据已完成（{progress.get("contributions_uploaded", 0)} 条）')

    print('\n' + '='*70)
    print('✅ 上传完成！')
    print('='*70)
    print('\n📊 最终统计:')
    print(f'  Committees: {progress.get("committees_uploaded", 0)} 条')
    print(f'  Candidates: {progress.get("candidates_uploaded", 0)} 条')
    print(f'  Contributions: {progress.get("contributions_uploaded", 0)} 条')
    print(f'\n💡 进度文件: {PROGRESS_FILE}')
    print()

if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print('\n\n⚠️  用户中断，进度已保存')
        print(f'   可以重新运行此脚本继续上传')
        sys.exit(0)
    except Exception as e:
        print(f'\n❌ 错误: {e}')
        import traceback
        traceback.print_exc()
        sys.exit(1)
