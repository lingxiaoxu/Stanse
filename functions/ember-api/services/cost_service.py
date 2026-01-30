"""
成本追踪服务

负责:
1. 记录每次 AI 调用的成本
2. 统计用户使用量
3. 预算管理
4. 成本分析
"""

from datetime import datetime, timedelta
from typing import Dict, List, Optional
import firebase_admin
from firebase_admin import firestore

class CostService:
    """成本追踪服务"""

    def __init__(self, db_client=None):
        """
        初始化成本服务

        Args:
            db_client: Firestore 客户端（可选，用于测试）
        """
        if db_client:
            self.db = db_client
        else:
            # 使用默认的 Firestore 客户端
            if not firebase_admin._apps:
                firebase_admin.initialize_app()
            self.db = firestore.client()

    async def record_usage(
        self,
        user_id: str,
        cost: float,
        metadata: Dict
    ) -> None:
        """
        记录用户使用

        Args:
            user_id: 用户 ID
            cost: 本次成本
            metadata: 元数据 (model, mode, tokens, question, etc.)
        """
        doc_ref = self.db.collection("users") \
            .document(user_id) \
            .collection("ember_cost_sessions") \
            .document()

        data = {
            "timestamp": datetime.now(),
            "date": datetime.now().date().isoformat(),
            "cost": cost,
            "model": metadata.get("model"),
            "mode": metadata.get("mode"),
            "tokens": metadata.get("tokens", {}),
            "execution_time": metadata.get("execution_time", 0)
        }

        # 不存储问题和答案内容（隐私保护）
        # 只存储元数据

        doc_ref.set(data)

    async def get_usage_stats(
        self,
        user_id: str,
        period: str = "today"
    ) -> Dict:
        """
        获取用户使用统计

        Args:
            user_id: 用户 ID
            period: 时间段 (today/week/month/all)

        Returns:
            {
                "total_cost": float,
                "total_requests": int,
                "total_tokens": int,
                "by_mode": {...},
                "by_model": {...},
                "trend": [...]
            }
        """
        # 计算时间范围
        now = datetime.now()

        if period == "today":
            start_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
        elif period == "week":
            start_date = now - timedelta(days=7)
        elif period == "month":
            start_date = now - timedelta(days=30)
        else:  # all
            start_date = datetime(2020, 1, 1)

        # 查询数据（从 users collection 下的子集合）
        query = self.db.collection("users") \
            .document(user_id) \
            .collection("ember_cost_sessions") \
            .where("timestamp", ">=", start_date) \
            .order_by("timestamp")

        docs = query.stream()

        # 统计
        total_cost = 0.0
        total_requests = 0
        total_tokens = 0
        by_mode = {}
        by_model = {}
        trend_data = {}

        for doc in docs:
            data = doc.to_dict()

            # 总计
            cost = data.get("cost", 0.0)
            tokens = data.get("tokens", {}).get("total", 0)

            total_cost += cost
            total_requests += 1
            total_tokens += tokens

            # 按模式统计
            mode = data.get("mode", "unknown")
            if mode not in by_mode:
                by_mode[mode] = {
                    "requests": 0,
                    "cost": 0.0,
                    "tokens": 0
                }
            by_mode[mode]["requests"] += 1
            by_mode[mode]["cost"] += cost
            by_mode[mode]["tokens"] += tokens

            # 按模型统计
            model = data.get("model", "unknown")
            if model not in by_model:
                by_model[model] = {
                    "calls": 0,
                    "cost": 0.0,
                    "tokens": 0
                }
            by_model[model]["calls"] += 1
            by_model[model]["cost"] += cost
            by_model[model]["tokens"] += tokens

            # 趋势数据（按小时）
            if period == "today":
                hour_key = data["timestamp"].strftime("%H:00")
                if hour_key not in trend_data:
                    trend_data[hour_key] = {"cost": 0.0, "requests": 0}
                trend_data[hour_key]["cost"] += cost
                trend_data[hour_key]["requests"] += 1

        # 格式化趋势数据
        trend = [
            {"time": k, "cost": v["cost"], "requests": v["requests"]}
            for k, v in sorted(trend_data.items())
        ]

        return {
            "period": period,
            "date_range": {
                "start": start_date.isoformat(),
                "end": now.isoformat()
            },
            "summary": {
                "total_cost": round(total_cost, 6),
                "total_requests": total_requests,
                "total_tokens": total_tokens,
                "avg_cost_per_request": round(total_cost / total_requests, 6) if total_requests > 0 else 0
            },
            "by_mode": by_mode,
            "by_model": by_model,
            "trend": trend
        }

    async def check_budget(
        self,
        user_id: str,
        estimated_cost: float
    ) -> tuple[bool, Optional[str]]:
        """
        检查用户预算

        Args:
            user_id: 用户 ID
            estimated_cost: 预估成本

        Returns:
            (can_proceed, error_message)
        """
        # 获取用户预算设置
        budget_doc = self.db.collection("user_budgets").document(user_id).get()

        if not budget_doc.exists:
            # 无预算限制（免费用户有默认限制）
            default_daily_limit = 1.0  # $1/天
            budget_data = {"daily_limit": default_daily_limit}
        else:
            budget_data = budget_doc.to_dict()

        daily_limit = budget_data.get("daily_limit", 1.0)

        # 获取今日已用
        stats = await self.get_usage_stats(user_id, "today")
        today_usage = stats["summary"]["total_cost"]

        # 检查是否超预算
        if today_usage + estimated_cost > daily_limit:
            remaining = daily_limit - today_usage
            error_msg = (
                f"预算不足。"
                f"今日限额: ${daily_limit:.2f}, "
                f"已用: ${today_usage:.4f}, "
                f"剩余: ${remaining:.4f}"
            )
            return False, error_msg

        return True, None

    def estimate_cost(self, mode: str, message_length: int = 100) -> float:
        """
        估算成本

        Args:
            mode: 聊天模式
            message_length: 消息长度（字符数）

        Returns:
            估算成本（美元）
        """
        # 基于模式的估算
        base_estimates = {
            "default": 0.0015,
            "multi": 0.0045,
            "ensemble": 0.018,
            "batch": 0.0002  # 每个问题
        }

        base_cost = base_estimates.get(mode, 0.001)

        # 根据消息长度调整（长消息成本更高）
        length_factor = min(message_length / 100, 3.0)  # 最多3倍

        return base_cost * length_factor

    def calculate_cost_from_tokens(self, model: str, tokens: dict) -> float:
        """
        根据实际 tokens 计算精确成本（统一定价逻辑）

        Args:
            model: 模型名称 (如 'claude-sonnet-4-5-20250929')
            tokens: {"prompt": int, "completion": int}

        Returns:
            计算的成本（美元）
        """
        prompt_tokens = tokens.get('prompt', 0)
        completion_tokens = tokens.get('completion', 0)

        # 统一定价表（per 1M tokens）
        pricing = {
            # Claude 4.5
            'claude-opus-4-5': (15.0, 75.0),
            'claude-sonnet-4-5': (3.0, 15.0),
            'claude-haiku-4-5': (0.8, 4.0),
            # Claude 4.0
            'claude-sonnet-4': (3.0, 15.0),
            # Gemini (minimum 2.5 - no 2.0 or lower)
            'gemini-2.5-pro': (1.25, 5.0),
            'gemini-2.5-flash': (0.075, 0.3),
            # GPT
            'gpt-5': (5.0, 15.0),
            'gpt-4o': (2.5, 10.0),
        }

        # 匹配模型
        input_price, output_price = (3.0, 15.0)  # 默认 Sonnet 4.5
        model_lower = model.lower()
        for model_key, (inp, out) in pricing.items():
            if model_key in model_lower:
                input_price, output_price = inp, out
                break

        # 计算
        input_cost = (prompt_tokens / 1_000_000) * input_price
        output_cost = (completion_tokens / 1_000_000) * output_price

        return input_cost + output_cost


# 单例实例
_cost_service_instance = None

def get_cost_service() -> CostService:
    """获取成本服务单例"""
    global _cost_service_instance
    if _cost_service_instance is None:
        _cost_service_instance = CostService()
    return _cost_service_instance
