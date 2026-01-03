# API Key 安全存储指南

## 概述

所有API密钥必须安全存储，绝不能硬编码在源代码中或提交到Git。本文档说明如何正确管理API keys。

---

## 项目使用的 API Keys

| Secret Name (Secret Manager) | 环境变量名 | 用途 | 数据源 |
|------|---------|------|--------|
| `gemini-api-key` | `GEMINI_API_KEY` | Google Gemini AI API | 用于AI分析和内容生成 |
| `polygon-api-key` | `POLYGON_API_KEY` | Polygon.io Stock API | 获取公司新闻和市场数据 |
| `FMP_API_KEY` | `FMP_API_KEY` | Financial Modeling Prep API | 获取ESG评分数据 |
| Firebase Credentials | - | Firebase/Firestore | 数据库访问 |

**注意**: Secret Manager 中的名称使用小写和连字符（`gemini-api-key`），但在环境变量中使用大写下划线（`GEMINI_API_KEY`）。

---

## 方法 1: Google Secret Manager (生产环境推荐)

### 1.1 查看现有 Secrets

项目中已有的 secrets（无需重新创建）:

```bash
# 查看所有 secrets
gcloud secrets list --project=gen-lang-client-0960644135

# 输出:
# NAME                CREATED              REPLICATION_POLICY
# FMP_API_KEY         2025-12-27T03:02:21  automatic
# gemini-api-key      2025-11-25T00:41:36  automatic
# polygon-api-key     2025-11-25T00:41:40  automatic
```

如需创建新的 secret:

```bash
# 示例：创建新的 API Key secret
echo -n "YOUR_API_KEY_HERE" | gcloud secrets create YOUR_SECRET_NAME \
    --data-file=- \
    --replication-policy="automatic" \
    --project=gen-lang-client-0960644135
```

### 1.2 验证 Secret 已创建

```bash
# 查看所有 secrets
gcloud secrets list --project=gen-lang-client-0960644135

# 查看特定 secret 详情
gcloud secrets describe FMP_API_KEY --project=gen-lang-client-0960644135
```

### 1.3 授权 Cloud Run/Cloud Build 访问

```bash
# 获取项目编号
PROJECT_NUMBER=$(gcloud projects describe gen-lang-client-0960644135 --format="value(projectNumber)")

# Cloud Run/Cloud Build 默认 service account
SERVICE_ACCOUNT="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

# 授权访问所有 secrets
for SECRET in FMP_API_KEY polygon-api-key gemini-api-key; do
    gcloud secrets add-iam-policy-binding $SECRET \
        --member="serviceAccount:${SERVICE_ACCOUNT}" \
        --role="roles/secretmanager.secretAccessor" \
        --project=gen-lang-client-0960644135
done
```

### 1.4 在 Cloud Run 中使用 Secret

部署时挂载 secret 作为环境变量:

```bash
gcloud run deploy your-service \
    --set-secrets="FMP_API_KEY=FMP_API_KEY:latest,POLYGON_API_KEY=polygon-api-key:latest,GEMINI_API_KEY=gemini-api-key:latest" \
    --region=us-central1 \
    --project=gen-lang-client-0960644135
```

或在 Cloud Run 控制台:
1. 选择服务 → Edit & Deploy New Revision
2. Variables & Secrets 标签
3. 添加 Secret References:
   - Environment variable: `FMP_API_KEY` → Secret: `FMP_API_KEY:latest`
   - Environment variable: `POLYGON_API_KEY` → Secret: `polygon-api-key:latest`
   - Environment variable: `GEMINI_API_KEY` → Secret: `gemini-api-key:latest`

---

## 方法 2: 环境变量 (本地开发)

### 2.1 使用 export 命令 (临时)

```bash
# 仅当前终端会话有效
export FMP_API_KEY="your_fmp_api_key_here"
export POLYGON_API_KEY="your_polygon_api_key_here"
export GEMINI_API_KEY="your_gemini_api_key_here"

# 验证
echo $FMP_API_KEY

# 运行脚本
python3 scripts/company-ranking/02-collect-esg-scores.py
```

