# Ember AI Chat 完整部署指南（后端+前端）

**文档编号**: 62
**创建日期**: 2026-01-24
**类型**: 完整部署指南
**状态**: ✅ 就绪

---

## 📋 项目完整架构

### 双项目架构

| 组件 | 项目 ID | 项目编号 | 部署方式 |
|------|---------|---------|---------|
| **后端 API** | stanseproject | 626045766180 | Cloud Function (Gen2) |
| **前端应用** | gen-lang-client-0960644135 | - | Cloud Run (Docker) |
| **Secret Manager** | gen-lang-client-0960644135 | - | 存储 API Keys |
| **Firestore** | stanseproject | - | 数据存储 |

### 数据流

```
用户浏览器
    ↓ HTTPS
Cloud Run (前端) - gen-lang-client-0960644135
    ↓ API 调用
Cloud Function (后端) - stanseproject
    ↓ 跨项目访问
Secret Manager - gen-lang-client-0960644135
    ↓ 读取 API Keys
    ├─ ember-openai-api-key
    ├─ ember-google-api-key
    └─ ember-anthropic-api-key
    ↓ 调用
LLM APIs (OpenAI, Google, Anthropic)
```

---

## 🚀 一键完整部署

### 方式 1: 自动化部署（推荐）

**一条命令，部署后端和前端**:

```bash
cd /Users/xuling/code/Stanse/functions/ember-api
./deploy.sh

# 执行流程:
# 1. 配置跨项目 Secret Manager 权限
# 2. 部署后端 Cloud Function 到 stanseproject
# 3. 询问是否部署前端
# 4. 输入 'y' → 自动部署前端到 gen-lang-client-0960644135
# 5. 显示完整的部署结果
```

**交互提示**:
```
🧪 步骤 6/6: 验证部署...
   ✅ 健康检查通过

是否同时部署前端到 Cloud Run? (y/n): y  ← 输入 y

📦 步骤 7/8: 部署前端...
🔄 切换到前端项目: gen-lang-client-0960644135
📝 更新 cloudbuild.yaml 中的 Ember API URL...
🚀 触发 Cloud Build 部署前端...
   这将构建 Docker 镜像并部署到 Cloud Run
   预计需要 3-5 分钟...

[Cloud Build 输出...]

✅ 前端 Cloud Run (gen-lang-client-0960644135):
   https://stanse-xxx-uc.a.run.app
```

**总耗时**: 6-10 分钟（后端 3-5分钟 + 前端 3-5分钟）

---

### 方式 2: 分步部署

#### 步骤 1: 仅部署后端

```bash
cd /Users/xuling/code/Stanse/functions/ember-api
./deploy.sh

# 当询问是否部署前端时，输入 'n'
```

#### 步骤 2: 手动部署前端

```bash
cd /Users/xuling/code/Stanse

# 确保 cloudbuild.yaml 中的 EMBER_API_URL 正确
# （deploy.sh 会提示实际的 Function URL）

# 手动触发 Cloud Build
gcloud builds submit \
  --config=cloudbuild.yaml \
  --project=gen-lang-client-0960644135
```

---

## 📝 部署前检查清单

### 必需配置

- [x] ✅ Secret Manager 有 3 个 API keys (已完成)
  ```bash
  gcloud secrets list --project=gen-lang-client-0960644135 | grep ember
  # ember-openai-api-key
  # ember-google-api-key
  # ember-anthropic-api-key
  ```

- [x] ✅ gcloud CLI 已登录
  ```bash
  gcloud auth list
  ```

- [x] ✅ 有两个项目的访问权限
  ```bash
  gcloud projects list | grep -E "(stanseproject|gen-lang-client)"
  ```

- [ ] ⚠️ stanseproject 已启用 Cloud Functions API
  ```bash
  gcloud services enable cloudfunctions.googleapis.com --project=stanseproject
  ```

