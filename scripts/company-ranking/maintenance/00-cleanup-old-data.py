#!/usr/bin/env python3
"""
清理旧数据脚本

删除以下 collections 中的所有文档（但保留 collection 结构）：
- company_news_by_ticker
- company_esg_by_ticker
- company_rankings_by_ticker

用于迁移到新的版本控制数据结构。

运行方式:
    python3 00-cleanup-old-data.py

警告：此操作不可逆！请确认后再运行。
"""

import os
import sys
import firebase_admin
from firebase_admin import credentials, firestore
from typing import List

# 添加父目录到 path
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PARENT_DIR = os.path.dirname(SCRIPT_DIR)
sys.path.insert(0, PARENT_DIR)


class DataCleanup:
    """清理旧数据的工具类"""

    def __init__(self, credentials_path: str = None):
        """初始化 Firebase 连接"""
        if not firebase_admin._apps:
            if credentials_path:
                cred = credentials.Certificate(credentials_path)
            else:
                # 使用默认凭证（Cloud Run 环境）
                cred = credentials.ApplicationDefault()

            firebase_admin.initialize_app(cred, {
                'projectId': 'stanseproject'
            })

        self.db = firestore.client()
        print(f"✅ Firebase initialized (project: stanseproject)")

    def delete_collection(self, collection_name: str, batch_size: int = 100):
        """
        删除整个 collection 的所有文档

        参数:
            collection_name: collection 名称
            batch_size: 每批删除的文档数量
        """
        print(f"\n{'='*60}")
        print(f"🗑️  Deleting collection: {collection_name}")
        print(f"{'='*60}")

        coll_ref = self.db.collection(collection_name)
        deleted = 0

        while True:
            # 获取一批文档
            docs = coll_ref.limit(batch_size).stream()
            docs_list = list(docs)

            if not docs_list:
                break

            # 删除这批文档
            batch = self.db.batch()
            for doc in docs_list:
                print(f"  ├─ Deleting {collection_name}/{doc.id}")
                batch.delete(doc.reference)
                deleted += 1

            batch.commit()

        print(f"  └─ ✅ Deleted {deleted} documents from {collection_name}")
        return deleted

    def delete_collection_with_subcollections(self, collection_name: str, batch_size: int = 100):
        """
        删除 collection 及其所有 subcollections

        对于每个文档，先删除其 history subcollection，然后删除文档本身
        """
        print(f"\n{'='*60}")
        print(f"🗑️  Deleting collection with subcollections: {collection_name}")
        print(f"{'='*60}")

        coll_ref = self.db.collection(collection_name)
        docs = coll_ref.stream()

        total_deleted = 0
        doc_count = 0

        for doc in docs:
            doc_count += 1
            print(f"\n  [{doc_count}] Processing {collection_name}/{doc.id}")

            # 删除 history subcollection（如果存在）
            history_ref = doc.reference.collection('history')
            history_docs = history_ref.limit(batch_size).stream()
            history_list = list(history_docs)

            if history_list:
                print(f"    ├─ Deleting {len(history_list)} history documents")
                batch = self.db.batch()
                for hist_doc in history_list:
                    batch.delete(hist_doc.reference)
                    total_deleted += 1
                batch.commit()

            # 删除主文档
            doc.reference.delete()
            print(f"    └─ Deleted main document")
            total_deleted += 1

        print(f"\n  ✅ Total deleted: {total_deleted} documents (including subcollections)")
        return total_deleted

    def cleanup_all(self, include_rankings: bool = False):
        """
        清理所有相关 collections

        参数:
            include_rankings: 是否也清理 company_rankings_by_ticker
                              (默认 False，因为 FEC 数据可能有其他用途)
        """
        print(f"\n{'='*70}")
        print(f"🧹 Data Cleanup - Company Ranking Collections")
        print(f"{'='*70}")
        print(f"⚠️  WARNING: This will DELETE ALL documents in the following collections:")
        print(f"   - company_news_by_ticker")
        print(f"   - company_esg_by_ticker")
        if include_rankings:
            print(f"   - company_rankings_by_ticker")
        print(f"\n{'='*70}")

        # 请求用户确认
        confirm = input("Type 'DELETE' to confirm: ")
        if confirm != "DELETE":
            print("❌ Cleanup cancelled")
            return

        print("\n🚀 Starting cleanup...")

        # 清理 company_news_by_ticker
        self.delete_collection_with_subcollections('company_news_by_ticker')

        # 清理 company_esg_by_ticker
        self.delete_collection_with_subcollections('company_esg_by_ticker')

        # 清理 company_rankings_by_ticker (可选)
        if include_rankings:
            self.delete_collection_with_subcollections('company_rankings_by_ticker')

        print(f"\n{'='*70}")
        print(f"✅ Cleanup Complete!")
        print(f"{'='*70}")
        print(f"\nNext steps:")
        print(f"1. Run 01-collect-fec-donations.py to repopulate FEC data")
        print(f"2. Run 02-collect-esg-scores.py to repopulate ESG data")
        print(f"3. Run 03-collect-polygon-news.py to repopulate news data")


def main():
    """主函数"""
    credentials_path = os.getenv('FIREBASE_CREDENTIALS_PATH')

    # 检查是否包含 --include-rankings 参数
    include_rankings = '--include-rankings' in sys.argv

    # 如果有非选项参数，作为凭证路径
    for arg in sys.argv[1:]:
        if not arg.startswith('--'):
            credentials_path = arg
            break

    cleanup = DataCleanup(credentials_path)

    cleanup.cleanup_all(include_rankings=include_rankings)


if __name__ == "__main__":
    main()
