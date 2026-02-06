# 53. Active Fronts Campaign System

**Date:** 2026-01-19
**Author:** Claude Code
**Status:** Implemented
**Version:** 1.0

---

## Overview

The Active Fronts Campaign System is a comprehensive feature that allows users to participate in collective action campaigns targeting S&P 500 companies and industry sectors. The system features personalized campaign recommendations, detailed campaign metadata, offline activity tracking, and a full history system.

---

## System Architecture

### Data Structure

The system stores campaigns in the Firebase collection `union_ACTIVE_FRONTS` using a **main document + history subcollection pattern**, similar to `company_esg_by_ticker`.

```
union_ACTIVE_FRONTS/
├── {campaignId}/                    # Main document (current state)
│   ├── metadata/                    # Campaign metadata
│   ├── offlineActivity/             # Offline activity info
│   ├── history/                     # Subcollection
│   │   └── {timestamp}/            # Historical snapshot
│   └── participants/                # Subcollection
│       └── {userId}/               # User participation record
```

---

## Campaign Types

### 1. Sector Campaigns (20 total)

- **10 sectors** from SP500: Technology, Financial, Healthcare, Consumer, Energy, Industrial, Communications, Utilities, Materials, Real Estate
- **2 campaigns per sector**:
  - SUPPORT (BUYCOTT type)
  - OPPOSE (BOYCOTT type)

**Example:**
- ID: `sector_technology_support`
- Title: "Support Technology Innovation"
- Target: "Technology"
- Type: BUYCOTT
- Companies in Sector: ["Apple Inc", "Microsoft Corp", ...]

### 2. Company Campaigns (250 total)

- **125 SP500 companies** (from `/data/sp500Data.json`, Phase 1: expanded from 84)
- **2 campaigns per company** (125 × 2 = 250):
  - SUPPORT (BUYCOTT type)
  - OPPOSE (BOYCOTT type)

**Example:**
- ID: `company_aapl_support`
- Title: "Back Apple Inc"
- Target: "Apple Inc"
- Type: BUYCOTT
- Ticker: AAPL
- Sector: Technology

---

## Type Definitions

### Campaign Interface

```typescript
interface Campaign {
  id: string;
  title: string;
  target: string;                    // Company name or sector name
  targetType: 'COMPANY' | 'SECTOR';  // Type of target
  type: 'BOYCOTT' | 'BUYCOTT' | 'PETITION';
  participants: number;
  goal: number;
  description: string;
  daysActive: number;

  // Metadata
  metadata?: CampaignMetadata;
  offlineActivity?: OfflineActivity;

  // For sector campaigns
  companiesInSector?: string[];      // List of company names

  // For company campaigns
  ticker?: string;                   // Stock ticker
  sector?: string;                   // Industry sector
}
```

### Campaign Metadata

```typescript
interface CampaignMetadata {
  createdAt: string;                 // ISO date
  updatedAt: string;                 // ISO date
  startDate: string;                 // ISO date
  endDate?: string;                  // Optional end date
  endCondition?: string;             // Optional end condition
  totalBoycottAmount: number;        // Total in cents
  totalBuycottAmount: number;        // Total in cents
  uniqueParticipants: number;        // Count of unique users
  politicalStatement?: string;       // Political manifesto
  goals?: string[];                  // Campaign goals
}
```

### Offline Activity

```typescript
interface OfflineActivity {
  hasProposal: boolean;
  events?: OfflineEvent[];
  isLegallyCompliant?: boolean;
  legalCounsel?: LawyerInfo;
  policeInfo?: PoliceInfo;
}

interface OfflineEvent {
  id: string;
  date: string;
  city: string;
  state: string;
  country: string;
  address?: string;
  attendees?: number;
}

interface LawyerInfo {
  name: string;
  firm: string;
  city: string;
  state: string;
  country: string;
  phone: string;
}

interface PoliceInfo {
  department: string;
  address: string;
  city: string;
  state: string;
  country: string;
  phone: string;
  emergencyContact?: string;
}
```