- [ ] ⚠️ gen-lang-client-0960644135 已启用 Cloud Build API
  ```bash
  gcloud services enable cloudbuild.googleapis.com --project=gen-lang-client-0960644135
  gcloud services enable run.googleapis.com --project=gen-lang-client-0960644135
  ```

### 代码准备

- [x] ✅ 后端代码完整 (19个文件)
- [x] ✅ 前端组件完整 (4个文件)
- [x] ✅ App.tsx 已修改（使用 EmberAIChatSidebar）
- [x] ✅ Dockerfile 已更新（包含 NEXT_PUBLIC_EMBER_API_URL）
- [x] ✅ cloudbuild.yaml 已更新（包含 EMBER_API_URL）
- [x] ✅ secret_manager.py 支持跨项目访问

---

## 🔧 部署配置详解

### 后端 Cloud Function 配置

**部署到**: stanseproject (626045766180)

```yaml
Runtime: Python 3.12
Memory: 2 GiB
Timeout: 300s (5分钟)
Max instances: 10
Min instances: 0
Region: us-central1
Entry point: ember_api
Trigger: HTTP
Authentication: 允许未认证访问
```

**环境变量**:
```bash
SECRET_MANAGER_PROJECT_ID=gen-lang-client-0960644135
```

**Service Account**:
```
stanseproject@appspot.gserviceaccount.com
```

**跨项目权限** (自动配置):
```bash
# stanseproject 的 SA 访问 gen-lang-client-0960644135 的 Secret Manager
gcloud secrets add-iam-policy-binding ember-openai-api-key \
  --member="serviceAccount:stanseproject@appspot.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor" \
  --project=gen-lang-client-0960644135
# (对所有 3 个 secrets 都配置)
```

---

### 前端 Cloud Run 配置

**部署到**: gen-lang-client-0960644135

**使用**: cloudbuild.yaml

```yaml
步骤 1: 获取 Secret Manager 中的 API keys
  - gemini-api-key
  - polygon-api-key

步骤 2: 构建 Docker 镜像
  - 使用 Dockerfile
  - Build Args:
    - GEMINI_API_KEY (从 Secret Manager)
    - POLYGON_API_KEY (从 Secret Manager)
    - NEXT_PUBLIC_EMBER_API_URL (从后端部署获取)

步骤 3: 推送到 Container Registry
  - gcr.io/gen-lang-client-0960644135/stanse:latest

步骤 4: 部署到 Cloud Run
  - 服务名: stanse
  - Region: us-central1
  - 允许未认证访问
```

**关键**: `NEXT_PUBLIC_EMBER_API_URL` 会在构建时注入到前端代码中

---

## 📊 完整部署流程图

```
执行 ./deploy.sh
    │
    ▼
步骤 1: 检查 gcloud 配置 ✓
    │
    ▼
步骤 2: 配置 Secret Manager 跨项目权限 ✓
    │
    ▼
步骤 3: 准备后端部署文件 (ember-api + ember-main) ✓
    │
    ▼
步骤 4: 部署 Cloud Function 到 stanseproject ✓
    │ (等待 3-5 分钟)
    │
    ▼
步骤 5: 获取 Function URL ✓
    │
    ▼
步骤 6: 健康检查验证 ✓
    │
    ▼
询问: 是否部署前端? (y/n)
    │
    ├─ 输入 'n' → 仅后端部署完成
    │                （提供手动部署指引）
    │
    └─ 输入 'y' ─────┐
                    ▼
                步骤 7: 部署前端
                    │
                    ├─ 切换到 gen-lang-client-0960644135
                    ├─ 更新 cloudbuild.yaml
                    ├─ 触发 Cloud Build
                    │  (等待 3-5 分钟)
                    └─ 获取 Cloud Run URL
                    │
                    ▼
                步骤 8: 显示完整部署结果
                    │
                    ▼
                前后端全部部署完成！
```

---

## 🧪 部署后验证

### 验证后端 Cloud Function

