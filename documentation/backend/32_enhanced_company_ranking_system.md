# Enhanced Company Ranking System - 基于真实数据的公司排名系统

## 概述

当前的 Company Ranking 系统依赖 AI 黑盒判断，缺乏透明度和数据支撑。本文档描述如何构建一个**基于真实数据的透明排名系统**。

---

## 当前问题

| 问题 | 描述 |
|------|------|
| ❌ **AI 黑盒评分** | 评分标准不透明，无法解释为什么某公司得 85 分 |
| ❌ **数据源不足** | 只从 20 条新闻获取背景，覆盖不了 500 家公司 |
| ❌ **分析维度模糊** | Prompt 里写了"分析政治捐款"，但实际上 AI 可能没分析 |
| ❌ **无定时更新** | 每次用户请求才调用 AI，缺乏后台数据构建流程 |
| ❌ **无真实 FEC 数据** | 系统已有 FEC 数据库，但排名系统没用上 |

---

## 新架构设计

### 数据源 (4 个维度)

| 数据源 | 更新频率 | 存储位置 | 评分权重 |
|--------|---------|---------|---------|
| **1. FEC 政治捐款** | 每 12 小时 | Firebase: `company_rankings/{ticker}/fec_data` | 40% |
| **2. ESG 评分** | 每周 | Firebase: `company_rankings/{ticker}/esg_data` | 30% |
| **3. Polygon 新闻** | 每 12 小时 | Firebase: `company_rankings/{ticker}/news_data` | 20% |
| **4. CEO/Executive 言论** | 每 12 小时 | Firebase: `company_rankings/{ticker}/executive_data` | 10% |

---

## 实施计划

### **阶段 1: 后台数据采集系统**

#### 1.1 FEC 政治捐款数据采集 (每 12 小时)

**脚本**: `scripts/company-ranking/01-collect-fec-donations.py`

```python
"""
从 Firebase FEC 数据库构建 SP500 公司政治捐款报告
输出: Firebase `company_rankings/{ticker}/fec_data`
"""

import firebase_admin
from firebase_admin import credentials, firestore
from datetime import datetime, timedelta
import json

# SP500 公司列表
SP500_TICKERS = ['AAPL', 'MSFT', 'GOOGL', ...] # 从 data/sp500Companies.ts 导入

def collect_fec_for_company(ticker: str, db: firestore.Client):
    """
    查询 FEC 数据库，汇总该公司的捐款情况
    """
    # 查询 companies/{ticker} 下的所有 contributions
    company_ref = db.collection('companies').document(ticker)

    party_totals = {
        'DEM': {'total_usd': 0, 'count': 0},
        'REP': {'total_usd': 0, 'count': 0},
        'OTH': {'total_usd': 0, 'count': 0}
    }

    # 遍历所有 election cycles
    for year in [2024, 2022, 2020]:
        cycle_ref = company_ref.collection(f'cycle_{year}')
        contributions = cycle_ref.stream()

        for contrib in contributions:
            data = contrib.to_dict()
            party = data.get('party', 'OTH')
            amount = data.get('transaction_amount', 0)

            if party in party_totals:
                party_totals[party]['total_usd'] += amount
                party_totals[party]['count'] += 1

    # 计算百分比
    total_usd = sum(p['total_usd'] for p in party_totals.values())
    for party in party_totals:
        party_totals[party]['percentage'] = (
            party_totals[party]['total_usd'] / total_usd * 100
            if total_usd > 0 else 0
        )

    # 计算政治倾向分数 (-100 to 100)
    # -100 = 100% REP, 0 = 平衡, +100 = 100% DEM
    dem_pct = party_totals['DEM']['percentage']
    rep_pct = party_totals['REP']['percentage']
    political_lean_score = dem_pct - rep_pct

    return {
        'ticker': ticker,
        'party_totals': party_totals,
        'total_usd': total_usd,
        'political_lean_score': political_lean_score,
        'last_updated': datetime.utcnow()
    }

def main():
    # 初始化 Firebase
    cred = credentials.Certificate('path/to/service-account.json')
    firebase_admin.initialize_app(cred)
    db = firestore.client()

    print(f"🔄 开始采集 {len(SP500_TICKERS)} 家公司的 FEC 数据...")

    for ticker in SP500_TICKERS:
        try:
            fec_data = collect_fec_for_company(ticker, db)

            # 保存到 company_rankings collection
            db.collection('company_rankings').document(ticker).set({
                'fec_data': fec_data
            }, merge=True)

            print(f"✅ {ticker}: ${fec_data['total_usd']:,.0f}, Lean: {fec_data['political_lean_score']:.1f}")
        except Exception as e:
            print(f"❌ {ticker}: {str(e)}")

    print("✅ FEC 数据采集完成")

if __name__ == "__main__":
    main()
```

---

#### 1.2 ESG 数据采集 (每周)

**脚本**: `scripts/company-ranking/02-collect-esg-scores.py`

```python
"""
使用 yfinance 从 Yahoo Finance 采集 ESG 评分
输出: Firebase `company_rankings/{ticker}/esg_data`
"""

import yfinance as yf
import firebase_admin
from firebase_admin import firestore
import pandas as pd
from datetime import datetime

def get_esg_for_company(ticker: str):
    """
    获取公司的 ESG 评分
    """
    try:
        stock = yf.Ticker(ticker)
        sustainability = stock.sustainability

        if sustainability is None or sustainability.empty:
            print(f"⚠️  {ticker}: No ESG data available")
            return None

        # 提取关键 ESG 指标
        esg_data = {
            'ticker': ticker,
            'total_esg': sustainability.get('totalEsg', [None])[0],
            'environment_score': sustainability.get('environmentScore', [None])[0],
            'social_score': sustainability.get('socialScore', [None])[0],
            'governance_score': sustainability.get('governanceScore', [None])[0],
            'controversy_level': sustainability.get('highestControversy', [None])[0],
            'last_updated': datetime.utcnow()
        }

        return esg_data

    except Exception as e:
        print(f"❌ {ticker}: {str(e)}")
        return None

def main():
    db = firestore.client()
    SP500_TICKERS = ['AAPL', 'MSFT', ...] # 导入列表

    print(f"🔄 开始采集 {len(SP500_TICKERS)} 家公司的 ESG 数据...")

    success_count = 0
    for ticker in SP500_TICKERS:
        esg_data = get_esg_for_company(ticker)

        if esg_data:
            db.collection('company_rankings').document(ticker).set({
                'esg_data': esg_data
            }, merge=True)
            print(f"✅ {ticker}: ESG={esg_data['total_esg']}")
            success_count += 1

    print(f"✅ ESG 数据采集完成: {success_count}/{len(SP500_TICKERS)}")

if __name__ == "__main__":
    main()
```

