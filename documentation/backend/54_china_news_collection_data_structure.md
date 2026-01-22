# 54. China News Collection Data Structure

## 概述

本文档详细记录了 `news_stanseradar_china` Firestore collection 的完整数据结构。该 collection 存储中文区专有的新闻数据，每个文档代表一个特定时间点的新闻快照。

## Firebase 项目信息

- **Project Name**: StanseProject
- **Project ID**: stanseproject
- **Project Number**: 626045766180
- **Source Project**: gen-lang-client-0960644135

## 文档命名规范

文档 ID 格式: `YYYY-MM-DD_HH-MM`

**示例**: `2026-01-22_07-01` (2026年1月22日 07:01)

## 完整数据结构

### 1. METADATA (元数据)

存储文档的基本配置和版本信息。

```typescript
metadata: {
  mode: string;              // 运行模式，例如: "current"
  version: string;           // 版本号，例如: "5.0.0"
  source_project: string;    // 来源项目，例如: "gen-lang-client-0960644135"
  timezone: string;          // 时区，例如: "Asia/Shanghai"
  display_mode: string;      // 显示模式，例如: "keyword"
  doc_id: string;           // 文档ID，例如: "2026-01-22_07-01"
  created_at: Timestamp;    // 创建时间戳
}
```

**实际数据示例**:
```json
{
  "mode": "current",
  "version": "5.0.0",
  "source_project": "gen-lang-client-0960644135",
  "timezone": "Asia/Shanghai",
  "display_mode": "keyword",
  "doc_id": "2026-01-22_07-01",
  "created_at": "2026-01-21T23:01:25.587Z"
}
```

### 2. TIME (时间信息)

存储爬取和生成的时间信息。

```typescript
time: {
  beijing_time: string;      // 北京时间字符串，例如: "2026-01-22 07:01:24"
  generated_at: Timestamp;   // 生成时间戳
  crawl_date: string;        // 爬取日期，例如: "2026-01-22"
  crawl_time: string;        // 爬取时间，例如: "07:01"
}
```

**实际数据示例**:
```json
{
  "beijing_time": "2026-01-22 07:01:24",
  "generated_at": "2026-01-21T23:01:25.587Z",
  "crawl_date": "2026-01-22",
  "crawl_time": "07:01"
}
```

### 3. HOTLIST_NEWS (热榜新闻)

核心数据结构，存储分组的新闻列表。

```typescript
hotlist_news: {
  // 新新闻区块（用于标记新出现的新闻）
  new_news_section: {
    has_new: boolean;              // 是否有新新闻
    keyword_groups: KeywordGroup[]; // 新新闻的关键词分组
  };

  // 主要的关键词分组数组
  keyword_groups: KeywordGroup[];
}

// KeywordGroup 结构
interface KeywordGroup {
  keyword?: string;          // 关键词（可选，无关键词表示综合热榜）
  news_items: NewsItem[];    // 该组下的新闻列表
}

// NewsItem 结构
interface NewsItem {
  title: string;              // 新闻标题
  url: string;                // 新闻URL
  mobile_url: string;         // 移动端URL（可能为空）
  rank: number;               // 排名数字
  rank_display: string;       // 排名显示，例如: "#2"
  rank_class: string;         // 排名类别，例如: "rank-hot" 或 "rank-normal"
  platform_name: string;      // 平台名称（可能为空）
  platform_id: string;        // 平台ID（可能为空）
  first_crawl_time: string;   // 首次爬取时间，例如: "07-01"
  last_crawl_time: string;    // 最后爬取时间，例如: "07-01"
  crawl_count: number;        // 爬取次数
  is_new: boolean;            // 是否为新新闻
}
```

**实际数据示例**:
```json
{
  "keyword_groups": [
    {
      "keyword": null,
      "news_items": [
        {
          "title": "美国贸易代表：想和中国再谈谈，但不谈稀土",
          "url": "https://news.ifeng.com/c/8q65PAAxlSy",
          "mobile_url": "",
          "rank": 2,
          "rank_display": "#2",
          "rank_class": "rank-hot",
          "platform_name": "",
          "platform_id": "",
          "first_crawl_time": "07-01",
          "last_crawl_time": "07-01",
          "crawl_count": 1,
          "is_new": false
        }
      ]
    }
  ]
}
```

**典型文档统计**:

**文档 2026-01-22_09-01** (较新):
- 总共 10 个 keyword_group
- 总新闻: 53 条
- Group 0: 17 条新闻
- Group 1: 14 条新闻
- Group 2: 8 条新闻
- Group 3: 5 条新闻
- Group 4: 3 条新闻
- Groups 5-9: 各 1-2 条不等