### User Action

```typescript
interface CampaignUserAction {
  userId: string;
  actionType: 'BOYCOTT' | 'BUYCOTT';
  amountCents: number;
  timestamp: string;
}
```

---

## Services

### 1. activeFrontsService.ts

Core CRUD operations for campaigns.

**Key Functions:**

```typescript
// Generate campaign ID
generateCampaignId(targetType, target, type): string

// Get campaign by ID
getCampaignById(campaignId): Promise<Campaign | null>

// Get all campaigns
getAllCampaigns(): Promise<Campaign[]>

// Get campaigns by target type
getCampaignsByTargetType(targetType): Promise<Campaign[]>

// Save/update campaign (creates history entry)
saveCampaign(campaign): Promise<void>

// Get campaign history
getCampaignHistory(campaignId, limitCount): Promise<any[]>

// Record user action
recordUserAction(campaignId, userId, actionType, amountCents): Promise<void>

// Get user's action in campaign
getUserCampaignAction(campaignId, userId): Promise<CampaignUserAction | null>

// Get all campaigns user participated in
getUserCampaigns(userId): Promise<Campaign[]>
```

### 2. campaignPersonalizationService.ts

Personalized campaign selection based on user's political coordinates and company rankings.

**Key Functions:**

```typescript
// Get 4 personalized campaigns for user
getPersonalizedCampaigns(userCoordinates): Promise<Campaign[]>
// Returns:
// 1. Highest ranked company SUPPORT campaign
// 2. Lowest ranked company OPPOSE campaign
// 3. Most supported sector campaign (based on coreStanceType)
// 4. Most opposed sector campaign (based on coreStanceType)

// Get all campaigns sorted (personalized first, then alphabetical)
getAllCampaignsSorted(userCoordinates?): Promise<Campaign[]>

// Get campaigns with pagination
getCampaignsByPage(page, pageSize, userCoordinates?): Promise<{
  campaigns: Campaign[];
  totalPages: number;
  totalCount: number;
}>
```

**Sector Preferences by Stance Type:**

| Stance Type | Most Supported Sector | Most Opposed Sector |
|-------------|----------------------|---------------------|
| progressive-globalist | Technology | Energy |
| progressive-nationalist | Industrial | Financial |
| socialist-libertarian | Utilities | Financial |
| socialist-nationalist | Industrial | Technology |
| capitalist-globalist | Financial | Utilities |
| capitalist-nationalist | Energy | Technology |
| conservative-globalist | Financial | Consumer |
| conservative-nationalist | Energy | Communications |

---

## UI Components

### 1. ImpactView (UnionView)

Main view showing 4 personalized campaigns.

**Features:**
- Shows 4 personalized campaigns based on user coordinates
- "VIEW ALL" button to see all campaigns
- Campaign cards with progress bars
- "DETAILS" button to see full campaign info
- "AMPLIFY IMPACT" button to log actions

**Integration:**
```typescript
// Fetch personalized campaigns on load
useEffect(() => {
  if (userProfile?.coordinates) {
    const campaigns = await getPersonalizedCampaigns(userProfile.coordinates);
    setCampaigns(campaigns);
  }
}, [userProfile]);
```

### 2. AllCampaignsView

Full campaign list with pagination (8 per page).

**Features:**
- First 4 campaigns are personalized (marked with badge)
- Remaining campaigns sorted alphabetically
- Pagination controls
- Same action buttons as main view

### 3. CampaignDetailModal

Full campaign details modal.

**Displays:**
- Campaign type, target, description
- Progress bar
- Sector companies list (for sector campaigns)
- Metadata: dates, financial impact, goals, political statement
- Offline activity info (if applicable): events, legal counsel, police info
- Action buttons: Close, Amplify Impact