---

#### 1.3 Polygon 新闻数据采集 (每 12 小时)

**脚本**: `scripts/company-ranking/03-collect-polygon-news.py`

```python
"""
使用 Polygon API 采集 SP500 公司最新新闻
输出: Firebase `company_rankings/{ticker}/news_data`
"""

import requests
import firebase_admin
from firebase_admin import firestore
from datetime import datetime, timedelta
import os

POLYGON_API_KEY = os.getenv('POLYGON_API_KEY')

def get_news_for_ticker(ticker: str, limit: int = 20):
    """
    获取特定股票的最新新闻
    """
    url = f"https://api.polygon.io/v2/reference/news"
    params = {
        'ticker': ticker,
        'order': 'desc',
        'limit': limit,
        'sort': 'published_utc',
        'apiKey': POLYGON_API_KEY
    }

    response = requests.get(url, params=params)
    data = response.json()

    if data.get('status') != 'OK':
        print(f"❌ {ticker}: API error - {data}")
        return []

    articles = []
    for item in data.get('results', []):
        articles.append({
            'title': item.get('title'),
            'published_utc': item.get('published_utc'),
            'article_url': item.get('article_url'),
            'publisher': item.get('publisher', {}).get('name'),
            'description': item.get('description', '')[:200] # 前200字符
        })

    return articles

def main():
    db = firestore.client()
    SP500_TICKERS = ['AAPL', 'MSFT', ...] # 导入列表

    print(f"🔄 开始采集 {len(SP500_TICKERS)} 家公司的新闻数据...")

    for ticker in SP500_TICKERS:
        articles = get_news_for_ticker(ticker, limit=20)

        if articles:
            db.collection('company_rankings').document(ticker).set({
                'news_data': {
                    'articles': articles,
                    'count': len(articles),
                    'last_updated': datetime.utcnow()
                }
            }, merge=True)
            print(f"✅ {ticker}: {len(articles)} articles")
        else:
            print(f"⚠️  {ticker}: No news found")

    print("✅ 新闻数据采集完成")

if __name__ == "__main__":
    main()
```

---

#### 1.4 CEO/Executive 言论分析 (每 12 小时)

**脚本**: `scripts/company-ranking/04-analyze-executive-statements.py`

```python
"""
使用 Gemini API 分析 CEO/Executive 的公开言论
输出: Firebase `company_rankings/{ticker}/executive_data`
"""

import firebase_admin
from firebase_admin import firestore
from google.generativeai import GoogleGenAI
import os

GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
ai = GoogleGenAI(apiKey=GEMINI_API_KEY)

def analyze_executive_for_company(ticker: str, db: firestore.Client):
    """
    使用 Gemini 分析公司 CEO 的政治立场
    """
    # 从 company_rankings 读取新闻数据
    company_doc = db.collection('company_rankings').document(ticker).get()
    news_data = company_doc.to_dict().get('news_data', {})
    articles = news_data.get('articles', [])

    if not articles:
        return None

    # 构建新闻摘要
    news_context = "\n".join([
        f"- {art['title']}" for art in articles[:10]
    ])

    prompt = f"""
    Analyze the political stance of {ticker}'s CEO/executives based on recent news:

    {news_context}

    Return a JSON with:
    - political_lean: -100 (very conservative) to +100 (very progressive)
    - social_lean: -100 (authoritarian) to +100 (libertarian)
    - key_statements: List of max 2 notable political statements
    - reasoning: Brief explanation (max 50 words)
    """

    response = ai.models.generateContent({
        'model': 'gemini-2.5-flash',
        'contents': prompt,
        'config': {
            'tools': [{'googleSearch': {}}],
            'responseMimeType': 'application/json'
        }
    })

    result = response.json()

    return {
        'ticker': ticker,
        'political_lean': result.get('political_lean', 0),
        'social_lean': result.get('social_lean', 0),
        'key_statements': result.get('key_statements', []),
        'reasoning': result.get('reasoning', ''),
        'last_updated': datetime.utcnow()
    }

# ... (实现类似前面的脚本结构)
```

---

### **阶段 2: 评分算法**

#### 2.1 综合评分公式

**脚本**: `scripts/company-ranking/05-calculate-rankings.py`

```python
"""
基于 FEC、ESG、新闻、CEO 言论计算公司政治立场分数
输出: Firebase `company_rankings/{ticker}/ranking_score`
"""

def calculate_alignment_score(
    user_economic: float,  # -100 to 100
    user_social: float,    # -100 to 100
    user_diplomatic: float, # -100 to 100
    fec_data: dict,
    esg_data: dict,
    executive_data: dict
) -> float:
    """
    计算公司与用户价值观的匹配分数 (0-100)

    权重分配:
    - FEC 政治捐款: 40%
    - ESG 评分: 30%
    - Executive 言论: 20%
    - 新闻情感: 10%
    """

    # 1. FEC 政治捐款分数 (40%)
    fec_lean = fec_data.get('political_lean_score', 0)  # -100 to 100
    fec_alignment = 100 - abs(user_economic - fec_lean)  # 0-100
    fec_score = fec_alignment * 0.4

    # 2. ESG 评分 (30%)
    esg_total = esg_data.get('total_esg', 50)  # 0-100
    # 进步派偏好高 ESG，保守派偏好低 ESG
    if user_social > 0:  # 进步派
        esg_score = esg_total * 0.3
    else:  # 保守派
        esg_score = (100 - esg_total) * 0.3

    # 3. Executive 言论 (20%)
    exec_political = executive_data.get('political_lean', 0)
    exec_alignment = 100 - abs(user_economic - exec_political)
    exec_score = exec_alignment * 0.2

    # 4. 新闻情感 (10%) - 简化版本
    news_score = 50 * 0.1  # 暂时固定为中性

    # 总分
    total_score = fec_score + esg_score + exec_score + news_score

    return min(100, max(0, total_score))

# ... (实现完整的排名计算逻辑)
```

