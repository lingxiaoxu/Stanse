# Ember API 快速开始指南

**文档编号**: 22
**创建日期**: 2026-01-24
**类型**: 快速入门
**预计阅读时间**: 5 分钟

---

## 🚀 快速部署（3步，5分钟完成）

### 步骤 1: 验证前置条件（1分钟）

```bash
# 检查 gcloud 配置
gcloud config get-value project
# 应显示: gen-lang-client-0960644135

# 检查 Secret Manager
gcloud secrets list --project=gen-lang-client-0960644135 | grep ember
# 应显示 3 个 secrets:
# ember-openai-api-key
# ember-google-api-key
# ember-anthropic-api-key

# 验证访问权限
gcloud secrets versions access latest --secret=ember-google-api-key --project=gen-lang-client-0960644135 | head -c 10
# 应返回: AIzaSyAP86...
```

✅ **如果全部通过，继续下一步**

### 步骤 2: 部署到 Cloud Function（3分钟）

```bash
# 进入目录
cd /Users/xuling/code/Stanse/functions/ember-api

# 赋予执行权限
chmod +x deploy.sh

# 执行部署
./deploy.sh

# 等待约 3-5 分钟...
# 部署完成后会显示 Function URL
```

### 步骤 3: 验证部署（1分钟）

```bash
# 替换为实际的 Function URL
FUNCTION_URL="https://us-central1-gen-lang-client-0960644135.cloudfunctions.net/ember_api"

# 健康检查
curl $FUNCTION_URL/health

# 应返回:
# {
#   "status": "healthy",
#   "service": "ember-api",
#   "version": "1.0.0"
# }
```

✅ **部署成功！**

---

## 🧪 快速功能测试

### 测试 Default 模式

```bash
curl -X POST $FUNCTION_URL/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "什么是AI? 一句话回答",
    "mode": "default",
    "language": "ZH"
  }'
```

### 测试 Multi 模式

```bash
curl -X POST $FUNCTION_URL/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "AI的未来发展方向?",
    "mode": "multi",
    "language": "ZH"
  }'
```

### 查看成本统计

```bash
curl "$FUNCTION_URL/cost/stats?user_id=test-user&period=today"
```

---

## ⚙️ 前端集成（3步）

### 步骤 1: 配置环境变量

```bash
# 编辑 .env.local
echo "NEXT_PUBLIC_EMBER_API_URL=$FUNCTION_URL" >> .env.local
```

### 步骤 2: 替换组件

在使用 AI Chat 的页面:

```typescript
// 原来
import { AIChatSidebar } from '../components/ai-chat/AIChatSidebar';

// 改为
import { EmberAIChatSidebar as AIChatSidebar } from '../components/ai-chat/EmberAIChatSidebar';
```

### 步骤 3: 重启并测试

```bash
# 重启开发服务器
npm run dev

# 或 yarn dev

# 打开浏览器测试 AI 聊天功能
```

---

## 🎯 4 种模式使用指南

### 模式 1: 快速问答 ⚡

**适合**: 日常简单问题（70% 场景）

- 成本: ~$0.001
- 速度: <2秒
- 示例: "什么是...?", "如何...?"

### 模式 2: 专家会诊 👥

**适合**: 需要多视角（20% 场景）

- 成本: ~$0.004
- 速度: 3-5秒
- 返回: 3个AI的不同观点
- 示例: "我应该...?", "哪个更好?"

### 模式 3: 深度分析 🧠

**适合**: 复杂重要问题（5% 场景）

- 成本: ~$0.018
- 速度: 8-12秒
- 返回: 综合答案 + 5个候选
- 示例: "分析...", "评价...", "深入探讨..."

### 模式 4: 批量处理 📋

**适合**: 多个问题（5% 场景）

- 成本: ~$0.0002/问题
- 速度: 2-5秒
- 示例: FAQ生成，批量咨询

---

## 📊 成本管理

### 实时成本显示

界面底部会显示:

```
💰 本次: $0.0015  |  今日: $0.12  |  本月: $3.45
████████░░ 12% (今日预算: $1.00)
```

### 用户等级和预算

| 等级 | 可用模式 | 每日请求 | 每日预算 |
|------|---------|---------|---------|
| FREE | default | 10次 | $0.10 |
| BASIC | default, multi | 100次 | $1.00 |
| PREMIUM | 全部（含 ensemble） | 500次 | $10.00 |
| ENTERPRISE | 全部（含 batch） | 无限 | 无限 |

---

## 🔍 常见问题

### Q: 如何切换模式？

A: 在聊天界面点击当前模式，会展开选择器，选择你需要的模式。

### Q: Multi 模式如何选择答案？

A: Multi 模式会显示 3 个 AI 的答案，你可以阅读对比，选择最认同的。

### Q: Ensemble 模式值得额外成本吗？

A: 对于重要问题（政治观点、重大决策），Ensemble 能提供最高质量和最全面的分析，物有所值。

### Q: 如何控制成本？

A:
1. 日常使用 default 模式
2. 启用缓存（默认开启）
3. 设置每日预算
4. 查看实时成本提示

### Q: 成本追踪准确吗？

A: 100% 准确。基于实际 Token 使用和官方定价计算。

---

## 📞 获取帮助

### 文档资源

- 架构设计: [58_ai_chat_ember_integration_architecture_design.md](../backend/58_ai_chat_ember_integration_architecture_design_2026_01_24.md)
- 实施记录: [59_ember_ai_chat_implementation_complete.md](../backend/59_ember_ai_chat_implementation_complete_2026_01_24.md)
- 功能清单: [60_ember_implementation_checklist.md](../backend/60_ember_implementation_checklist_2026_01_24.md)
- 完成总结: [21_ember_ai_chat_integration_final_summary.md](21_ember_ai_chat_integration_final_summary_2026_01_24.md)

### API 文档

- [functions/ember-api/README.md](../../functions/ember-api/README.md)

### 测试文件

- 功能测试: `ember-main/test_ember_api.py`
- 单元测试: `functions/ember-api/tests/test_unit.py`
- 性能测试: `functions/ember-api/tests/test_performance.py`
- 安全审计: `functions/ember-api/tests/test_security.py`

---

## ⏰ 时间线

- **部署**: 5 分钟
- **前端配置**: 2 分钟
- **验证测试**: 3 分钟
- **用户培训**: 5 分钟

**总计**: < 15 分钟从部署到可用

---

**快速开始指南版本**: 1.0.0
**最后更新**: 2026-01-24
**状态**: ✅ 完成
