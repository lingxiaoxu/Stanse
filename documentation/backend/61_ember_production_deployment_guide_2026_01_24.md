# Ember API 生产环境部署完整指南

**文档编号**: 61
**创建日期**: 2026-01-24
**类型**: 生产部署指南
**状态**: ✅ 就绪

---

## 📋 项目架构说明

你的项目使用**两个 GCP 项目**：

| 项目 | Project ID | 用途 | 包含内容 |
|------|-----------|------|---------|
| **Firebase 项目** | stanseproject | 后端服务 | Cloud Functions, Firestore |
| **前端项目** | gen-lang-client-0960644135 | 前端+密钥 | Secret Manager, 前端部署 |

**关键**: Cloud Function 部署在 `stanseproject`，但需要访问 `gen-lang-client-0960644135` 的 Secret Manager

---

## 🚀 生产环境部署（是的，需要 Cloud Function）

### 为什么需要 Cloud Function？

**原因**:
1. **无服务器架构** - 自动扩展，无需管理服务器
2. **安全隔离** - API keys 在服务器端，前端不暴露
3. **成本优化** - 按使用付费，闲时零成本
4. **全球部署** - Google 全球基础设施
5. **自动监控** - Cloud Logging + Monitoring 集成

**替代方案对比**:

| 方案 | 优点 | 缺点 | 推荐 |
|------|------|------|------|
| **Cloud Function** | 无需管理，自动扩展 | 冷启动延迟 | ✅ **推荐** |
| Cloud Run | 更灵活，容器化 | 需要 Docker | ⚠️ 备选 |
| 本地服务器 | 完全控制 | 需要24/7运行，成本高 | ❌ 不推荐 |
| 前端直接调用 | 最简单 | **API keys 暴露** | ❌ **不安全** |

**结论**: 生产环境**必须使用 Cloud Function**（或 Cloud Run）来保护 API keys

---

## 📝 完整部署步骤

### 前置条件检查

```bash
# 1. 验证 gcloud 已登录
gcloud auth list

# 2. 验证项目访问权限
gcloud projects list | grep -E "(stanseproject|gen-lang-client)"

# 应显示两个项目:
# stanseproject
# gen-lang-client-0960644135

# 3. 验证 Secret Manager 中有 3 个 API keys
gcloud secrets list --project=gen-lang-client-0960644135 | grep ember

# 应显示:
# ember-openai-api-key
# ember-google-api-key
# ember-anthropic-api-key
```

✅ **如果全部通过，继续部署**

---

### 步骤 1: 配置跨项目访问权限（1分钟，仅需一次）

```bash
# Cloud Function 的 service account
FUNCTION_SA="stanseproject@appspot.gserviceaccount.com"

# 为每个 secret 授权访问权限（在 Secret Manager 项目中执行）
gcloud secrets add-iam-policy-binding ember-openai-api-key \
    --member="serviceAccount:${FUNCTION_SA}" \
    --role="roles/secretmanager.secretAccessor" \
    --project=gen-lang-client-0960644135

gcloud secrets add-iam-policy-binding ember-google-api-key \
    --member="serviceAccount:${FUNCTION_SA}" \
    --role="roles/secretmanager.secretAccessor" \
    --project=gen-lang-client-0960644135

gcloud secrets add-iam-policy-binding ember-anthropic-api-key \
    --member="serviceAccount:${FUNCTION_SA}" \
    --role="roles/secretmanager.secretAccessor" \
    --project=gen-lang-client-0960644135
```

**验证权限**:
```bash
gcloud secrets get-iam-policy ember-openai-api-key \
    --project=gen-lang-client-0960644135

# 应该看到 stanseproject@appspot.gserviceaccount.com 有 secretAccessor 角色
```

---

### 步骤 2: 部署 Cloud Function（3-5分钟）

```bash
# 进入部署目录
cd /Users/xuling/code/Stanse/functions/ember-api

# 赋予执行权限
chmod +x deploy-production.sh

# 执行部署
./deploy-production.sh

# 等待约 3-5 分钟...
# 部署脚本会自动:
# 1. 配置权限
# 2. 打包文件
# 3. 部署 Cloud Function
# 4. 验证部署
# 5. 显示 Function URL
```

**部署完成后会显示**:
```
═══════════════════════════════════════════════════════════════
                     部署成功！
═══════════════════════════════════════════════════════════════

📌 函数 URL:
   https://us-central1-stanseproject.cloudfunctions.net/ember_api

📋 测试命令:
   curl https://us-central1-stanseproject.cloudfunctions.net/ember_api/health

🔧 前端配置:
   在 .env.local 添加:
   NEXT_PUBLIC_EMBER_API_URL=https://us-central1-stanseproject.cloudfunctions.net/ember_api

═══════════════════════════════════════════════════════════════
```