```bash
# 获取 Function URL（从部署输出中复制）
FUNCTION_URL="https://us-central1-stanseproject.cloudfunctions.net/ember_api"

# 1. 健康检查
curl $FUNCTION_URL/health
# 应返回: {"status": "healthy", ...}

# 2. 测试 Default 模式
curl -X POST $FUNCTION_URL/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "你好", "mode": "default"}'

# 3. 查看日志
gcloud functions logs read ember_api \
  --region us-central1 \
  --project stanseproject \
  --limit 20
```

### 验证前端 Cloud Run

**浏览器访问**: Cloud Run URL（从部署输出中获取）

**在浏览器 Console 中运行**:

```javascript
// 1. 快速验证所有功能
window.testEmberAPI.testAll()

// 2. 测试 Default 模式
window.testEmberAPI.defaultMode("你好")

// 3. 测试 Multi 模式
window.testEmberAPI.multiMode("AI是什么?")

// 4. 查看成本统计
window.testEmberAPI.costStats("your-user-id", "today")
```

---

## 🔍 故障排查

### 问题 1: 后端部署失败 "Permission denied"

**症状**: Secret Manager 权限错误

**解决**:
```bash
# 手动配置权限
gcloud secrets add-iam-policy-binding ember-openai-api-key \
  --member="serviceAccount:stanseproject@appspot.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor" \
  --project=gen-lang-client-0960644135

# 对所有 3 个 secrets 执行
```

### 问题 2: 前端构建失败

**症状**: Cloud Build 报错

**检查**:
```bash
# 查看 Cloud Build 日志
gcloud builds list --project=gen-lang-client-0960644135 --limit 5

# 查看最新构建的详细日志
gcloud builds log $(gcloud builds list --project=gen-lang-client-0960644135 --limit 1 --format="value(id)")
```

**常见原因**:
- Dockerfile 语法错误
- cloudbuild.yaml 格式错误
- Secret Manager 访问权限问题

### 问题 3: 前端无法连接后端

**症状**: 浏览器 Console 显示网络错误

**检查**:
1. 前端环境变量是否正确设置
   ```bash
   # 在构建日志中查找
   grep "NEXT_PUBLIC_EMBER_API_URL" /path/to/build/log
   ```

2. 后端 CORS 是否配置
   ```python
   # main.py 已配置
   CORS(app)
   ```

3. 后端是否允许未认证访问
   ```bash
   gcloud functions describe ember_api \
     --region us-central1 \
     --project stanseproject \
     --format="value(httpsTrigger.securityLevel)"
   ```

---

## 💰 生产环境成本估算

### 后端成本（Cloud Function）

**假设**: 1000 用户 × 10 次/天 = 10K 请求/天 = 300K 请求/月

```
调用费用:
  300K × $0.40/百万 = $0.12

计算时间费用:
  300K × 3秒 × 2GiB = 1.8M GiB-秒
  1.8M × $0.0000025 = $4.50

网络费用:
  约 $0.12

小计: ~$5/月
```

### 前端成本（Cloud Run）

```
容器实例费用:
  假设平均 1 个实例运行 24/7
  1 × 730小时 × $0.024/小时 = $17.52

请求费用:
  300K × $0.40/百万 = $0.12

小计: ~$18/月
```

### Firestore 成本

```
写入: 300K × $0.18/10万 = $0.54
读取: 300K × $0.06/10万 = $0.18
存储: 5GB × $0.18 = $0.90

小计: ~$2/月
```

### Secret Manager 成本

```
访问: 300K × $0.03/10K = $0.90

小计: ~$1/月
```

### LLM API 成本（主要成本）

```
Default (70%): 210K × $0.0009 = $189
Multi (20%): 60K × $0.017 = $1020
Ensemble (10%): 30K × $0.013 = $390

小计: ~$1599/月
```

**月度总成本**: $5 + $18 + $2 + $1 + $1599 = **~$1625/月**

**优化后** (缓存 30% 命中率):
- LLM 成本: $1599 × 0.70 = $1119
- **总成本**: ~$1145/月

