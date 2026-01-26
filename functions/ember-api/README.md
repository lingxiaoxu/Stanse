# Ember API Cloud Function

基于 Ember AI 框架的聊天 API Cloud Function

## 架构

```
ember-api/
├── main.py                 # Flask 应用入口
├── services/
│   ├── ember_service.py    # Ember 核心服务（4种模式）
│   ├── cost_service.py     # 成本追踪服务
│   └── cache_service.py    # 缓存服务
├── requirements.txt        # Python 依赖
├── deploy.sh              # 部署脚本
└── README.md              # 本文档
```

## 功能特性

### 🎯 4 种聊天模式

1. **default** - 快速问答
   - 自动选择最优模型
   - 成本: ~$0.001
   - 速度: <2秒

2. **multi** - 多模型对比
   - 3个AI并行回答
   - 成本: ~$0.004
   - 速度: 3-5秒

3. **ensemble** - 深度分析
   - 6个AI协作 + Claude评判
   - 成本: ~$0.018
   - 速度: 8-12秒

4. **batch** - 批量处理
   - 并行处理多个问题
   - 成本: ~$0.0002/问题
   - 速度: 2-5秒

### 💰 成本追踪

- 实时 Token 使用统计
- 精确成本计算
- 用户预算管理
- 成本趋势分析

### ⚡ 性能优化

- 两级缓存（内存 + Firestore）
- 自动并行处理
- 智能模型选择
- JIT 编译优化（XCS）

### 🔒 安全性

- API keys 从 Secret Manager 读取
- 无硬编码凭证
- 用户数据加密
- 预算超支保护

## API 端点

### POST /chat

基础聊天接口

**请求体**:
```json
{
  "message": "用户问题",
  "mode": "default",
  "user_context": {
    "economic": -2.5,
    "social": 3.1,
    "diplomatic": 1.2,
    "label": "Social Democrat"
  },
  "language": "ZH",
  "model_preference": "auto",
  "user_id": "user123",
  "use_cache": true
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "answer": "AI的回答...",
    "cost": 0.0015,
    "tokens": {
      "prompt": 150,
      "completion": 300,
      "total": 450
    },
    "model_used": "gpt-4o",
    "mode": "default",
    "execution_time": 2.1,
    "from_cache": false
  }
}
```

### GET /cost/stats

获取成本统计

**参数**:
- `user_id` (required): 用户 ID
- `period` (optional): today | week | month | all

**响应**:
```json
{
  "success": true,
  "data": {
    "period": "today",
    "summary": {
      "total_cost": 0.125,
      "total_requests": 45,
      "total_tokens": 15000
    },
    "by_mode": {...},
    "by_model": {...}
  }
}
```

### GET /cache/stats

获取缓存统计

### POST /cache/clear

清除缓存

## 部署

### 前置条件

1. 安装 gcloud CLI
2. 配置项目: `gen-lang-client-0960644135`
3. Secret Manager 中已有3个 API keys:
   - `ember-openai-api-key`
   - `ember-google-api-key`
   - `ember-anthropic-api-key`

### 部署步骤

```bash
# 1. 进入目录
cd /Users/xuling/code/Stanse/functions/ember-api

# 2. 赋予执行权限
chmod +x deploy.sh

# 3. 执行部署
./deploy.sh
```

### 手动部署（如果脚本失败）

```bash
# 设置项目
gcloud config set project gen-lang-client-0960644135

# 部署 Cloud Function
gcloud functions deploy ember_api \
  --gen2 \
  --runtime python312 \
  --region us-central1 \
  --entry-point ember_api \
  --trigger-http \
  --allow-unauthenticated \
  --memory 2GiB \
  --timeout 300s \
  --max-instances 10

# 获取 URL
gcloud functions describe ember_api \
  --region us-central1 \
  --gen2 \
  --format="value(serviceConfig.uri)"
```

## 本地测试

```bash
# 安装依赖
pip install -r requirements.txt

# 设置环境变量（用于测试）
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json

# 运行本地服务器
python main.py
```

访问: http://localhost:8080/health

## 成本估算

假设每月1000个活跃用户:

| 项目 | 成本 |
|-----|------|
| Cloud Function (1M调用, 2GB内存) | ~$50 |
| Firestore (读100K, 写10K) | ~$10 |
| Secret Manager (访问100K次) | ~$0.06 |
| LLM API (基于使用量) | ~$1000-2000 |
| **总计** | ~$1060-2060/月 |

## 监控

- Cloud Logging: 查看日志
- Cloud Monitoring: 性能指标
- Cost Explorer: 成本分析

## 故障排查

### 问题: API Key 未找到

**解决方案**:
```bash
# 检查 Secret Manager
gcloud secrets list --project=gen-lang-client-0960644135 | grep ember

# 验证访问权限
gcloud secrets get-iam-policy ember-openai-api-key
```

### 问题: 部署超时

**解决方案**:
- 增加 `--timeout` 参数
- 检查网络连接
- 减小部署包大小

### 问题: 成本过高

**解决方案**:
- 启用缓存 (`use_cache: true`)
- 使用 default 模式而非 ensemble
- 设置用户预算限制

## 相关文档

- [架构设计文档](../../documentation/backend/58_ai_chat_ember_integration_architecture_design_2026_01_24.md)
- [Ember 集成文档](../../documentation/backend/57_ember_secret_manager_integration_2026_01_24.md)
- [API Key 安全指南](../../documentation/backend/28_api_key_security_guide.md)