---

### **阶段 3: 定时任务调度**

使用 **Google Cloud Scheduler + Cloud Functions** 或 **Cron Job**

#### Cloud Scheduler 配置

```bash
# 每 12 小时运行一次 FEC + 新闻 + Executive 数据采集
gcloud scheduler jobs create http collect-company-data-12h \
  --schedule="0 */12 * * *" \
  --uri="https://us-central1-YOUR_PROJECT.cloudfunctions.net/collectCompanyData" \
  --http-method=POST

# 每周运行一次 ESG 数据采集
gcloud scheduler jobs create http collect-esg-weekly \
  --schedule="0 0 * * 0" \
  --uri="https://us-central1-YOUR_PROJECT.cloudfunctions.net/collectESGData" \
  --http-method=POST
```

---

### **阶段 4: 前端集成**

修改 `companyRankingService.ts` 从 Firebase 读取预计算的排名，而不是调用 AI：

```typescript
export const rankCompaniesForStance = async (
  stanceType: StanceType
): Promise<CompanyRanking> => {
  const db = getFirestore();

  // 从 Firebase 读取所有公司的预计算分数
  const rankingsRef = collection(db, 'company_rankings');
  const snapshot = await getDocs(rankingsRef);

  const companies = snapshot.docs.map(doc => ({
    ticker: doc.id,
    ...doc.data()
  }));

  // 根据用户立场排序
  const sorted = companies.sort((a, b) =>
    b.ranking_score[stanceType] - a.ranking_score[stanceType]
  );

  return {
    stanceType,
    supportCompanies: sorted.slice(0, 5),
    opposeCompanies: sorted.slice(-5).reverse(),
    updatedAt: new Date()
  };
};
```

---

## 优先级 & 时间表

| 阶段 | 任务 | 优先级 | 预计时间 |
|------|------|--------|---------|
| 1.1 | FEC 数据采集脚本 | 🔴 高 | 2 天 |
| 1.2 | ESG 数据采集脚本 | 🟡 中 | 1 天 |
| 1.3 | Polygon 新闻采集脚本 | 🔴 高 | 1 天 |
| 1.4 | Executive 言论分析脚本 | 🟡 中 | 1 天 |
| 2.1 | 综合评分算法 | 🔴 高 | 2 天 |
| 3.1 | Cloud Scheduler 配置 | 🟢 低 | 0.5 天 |
| 4.1 | 前端集成 | 🔴 高 | 1 天 |

**总计**: 约 8.5 天

---

## 下一步行动

1. ✅ 确认 API Key 安全性（已完成）
2. 创建 `scripts/company-ranking/` 目录
3. 实现 1.1 FEC 数据采集脚本（最高优先级）
4. 测试数据采集流程
5. 实现评分算法
6. 部署定时任务

---

## 注意事项

1. **API 配额**:
   - Polygon API: 每分钟 5 个请求（Developer plan）
   - Yahoo Finance: 无官方限制，但建议控制频率
   - Gemini API: 每分钟 60 个请求

2. **数据存储成本**:
   - 500 公司 × 4 数据源 × 12 小时更新 = 约 1GB/月

3. **错误处理**:
   - 某些公司可能无 FEC 数据（初创公司）
   - 某些公司可能无 ESG 评分
   - 需要优雅降级（部分数据缺失仍可评分）

---

## 实施细节 - 脚本运行指南

### FEC 数据采集脚本（已实现）

**位置**: `scripts/company-ranking/01-collect-fec-donations.py`

**运行方式**:
```bash
# 方式 1: 使用本地 Firebase 凭证
export FIREBASE_CREDENTIALS_PATH=/path/to/service-account-key.json
python3 01-collect-fec-donations.py

# 方式 2: 传递凭证路径作为参数
python3 01-collect-fec-donations.py /path/to/service-account-key.json

# 方式 3: 在 Cloud Run/Cloud Functions 环境（自动使用 ApplicationDefault）
python3 01-collect-fec-donations.py
```

**输出示例**:
```
============================================================
🔄 FEC Political Donations Data Collection
============================================================
📦 Total companies to process: 100
🕒 Started at: 2025-12-26 10:30:00

[1/100] AAPL
📊 Processing AAPL...
  └─ Found 3 variants for AAPL (Apple)
  ├─ Total: $50,000
  ├─ DEM: 65.0% | REP: 30.0% | OTH: 5.0%
  └─ Political Lean: +35.0 (DEM)
  ✅ Saved to Firebase: company_rankings/AAPL/fec_data

============================================================
✅ FEC Data Collection Complete
============================================================
✅ Success: 85/100
⚠️  No Data: 12/100
❌ Errors: 3/100
```

**数据结构**（存储到 `company_rankings/{ticker}/fec_data`）:
```json
{
  "ticker": "AAPL",
  "display_name": "Apple",
  "variants_found": ["APPLE INC", "APPLE COMPUTER INC", "APPLE PAC"],
  "party_totals": {
    "DEM": {
      "total_amount": 1250000,
      "total_amount_usd": 12500,
      "count": 45,
      "percentage": 62.5
    },
    "REP": {
      "total_amount": 500000,
      "total_amount_usd": 5000,
      "count": 18,
      "percentage": 25.0
    },
    "OTH": {
      "total_amount": 250000,
      "total_amount_usd": 2500,
      "count": 12,
      "percentage": 12.5
    }
  },
  "total_contributed_cents": 2000000,
  "total_usd": 20000,
  "political_lean_score": 37.5,
  "years": [2024, 2022, 2020],
  "last_updated": "2025-12-26T10:30:00Z",
  "data_source": "fec_company_party_summary"
}
```