**单用户成本**: ~$1.15/月

---

## 📝 部署后配置清单

### 后端验证

```bash
# 1. 健康检查
curl https://us-central1-stanseproject.cloudfunctions.net/ember_api/health

# 2. 测试 4 种模式
curl -X POST .../chat -d '{"message":"测试","mode":"default"}'
curl -X POST .../chat -d '{"message":"测试","mode":"multi"}'
curl -X POST .../chat -d '{"message":"测试","mode":"ensemble"}'
curl -X POST .../chat -d '{"message":["Q1","Q2"],"mode":"batch"}'

# 3. 查看日志
gcloud functions logs read ember_api --project=stanseproject --limit 50
```

### 前端验证

**访问 Cloud Run URL**:

1. 登录应用
2. 点击 AI 聊天按钮
3. 确认看到:
   - ✅ "Powered by Ember AI"
   - ✅ 4 种模式选择器
   - ✅ 成本追踪器

4. 在 Console 运行:
   ```javascript
   window.testEmberAPI.testAll()
   ```

5. 测试所有 4 种模式:
   - ⚡ 快速问答
   - 👥 专家会诊
   - 🧠 深度分析
   - 📋 批量处理

---

## 🔄 更新部署

### 仅更新后端

```bash
cd /Users/xuling/code/Stanse/functions/ember-api

# 修改代码后...

# 重新部署（选择 'n' 跳过前端）
./deploy.sh
```

### 仅更新前端

```bash
cd /Users/xuling/code/Stanse

# 修改前端代码后...

# 重新构建并部署
gcloud builds submit \
  --config=cloudbuild.yaml \
  --project=gen-lang-client-0960644135
```

### 同时更新后端和前端

```bash
cd /Users/xuling/code/Stanse/functions/ember-api

# 修改代码后...

# 完整部署（选择 'y' 部署前端）
./deploy.sh
```

---

## 🎯 环境变量传递链

### 构建时变量传递

```
deploy.sh (获取 Function URL)
    ↓ 传递
cloudbuild.yaml (--build-arg NEXT_PUBLIC_EMBER_API_URL=$FUNCTION_URL)
    ↓ 传递
Dockerfile (ARG NEXT_PUBLIC_EMBER_API_URL)
    ↓ 写入
.env 文件 (NEXT_PUBLIC_EMBER_API_URL=...)
    ↓ 构建时读取
Vite/React (import.meta.env.NEXT_PUBLIC_EMBER_API_URL)
    ↓ 编译进
前端代码 (硬编码在 JS bundle 中)
    ↓ 运行时使用
EmberAIChatSidebar.tsx (const EMBER_API_URL = process.env.NEXT_PUBLIC_EMBER_API_URL)
```

**关键**: 前端的 Ember API URL 在**构建时**注入，部署后不可修改

---

## 🔒 安全配置验证

### 跨项目 Secret Manager 访问

**配置** (deploy.sh 自动执行):

```bash
# Service Account: stanseproject@appspot.gserviceaccount.com
# 访问项目: gen-lang-client-0960644135
# 访问对象: ember-openai-api-key, ember-google-api-key, ember-anthropic-api-key
# 权限: roles/secretmanager.secretAccessor
```

**验证**:
```bash
# 查看权限
gcloud secrets get-iam-policy ember-openai-api-key \
  --project=gen-lang-client-0960644135

# 应包含:
# - members:
#   - serviceAccount:stanseproject@appspot.gserviceaccount.com
#   role: roles/secretmanager.secretAccessor
```

### API Keys 安全

✅ **前端**:
- 不包含任何 LLM API keys
- 只包含后端 API URL
- HTTPS 加密通信

✅ **后端**:
- API keys 从 Secret Manager 读取
- 不硬编码
- 不记录日志

✅ **Secret Manager**:
- 加密存储
- IAM 访问控制
- 审计日志

---

## 📚 完整文件清单

### 部署相关文件

