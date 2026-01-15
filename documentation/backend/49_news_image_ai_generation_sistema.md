# 49. News Image AI Generation System

**Created**: 2026-01-15
**Status**: ✅ Production Ready
**Project**: StanseProject (stanseproject) + gen-lang-client-0960644135

## Overview

Replaced all Unsplash stock photos with AI-generated news images using Gemini Imagen 4.

## System Architecture

### Projects
- **Firebase/Firestore**: stanseproject (626045766180)
- **Secret Manager**: gen-lang-client-0960644135
- **Cloud Storage**: gen-lang-client-0960644135/stanse-public-assets
- **Cloud Run**: gen-lang-client-0960644135

### Collections

#### news_image_generation/
```
news_image_generation/
├── POLITICS (doc)
│   ├── keywords: [25 keywords with descriptions]
│   └── images/ (subcollection)
│       ├── capitol_building (doc with imageUrl)
│       ├── white_house
│       └── ... (18 total)
├── TECH (25 keywords, 24 images)
├── MILITARY (25 keywords, 23 images)
├── WORLD (25 keywords, 21 images)
├── BUSINESS (25 keywords, 23 images)
└── DEFAULT (25 keywords, 20 images)
```

**Total**: 150 keywords, 129 AI-generated images (85.3% success rate)

## Image Generation

### Prompt Requirements
- Photorealistic editorial news photography
- Real political figures/locations when relevant
- Back views/shadows if faces can't be shown (no fake AI faces)
- Diverse ethnicity, unique faces (no duplicates)
- Full color, vivid, saturated
- 16:9 aspect ratio, edge-to-edge (NO black/white borders)
- Minimal text, must be clear and readable
- NO brand logos or watermarks

### Scripts

#### Setup (One-time)
```bash
cd functions
npm run build
node lib/scripts/setup-news-image-keywords.js
```

Creates 6 category documents with 25 keywords each.

#### Generate Images
```bash
node lib/scripts/generate-news-images.js
```

Generates 150 images using:
- Gemini Imagen 4 (`imagen-4.0-generate-001`)
- Primary API key with automatic backup failover
- API keys from Secret Manager (gen-lang-client-0960644135)
- Uploads to Firebase Storage: `gs://stanse-public-assets/news_images/{CATEGORY}/`

#### Test Cache
```bash
node lib/scripts/test-news-cache.js
```

Verifies newsCache.ts only caches AI-generated images.

## Code Updates

### services/geminiService.ts
Replaced `CATEGORY_IMAGES` (lines 41-161):
- **Before**: 71 Unsplash URLs
- **After**: 129 AI-generated Firebase Storage URLs

### services/newsCache.ts
Updated cache logic:
- `getImageFromCache()`: Only returns AI images from Firebase Storage
- `saveImageToCache()`: Only caches AI images, skips old Unsplash/loremflickr

## Storage Locations

### Firebase Storage
```
gs://stanse-public-assets/news_images/
├── POLITICS/
│   ├── capitol_building_1768458146027.jpg
│   ├── white_house_1768458155947.jpg
│   └── ... (18 images)
├── TECH/ (24 images)
├── MILITARY/ (23 images)
├── WORLD/ (21 images)
├── BUSINESS/ (23 images)
└── DEFAULT/ (20 images)
```

Public URLs: `https://storage.googleapis.com/stanse-public-assets/news_images/{CATEGORY}/{keyword}_{timestamp}.jpg`

### Firestore
- **news_image_generation**: Metadata for keywords and image URLs
- **news_images**: Legacy cache (now filters out old images)

## Deployment

### Build & Deploy
```bash
gcloud config set project gen-lang-client-0960644135
gcloud builds submit --config=cloudbuild.yaml
```

Deploys to Cloud Run: `https://stanse-837715360412.us-central1.run.app`

## Test Files Location

Moved to `/tests/` directory:
- `test-news-cache.html` - News cache testing
- `test-enhanced-rankings.html` - Rankings test
- `test-typescript-rankings.html` - TypeScript rankings
- `admin-check-online-users.html` - Admin utility
- `populate-duel-questions.html` - DUEL admin
- `generate-icon.html` - Icon utility

Access: `http://localhost:3000/tests/[filename].html`

## Statistics

### Generation Run (2026-01-15)
- **Duration**: 28 minutes
- **Total keywords**: 150
- **Success**: 128 (85.3%)
- **Failed**: 22 (14.7%)
- **Storage used**: ~150MB (1.2MB per image avg)

### Image Distribution
- POLITICS: 18 images
- TECH: 24 images
- MILITARY: 23 images
- WORLD: 21 images
- BUSINESS: 23 images
- DEFAULT: 20 images

## Security

✅ **API Key Management**
- Keys stored in Secret Manager (gen-lang-client-0960644135)
- Primary: `gemini-api-key`
- Backup: `gemini-api-key-backup`
- Automatic failover on quota exhaustion
- NEVER hardcoded in code

## Migration Impact

### Before
- 71 Unsplash stock photos (generic, not news-specific)
- Inconsistent quality and relevance

### After
- 129 AI-generated professional news photography
- Category-specific, photorealistic
- Diverse representation
- Higher visual impact

## Related Files
- `/services/geminiService.ts` - Image URL arrays
- `/services/newsCache.ts` - Cache logic
- `/functions/src/scripts/generate-news-images.ts` - Generation script
- `/functions/src/scripts/setup-news-image-keywords.ts` - Setup script
- `/functions/src/scripts/test-news-cache.ts` - Test script
