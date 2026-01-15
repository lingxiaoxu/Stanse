# 45. DUEL Arena Image Generation with Backup API Keys

**Last Updated**: 2026-01-13
**Status**: ✅ Production Ready
**Related Docs**: `44_duel_arena_backend_integration.md`

## Overview

This document describes the dual-model image generation system for DUEL trivia questions with automatic backup API key switching to handle quota limitations.

## Architecture

### Image Generation Strategy

Each DUEL question has 4 options (1 correct + 3 distractors). For each option, we generate images using **two AI models**:

1. **Gemini 3 Pro Image Preview** (`gemini-3-pro-image-preview`)
2. **Imagen 4** (`imagen-4.0-generate-001`)

This dual-model approach allows us to:
- Compare image quality between models
- Select the best image during review process
- Have fallback options if one model produces defective images

### Data Structure in Firestore

```typescript
interface DuelQuestion {
  questionId: string;           // "q001"
  stem: string;                 // "Flag of the United States"
  category: string;             // "FLAGS"
  difficulty: string;           // "EASY"
  correctIndex: number;         // 0 (correct answer at index 0)

  // Options with prompts
  options: [
    { prompt: "American flag with...", isCorrect: true },
    { prompt: "Flag of Liberia...", isCorrect: false },
    { prompt: "Flag of Malaysia...", isCorrect: false },
    { prompt: "Flag of Chile...", isCorrect: false }
  ];

  // Generated images from both models
  generatedImages: {
    gemini3: [
      { url: "https://storage.googleapis.com/.../q001_option_0.png", generatedAt: "2026-01-13T..." },
      { url: "https://storage.googleapis.com/.../q001_option_1.png", generatedAt: "2026-01-13T..." },
      { url: "https://storage.googleapis.com/.../q001_option_2.png", generatedAt: "2026-01-13T..." },
      { url: "https://storage.googleapis.com/.../q001_option_3.png", generatedAt: "2026-01-13T..." }
    ],
    imagen4: [
      { url: "https://storage.googleapis.com/.../q001_option_0.png", generatedAt: "2026-01-13T..." },
      { url: "https://storage.googleapis.com/.../q001_option_1.png", generatedAt: "2026-01-13T..." },
      { url: "https://storage.googleapis.com/.../q001_option_2.png", generatedAt: "2026-01-13T..." },
      { url: "https://storage.googleapis.com/.../q001_option_3.png", generatedAt: "2026-01-13T..." }
    ]
  };

  // Selected best images (populated by review script)
  selectedImages: [
    { url: "...", model: "imagen-4.0-generate-001", optionIndex: 0 },
    { url: "...", model: "gemini-3-pro-image-preview", optionIndex: 1 },
    { url: "...", model: "imagen-4.0-generate-001", optionIndex: 2 },
    { url: "...", model: "imagen-4.0-generate-001", optionIndex: 3 }
  ];

  // Legacy format for frontend compatibility
  images: [
    { url: "selected URL", prompt: "...", isCorrect: true, index: 0, generatedAt: "..." },
    { url: "selected URL", prompt: "...", isCorrect: false, index: 1, generatedAt: "..." },
    { url: "selected URL", prompt: "...", isCorrect: false, index: 2, generatedAt: "..." },
    { url: "selected URL", prompt: "...", isCorrect: false, index: 3, generatedAt: "..." }
  ];

  // Quality control flags
  defective: boolean;
  defectiveOptions: number[];   // Indices of options where both models failed

  metadata: {
    imageGenModel: string;      // Most commonly used model
    imageSize: "1024x1024";
    aspectRatio: "1:1";
  };
}
```

## Backup API Key System

### Problem

Gemini API has daily quota limits:
- **Paid Tier 1**: 70 requests/day per model
- For 150 questions × 4 options = 600 images per model
- Would take ~9 days to complete with single key

### Solution

Implemented **automatic backup API key switching**:

1. **Two API Keys** stored in Google Secret Manager:
   - Primary: `gemini-api-key`
   - Backup: `gemini-api-key-backup`

2. **Automatic Detection**: Script detects 429 quota errors

3. **Seamless Switch**: Automatically switches to backup key and retries

4. **No Manual Intervention**: Entire process is automatic

### Implementation

```typescript
// Configuration
const GEMINI_SECRET_NAME = 'gemini-api-key';
const GEMINI_BACKUP_SECRET_NAME = 'gemini-api-key-backup';

let backupApiKey: string | null = null;
let usingBackupKey = false;

// Load backup key
async function getBackupApiKey(): Promise<string> {
  if (backupApiKey) return backupApiKey;

  const [version] = await secretClient.accessSecretVersion({
    name: `projects/${PROJECT_ID}/secrets/${GEMINI_BACKUP_SECRET_NAME}/versions/latest`,
  });

  backupApiKey = version.payload?.data?.toString();
  return backupApiKey;
}

// Switch to backup key
async function switchToBackupKey(): Promise<GoogleGenAI> {
  if (usingBackupKey) {
    throw new Error('Already using backup key, both keys exhausted');
  }

  console.log('\n⚠️  Primary API key quota exhausted, switching to backup key...');
  const apiKey = await getBackupApiKey();
  usingBackupKey = true;

  return new GoogleGenAI({ apiKey });
}

// In image generation function
try {
  const response = await clientRef.current.models.generateImages({...});
} catch (error: any) {
  // Check if it's a quota exhaustion error
  if (error.message?.includes('429') && error.message?.includes('quota')) {
    // Switch to backup key
    clientRef.current = await switchToBackupKey();

    // Retry with backup key
    const retryResponse = await clientRef.current.models.generateImages({...});
    // Process retry response...
  }
}
```

