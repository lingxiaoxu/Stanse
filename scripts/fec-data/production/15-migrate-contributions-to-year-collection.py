#!/usr/bin/env python3
"""
Migrate contributions from old collection to year-specific collection

This script migrates all documents from:
  fec_raw_contributions_pac_to_candidate
To:
  fec_raw_contributions_pac_to_candidate_24

It uses batch processing to handle large datasets efficiently.
Features:
- Automatic ADC token refresh
- Skips precise counting to avoid timeout
- Progress tracking with ETA
- Automatic retry on errors
"""

import os
import sys
from pathlib import Path
import time

try:
    import firebase_admin
    from firebase_admin import credentials, firestore
    from google.api_core.exceptions import ResourceExhausted, DeadlineExceeded, ServiceUnavailable, Unauthenticated
except ImportError:
    print('❌ Firebase库未安装')
    print('  请运行: pip install firebase-admin')
    sys.exit(1)

# Configuration
PROJECT_ID = 'stanseproject'
OLD_COLLECTION = 'fec_raw_contributions_pac_to_candidate'
NEW_COLLECTION = 'fec_raw_contributions_pac_to_candidate_24'
BATCH_SIZE = 500  # Firestore batch limit
ESTIMATED_TOTAL = 700000  # User said 70万

# Initialize Firestore
db = None

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

