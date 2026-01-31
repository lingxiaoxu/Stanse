# Global Intelligence Map - Implementation Summary

**Date:** 2026-01-31
**Related Docs:**
- [#68 - Technical Design](68_global_intelligence_map_technical_design_2026_01_31.md)
- [#69 - User Location Subcollection](69_user_location_subcollection_design_2026_01_31.md)

---

## Quick Overview

Interactive 3D globe showing 5 types of intelligence markers:
1. **News** (10 recent) - AI-geolocated
2. **Breaking News** - Last 7 days with severity
3. **Conflict Zones** - Global conflicts
4. **User Locations** - Birth country + current (state-level precision)
5. **Search Results** - Entity locations from searches

---

## Key Design Decisions

### ✅ Secret Manager for API Keys
- **NO hardcoded keys** - All Gemini API calls use Google Secret Manager
- Follow pattern from `china-news-listener.ts`:
```typescript
const secretClient = new SecretManagerServiceClient();
const CLOUD_RUN_PROJECT_ID = 'gen-lang-client-0960644135';
const GEMINI_SECRET_NAME = 'GEMINI_API_KEY';
let geminiApiKey: string | null = null; // Cache

async function getGeminiApiKey(): Promise<string> {
  if (geminiApiKey) return geminiApiKey;
  const [version] = await secretClient.accessSecretVersion({
    name: `projects/${CLOUD_RUN_PROJECT_ID}/secrets/${GEMINI_SECRET_NAME}/versions/latest`,
  });
  geminiApiKey = version.payload?.data?.toString() || '';
  return geminiApiKey;
}
```

### ✅ User Location Subcollection (Not Main Document)
- Path: `users/{userId}/users_countries_locations/{autoId}`
- Preserves main `users` document structure
- Allows version history
- Always query latest: `ORDER BY createdAt DESC LIMIT 1`

### ✅ State-Level Precision for Current Location
- **Birth Country:** Always use capital city
  - China → Beijing (39.9042, 116.4074)
- **Current Location:** Prefer state capital if available
  - With state: New York → Albany (42.6526, -73.7562) ⭐
  - Without state: United States → Washington D.C. (38.9072, -77.0369)

### ✅ Gemini 2.5 Flash (Not 2.0)
- Model: `gemini-2.5-flash` (minimum version)
- Fast, accurate, cost-effective
- All location analysis powered by AI

### ✅ Full i18n Support
- All labels use `t('sense', 'key')`
- English + Chinese translations added
- Globe title, markers, modal labels all localized

---

## Database Schema

### New Collections

```
news_locations/                     (top-level)
  {newsId}/
    - coordinates: { lat, lng }
    - country, state, city
    - confidence, specificityLevel

breaking_news_locations/            (top-level)
  {breakingId}/
    - coordinates: { lat, lng }
    - severity: CRITICAL|HIGH|MEDIUM
    - breakingSummary

conflict_zones/                     (top-level)
  {conflictId}/
    - coordinates: { lat, lng }
    - conflictType, status, severity
    - parties: string[]

users/{userId}/
  users_countries_locations/        (subcollection ⭐)
    {autoId}/
      - birthCountryCapital: { name, coordinates }
      - currentStateCapital?: { name, coordinates }
      - currentCountryCapital?: { name, coordinates }
      - createdAt (sort DESC to get latest)
      - confidence
```

---

## Cloud Functions

### 1. `onNewsCreated` Trigger
```typescript
exports.onNewsCreated = functions.firestore
  .document('news/{newsId}')
  .onCreate(async (snapshot, context) => {
    const apiKey = await getGeminiApiKey(); // Secret Manager
    // Analyze location with Gemini 2.5 Flash
    // Store in news_locations/{newsId}
  });
```

### 2. `onBreakingNewsCreated` Trigger
```typescript
exports.onBreakingNewsCreated = functions.firestore
  .document('breaking_news_notifications/{breakingId}')
  .onCreate(async (snapshot, context) => {
    const apiKey = await getGeminiApiKey();
    // Analyze + assess severity
    // Store in breaking_news_locations/{breakingId}
  });
```

### 3. `onUserLocationUpdated` Trigger
```typescript
exports.onUserLocationUpdated = functions.firestore
  .document('users/{userId}')
  .onUpdate(async (change, context) => {
    // Detect birthCountry, currentCountry, currentState changes
    const apiKey = await getGeminiApiKey();
    // Generate coordinates (prefer state capital)
    // ADD new doc to users/{userId}/users_countries_locations/
  });
```

### 4. `getGlobeMarkers` API
```typescript
exports.getGlobeMarkers = functions.https.onCall(async (data, context) => {
  const userId = context.auth.uid;

  // Fetch latest user location from subcollection
  const userLocationSnapshot = await db
    .collection('users').doc(userId)
    .collection('users_countries_locations')
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();

  // Return markers array
});
```

### 5. `analyzeEntityLocation` API
```typescript
exports.analyzeEntityLocation = functions.https.onCall(async (data, context) => {
  const { entityName } = data;
  const apiKey = await getGeminiApiKey();
  // Use Gemini to determine entity HQ/location
  return { coordinates, summary };
});
```

---

## Frontend Components

### 1. Enhanced GlobeViewer
```typescript
// components/globe/GlobeViewer.tsx
export function GlobeViewer({ markers, onMarkerClick }) {
  // Render earth with country borders
  // Render markers as 3D spheres on surface
  // Click handler for each marker
  // Hover popups with t() translations
}
```

### 2. Marker Detail Modal
```typescript
// components/globe/MarkerDetailModal.tsx
export const MarkerDetailModal = ({ marker, onClose, onNavigate }) => {
  const { t } = useLanguage();

  return (
    <div>
      <h3>{t('sense', `marker_${marker.type.toLowerCase()}`)}</h3>
      <p>{t('sense', 'marker_location')}: {marker.metadata.country}</p>
      <button>{t('sense', 'marker_view_article')}</button>
    </div>
  );
};
```

### 3. Updated SenseView
```typescript
// components/views/SenseView.tsx
const [globeMarkers, setGlobeMarkers] = useState<GlobeMarker[]>([]);

useEffect(() => {
  loadGlobeMarkers();
}, []);

// On search, also fetch entity location
const entityMarker = await analyzeEntityLocation(query);
setGlobeMarkers(prev => [entityMarker, ...prev]);
```

---

## Firestore Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Top-level location collections - read only
    match /news_locations/{docId} {
      allow read: if request.auth != null;
      allow write: if false; // Only Cloud Functions
    }

    match /breaking_news_locations/{docId} {
      allow read: if request.auth != null;
      allow write: if false;
    }

    match /conflict_zones/{docId} {
      allow read: if request.auth != null;
      allow write: if false;
    }

    // User subcollection
    match /users/{userId} {
      allow read: if request.auth.uid == userId;
      allow update: if request.auth.uid == userId;

      match /users_countries_locations/{locationId} {
        allow read: if request.auth.uid == userId;
        allow write: if false; // Only Cloud Functions
      }
    }
  }
}
```

---

## i18n Translations Added

### English (`Language.EN`)
```typescript
sense: {
  globe_title: "GLOBAL INTELLIGENCE MAP",
  globe_hint: "Drag to rotate • Scroll to zoom • Click markers for details",
  globe_markers_count: "markers",
  marker_news: "NEWS",
  marker_breaking: "BREAKING NEWS",
  marker_conflict: "CONFLICT ZONE",
  marker_birth: "BIRTH COUNTRY",
  marker_current: "CURRENT LOCATION",
  marker_search: "SEARCH RESULT",
  marker_location: "Location",
  marker_severity: "Severity",
  marker_view_article: "View Full Article"
}
```

### Chinese (`Language.ZH`)
```typescript
sense: {
  globe_title: "全球情报地图",
  globe_hint: "拖动旋转 • 滚动缩放 • 点击标记查看详情",
  globe_markers_count: "个标记",
  marker_news: "新闻",
  marker_breaking: "突发新闻",
  marker_conflict: "冲突区域",
  marker_birth: "出生国家",
  marker_current: "当前位置",
  marker_search: "搜索结果",
  marker_location: "位置",
  marker_severity: "严重程度",
  marker_view_article: "查看完整文章"
}
```

---

## Implementation Checklist

### Phase 1: Backend Setup
- [ ] Create Cloud Functions with Secret Manager integration
  - [ ] `onNewsCreated`
  - [ ] `onBreakingNewsCreated`
  - [ ] `onUserLocationUpdated`
  - [ ] `getGlobeMarkers`
  - [ ] `analyzeEntityLocation`
- [ ] Deploy Firestore security rules
- [ ] Create composite indexes
- [ ] Populate sample `conflict_zones` data

### Phase 2: Frontend Integration
- [ ] Update `GlobeViewer.tsx` with marker system
- [ ] Create `MarkerDetailModal.tsx`
- [ ] Update `SenseView.tsx` to load markers
- [ ] Create `globeService.ts`
- [ ] Add i18n keys to `LanguageContext.tsx` ✅

### Phase 3: User Migration
- [ ] Create browser-testable utility in `/utils` for admin to:
  - [ ] Trigger location analysis for existing users
  - [ ] Check analysis status
  - [ ] View generated coordinates
- [ ] Run migration for existing users

### Phase 4: Testing
- [ ] Test marker rendering with 50+ markers
- [ ] Test i18n language switching
- [ ] Test mobile performance
- [ ] Verify coordinate accuracy
- [ ] Test click navigation

---

## Cost Estimates

### AI Costs (Gemini 2.5 Flash)
- Input: $0.0001875 / 1K chars
- Output: $0.00075 / 1K chars

**Monthly estimate (1000 users, 500 news/day):**
- News location analysis: ~$10/month
- Breaking news: ~$5/month
- User locations (one-time): ~$0.20
- Entity searches: ~$2/month

**Total: ~$17/month**

### Firestore Costs
- Reads: ~$5/month
- Writes: ~$2/month
- Storage: <$1/month

**Grand Total: ~$25/month at scale**

---

## Deployment Order

1. Deploy Cloud Functions
```bash
cd functions
firebase deploy --only functions:onNewsCreated,functions:onBreakingNewsCreated,functions:onUserLocationUpdated,functions:getGlobeMarkers,functions:analyzeEntityLocation
```

2. Deploy Firestore Rules
```bash
firebase deploy --only firestore:rules
```

3. Deploy Frontend
```bash
npm run build
firebase deploy --only hosting
```

4. Run user migration (via admin utility in browser console)

---

## Testing Utilities

Create in `/utils/globeTestUtils.ts`:

```typescript
// Browser console-callable functions for testing

