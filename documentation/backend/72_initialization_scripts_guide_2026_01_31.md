# Globe Intelligence Map - 数据初始化指南

**日期:** 2026-01-31
**状态:** 生产就绪

---

## 📋 概述

在部署 Cloud Functions 后，需要运行初始化脚本来处理现有数据：

1. **用户位置数据** - 为现有用户生成位置坐标
2. **新闻位置数据** - 为现有新闻文章提取地理位置
3. **突发新闻位置数据** - 为现有突发新闻提取位置和严重程度
4. **冲突区域数据** - 填充全球冲突区域示例数据

---

## 🚀 初始化脚本列表

### 1. 用户位置初始化
**文件:** `functions/src/scripts/initialize-user-locations.ts`

**功能:**
- 扫描所有 `users` collection 中有 `birthCountry` 或 `currentCountry` 的用户
- 跳过已有位置记录的用户
- 使用 Gemini 2.5 Flash 分析国家/州 → 生成坐标
- 存储到 `users/{userId}/users_countries_locations` subcollection

**运行:**
```bash
cd functions
npx ts-node src/scripts/initialize-user-locations.ts
```

**预期输出:**
```
🚀 Starting user location initialization...

Found 150 total users

📍 Processing user abc123...
✅ Success for abc123 (523ms)

--- Progress: 10/150 (8 succeeded, 2 failed, 5 skipped) ---

✅ Initialization complete!
Total users: 150
Processed: 145
Succeeded: 140
Failed: 5
Skipped: 10
```

**成本估算:** ~$0.20 for 1000 users

---

### 2. 新闻位置初始化
**文件:** `functions/src/scripts/initialize-news-locations.ts`

**功能:**
- 扫描 `news` collection (默认最近100条)
- 跳过已有位置记录的新闻
- 使用 Gemini 2.5 Flash 分析新闻内容 → 提取地理位置
- 存储到 `news_locations` collection

**运行:**
```bash
cd functions
npx ts-node src/scripts/initialize-news-locations.ts
```

**调整数量:**
修改脚本中的 `limit(100)` 来处理更多或更少的新闻：
```typescript
.limit(100) // 改为 .limit(500) 处理500条
```

**预期输出:**
```
🚀 Starting news location initialization...

Found 100 news articles to process

📍 Processing news abc123xyz...
✅ Success: United States, New York (456ms)

--- Progress: 10/100 (9 succeeded, 1 failed, 0 skipped) ---

✅ Initialization complete!
Total news: 100
Processed: 100
Succeeded: 95
Failed: 5
Skipped: 0
```

**成本估算:** ~$0.05 for 100 news articles

---

### 3. 突发新闻位置初始化
**文件:** `functions/src/scripts/initialize-breaking-news-locations.ts`

**功能:**
- 扫描 `breaking_news_notifications` collection (默认最近50条)
- 跳过已有位置记录的突发新闻
- 使用 Gemini 分析 → 提取位置 + 评估严重程度
- 存储到 `breaking_news_locations` collection

**运行:**
```bash
cd functions
npx ts-node src/scripts/initialize-breaking-news-locations.ts
```

**预期输出:**
```
🚀 Starting breaking news location initialization...

Found 50 breaking news to process

🚨 Processing breaking news xyz789...
✅ Success: Ukraine, Severity: CRITICAL (612ms)

--- Progress: 5/50 (4 succeeded, 1 failed, 0 skipped) ---

✅ Initialization complete!
Total breaking news: 50
Processed: 50
Succeeded: 48
Failed: 2
Skipped: 0
```

**成本估算:** ~$0.03 for 50 breaking news

---

### 4. 冲突区域数据填充
**文件:** `functions/src/scripts/populate-conflict-zones.ts`

**功能:**
- 填充10个全球主要冲突区域示例数据
- 包含：Ukraine-Russia, Gaza, Sudan, Myanmar等
- 跳过已存在的冲突区域（基于name）

**运行:**
```bash
cd functions
npx ts-node src/scripts/populate-conflict-zones.ts
```

**预期输出:**
```
🚀 Starting conflict zones population...

✅ Created: "Ukraine-Russia Border Region" (Ukraine, CRITICAL)
✅ Created: "Gaza Strip" (Palestine, CRITICAL)
✅ Created: "Sudan Civil Conflict" (Sudan, HIGH)
...

✅ Population complete!
Created: 10
Updated: 0
Skipped: 0
Total zones in sample: 10
```

**成本:** 免费（无AI调用）

---

## 📝 运行顺序建议

按以下顺序运行脚本以获得最佳效果：

```bash
# 1. 先填充冲突区域（最快，无AI成本）
cd functions
npx ts-node src/scripts/populate-conflict-zones.ts

# 2. 初始化用户位置（中等速度）
npx ts-node src/scripts/initialize-user-locations.ts

# 3. 初始化新闻位置（较慢）
npx ts-node src/scripts/initialize-news-locations.ts

# 4. 初始化突发新闻位置（较快，数量少）
npx ts-node src/scripts/initialize-breaking-news-locations.ts
```

**总预估时间:**
- 冲突区域: 1-2分钟
- 用户位置 (1000 users): 20-30分钟
- 新闻位置 (100 news): 5-10分钟
- 突发新闻 (50 items): 3-5分钟

**总预估成本:** ~$1-2 (一次性)

---

## ⚙️ 配置说明

### Firebase Admin 初始化

所有脚本会自动检测并初始化 Firebase Admin：
```typescript
if (!admin.apps.length) {
  admin.initializeApp();
}
```