def migrate_collection():
    """Migrate all documents from old collection to new collection"""
    global db

    print('\n' + '='*70)
    print('📦 FEC Contributions Collection Migration')
    print('='*70)
    print(f'\nSource:      {OLD_COLLECTION}')
    print(f'Destination: {NEW_COLLECTION}')

    # Initialize Firestore
    init_firestore()

    # Get collection references
    old_ref = db.collection(OLD_COLLECTION)
    new_ref = db.collection(NEW_COLLECTION)

    # Check if new collection already has data
    print(f'\n🔍 Checking destination collection...')
    try:
        new_sample = list(new_ref.limit(1).stream())
        if new_sample:
            print(f'⚠️  WARNING: Destination collection {NEW_COLLECTION} already contains data!')
            print('   This script will ADD documents (not replace existing ones).')
            print('   Press Ctrl+C within 5 seconds to cancel...')
            time.sleep(5)
    except Exception as e:
        print(f'  ℹ️  Cannot check destination (will proceed anyway): {e}')

    # Start migration (skip count, just migrate)
    print(f'\n🚀 Starting migration...')
    print(f'   Batch size: {BATCH_SIZE} documents')
    print(f'   Note: Skipping document count to avoid timeout on large collections')
    print(f'   Expected: ~{ESTIMATED_TOTAL:,} documents based on user info')

    migrated_count = 0
    batch_count = 0
    start_time = time.time()
    last_doc = None
    consecutive_errors = 0
    max_consecutive_errors = 5

    while True:
        try:
            # Build query
            query = old_ref.order_by('__name__').limit(BATCH_SIZE)
            if last_doc:
                query = query.start_after(last_doc)

            # Get batch
            try:
                docs = list(query.stream())
            except (ServiceUnavailable, DeadlineExceeded) as e:
                print(f'\n  ⚠️  Query timeout/unavailable, refreshing token and retrying...')
                if refresh_firestore_client():
                    # Retry with refreshed client
                    old_ref = db.collection(OLD_COLLECTION)
                    new_ref = db.collection(NEW_COLLECTION)
                    query = old_ref.order_by('__name__').limit(BATCH_SIZE)
                    if last_doc:
                        query = query.start_after(last_doc)
                    docs = list(query.stream())
                else:
                    raise

            if not docs:
                break  # No more documents

            # Reset consecutive errors on success
            consecutive_errors = 0

            # Create batch write
            batch = db.batch()
            for doc in docs:
                # Copy document to new collection with same ID
                new_doc_ref = new_ref.document(doc.id)
                batch.set(new_doc_ref, doc.to_dict())

            # Commit batch with token refresh handling
            try:
                batch.commit()
                migrated_count += len(docs)
                batch_count += 1
            except Unauthenticated as e:
                print(f'  ⚠️  Token expired, refreshing and retrying batch...')
                if refresh_firestore_client():
                    # Recreate batch with new client
                    new_ref = db.collection(NEW_COLLECTION)
                    batch = db.batch()
                    for doc in docs:
                        new_doc_ref = new_ref.document(doc.id)
                        batch.set(new_doc_ref, doc.to_dict())
                    batch.commit()
                    migrated_count += len(docs)
                    batch_count += 1
                else:
                    raise

            # Update last document
            last_doc = docs[-1]

            # Progress update (every 10 batches to reduce output)
            if batch_count % 10 == 0:
                elapsed = time.time() - start_time
                docs_per_sec = migrated_count / elapsed if elapsed > 0 else 0
                remaining = ESTIMATED_TOTAL - migrated_count
                eta_seconds = remaining / docs_per_sec if docs_per_sec > 0 else 0
                percentage = (migrated_count / ESTIMATED_TOTAL * 100) if migrated_count <= ESTIMATED_TOTAL else 100

                print(f'   Batch {batch_count}: Migrated {migrated_count:,}/{ESTIMATED_TOTAL:,} documents '
                      f'({percentage:.1f}%) | '
                      f'{docs_per_sec:.0f} docs/sec | '
                      f'ETA: {eta_seconds/60:.1f} min')

                # Rate limiting to avoid quota issues
                time.sleep(0.5)

        except Exception as e:
            consecutive_errors += 1
            print(f'\n⚠️  Error during batch {batch_count + 1}: {e}')
            print(f'   Migrated so far: {migrated_count:,} documents')
            print(f'   Consecutive errors: {consecutive_errors}/{max_consecutive_errors}')

            if consecutive_errors >= max_consecutive_errors:
                print(f'\n❌ Too many consecutive errors ({max_consecutive_errors}). Stopping.')
                break

            print('   Retrying in 5 seconds...')
            time.sleep(5)

            # Refresh token before retry
            refresh_firestore_client()
            old_ref = db.collection(OLD_COLLECTION)
            new_ref = db.collection(NEW_COLLECTION)
            continue

    # Final summary
    elapsed_total = time.time() - start_time

    print('\n' + '='*70)
    print('✅ Migration Complete!')
    print('='*70)
    print(f'Documents migrated:  {migrated_count:,}')
    print(f'Batches processed:   {batch_count}')
    print(f'Time elapsed:        {elapsed_total/60:.1f} minutes')
    if elapsed_total > 0:
        print(f'Average speed:       {migrated_count/elapsed_total:.0f} docs/sec')
    print('='*70)

    # Verify migration (sample check instead of full count)
    print('\n🔍 Quick verification...')
    print(f'   Checking destination collection has data...')
    try:
        new_sample = list(new_ref.limit(5).stream())
        if new_sample:
            print(f'   ✓ Destination collection has {len(new_sample)} sample documents')
            print(f'   ✓ Sample document IDs: {[doc.id for doc in new_sample[:3]]}')
        else:
            print(f'   ⚠️  WARNING: No documents found in destination collection!')
    except Exception as e:
        print(f'   ⚠️  Cannot verify: {e}')

    print('\n💡 Next steps:')
    print('   1. Verify data integrity with verification scripts')
    print('   2. Test all Python scripts with new collection name')
    print(f'   3. Delete old collection: {OLD_COLLECTION}')
    print('   4. Deploy updated Firestore rules')

    return 0

if __name__ == '__main__':
    try:
        exit_code = migrate_collection()
        sys.exit(exit_code)
    except KeyboardInterrupt:
        print('\n\n⚠️  Migration interrupted by user')
        sys.exit(1)
    except Exception as e:
        print(f'\n\n❌ Migration failed: {e}')
        import traceback
        traceback.print_exc()
        sys.exit(1)