### 4. LogActionModal

Modal for recording user actions (BOYCOTT/BUYCOTT).

**Features:**
- Action type selection
- Amount input (in USD)
- Zero-knowledge proof messaging
- Submit action

---

## Admin Utilities

### Population Script

Located at `/utils/populateActiveFronts.ts`

**Browser Console Usage:**

```javascript
// Generate all campaigns (20 sectors + 168 companies = 188 total)
window.populateActiveFronts()

// Generate sector campaigns only (20 campaigns)
window.populateActiveFronts('sector')

// Generate company campaigns only (168 campaigns)
window.populateActiveFronts('company')
```

**Functions:**

```typescript
// Generate sector campaigns
generateSectorCampaigns(): Campaign[]

// Generate company campaigns
generateCompanyCampaigns(): Campaign[]

// Save campaigns to Firebase
saveCampaignsToFirebase(campaigns): Promise<void>

// Main population function
populateActiveFronts(type: 'all' | 'sector' | 'company'): Promise<void>
```

---

## Data Flow

### 1. Campaign Display Flow

```
User loads Union tab
  ↓
Check if user has coordinates
  ↓
If YES → Fetch personalized campaigns from Firebase
  ├─ Get user's company rankings
  ├─ Get top support company campaign
  ├─ Get top oppose company campaign
  ├─ Get user's stance type
  ├─ Get preferred sector support campaign
  └─ Get opposed sector boycott campaign
  ↓
Display 4 personalized campaigns
```

### 2. User Action Flow

```
User clicks "AMPLIFY IMPACT"
  ↓
LogActionModal opens
  ↓
User selects action type (BOYCOTT/BUYCOTT)
  ↓
User enters amount (in USD)
  ↓
Submit action
  ↓
recordUserAction() → activeFrontsService
  ├─ Save to participants/{userId} subcollection
  ├─ Update campaign totals (participants, amounts)
  └─ Create history entry
  ↓
Refresh campaign data
```

### 3. History Tracking

Every campaign update creates a history entry:

```typescript
// When saveCampaign() is called
await setDoc(campaignRef, campaignData, { merge: true });

// Also create history entry
await addDoc(historyCollection, {
  ...campaignData,
  timestamp: now,
  action: 'updated'
});
```

---

## Firebase Security Rules

Add these rules to `firestore.rules`:

```javascript
// Active Fronts Campaigns
match /union_ACTIVE_FRONTS/{campaignId} {
  // Anyone can read campaigns
  allow read: if true;

  // Only admins can write campaigns
  allow write: if request.auth != null &&
    get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';

  // History subcollection
  match /history/{historyId} {
    allow read: if true;
    allow write: if false; // System only
  }

  // Participants subcollection
  match /participants/{userId} {
    // Users can read their own participation
    allow read: if request.auth != null && request.auth.uid == userId;

    // Users can write their own participation
    allow write: if request.auth != null && request.auth.uid == userId;
  }
}
```

---

## Personalization Logic

### Company Campaign Selection

1. **Fetch user's company rankings** from `enhanced_company_rankings/{coreStanceType}`
2. **Select top support company**: `supportCompanies[0]` (highest score)
3. **Select top oppose company**: `opposeCompanies[0]` (lowest score)
4. **Find matching campaigns** with target ticker

### Sector Campaign Selection

1. **Get user's stance type** from `coordinates.coreStanceType`
2. **Map stance to sector preferences** (e.g., progressive-globalist → Technology/Energy)
3. **Find sector campaigns** matching the preferences

---

## Multi-Language Support

The system is designed to be extended with multi-language support:

1. Campaign titles, descriptions, and goals are stored in English
2. Translation can be added later using the same pattern as the news feed system
3. Campaign IDs remain language-agnostic
4. UI labels use the existing `useLanguage()` context

