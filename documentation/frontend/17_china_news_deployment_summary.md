# 17. China News Broadcast - Deployment Summary

## 部署状态

### ✅ 已完成部署

| 组件 | 状态 | 时间 |
|------|------|------|
| Firestore Rules | ✅ 已部署 | 2026-01-22 |
| Firebase Function | ✅ 已部署 | 2026-01-22 |
| Frontend Code | ✅ 已完成 | 2026-01-22 |
| Dev Server | ✅ 运行中 | http://localhost:3001 |

---

## 部署的资源

### 1. Firebase Function

**Function Name**: `onChinaNewsCreate`
- **Region**: us-central1
- **Trigger**: Firestore Document Created
- **Collection**: `news_stanseradar_china/{docId}`
- **Timeout**: 540 seconds
- **Memory**: 512MiB
- **Runtime**: Node.js 20 (2nd Gen)

**功能**：
- 监听 `news_stanseradar_china` 新文档创建
- 提取所有新闻标题
- 解析 AI 分析结果
- 翻译 RSS 英文标题为中文（使用 Gemini）
- 整合成播报稿
- 存储到 `news_stanseradar_china_consolidated`

**Console**: https://console.firebase.google.com/project/stanseproject/functions

---

### 2. Firestore Rules

**新增规则**：
```
match /news_stanseradar_china_consolidated/{docId} {
  allow read: if true;  // All users can read
  allow write: if false; // Only Firebase Functions can write
}
```

