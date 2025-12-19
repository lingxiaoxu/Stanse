#!/usr/bin/env python3
"""
增量式FEC数据上传 - 带自动重试

特点：
1. 检查并跳过已上传的记录
2. 遇到配额错误时自动等待并重试（指数退避）
3. 保存进度，可以中断后继续
4. 详细进度显示
5. 使用默认凭证，无需手动刷新token
6. 可以无人值守运行直到完成
7. 支持限制上传数量（用于测试）

用法：
  python3 02-upload-incremental.py              # 上传全部
  python3 02-upload-incremental.py --limit 100  # 只上传100条（测试）
"""

import sys
import re
import argparse
import time
import json
import os
from pathlib import Path
from datetime import datetime
from collections import defaultdict
import random

try:
    import firebase_admin
    from firebase_admin import credentials, firestore
    from google.api_core.exceptions import ResourceExhausted, DeadlineExceeded, Unauthenticated
    import google.auth
except ImportError:
    print('❌ Firebase库未安装')
    sys.exit(1)

# 配置
DATA_DIR = Path(__file__).parent.parent / 'raw_data'
PROJECT_ID = 'stanseproject'
PROGRESS_FILE = Path(__file__).parent.parent / 'reports' / '01-upload-progress.json'

# 数据年份配置 (默认使用2024年数据，可修改为16/18/20/22/24)
DATA_YEAR = '24'  # 可选: '16', '18', '20', '22', '24'

# 批次配置
BATCH_SIZE = 500  # Firestore最大批次限制
MIN_DELAY = 0.1  # 最小延迟（秒）
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
        'linkages_last_line': 0,
        'linkages_uploaded': 0,
        'linkages_completed': False,
        'transfers_last_line': 0,
        'transfers_uploaded': 0,
        'transfers_completed': False,
        'last_updated': None
    }

def init_firestore():
    """初始化Firestore - 使用gcloud auth"""
    global db
    print('\n🔧 初始化Firestore连接...')

    try:
        if not firebase_admin._apps:
            # 直接使用 Firebase Admin，它会自动查找凭证
            # 按顺序尝试: 环境变量 -> ADC -> gcloud auth
            print('  ℹ️  使用默认凭证链（gcloud/环境变量）...')
            firebase_admin.initialize_app(options={'projectId': PROJECT_ID})

        db = firestore.client()
        print(f'✅ Firestore已连接 (项目: {PROJECT_ID})')
        print('  💡 使用已登录的 gcloud 凭证')
        return db
    except Exception as e:
        print(f'❌ 失败: {e}')
        print('  提示: 请确保已运行 gcloud auth login')
        sys.exit(1)

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
        print(f'  ❌ 刷新失败: {e}')
        return False

def commit_batch_with_token_refresh(batch_docs, collection_ref):
    """
    提交批次文档，自动处理token刷新

    Args:
        batch_docs: List of (doc_ref, doc_data) tuples
        collection_ref: Firestore collection reference

    Returns:
        True if successful, False otherwise
    """
    global db

    # 创建新batch
    batch = db.batch()
    for doc_ref, doc_data in batch_docs:
        batch.set(doc_ref, doc_data)

    # 尝试提交
    try:
        batch.commit()
        return True
    except Unauthenticated as e:
        print(f'  ⚠️  Token过期，正在刷新并重试...')
        if refresh_firestore_client():
            # Token刷新后，用新的db客户端重新创建batch
            new_batch = db.batch()
            for doc_ref, doc_data in batch_docs:
                # 使用新的db客户端重新创建doc_ref
                new_doc_ref = collection_ref.document(doc_ref.id)
                new_batch.set(new_doc_ref, doc_data)

            # 重试提交
            try:
                new_batch.commit()
                print('  ✅ Token刷新后重试成功')
                return True
            except Exception as retry_err:
                print(f'  ❌ Token刷新后重试仍失败: {retry_err}')
                return False
        else:
            return False
    except Exception as e:
        print(f'  ❌ 提交失败: {e}')
        return False

def commit_with_retry(batch, retry_count=0, max_retries=10, batch_docs=None, collection_ref=None):
    """
    提交批次，带指数退避重试和token自动刷新

    Args:
        batch: Firestore batch
        retry_count: 当前重试次数
        max_retries: 最大重试次数
        batch_docs: List of (doc_ref, doc_data) - 用于token刷新时重建batch
        collection_ref: Collection reference - 用于token刷新时重建batch

    Returns:
        True if successful, False if max retries exceeded
    """
    try:
        batch.commit()
        return True
    except Unauthenticated as e:
        if batch_docs and collection_ref:
            print(f'  ⚠️  Token过期，正在刷新并重新提交...')
            return commit_batch_with_token_refresh(batch_docs, collection_ref)
        else:
            print(f'  ❌ Token过期但无法自动刷新（缺少batch_docs或collection_ref）')
            return False
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
        return commit_with_retry(batch, retry_count + 1, max_retries, batch_docs, collection_ref)
    except Exception as e:
        print(f'  ❌ 未知错误: {e}')
        return False

