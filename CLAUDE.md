# Stanse — Claude Code Guide

## 项目概览
Stanse 是多语言政治新闻与辩论平台。
- **网站**: https://stanse.ai
- **Firebase 项目**: `stanseproject` (Project #: 626045766180)
- **主部署项目**: `gen-lang-client-0960644135` (Cloud Run + Cloud Build + Secret Manager)
- **支持语言**: EN / ZH / JA / FR / ES
- **技术栈**: React 19 + Vite + TypeScript + TailwindCSS + Firebase + Google Cloud Run

---

## 安全规则（全局强制执行）

> **Gemini API Key 以及所有 API keys 必须从 Google Secret Manager 调取，绝对不能 hardcoded，不能出现在代码或 .env 中**

```bash
# Secret Manager 项目
gcloud secrets list --project=gen-lang-client-0960644135

# 已有 secrets:
# gemini-api-key      — Gemini AI API
# polygon-api-key     — Polygon.io 股票新闻
# FMP_API_KEY         — Financial Modeling Prep (ESG)
# SENDGRID_API_KEY    — 邮件通知（stanseproject）
```

---

## 部署架构

### 两个 GCP 项目

| 项目 | 用途 |
|---|---|
| `gen-lang-client-0960644135` | 主前端 + Cloud Run 后端 + Secret Manager + Cloud Scheduler |
| `stanseproject` | Firebase Functions + Firestore + Realtime DB |

### Cloud Run 服务（gen-lang-client-0960644135）

| 服务名 | 类型 | URL | 说明 |
|---|---|---|---|
| `stanse` | Source | https://stanse.ai | 主前端（React + nginx） |
| `polis-protocol` | Container | https://polis-protocol-yfcontxnkq-uc.a.run.app | Rust 区块链服务 |
| `stanseagent` | Source | https://stanseagent-837715360412.us-central1.run.app | Next.js AI 代码生成 |
| `ember-api` | Function | https://ember-api-yfcontxnkq-uc.a.run.app | Python LLM 组合框架 |

### Firebase Cloud Functions（stanseproject，us-central1）

**新闻相关**
- `fetchGoogleNewsRSS` — callable，多语言 RSS 抓取
- `scheduledNewsFetch` — 定时 `0 3,7,11,15 * * *` UTC（EN/ZH/JA，4次/天）
- `checkBreakingNews` — 定时 `0,30 15-17,20-23 * * *`（EST 高峰期）
- `onNewsCreated`, `onBreakingNewsCreated`, `onChinaNewsCreate` — Firestore 触发

**地图/位置**
- `getGlobeMarkers`, `analyzeEntityLocation`, `onUserLocationUpdated`

**Duel Arena 对战**
- `runDuelMatchmaking` — 定时每 1 分钟
- `joinDuelQueue`, `leaveDuelQueue`, `checkDuelMatchmaking`
- `submitDuelAnswer`, `finalizeDuelMatch`
- `getDuelCredits`, `getDuelCreditHistory`, `addDuelCredits`, `refundDuelCredits`, `withdrawDuelCredits`
- `getDuelMatchSequence`, `getDuelQuestionStats`, `getDuelSequenceStats`
- `generateDuelSequences`, `validateDuelQuestions`, `populateDuelQuestions`

**订阅/计费**
- `processTrialEndCharges` — 定时每天 midnight UTC
- `processMonthlyRenewals` — 定时每月 1 日 midnight UTC

**其他**
- `cleanupStalePresence` — 定时
- `ssrstanseagent`, `ssrstanseproject` — HTTP functions

### Cloud Scheduler（gen-lang-client-0960644135，us-central1）

| 任务名 | 说明 |
|---|---|
| `enhanced-rankings-generator` | 公司排名计算 |
| `esg-scores-collector` | ESG 评分收集 |
| `executive-statements-analyzer` | 高管声明分析 |
| `fec-donations-collector` | FEC 政治捐款数据 |
| `polygon-news-collector` | Polygon 新闻收集 |
| `portfolio-return-tracker` | 投资组合追踪 |
| `stanseradar` | Stanse 雷达（asia-east1） |

---

## 常用命令

### 本地开发
```bash
npm run dev          # 启动本地开发服务器
npm run build        # 生产构建
```

### 部署主前端（Cloud Run）

> 部署使用项目根目录的 `cloudbuild.yaml`，流程：拉取 Secret Manager 里的 API keys → Docker build → push → Cloud Run deploy

```bash
# 在项目根目录执行（必须有 cloudbuild.yaml）
cd /Users/xuling/code/Stanse
gcloud builds submit --config=cloudbuild.yaml --project=gen-lang-client-0960644135

# 如果新 revision 流量未自动切换，手动更新：
gcloud run services update-traffic stanse \
  --to-latest --region=us-central1 --project=gen-lang-client-0960644135

# 检查流量分配
gcloud run services describe stanse \
  --region=us-central1 --format="value(status.traffic)" \
  --project=gen-lang-client-0960644135
```

**cloudbuild.yaml 做了什么：**
1. 从 Secret Manager 拉取 `gemini-api-key` 和 `polygon-api-key`
2. `docker build` 将 key 作为 build-arg 注入（不会 hardcode 进代码）
3. Push image 到 `gcr.io/gen-lang-client-0960644135/stanse:latest`
4. `gcloud run deploy stanse` 部署到 us-central1

### Firebase Functions
```bash
# 编译 TypeScript
cd functions && npm run build

# 部署单个 function
firebase deploy --only functions:fetchGoogleNewsRSS

# 部署所有 functions
firebase deploy --only functions

# 查看已部署的 functions
firebase functions:list

# 查看 function 日志
firebase functions:log --only fetchGoogleNewsRSS
firebase functions:log --only checkBreakingNews
```

### Firestore 索引
```bash
firebase deploy --only firestore:indexes
```

### Secret Manager
```bash
# 查看所有 secrets
gcloud secrets list --project=gen-lang-client-0960644135

# 查看 secret 值（谨慎）
gcloud secrets versions access latest --secret=gemini-api-key --project=gen-lang-client-0960644135

# 创建新 secret
echo -n "VALUE" | gcloud secrets create SECRET_NAME \
  --data-file=- --replication-policy="automatic" \
  --project=gen-lang-client-0960644135
```

### Git
```bash
git add <files>
git commit -m "type: description

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
git push origin main
```

---

## 关键文件

| 文件 | 说明 |
|---|---|
| `functions/src/index.ts` | 所有 Cloud Functions 入口 |
| `functions/src/news-rss-fetcher.ts` | Google News RSS 抓取 |
| `functions/src/scheduled-news-fetcher.ts` | 定时预缓存新闻 |
| `functions/src/breaking-news-checker.ts` | Breaking news 检测 |
| `services/agents/newsAgent.ts` | 新闻个性化 agent |
| `services/geminiService.ts` | Gemini LLM 集成 |
| `services/agents/types.ts` | Agent 类型定义 |
| `services/userPersonaService.ts` | 用户 persona + embeddings |
| `components/views/FeedView.tsx` | 主新闻 Feed UI（76KB） |
| `App.tsx` | 根组件，语言/认证状态 |
| `cloudbuild.yaml` | Cloud Build CI/CD |
| `firebase.json` | Firebase 配置 |
| `.gitignore` | 已覆盖所有敏感文件类型 |

---

## Firestore 数据结构（stanseproject）

```
news/                        # 主新闻（每语言独立文档，titleHash 跨语言关联）
news_embeddings/             # 768维向量缓存（text-embedding-004）
news_images/                 # GCS 图片 URL 缓存（120+ 预生成图片）
news_original/               # 完整文章内容
user_persona_embeddings/     # 用户 persona（5语言 × embeddings）
user_subscriptions/          # 订阅记录
  └── history/               # 账单历史
user_credits/                # Duel Arena 积分
  └── history/               # 积分历史
duel_matches/                # 对战记录
duel_matchmaking_queue/      # 匹配队列（Firestore）
duel_questions/              # 题目库
duel_sequences/              # 预生成题目序列
enhanced_company_rankings/   # 公司排名（缓存 15分钟）
breaking_news_notifications/ # Breaking news 记录
revenue/                     # 营收统计
subscription_events/         # 订阅事件日志
```

### Realtime Database（stanseproject-default-rtdb）
```
presence/{userId}            # 在线状态（断连自动清理）
matchmaking_queue/{userId}   # 实时匹配队列
active_matches/{matchId}     # 进行中的对战
```

---

## 新闻系统

### 流程
1. 客户端调用 `fetchGoogleNewsRSS` callable function
2. Cloud Function 向 Google News RSS 发请求（每语言独立 `Accept-Language` header）
3. 5个分类：POLITICS, TECH, MILITARY, WORLD, BUSINESS
4. `services/agents/newsAgent.ts` 用 Gemini embeddings 做个性化排序

### 语言 → Accept-Language
```
en → en-US,en;q=0.9
zh → zh-CN,zh;q=0.9,en;q=0.5
ja → ja-JP,ja;q=0.9,en;q=0.5
fr → fr-FR,fr;q=0.9,en;q=0.5
es → es-ES,es;q=0.9,en;q=0.5
```

### Breaking News 翻译流程
```
英文搜索 → TIER1/TIER2 过滤 → 并行翻译到 ZH/JA/FR/ES → 存 5 个独立文档（同 titleHash）
```

### 浏览器调试命令
```js
window.checkRSSStatus()       // 检查 RSS 健康状态
window.testRSSNow('es')       // 测试指定语言
window.cleanAllNews()         // 清空缓存新闻
window.compareLanguages()     // 对比各语言新闻数量
```

### 已知问题
- Google News 有时会 rate-limit Cloud Function IP → 503 错误
- 出现 0 条新闻时：检查 Cloud Function 日志是否有 HTTP 503
- FR/ES 之前因 `Accept-Language` hardcode 问题失败（2026-03-16 已修复）

---

## Duel Arena

- 匹配：每 1 分钟 `runDuelMatchmaking`
- 积分：`user_credits` Firestore collection（支持事务）
- 题目：`duel_questions` 预生成序列（30秒/45秒两种）
- 实时状态：Firebase Realtime Database（presence + queue）
- 对战结果：Firestore（永久记录）

---

## Polis Protocol（区块链）

- Rust 服务运行在 Cloud Run
- 用户身份：`did:polis:firebase:<userId>`
- Campaign 类型：BOYCOTT, BUYCOTT, PETITION, RALLY, VOTE, DONATE
- 客户端每 ~5 分钟心跳保持注册状态
- API: `https://polis-protocol-yfcontxnkq-uc.a.run.app/api/v1`

---

## 订阅/计费

- 月费：$29.99
- 试用结算：每天 midnight UTC（`processTrialEndCharges`）
- 月度续费：每月 1 日 midnight UTC（`processMonthlyRenewals`）
- 邮件通知：SendGrid（key 在 stanseproject Secret Manager）
- Admin email: lxu912@gmail.com

---

## 文档

所有技术文档在 `documentation/` 目录：
- `documentation/backend/` — 77+ 个后端文档
- `documentation/frontend/` — 27+ 个前端文档
- `documentation/00_documentation_index.md` — 完整索引
- 新增文档按序号命名：backend 用 `78_`+，frontend 用 `28_`+