**复制 Function URL**，下一步需要用到！

---

### 步骤 3: 配置前端环境变量（1分钟）

```bash
# 编辑 .env.local
nano /Users/xuling/code/Stanse/.env.local

# 替换为实际的 Function URL:
NEXT_PUBLIC_EMBER_API_URL=https://us-central1-stanseproject.cloudfunctions.net/ember_api

# 保存并退出（Ctrl+X, Y, Enter）
```

---

### 步骤 4: 验证部署（2分钟）

**测试后端**:
```bash
# 健康检查
curl https://us-central1-stanseproject.cloudfunctions.net/ember_api/health

# 应返回:
# {
#   "status": "healthy",
#   "service": "ember-api",
#   "version": "1.0.0",
#   "details": {...}
# }

# 测试 Default 模式
curl -X POST https://us-central1-stanseproject.cloudfunctions.net/ember_api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "你好",
    "mode": "default",
    "language": "ZH"
  }'

# 应返回 AI 的回答和成本信息
```

---

### 步骤 5: 启动前端测试（1分钟）

```bash
cd /Users/xuling/code/Stanse

# 重启前端开发服务器（如果已运行，先停止 Ctrl+C）
npm run dev

# 或
yarn dev
```

---

### 步骤 6: 浏览器完整测试（5分钟）