### Security

✅ **No hardcoded keys** - All keys stored in Google Secret Manager
✅ **Accessed via Secret Manager API** - Never in code or git
✅ **Separate project** - Keys stored in `gen-lang-client-0960644135`
✅ **Audit trail** - All access logged in GCP

## Scripts

### 1. populate-duel-questions.ts

Populates Firestore with 150 questions from JSON.

```bash
cd functions
npm run build
node lib/scripts/populate-duel-questions.js
```

**Output**: 150 questions in `duel_questions` collection with empty images.

### 2. generate-duel-images.ts

Generates images using both models with automatic backup key switching.

```bash
# Generate all questions
node lib/scripts/generate-duel-images.js

# Generate specific questions
node lib/scripts/generate-duel-images.js --questions q001,q002,q003

# Generate with specific model only
node lib/scripts/generate-duel-images.js --model imagen-4.0-generate-001

# Generate range with specific model
node lib/scripts/generate-duel-images.js --questions q001,q002,...,q020 --model imagen-4.0-generate-001
```

**Features**:
- Reads questions from Firestore
- Generates images with both models
- Uploads to GCS bucket `stanse-public-assets`
- Saves URLs back to Firestore
- **Automatic backup key switching** on quota exhaustion

### 3. review-duel-images.ts

Reviews image quality and selects best images.

```bash
# Review all questions
node lib/scripts/review-duel-images.js

# Review specific questions
node lib/scripts/review-duel-images.js --questions q001,q002,q003
```

**Review Process**:
1. **Python check**: Verify image is 1024x1024 square
2. **Gemini 3 content review**: Check for borders, text overlay, wrong subject
3. **Selection logic**:
   - Both valid → Use Imagen 4 (preferred)
   - One valid → Use that one
   - Both invalid → Mark as defective

**Output**:
- Updates `selectedImages[]` with best image per option
- Updates `images[]` array for frontend compatibility
- Sets `defective` flag and `defectiveOptions[]` array
- Updates `metadata.imageGenModel` with most used model

### 4. check-generation-status.js

Verifies generation status for questions.

```bash
cd functions
node src/scripts/check-generation-status.js
```

**Output**:
```
✅ q001: Gemini3=4/4, Imagen4=4/4
✅ q002: Gemini3=4/4, Imagen4=4/4
...
Complete: 20/20
Partial: 0/20
Missing: 0/20
```

### 5. clear-duel-questions.ts

Clears all questions from Firestore (use with caution).

```bash
node lib/scripts/clear-duel-questions.js
```

## Generation Workflow

### Initial Setup (One-time)

1. **Create backup API key** in Secret Manager:
```bash
echo "YOUR_BACKUP_KEY" | gcloud secrets create gemini-api-key-backup \
  --project=gen-lang-client-0960644135 \
  --data-file=-
```

2. **Populate questions**:
```bash
node lib/scripts/clear-duel-questions.js
node lib/scripts/populate-duel-questions.js
```

### Daily Generation (Batch Processing)

**Option A: Generate in batches** (Recommended for 150 questions)

```bash
# Day 1: q001-q050 (200 images per model)
node lib/scripts/generate-duel-images.js --questions q001,...,q050

# Day 2: q051-q100 (200 images per model)
node lib/scripts/generate-duel-images.js --questions q051,...,q100

# Day 3: q101-q150 (200 images per model)
node lib/scripts/generate-duel-images.js --questions q101,...,q150
```

**Option B: Use backup key** (Single day with dual keys)

```bash
# Generate all at once - automatic switch to backup key
node lib/scripts/generate-duel-images.js
```

With backup key:
- Primary key: ~70 images
- Backup key: ~70 images
- Total: ~140 images per day per model
- Can complete ~35 questions/day

### Review and Finalize

```bash
# Review all generated images
node lib/scripts/review-duel-images.js

# Verify completion
node src/scripts/check-generation-status.js
```

## API Quota Management

### Current Limits

| Tier | Requests/Day | Suitable For |
|------|--------------|--------------|
| Paid Tier 1 | 70 | ~17 questions/day (single model) |
| With Backup | 140 | ~35 questions/day (single model) |

### Monitoring Usage

Check quota usage:
```bash
# View Secret Manager access logs
gcloud logging read "resource.type=secretmanager.googleapis.com/Secret" \
  --project=gen-lang-client-0960644135 \
  --limit=50
```

Monitor generation progress:
```bash
# Check current status
cd functions
node src/scripts/check-generation-status.js
```