export async function testUserLocation(userId: string) {
  // Fetch and display user's latest location
  const snap = await db.collection('users').doc(userId)
    .collection('users_countries_locations')
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();

  console.table(snap.docs[0].data());
}

export async function testGlobeMarkers(userId: string) {
  // Call getGlobeMarkers and display results
  const result = await httpsCallable('getGlobeMarkers')();
  console.log('Total markers:', result.data.count);
  console.table(result.data.markers);
}

export async function testEntityLocation(entityName: string) {
  // Test entity location analysis
  const result = await httpsCallable('analyzeEntityLocation')({ entityName });
  console.log('Entity location:', result.data);
}
```

Usage:
```javascript
// In browser console
import { testUserLocation } from '/utils/globeTestUtils.ts';
testUserLocation('user123');
```

---

## File Structure

```
functions/src/
  news-location-analyzer.ts          (onNewsCreated)
  breaking-news-location-analyzer.ts (onBreakingNewsCreated)
  user-location-analyzer.ts          (onUserLocationUpdated)
  api/
    globe-markers.ts                 (getGlobeMarkers)
    entity-location-analyzer.ts      (analyzeEntityLocation)

components/
  globe/
    GlobeViewer.tsx                  (existing, enhanced)
    MarkerDetailModal.tsx            (new)
  views/
    SenseView.tsx                    (updated)

