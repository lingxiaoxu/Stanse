# 16. China News Broadcast Implementation

## 概述

实现了中文新闻播报系统，在 Feed 界面下方展示整合后的中国新闻速报。仅在用户选择中文语言时显示。

## 系统架构

```
news_stanseradar_china (原始数据)
          ↓
Firebase Function: onChinaNewsCreate
          ↓
1. 提取所有新闻标题（清理符号）
2. 解析 AI 分析（7个字段）
3. 提取并翻译 RSS 标题（Gemini API）
          ↓
整合成播报稿
          ↓
存储到 news_stanseradar_china_consolidated
          ↓
前端实时监听并显示（仅中文）
```

---

## 实现的文件

### Backend (Firebase Functions)

#### 1. [functions/src/china-news-listener.ts](../../functions/src/china-news-listener.ts)

**功能**：
- 监听 `news_stanseradar_china` collection 的新文档创建
- 从 **Secret Manager** 获取 Gemini API Key（安全）
- 提取并清理所有 keyword groups 的新闻标题
- 解析 AI_ANALYSIS 的 result JSON（包含全部字段）
- 翻译 RSS feeds 的英文标题为中文
- 整合成播报稿并存储

**关键函数**：
```typescript
// Secret Manager 集成
async function getGeminiApiKey(): Promise<string>

// 翻译服务
async function translateToChineseServerSide(text: string): Promise<string>

// 播报稿生成
async function generateBroadcast(data: any): Promise<string>

// 主函数
export const onChinaNewsCreate
```

**配置**：
- Region: `us-central1`
- Timeout: 540 秒
- Memory: 512MiB

