"""
监控服务

收集和报告系统指标:
1. API 性能指标
2. 成本指标
3. 错误率
4. 用户活跃度
"""

from datetime import datetime, timedelta
from typing import Dict, List
import firebase_admin
from firebase_admin import firestore


class MonitoringService:
    """监控服务"""

    def __init__(self, db_client=None):
        """初始化监控服务"""
        if db_client:
            self.db = db_client
        else:
            if not firebase_admin._apps:
                firebase_admin.initialize_app()
            self.db = firestore.client()

    async def record_metric(
        self,
        metric_type: str,
        value: float,
        metadata: Dict = None
    ) -> None:
        """
        记录指标

        Args:
            metric_type: 指标类型 (latency/cost/error/success)
            value: 指标值
            metadata: 附加信息
        """
        self.db.collection("metrics").add({
            "type": metric_type,
            "value": value,
            "metadata": metadata or {},
            "timestamp": datetime.now()
        })

    async def get_metrics(
        self,
        metric_type: str,
        period: str = "hour"
    ) -> Dict:
        """
        获取指标统计

        Args:
            metric_type: 指标类型
            period: hour | day | week

        Returns:
            统计结果
        """
        # 计算时间范围
        now = datetime.now()

        if period == "hour":
            start_time = now - timedelta(hours=1)
        elif period == "day":
            start_time = now - timedelta(days=1)
        elif period == "week":
            start_time = now - timedelta(days=7)
        else:
            start_time = now - timedelta(hours=1)

        # 查询数据
        docs = self.db.collection("metrics") \
            .where("type", "==", metric_type) \
            .where("timestamp", ">=", start_time) \
            .stream()

        values = []
        for doc in docs:
            data = doc.to_dict()
            values.append(data["value"])

        # 计算统计
        if not values:
            return {
                "count": 0,
                "mean": 0,
                "min": 0,
                "max": 0,
                "p50": 0,
                "p95": 0,
                "p99": 0
            }

        values.sort()
        count = len(values)

        return {
            "count": count,
            "mean": sum(values) / count,
            "min": values[0],
            "max": values[-1],
            "p50": values[int(count * 0.50)],
            "p95": values[int(count * 0.95)] if count > 20 else values[-1],
            "p99": values[int(count * 0.99)] if count > 100 else values[-1]
        }

    async def check_health(self) -> Dict:
        """
        健康检查

        Returns:
            {
                "status": "healthy" | "degraded" | "unhealthy",
                "checks": {...}
            }
        """
        checks = {}

        # 检查 1: 错误率
        error_metrics = await self.get_metrics("error", "hour")
        success_metrics = await self.get_metrics("success", "hour")

        total_requests = error_metrics["count"] + success_metrics["count"]
        error_rate = error_metrics["count"] / total_requests if total_requests > 0 else 0

        checks["error_rate"] = {
            "value": error_rate,
            "threshold": 0.05,  # 5%
            "healthy": error_rate < 0.05
        }

        # 检查 2: 响应时间
        latency_metrics = await self.get_metrics("latency", "hour")

        checks["latency_p95"] = {
            "value": latency_metrics["p95"],
            "threshold": 5.0,  # 5秒
            "healthy": latency_metrics["p95"] < 5.0
        }

        # 检查 3: 成本
        cost_metrics = await self.get_metrics("cost", "hour")

        checks["hourly_cost"] = {
            "value": cost_metrics["mean"] * cost_metrics["count"],
            "threshold": 10.0,  # $10/小时
            "healthy": (cost_metrics["mean"] * cost_metrics["count"]) < 10.0
        }

        # 综合健康状态
        all_healthy = all(check["healthy"] for check in checks.values())
        any_unhealthy = any(not check["healthy"] for check in checks.values())

        if all_healthy:
            status = "healthy"
        elif any_unhealthy and error_rate > 0.10:
            status = "unhealthy"
        else:
            status = "degraded"

        return {
            "status": status,
            "checks": checks,
            "timestamp": datetime.now().isoformat()
        }


# 单例实例
_monitoring_service_instance = None


def get_monitoring_service() -> MonitoringService:
    """获取监控服务单例"""
    global _monitoring_service_instance
    if _monitoring_service_instance is None:
        _monitoring_service_instance = MonitoringService()
    return _monitoring_service_instance