**Future Enhancement:**
```typescript
interface Campaign {
  // ...existing fields
  translations?: {
    [language: string]: {
      title: string;
      description: string;
      goals?: string[];
    }
  }
}
```

---

## API Key Security

All Gemini API calls follow the global security pattern:

```typescript
// Do NOT hardcode API keys
const apiKey = process.env.GEMINI_API_KEY || '';

// Keys are injected during build via Secret Manager
// See cloudbuild.yaml for configuration
```

---

## Testing & Debugging

### Browser Console Utilities

```javascript
// Populate campaigns
window.populateActiveFronts()

// Generate campaign structures (without saving)
window.generateSectorCampaigns()
window.generateCompanyCampaigns()
```

### Firebase Console Queries

```javascript
// Get all campaigns
db.collection('union_ACTIVE_FRONTS').get()

// Get campaign history
db.collection('union_ACTIVE_FRONTS')
  .doc('company_aapl_support')
  .collection('history')
  .orderBy('timestamp', 'desc')
  .get()

// Get user participation
db.collection('union_ACTIVE_FRONTS')
  .doc('company_aapl_support')
  .collection('participants')
  .doc(userId)
  .get()
```

---

## Performance Considerations

### Caching Strategy

1. **Personalized campaigns** are cached in component state
2. **Refresh interval**: 30 seconds (aligned with Polis Protocol backend)
3. **Lazy loading**: Only fetch campaigns when Union tab is active

### Pagination

- **Page size**: 8 campaigns per page
- **First 4**: Always personalized (if user has coordinates)
- **Remaining**: Alphabetically sorted

### Firebase Queries

- Use `.get()` for initial load
- Use `.where()` for filtered queries
- Avoid collection group queries for participants (query per campaign instead)

---

## Future Enhancements

### Phase 2 Features

1. **Multi-language campaign content**
   - Translate titles, descriptions, goals
   - Use parallel structure as news feed system

2. **Campaign notifications**
   - Notify users when personalized campaigns are close to goal
   - Breaking news integration for campaign-related events

3. **Advanced analytics**
   - Track campaign momentum (velocity of participant growth)
   - Sector-wide impact visualization
   - Geographic distribution of participants

4. **Social features**
   - Share campaigns with friends
   - Campaign leaderboards
   - User-generated campaigns (with moderation)

5. **Offline event RSVP**
   - Allow users to RSVP for offline events
   - Generate QR codes for event check-in
   - Track attendance

---

## Related Documentation

- [52. Multi-Language News Feed Architecture](./52_multilanguage_news_feed_architecture.md)
- [Enhanced Company Rankings System](./enhanced_company_rankings.md)
- [User Persona & Stance System](./user_persona_system.md)

---

## Files Changed/Added

### New Files
```
/services/activeFrontsService.ts
/services/campaignPersonalizationService.ts
/utils/populateActiveFronts.ts
/components/modals/CampaignDetailModal.tsx
/components/views/AllCampaignsView.tsx
```

### Modified Files
```
/types.ts                              # Added Campaign-related interfaces
/components/views/ImpactView.tsx       # Integrated personalized campaigns
/App.tsx                               # Imported populate utilities
```

---

## Deployment Checklist

- [ ] Run `window.populateActiveFronts()` in production console
- [ ] Verify all 188 campaigns are created
- [ ] Update Firebase security rules
- [ ] Test personalized campaign selection for different stance types
- [ ] Verify history tracking is working
- [ ] Test user action recording
- [ ] Ensure VIEW ALL pagination works correctly
- [ ] Validate campaign detail modal displays all metadata

---

## Summary

The Active Fronts Campaign System provides a robust, scalable infrastructure for collective action campaigns. With 188 pre-generated campaigns (20 sectors + 168 companies), personalized recommendations based on political coordinates, comprehensive metadata tracking, and a full history system, users can discover and participate in campaigns that align with their values.

The system is designed to scale, with clear extension points for multi-language support, advanced analytics, and social features.