def upload_committees_incremental(year, year_suffix, progress):
    """增量上传委员会数据"""
    collection_name = 'fec_raw_committees'
    file_path = DATA_DIR / 'committees' / f'cm{DATA_YEAR}.txt'

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
    file_path = DATA_DIR / 'candidates' / f'cn{DATA_YEAR}.txt'

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

def upload_contributions_incremental(year, year_suffix, progress, limit=None):
    """增量上传捐款数据

    Args:
        year: 数据年份
        year_suffix: 年份后缀
        progress: 进度字典
        limit: 限制上传数量（None表示不限制，用于测试）
    """
    collection_name = f'fec_raw_contributions_pac_to_candidate_{DATA_YEAR}'
    file_path = DATA_DIR / 'contributions' / f'itpas2{DATA_YEAR}.txt'

    if not file_path.exists():
        print(f'⚠️  文件不存在: contributions/itpas2{DATA_YEAR}.txt')
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

            # ✅ 根据FEC官方header文件 pas2_header_file.csv 的正确映射
            # 0:CMTE_ID 1:AMNDT_IND 2:RPT_TP 3:TRANSACTION_PGI 4:IMAGE_NUM 5:TRANSACTION_TP
            # 6:ENTITY_TP 7:NAME 8:CITY 9:STATE 10:ZIP_CODE 11:EMPLOYER 12:OCCUPATION
            # 13:TRANSACTION_DT 14:TRANSACTION_AMT 15:OTHER_ID 16:CAND_ID 17:TRAN_ID
            doc_data = {
                'committee_id': fields[0],  # 0:CMTE_ID
                'amendment_indicator': fields[1] if len(fields) > 1 else '',  # 1:AMNDT_IND
                'report_type': fields[2] if len(fields) > 2 else '',  # 2:RPT_TP
                'election_type': fields[3] if len(fields) > 3 else '',  # 3:TRANSACTION_PGI
                'fec_record_number': fields[4] if len(fields) > 4 else '',  # 4:IMAGE_NUM
                'image_number': fields[4] if len(fields) > 4 else '',  # 4:IMAGE_NUM
                'transaction_type': fields[5] if len(fields) > 5 else '',  # 5:TRANSACTION_TP
                'entity_type': fields[6] if len(fields) > 6 else '',  # 6:ENTITY_TP
                'name': fields[7] if len(fields) > 7 else '',  # 7:NAME
                'city': fields[8] if len(fields) > 8 else '',  # 8:CITY
                'state': fields[9] if len(fields) > 9 else '',  # 9:STATE
                'zip': fields[10] if len(fields) > 10 else '',  # 10:ZIP_CODE
                'employer': fields[11] if len(fields) > 11 else '',  # 11:EMPLOYER
                'occupation': fields[12] if len(fields) > 12 else '',  # 12:OCCUPATION
                'transaction_date': fields[13] if len(fields) > 13 else '',  # 13:TRANSACTION_DT
                'transaction_amount': amount_cents,  # 14:TRANSACTION_AMT (从fields[14]解析)
                'other_id': fields[15] if len(fields) > 15 else '',  # 15:OTHER_ID
                'candidate_id': fields[16],  # 16:CAND_ID
                'transaction_pgi': fields[3] if len(fields) > 3 else '',  # 3:TRANSACTION_PGI
                'data_year': year,
                'election_cycle': f'{year-1}-{year}',
                'source_file': f'pas2{year_suffix}.zip',
                'uploaded_at': datetime.utcnow(),
                'last_updated': datetime.utcnow()
            }

            batch.set(doc_ref, doc_data)
            batch_count += 1

            # 检查是否达到测试限制
            if limit and uploaded + batch_count >= limit:
                if commit_with_retry(batch):
                    uploaded += batch_count
                    print(f'  ✓ 第 {current_line} 行 | 已上传 {uploaded} 条捐款记录')
                    print(f'\n⚠️  已达到测试限制 ({limit} 条)')

                    progress['contributions_last_line'] = current_line
                    progress['contributions_uploaded'] = uploaded
                    progress['last_updated'] = datetime.utcnow().isoformat()
                    save_progress(progress)
                    return uploaded
                else:
                    progress['contributions_last_line'] = current_line
                    progress['contributions_uploaded'] = uploaded
                    save_progress(progress)
                    return uploaded

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