**重要:** 确保你的环境已配置正确的 Firebase credentials：
- 本地开发：使用 `GOOGLE_APPLICATION_CREDENTIALS` 环境变量
- Cloud Functions：自动使用 service account

### Secret Manager 配置

所有脚本使用 Secret Manager 获取 Gemini API key：
- Project: `gen-lang-client-0960644135`
- Secret: `GEMINI_API_KEY`

**验证:**
```bash
gcloud secrets versions access latest --secret=GEMINI_API_KEY --project=gen-lang-client-0960644135
```

### Rate Limiting

所有脚本内置了rate limiting：
- 用户位置: 每10个请求暂停1秒
- 新闻位置: 每10个请求暂停1秒
- 突发新闻: 每5个请求暂停1秒

这样可以避免触发Gemini API的rate limit。

---

## 🔍 验证初始化结果

### 使用浏览器测试工具

初始化完成后，在浏览器console运行：

```javascript
// 加载测试工具
import('/utils/globeTestUtils.ts')

// 测试用户位置
await globeTests.testUserLocation('YOUR_USER_ID')

// 测试新闻位置统计
await globeTests.testNewsLocations(20)

// 测试Globe Markers API（包含所有数据）
await globeTests.testGlobeMarkers()
```

### 使用Firebase Console

1. **检查用户位置:**
   - 进入 Firestore → `users/{userId}/users_countries_locations`
   - 应该看到自动生成的位置记录

2. **检查新闻位置:**
   - 进入 Firestore → `news_locations`
   - 应该看到与news documents 1:1映射的位置记录

3. **检查突发新闻位置:**
   - 进入 Firestore → `breaking_news_locations`
   - 应该看到带severity字段的位置记录

4. **检查冲突区域:**
   - 进入 Firestore → `conflict_zones`
   - 应该看到10条冲突区域记录

---

## 🐛 常见问题

### 问题 1: "Failed to load Gemini API key"

**原因:** Secret Manager 访问失败

**解决:**
1. 检查你的账号是否有访问 Secret Manager 的权限
2. 验证项目ID正确: `gen-lang-client-0960644135`
3. 确认secret存在: `gcloud secrets list --project=gen-lang-client-0960644135`

### 问题 2: "Rate limit exceeded"

**原因:** Gemini API rate limit

**解决:**
1. 增加脚本中的延迟时间
2. 分批运行（先处理一部分数据）
3. 等待几分钟后重试

### 问题 3: 部分记录失败

**原因:** AI解析失败或数据格式问题

**解决:**
- 脚本会自动创建error记录，可以稍后手动修复
- 检查 Firestore 中 `error: true` 的documents
- 查看 `errorMessage` 字段了解失败原因

### 问题 4: 脚本中途停止

**原因:** 网络问题或timeout

**解决:**
- 脚本会自动跳过已处理的记录
- 直接重新运行脚本即可继续

---

## 📊 监控和日志

### 查看处理进度

所有脚本每处理N条记录会输出进度：
```
--- Progress: 50/100 (45 succeeded, 3 failed, 2 skipped) ---
```

### 查看详细日志

启用Firebase Admin SDK调试：
```bash
export FIREBASE_CONFIG_DEBUG=true
npx ts-node src/scripts/initialize-user-locations.ts
```

### 统计信息

脚本完成后会输出统计：
- Total: 总记录数
- Processed: 实际处理数
- Succeeded: 成功数
- Failed: 失败数
- Skipped: 跳过数（已存在）

---

## 🔄 重新初始化

如果需要重新初始化某个collection：

### 方法1: 删除location collection后重跑
```bash
# 在 Firebase Console 中删除整个 collection
# 然后重新运行脚本
npx ts-node src/scripts/initialize-news-locations.ts
```

### 方法2: 修改脚本跳过检查
注释掉"检查是否已存在"的代码：
```typescript
// 注释这部分
/*
const existingLocation = await db.collection('news_locations').doc(newsId).get();
if (existingLocation.exists) {
  skipped++;
  continue;
}
*/
```

---

## 📈 性能优化

### 批量处理

如果数据量很大，可以分批处理：

```typescript
// 修改 limit
.limit(100) // 每次处理100条

// 添加 offset
.offset(100) // 跳过前100条，处理第二批
```

### 并行处理

高级用户可以修改脚本，使用 `Promise.all` 并行处理：
```typescript
const chunks = chunkArray(allDocs, 10); // 分成10条一组
for (const chunk of chunks) {
  await Promise.all(chunk.map(doc => processDocument(doc)));
  await sleep(1000); // rate limiting
}
```

---

## ✅ 初始化检查清单

完成所有初始化后，确认：

- [ ] `conflict_zones` collection 有10条记录
- [ ] 用户有 `users_countries_locations` subcollection
- [ ] `news_locations` collection 有记录
- [ ] `breaking_news_locations` collection 有记录
- [ ] 浏览器测试工具验证通过
- [ ] Globe Markers API 返回数据
- [ ] 前端地球上显示markers

---

## 📚 相关文档

- [Technical Design](68_global_intelligence_map_technical_design_2026_01_31.md)
- [User Location Design](69_user_location_subcollection_design_2026_01_31.md)
- [Implementation Summary](70_globe_map_implementation_summary_2026_01_31.md)
- [Phase 1 Complete](71_phase1_implementation_complete_2026_01_31.md)

---

**状态:** ✅ 初始化脚本已就绪
**下一步:** 部署 Cloud Functions → 运行初始化脚本 → 验证数据
