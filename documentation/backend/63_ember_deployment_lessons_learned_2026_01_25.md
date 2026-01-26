# Ember 部署经验总结和最终配置

**文档编号**: 63
**创建日期**: 2026-01-25
**类型**: 部署经验总结
**状态**: ✅ 已部署成功

---

## 🎉 部署成功确认

**后端 API**: https://ember-api-yfcontxnkq-uc.a.run.app ✅
**前端应用**: https://stanse-837715360412.us-central1.run.app ✅
**项目**: gen-lang-client-0960644135
**部署时间**: 2026-01-25 01:08 - 01:16

---

## 📚 部署过程中遇到的问题和解决方案

### 问题 1: 项目架构混淆 ❌ → ✅

**初始错误理解**:
- Cloud Function → stanseproject
- Secret Manager → gen-lang-client-0960644135
- 需要跨项目访问

**实际正确架构**:
- **所有服务 → gen-lang-client-0960644135**
- 同项目部署，无需跨项目权限

**教训**: 一开始就要明确项目架构！

---

### 问题 2: ModuleNotFoundError: No module named 'ember' ❌ → ✅

**错误**: 容器启动时找不到 ember 模块

**原因**: ember-main/src 路径配置不正确

**解决方案**:
```python
# services/ember_service.py

# 支持 Cloud Function 和本地环境
ember_paths_to_try = [
    Path("/workspace/ember-main/src"),  # Cloud Function
    Path(__file__).parent.parent.parent.parent / "ember-main" / "src",  # 本地
]

for ember_path in ember_paths_to_try:
    if ember_path.exists():
        sys.path.insert(0, str(ember_path))
        break
```

**关键**: Cloud Function 的工作目录是 `/workspace`

---

### 问题 3: ModuleNotFoundError: No module named 'equinox' ❌ → ✅

**错误**: 缺少 Ember 核心依赖

**原因**: requirements.txt 过于精简，缺少必要依赖

**解决方案**: 添加完整 Ember 依赖
```txt
# requirements.txt
jax>=0.4.0
jaxlib>=0.4.0
equinox>=0.12.2
optax>=0.2.5
tiktoken>=0.7.0
httpx>=0.25.2
aiohttp>=3.9.5
```

**教训**: 虽然这些包很大，但它们是 Ember 运行的**必需依赖**

---

### 问题 4: cannot import name 'instance' ❌ → ✅

**错误**: 从 ember.api.models 导入不存在的 instance

**原因**: ember.api.models 只导出 `models` 对象，instance 是 models 的方法

**解决方案**:
```python
# 错误：
from ember.api.models import models, instance, response

# 正确：
from ember.api.models import models
# 然后使用: models.instance(), models.response()
```

---

### 问题 5: Flask before_first_request 错误 ❌ → ✅

**错误**: `AttributeError: 'Flask' object has no attribute 'before_first_request'`

**原因**: Flask 3.0 已移除 `@app.before_first_request` 装饰器

**解决方案**: 移除装饰器，改用模块级初始化
```python
# 错误：
@app.before_first_request
def startup():
    ...

# 正确：
print("🚀 Ember API 正在启动...")
```

---

### 问题 6: InvalidTargetTypeException ❌ → ✅

**错误**: `ember_api` 需要是函数，不能是 Flask app

**原因**: 最初设置为 `ember_api = app`

**解决方案**:
```python
# 错误：
ember_api = app

# 正确：
def ember_api(request):
    with app.request_context(request.environ):
        return app.full_dispatch_request()
```

**关键**: Cloud Functions 入口点必须是**函数**，不能是对象

---

### 问题 7: .gcloudignore 覆盖 ❌ → ✅

**错误**: 创建新的 .gcloudignore，丢失项目根目录的配置

**解决方案**:
```bash
# 步骤 3 中
if [ -f "../../.gcloudignore" ]; then
    cp ../../.gcloudignore $DEPLOY_DIR/.gcloudignore
    # 追加 ember-api 特定规则
    cat >> $DEPLOY_DIR/.gcloudignore << 'EOF'
# Ember API 特定排除
__pycache__/
*.pyc
tests/
service-account-key.json
ember-main/.venv
EOF
fi
```

**教训**: 基于现有配置扩展，不要重新创建

---

## ✅ 最终优化的 deploy.sh

### 关键配置

```bash
# 项目配置（单一项目）
PROJECT_ID="gen-lang-client-0960644135"
REGION="us-central1"
FUNCTION_NAME="ember_api"

# 所有服务在同项目
FUNCTION_PROJECT_ID="$PROJECT_ID"
SECRET_PROJECT_ID="$PROJECT_ID"
FRONTEND_PROJECT_ID="$PROJECT_ID"
```

### 部署流程（6+2步）

1. ✅ 检查 gcloud 配置
2. ✅ 配置权限（同项目，自动）
3. ✅ 准备部署文件（ember-api + ember-main + .gcloudignore）
4. ✅ 部署 Cloud Function
5. ✅ 获取 Function URL
6. ✅ 健康检查验证
7. ✅ (可选) 部署前端 Cloud Run
8. ✅ (可选) 获取前端 URL