**political_lean_score 计算**:
```
political_lean_score = DEM% - REP%
范围: -100 (100% REP) 到 +100 (100% DEM)
```

### 安全最佳实践

**❌ 不要这样做**:
```python
# 永远不要硬编码 API key
POLYGON_API_KEY = "your_actual_api_key_here"  # ❌ 绝对不要这样做
```

**✅ 正确做法**:
```python
# 从环境变量读取
import os
POLYGON_API_KEY = os.getenv('POLYGON_API_KEY')  # ✅
```

**Firebase 凭证管理**:
1. **本地开发**: 使用 service account key JSON 文件
2. **Cloud Run/Functions**: 使用 ApplicationDefault (自动)
3. **永远不要**: 将凭证文件提交到 Git

### 故障排查

**问题 1: Firebase 连接失败**
```
Error: Could not load the default credentials
```
**解决方案**:
```bash
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json
```

**问题 2: 找不到 SP500 公司数据**
```
No FEC variants found for AAPL (Apple)
```
**原因**: FEC 数据库中该公司没有捐款记录或名称变体未建立索引
**解决方案**: 检查 `fec_company_name_variants` collection 是否包含该公司

---

## Cloud Scheduler 自动化部署

### 架构说明

为了实现定时自动化数据采集，系统采用以下架构：

- **Google Cloud Project** (`gen-lang-client-0960644135`): 用于 Cloud Run Jobs, Cloud Scheduler, Secret Manager
- **Firebase Project** (`stanseproject`): 用于 Firestore 数据库
- **Docker 容器化**: 将 Python 脚本打包为容器镜像，部署到 Cloud Run Jobs
- **Cloud Scheduler**: 基于 cron 表达式的定时任务调度器

### 部署架构

```
┌─────────────────────────────────────────────────────────────┐
│              Google Cloud (gen-lang-client-0960644135)      │
│                                                             │
│  ┌──────────────────┐         ┌─────────────────────────┐  │
│  │ Cloud Scheduler  │─trigger─>│  Cloud Run Jobs        │  │
│  │                  │         │  ├─ fec-donations       │  │
│  │ ├─ fec: Mon 8am  │         │  ├─ esg-scores          │  │
│  │ ├─ esg: Tue 8am  │         │  └─ polygon-news        │  │
│  │ └─ news: Daily   │         │                         │  │
│  └──────────────────┘         └─────────────────────────┘  │
│          │                              │                  │
│          └──────────────────────────────┘                  │
│                         │                                  │
│                    saves to                                │
│                         ▼                                  │
└─────────────────────────────────────────────────────────────┘
                          │
                          │
                          ▼
           ┌─────────────────────────────┐
           │  Firebase (stanseproject)   │
           │                             │
           │  Firestore Collections:     │
           │  ├─ fec_donations_2025     │
           │  ├─ esg_scores_2025        │
           │  └─ polygon_news_2025      │
           └─────────────────────────────┘
```

### 部署步骤

#### 1. 部署 Cloud Run Jobs

**脚本位置**: `scripts/company-ranking/deploy-jobs.sh`

**运行方式**:
```bash
cd /Users/xuling/code/Stanse
bash scripts/company-ranking/deploy-jobs.sh
```

**执行流程**:
1. 从项目根目录构建 Docker 镜像
2. 推送镜像到 Google Container Registry (`gcr.io/gen-lang-client-0960644135/company-ranking-collector`)
3. 创建 3 个 Cloud Run Jobs:
   - `fec-donations-collector` (执行 `01-collect-fec-donations.py`)
   - `esg-scores-collector` (执行 `02-collect-esg-scores.py`)
   - `polygon-news-collector` (执行 `03-collect-polygon-news.py`)

**关键配置**:
- **Region**: `us-central1`
- **Memory**: 512Mi
- **CPU**: 1 core
- **Timeout**: 30 分钟
- **Max Retries**: 1
- **Secrets**:
  - FEC/ESG: `FMP_API_KEY` (from Secret Manager)
  - Polygon: `polygon-api-key` (from Secret Manager)

**验证部署**:
```bash
# 查看已部署的 Cloud Run Jobs
gcloud run jobs list --region=us-central1 --project=gen-lang-client-0960644135

# 手动触发测试
gcloud run jobs execute fec-donations-collector --region=us-central1 --project=gen-lang-client-0960644135
gcloud run jobs execute esg-scores-collector --region=us-central1 --project=gen-lang-client-0960644135
gcloud run jobs execute polygon-news-collector --region=us-central1 --project=gen-lang-client-0960644135
```

#### 2. 设置 Cloud Scheduler

**脚本位置**: `scripts/company-ranking/setup-schedulers.sh`

**运行方式**:
```bash
cd /Users/xuling/code/Stanse
bash scripts/company-ranking/setup-schedulers.sh
```

**执行流程**:
1. 启用 Cloud Scheduler API
2. 创建 Service Account (`cloud-scheduler-invoker`) 用于调用 Cloud Run Jobs
3. 授予 Service Account `roles/run.invoker` 权限
4. 创建 3 个 Cloud Scheduler 定时任务

**定时任务配置**:

| Job Name | Cron 表达式 | 执行时间 | 触发的 Cloud Run Job |
|----------|------------|---------|---------------------|
| `fec-donations-weekly` | `0 8 * * 1` | 每周一 8:00 AM PST | `fec-donations-collector` |
| `esg-scores-weekly` | `0 8 * * 2` | 每周二 8:00 AM PST | `esg-scores-collector` |
| `polygon-news-daily` | `0 9 * * *` | 每天 9:00 AM PST | `polygon-news-collector` |

**调度频率说明**:
- **FEC Donations**: 每周一次（FEC 数据更新不频繁）
- **ESG Scores**: 每周一次（ESG 数据通常季度更新）
- **Polygon News**: 每天一次（新闻数据每天更新）

