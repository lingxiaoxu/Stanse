"""
Ember API Cloud Function

提供 RESTful API 接口:
- POST /chat - 基础聊天
- POST /multi-model - 多模型对比
- POST /ensemble - Ensemble 模式
- POST /batch - 批量处理
- GET /cost/stats - 成本统计
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import firebase_admin
from firebase_admin import credentials, firestore
import asyncio
from functools import wraps

# 初始化 Flask
app = Flask(__name__)
CORS(app)  # 允许跨域

# 初始化 Firebase
# Cloud Function 在 gen-lang-client-0960644135，但使用 stanseproject 的 Firestore
# 这样所有用户数据（聊天历史 + 成本追踪）都在同一个数据库
if not firebase_admin._apps:
    cred = credentials.ApplicationDefault()
    firebase_admin.initialize_app(cred, {
        'projectId': 'stanseproject'  # 使用 stanseproject 的 Firestore
    })

# 导入所有服务
from services.ember_service import get_ember_service
from services.cost_service import get_cost_service
from services.cache_service import get_cache_service
from services.user_tier_service import get_user_tier_service
from services.monitoring_service import get_monitoring_service
from services.alert_service import get_alert_service
from services.cost_optimizer_service import get_cost_optimizer

# 获取服务实例
ember_service = get_ember_service()
cost_service = get_cost_service()
cache_service = get_cache_service()
tier_service = get_user_tier_service()
monitoring_service = get_monitoring_service()
alert_service = get_alert_service()
cost_optimizer = get_cost_optimizer()


def async_route(f):
    """装饰器：支持异步路由"""
    @wraps(f)
    def wrapper(*args, **kwargs):
        return asyncio.run(f(*args, **kwargs))
    return wrapper


@app.route('/health', methods=['GET'])
def health_check():
    """健康检查"""
    return jsonify({
        "status": "healthy",
        "service": "ember-api",
        "version": "1.0.0"
    })


@app.route('/chat', methods=['POST'])
@async_route
async def chat():
    """
    基础聊天 API

    请求体:
    {
        "message": "用户问题",
        "mode": "default",  # default | multi | ensemble | batch
        "user_context": {
            "economic": -2.5,
            "social": 3.1,
            "diplomatic": 1.2,
            "label": "Social Democrat"
        },
        "language": "ZH",
        "model_preference": "auto",  # auto | fast | quality | balanced
        "user_id": "user123",  # 用于成本追踪
        "use_cache": true
    }
    """
    try:
        data = request.json

        # 提取参数
        message = data.get('message')
        mode = data.get('mode', 'default')
        user_context = data.get('user_context')
        language = data.get('language', 'ZH')
        model_preference = data.get('model_preference', 'auto')
        user_id = data.get('user_id')
        use_cache = data.get('use_cache', True)

        # 验证
        if not message:
            return jsonify({
                "success": False,
                "error": "Message is required"
            }), 400

        # 生成缓存键
        cache_key = None
        if use_cache and mode in ['default', 'multi']:
            cache_key = cache_service.generate_cache_key(
                message,
                mode,
                user_context
            )

            # 尝试从缓存获取
            cached_result = await cache_service.get(cache_key)
            if cached_result:
                # 缓存命中
                cached_result['from_cache'] = True
                return jsonify({
                    "success": True,
                    "data": cached_result
                })

        # 预算检查
        if user_id:
            estimated_cost = cost_service.estimate_cost(mode, len(message))
            can_proceed, error_msg = await cost_service.check_budget(
                user_id,
                estimated_cost
            )

            if not can_proceed:
                return jsonify({
                    "success": False,
                    "error": error_msg,
                    "code": "BUDGET_EXCEEDED"
                }), 403

        # 调用 Ember 服务
        result = ember_service.chat(
            message=message,
            mode=mode,
            user_context=user_context,
            language=language,
            model_preference=model_preference
        )

        if not result.get('success'):
            return jsonify({
                "success": False,
                "error": result.get('error', 'Unknown error'),
                "data": result
            }), 500

        # 记录成本
        if user_id and result.get('cost'):
            await cost_service.record_usage(
                user_id=user_id,
                cost=result['cost'],
                metadata={
                    "model": result.get('model_used'),
                    "mode": mode,
                    "tokens": result.get('tokens'),
                    "execution_time": result.get('execution_time')
                }
            )

        # 写入缓存
        if cache_key and result.get('success'):
            await cache_service.set(cache_key, result)

        # 添加标记
        result['from_cache'] = False

        return jsonify({
            "success": True,
            "data": result
        })

    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


@app.route('/cost/stats', methods=['GET'])
@async_route
async def get_cost_stats():
    """
    获取成本统计

    参数:
    - user_id: 用户 ID (required)
    - period: today | week | month | all (default: today)
    """
    try:
        user_id = request.args.get('user_id')
        period = request.args.get('period', 'today')

        if not user_id:
            return jsonify({
                "success": False,
                "error": "user_id is required"
            }), 400

        stats = await cost_service.get_usage_stats(user_id, period)

        return jsonify({
            "success": True,
            "data": stats
        })

    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


@app.route('/cost/record', methods=['POST'])
@async_route
async def record_cost():
    """
    记录 Agent Mode 的成本使用

    前端只传递 tokens，由 cost_service.py 的 calculate_cost_from_tokens() 统一计算

    请求体:
    {
        "user_id": "string",
        "model": "string",
        "mode": "agent",
        "tokens": {"prompt": int, "completion": int, "total": int},
        "execution_time": float (optional)
    }
    """
    try:
        data = request.get_json()
        user_id = data.get('user_id')
        model = data.get('model', 'claude-sonnet-4-5-20250929')
        mode = data.get('mode', 'agent')
        tokens = data.get('tokens', {})
        execution_time = data.get('execution_time', 0)

        if not user_id or not tokens:
            return jsonify({
                "success": False,
                "error": "user_id and tokens are required"
            }), 400

        # 使用 cost_service.py 的 calculate_cost_from_tokens() 计算成本（统一定价逻辑）
        calculated_cost = cost_service.calculate_cost_from_tokens(model, tokens)

        # 使用 cost_service.py 的 record_usage() 记录到 Firebase
        # 数据格式匹配 ember_cost_sessions collection
        await cost_service.record_usage(
            user_id=user_id,
            cost=calculated_cost,
            metadata={
                "model": model,
                "mode": mode,
                "tokens": tokens,
                "execution_time": execution_time
            }
        )

        return jsonify({
            "success": True,
            "cost": calculated_cost,
            "tokens": tokens,
            "message": "Cost calculated and recorded via cost_service.py"
        })

    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


@app.route('/cache/stats', methods=['GET'])
@async_route
async def get_cache_stats():
    """获取缓存统计"""
    try:
        stats = await cache_service.get_cache_stats()

        return jsonify({
            "success": True,
            "data": stats
        })

    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


@app.route('/cache/clear', methods=['POST'])
@async_route
async def clear_cache():
    """清除缓存"""
    try:
        data = request.json
        user_id = data.get('user_id')

        if user_id:
            count = await cache_service.clear_user_cache(user_id)
        else:
            # 清除所有缓存
            count = await cache_service.clear_user_cache("all")

        return jsonify({
            "success": True,
            "message": f"Cleared {count} cache entries"
        })

    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


@app.route('/monitoring/metrics', methods=['GET'])
@async_route
async def get_metrics():
    """获取监控指标"""
    try:
        metric_type = request.args.get('type', 'latency')
        period = request.args.get('period', 'hour')

        metrics = await monitoring_service.get_metrics(metric_type, period)

        return jsonify({
            "success": True,
            "data": metrics
        })

    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


@app.route('/alerts', methods=['GET'])
@async_route
async def get_alerts():
    """获取活跃告警"""
    try:
        alerts = await alert_service.get_active_alerts()

        return jsonify({
            "success": True,
            "data": {
                "alerts": alerts,
                "count": len(alerts)
            }
        })

    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


@app.route('/optimize', methods=['POST'])
def optimize_suggestion():
    """获取成本优化建议"""
    try:
        data = request.json
        message = data.get('message')
        current_mode = data.get('mode', 'default')

        suggested_mode, reason, savings = cost_optimizer.optimize_mode_selection(
            current_mode,
            message
        )

        return jsonify({
            "success": True,
            "data": {
                "suggested_mode": suggested_mode,
                "current_mode": current_mode,
                "reason": reason,
                "estimated_savings_percent": savings
            }
        })

    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


# Cloud Functions 入口点 - 必须是函数
def ember_api(request):
    """
    Cloud Functions HTTP 入口点

    Args:
        request: Flask request object

    Returns:
        Flask response
    """
    with app.request_context(request.environ):
        return app.full_dispatch_request()


# 启动时预热系统（Flask 3.0 移除了 before_first_request）
# 改用模块级初始化
print("🚀 Ember API 正在启动...")
# 注意: 预热会在模块加载时执行
# asyncio.run(warmup_on_startup())
print("✅ Ember API 已就绪")


if __name__ == '__main__':
    # 本地测试
    import os
    port = int(os.environ.get('PORT', 8080))
    print(f"🔥 启动服务器在端口 {port}...")
    app.run(debug=True, host='0.0.0.0', port=port)