**文档 2026-01-22_07-01** (较早):
- 总共 8 个 keyword_group
- 总新闻: ~37 条
- Group 0: 14 条新闻
- Group 1: 11 条新闻
- Group 2: 5 条新闻
- Groups 3-7: 1-4 条新闻不等

### 4. STATISTICS (统计信息)

存储详细的统计数据。**注意：这是版本 5.0.0 新增的完整统计结构。**

```typescript
statistics: {
  platforms: {
    total: number;        // 总平台数
    success: number;      // 成功爬取的平台数
    failed: number;       // 失败的平台数
  };
  rss: {
    total: number;        // RSS 总数
    new: number;          // 新 RSS 数
    matched: number;      // 匹配的 RSS 数
    filtered: number;     // 过滤的 RSS 数
  };
  hotlist: {
    total: number;        // 热榜总新闻数
    new: number;          // 新热榜新闻数
    matched: number;      // 匹配的热榜新闻数
  };
  combined: {
    total: number;        // 总计新闻数
    new: number;          // 总新数
    matched: number;      // 总匹配数
  };
}
```

**实际数据示例** (基于 2026-01-22_09-01):
```json
{
  "platforms": {
    "total": 11,
    "success": 11,
    "failed": 0
  },
  "rss": {
    "total": 0,
    "new": 0,
    "matched": 3,
    "filtered": 0
  },
  "hotlist": {
    "total": 53,
    "new": 0,
    "matched": 53
  },
  "combined": {
    "total": 53,
    "new": 0,
    "matched": 56
  }
}
```

### 5. AI_ANALYSIS (AI 分析)

存储 AI 分析的配置和结果。

```typescript
ai_analysis: {
  enabled: boolean;           // 是否启用 AI 分析
  provider: string;           // AI 提供商，例如: "gemini"
  model: string;              // AI 模型，例如: "gemini-2.5-flash"
  push_mode: string;          // 推送模式，例如: "both"
  result: string;             // AI 分析结果文本（可能很长）
  statistics?: {              // 统计信息（可选）
    total_analyzed?: number;  // 总分析数
    success_count?: number;   // 成功数
    failed_count?: number;    // 失败数
  };
}
```

**实际数据示例**:
```json
{
  "enabled": true,
  "provider": "gemini",
  "model": "gemini-2.5-flash",
  "push_mode": "both",
  "result": "[AI分析结果文本...]"
}
```

### 6. EMAIL (邮件配置)

存储邮件发送的相关信息。

```typescript
email: {
  from_name: string;          // 发件人名称，例如: "StanseRadar News"
  from_email: string;         // 发件人邮箱
  to_emails: string[];        // 收件人邮箱列表
  subject: string;            // 邮件主题
  report_type: string;        // 报告类型，例如: "实时当前榜单"
  sent_at: Timestamp;         // 发送时间戳
}
```

**实际数据示例**:
```json
{
  "from_name": "StanseRadar News",
  "from_email": "lxu912@gmail.com",
  "to_emails": ["lxu912@gmail.com", "caiy248@newschool.edu"],
  "subject": "StanseRadar 热点分析报告 - 实时当前榜单 - 01月22日 07:01",
  "report_type": "实时当前榜单",
  "sent_at": "2026-01-21T23:01:25.587Z"
}
```

### 7. HTML_CONTENT & HTML_TRUNCATED (HTML 内容)

存储生成的 HTML 报告内容。

```typescript
html_content: string;         // HTML 内容（可能很长，约 60KB+）
html_truncated: boolean;      // 是否被截断
```

**典型数据**:
- `html_content`: 约 63,815 字符
- `html_truncated`: false

### 8. RSS_FEEDS (RSS 订阅)

存储 RSS 订阅源的结构化数据。

```typescript
rss_feeds: {
  new_items: RSSFeedItem[];           // 新 RSS 项目
  matched_items: RSSMatchedFeed[];    // 匹配的 RSS 项目
}

interface RSSMatchedFeed {
  feed_name: string;                   // Feed 名称，例如: "Unknown Feed"
  feed_id: string;                     // Feed ID
  match_count: number;                 // 匹配数量
  items: RSSItem[];                    // RSS 项目列表
}

interface RSSItem {
  title: string;                       // 文章标题
  url: string;                         // 文章 URL
  author: string;                      // 作者/来源
  summary: string;                     // 摘要
  published_at: string;                // 发布时间
  published_at_string: string;         // 发布时间字符串
  crawl_time: string;                  // 爬取时间，例如: "07:01"
  age_days: number;                    // 文章天数
  is_new: boolean;                     // 是否新文章
  is_fresh: boolean;                   // 是否新鲜
}
```