### 关键改进

**基于部署经验的改进**:

1. **简化权限配置** - 同项目部署，跳过 IAM 配置
2. **保留项目 .gcloudignore** - 基于根目录扩展，不覆盖
3. **完整依赖** - requirements.txt 包含所有 Ember 需要的包
4. **正确入口点** - ember_api 作为函数，不是对象
5. **路径兼容** - 支持 /workspace 和本地路径
6. **前端集成** - 自动询问是否部署前端
7. **详细输出** - 每步骤清晰说明和验证

---

## 📝 requirements.txt 最终版本

```txt
# Functions Framework for Cloud Functions Gen2
functions-framework==3.*

# Flask for API
flask==3.0.0
flask-cors==4.0.0

# Firebase
firebase-admin==6.8.0

# Google Cloud Secret Manager
google-cloud-secret-manager>=2.16.0

# LLM 提供商 SDKs（Ember 核心需要）
openai>=2.6.0
anthropic>=0.55.0
google-generativeai>=0.8.5

# Ember 核心依赖（必需，不能删除）
jax>=0.4.0
jaxlib>=0.4.0
equinox>=0.12.2
optax>=0.2.5
pydantic>=2.11.7
pydantic-settings>=2.10.1
pyyaml>=6.0.1
numpy>=2.1.0
tiktoken>=0.7.0
httpx>=0.25.2
aiohttp>=3.9.5

# 工具库
tenacity>=9.1.2
```

**关键**: 所有依赖都是必需的，虽然包大但不能省略

---

## 🔧 main.py 关键配置

### 正确的入口点

```python
# Cloud Functions 入口点 - 必须是函数
def ember_api(request):
    """Cloud Functions HTTP 入口点"""
    with app.request_context(request.environ):
        return app.full_dispatch_request()
```

### 移除 Flask 3.0 不支持的装饰器

```python
# Flask 3.0 移除了 before_first_request
# 改用模块级初始化
print("🚀 Ember API 正在启动...")
print("✅ Ember API 已就绪")

# 不要使用：
# @app.before_first_request  # Flask 3.0 已移除
```

---

## 📦 ember_service.py 路径配置

```python
# 支持 Cloud Function 和本地环境
ember_paths_to_try = [
    Path("/workspace/ember-main/src"),  # Cloud Function 环境
    Path(__file__).parent.parent.parent.parent / "ember-main" / "src",  # 本地
]

ember_loaded = False
for ember_path in ember_paths_to_try:
    if ember_path.exists():
        sys.path.insert(0, str(ember_path))
        ember_loaded = True
        break

if not ember_loaded:
    raise ImportError(f"无法找到 ember-main")

# 直接导入 models，避免触发整个 ember.api 的加载
from ember.api.models import models
```

**关键**:
- 必须支持两种路径
- 直接导入 `ember.api.models`，不要导入 `ember.api`（会触发 xcs 等加载）

---

## 🎯 部署验证清单

### 后端验证 ✅

```bash
# 1. 健康检查
curl https://ember-api-yfcontxnkq-uc.a.run.app/health
# 预期: {"status":"healthy"...}

# 2. Default 模式
curl -X POST https://ember-api-yfcontxnkq-uc.a.run.app/chat \
  -d '{"message":"你好","mode":"default"}'
# 预期: 返回 AI 回答和成本

# 3. 查看日志
gcloud functions logs read ember_api --project=gen-lang-client-0960644135 --limit 20
# 预期: 无错误，无 API key 泄露
```

### 前端验证 ✅

```
1. 访问 https://stanse-837715360412.us-central1.run.app
2. 登录
3. 打开 AI 聊天
4. Console: window.testEmberAPI.testAll()
5. 测试所有 4 种模式
```

---

## 💡 未来部署建议

### 每次部署前

```bash
# 1. 确认项目
gcloud config get-value project
# 应显示: gen-lang-client-0960644135

# 2. 确认 Secret Manager
gcloud secrets list --project=gen-lang-client-0960644135 | grep ember
# 应显示 3 个 secrets

# 3. 测试本地代码
cd /Users/xuling/code/Stanse/ember-main
uv run python test_ember_api.py
# 确保本地测试通过
```

### 部署命令

```bash
cd /Users/xuling/code/Stanse/functions/ember-api
./deploy.sh

# 询问部署前端时:
# - 输入 'y' → 完整部署（后端+前端）
# - 输入 'n' → 仅部署后端
```

### 部署后

```bash
# 1. 验证后端
curl https://ember-api-yfcontxnkq-uc.a.run.app/health

# 2. 验证前端
curl https://stanse-837715360412.us-central1.run.app

# 3. 浏览器测试
# 访问前端，Console 运行 window.testEmberAPI.testAll()
```

---

## 🔍 故障排查

### 如果部署失败

1. **查看详细日志**:
   ```bash
   gcloud functions logs read ember_api \
     --project=gen-lang-client-0960644135 \
     --limit 50
   ```