**验证调度器**:
```bash
# 查看所有 Cloud Scheduler 任务
gcloud scheduler jobs list --location=us-central1 --project=gen-lang-client-0960644135

# 手动触发调度器（测试）
gcloud scheduler jobs run fec-donations-weekly --location=us-central1 --project=gen-lang-client-0960644135
gcloud scheduler jobs run esg-scores-weekly --location=us-central1 --project=gen-lang-client-0960644135
gcloud scheduler jobs run polygon-news-daily --location=us-central1 --project=gen-lang-client-0960644135
```

#### 3. Docker 配置

**Dockerfile 位置**: `scripts/company-ranking/Dockerfile`

**关键配置**:
- **Base Image**: `python:3.11-slim`
- **Build Context**: 项目根目录 (`/Users/xuling/code/Stanse`)
- **Requirements**: 使用项目根目录的 `requirements.txt`
- **Copied Files**:
  - `scripts/company-ranking/*.py` → 所有数据采集脚本
  - `scripts/company-ranking/verification/` → 验证脚本
  - `scripts/company-ranking/maintenance/` → 维护脚本

**构建命令**（由 deploy-jobs.sh 自动执行）:
```bash
gcloud builds submit \
    --tag gcr.io/gen-lang-client-0960644135/company-ranking-collector \
    --project=gen-lang-client-0960644135 \
    -f scripts/company-ranking/Dockerfile \
    .
```

**重要**: 必须从项目根目录构建，因为需要访问根目录的 `requirements.txt`。

#### 4. 依赖管理

**Requirements 位置**: `/Users/xuling/code/Stanse/requirements.txt`

**当前依赖**:
```
requests>=2.31.0              # HTTP requests for API calls
firebase-admin>=6.3.0         # Firebase Admin SDK
google-cloud-firestore>=2.14.0  # Firestore operations
google-cloud-secret-manager>=2.16.4  # Secret Manager access
```

**添加新依赖**:
1. 编辑 `/Users/xuling/code/Stanse/requirements.txt`
2. 重新运行 `deploy-jobs.sh` 以重新构建 Docker 镜像

### 监控和日志

#### 查看执行日志

```bash
# 查看 Cloud Run Jobs 执行历史
gcloud run jobs executions list --job=fec-donations-collector --region=us-central1 --project=gen-lang-client-0960644135

# 查看特定执行的日志
gcloud logging read "resource.type=cloud_run_job AND resource.labels.job_name=fec-donations-collector" \
    --limit=100 \
    --project=gen-lang-client-0960644135 \
    --format=json

# 实时查看日志（在手动触发时）
gcloud run jobs execute fec-donations-collector --region=us-central1 --project=gen-lang-client-0960644135 --wait
```

#### 查看 Cloud Scheduler 执行状态

```bash
# 查看调度器历史
gcloud scheduler jobs describe fec-donations-weekly --location=us-central1 --project=gen-lang-client-0960644135

# 查看最近的调度执行日志
gcloud logging read "resource.type=cloud_scheduler_job AND resource.labels.job_name=fec-donations-weekly" \
    --limit=50 \
    --project=gen-lang-client-0960644135
```

### 故障排查

#### 问题 1: Cloud Run Job 执行失败

**检查步骤**:
1. 查看执行日志:
   ```bash
   gcloud logging read "resource.type=cloud_run_job" --limit=100 --project=gen-lang-client-0960644135
   ```
2. 检查 Secret Manager 权限
3. 验证 Docker 镜像是否正确构建
4. 手动触发测试:
   ```bash
   gcloud run jobs execute fec-donations-collector --region=us-central1 --project=gen-lang-client-0960644135 --wait
   ```

#### 问题 2: Cloud Scheduler 无法触发 Job

**检查步骤**:
1. 验证 Service Account 权限:
   ```bash
   gcloud projects get-iam-policy gen-lang-client-0960644135 \
       --flatten="bindings[].members" \
       --filter="bindings.members:serviceAccount:cloud-scheduler-invoker@gen-lang-client-0960644135.iam.gserviceaccount.com"
   ```
2. 检查调度器配置:
   ```bash
   gcloud scheduler jobs describe fec-donations-weekly --location=us-central1 --project=gen-lang-client-0960644135
   ```
3. 手动触发测试

#### 问题 3: Docker 构建失败

**常见原因**:
- 未从项目根目录运行 `deploy-jobs.sh`
- `requirements.txt` 路径错误
- Python 依赖冲突

**解决方案**:
1. 确保从项目根目录运行:
   ```bash
   cd /Users/xuling/code/Stanse
   bash scripts/company-ranking/deploy-jobs.sh
   ```
2. 检查 `requirements.txt` 是否存在于项目根目录
3. 本地测试 Docker 构建:
   ```bash
   docker build -f scripts/company-ranking/Dockerfile -t test-image .
   ```

### 成本估算

| 服务 | 用量 | 月成本估算 |
|------|------|-----------|
| Cloud Run Jobs | 3 jobs × 30分钟/次 × 15次/月 | ~$2-5 |
| Cloud Scheduler | 3 jobs | ~$0.30 |
| Container Registry Storage | ~500MB 镜像 | ~$0.10 |
| Cloud Logging | 日志存储 | ~$0.50 |
| **总计** | | **~$3-6/月** |

### 更新部署

当修改了数据采集脚本后，需要重新部署:

```bash
# 1. 重新构建并部署 Cloud Run Jobs
cd /Users/xuling/code/Stanse
bash scripts/company-ranking/deploy-jobs.sh

# 2. 如果修改了调度频率，重新运行 setup-schedulers.sh
bash scripts/company-ranking/setup-schedulers.sh
```

**注意**: `setup-schedulers.sh` 支持幂等操作，如果调度器已存在会自动更新配置。

### 架构关系说明

#### 数据采集 Jobs vs 前端/后端部署

**重要**: 数据采集 Cloud Run Jobs 和前端/后端 Cloud Run Service 是**完全独立、并行运行**的不同服务,互不影响。

