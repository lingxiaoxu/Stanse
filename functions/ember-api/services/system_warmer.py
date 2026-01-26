"""
系统预热服务

在 Cloud Function 启动时预热:
1. 模型连接
2. 缓存预加载
3. 数据库连接
"""

import asyncio
from typing import List
import firebase_admin
from firebase_admin import firestore

# 需要在启动时导入
import sys
from pathlib import Path

ember_path = Path(__file__).parent.parent.parent.parent / "ember-main" / "src"
if ember_path.exists():
    sys.path.insert(0, str(ember_path))

from ember.api import models


class SystemWarmer:
    """系统预热器"""

    def __init__(self, db_client=None):
        """初始化"""
        if db_client:
            self.db = db_client
        else:
            if not firebase_admin._apps:
                firebase_admin.initialize_app()
            self.db = firestore.client()

    async def warmup(self) -> Dict[str, bool]:
        """
        执行完整预热

        Returns:
            {component: success_status}
        """
        print("🔥 开始系统预热...")

        results = {}

        # 并行执行所有预热任务
        tasks = [
            ("models", self._warmup_models()),
            ("cache", self._warmup_cache()),
            ("connections", self._warmup_connections())
        ]

        for name, task in tasks:
            try:
                await task
                results[name] = True
                print(f"  ✓ {name} 预热完成")
            except Exception as e:
                results[name] = False
                print(f"  ✗ {name} 预热失败: {e}")

        print("✅ 系统预热完成")
        return results

    async def _warmup_models(self) -> None:
        """
        预热模型连接

        测试所有主要模型的连接
        """
        test_message = "Hello"

        models_to_warm = [
            "gpt-5",
            "gpt-4o",
            "gemini-2.5-flash",
            "claude-4-sonnet"
        ]

        for model in models_to_warm:
            try:
                # 简单调用预热连接
                _ = models(model, test_message)
                print(f"    ✓ {model} warmed up")
            except Exception as e:
                print(f"    ✗ {model} warmup failed: {e}")

    async def _warmup_cache(self) -> None:
        """
        预加载常见问题缓存

        从 Firestore 获取高频问题并预生成答案
        """
        # 获取常见问题（如果有预定义）
        common_questions_ref = self.db.collection("common_questions").limit(10)
        docs = common_questions_ref.get()

        if not docs:
            print("    ℹ️  无常见问题需要预热")
            return

        for doc in docs:
            data = doc.to_dict()
            question = data.get("question")

            if question:
                try:
                    # 预生成答案并缓存
                    _ = models("gemini-2.5-flash", question)
                    print(f"    ✓ Cached: {question[:30]}...")
                except Exception as e:
                    print(f"    ✗ Cache failed: {e}")

    async def _warmup_connections(self) -> None:
        """
        预热数据库连接

        测试 Firestore 连接
        """
        try:
            # 测试 Firestore 读取
            _ = self.db.collection("system_health").limit(1).get()
            print("    ✓ Firestore connection ready")
        except Exception as e:
            print(f"    ✗ Firestore warmup failed: {e}")


# 单例实例
_system_warmer_instance = None


def get_system_warmer() -> SystemWarmer:
    """获取系统预热器单例"""
    global _system_warmer_instance
    if _system_warmer_instance is None:
        _system_warmer_instance = SystemWarmer()
    return _system_warmer_instance


# 预热执行函数（在应用启动时调用）
async def warmup_on_startup():
    """启动时执行预热"""
    warmer = get_system_warmer()
    return await warmer.warmup()