**实际数据示例** (基于 2026-01-22_09-01):
```json
{
  "new_items": [],
  "matched_items": [
    {
      "feed_name": "Hacker News",
      "feed_id": "hacker-news",
      "match_count": 3,
      "items": [
        {
          "title": "Waiting for dawn in search: Search index, Google rulings and impact on Kagi",
          "url": "https://blog.kagi.com/waiting-dawn-search",
          "author": "josephwegner",
          "summary": "",
          "published_at": "2026-01-21T17:28:03",
          "published_at_string": "2026-01-21T17:28:03",
          "crawl_time": "09:01",
          "age_days": 0,
          "is_new": false,
          "is_fresh": true
        }
      ]
    }
  ]
}
```

**重要说明**：
- RSS 数据结构完整性因文档而异：
  - 较新文档（如 09-01）：包含完整的 title、url、author 等信息 ✅
  - 较旧文档（如 07-01）：可能只有元数据，title/url 为空字符串 ⚠️
- **HTML 内容始终包含完整的 RSS 数据**（已渲染）
- 邮件中显示的 RSS 内容来自 `html_content` 字段
- 如果需要获取 RSS 数据，优先使用 `rss_feeds` 字段（如果有数据），否则解析 `html_content`

**HTML 中的 RSS 内容示例**（从 `html_content` 提取）：

```
RSS 订阅更新 - 7 条

AI 相关 - 4 条
  • 01-22 05:40 Hacker News
    Show HN: Grov – Multiplayer for AI coding agents
    https://github.com/TonyStef/Grov

  • 01-22 05:11 Hacker News
    What if AI is both good and not that disruptive?

  • 01-22 05:07 Hacker News
    eBay explicitly bans AI "buy for me" agents

OpenAI / Claude - 2 条
  • 01-22 03:45 Hacker News
    OpenAI API Logs: Unpatched data exfiltration

  • 01-22 00:04 Hacker News
    Claude's new constitution

微软 / 谷歌 / 苹果 - 1 条
  • 01-22 01:28 Hacker News
    Waiting for dawn in search: Search index, Google rulings
```

### 9. FAILED_PLATFORMS (失败平台)

记录爬取失败的平台列表（可能为空数组）。

```typescript
failed_platforms?: Array<any>; // 失败的平台列表
```

## 数据访问方式

### 前端访问（浏览器控制台）

在 `/Users/xuling/code/Stanse/utils/queryChinaNews.ts` 中提供了三个工具函数：

```typescript
// 1. 查询特定文档
queryChinaNewsDocument('2026-01-22_07-01')

// 2. 列出所有文档 ID（限制数量）
listChinaNewsDocuments(10)

// 3. 分析整个 collection 的统计信息
analyzeChinaNewsCollection()
```

这些函数已在 `FeedView.tsx` 中导入，可在浏览器开发者控制台中直接调用。

### Firebase REST API 访问

```bash
curl "https://firestore.googleapis.com/v1/projects/stanseproject/databases/(default)/documents/news_stanseradar_china/2026-01-22_07-01?key=YOUR_API_KEY"
```

## 数据特点

1. **时间戳格式**: 使用 ISO 8601 格式的 Timestamp
2. **中文内容**: 所有新闻标题和内容都是中文
3. **实时性**: 每小时生成一次快照（根据文档 ID 判断）
4. **结构化分组**: 新闻按关键词或热榜分组
5. **AI 增强**: 包含 Gemini AI 的分析结果
6. **邮件集成**: 每次更新都会发送邮件通知

## 典型新闻标题示例

```
"美国贸易代表：想和中国再谈谈，但不谈稀土"
"英国批准中国在伦敦新建使馆，凤凰记者实地探访"
"中国第二个5万亿城市诞生"
"中国 GDP 首破 140 万亿增速 5%，140 万亿意味着什么？"
"日债风暴叠加格陵兰危机，'抛售美国'重现，美股债汇三杀"
```

## 数据来源平台

从 URL 分析，新闻来源包括：
- 凤凰网 (ifeng.com)
- 头条 (toutiao.com)
- 澎湃新闻 (thepaper.cn)
- 知乎 (zhihu.com)

## 注意事项

1. **API Key 安全**: 所有访问必须从 Secret Manager 获取 API Key，不得硬编码
2. **数据量**: 单个文档可能包含 100KB+ 的数据（包括 HTML 内容）
3. **更新频率**: 文档按小时更新，需要考虑缓存策略
4. **跨项目访问**: 该 collection 位于 gen-lang-client-0960644135 项目，通过跨项目 Firestore 访问

## 相关文档

- [51_cross_project_firestore_access.md](./51_cross_project_firestore_access.md) - 跨项目 Firestore 访问
- [52_multilanguage_news_feed_architecture.md](./52_multilanguage_news_feed_architecture.md) - 多语言新闻架构

## 更新日期

- 创建日期: 2026-01-21
- 最后更新: 2026-01-22 (基于文档 2026-01-22_09-01)
- 数据版本: 5.0.0