**位置**: [firestore.rules:375-378](../../firestore.rules#L375-L378)

---

### 3. Firestore Collections

#### news_stanseradar_china_consolidated

**结构**：
```typescript
{
  metadata: {
    source_doc_id: "2026-01-22_09-01",
    source_collection: "news_stanseradar_china",
    version: "5.0.0",
    created_at: Timestamp,
    source_project: "gen-lang-client-0960644135",
    timezone: "Asia/Shanghai"
  },
  time: {
    beijing_time: "2026-01-22 09:01:12",
    crawl_date: "2026-01-22",
    crawl_time: "09:01",
    generated_at: Timestamp
  },
  statistics: {
    platforms: { total, success, failed },
    rss: { total, new, matched, filtered },
    hotlist: { total, new, matched },
    combined: { total, new, matched }
  },
  broadcast: "[整合后的播报稿文本]",
  broadcast_length: number,
  language: "zh",
  processing: {
    translated_rss: number,
    extracted_news: number,
    has_ai_analysis: boolean
  }
}
```

**权限**：
- Read: 所有用户 ✅
- Write: 仅 Firebase Functions ✅

---

## 工作流程

### 自动化流程

```
1. 每小时 news_stanseradar_china 收到新数据
           ↓
2. onChinaNewsCreate Function 自动触发
           ↓
3. 从 Secret Manager 获取 Gemini API Key
           ↓
4. 提取新闻标题（清理符号）
           ↓
5. 解析 AI 分析（7个字段）
           ↓
6. 翻译 RSS 英文标题（3-5秒）
           ↓
7. 整合成播报稿
           ↓
8. 存储到 news_stanseradar_china_consolidated
           ↓
9. 前端自动更新显示（onSnapshot）
```

**总处理时间**: 约 10-30 秒（取决于 RSS 数量）

---

## 前端访问

### UI 显示位置

```
Feed View
  ├── THE MARKET (Section 1)
  ├── THE FEED (Section 2)
  └── THE CHINA (Section 3) ⭐ 新增
      └── 仅在 language === Language.ZH 时显示
```

### 显示条件

- ✅ 用户必须完成 onboarding
- ✅ 语言设置必须为中文
- ✅ 有播报数据可用

### UI 样式

**标题**（与 THE MARKET 一致）：
```
THE CHINA
THE MOST AUTHENTIC CHINA NEWS
Aligned with: Chinese-American Conservative Socialist
```

**卡片样式**：
- 使用 `PixelCard` 组件
- 与 Market Analysis 样式完全一致
- 章节标题：新闻标题字体
- 列表项：加粗
- 段落：新闻 body 字体

---

## 测试步骤

### 1. 前端测试（开发服务器已启动）

访问: http://localhost:3001

**步骤**：
1. 登录账号
2. 确保已完成 onboarding
3. 切换语言到中文
4. 滚动到 Feed 最下方
5. 查看 "THE CHINA" 部分是否显示

**预期结果**：
- ✅ 标题显示：THE CHINA / 最真实的中国新闻
- ✅ 显示 "Aligned with: ..." 和翻译后的 persona
- ✅ 卡片内显示完整播报稿
- ✅ Footer 显示时间和统计信息

### 2. 浏览器控制台测试

打开浏览器开发者工具，在 Console 中执行：

```javascript
// 1. 测试最新播报数据
testLatestBroadcast()

// 2. 查看格式化播报内容
showFormattedBroadcast()

// 3. 查询原始数据（用于对比）
queryChinaNewsDocument('2026-01-22_09-01')

// 4. 对比原始数据和播报
compareBroadcastData('2026-01-22_09-01')
```

### 3. 语言切换测试

- 中文 → 显示播报框 ✅
- 英文 → 隐藏播报框 ✅
- 日文 → 隐藏播报框 ✅
- 法文 → 隐藏播报框 ✅
- 西班牙文 → 隐藏播报框 ✅

---

## Function 测试

### 手动触发测试（可选）

如果想立即测试 Function，可以手动创建测试文档：

```javascript
// 在浏览器控制台执行
const testDoc = {
  metadata: {
    version: "5.0.0",
    mode: "current",
    source_project: "gen-lang-client-0960644135",
    timezone: "Asia/Shanghai"
  },
  time: {
    beijing_time: "2026-01-22 11:00:00",
    crawl_date: "2026-01-22",
    crawl_time: "11:00"
  },
  statistics: {
    platforms: { total: 11, success: 11, failed: 0 },
    rss: { total: 0, new: 0, matched: 3, filtered: 0 },
    hotlist: { total: 53, new: 0, matched: 53 },
    combined: { total: 53, new: 0, matched: 56 }
  },
  hotlist_news: {
    keyword_groups: [
      {
        news_items: [
          { title: "测试新闻标题1", rank: 1 },
          { title: "测试新闻标题2", rank: 2 }
        ]
      }
    ]
  },
  ai_analysis: {
    enabled: true,
    provider: "gemini",
    model: "gemini-2.5-flash",
    result: JSON.stringify({
      keyword_analysis: ["测试话题1", "测试话题2"],
      sentiment: { overall: "中性", positive: 50, negative: 30 },
      signals: ["测试信号1", "测试信号2"],
      conclusion: "这是一个测试总结。"
    })
  },
  rss_feeds: {
    matched_items: [
      {
        feed_name: "Hacker News",
        items: [
          { title: "Test English Headline for Translation" }
        ]
      }
    ]
  }
};

// 注意：实际不需要手动触发，等待下一个小时的真实数据即可
```

### 查看 Function 日志

```bash
firebase functions:log --only onChinaNewsCreate
```

或访问: https://console.firebase.google.com/project/stanseproject/functions/logs

**预期日志**：
```
🔔 New China news document created: 2026-01-22_XX-XX
📝 Generating broadcast...
✅ Gemini API key loaded from Secret Manager
✅ Broadcast saved to news_stanseradar_china_consolidated
📊 Broadcast length: XXXX characters
```

---

## 下一步工作流程

### 正常运行流程

1. **数据源更新**（每小时自动）
   - `gen-lang-client-0960644135` 项目爬取新闻
   - 写入 `news_stanseradar_china` collection

2. **Function 自动触发**
   - `onChinaNewsCreate` 监听到新文档
   - 生成播报稿（包括翻译）
   - 存储到 `news_stanseradar_china_consolidated`

3. **前端自动更新**
   - 监听 `news_stanseradar_china_consolidated`
   - 实时显示最新播报
   - 仅在中文设置时可见

---

## 已知问题和注意事项

### ⚠️ Function 首次部署权限问题

**问题**: 2nd gen functions 首次部署需要几分钟设置权限
**解决**: ✅ 已解决（重试部署成功）

### ⚠️ Gemini API 配额

**注意**: 翻译 RSS 标题会消耗 Gemini API 配额
**建议**:
- 每小时通常只有 3-5 条 RSS
- 使用 flash 模型（成本低）
- 已设置 maxOutputTokens: 100

### ⚠️ 跨项目访问

**数据来源**: `gen-lang-client-0960644135` 项目
**当前项目**: `stanseproject`
**配置**: 需要确保跨项目 Firestore 访问权限配置正确

---

## 测试清单

### ✅ 功能测试

- [ ] 切换到中文，查看 THE CHINA 部分是否显示
- [ ] 检查标题格式是否与 THE MARKET 一致
- [ ] 验证 "Aligned with" 文本和 persona 翻译
- [ ] 查看播报内容格式是否正确
- [ ] 测试章节标题字体（应为新闻标题字体）
- [ ] 测试列表项字体（应加粗）
- [ ] 测试段落字体（应为新闻 body 字体）
- [ ] 切换到其他语言，确认播报框消失

### ✅ 控制台测试

- [ ] 执行 `testLatestBroadcast()` 查看数据
- [ ] 执行 `showFormattedBroadcast()` 查看完整播报
- [ ] 执行 `compareBroadcastData('2026-01-22_09-01')` 对比数据

### ✅ 数据测试

- [ ] 等待下一个小时新数据（自动触发 Function）
- [ ] 查看 Firebase Console - Functions 日志
- [ ] 检查 `news_stanseradar_china_consolidated` 是否有新文档
- [ ] 前端是否自动更新显示

---

## 当前开发服务器

**地址**: http://localhost:3001
**状态**: 🟢 运行中

**测试步骤**：
1. 打开浏览器访问 http://localhost:3001
2. 登录账号
3. 切换语言到中文（页面右上角）
4. 滚动到 Feed 最下方
5. 查看 "THE CHINA" 部分

---

## 监控和维护

### Firebase Console 链接

- **Functions**: https://console.firebase.google.com/project/stanseproject/functions
- **Firestore**: https://console.firebase.google.com/project/stanseproject/firestore
- **Logs**: https://console.firebase.google.com/project/stanseproject/functions/logs

### 查看 Function 日志

```bash
# 实时日志
firebase functions:log --only onChinaNewsCreate

# 或在 Console 查看
```

### 查看 Firestore 数据

```bash
# 查询最新播报
# 在浏览器控制台执行
testLatestBroadcast()
```

---

## 下一次数据更新

根据命名规则 `YYYY-MM-DD_HH-MM`，下一个文档应该是：
- 当前最新：`2026-01-22_09-01`
- 预计下一个：`2026-01-22_11-01`（如果每2小时更新）

当新数据到来时：
1. Function 自动触发
2. 生成新播报稿
3. 前端自动更新

---

## 文件清单

### Backend
- ✅ `functions/src/china-news-listener.ts` - **已部署**
- ✅ `functions/src/index.ts` - **已更新**

### Frontend
- ✅ `services/chinaNewsService.ts`
- ✅ `services/translationService.ts`
- ✅ `services/chinaNewsBroadcastService.ts`
- ✅ `components/ChinaNewsBroadcast.tsx`
- ✅ `components/views/FeedView.tsx` - **已集成**
- ✅ `contexts/LanguageContext.tsx` - **已添加翻译**
- ✅ `utils/testChinaNewsBroadcast.ts`
- ✅ `utils/queryChinaNews.ts`

### Rules
- ✅ `firestore.rules` - **已部署**

### Documentation
- ✅ `documentation/frontend/15_china_news_feed_ui_design_v2.md`
- ✅ `documentation/frontend/16_china_news_broadcast_implementation.md`
- ✅ `documentation/frontend/17_china_news_deployment_summary.md`
- ✅ `documentation/backend/54_china_news_collection_data_structure.md`
- ✅ `documentation/backend/54_china_news_data_structure_visual.md`

---

## 成功指标

### Function 执行成功

查看日志中的关键信息：
```
✅ Gemini API key loaded from Secret Manager
📝 Generating broadcast...
✅ Broadcast saved to news_stanseradar_china_consolidated
📊 Broadcast length: XXXX characters
📊 Source statistics: { ... }
```

### 前端显示成功

- ✅ 标题显示正确（THE CHINA / 最真实的中国新闻）
- ✅ Persona 翻译显示
- ✅ 播报内容完整展示
- ✅ 字体样式正确
- ✅ 切换语言时正确隐藏/显示

---

## Troubleshooting

### 问题: 前端不显示播报

**检查**：
1. 是否切换到中文？
2. 是否完成 onboarding？
3. 控制台是否有错误？
4. 执行 `testLatestBroadcast()` 是否返回数据？

### 问题: Function 未触发

**检查**：
1. Function 是否部署成功？
2. 新数据是否已写入 `news_stanseradar_china`？
3. 查看 Functions 日志是否有错误？

### 问题: RSS 翻译失败

**检查**：
1. Gemini API Key 是否在 Secret Manager 中？
2. Secret Manager 名称是否为 `GEMINI_API_KEY`？
3. 项目 ID 是否为 `gen-lang-client-0960644135`？

---

## 部署命令参考

```bash
# 构建 Functions
cd functions && npm run build

# 部署 Function
firebase deploy --only functions:onChinaNewsCreate

# 部署 Firestore Rules
firebase deploy --only firestore:rules

# 查看 Function 日志
firebase functions:log --only onChinaNewsCreate

# 启动开发服务器
npm run dev
```

---

## 完成状态

| 任务 | 状态 |
|------|------|
| 数据结构研究 | ✅ 完成 |
| Firebase Function 开发 | ✅ 完成 |
| Firebase Function 部署 | ✅ 成功 |
| 前端服务开发 | ✅ 完成 |
| UI 组件开发 | ✅ 完成 |
| 多语言翻译 | ✅ 完成 |
| Firestore Rules 更新 | ✅ 成功 |
| 浏览器测试工具 | ✅ 完成 |
| 文档编写 | ✅ 完成 |
| 开发服务器启动 | ✅ 运行中 |

---

**系统状态**: ✅ 全部就绪，可以开始测试！

**下一步**: 访问 http://localhost:3001，切换到中文，查看 Feed 最下方的 THE CHINA 部分

**部署完成时间**: 2026-01-22