services/
  globeService.ts                    (new)

contexts/
  LanguageContext.tsx                (updated with i18n keys)

utils/
  globeTestUtils.ts                  (new - browser-testable)

documentation/backend/
  68_global_intelligence_map_technical_design_2026_01_31.md
  69_user_location_subcollection_design_2026_01_31.md
  70_globe_map_implementation_summary_2026_01_31.md
```

---

## Common Pitfalls to Avoid

❌ **DON'T:**
- Hardcode `process.env.GEMINI_API_KEY`
- Modify main `users` document structure
- Use `gemini-2.0-*` models (minimum 2.5-flash)
- Create standalone test scripts (use browser-testable utils instead)
- Forget to use `t()` for i18n
- Use country capital when state is available

✅ **DO:**
- Use Secret Manager for all API keys
- Create subcollection for user locations
- Use `gemini-2.5-flash` minimum
- Create browser-testable utilities in `/utils`
- Add i18n for all user-facing text
- Prefer state capital over country capital

---

## Success Criteria

✅ Globe renders smoothly with 50+ markers
✅ All markers clickable with detail modals
✅ Language switching works (EN/ZH)
✅ Mobile performance acceptable (>30 FPS)
✅ User locations show state-level precision
✅ No API keys exposed in client code
✅ Firestore costs <$10/month
✅ AI costs <$20/month

---

**Status:** Design Complete - Ready for Implementation
**Next Step:** Begin Phase 1 - Backend Setup