### Best Practices

1. ✅ **Batch by 20-30 questions** to stay within quota
2. ✅ **Monitor quota usage** before large batches
3. ✅ **Use backup key** for urgent completions
4. ✅ **Schedule across multiple days** for all 150 questions
5. ⚠️ **Don't run concurrent generation** - causes quota conflicts

## Storage

### GCS Bucket Structure

```
stanse-public-assets/
└── duel-images/
    ├── gemini-3-pro-image-preview/
    │   ├── q001_option_0.png
    │   ├── q001_option_1.png
    │   ├── q001_option_2.png
    │   └── q001_option_3.png
    └── imagen-4.0-generate-001/
        ├── q001_option_0.png
        ├── q001_option_1.png
        ├── q001_option_2.png
        └── q001_option_3.png
```

**Image Specs**:
- Format: PNG
- Size: 1024×1024 pixels
- Aspect Ratio: 1:1
- Color Space: RGB
- Public access: Yes (via public URLs)

### Cost Estimation

**Storage**:
- 150 questions × 4 options × 2 models = 1,200 images
- Average size: ~500 KB per image
- Total: ~600 MB
- GCS cost: ~$0.012/month (negligible)

**API Usage** (per 150 questions):
- Gemini 3 generation: 600 images
- Imagen 4 generation: 600 images
- Gemini 3 review: 1,200 reviews (Gemini + Imagen images)
- Total API calls: ~2,400

## Frontend Integration

### Client-side Fetching

```typescript
// services/duelFirebaseService.ts
export async function getQuestion(questionId: string): Promise<Question | null> {
  const docRef = doc(db, 'duel_questions', questionId);
  const docSnap = await getDoc(docRef);

  if (docSnap.exists()) {
    const data = docSnap.data();
    return {
      id: data.questionId,
      stem: data.stem,
      choices: data.images.map((img: any) => img.url),  // ← Selected images
      correctIndex: data.correctIndex,
      difficulty: data.difficulty
    };
  }

  return null;
}
```

**Frontend sees**:
- `choices`: Array of 4 image URLs (selected best from review)
- `correctIndex`: 0 (correct answer always first)
- Images are pre-selected by review script

### Question Display

```typescript
interface Question {
  id: string;              // "q001"
  stem: string;            // "Flag of the United States"
  choices: string[];       // [url1, url2, url3, url4] ← Best images
  correctIndex: number;    // 0
  difficulty: string;      // "EASY"
}
```

## Error Handling

### Common Issues

**1. Quota Exhausted (429 Error)**
```
Error: 429 quota exceeded for imagen-4.0-generate
```
**Solution**: Automatic switch to backup key

**2. Both Keys Exhausted**
```
Error: Already using backup key, both keys exhausted
```
**Solution**: Wait 24 hours for quota reset or create additional backup key

**3. Image Generation Failed**
```
Error: No image generated
```
**Solution**: Script continues, marks as empty URL, review will catch

**4. Upload to GCS Failed**
```
Error: Failed to upload to GCS
```
**Solution**: Script retries up to 3 times with 2s delay

### Monitoring

Check generation logs:
```bash
ls -la /Users/xuling/code/Stanse/logs/duel-images/
tail -f /Users/xuling/code/Stanse/logs/duel-images/2026-01-13_*.log
```

## Production Checklist

### Before Generation

- [ ] Verify ADC credentials: `gcloud auth application-default login`
- [ ] Check primary key quota usage
- [ ] Check backup key quota usage
- [ ] Verify GCS bucket access
- [ ] Verify Firestore questions populated
- [ ] Review generation plan (batch size, timeline)

### During Generation

- [ ] Monitor console output for errors
- [ ] Watch for quota warnings
- [ ] Verify images uploading to GCS
- [ ] Check Firestore updates

### After Generation

- [ ] Run check-generation-status.js
- [ ] Verify all images present in GCS
- [ ] Run review script
- [ ] Test frontend display
- [ ] Save generation log

## Future Improvements

1. **Progress Tracking**: Add progress file to resume interrupted generations
2. **Parallel Generation**: Generate multiple questions concurrently (with quota awareness)
3. **Additional Backup Keys**: Support 3+ keys for larger batches
4. **Automatic Scheduling**: Cron job to distribute generation across days
5. **Quality Metrics**: Track defect rates by model and category
6. **A/B Testing**: Compare user preferences between Gemini 3 and Imagen 4

## Related Files

**Scripts**:
- `/functions/src/scripts/populate-duel-questions.ts`
- `/functions/src/scripts/generate-duel-images.ts`
- `/functions/src/scripts/review-duel-images.ts`
- `/functions/src/scripts/check-generation-status.js`
- `/functions/src/scripts/clear-duel-questions.ts`

**Data**:
- `/scripts/duel/complete-questions.json` (150 questions source)

**Logs**:
- `/logs/duel-images/` (generation logs)

**Documentation**:
- `44_duel_arena_backend_integration.md` (DUEL system overview)
- `40_security_checklist.md` (API key security)