**导出位置**：[functions/src/index.ts:1074](../../functions/src/index.ts#L1074)

---

### Frontend Services

#### 2. [services/chinaNewsService.ts](../../services/chinaNewsService.ts)

**功能**：
- 获取最新播报数据
- 实时监听播报更新
- 按文档 ID 查询

**API**：
```typescript
// 获取最新播报
getLatestChinaNewsBroadcast(): Promise<ChinaNewsBroadcastData | null>

// 实时监听
subscribeToLatestChinaNewsBroadcast(callback): () => void

// 按 ID 查询
getChinaNewsBroadcastByDocId(docId: string): Promise<ChinaNewsBroadcastData | null>
```

**数据接口**：
```typescript
interface ChinaNewsBroadcastData {
  metadata: { source_doc_id, version, ... };
  time: { beijing_time, crawl_date, ... };
  statistics: { platforms, rss, hotlist, combined };
  broadcast: string;  // 整合后的播报稿
  broadcast_length: number;
  language: 'zh';
  processing: { translated_rss, extracted_news, has_ai_analysis };
}
```

#### 3. [services/translationService.ts](../../services/translationService.ts)

**功能**：
- 检测文本语言（英文/中文）
- 使用 Gemini 翻译英文为中文
- 批量翻译优化

**API**：
```typescript
isEnglish(text: string): boolean
translateToChineseWithGemini(text: string): Promise<string>
batchTranslate(texts: string[]): Promise<string[]>
translateRSSHeadlines(rssItems): Promise<string[]>
```

**安全性**：使用 `process.env.GEMINI_API_KEY`

#### 4. [services/chinaNewsBroadcastService.ts](../../services/chinaNewsBroadcastService.ts)

**功能**：
- 提取和清理新闻标题
- 解析 AI 分析结果
- 格式化情绪和跨平台分析
- 整合成播报稿

**API**：
```typescript
generateNewsBroadcast(data: ChinaNewsData): Promise<string>
```

**注意**：主要逻辑已移至 Firebase Function，此文件保留供客户端使用（如果需要）

---

### Frontend Components

#### 5. [components/ChinaNewsBroadcast.tsx](../../components/ChinaNewsBroadcast.tsx)

**功能**：
- 展示整合后的中文新闻播报
- **仅在 `language === Language.ZH` 时显示**
- 样式与 THE MARKET 一致
- 实时监听数据更新

**UI 结构**：
```
THE CHINA
THE MOST AUTHENTIC CHINA NEWS
Aligned with: Chinese-American Conservative Socialist

┌─────────────────────────────────────────┐
│ 【今日摘要】                             │
│ 今日监测11个平台，共53条热榜新闻...      │
│                                          │
│ 【热点新闻】                             │
│ • 新闻标题1                              │
│ • 新闻标题2                              │
│                                          │
│ 【AI 深度分析】                          │
│ 今日新闻呈现以下特点：                   │
│ ▸ 主要话题：...                         │
│                                          │
│ 【国际科技动态】                         │
│ • 翻译后的 RSS 标题                      │
│                                          │
│ 【今日总结】                             │
│ ...                                      │
│                                          │
│ ─────────────────────────────────────── │
│ 2026-01-22 09:01 · 11个平台 · 53条新闻  │
└─────────────────────────────────────────┘
```

**字体样式**：
- 章节标题（【...】）: `font-bold text-lg` (新闻标题字体)
- 列表项（• ▸）: `font-mono text-sm fontWeight: 600` (新闻标题字体，稍粗)
- 段落内容: `font-mono text-sm` (新闻 body 字体)

**集成位置**：[components/views/FeedView.tsx:1429](../../components/views/FeedView.tsx#L1429)
- 在 Feed 最下方
- Load More 按钮之后
- 与 THE MARKET 间距一致（`mt-12`）

---

### Utils (Browser Console Testing)

#### 6. [utils/testChinaNewsBroadcast.ts](../../utils/testChinaNewsBroadcast.ts)

**浏览器控制台可用函数**：

```javascript
// 测试最新播报
testLatestBroadcast()

// 测试指定文档
testBroadcastByDocId('2026-01-22_09-01')

// 对比原始数据和播报数据
compareBroadcastData('2026-01-22_09-01')

// 显示格式化的播报内容
showFormattedBroadcast()
showFormattedBroadcast('2026-01-22_09-01')
```

**已导入到** [components/views/FeedView.tsx:18](../../components/views/FeedView.tsx#L18)

---

## 多语言翻译

### 新增翻译 Key

在 [contexts/LanguageContext.tsx](../../contexts/LanguageContext.tsx) 中添加：

```typescript
feed: {
  china_title: string;     // "THE CHINA" / "中国" / ...
  china_subtitle: string;  // "THE MOST AUTHENTIC CHINA NEWS" / "最真实的中国新闻" / ...
}
```

**所有语言**：
- **EN**: `china_title: "THE CHINA"`, `china_subtitle: "THE MOST AUTHENTIC CHINA NEWS"`
- **ZH**: `china_title: "中国"`, `china_subtitle: "最真实的中国新闻"`
- **JA**: `china_title: "中国"`, `china_subtitle: "最も本物の中国ニュース"`
- **FR**: `china_title: "LA CHINE"`, `china_subtitle: "LES NOUVELLES CHINOISES LES PLUS AUTHENTIQUES"`
- **ES**: `china_title: "CHINA"`, `china_subtitle: "LAS NOTICIAS MÁS AUTÉNTICAS DE CHINA"`

---

## Firestore Collection 结构

### news_stanseradar_china_consolidated

```typescript
{
  // 元数据
  metadata: {
    source_doc_id: "2026-01-22_09-01",
    source_collection: "news_stanseradar_china",
    version: "5.0.0",
    created_at: Timestamp,
    source_project: "gen-lang-client-0960644135",
    timezone: "Asia/Shanghai"
  },

  // 时间信息
  time: {
    beijing_time: "2026-01-22 09:01:12",
    crawl_date: "2026-01-22",
    crawl_time: "09:01",
    generated_at: Timestamp
  },

  // 统计信息（从源文档复制）
  statistics: {
    platforms: { total: 11, success: 11, failed: 0 },
    rss: { total: 0, new: 0, matched: 3, filtered: 0 },
    hotlist: { total: 53, new: 0, matched: 53 },
    combined: { total: 53, new: 0, matched: 56 }
  },

  // 整合后的播报稿
  broadcast: "[完整的播报稿文本...]",

  // 播报长度
  broadcast_length: 1234,

  // 语言
  language: "zh",

  // 处理信息
  processing: {
    translated_rss: 3,        // 翻译的 RSS 数量
    extracted_news: 53,       // 提取的新闻数量
    has_ai_analysis: true     // 是否包含 AI 分析
  }
}
```

---

## 播报稿模板

### 数据提取顺序

1. **今日摘要**
   - 平台数量：`statistics.platforms.success`
   - 热榜新闻：`statistics.hotlist.total`
   - RSS 订阅：`statistics.rss.matched`

2. **热点新闻**（前20条）
   - 从 `hotlist_news.keyword_groups[].news_items[]` 提取
   - 清理符号：零宽字符、多余空格、开头 #
   - 按 `rank` 排序

3. **AI 深度分析**
   - 解析 `ai_analysis.result` JSON
   - 提取字段：
     - `keyword_analysis` → 主要话题（前3个）
     - `sentiment` → 情绪倾向
     - `signals` → 关键信号（前2个）
     - `cross_platform` → 跨平台热度

4. **国际科技动态**
   - 从 `rss_feeds.matched_items[].items[]` 提取标题
   - 检测英文并翻译为中文

5. **今日总结**
   - `ai_analysis.result.conclusion` 或 `summary`

### 示例输出

```
【今日摘要】
今日监测11个平台，共53条热榜新闻，3条国际科技订阅。以下是今日重点新闻播报：

【热点新闻】
• 美国贸易代表：想和中国再谈谈，但不谈稀土
• 英国批准中国在伦敦新建使馆，凤凰记者实地探访
• 中国第二个5万亿城市诞生
• U23亚洲杯历史性晋级决赛：胜利对中国足球真的很重要
• 中国 GDP 首破 140 万亿增速 5%，140 万亿意味着什么？
... (更多新闻)

【AI 深度分析】
今日新闻呈现以下特点：
▸ 主要话题：中美贸易、经济数据、国际关系
▸ 情绪倾向：整体中性偏正面，市场信心稳定
▸ 关键信号：GDP数据超预期，国际地位持续提升
▸ 跨平台热度：贸易话题覆盖8个平台，讨论度最高

【国际科技动态】
• 等待搜索引擎的黎明：搜索索引、谷歌裁决及对 Kagi 的影响
• Claude 的新宪法：Anthropic 发布 AI 伦理更新
• Autonomous 招聘：零佣金 AI 原生理财顾问

【今日总结】
今日新闻聚焦中国经济增长与国际影响力提升，GDP突破140万亿大关...
```

---

## 安全性

### Gemini API Key 管理

**Backend (Firebase Functions)**:
```typescript
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

const secretClient = new SecretManagerServiceClient();
const CLOUD_RUN_PROJECT_ID = 'gen-lang-client-0960644135';
const GEMINI_SECRET_NAME = 'GEMINI_API_KEY';

// Cache for API key
let geminiApiKey: string | null = null;

async function getGeminiApiKey(): Promise<string> {
  if (geminiApiKey) return geminiApiKey;

  const [version] = await secretClient.accessSecretVersion({
    name: `projects/${CLOUD_RUN_PROJECT_ID}/secrets/${GEMINI_SECRET_NAME}/versions/latest`,
  });

  const payload = version.payload?.data?.toString();
  if (payload) {
    geminiApiKey = payload;
    return payload;
  }

  return '';
}
```

**Frontend**:
```typescript
const apiKey = process.env.GEMINI_API_KEY || '';
const ai = new GoogleGenAI({
  apiKey: apiKey,
  httpOptions: baseUrl ? { baseUrl } : undefined
});
```

**✅ 无 hardcoded API key**
**✅ 模仿 geminiService.ts 和 functions/src/index.ts 的模式**

---

## UI 实现细节

### 标题部分（与 THE MARKET 一致）

```tsx
<div className="text-center mb-3">
  <h2 className="font-pixel text-5xl">{t('feed', 'china_title')}</h2>
  <p className="font-mono text-xs text-gray-400">{t('feed', 'china_subtitle')}</p>
  {userProfile?.coordinates?.label && (
    <p className="font-mono text-[10px] text-gray-500 mt-1">
      {t('feed', 'aligned_with')}: {translatedPersona || userProfile.coordinates.label}
    </p>
  )}
</div>
```

**显示效果**：
```
THE CHINA
THE MOST AUTHENTIC CHINA NEWS
Aligned with: Chinese-American Conservative Socialist
```

### 内容卡片（与 Market Analysis 一致）

```tsx
<PixelCard>
  <BroadcastText text={broadcastData.broadcast} />

  {/* Footer */}
  <div className="mt-4 pt-3 border-t-2 border-gray-200">
    <p className="font-mono text-xs text-gray-400 text-center">
      {broadcastData.time.beijing_time} · {statistics}
    </p>
  </div>
</PixelCard>
```

### 文本样式规则

```typescript
// 章节标题（【...】）
<h4 className="font-bold text-lg mb-2 text-gray-900">
  {firstLine}
</h4>

// 列表项（• ▸）
<div className="font-mono text-sm" style={{ fontWeight: 600 }}>
  {line}
</div>

// 段落内容
<p className="font-mono text-sm text-gray-600 text-justify">
  {line}
</p>
```

---

## 条件渲染

### 仅中文显示

```typescript
// 组件内部
if (language !== Language.ZH) {
  return null;
}

// FeedView 集成
{hasCompletedOnboarding && (
  <ChinaNewsBroadcast />  // 组件内部处理语言判断
)}
```

---

## 数据更新策略

### 实时监听

```typescript
useEffect(() => {
  if (language !== Language.ZH) return;

  // 订阅实时更新
  const unsubscribe = subscribeToLatestChinaNewsBroadcast((data) => {
    setBroadcastData(data);
  });

  return () => unsubscribe();
}, [language]);
```

### Firebase Function 触发

```typescript
// 每次 news_stanseradar_china 有新文档时自动触发
onDocumentCreated('news_stanseradar_china/{docId}', ...)

// 处理流程：
1. 提取数据
2. 翻译 RSS（3-5秒）
3. 生成播报稿
4. 存储到 consolidated collection
5. 前端自动更新（通过 onSnapshot）
```

---

## 测试指南

### 浏览器控制台测试

```javascript
// 1. 测试最新播报数据
testLatestBroadcast()

// 2. 查看格式化播报内容
showFormattedBroadcast()

// 3. 测试指定文档
testBroadcastByDocId('2026-01-22_09-01')

// 4. 对比原始数据和播报
compareBroadcastData('2026-01-22_09-01')

// 5. 查询原始数据（用于调试）
queryChinaNewsDocument('2026-01-22_09-01')
```

### 功能测试

1. **语言切换测试**
   - 切换到中文 → 显示播报框
   - 切换到英文 → 隐藏播报框
   - 切换回中文 → 重新显示

2. **实时更新测试**
   - 等待下一个小时的新数据
   - 观察播报内容自动更新

3. **样式一致性测试**
   - 对比 THE MARKET 标题样式
   - 检查 PixelCard 边框和间距
   - 验证字体大小和粗细

---

## 部署步骤

### 1. 部署 Firebase Functions

```bash
cd functions
npm install
npm run build
firebase deploy --only functions:onChinaNewsCreate
```

### 2. 配置 Firestore Rules

在 `firestore.rules` 中添加：

```
match /news_stanseradar_china_consolidated/{docId} {
  allow read: if true;  // 所有用户可读
  allow write: if false; // 仅 Functions 可写
}
```

### 3. 部署前端

```bash
npm run build
# 或部署到 Firebase Hosting
firebase deploy --only hosting
```

### 4. 验证

- 检查 Firebase Console > Functions > onChinaNewsCreate 是否部署成功
- 查看 Functions 日志确认触发和执行
- 在前端切换到中文，查看是否显示播报

---

## 性能优化

### Backend

1. **API Key 缓存**：首次加载后缓存，避免重复访问 Secret Manager
2. **批量翻译**：使用 `Promise.all` 并发翻译多个 RSS 标题
3. **超时设置**：540秒 timeout 确保翻译完成

### Frontend

1. **条件加载**：仅在中文时加载数据
2. **实时监听**：使用 Firestore `onSnapshot` 自动更新
3. **组件记忆**：可添加 `React.memo` 优化渲染

---

## 错误处理

### Backend

```typescript
// 翻译失败 fallback
catch (error) {
  console.error('Translation failed:', error);
  return text;  // 返回原文
}

// 播报生成失败 fallback
catch (error) {
  console.error('Failed to generate broadcast:', error);
  return '无法生成新闻播报，请稍后重试。';
}
```

### Frontend

```typescript
// 加载失败显示
if (loading) {
  return <div>加载中...</div>;
}

if (!broadcastData) {
  return null;  // 静默失败，不显示错误
}
```

---

## 相关文档

- [54_china_news_collection_data_structure.md](../backend/54_china_news_collection_data_structure.md) - 原始数据结构
- [54_china_news_data_structure_visual.md](../backend/54_china_news_data_structure_visual.md) - 数据结构可视化
- [15_china_news_feed_ui_design_v2.md](./15_china_news_feed_ui_design_v2.md) - UI 设计文档

---

## 文件清单

### Backend
- ✅ `functions/src/china-news-listener.ts` - Firebase Function
- ✅ `functions/src/index.ts` - 导出 Function

### Frontend Services
- ✅ `services/chinaNewsService.ts` - 数据获取
- ✅ `services/translationService.ts` - 翻译服务
- ✅ `services/chinaNewsBroadcastService.ts` - 播报生成

### Frontend Components
- ✅ `components/ChinaNewsBroadcast.tsx` - 主组件
- ✅ `components/views/FeedView.tsx` - 集成

### Utils
- ✅ `utils/queryChinaNews.ts` - 原始数据查询
- ✅ `utils/testChinaNewsBroadcast.ts` - 播报测试

### Translations
- ✅ `contexts/LanguageContext.tsx` - 多语言翻译

### Documentation
- ✅ `documentation/frontend/15_china_news_feed_ui_design_v2.md`
- ✅ `documentation/frontend/16_china_news_broadcast_implementation.md`
- ✅ `documentation/backend/54_china_news_collection_data_structure.md`
- ✅ `documentation/backend/54_china_news_data_structure_visual.md`

---

## 实现状态

| 任务 | 状态 | 文件 |
|------|------|------|
| Firebase Function 监听器 | ✅ | china-news-listener.ts |
| Secret Manager 集成 | ✅ | china-news-listener.ts |
| RSS 翻译服务 | ✅ | china-news-listener.ts, translationService.ts |
| 播报稿生成 | ✅ | china-news-listener.ts, chinaNewsBroadcastService.ts |
| 数据存储到 consolidated | ✅ | china-news-listener.ts |
| 前端数据服务 | ✅ | chinaNewsService.ts |
| UI 组件 | ✅ | ChinaNewsBroadcast.tsx |
| 集成到 FeedView | ✅ | FeedView.tsx |
| 多语言翻译 | ✅ | LanguageContext.tsx |
| 浏览器测试工具 | ✅ | testChinaNewsBroadcast.ts |
| 文档 | ✅ | 4个 markdown 文档 |

---

**实现完成日期**: 2026-01-22
**版本**: 1.0.0
**状态**: ✅ 就绪，等待部署和测试