```
/Users/xuling/code/Stanse/

【后端部署】
functions/ember-api/
├── deploy.sh                           ✅ 统一部署脚本（后端+前端）
├── main.py                             ✅ Flask 应用
├── requirements.txt                    ✅ Python 依赖
├── README.md                           ✅ API 文档
└── services/ (9个服务)                 ✅ 核心功能

【前端部署】
├── Dockerfile                          ✅ 包含 EMBER_API_URL
├── cloudbuild.yaml                     ✅ 包含 EMBER_API_URL
├── nginx.conf                          ✅ Nginx 配置
├── package.json                        ✅ 前端依赖
└── vite.config.ts                      ✅ Vite 配置

【前端代码】
├── App.tsx                             ✅ 集成 EmberAIChatSidebar
├── components/ai-chat/
│   ├── EmberAIChatSidebar.tsx          ✅ 主聊天界面
│   ├── ChatModeSelector.tsx            ✅ 模式选择器
│   ├── CostTracker.tsx                 ✅ 成本追踪
│   └── CostDashboard.tsx               ✅ 成本仪表板
└── utils/
    └── testEmberAPI.ts                 ✅ 浏览器测试工具
```

---

## ✅ 部署完成验证清单

### 后端验证 (stanseproject)

- [ ] Cloud Function 部署成功
- [ ] 健康检查返回 healthy
- [ ] Default 模式工作正常
- [ ] Multi 模式返回 3 个答案
- [ ] Ensemble 模式返回候选+最终答案
- [ ] Secret Manager 权限正确
- [ ] 日志无权限错误
- [ ] 无 API key 泄露

### 前端验证 (gen-lang-client-0960644135)

- [ ] Cloud Run 部署成功
- [ ] 前端页面可访问
- [ ] AI 聊天按钮可见
- [ ] 聊天界面打开
- [ ] "Powered by Ember AI" 显示
- [ ] 4 种模式可选择
- [ ] 成本追踪器显示
- [ ] Console 测试工具可用 (window.testEmberAPI)

### 端到端验证

- [ ] 前端发送消息，后端正确响应
- [ ] 成本追踪器实时更新
- [ ] 用户画像正确传递
- [ ] 多语言切换正常
- [ ] 无 CORS 错误
- [ ] 无 401/403 错误

---

## 🎯 一键部署命令总结

```bash
# 进入部署目录
cd /Users/xuling/code/Stanse/functions/ember-api

# 执行部署（会询问是否部署前端）
./deploy.sh

# 输入 'y' → 部署后端 + 前端
# 输入 'n' → 仅部署后端
```

**就这一条命令，完成所有部署！**

---

## 📖 相关文档

- [58_ai_chat_ember_integration_architecture_design.md](58_ai_chat_ember_integration_architecture_design_2026_01_24.md) - 架构设计
- [59_ember_ai_chat_implementation_complete.md](59_ember_ai_chat_implementation_complete_2026_01_24.md) - 实施记录
- [60_ember_implementation_checklist.md](60_ember_implementation_checklist_2026_01_24.md) - 功能清单
- [61_ember_production_deployment_guide.md](61_ember_production_deployment_guide_2026_01_24.md) - 生产部署

---

## ✅ 最终确认

**一个 deploy.sh 完成所有部署**:

✅ **后端部署** (stanseproject):
- Cloud Function
- Secret Manager 跨项目配置
- 健康检查验证

✅ **前端部署** (gen-lang-client-0960644135):
- Cloud Build 触发
- Docker 镜像构建
- Cloud Run 部署
- Ember API URL 自动注入

✅ **完整验证**:
- 后端健康检查
- 前端访问测试
- 端到端功能验证

🟢 **生产就绪**
🚀 **执行 ./deploy.sh 即可完整部署**

---

**文档状态**: ✅ 完成
**部署方式**: 后端 + 前端统一部署
**脚本位置**: /Users/xuling/code/Stanse/functions/ember-api/deploy.sh
**最后更新**: 2026-01-24 23:40