##### 1. **前端/后端部署** (Cloud Run Service)

- **URL**: `https://stanse-837715360412.us-central1.run.app/`
- **类型**: Cloud Run **Service** (持续运行的 Web 服务)
- **功能**: 为用户提供 Stanse 应用的前端界面和后端 API
- **数据角色**: **读取** Firebase Firestore 中的数据
- **运行方式**: 24/7 持续运行,响应用户的 HTTP 请求
- **部署方式**: `gcloud builds submit --config cloudbuild.yaml`

##### 2. **数据采集 Jobs** (Cloud Run Jobs)

- **类型**: Cloud Run **Jobs** (定时批处理任务)
- **功能**: 定时采集以下数据并写入 Firestore:
  - `fec-donations-collector`: FEC 政治捐款数据
  - `esg-scores-collector`: ESG 评分数据
  - `polygon-news-collector`: Polygon 新闻数据
- **数据角色**: **写入** Firebase Firestore
- **运行方式**: 按 Cloud Scheduler 计划定时触发(例如每天一次),运行完成后自动停止
- **部署方式**: `bash scripts/company-ranking/deploy-jobs.sh`

##### 3. **完整架构图**

```
┌─────────────────────────────────────────────────────────────────┐
│                         用户浏览器                                │
└────────────────────────┬────────────────────────────────────────┘
                         │ HTTPS 请求
                         ↓
┌─────────────────────────────────────────────────────────────────┐
│          Cloud Run Service (前端/后端)                           │
│          https://stanse-837715360412.us-central1.run.app/       │
│                                                                 │
│  • 前端 React 应用                                               │
│  • 后端 API (Express.js)                                        │
│  • Polis Protocol 集成                                          │
│  • 运行方式: 24/7 持续运行                                        │
│  • 容器镜像: gcr.io/.../stanse:latest                            │
│  • 构建配置: cloudbuild.yaml                                     │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           │ 读取数据 (SELECT)
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│              Firebase Firestore (共享数据库)                      │
│              Project: stanseproject                             │
│                                                                 │
│  Collections:                                                   │
│  • fec_donations_2025         (FEC 政治捐款数据)                 │
│  • esg_scores_2025            (ESG 评分数据)                     │
│  • polygon_news_2025          (Polygon 新闻数据)                 │
│  • company_rankings           (公司排名数据)                      │
│  • fec_company_name_variants  (公司名称变体索引)                  │
└──────────────────────────┬──────────────────────────────────────┘
                           ↑
                           │ 写入数据 (INSERT/UPDATE)
                           │
┌──────────────────────────┴──────────────────────────────────────┐
│          Cloud Run Jobs (数据采集后台任务)                        │
│          Project: gen-lang-client-0960644135                    │
│                                                                 │
│  定时触发 (Cloud Scheduler):                                     │
│  ├─ fec-donations-collector   (每周一 8:00 AM)                  │
│  ├─ esg-scores-collector      (每周二 8:00 AM)                  │
│  └─ polygon-news-collector    (每天 9:00 AM)                    │
│                                                                 │
│  • 运行方式: 定时触发,完成后自动停止                               │
│  • 容器镜像: gcr.io/.../company-ranking-collector:latest         │
│  • 构建脚本: scripts/company-ranking/deploy-jobs.sh             │
└──────────────────────────┬──────────────────────────────────────┘
                           ↑
                           │ API 调用
                           │
┌──────────────────────────┴──────────────────────────────────────┐
│                   外部数据源 APIs                                 │
│                                                                 │
│  • FEC API          (政治捐款数据)                               │
│  • FMP API          (ESG 评分数据)                              │
│  • Polygon API      (新闻数据)                                  │
└─────────────────────────────────────────────────────────────────┘
```

##### 4. **独立性保证**

| 方面 | Cloud Run Service (前端/后端) | Cloud Run Jobs (数据采集) | 影响 |
|------|------------------------------|--------------------------|------|
| **容器镜像** | `gcr.io/.../stanse:latest` | `gcr.io/.../company-ranking-collector:latest` | 不同镜像,独立部署 |
| **代码库** | `backend/` 目录 | `scripts/company-ranking/` 目录 | 不同代码,互不干扰 |
| **构建配置** | `cloudbuild.yaml` (根目录) | `deploy-jobs.sh` (自定义脚本) | 完全不同的构建流程 |
| **`.gcloudignore`** | 排除 `backend/`, `documentation/` 等 | 临时排除 `scripts/fec-data/`, `scripts/test/` | 各自独立的排除规则 |
| **触发方式** | HTTP 请求 | Cloud Scheduler (定时) | 完全不同的触发机制 |
| **运行时间** | 24/7 持续运行 | 每天特定时间运行几分钟 | 并行运行,互不干扰 |
| **资源配额** | 独立的 CPU/内存配额 | 独立的 CPU/内存配额 | 各自独立,不共享资源 |
| **计费** | 按请求数和运行时间 | 仅任务运行时计费 | 分别计费 |
| **Google Cloud Project** | gen-lang-client-0960644135 | gen-lang-client-0960644135 | 同一个项目,但独立服务 |
| **Firebase Project** | stanseproject | stanseproject | 共享 Firestore 数据库 |

##### 5. **实际运行示例**

假设今天是 2025-12-27:

**早上 6:00 AM**
```
Cloud Scheduler → 触发 esg-scores-collector Job
Job 容器启动 → 调用 FMP API → 获取 500 家公司 ESG 数据
→ 写入 Firestore (esg_scores_2025 collection)
→ 任务完成,容器自动停止 (用时约 5 分钟)

你的前端服务: ✅ 正常运行中,不受影响
```

**上午 10:30 AM**
```
用户访问: https://stanse-837715360412.us-central1.run.app/
前端 Service 处理请求 → 从 Firestore 读取 ESG 数据
→ 显示包含早上 6:00 采集的最新数据
→ 返回给用户

数据采集 Jobs: 已停止,不占用资源
```

