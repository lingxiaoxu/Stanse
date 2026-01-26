"""
告警系统

监控关键指标并发送告警:
1. 高错误率
2. 高成本
3. 预算超支
4. 性能下降
"""

from datetime import datetime
from typing import Dict, List
import firebase_admin
from firebase_admin import firestore


class AlertLevel(str):
    """告警级别"""
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


class AlertService:
    """告警服务"""

    def __init__(self, db_client=None):
        """初始化告警服务"""
        if db_client:
            self.db = db_client
        else:
            if not firebase_admin._apps:
                firebase_admin.initialize_app()
            self.db = firestore.client()

        # 告警规则
        self.rules = {
            "high_error_rate": {
                "threshold": 0.05,  # 5%
                "level": AlertLevel.ERROR,
                "description": "错误率超过 5%"
            },
            "high_cost": {
                "threshold": 10.0,  # $10/小时
                "level": AlertLevel.WARNING,
                "description": "小时成本超过 $10"
            },
            "budget_exceeded": {
                "threshold": 1.0,  # 用户预算
                "level": AlertLevel.CRITICAL,
                "description": "用户预算超支"
            },
            "slow_response": {
                "threshold": 10.0,  # 10秒
                "level": AlertLevel.WARNING,
                "description": "P95 响应时间超过 10秒"
            }
        }

    async def check_and_alert(
        self,
        metric_name: str,
        current_value: float,
        context: Dict = None
    ) -> bool:
        """
        检查指标并触发告警

        Args:
            metric_name: 指标名称
            current_value: 当前值
            context: 上下文信息

        Returns:
            是否触发告警
        """
        rule = self.rules.get(metric_name)
        if not rule:
            return False

        # 检查是否超过阈值
        if current_value > rule["threshold"]:
            await self._send_alert(
                level=rule["level"],
                message=rule["description"],
                metric=metric_name,
                value=current_value,
                threshold=rule["threshold"],
                context=context or {}
            )
            return True

        return False

    async def _send_alert(
        self,
        level: str,
        message: str,
        metric: str,
        value: float,
        threshold: float,
        context: Dict
    ) -> None:
        """
        发送告警

        记录到 Firestore 并可选发送通知
        """
        alert_doc = {
            "level": level,
            "message": message,
            "metric": metric,
            "value": value,
            "threshold": threshold,
            "context": context,
            "timestamp": datetime.now(),
            "resolved": False
        }

        # 保存到 Firestore
        self.db.collection("alerts").add(alert_doc)

        # 打印日志（Cloud Logging 会捕获）
        print(f"🚨 ALERT [{level.upper()}]: {message}")
        print(f"   Metric: {metric} = {value} (threshold: {threshold})")

        # TODO: 可选发送邮件/Slack/SMS通知
        # if level == AlertLevel.CRITICAL:
        #     send_email_alert(...)
        #     send_slack_notification(...)

    async def get_active_alerts(self) -> List[Dict]:
        """
        获取未解决的告警

        Returns:
            告警列表
        """
        docs = self.db.collection("alerts") \
            .where("resolved", "==", False) \
            .order_by("timestamp", direction=firestore.Query.DESCENDING) \
            .limit(50) \
            .stream()

        alerts = []
        for doc in docs:
            data = doc.to_dict()
            alerts.append({
                "id": doc.id,
                **data
            })

        return alerts

    async def resolve_alert(self, alert_id: str) -> None:
        """
        解决告警

        Args:
            alert_id: 告警 ID
        """
        self.db.collection("alerts").document(alert_id).update({
            "resolved": True,
            "resolved_at": datetime.now()
        })


# 单例实例
_alert_service_instance = None


def get_alert_service() -> AlertService:
    """获取告警服务单例"""
    global _alert_service_instance
    if _alert_service_instance is None:
        _alert_service_instance = AlertService()
    return _alert_service_instance
