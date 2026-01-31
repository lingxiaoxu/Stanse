# User Location Subcollection Design Summary

**Date:** 2026-01-31
**Related:** Global Intelligence Map Technical Design (Doc 68)

---

## Design Decision: Subcollection vs Main Document Modification

### ✅ Chosen Approach: Subcollection

We decided to create a **subcollection** `users/{userId}/users_countries_locations` instead of modifying the main `users` document for the following reasons:

1. **Preserve existing structure** - No changes to main `users` schema
2. **Version history** - Track location changes over time
3. **Flexibility** - Easy to query latest or historical locations
4. **Separation of concerns** - Location data isolated from user profile

---

## Data Structure

### Path
```
users/{userId}/users_countries_locations/{autoId}
```

### Schema

```typescript
interface UserCountryLocation {
  // User reference
  userId: string;

  // Birth country (always uses capital)
  birthCountry?: string;             // e.g., "China"
  birthCountryCode?: string;         // e.g., "CN"
  birthCountryCapital?: {
    name: string;                    // e.g., "Beijing"
    coordinates: {
      latitude: number;              // 39.9042
      longitude: number;             // 116.4074
    };
  };

  // Current location (prefers state capital if available)
  currentCountry?: string;           // e.g., "United States"
  currentCountryCode?: string;       // e.g., "US"
  currentState?: string;             // e.g., "New York"

  // If state is provided, use state capital (more precise)
  currentStateCapital?: {
    name: string;                    // e.g., "Albany"
    coordinates: {
      latitude: number;              // 42.6526
      longitude: number;             // -73.7562
    };
  };

  // Country capital (fallback if no state)
  currentCountryCapital?: {
    name: string;                    // e.g., "Washington, D.C."
    coordinates: {
      latitude: number;
      longitude: number;
    };
  };

  // Metadata
  createdAt: Timestamp;              // Sort by this DESC to get latest
  aiModel: string;                   // "gemini-2.5-flash"
  processingTimeMs: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';

  // Source data (what triggered this record)
  sourceData: {
    birthCountry?: string;
    currentCountry?: string;
    currentState?: string;
  };
}
```

---

## Key Features

### 1. Birth Country Location
- Always uses **country capital**
- Example: China → Beijing (39.9042, 116.4074)

### 2. Current Location Priority
- **If `currentState` is provided:** Use state capital (more precise)
  - Example: New York → Albany (42.6526, -73.7562)
- **If only `currentCountry`:** Use country capital
  - Example: United States → Washington, D.C. (38.9072, -77.0369)

### 3. Versioning
- Multiple records per user allowed
- Always query `ORDER BY createdAt DESC LIMIT 1` to get latest
- Historical data preserved for analytics

---

## Data Flow

### 1. User Updates Location (Existing User)

```
User updates profile:
  - birthCountry: "China"
  - currentCountry: "United States"
  - currentState: "New York"
        ↓
users/{userId} document updated
        ↓
onUserLocationUpdated trigger fires
        ↓
Detects changes:
  - birthCountry changed? ✓
  - currentCountry changed? ✓
  - currentState changed? ✓
        ↓
Call Gemini 2.5 Flash AI
        ↓
AI returns:
  {
    "birthCountry": "China",
    "birthCountryCode": "CN",
    "birthCountryCapital": {
      "name": "Beijing",
      "coordinates": {"latitude": 39.9042, "longitude": 116.4074}
    },
    "currentCountry": "United States",
    "currentCountryCode": "US",
    "currentState": "New York",
    "currentStateCapital": {
      "name": "Albany",
      "coordinates": {"latitude": 42.6526, "longitude": -73.7562}
    },
    "currentCountryCapital": {
      "name": "Washington, D.C.",
      "coordinates": {"latitude": 38.9072, "longitude": -77.0369}
    },
    "confidence": "HIGH"
  }
        ↓
Create new document in:
  users/{userId}/users_countries_locations/{autoId}
        ↓
Frontend queries latest location
        ↓
Display on globe:
  - Birth marker: Beijing
  - Current marker: Albany (state capital, more precise!)
```