2. **检查最新 revision**:
   ```bash
   gcloud run revisions list \
     --service=ember-api \
     --region=us-central1 \
     --project=gen-lang-client-0960644135
   ```

3. **查看 Cloud Run 日志**:
   ```bash
   gcloud logging read \
     "resource.type=cloud_run_revision AND resource.labels.service_name=ember-api" \
     --project=gen-lang-client-0960644135 \
     --limit 30
   ```

### 常见错误模式

| 错误 | 原因 | 解决方案 |
|------|------|---------|
| `ModuleNotFoundError: ember` | 路径配置错误 | 检查 ember_service.py 路径配置 |
| `ModuleNotFoundError: equinox` | 依赖缺失 | 添加到 requirements.txt |
| `before_first_request` | Flask 版本问题 | 移除装饰器 |
| `InvalidTargetTypeException` | 入口点类型错误 | ember_api 必须是函数 |
| `Container startup timeout` | 依赖太大 | 正常，等待构建完成 |

---

## ✅ 最终 deploy.sh 验证

**确认以下内容已包含**:

- [x] ✅ 项目 ID 正确: gen-lang-client-0960644135
- [x] ✅ 同项目部署（简化权限）
- [x] ✅ 使用根目录 .gcloudignore 并扩展
- [x] ✅ 包含 ember-main 框架
- [x] ✅ 健康检查验证
- [x] ✅ 前端部署集成
- [x] ✅ 详细输出和指引
- [x] ✅ 临时文件清理
- [x] ✅ 部署经验注释

**结论**: ✅ **deploy.sh 已完善，以后可以直接使用！**

---

## 📋 最终部署清单

### 准备阶段

- [x] Secret Manager 有 3 个 API keys
- [x] gcloud CLI 已登录
- [x] Cloud Functions API 已启用
- [x] Cloud Build API 已启用
- [x] Cloud Run API 已启用

### 部署命令

```bash
cd /Users/xuling/code/Stanse/functions/ember-api
./deploy.sh

# 输入 'y' 部署前端
```

### 验证步骤

- [x] curl 后端 /health
- [x] curl 后端 /chat
- [x] 访问前端 URL
- [x] Console 测试工具
- [x] 测试 4 种模式

---

## 🎯 关键经验总结

### 1. 项目架构

✅ **单一项目部署**:
- 所有服务在 gen-lang-client-0960644135
- 简化权限配置
- 无需跨项目 IAM

### 2. 依赖管理

✅ **完整依赖列表**:
- 不能省略 JAX, equinox 等
- 虽然包大（~500MB），但必需
- Cloud Function 能处理大包

### 3. 路径配置

✅ **双环境支持**:
- Cloud Function: /workspace/ember-main/src
- 本地: ../../../../ember-main/src
- 遍历尝试，自动适配

### 4. Flask 3.0 兼容

✅ **移除过时装饰器**:
- 不使用 @app.before_first_request
- 改用模块级初始化

### 5. Cloud Functions 入口

✅ **正确的入口点**:
- 必须是函数
- 使用 request_context
- 返回 Flask 响应

### 6. .gcloudignore 管理

✅ **基于现有配置扩展**:
- 复制根目录 .gcloudignore
- 追加 ember-api 特定规则
- 不覆盖原有配置

---

## 📊 最终配置确认

### deploy.sh 配置

```bash
PROJECT_ID="gen-lang-client-0960644135"          ✅
REGION="us-central1"                             ✅
FUNCTION_NAME="ember_api"                        ✅
同项目部署                                         ✅
使用根目录 .gcloudignore                          ✅
包含 ember-main                                   ✅
前端集成                                          ✅
```

### requirements.txt

```txt
functions-framework                              ✅
flask + flask-cors                               ✅
firebase-admin                                   ✅
google-cloud-secret-manager                      ✅
openai + anthropic + google-generativeai         ✅
jax + jaxlib + equinox + optax                   ✅ (必需)
pydantic + tiktoken + httpx + aiohttp            ✅
```

### ember_service.py

```python
双路径支持 (/workspace + 本地)                   ✅
from ember.api.models import models              ✅
ThreadPoolExecutor 并发                          ✅
4种模式完整实现                                   ✅
```

### main.py

```python
正确的 ember_api 函数入口                        ✅
移除 before_first_request                        ✅
PORT 环境变量支持                                ✅
8个 API 端点                                     ✅
```

---

## 🚀 以后的部署

**一条命令**:
```bash
./deploy.sh
```

**无需修改任何配置！**

---

## ✅ 最终确认

**deploy.sh 是否需要再更新？**

**答案**: ❌ **不需要！**

**原因**:
1. ✅ 所有问题已解决
2. ✅ 所有经验已整合
3. ✅ 已成功部署验证
4. ✅ 前后端都正常工作
5. ✅ 配置完整无缺漏

**以后直接使用即可！**

---

**文档状态**: ✅ 完成
**deploy.sh 状态**: ✅ 最终版本，无需再改
**生产状态**: ✅ 已部署，正常运行
**最后更新**: 2026-01-25 01:20