def upload_linkages_incremental(year, year_suffix, progress):
    """增量上传linkages数据"""
    collection_name = 'fec_raw_linkages'
    file_path = DATA_DIR / 'linkages' / f'ccl{year_suffix}.txt'

    if not file_path.exists():
        print(f'❌ 文件不存在: {file_path}')
        return 0

    print(f'\n📤 上传 Linkages...')
    print(f'  文件: {file_path}')

    collection_ref = db.collection(collection_name)
    uploaded = 0
    skipped = 0
    batch = db.batch()
    batch_docs = []  # Store (doc_ref, doc_data) for token refresh
    batch_count = 0
    current_line = progress.get('linkages_last_line', 0)
    start_line = current_line

    with open(file_path, 'r', encoding='latin-1') as f:
        # 跳过已处理的行
        for _ in range(start_line):
            next(f, None)

        for line in f:
            current_line += 1
            fields = line.strip().split('|')

            if len(fields) < 7:
                continue

            candidate_id = fields[0]
            committee_id = fields[3]

            if not candidate_id or not committee_id:
                continue

            doc_id = f'{candidate_id}_{committee_id}_{year}'
            doc_ref = db.collection(collection_name).document(doc_id)

            # 检查是否已存在
            if doc_ref.get().exists:
                skipped += 1
                continue

            doc_data = {
                'candidate_id': candidate_id,
                'candidate_election_year': int(fields[1]) if fields[1] else year,
                'fec_election_year': int(fields[2]) if fields[2] else year,
                'committee_id': committee_id,
                'committee_type': fields[4] if len(fields) > 4 else '',
                'committee_designation': fields[5] if len(fields) > 5 else '',
                'linkage_id': fields[6] if len(fields) > 6 else '',
                'data_year': year,
                'source_file': f'ccl{year_suffix}.txt',
                'uploaded_at': datetime.utcnow(),
                'last_updated': datetime.utcnow()
            }

            batch.set(doc_ref, doc_data)
            batch_docs.append((doc_ref, doc_data))
            batch_count += 1

            if batch_count >= BATCH_SIZE:
                if commit_with_retry(batch, batch_docs=batch_docs, collection_ref=collection_ref):
                    uploaded += batch_count
                    print(f'  ✓ 第 {current_line} 行 | 已上传 {uploaded} 条 | 跳过 {skipped} 条')

                    progress['linkages_last_line'] = current_line
                    progress['linkages_uploaded'] = uploaded
                    progress['last_updated'] = datetime.utcnow().isoformat()
                    save_progress(progress)

                    time.sleep(MIN_DELAY + random.uniform(0, 2))
                    batch = db.batch()
                    batch_docs = []
                    batch_count = 0
                else:
                    progress['linkages_last_line'] = current_line
                    progress['linkages_uploaded'] = uploaded
                    save_progress(progress)
                    return uploaded

    if batch_count > 0:
        if commit_with_retry(batch, batch_docs=batch_docs, collection_ref=collection_ref):
            uploaded += batch_count

    progress['linkages_last_line'] = current_line
    progress['linkages_uploaded'] = uploaded
    progress['linkages_completed'] = True
    progress['last_updated'] = datetime.utcnow().isoformat()
    save_progress(progress)

    print(f'✅ Linkages上传完成: {uploaded} 条 (跳过 {skipped} 条)')
    return uploaded