### 2. Existing Users (One-time Migration)

```
Run initialization script:
  npx ts-node src/scripts/initialize-user-locations.ts
        ↓
For each user with birthCountry/currentCountry:
  1. Check if users_countries_locations exists
  2. If empty, call AI to analyze location
  3. Create first record in subcollection
        ↓
All existing users now have location data
```

---

## Implementation Components

### 1. Cloud Function Trigger

**File:** `functions/src/user-location-analyzer.ts`

```typescript
export const onUserLocationUpdated = functions.firestore
  .document('users/{userId}')
  .onUpdate(async (change, context) => {
    // Detect location field changes
    // Call AI to analyze
    // Store in subcollection
  });
```

### 2. Initialization Script

**File:** `functions/src/scripts/initialize-user-locations.ts`

One-time batch process for existing users:
- Fetches all users with `birthCountry` or `currentCountry`
- Skips users who already have location records
- Analyzes and stores locations
- Rate-limited (1 req/sec) to avoid API quota

### 3. Globe Markers API Update

**File:** `functions/src/api/globe-markers.ts`

Updated to query subcollection:
```typescript
// Fetch LATEST user location
const userLocationSnapshot = await db
  .collection('users')
  .doc(userId)
  .collection('users_countries_locations')
  .orderBy('createdAt', 'desc')
  .limit(1)
  .get();

// Use state capital if available (more precise)
if (userLocation.currentStateCapital) {
  // Display state capital marker
} else if (userLocation.currentCountryCapital) {
  // Display country capital marker
}
```

---

## AI Prompt Strategy

### Prompt Design

```
You are a geolocation expert. Generate precise location data.

User Data:
- Birth Country: China
- Current Country: United States
- Current State: New York

Rules:
1. For birth country: Always return capital city coordinates
2. For current location:
   - If state provided: Return BOTH state capital AND country capital
   - If only country: Return country capital only
3. Use precise coordinates (decimal degrees)

Return JSON with:
- Country names (full, not abbreviations)
- ISO 3166-1 alpha-2 codes
- Capital city names
- Precise coordinates (latitude/longitude)
- Confidence level
```

### Model Choice

- **Gemini 2.5 Flash** (`gemini-2.5-flash-latest-exp`)
  - Fast response (~500ms)
  - Accurate geocoding
  - Cost-effective ($0.0001875/1K chars input)

---

## Security Rules

```javascript
match /users/{userId} {
  allow read: if request.auth.uid == userId;
  allow update: if request.auth.uid == userId;

  // Subcollection - read own data only, only Cloud Functions can write
  match /users_countries_locations/{locationId} {
    allow read: if request.auth.uid == userId;
    allow write: if false; // Only Cloud Functions
  }
}
```

---

## Usage Examples

### Frontend: Fetch User Location

```typescript
// Fetch latest user location
const userLocationRef = db
  .collection('users')
  .doc(userId)
  .collection('users_countries_locations')
  .orderBy('createdAt', 'desc')
  .limit(1);

const snapshot = await userLocationRef.get();
const latestLocation = snapshot.docs[0]?.data();

if (latestLocation) {
  console.log('Birth:', latestLocation.birthCountryCapital);
  console.log('Current:', latestLocation.currentStateCapital || latestLocation.currentCountryCapital);
}
```

### Backend: Create Location Record