**在浏览器中** (http://localhost:3000):

1. ✅ 打开应用并登录
2. ✅ 点击右下角 AI 聊天按钮
3. ✅ 确认看到:
   - "Powered by Ember AI"
   - 模式选择器
   - 成本追踪器
4. ✅ 测试 Default 模式:
   - 输入: "你好"
   - 等待约 5-10秒
   - 确认收到回答
   - 成本追踪器显示 ~$0.0009
5. ✅ 测试 Multi 模式:
   - 切换到"专家会诊"
   - 输入: "AI是什么?"
   - 等待约 15-20秒
   - 确认看到 3 个 AI 的答案
6. ✅ 测试成本追踪:
   - 点击成本追踪器的 i 图标
   - 确认看到详细统计

---

## 🔧 部署配置详解

### Cloud Function 配置

**部署到**: `stanseproject`

**资源配置**:
```yaml
Runtime: Python 3.12
Memory: 2 GiB          # Ember + 模型需要较大内存
Timeout: 300s          # Ensemble 模式可能较慢
Max instances: 10      # 控制并发，避免成本爆炸
Min instances: 0       # 闲时零成本
Region: us-central1    # 美国中部
```

**环境变量**:
```bash
SECRET_MANAGER_PROJECT_ID=gen-lang-client-0960644135
```

**Service Account**:
```
stanseproject@appspot.gserviceaccount.com
```

**权限**:
- ✅ Firestore 读写（在 stanseproject）
- ✅ Secret Manager 读取（跨项目到 gen-lang-client-0960644135）

---

### Secret Manager 跨项目访问

**问题**: Cloud Function 在 `stanseproject`，但 Secret Manager 在 `gen-lang-client-0960644135`

**解决**: IAM 权限绑定

```bash
# 授权 stanseproject 的 service account 访问 gen-lang-client-0960644135 的 secrets

gcloud secrets add-iam-policy-binding ember-openai-api-key \
    --member="serviceAccount:stanseproject@appspot.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor" \
    --project=gen-lang-client-0960644135
```

**验证**:
```bash
gcloud secrets get-iam-policy ember-openai-api-key \
    --project=gen-lang-client-0960644135

# 应该看到:
# bindings:
# - members:
#   - serviceAccount:stanseproject@appspot.gserviceaccount.com
#   role: roles/secretmanager.secretAccessor
```

---

## 📊 部署后验证清单

### 后端验证

```bash
FUNCTION_URL="https://us-central1-stanseproject.cloudfunctions.net/ember_api"

# 1. 健康检查
curl $FUNCTION_URL/health

# 2. Secret Manager 访问
# (在 Cloud Logging 中查看，不应有权限错误)
gcloud logging read "resource.type=cloud_function AND resource.labels.function_name=ember_api" \
  --project=stanseproject \
  --limit 10

# 3. 测试 4 种模式
curl -X POST $FUNCTION_URL/chat -d '{"message": "测试", "mode": "default"}'
curl -X POST $FUNCTION_URL/chat -d '{"message": "测试", "mode": "multi"}'
curl -X POST $FUNCTION_URL/chat -d '{"message": "测试", "mode": "ensemble"}'
```

### 前端验证

- [ ] AI 聊天按钮可见
- [ ] 聊天界面打开
- [ ] 4 种模式可选择
- [ ] Default 模式正常工作
- [ ] Multi 模式显示 3 个答案
- [ ] Ensemble 模式显示候选
- [ ] 成本追踪器更新
- [ ] 无 CORS 错误
- [ ] 无 401/403 权限错误

---

## 🔍 故障排查

### 问题 1: "Permission denied" 访问 Secret Manager

**症状**: Cloud Function 日志显示 `Permission denied: Secret Manager`

**原因**: 跨项目权限未配置

**解决**:
```bash
# 重新配置权限
gcloud secrets add-iam-policy-binding ember-openai-api-key \
    --member="serviceAccount:stanseproject@appspot.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor" \
    --project=gen-lang-client-0960644135

# 对所有 3 个 secrets 都执行
```

### 问题 2: "Module 'ember' not found"

**症状**: Cloud Function 启动失败，日志显示 `No module named 'ember'`

**原因**: ember-main 未正确包含在部署包中

**解决**:
```bash
# 检查部署目录
ls -la /tmp/ember-api-deploy-*/ember-main

# 确保 ember-main 目录存在
# 重新运行部署脚本
./deploy-production.sh
```

### 问题 3: CORS 错误

**症状**: 前端显示 `CORS policy blocked`

**原因**: Cloud Function 未允许跨域

**解决**: 已在 main.py 中配置 `CORS(app)`，应该不会出现此问题

如果仍有问题:
```python
# main.py
CORS(app, resources={
    r"/*": {
        "origins": "*",  # 生产环境应限制为你的域名
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type"]
    }
})
```

### 问题 4: 成本过高

**症状**: Cloud Function 成本超出预期

**检查**:
```bash
# 查看调用次数
gcloud functions describe ember_api \
  --region us-central1 \
  --gen2 \
  --project=stanseproject \
  --format="value(serviceConfig.uri)"

# 查看日志（找到频繁调用）
gcloud logging read "resource.type=cloud_function" \
  --project=stanseproject \
  --limit 100
```

**优化**:
- 启用缓存（默认已启用）
- 减少 max-instances (改为 5)
- 设置用户预算限制

---

## 💰 生产环境成本估算

### Cloud Function 成本（月度）

假设 1000 个活跃用户，每人每天 10 次请求:

```
调用次数: 1000 × 10 × 30 = 300K 次/月

Cloud Function Gen2 定价:
  - 调用: $0.40 / 百万次 = $0.12
  - 计算时间: 300K × 3秒 × 2GiB = 1.8M GiB-秒
  - 计算成本: 1.8M × $0.0000025 = $4.50
  - 出站流量: ~1GB × $0.12 = $0.12

小计: ~$4.74/月
```

### Firestore 成本

```
写入: 300K 次 × $0.18/10万 = $0.54
读取: 300K 次 × $0.06/10万 = $0.18
存储: 5GB × $0.18 = $0.90

小计: ~$1.62/月
```

### Secret Manager 成本

```
访问: 300K 次 × $0.03/10K = $0.90

小计: ~$0.90/月
```

### LLM API 成本（主要成本）

```
假设模式分布:
  - default (70%): 210K × $0.0009 = $189
  - multi (20%): 60K × $0.017 = $1020
  - ensemble (10%): 30K × $0.013 = $390

小计: ~$1599/月
```

**月度总成本**: $4.74 + $1.62 + $0.90 + $1599 = **~$1606/月**

**优化后** (启用缓存，30% 命中率):
- LLM 成本: $1599 × 0.70 = $1119
- 总成本: ~$1126/月

**单用户成本**: ~$1.13/月

---

## 🎯 部署清单

### 部署前

- [x] ✅ Secret Manager 有 3 个 API keys
- [x] ✅ 跨项目权限配置完成
- [ ] ⚠️ 确认 Firebase 项目 (stanseproject) 已启用 Firestore
- [ ] ⚠️ 确认 Firebase 项目已启用 Cloud Functions
- [x] ✅ 部署脚本准备完成 (deploy-production.sh)

### 部署中

- [ ] 执行 ./deploy-production.sh
- [ ] 等待 3-5 分钟
- [ ] 记录 Function URL
- [ ] 验证 health check

### 部署后

- [ ] 更新 .env.local
- [ ] 重启前端服务器
- [ ] 测试所有 4 种模式
- [ ] 验证成本追踪
- [ ] 验证用户等级
- [ ] 检查 Cloud Logging

---

## 🔐 安全配置验证

### Secret Manager 权限链

```
Cloud Function (stanseproject)
    ↓ (需要访问)
Secret Manager (gen-lang-client-0960644135)
    ↓ (IAM 绑定)
stanseproject@appspot.gserviceaccount.com
    ↓ (角色)
roles/secretmanager.secretAccessor
    ↓ (读取)
ember-openai-api-key
ember-google-api-key
ember-anthropic-api-key
```

### Firestore 权限

```
Cloud Function (stanseproject)
    ↓ (自动访问)
Firestore (stanseproject)
    ↓ (默认权限)
stanseproject@appspot.gserviceaccount.com
    ↓ (读写)
user_chat_costs/{userId}/sessions
ember_cache
user_budgets
```

---

## 📋 生产环境vs本地开发对比

| 项目 | 本地开发 | 生产环境 |
|------|---------|---------|
| **后端** | Flask 本地服务器 (port 8080) | Cloud Function |
| **前端 API URL** | http://localhost:8080 | https://...cloudfunctions.net/ember_api |
| **Firebase 凭证** | service-account-key.json | 自动配置 |
| **部署** | 不需要 | 需要 (deploy-production.sh) |
| **成本** | 仅 LLM API | Cloud Function + LLM API |
| **适用场景** | 开发、调试 | 生产、用户使用 |
| **推荐** | ✅ 开发阶段 | ✅ 上线后 |

---

## 🚀 推荐的开发流程

### 阶段 1: 本地开发和测试

```bash
# 1. 下载 Firebase 凭证（一次性）
gcloud iam service-accounts keys create \
  /Users/xuling/code/Stanse/functions/ember-api/service-account-key.json \
  --iam-account=stanseproject@appspot.gserviceaccount.com \
  --project=stanseproject

# 2. 启动本地后端
cd /Users/xuling/code/Stanse/ember-main
export GOOGLE_APPLICATION_CREDENTIALS=/Users/xuling/code/Stanse/functions/ember-api/service-account-key.json
uv run python ../functions/ember-api/main.py

# 3. 配置前端使用本地 API
echo "NEXT_PUBLIC_EMBER_API_URL=http://localhost:8080" > .env.local

# 4. 启动前端
npm run dev

# 5. 测试所有功能
```

**优点**:
- 快速迭代
- 详细日志
- 无部署延迟

---

### 阶段 2: 部署到生产环境

**当满足以下条件时部署**:
- ✅ 本地测试全部通过
- ✅ 所有功能正常工作
- ✅ 准备给用户使用

```bash
# 1. 部署 Cloud Function
cd /Users/xuling/code/Stanse/functions/ember-api
./deploy-production.sh

# 2. 更新前端配置
echo "NEXT_PUBLIC_EMBER_API_URL=https://us-central1-stanseproject.cloudfunctions.net/ember_api" > .env.local

# 3. 重启前端
npm run dev

# 4. 验证生产环境
```

**优点**:
- 无需24/7运行服务器
- 自动扩展
- 全球低延迟
- 完整监控

---

## 📝 总结

### 本地开发（开发阶段）

**需要**:
- ✅ Firebase service account key
- ✅ 本地 Flask 服务器
- ✅ .env.local 指向 localhost:8080

**不需要**:
- ❌ Cloud Function 部署
- ❌ 等待部署时间

**命令**:
```bash
# 后端
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json
uv run python main.py

# 前端
npm run dev
```

---

### 生产部署（上线阶段）

**需要**:
- ✅ Cloud Function 部署
- ✅ 跨项目权限配置
- ✅ .env.local 指向 Cloud Function URL

**命令**:
```bash
# 部署
./deploy-production.sh

# 更新前端
echo "NEXT_PUBLIC_EMBER_API_URL=实际URL" > .env.local
```

**优点**:
- 无服务器，自动扩展
- API keys 安全（不暴露给前端）
- 完整监控和日志
- 全球低延迟

---

## ✅ 回答你的问题

**Q: dev server 测试需要 Cloud Function 部署吗？**
**A**: ❌ **不需要**！只需启动本地 Flask 服务器

**Q: production 部署需要 Cloud Function 吗？**
**A**: ✅ **需要**！生产环境必须使用 Cloud Function 来保护 API keys

**Q: 部署到哪个项目？**
**A**:
- Cloud Function → `stanseproject` (你的 Firebase 项目)
- Secret Manager → `gen-lang-client-0960644135` (已有 API keys)
- 需要配置跨项目访问权限

---

**下一步**: 想先本地测试还是直接部署到生产？