### 2.2 使用 .env 文件 (推荐本地开发)

创建 `.env` 文件（已在 `.gitignore` 中）:

```bash
# .env (⚠️ 不要提交到 Git!)
FMP_API_KEY=your_fmp_api_key_here
POLYGON_API_KEY=your_polygon_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here
```

在Python脚本中使用 `python-dotenv`:

```python
from dotenv import load_dotenv
import os

# 加载 .env 文件
load_dotenv()

# 读取环境变量
fmp_key = os.getenv('FMP_API_KEY')
```

---

## 方法 3: 从 Secret Manager 读取 (Python脚本)

如果需要在脚本中直接从 Secret Manager 读取:

```python
from google.cloud import secretmanager

def get_secret(project_id: str, secret_id: str) -> str:
    """从 Google Secret Manager 获取 secret"""
    client = secretmanager.SecretManagerServiceClient()
    name = f"projects/{project_id}/secrets/{secret_id}/versions/latest"
    response = client.access_secret_version(request={"name": name})
    return response.payload.data.decode("UTF-8")

# 使用示例
FMP_API_KEY = get_secret("gen-lang-client-0960644135", "FMP_API_KEY")
```

**注意**: 通常不需要这样做，因为环境变量方式更简单。

---

## ⚠️ 安全检查清单

- [ ] **NEVER commit API keys to Git**
  - `.gitignore` 已包含: `.env`, `.env.*`, `credentials.json`, `*-key.json`
  - 使用 `git status` 检查未跟踪的文件

- [ ] **NEVER hardcode keys in source code**
  - ✅ 正确: `api_key = os.getenv('FMP_API_KEY')`
  - ❌ 错误: `api_key = "sk-1234567890abcdef"`

- [ ] **Use Secret Manager for production**
  - Cloud Run/Cloud Build 从 Secret Manager 读取
  - 不要在 Dockerfile 或 cloudbuild.yaml 中硬编码

- [ ] **Rotate keys regularly**
  - 至少每6个月更新一次 API keys
  - 怀疑泄露时立即更换

- [ ] **Limit key permissions**
  - 只授权必要的 service accounts
  - 使用最小权限原则

---

## 验证 API Key 设置

### 验证脚本

```python
#!/usr/bin/env python3
import os
import sys

required_keys = ['FMP_API_KEY', 'POLYGON_API_KEY', 'GEMINI_API_KEY']

print("Checking API keys...")
missing_keys = []

for key in required_keys:
    value = os.getenv(key)
    if value:
        print(f"✅ {key}: {'*' * (len(value) - 4)}{value[-4:]}")
    else:
        print(f"❌ {key}: NOT FOUND")
        missing_keys.append(key)

if missing_keys:
    print(f"\n⚠️  Missing keys: {', '.join(missing_keys)}")
    print("Please set environment variables or configure Secret Manager")
    sys.exit(1)
else:
    print("\n✅ All API keys configured correctly")
```

---

## 故障排查

### 问题: 脚本提示 "API key not found"

**解决方案**:
1. 检查环境变量: `echo $FMP_API_KEY`
2. 检查 Secret Manager: `gcloud secrets versions access latest --secret=FMP_API_KEY`
3. 验证权限: `gcloud secrets get-iam-policy FMP_API_KEY`

### 问题: Cloud Run 部署后无法访问 secret

**解决方案**:
1. 检查 secret 是否挂载: Cloud Run Console → Variables & Secrets
2. 验证 service account 权限
3. 查看 Cloud Run logs: `gcloud run logs read --service=your-service`

### 问题: 本地可以运行，Cloud Run 报错

**原因**: 本地使用环境变量，Cloud Run 需要从 Secret Manager 读取

**解决方案**: 按照 "1.4 在 Cloud Run 中使用 Secret" 配置

---

## 相关文档

- [Google Secret Manager 文档](https://cloud.google.com/secret-manager/docs)
- [Cloud Run Secrets 配置](https://cloud.google.com/run/docs/configuring/secrets)
- [.gitignore 配置](.gitignore)
- [Enhanced Company Ranking System](27_enhanced_company_ranking_system.md)