```typescript
// In onUserLocationUpdated trigger
await db
  .collection('users')
  .doc(userId)
  .collection('users_countries_locations')
  .add({
    userId,
    birthCountry: 'China',
    birthCountryCode: 'CN',
    birthCountryCapital: {
      name: 'Beijing',
      coordinates: { latitude: 39.9042, longitude: 116.4074 }
    },
    currentCountry: 'United States',
    currentCountryCode: 'US',
    currentState: 'New York',
    currentStateCapital: {
      name: 'Albany',
      coordinates: { latitude: 42.6526, longitude: -73.7562 }
    },
    currentCountryCapital: {
      name: 'Washington, D.C.',
      coordinates: { latitude: 38.9072, longitude: -77.0369 }
    },
    createdAt: FieldValue.serverTimestamp(),
    aiModel: 'gemini-2.5-flash',
    processingTimeMs: 523,
    confidence: 'HIGH',
    sourceData: {
      birthCountry: 'China',
      currentCountry: 'United States',
      currentState: 'New York'
    }
  });
```

---

## Advantages Over Main Document Approach

| Aspect | Subcollection | Main Document |
|--------|---------------|---------------|
| Schema stability | ✅ No changes to users | ❌ Modifies schema |
| Version history | ✅ Full history | ❌ Overwrites |
| Query flexibility | ✅ Can query old versions | ❌ Only current |
| Testing isolation | ✅ Easy to test separately | ❌ Affects main doc |
| Rollback | ✅ Just delete subcollection | ❌ Need to restore users |
| Analytics | ✅ Track location changes | ❌ No history |

---

## Cost Estimates

### AI Calls
- Average prompt: 300 characters
- Average response: 400 characters
- Cost per call: ~$0.0002

### For 1000 users (one-time migration)
- Total cost: ~$0.20

### Ongoing (per user update)
- Only when location changes (infrequent)
- Estimated: ~50 updates/month
- Cost: ~$0.01/month

---

## Testing Plan

### 1. Unit Tests
- Test AI prompt/response parsing
- Test coordinate validation
- Test subcollection creation

### 2. Integration Tests
- Test trigger fires on user update
- Test location priority (state > country)
- Test latest location query

### 3. Migration Test
- Run initialization script on test environment
- Verify all users get location records
- Check coordinate accuracy for sample users

---

## Deployment Steps

1. **Deploy Cloud Function**
   ```bash
   cd functions
   firebase deploy --only functions:onUserLocationUpdated
   ```

2. **Run Migration Script**
   ```bash
   export GEMINI_API_KEY="your-key"
   npx ts-node src/scripts/initialize-user-locations.ts
   ```

3. **Update Security Rules**
   ```bash
   firebase deploy --only firestore:rules
   ```

4. **Deploy Frontend**
   - Update `globeService.ts` to query subcollection
   - Deploy to production

---

## Monitoring

### Metrics to Track
- Location records created per day
- AI processing time average
- Confidence levels distribution
- Error rate
- Cost per location analysis

### Logs
```typescript
console.log('USER_LOCATION_CREATED', {
  userId,
  processingTimeMs,
  confidence,
  hasStateCapital: !!currentStateCapital,
  hasBirthCountry: !!birthCountry,
});
```

---

## Future Enhancements

1. **Batch Updates**
   - Queue location updates to reduce AI calls
   - Process multiple users in single batch

2. **Caching**
   - Cache country/state capital coordinates
   - Reduce redundant AI calls

3. **User-Initiated Updates**
   - Allow users to manually trigger location refresh
   - "Update my location" button in settings

4. **Location History View**
   - Show user's location history timeline
   - Visualize moves over time

---

## FAQ

**Q: Why not store coordinates directly in users document?**
A: Subcollection preserves history and avoids modifying main schema.

**Q: What if user has no state, only country?**
A: We use country capital as fallback. State capital takes priority if available.

**Q: What happens if AI fails to parse location?**
A: We catch the error and skip creating a record. User location won't appear on globe until next update.

**Q: Can users have multiple location records?**
A: Yes! We always use the latest (ORDER BY createdAt DESC LIMIT 1).

**Q: How accurate are the coordinates?**
A: Gemini 2.5 Flash provides highly accurate capital city coordinates (typically within 100m).

---

**Status:** ✅ Design Complete
**Next Step:** Implement Cloud Function trigger and migration script

