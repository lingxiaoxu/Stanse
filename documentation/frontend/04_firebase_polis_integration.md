# Firebase-Polis Integration Architecture

## Overview
This document describes the integration between Firebase Authentication/Firestore and the Polis Protocol backend to support real user tracking and action recording.

## System Components

### 1. Firebase (Frontend)
- **Firebase Auth**: User authentication (email/password, Google OAuth)
- **Firestore**: User profile storage with political coordinates
- **User Profile Schema**:
  ```typescript
  interface UserProfile {
    uid: string;  // Firebase UID
    email: string;
    displayName: string;
    coordinates: {
      economic: number;   // -100 to 100
      social: number;      // -100 to 100
      diplomatic: number;  // -100 to 100
    };
    onboardingCompleted: boolean;
    createdAt: Timestamp;
    lastActive: Timestamp;
  }
  ```

### 2. Polis Protocol Backend (Rust)
- **DID Format**: `did:polis:firebase:{firebase_uid}`
- **User Mapping**: Firebase UID → Polis DID
- **Data Segregation**: Demo mode toggle controls which data is returned

## Architecture

### User Action Flow
```
User Action (Frontend)
    ↓
Firebase Auth Verification
    ↓
Convert Firebase UID → Polis DID
    ↓
POST /api/v1/actions/submit
    ↓
Backend validates & records
    ↓
Action added to appropriate shard
    ↓
Stats updated in real-time
```

### Data Segregation Strategy

#### Demo Mode ON (`USE_DEMO_DATA=true`)
- Uses test data from lines 37-124 of main.rs
- Test users: `did:polis:user1`, `did:polis:user2`, etc.
- Hardcoded values for testing
- No real user data displayed

#### Demo Mode OFF (`USE_DEMO_DATA=false`)
- Only real Firebase users displayed
- Real actions tracked
- Test data completely hidden
- Stats calculated from actual user activity

## User Action Types

### Supported Actions
1. **Buycott (Support Company)**
   - User purchases from company aligned with values
   - Tracked when user views company ranking
   - `value_diverted`: Estimated purchase amount (cents)

2. **Boycott (Oppose Company)**
   - User avoids company opposed to values
   - Tracked when user views company ranking
   - `value_diverted`: Estimated diverted spending (cents)

3. **Petition Signature**
   - User signs campaign petition
   - Tracked on Campaign tab
   - `value_diverted`: 0 (non-monetary action)

4. **DAO Registration**
   - User registers account (automatic)
   - Tracked on first onboarding completion
   - `value_diverted`: 0

5. **Political Activity Participation**
   - User engages with political content
   - Future: share, comment, vote
   - `value_diverted`: Varies by activity

## Backend Implementation

### New API Endpoints

#### 1. Register Real User
```
POST /api/v1/users/register
Request:
{
  "firebase_uid": "abc123xyz",
  "display_name": "Alice",
  "coordinates": {
    "economic": -45,
    "social": 60,
    "diplomatic": 20
  }
}

Response:
{
  "success": true,
  "data": {
    "polis_did": "did:polis:firebase:abc123xyz",
    "assigned_shard": "green-energy-2025"
  }
}
```

#### 2. Record User Action
```
POST /api/v1/actions/record
Request:
{
  "firebase_uid": "abc123xyz",
  "action_type": "Buycott",
  "target_entity": "TSLA",
  "value_diverted": 5000,  // $50.00
  "metadata": {
    "company_name": "Tesla Inc",
    "stance_alignment": "high"
  }
}

Response:
{
  "success": true,
  "data": {
    "action_id": "uuid-here",
    "recorded_at": 1700000000
  }
}
```

#### 3. Update User Activity
```
POST /api/v1/users/activity
Request:
{
  "firebase_uid": "abc123xyz",
  "is_online": true
}

Response:
{
  "success": true,
  "data": {
    "updated": true
  }
}
```

### Data Structures

#### RealUserRegistry (Rust)
```rust
struct RealUserRegistry {
    // Map: Firebase UID → Polis DID
    uid_to_did: HashMap<String, String>,

    // Map: Polis DID → User Info
    users: HashMap<String, RealUserInfo>,
}

struct RealUserInfo {
    firebase_uid: String,
    polis_did: String,
    display_name: String,
    coordinates: (f32, f32, f32), // economic, social, diplomatic
    is_online: bool,
    last_activity: i64,
    registered_at: i64,
    total_actions: u64,
}
```