def upload_transfers_incremental(year, year_suffix, progress):
    """增量上传transfers数据"""
    collection_name = 'fec_raw_transfers'
    file_path = DATA_DIR / 'transfers' / f'itoth{year_suffix}.txt'

    if not file_path.exists():
        print(f'❌ 文件不存在: {file_path}')
        return 0

    print(f'\n📤 上传 Transfers...')
    print(f'  文件: {file_path}')
    print(f'  ⚠️  注意: 这个文件有 1800+ 万行，需要很长时间!')

    collection_ref = db.collection(collection_name)
    uploaded = 0
    skipped = 0
    batch = db.batch()
    batch_docs = []  # Store (doc_ref, doc_data) for token refresh
    batch_count = 0
    current_line = progress.get('transfers_last_line', 0)
    start_line = current_line
    start_time = time.time()

    if start_line > 0:
        print(f'  📍 从第 {start_line:,} 行继续，跳过已处理的行...')

    with open(file_path, 'r', encoding='latin-1') as f:
        # 跳过已处理的行
        for _ in range(start_line):
            next(f, None)

        if start_line > 0:
            print(f'  ✓ 已跳过 {start_line:,} 行，继续上传...')

        for line in f:
            current_line += 1
            fields = line.strip().split('|')

            if len(fields) < 20:
                continue

            committee_id = fields[0]
            transaction_id = fields[16] if len(fields) > 16 else ''
            other_id = fields[15] if len(fields) > 15 else ''

            if not committee_id or not transaction_id:
                continue

            try:
                amount_str = fields[14] if len(fields) > 14 else '0'
                amount = float(amount_str) if amount_str else 0
                amount_cents = int(amount * 100)
            except (ValueError, TypeError):
                amount_cents = 0

            if other_id:
                doc_id = f'{committee_id}_{other_id}_{transaction_id}'
            else:
                doc_id = f'{committee_id}_{transaction_id}_{current_line}'

            doc_ref = db.collection(collection_name).document(doc_id)

            doc_data = {
                'committee_id': committee_id,
                'sender_committee_id': committee_id,
                'receiver_committee_id': other_id if other_id else '',
                'amendment_indicator': fields[1] if len(fields) > 1 else '',
                'report_type': fields[2] if len(fields) > 2 else '',
                'transaction_pgi': fields[3] if len(fields) > 3 else '',
                'image_number': fields[4] if len(fields) > 4 else '',
                'transaction_type': fields[5] if len(fields) > 5 else '',
                'entity_type': fields[6] if len(fields) > 6 else '',
                'name': fields[7] if len(fields) > 7 else '',
                'city': fields[8] if len(fields) > 8 else '',
                'state': fields[9] if len(fields) > 9 else '',
                'zip': fields[10] if len(fields) > 10 else '',
                'employer': fields[11] if len(fields) > 11 else '',
                'occupation': fields[12] if len(fields) > 12 else '',
                'transaction_date': fields[13] if len(fields) > 13 else '',
                'transaction_amount': amount_cents,
                'other_id': other_id,
                'transaction_id': transaction_id,
                'file_number': fields[17] if len(fields) > 17 else '',
                'memo_code': fields[18] if len(fields) > 18 else '',
                'memo_text': fields[19] if len(fields) > 19 else '',
                'sub_id': fields[20] if len(fields) > 20 else '',
                'data_year': year,
                'source_file': f'itoth{year_suffix}.txt',
                'uploaded_at': datetime.utcnow(),
                'last_updated': datetime.utcnow()
            }

            batch.set(doc_ref, doc_data)
            batch_docs.append((doc_ref, doc_data))
            batch_count += 1

            if batch_count >= BATCH_SIZE:
                if commit_with_retry(batch, batch_docs=batch_docs, collection_ref=collection_ref):
                    uploaded += batch_count

                    if (uploaded // BATCH_SIZE) % 10 == 0:
                        elapsed = time.time() - start_time
                        rate = uploaded / elapsed if elapsed > 0 else 0
                        remaining_lines = 18667266 - current_line
                        eta = remaining_lines / rate if rate > 0 else 0

                        print(f'  ✓ 第 {current_line:,} 行 | 已上传 {uploaded:,} 条 | 跳过 {skipped} 条 | '
                              f'{rate:.0f} 行/秒 | ETA: {eta/3600:.1f} 小时')

                    progress['transfers_last_line'] = current_line
                    progress['transfers_uploaded'] = uploaded
                    progress['last_updated'] = datetime.utcnow().isoformat()
                    save_progress(progress)

                    time.sleep(MIN_DELAY + random.uniform(0, 2))
                    batch = db.batch()
                    batch_docs = []
                    batch_count = 0
                else:
                    progress['transfers_last_line'] = current_line
                    progress['transfers_uploaded'] = uploaded
                    save_progress(progress)
                    return uploaded

    if batch_count > 0:
        if commit_with_retry(batch, batch_docs=batch_docs, collection_ref=collection_ref):
            uploaded += batch_count

    elapsed_total = time.time() - start_time
    progress['transfers_last_line'] = current_line
    progress['transfers_uploaded'] = uploaded
    progress['transfers_completed'] = True
    progress['last_updated'] = datetime.utcnow().isoformat()
    save_progress(progress)

    print(f'✅ Transfers上传完成: {uploaded:,} 条 (跳过 {skipped} 条)')
    print(f'   总耗时: {elapsed_total/3600:.2f} 小时')
    return uploaded

def main():
    """主函数"""
    # 解析命令行参数
    parser = argparse.ArgumentParser(description='增量上传FEC数据到Firestore')
    parser.add_argument('--limit', type=int, help='限制上传数量（用于测试，仅对contributions生效）')
    parser.add_argument('--only', type=str, help='只上传指定的表（用逗号分隔）: committees,candidates,contributions,linkages,transfers')
    args = parser.parse_args()

    # 解析 --only 参数
    only_tables = None
    if args.only:
        only_tables = set(args.only.split(','))

    print('\n' + '='*70)
    print('🚀 FEC数据增量上传（带自动重试）')
    print('='*70)

    if args.limit:
        print(f'\n⚠️  测试模式：仅上传 {args.limit} 条contribution记录')

    if only_tables:
        print(f'\n📋 只上传指定的表: {", ".join(only_tables)}')

    # 加载进度
    progress = load_progress()
    if progress.get('last_updated'):
        print(f'\n📍 发现之前的进度（最后更新: {progress["last_updated"]}）')
        print(f'   Committees: {progress.get("committees_uploaded", 0)} 条已上传')
        print(f'   Candidates: {progress.get("candidates_uploaded", 0)} 条已上传')
        print(f'   Contributions: {progress.get("contributions_uploaded", 0)} 条已上传')
        print(f'   Linkages: {progress.get("linkages_uploaded", 0)} 条已上传')
        print(f'   Transfers: {progress.get("transfers_uploaded", 0)} 条已上传')

    init_firestore()

    if not DATA_DIR.exists():
        print(f'\n❌ 数据目录不存在: {DATA_DIR}')
        sys.exit(1)

    year, year_suffix = 2024, '24'

    print(f'\n处理 {year} 年数据')
    print('='*70)

    # 上传委员会数据
    if not only_tables or 'committees' in only_tables:
        if not progress.get('committees_completed'):
            committees_count = upload_committees_incremental(year, year_suffix, progress)
            print(f'\n✓ 委员会数据: 已上传 {committees_count} 条')
        else:
            print(f'\n✓ 委员会数据已完成（{progress.get("committees_uploaded", 0)} 条）')
    else:
        print(f'\n⏭️  跳过委员会数据（使用 --only 参数）')

    # 上传候选人数据
    if not only_tables or 'candidates' in only_tables:
        if not progress.get('candidates_completed'):
            candidates_count = upload_candidates_incremental(year, year_suffix, progress)
            print(f'\n✓ 候选人数据: 已上传 {candidates_count} 条')
        else:
            print(f'\n✓ 候选人数据已完成（{progress.get("candidates_uploaded", 0)} 条）')
    else:
        print(f'\n⏭️  跳过候选人数据（使用 --only 参数）')

    # 上传捐款数据
    if not only_tables or 'contributions' in only_tables:
        if not progress.get('contributions_completed'):
            contributions_count = upload_contributions_incremental(year, year_suffix, progress, limit=args.limit)
            print(f'\n✓ 捐款数据: 已上传 {contributions_count} 条')
            if args.limit and contributions_count >= args.limit:
                print(f'   ⚠️  已达到测试限制，未标记为完成')
        else:
            print(f'\n✓ 捐款数据已完成（{progress.get("contributions_uploaded", 0)} 条）')
    else:
        print(f'\n⏭️  跳过捐款数据（使用 --only 参数）')

    # 上传linkages数据
    if not only_tables or 'linkages' in only_tables:
        if not progress.get('linkages_completed'):
            linkages_count = upload_linkages_incremental(year, year_suffix, progress)
            print(f'\n✓ Linkages数据: 已上传 {linkages_count} 条')
        else:
            print(f'\n✓ Linkages数据已完成（{progress.get("linkages_uploaded", 0)} 条）')
    else:
        print(f'\n⏭️  跳过Linkages数据（使用 --only 参数）')

    # 上传transfers数据
    if not only_tables or 'transfers' in only_tables:
        if not progress.get('transfers_completed'):
            transfers_count = upload_transfers_incremental(year, year_suffix, progress)
            print(f'\n✓ Transfers数据: 已上传 {transfers_count} 条')
        else:
            print(f'\n✓ Transfers数据已完成（{progress.get("transfers_uploaded", 0)} 条）')
    else:
        print(f'\n⏭️  跳过Transfers数据（使用 --only 参数）')

    print('\n' + '='*70)
    print('✅ 上传完成！')
    print('='*70)
    print('\n📊 最终统计:')
    print(f'  Committees: {progress.get("committees_uploaded", 0)} 条')
    print(f'  Candidates: {progress.get("candidates_uploaded", 0)} 条')
    print(f'  Contributions: {progress.get("contributions_uploaded", 0)} 条')
    print(f'  Linkages: {progress.get("linkages_uploaded", 0)} 条')
    print(f'  Transfers: {progress.get("transfers_uploaded", 0)} 条')
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