**中午 12:00 PM**
```
Cloud Scheduler → 触发 polygon-news-collector Job
Job 容器启动 → 调用 Polygon API → 获取最新新闻
→ 写入 Firestore (polygon_news_2025 collection)
→ 任务完成,容器自动停止

你的前端服务: ✅ 正常运行中,继续响应用户请求
```

**下午 6:00 PM**
```
Cloud Scheduler → 触发 fec-donations-collector Job
Job 容器启动 → 调用 FEC API → 获取政治捐款数据
→ 写入 Firestore (fec_donations_2025 collection)
→ 任务完成,容器自动停止

你的前端服务: ✅ 正常运行中,不受影响
```

##### 6. **部署注意事项**

**重要**: 部署前端/后端时,必须使用正确的 `.gcloudignore` 配置!

**前端/后端部署**:
```bash
# 确保 .gcloudignore 包含以下内容:
.git
.gitignore
node_modules/
dist/
.vscode/
.idea/
*.log
.DS_Store
.env.local
.env.*.local
backend/
documentation/
metadata.json
firestore.rules

# 然后运行:
gcloud builds submit --config cloudbuild.yaml --project gen-lang-client-0960644135
```

**数据采集 Jobs 部署**:
```bash
# deploy-jobs.sh 会自动创建临时的 .gcloudignore:
# (包含额外排除: scripts/fec-data/, scripts/test/, scripts/*.py, scripts/*.sh)

# 运行部署脚本:
cd /Users/xuling/code/Stanse
bash scripts/company-ranking/deploy-jobs.sh

# 脚本会自动:
# 1. 备份当前 .gcloudignore
# 2. 创建临时 .gcloudignore (排除大文件)
# 3. 构建 Docker 镜像
# 4. 恢复原 .gcloudignore
```

##### 7. **总结**

| 问题 | 答案 |
|------|------|
| **是并行的吗?** | ✅ 是的,完全并行运行 |
| **是同一个部署吗?** | ❌ 不是,是两个独立的 Cloud Run 资源 |
| **会影响前端部署吗?** | ❌ 不会,完全独立 |
| **会影响 Polis Protocol 吗?** | ❌ 不会,Polis 在前端服务中,Jobs 只管理数据 |
| **会影响用户体验吗?** | ✅ 正面影响:用户看到自动更新的最新数据 |
| **共享数据库吗?** | ✅ 是的,共享 Firebase Firestore |
| **可以分别部署吗?** | ✅ 是的,互不影响 |

这种架构被称为 **"数据管道"(Data Pipeline)** 模式,是现代云应用的标准做法:
- **后台 Jobs**: 负责数据采集和处理
- **前端 Service**: 负责展示数据和用户交互
- **共享数据库**: 作为两者之间的桥梁

完全安全,互不干扰!

---

## 部署完成总结

### ✅ 已完成任务

自动化数据采集系统已于 **2025-12-27** 完成部署并投入运行。

#### 1. **Cloud Run Jobs 部署**

成功部署 3 个无服务器数据采集任务:

