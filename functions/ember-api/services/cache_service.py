"""
缓存服务

实现两级缓存:
1. 内存缓存 (LRU) - 快速访问
2. Firestore 缓存 - 持久化

缓存键生成基于:
- 消息内容（标准化）
- 模式
- 用户上下文（标准化）
"""

import hashlib
import json
from datetime import datetime, timedelta
from typing import Dict, Optional
from functools import lru_cache
import firebase_admin
from firebase_admin import firestore

class CacheService:
    """缓存服务"""

    def __init__(self, db_client=None, cache_ttl_seconds=600):
        """
        初始化缓存服务

        Args:
            db_client: Firestore 客户端
            cache_ttl_seconds: 缓存过期时间（秒），默认10分钟
        """
        if db_client:
            self.db = db_client
        else:
            if not firebase_admin._apps:
                firebase_admin.initialize_app()
            self.db = firestore.client()

        self.cache_ttl = cache_ttl_seconds
        self._memory_cache = {}  # 简单的内存缓存

    def generate_cache_key(
        self,
        message: str,
        mode: str,
        user_context: Optional[Dict] = None
    ) -> str:
        """
        生成缓存键

        标准化过程:
        1. 消息转小写并去除多余空格
        2. 用户上下文四舍五入（避免微小差异）
        3. MD5 哈希

        Args:
            message: 消息内容
            mode: 聊天模式
            user_context: 用户画像

        Returns:
            MD5 哈希字符串
        """
        # 标准化消息
        normalized_message = message.lower().strip()

        # 标准化用户上下文
        normalized_context = {}
        if user_context:
            if 'economic' in user_context:
                normalized_context['economic'] = round(user_context['economic'], 1)
            if 'social' in user_context:
                normalized_context['social'] = round(user_context['social'], 1)
            if 'diplomatic' in user_context:
                normalized_context['diplomatic'] = round(user_context['diplomatic'], 1)
            if 'label' in user_context:
                normalized_context['label'] = user_context['label']

        # 组合键数据
        key_data = {
            "message": normalized_message,
            "mode": mode,
            "context": normalized_context
        }

        # MD5 哈希
        key_str = json.dumps(key_data, sort_keys=True)
        return hashlib.md5(key_str.encode()).hexdigest()

    async def get(self, cache_key: str) -> Optional[Dict]:
        """
        获取缓存

        查找顺序:
        1. 内存缓存
        2. Firestore 缓存

        Args:
            cache_key: 缓存键

        Returns:
            缓存的结果或 None
        """
        # 1. 尝试内存缓存
        if cache_key in self._memory_cache:
            cached_data = self._memory_cache[cache_key]
            # 检查是否过期（内存缓存的 expires_at 是 datetime 对象）
            now = datetime.now()
            expires_at = cached_data['expires_at']
            # 如果 expires_at 是 datetime，直接比较；如果是 Timestamp，转换
            try:
                if hasattr(expires_at, 'seconds'):  # Firestore Timestamp
                    expires_dt = datetime.fromtimestamp(expires_at.seconds)
                else:
                    expires_dt = expires_at

                if now < expires_dt:
                    return cached_data['result']
                else:
                    del self._memory_cache[cache_key]
            except:
                # 如果比较失败，删除缓存
                del self._memory_cache[cache_key]

        # 2. 尝试 Firestore 缓存（使用全局缓存 collection）
        doc = self.db.collection("ember_global_cache").document(cache_key).get()

        if doc.exists:
            data = doc.to_dict()
            expires_at = data.get('expires_at')

            # 检查是否过期
            if expires_at:
                # Firestore Timestamp 转换为 datetime
                try:
                    if hasattr(expires_at, 'seconds'):
                        expires_dt = datetime.fromtimestamp(expires_at.seconds)
                    else:
                        expires_dt = expires_at

                        if datetime.now() < expires_dt:
                            # 未过期，写回内存缓存
                            self._memory_cache[cache_key] = {
                                "result": data['result'],
                                "expires_at": expires_at
                            }
                            return data['result']
                        else:
                            # 过期，删除
                            doc.reference.delete()
                except:
                    # 比较失败，删除缓存
                    doc.reference.delete()

        return None

    async def set(
        self,
        cache_key: str,
        result: Dict,
        ttl_seconds: Optional[int] = None
    ) -> None:
        """
        设置缓存

        同时写入内存缓存和 Firestore

        Args:
            cache_key: 缓存键
            result: 结果数据
            ttl_seconds: 过期时间（秒），None 使用默认值
        """
        if ttl_seconds is None:
            ttl_seconds = self.cache_ttl

        expires_at = datetime.now() + timedelta(seconds=ttl_seconds)

        # 1. 写入内存缓存
        self._memory_cache[cache_key] = {
            "result": result,
            "expires_at": expires_at
        }

        # 限制内存缓存大小（最多1000条）
        if len(self._memory_cache) > 1000:
            # 删除最旧的（简化实现）
            oldest_key = min(
                self._memory_cache.keys(),
                key=lambda k: self._memory_cache[k]['expires_at']
            )
            del self._memory_cache[oldest_key]

        # 2. 写入 Firestore 缓存（全局缓存，所有用户共享）
        self.db.collection("ember_global_cache").document(cache_key).set({
            "result": result,
            "expires_at": expires_at,
            "created_at": datetime.now()
        })

    async def clear_user_cache(self, user_id: str) -> int:
        """
        清除特定用户的缓存

        Args:
            user_id: 用户 ID

        Returns:
            删除的缓存条数
        """
        # 这是一个简化实现
        # 实际中可能需要在缓存键中包含 user_id

        # 清除内存缓存中的所有内容（简化）
        count = len(self._memory_cache)
        self._memory_cache.clear()

        return count

    async def get_cache_stats(self) -> Dict:
        """
        获取缓存统计

        Returns:
            {
                "memory_cache_size": int,
                "firestore_cache_count": int,
                "hit_rate": float
            }
        """
        # 简化统计
        memory_size = len(self._memory_cache)

        # 统计 Firestore 缓存数量
        cache_docs = self.db.collection("ember_global_cache").limit(1000).stream()
        firestore_count = sum(1 for _ in cache_docs)

        return {
            "memory_cache_size": memory_size,
            "firestore_cache_count": firestore_count,
            "status": "active"
        }


# 单例实例
_cache_service_instance = None

def get_cache_service() -> CacheService:
    """获取缓存服务单例"""
    global _cache_service_instance
    if _cache_service_instance is None:
        _cache_service_instance = CacheService()
    return _cache_service_instance
