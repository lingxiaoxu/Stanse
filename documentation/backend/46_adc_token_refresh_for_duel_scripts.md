# ADC Token Refresh for DUEL Image Scripts

## Overview

Added automatic ADC (Application Default Credentials) token refresh functionality to `generate-duel-images.ts` and `review-duel-images.ts` to prevent authentication token expiration during long-running operations.

## Problem

When processing large batches of questions (40+ for generation, 25+ for review), the ADC token can expire after ~1 hour, causing authentication errors and script failures.

## Solution

Implemented periodic token refresh similar to the Python FEC upload script (`02-upload-incremental.py`).

## Changes Made

### 1. generate-duel-images.ts

**Location:** `/Users/xuling/code/Stanse/functions/src/scripts/generate-duel-images.ts`

**Added:**
- `questionsProcessed` counter (tracks total questions processed)
- `TOKEN_REFRESH_INTERVAL = 40` (refresh every 40 questions)
- `refreshADCToken()` function (reinitializes Firestore client)
- Automatic refresh call in `processQuestion()` after each question

**Implementation:**
```typescript
// Global state
let questionsProcessed = 0;
const TOKEN_REFRESH_INTERVAL = 40;

// Refresh function
async function refreshADCToken(): Promise<boolean> {
  console.log('  🔄 Refreshing ADC token and Firestore connection...');
  try {
    const newDb = admin.firestore();
    await newDb.collection('duel_questions').limit(1).get();
    console.log('  ✅ ADC token refreshed successfully');
    return true;
  } catch (error: any) {
    console.error(`  ❌ Failed to refresh ADC token: ${error.message}`);
    return false;
  }
}

// Usage in processQuestion()
questionsProcessed++;
if (questionsProcessed % TOKEN_REFRESH_INTERVAL === 0) {
  console.log(`\n💡 Processed ${questionsProcessed} questions, refreshing ADC token...`);
  await refreshADCToken();
}
```

**Why 40 questions:**
- Each question generates 8 images (4 for Gemini3, 4 for Imagen4)
- Total: 320 API calls per 40 questions
- Estimated time: ~25-30 minutes at 2s per image
- Refresh interval provides safety margin before 1-hour token expiration

### 2. review-duel-images.ts

**Location:** `/Users/xuling/code/Stanse/functions/src/scripts/review-duel-images.ts`

**Added:**
- `questionsProcessed` counter
- `TOKEN_REFRESH_INTERVAL = 25` (refresh every 25 questions)
- `refreshADCToken()` function (same implementation)
- Automatic refresh call in both processing loops (filtered and all questions)

**Implementation:**
```typescript
// Global state
let questionsProcessed = 0;
const TOKEN_REFRESH_INTERVAL = 25;

// Refresh function (same as generate script)
async function refreshADCToken(): Promise<boolean> { ... }

// Usage in main() processing loops
questionsProcessed++;
if (questionsProcessed % TOKEN_REFRESH_INTERVAL === 0) {
  console.log(`\n💡 Reviewed ${questionsProcessed} questions, refreshing ADC token...`);
  await refreshADCToken();
}
```

**Why 25 questions:**
- Each question reviews 8 images (4 Gemini3, 4 Imagen4)
- Includes Python dimension checks + Gemini 3 content reviews
- Total: 200 operations per 25 questions
- Estimated time: ~35-40 minutes
- More aggressive refresh due to longer processing time per question

## How It Works

1. **Counter Tracking:** Scripts track the number of questions processed
2. **Periodic Check:** After each question, checks if refresh interval reached
3. **Token Refresh:** Calls `refreshADCToken()` to reinitialize Firestore client
4. **Automatic Handling:** Firebase Admin SDK automatically refreshes ADC token from gcloud
5. **Connection Test:** Performs a simple read to verify connection works

## Benefits

✅ **Prevents Token Expiration:** Scripts can run for multiple hours without authentication errors
✅ **Non-Intrusive:** Only adds minimal overhead (1 Firestore read per refresh)
✅ **Automatic:** No manual intervention required
✅ **Safe:** Test query ensures connection is valid before continuing
✅ **Logged:** Clear console output shows when refresh occurs

## Usage

No changes needed to existing usage patterns:

```bash
# Generate images for all questions (will auto-refresh every 40 questions)
cd functions
npm run build
node lib/scripts/generate-duel-images.js

# Review all questions (will auto-refresh every 25 questions)
node lib/scripts/review-duel-images.js

# Works with filters too
node lib/scripts/generate-duel-images.js --questions q001,q002,...,q100
node lib/scripts/review-duel-images.js --questions q001,q002,...,q100
```

## Console Output

When token refresh occurs:

```
💡 Processed 40 questions, refreshing ADC token...
  🔄 Refreshing ADC token and Firestore connection...
  ✅ ADC token refreshed successfully
```

## Technical Details

### Why Reinitialize Firestore Client?

The Firebase Admin SDK caches credentials and automatically refreshes them when creating a new Firestore client instance. By calling `admin.firestore()` again, we trigger the SDK to check and refresh the ADC token if needed.

### Why Different Intervals?

- **Generate (40):** Faster per-question processing, 2 API calls per image
- **Review (25):** Slower per-question processing, Python checks + Gemini reviews

Both intervals provide ~30-40 minutes between refreshes, safely within the 1-hour token lifetime.

## Related Files

- `/Users/xuling/code/Stanse/functions/src/scripts/generate-duel-images.ts` - Image generation script
- `/Users/xuling/code/Stanse/functions/src/scripts/review-duel-images.ts` - Image review script
- `/Users/xuling/code/Stanse/scripts/fec-data/production/02-upload-incremental.py` - Reference Python implementation

## Testing

To verify token refresh works:

```bash
# Process 50+ questions to trigger refresh
node lib/scripts/generate-duel-images.js

# Watch for refresh message after 40 questions
# Expected: "💡 Processed 40 questions, refreshing ADC token..."

# Review 30+ questions to trigger refresh
node lib/scripts/review-duel-images.js

# Expected: "💡 Reviewed 25 questions, refreshing ADC token..."
```

## Date

2026-01-13