| Job 名称 | 功能 | 状态 | 控制台链接 |
|---------|------|------|-----------|
| `fec-donations-collector` | FEC 政治捐款数据采集 | ✅ 运行中 | [查看详情](https://console.cloud.google.com/run/jobs/details/us-central1/fec-donations-collector?project=837715360412) |
| `esg-scores-collector` | ESG 环境/社会/治理评分采集 | ✅ 运行中 | [查看详情](https://console.cloud.google.com/run/jobs/details/us-central1/esg-scores-collector?project=837715360412) |
| `polygon-news-collector` | Polygon 新闻数据采集 | ✅ 运行中 | [查看详情](https://console.cloud.google.com/run/jobs/details/us-central1/polygon-news-collector?project=837715360412) |

#### 2. **权限配置修复**

为确保 Cloud Run Jobs 正常运行,已授予以下 IAM 权限:

- ✅ `roles/secretmanager.secretAccessor` - 访问 Secret Manager 中的 API 密钥
- ✅ `roles/datastore.user` - Firestore 数据库写入权限
- ✅ `roles/run.invoker` - Cloud Scheduler 调用 Cloud Run Jobs 权限

**Service Account**: `837715360412-compute@developer.gserviceaccount.com`

#### 3. **Email 告警系统**

已配置完整的失败通知系统:

- **通知渠道**: Email → `lxu912@gmail.com`
- **监控对象**: 所有 3 个 Cloud Run Jobs
- **告警触发**: 任务执行失败时立即发送邮件
- **告警内容**: 包含失败原因、排查步骤、恢复命令等完整文档

**告警策略 ID**:
- FEC Donations Alert: `15011393813760817581`
- ESG Scores Alert: `13234712702522460003`
- Polygon News Alert: `18170614865456228003`

**通知渠道 ID**: `projects/gen-lang-client-0960644135/notificationChannels/1503951921727123457`

#### 4. **Cloud Scheduler 自动化调度**

已创建 3 个定时任务,自动触发数据采集:

| 调度器名称 | Cron 表达式 | 执行频率 | 时区 | 下次执行时间 |
|-----------|------------|---------|------|-------------|
| `fec-donations-weekly` | `0 8 * * 1` | 每周一 8:00 AM | PST | 2025-12-29 08:00 |
| `esg-scores-weekly` | `0 8 * * 2` | 每周二 8:00 AM | PST | 2025-12-30 08:00 |
| `polygon-news-daily` | `0 9 * * *` | 每天 9:00 AM | PST | 2025-12-28 09:00 |

**调度频率说明**:
- **FEC Donations (每周)**: FEC 政治捐款数据更新不频繁,每周采集一次即可
- **ESG Scores (每周)**: ESG 评分数据通常按季度更新,每周检查确保及时获取
- **Polygon News (每天)**: 新闻数据每天更新,需要每日采集保持时效性

#### 5. **完整系统架构文档**

已添加详细的架构说明文档 (本文档),包括:
- ✅ Cloud Run Jobs vs Cloud Run Service 独立性说明
- ✅ Docker 构建配置和依赖管理
- ✅ `.gcloudignore` 文件优化 (避免上传 7.4 GiB 大文件)
- ✅ 部署、监控、故障排查完整指南
- ✅ 成本估算和更新流程

---

### 🔄 系统运行机制

**完整数据流**:
```
1. Cloud Scheduler (定时触发)
   ↓
2. Cloud Run Jobs (容器启动,执行 Python 脚本)
   ↓
3. 外部 API 调用 (FEC/FMP/Polygon APIs)
   ↓
4. Secret Manager (获取 API 密钥)
   ↓
5. Firestore 写入 (带版本控制: current + 历史记录)
   ↓
6. 前端/后端读取 (用户看到最新数据)
   ↓
7. 失败时 → Email 告警 → lxu912@gmail.com
```

**数据版本控制**:
- **Current 版本**: 存储在 `current` 子文档,供前端快速读取
- **历史版本**: 每次更新创建带时间戳的历史记录 (格式: `YYYY-MM-DD_HH-mm`)
- **版本查询**: 可追溯任意时间点的数据状态

---

### 📊 下次执行时间

基于当前时间 (2025-12-27),各任务的下次执行时间:

| 任务 | 下次执行日期 | 执行时间 (PST) | 倒计时 |
|------|-------------|---------------|--------|
| **Polygon News** | 2025-12-28 (明天) | 9:00 AM | ~13 小时 |
| **FEC Donations** | 2025-12-29 (周一) | 8:00 AM | ~2 天 |
| **ESG Scores** | 2025-12-30 (周二) | 8:00 AM | ~3 天 |

---

### 🛠️ 手动管理命令

#### 查看所有调度器状态
```bash
gcloud scheduler jobs list --location=us-central1 --project=gen-lang-client-0960644135
```

#### 手动触发单个任务 (测试)
```bash
# 触发 FEC 数据采集
gcloud scheduler jobs run fec-donations-weekly --location=us-central1 --project=gen-lang-client-0960644135

# 触发 ESG 数据采集
gcloud scheduler jobs run esg-scores-weekly --location=us-central1 --project=gen-lang-client-0960644135

# 触发 Polygon 新闻采集
gcloud scheduler jobs run polygon-news-daily --location=us-central1 --project=gen-lang-client-0960644135
```

#### 直接执行 Cloud Run Job (绕过调度器)
```bash
# 直接执行 ESG 采集任务并等待完成
gcloud run jobs execute esg-scores-collector --region=us-central1 --project=gen-lang-client-0960644135 --wait
```

#### 查看执行日志
```bash
# 查看所有 Cloud Run Jobs 日志 (最近 50 条)
gcloud logging read 'resource.type=cloud_run_job' --limit=50 --project=gen-lang-client-0960644135

# 查看特定 Job 的日志
gcloud logging read "resource.type=cloud_run_job AND resource.labels.job_name=esg-scores-collector" \
    --limit=100 --project=gen-lang-client-0960644135

# 实时查看执行日志 (手动触发时)
gcloud run jobs execute polygon-news-collector --region=us-central1 --project=gen-lang-client-0960644135 --wait
```

#### 查看 Cloud Scheduler 历史
```bash
# 查看调度器详细配置
gcloud scheduler jobs describe fec-donations-weekly --location=us-central1 --project=gen-lang-client-0960644135

# 查看调度执行日志
gcloud logging read "resource.type=cloud_scheduler_job AND resource.labels.job_name=fec-donations-weekly" \
    --limit=50 --project=gen-lang-client-0960644135
```

#### 查看告警策略状态
```bash
# 列出所有告警策略
gcloud alpha monitoring policies list --project=gen-lang-client-0960644135

# 查看通知渠道
gcloud alpha monitoring channels list --project=gen-lang-client-0960644135
```

---

### 💰 运行成本估算

基于当前配置,预计每月运行成本:

| 服务 | 用量估算 | 月成本 (USD) |
|------|---------|-------------|
| **Cloud Run Jobs** | 3 jobs × 10 分钟/次 × 15 次/月 | $2-3 |
| **Cloud Scheduler** | 3 个定时任务 | $0.30 |
| **Container Registry** | ~500MB 镜像存储 | $0.10 |
| **Cloud Logging** | 日志存储 (50MB/月) | $0.50 |
| **Cloud Monitoring** | 3 个告警策略 + Email 通知 | $0.50 |
| **Firestore 写入** | ~1,500 次写入/月 | 免费 (在免费配额内) |
| **Secret Manager** | 3 个 Secret 访问 | 免费 (在免费配额内) |
| **总计** | | **~$3.40-4.40/月** |

**成本优化建议**:
- Cloud Run Jobs 仅在执行时计费,执行完成后立即停止
- 调度频率已根据数据更新频率优化 (每周 vs 每天)
- Firestore 和 Secret Manager 访问量在 Google Cloud 免费配额内

---

### 🚀 系统状态

**部署日期**: 2025-12-27
**系统状态**: ✅ 完全运行中
**最后测试**: 2025-12-27 (ESG Scores Collector 手动测试成功)
**下次自动执行**: 2025-12-28 09:00 AM PST (Polygon News)

**部署成果**:
- ✅ 3 个 Cloud Run Jobs 已部署并健康运行
- ✅ 3 个 Cloud Scheduler 定时任务已激活
- ✅ 3 个 Email 告警策略已配置
- ✅ 所有 IAM 权限已正确授予
- ✅ Docker 镜像已构建并推送到 Container Registry
- ✅ `.gcloudignore` 已优化,前端/后端部署不再上传大文件
- ✅ 完整文档已更新

**自动化数据采集系统现已完全投入运行!** 🎉

---

### 下一步开发计划

1. ✅ 完成 Cloud Run Jobs 部署
2. ✅ 完成 Cloud Scheduler 配置
3. ✅ 完成 Email 告警系统配置
4. ⏳ 实现 CEO 言论分析脚本 (`04-analyze-executive-statements.py`)
5. ⏳ 实现综合评分算法 (`05-calculate-rankings.py`)
6. ⏳ 前端集成预计算的排名数据
