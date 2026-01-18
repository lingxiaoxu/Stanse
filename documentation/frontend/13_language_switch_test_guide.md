# 多语言切换测试指南

## 🎯 测试目标

验证切换语言后，新闻源是否切换到对应语言的 RSS feed。

---

## 🧪 可用的测试函数

刷新页面后，在浏览器控制台 (F12) 中可以使用:

### 1. `window.testLanguageSwitch(language)`
测试切换到特定语言的影响

### 2. `window.compareLanguages()`
对比所有语言的新闻数量

### 3. `window.testCollectionLinking()`
验证数据完整性

---

## 📋 完整测试流程

### 步骤 1: 查看当前状态 (切换前)

在控制台运行:
```javascript
window.compareLanguages()
```

**预期输出**:
```
📊 Multi-Language News Comparison

🇺🇸 EN: 40 news items
   ├─ rss: 25
   └─ grounding: 15

🇨🇳 ZH: 0 items
🇯🇵 JA: 0 items
🇫🇷 FR: 0 items
🇪🇸 ES: 0 items
```

---

### 步骤 2: 测试即将切换的语言

运行:
```javascript
window.testLanguageSwitch('ja')
```

**预期输出**:
```
🌍 Testing Language Switch Impact

📦 Step 1: Current cached news
   Cached news count: 10

   Language distribution:
      🇺🇸 en: 10

   Source distribution:
      rss: 7
      grounding: 3

📰 Step 2: News available in JA
   ⚠️  No news found in JA

   📝 To fetch news in this language:
      1. Go to Settings
      2. Change language to JA
      3. Return to Feed and click refresh

🔄 Step 3: What happens when you switch to JA?
   1️⃣  FeedView detects language change
   2️⃣  Calls fetchPersonalizedNews(..., language='ja')
   3️⃣  fetchAllNews() is called with language='ja'
   4️⃣  fetchGoogleNewsRSS(['WORLD', 'POLITICS', ...], 'ja')
   5️⃣  Cloud Function fetches Google News RSS (JA)
   7️⃣  News saved with originalLanguage='ja'
   8️⃣  Displayed in Feed
```

---

### 步骤 3: 切换语言

1. 打开菜单 (☰)
2. 点击 Settings (⚙️)
3. 选择 Language → 日本語 (JA)
4. 返回 Feed 页面

---

### 步骤 4: 刷新新闻

点击 Feed 标题旁的刷新按钮 🔄

等待 15-30 秒（观察控制台日志）

---

### 步骤 5: 验证切换结果

运行:
```javascript
window.testLanguageSwitch('ja')
```

**预期输出** (切换后):
```
📦 Step 1: Current cached news
   Cached news count: 10

   Language distribution:
      🇯🇵 ja: 8    ← 新增日文新闻!
      🇺🇸 en: 2

   Source distribution:
      rss: 8       ← RSS 新闻增加了!
      grounding: 2

📰 Step 2: News available in JA
   ✅ Found 8 news items in JA

   Source types:
      - rss: 8

   Categories:
      - TECH: 3
      - WORLD: 2
      - BUSINESS: 2
      - POLITICS: 1

   📰 Sample headlines (first 5):
      1. 「Suica」のシステム、徐々に変わってきているの知ってましたか？
         Source: ITmedia | Type: rss

      2. Gmailで他社メール受信不可に、Microsoft 365が値上げ
         Source: ITmedia | Type: rss
```

---

### 步骤 6: 对比所有语言

运行:
```javascript
window.compareLanguages()
```

**预期输出**:
```
📊 Multi-Language News Comparison

🇺🇸 EN: 40 news items
   ├─ rss: 25
   └─ grounding: 15

🇨🇳 ZH: 0 items
🇯🇵 JA: 8 items    ← 新增!
   └─ rss: 8
🇫🇷 FR: 0 items
🇪🇸 ES: 0 items
```

---

## 🎯 成功标准

切换到日语后，应该看到:

### ✅ 语言分布变化
- localStorage 中有日文新闻 (`originalLanguage: 'ja'`)
- Firestore 中有日文新闻记录

### ✅ 新闻源变化
- RSS 新闻数量增加
- 来源显示日本媒体 (ITmedia, Yahoo Japan, etc.)

### ✅ 标题已翻译
- 原始标题是日文
- 显示的标题是英文翻译
- `originalLanguage` 字段保留 'ja'

---

## 🧪 测试其他语言

### 测试中文
```javascript
// 1. 查看中文新闻可用性
window.testLanguageSwitch('zh')

// 2. 切换到中文: Settings → Language → 中文
// 3. 刷新 Feed
// 4. 再次运行
window.testLanguageSwitch('zh')

// 应该看到 6park 和 RSS 来源
```

### 测试法语
```javascript
window.testLanguageSwitch('fr')
// 切换到法语并刷新
```

### 测试西班牙语
```javascript
window.testLanguageSwitch('es')
// 切换到西班牙语并刷新
```

---

## 📊 完整对比

在测试完多种语言后:
```javascript
window.compareLanguages()
```

理想状态:
```
🇺🇸 EN: 40 items
🇨🇳 ZH: 15 items
🇯🇵 JA: 12 items
🇫🇷 FR: 10 items
🇪🇸 ES: 8 items
```

---

## 🎉 验证完成

如果看到:
- ✅ 切换语言后新闻源改变
- ✅ `originalLanguage` 正确标记
- ✅ RSS 新闻来自对应国家
- ✅ 标题被翻译成英文显示
- ✅ Collections 正确关联 (100%)

**多语言新闻系统工作正常！** 🌍📰
