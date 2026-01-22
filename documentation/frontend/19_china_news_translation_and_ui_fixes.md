# China News Translation and UI Fixes

**Date:** 2026-01-22
**Version:** 1.0.0
**Status:** Deployed to Production

## Overview

This document records the implementation of RSS translation functionality and UI improvements for the China News Broadcast feature.

## Changes Made

### 1. Frontend UI Improvements

#### File: `components/ChinaNewsBroadcast.tsx`

**Line 151:** Changed header text from "今日摘要" to "重点关注"
```tsx
<h3 className="font-pixel text-2xl">重点关注</h3>
```

**Line 163:** Fixed double border issue when collapsed
```tsx
<div className={`px-3 py-1 bg-gray-50 ${isExpanded ? 'border-t-2 border-black' : ''}`}>
```

**Behavior:**
- When collapsed: Only button's bottom border is visible (no footer top border)
- When expanded: Both borders are visible (button bottom + footer top)
- This matches the pattern used in FeedView's Market Analysis section

### 2. Translation Service Setup

#### Backend Function: `functions/src/china-news-listener.ts`

**Lines 40-74:** Server-side translation function
```typescript
async function translateToChineseServerSide(text: string): Promise<string> {
  // Detects English text (>50% English characters)
  // Uses Gemini 2.0 Flash Exp model
  // Retrieves API key from Secret Manager
  // Returns translated Chinese or original text on failure
}
```

**Lines 214-217:** RSS translation in broadcast generation
```typescript
const translatedItems = await Promise.all(
  rssItems.map(title => translateToChineseServerSide(title))
);
```

#### Frontend Service: `services/translationService.ts`

**Purpose:** Client-side translation service for browser console utilities
- Uses same Gemini API pattern as geminiService.ts
- Supports batch translation with rate limiting
- Used by `generateRealBroadcast()` utility

### 3. Utility Function Improvements

#### File: `utils/generateRealBroadcast.ts`

**Lines 255-298:** Enhanced `generateLatestBroadcast()` function

**Key Changes:**
- Removed hardcoded document ID list
- Now dynamically generates IDs for last 12 hours
- Checks every 2-hour interval (matching crawler schedule)
- Automatically finds most recent available document

**Algorithm:**
```typescript
// Generates: 2026-01-22_15-01, 2026-01-22_13-01, 2026-01-22_11-01, etc.
for (let i = 0; i < 12; i++) {
  const testDate = new Date(now.getTime() - i * 2 * 60 * 60 * 1000);
  const docId = `${year}-${month}-${day}_${hour}-01`;
  recentIds.push(docId);
}
```

### 4. Infrastructure Setup

#### Secret Manager Permissions

**Command executed:**
```bash
gcloud secrets add-iam-policy-binding gemini-api-key \
  --project=gen-lang-client-0960644135 \
  --member="serviceAccount:stanseproject@appspot.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

**Purpose:** Allows Firebase Cloud Functions to access Gemini API key from Secret Manager

#### Projects Architecture

- **Firebase Project:** `stanseproject` (ID: 626045766180)
  - Hosts Cloud Functions
  - Hosts Firestore database

- **Cloud Run Project:** `gen-lang-client-0960644135` (ID: 837715360412)
  - Hosts frontend application
  - Stores Secret Manager secrets
  - Cloud Functions read secrets cross-project

## Deployment Record

### Frontend Deployment
- **Project:** gen-lang-client-0960644135
- **Build ID:** 97d18913-f739-4966-a3e7-1d2b71a04941
- **Revision:** stanse-00292-bn6
- **URL:** https://stanse-837715360412.us-central1.run.app
- **Timestamp:** 2026-01-22 07:30:37 UTC
- **Duration:** 3m 28s
- **Status:** SUCCESS

### Firebase Function Deployment
- **Project:** stanseproject
- **Function:** onChinaNewsCreate
- **Region:** us-central1
- **Runtime:** Node.js 20 (2nd Gen)
- **Status:** SUCCESS

## Secret Manager Keys

### API Keys (sensitive)
- `gemini-api-key` - Primary Gemini API key
- `gemini-api-key-backup` - Backup key
- `stanseradar-gemini-api-key` - StanseRadar specific key
- `FMP_API_KEY` - Financial Modeling Prep
- `SENDGRID_API_KEY` - SendGrid email service
- `polygon-api-key` - Polygon.io stock data

### Configuration Parameters (non-sensitive)
- `stanseradar-email-from` - Sender email address
- `stanseradar-email-to` - Recipient email address
- `stanseradar-smtp-server` - SMTP server address
- `stanseradar-smtp-port` - SMTP port number

## Testing Instructions

### Browser Console Commands

**Generate broadcast from latest document:**
```javascript
generateLatestBroadcast()
```

**Generate broadcast from specific document:**
```javascript
generateRealBroadcast('2026-01-22_15-01')
```

**Expected Output:**
```
═══════════════ 生成最新播报 ═══════════════
🔍 查找最新文档...
📋 尝试查找文档: 2026-01-22_15-01, 2026-01-22_13-01, 2026-01-22_11-01 ...
✅ 找到最新文档: 2026-01-22_15-01
═══════════════ 从真实数据生成播报: 2026-01-22_15-01 ═══════════════
📥 获取原始数据...
✅ 原始数据获取成功
  新闻数: 51
  RSS 数: 3
📝 生成播报稿...
✅ 播报稿生成成功
  字符数: 1241
💾 存储到 news_stanseradar_china_consolidated...
✅ 播报已保存
请刷新页面查看 THE CHINA 部分！
```

## Automatic Operation

The system now works automatically:

1. **News Crawler** runs every 2 hours (managed by StanseRadar)
2. **Cloud Function** (`onChinaNewsCreate`) triggers on new document
3. **Translation** happens server-side using Gemini API
4. **Broadcast** is generated and saved to `news_stanseradar_china_consolidated`
5. **Frontend** displays translated content automatically

## Known Issues

None at this time. All RSS items should be translated to Chinese automatically.

## Future Improvements

1. Add retry logic for failed translations
2. Cache translations to reduce API calls
3. Support translation to other languages (EN, ES, FR, JP)
4. Add translation quality metrics

## Related Documents

- [China News Feed UI Design](./15_china_news_feed_ui_design.md)
- [China News Broadcast Implementation](./16_china_news_broadcast_implementation.md)
- [China News Final Deployment](./18_china_news_final_deployment.md)
- [China News Collection Data Structure](../backend/54_china_news_collection_data_structure.md)

## Code Reference

### Key Files Modified
- `components/ChinaNewsBroadcast.tsx` (UI fixes)
- `utils/generateRealBroadcast.ts` (dynamic document lookup)
- `functions/src/china-news-listener.ts` (server-side translation)
- `services/translationService.ts` (client-side translation)

### Key Functions
- `translateToChineseServerSide()` - Backend translation
- `translateToChineseWithGemini()` - Frontend translation
- `generateLatestBroadcast()` - Auto-find and generate
- `generateRealBroadcast(docId)` - Generate specific document