## Frontend Implementation

### New Service: `userActionService.ts`

```typescript
// Track when user views company rankings
export async function recordCompanyInteraction(
  uid: string,
  company: string,
  actionType: 'support' | 'oppose',
  estimatedValue: number
) {
  const action = {
    firebase_uid: uid,
    action_type: actionType === 'support' ? 'Buycott' : 'Boycott',
    target_entity: company,
    value_diverted: Math.round(estimatedValue * 100), // Convert to cents
    metadata: {
      timestamp: Date.now(),
      source: 'company_ranking'
    }
  };

  await fetch('http://localhost:8080/api/v1/actions/record', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(action)
  });
}

// Track campaign signature
export async function recordCampaignSignature(
  uid: string,
  campaignId: string
) {
  const action = {
    firebase_uid: uid,
    action_type: 'Vote',
    target_entity: campaignId,
    value_diverted: 0,
    metadata: {
      timestamp: Date.now(),
      source: 'campaign_tab'
    }
  };

  await fetch('http://localhost:8080/api/v1/actions/record', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(action)
  });
}
```

### Integration Points

1. **AuthContext.tsx**: Register user on first login
2. **ValuesCompanyRanking.tsx**: Track company interactions
3. **CampaignView.tsx**: Track petition signatures
4. **ImpactView.tsx**: Display real vs demo data based on mode

## Online Status Tracking

### Strategy
Since Firebase doesn't provide built-in online presence for web, we'll use:

1. **Heartbeat System**:
   - Frontend sends heartbeat every 30 seconds
   - POST /api/v1/users/activity with `is_online: true`
   - Backend marks user offline if no heartbeat for 2 minutes

2. **Page Visibility API**:
   - Track when user switches tabs/minimizes
   - Send `is_online: false` on page hide
   - Send `is_online: true` on page show

3. **BeforeUnload Event**:
   - Send `is_online: false` when user closes tab

## Security Considerations

1. **Firebase Auth Token Verification**:
   - All action recording endpoints require valid Firebase ID token
   - Backend verifies token before recording action

2. **Rate Limiting**:
   - Max 100 actions per user per hour
   - Prevents spam and abuse

3. **Action Validation**:
   - Validate action types
   - Validate value_diverted is reasonable
   - Validate target_entity exists

4. **Privacy**:
   - Use ZK proofs for sensitive actions (future)
   - Don't expose individual actions publicly
   - Aggregate stats only

## Migration Plan

### Phase 1: Backend Infrastructure (Current)
- [x] Fix demo mode toggle in main.rs
- [ ] Create RealUserRegistry structure
- [ ] Implement user registration endpoint
- [ ] Implement action recording endpoint
- [ ] Add activity tracking endpoint

### Phase 2: Frontend Integration
- [ ] Create userActionService.ts
- [ ] Integrate with AuthContext
- [ ] Add action tracking to ValuesCompanyRanking
- [ ] Add action tracking to CampaignView
- [ ] Implement heartbeat system

### Phase 3: Testing & Deployment
- [ ] Test with real Firebase users
- [ ] Verify demo mode toggle works
- [ ] Generate union report to confirm real data
- [ ] Deploy to production

## Expected Behavior

### Demo Mode ON
```
Union Tab shows:
- Active Allies: 5 (test users)
- Union Strength: 1
- Capital Diverted: $50.00
- Campaigns: 2 test campaigns
```

### Demo Mode OFF (After Implementation)
```
Union Tab shows:
- Active Allies: [Real count from Firebase]
- Union Strength: [Calculated from real actions]
- Capital Diverted: [Sum of real user actions]
- Campaigns: [Real campaigns with real participants]
```

## Monitoring

### Metrics to Track
1. **Real Users Registered**: Total Firebase users with Polis DID
2. **Active Users**: Users with heartbeat in last 2 minutes
3. **Actions Recorded**: Total actions by type
4. **Capital Diverted**: Sum of all real user actions
5. **Campaign Participation**: Users signed per campaign

### Logging
- Log all user registrations
- Log all actions recorded
- Log demo mode toggle changes
- Log any validation failures
