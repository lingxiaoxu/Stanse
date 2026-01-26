"""
负载均衡服务

智能选择最优模型基于:
1. 当前负载
2. 模型容量
3. 质量需求
4. 成本考虑
"""

from typing import Dict
import firebase_admin
from firebase_admin import firestore
from datetime import datetime, timedelta


class ModelLoadBalancer:
    """智能模型负载均衡"""

    def __init__(self, db_client=None):
        """初始化负载均衡器"""
        if db_client:
            self.db = db_client
        else:
            if not firebase_admin._apps:
                firebase_admin.initialize_app()
            self.db = firestore.client()

        # 模型池定义
        self.model_pools = {
            "fast": ["gemini-2.5-flash"],
            "balanced": ["gpt-4o", "gemini-2.5-pro"],
            "quality": ["gpt-5", "claude-4-sonnet"]
        }

        # 模型容量（每分钟请求数）
        self.model_capacities = {
            "gemini-2.5-flash": 1000,
            "gemini-2.5-pro": 500,
            "gpt-4o": 500,
            "gpt-5": 200,
            "claude-4-sonnet": 300
        }

        # 模型质量权重
        self.quality_weights = {
            "gpt-5": 1.0,
            "claude-4-sonnet": 0.95,
            "gemini-2.5-pro": 0.90,
            "gpt-4o": 0.90,
            "gemini-2.5-flash": 0.85
        }

    async def select_model(
        self,
        preference: str = "balanced",
        fallback_enabled: bool = True
    ) -> str:
        """
        基于负载选择模型

        Args:
            preference: fast | balanced | quality
            fallback_enabled: 是否启用降级

        Returns:
            模型名称
        """
        # 获取当前负载
        current_load = await self._get_current_load()

        # 获取候选池
        pool = self.model_pools.get(preference, self.model_pools["balanced"])

        # 计算每个模型的负载分数
        scores = {}
        for model in pool:
            load = current_load.get(model, 0)
            capacity = self.model_capacities[model]

            # 负载比率（0-1）
            load_ratio = min(load / capacity, 1.0)

            # 负载分数 = (1 - 负载比率) × 质量权重
            load_score = (1 - load_ratio) * self.quality_weights[model]
            scores[model] = load_score

        # 选择负载分数最高的模型
        if scores:
            best_model = max(scores.items(), key=lambda x: x[1])[0]

            # 检查是否过载
            if current_load.get(best_model, 0) >= self.model_capacities[best_model]:
                # 过载，尝试降级
                if fallback_enabled:
                    return await self._find_fallback_model(preference, current_load)

            return best_model
        else:
            # 默认返回 gemini-2.5-flash
            return "gemini-2.5-flash"

    async def _get_current_load(self) -> Dict[str, int]:
        """
        获取当前模型负载

        Returns:
            {model_name: current_requests_per_minute}
        """
        # 统计最近 1 分钟的请求
        one_minute_ago = datetime.now() - timedelta(minutes=1)

        # 从 Firestore 查询
        docs = self.db.collection("model_requests") \
            .where("timestamp", ">=", one_minute_ago) \
            .stream()

        load = {}
        for doc in docs:
            data = doc.to_dict()
            model = data.get("model", "unknown")
            load[model] = load.get(model, 0) + 1

        return load

    async def _find_fallback_model(
        self,
        preference: str,
        current_load: Dict[str, int]
    ) -> str:
        """
        查找降级模型

        优先级:
        quality → balanced → fast
        """
        # 定义降级路径
        fallback_chain = {
            "quality": ["balanced", "fast"],
            "balanced": ["fast"],
            "fast": []  # 无降级
        }

        # 获取降级选项
        fallback_options = fallback_chain.get(preference, [])

        for fallback_pref in fallback_options:
            pool = self.model_pools[fallback_pref]

            for model in pool:
                load = current_load.get(model, 0)
                capacity = self.model_capacities[model]

                if load < capacity:
                    return model

        # 如果所有都过载，返回最快的
        return "gemini-2.5-flash"

    async def record_request(self, model: str) -> None:
        """
        记录模型请求（用于负载统计）

        Args:
            model: 使用的模型
        """
        self.db.collection("model_requests").add({
            "model": model,
            "timestamp": datetime.now()
        })


# 单例实例
_load_balancer_instance = None


def get_load_balancer() -> ModelLoadBalancer:
    """获取负载均衡器单例"""
    global _load_balancer_instance
    if _load_balancer_instance is None:
        _load_balancer_instance = ModelLoadBalancer()
    return _load_balancer_instance
