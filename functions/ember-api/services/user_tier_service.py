"""
用户等级系统

实现 4 个等级：
- FREE: 免费用户
- BASIC: 基础付费
- PREMIUM: 高级付费
- ENTERPRISE: 企业用户
"""

from enum import Enum
from typing import Dict, List, Tuple
import firebase_admin
from firebase_admin import firestore


class UserTier(str, Enum):
    """用户等级"""
    FREE = "free"
    BASIC = "basic"
    PREMIUM = "premium"
    ENTERPRISE = "enterprise"


# 不同等级的权限配置
TIER_LIMITS = {
    UserTier.FREE: {
        "modes": ["default"],  # 仅基础模式
        "daily_requests": 10,  # 每日10次
        "max_tokens_per_request": 1000,
        "models": ["gemini-2.5-flash"],
        "daily_budget": 0.10,  # $0.10/天
        "features": []
    },
    UserTier.BASIC: {
        "modes": ["default", "multi"],
        "daily_requests": 100,
        "max_tokens_per_request": 5000,
        "models": ["gemini-2.5-flash", "gpt-4o"],
        "daily_budget": 1.00,  # $1/天
        "features": ["cache", "cost_tracking"]
    },
    UserTier.PREMIUM: {
        "modes": ["default", "multi", "ensemble"],
        "daily_requests": 500,
        "max_tokens_per_request": 20000,
        "models": ["all"],
        "daily_budget": 10.00,  # $10/天
        "features": ["cache", "cost_tracking", "priority_queue", "analytics"]
    },
    UserTier.ENTERPRISE: {
        "modes": ["all"],  # 所有模式包括 batch
        "daily_requests": -1,  # 无限制
        "max_tokens_per_request": -1,
        "models": ["all"],
        "daily_budget": -1,  # 无限制
        "features": ["all"]
    }
}


class UserTierService:
    """用户等级服务"""

    def __init__(self, db_client=None):
        """初始化用户等级服务"""
        if db_client:
            self.db = db_client
        else:
            if not firebase_admin._apps:
                firebase_admin.initialize_app()
            self.db = firestore.client()

    async def get_user_tier(self, user_id: str) -> UserTier:
        """
        获取用户等级

        Args:
            user_id: 用户 ID

        Returns:
            UserTier 枚举
        """
        doc = self.db.collection("user_tiers").document(user_id).get()

        if doc.exists:
            tier_str = doc.to_dict().get("tier", "free")
            try:
                return UserTier(tier_str)
            except ValueError:
                return UserTier.FREE
        else:
            # 默认免费用户
            return UserTier.FREE

    async def set_user_tier(self, user_id: str, tier: UserTier) -> None:
        """
        设置用户等级

        Args:
            user_id: 用户 ID
            tier: 用户等级
        """
        self.db.collection("user_tiers").document(user_id).set({
            "tier": tier.value,
            "updated_at": firestore.SERVER_TIMESTAMP
        })

    def check_permission(
        self,
        user_tier: UserTier,
        mode: str,
        daily_requests: int
    ) -> Tuple[bool, str | None]:
        """
        检查用户权限

        Args:
            user_tier: 用户等级
            mode: 请求的模式
            daily_requests: 今日已请求次数

        Returns:
            (can_proceed, error_message)
        """
        limits = TIER_LIMITS[user_tier]

        # 检查模式权限
        allowed_modes = limits["modes"]
        if mode not in allowed_modes and "all" not in allowed_modes:
            return False, f"此模式需要升级会员。当前等级: {user_tier.value}, 可用模式: {', '.join(allowed_modes)}"

        # 检查请求次数
        max_requests = limits["daily_requests"]
        if max_requests != -1 and daily_requests >= max_requests:
            return False, f"今日请求次数已达上限({max_requests})。请升级会员或明天再试。"

        return True, None

    def get_tier_limits(self, user_tier: UserTier) -> Dict:
        """
        获取用户等级限制

        Args:
            user_tier: 用户等级

        Returns:
            等级配置字典
        """
        return TIER_LIMITS[user_tier].copy()

    async def get_daily_request_count(self, user_id: str) -> int:
        """
        获取今日请求次数

        Args:
            user_id: 用户 ID

        Returns:
            今日请求次数
        """
        from datetime import datetime

        today = datetime.now().date().isoformat()

        # 从 users collection 下查询
        docs = self.db.collection("users") \
            .document(user_id) \
            .collection("ember_cost_sessions") \
            .where("date", "==", today) \
            .get()

        return len(docs)


# 单例实例
_user_tier_service_instance = None


def get_user_tier_service() -> UserTierService:
    """获取用户等级服务单例"""
    global _user_tier_service_instance
    if _user_tier_service_instance is None:
        _user_tier_service_instance = UserTierService()
    return _user_tier_service_instance
