# DUEL Arena Backend Integration

**Document Number**: 44
**Status**: Implemented
**Date**: 2026-01-09
**Author**: Claude Code

---

## Overview

Complete backend infrastructure for DUEL Arena PvP system with real user matchmaking, credit management, and detailed game tracking.

### Architecture

```
Frontend (React)
    ↓
Firebase Client SDK
    ↓
Cloud Functions (HTTP Callable)
    ↓
Firestore Database
    ↓
Google Secret Manager (API Keys)
```

---

## Firestore Collections

### 1. User Credits System

**Pattern**: Main document + history subcollection (same as `company_esg_by_ticker`)

#### `user_credits/{userId}`
```typescript
{
  userId: string;
  balance: number;              // Current balance in credits
  totalGranted: number;         // Lifetime grants
  totalSpent: number;           // Lifetime losses
  totalEarned: number;          // Lifetime wins
  updatedAt: string;
  lastTransactionAt: string;
}
```

#### `user_credits/{userId}/history/{eventId}`
```typescript
{
  eventId: string;
  type: 'GRANT' | 'HOLD' | 'RELEASE' | 'DEDUCT' | 'REWARD';
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  matchId?: string;
  timestamp: string;
  metadata?: {
    reason: string;
    description: string;
  };
}
```

**Operations**:
- `GRANT`: Initial 100 credits on first entry
- `HOLD`: Freeze credits when match starts
- `RELEASE`: Refund on match cancel/draw
- `DEDUCT`: Remove credits (loser)
- `REWARD`: Add credits (winner)

---

### 2. Questions Database

#### `duel_questions/{questionId}`
```typescript
{
  questionId: string;           // "q001", "q002", etc.
  stem: string;                 // "Flag of the United States"
  category: 'FLAGS' | 'LANDMARKS' | 'ANIMALS' | 'LOGOS' | 'FOOD' | 'SYMBOLS';
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';

  images: [
    {
      url: string;              // Base64 data URL or Firebase Storage URL
      isCorrect: boolean;
      prompt: string;           // AI generation prompt
      generatedAt: string;
      index: number;            // 0-3
    }
  ];

  correctIndex: number;
  createdAt: string;
  metadata: {
    imageGenModel: 'imagen-3.0-generate-001';
    imageSize: '512x512';
    stylePrompt: string;
  };
}
```

**Quantities**:
- Total: 150 questions
- EASY: 40 questions
- MEDIUM: 70 questions
- HARD: 40 questions

---

### 3. Pre-Assembled Sequences

#### `duel_sequences/{sequenceId}`
```typescript
{
  sequenceId: string;           // "30s_ascending_01", "45s_flat_02", etc.
  duration: 30 | 45;
  difficultyStrategy: 'FLAT' | 'ASCENDING' | 'DESCENDING';
  questionCount: number;        // 60 for 30s, 90 for 45s

  questions: [
    {
      questionId: string;       // Reference to duel_questions/{id}
      order: number;            // 0-based position
      difficulty: 'EASY' | 'MEDIUM' | 'HARD';
    }
  ];

  createdAt: string;
  metadata: {
    easyCount: number;
    mediumCount: number;
    hardCount: number;
  };
}
```

**Quantities**:
- 30s matches: 6 sequences (60 questions each)
- 45s matches: 6 sequences (90 questions each)
- Total: 12 pre-assembled sequences

---

### 4. Matchmaking Queue

#### `duel_matchmaking_queue/{userId}`
```typescript
{
  userId: string;
  stanceType: string;           // From user's political coordinates
  personaLabel: string;
  pingMs: number;

  entryFee: number;             // 1-20
  safetyBelt: boolean;
  safetyFee: number;            // 5 if safetyBelt, else 0
  duration: 30 | 45;

  joinedAt: string;
  expiresAt: string;            // Auto-remove after 5 minutes
}
```

**Lifecycle**:
1. User clicks "Find Opponent" → writes to queue
2. Scheduler runs every 2 minutes → processes queue
3. Match found → removes both users from queue
4. Timeout (5 min) → auto-removed

---

### 5. Duel Matches

#### `duel_matches/{matchId}`
```typescript
{
  matchId: string;
  createdAt: string;
  status: 'matching' | 'ready' | 'in_progress' | 'finished' | 'cancelled';

  gameType: 'picture_trivia_v1';
  durationSec: 30 | 45;

  players: {
    A: { userId: string; stanceType: string; personaLabel: string; pingMs: number; };
    B: { userId: string; stanceType: string; personaLabel: string; pingMs: number; };
  };

  entry: {
    A: { fee: number; safetyBelt: boolean; safetyFee: number; };
    B: { fee: number; safetyBelt: boolean; safetyFee: number; };
  };

  holds: {
    A: number;                  // feeA + safetyFeeA
    B: number;                  // feeB + safetyFeeB
  };

  result: {
    winner: 'A' | 'B' | 'draw' | null;
    scoreA: number;
    scoreB: number;
    victoryReward: number;      // feeA + feeB
    deductionA: number;
    deductionB: number;
    settledAt?: string;
  };

  questionSequenceRef: string;  // e.g., "30s_ascending_01"

  audit: {
    version: 'v1';
    notes?: string;
  };
}
```

#### `duel_matches/{matchId}/gameplay_events/{eventId}`
```typescript
{
  eventId: string;
  questionId: string;
  questionOrder: number;        // Position in sequence

  playerId: string;             // userId who answered
  answerIndex: number;          // 0-3
  isCorrect: boolean;

  timestamp: string;            // When answered
  timeElapsed: number;          // Milliseconds from match start

  currentScoreA: number;
  currentScoreB: number;
}
```

**Detailed Tracking**: Every answer is recorded with timestamp, correctness, and scores

---

### 6. Platform Revenue

#### `duel_platform_revenue/{monthId}`
```typescript
{
  monthId: string;              // "2026-01"
  period: string;

  totalMatches: number;
  safetyBeltFeesCollected: number;  // House earnings

  matchesWith30s: number;
  matchesWith45s: number;
  drawCount: number;
  cancelledCount: number;

  safetyBeltUsageRate: number;  // Percentage

  createdAt: string;
  updatedAt: string;
}
```

**Revenue Source**: All safety belt fees ($5 per player if enabled)

---

## Cloud Functions

### Deployed Functions

| Function Name | Type | Schedule | Purpose |
|--------------|------|----------|---------|
| `runDuelMatchmaking` | Scheduler | Every 2 min | Match waiting users |
| `joinDuelQueue` | HTTP Callable | On-demand | Join matchmaking |
| `leaveDuelQueue` | HTTP Callable | On-demand | Leave matchmaking |
| `getDuelCredits` | HTTP Callable | On-demand | Get credit balance |
| `getDuelCreditHistory` | HTTP Callable | On-demand | Get transaction history |
| `submitDuelAnswer` | HTTP Callable | On-demand | Record gameplay event |
| `finalizeDuelMatch` | HTTP Callable | On-demand | Settle match |

### Implementation Files

```
/functions/src/duel/
├── creditManager.ts          # Core credit operations
├── matchmaking.ts            # Real user matching logic
└── settlement.ts             # Result calculation + settlement

/functions/src/index.ts       # Export all DUEL functions
```

---

## Security & Compliance

### API Key Management

**ALL API keys stored in Google Secret Manager** (never hardcoded):

```typescript
// Pattern from /functions/src/index.ts lines 22-45
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

const secretClient = new SecretManagerServiceClient();
let geminiApiKey: string | null = null;

async function getGeminiApiKey(): Promise<string> {
  if (geminiApiKey) return geminiApiKey;

  const [version] = await secretClient.accessSecretVersion({
    name: `projects/gen-lang-client-0960644135/secrets/gemini-api-key/versions/latest`,
  });

  geminiApiKey = version.payload?.data?.toString() || '';
  return geminiApiKey;
}
```

### Firestore Security Rules

All DUEL collections protected (lines 296-356 in `/firestore.rules`):

- **user_credits**: Users read own, Cloud Functions write
- **duel_questions**: Public read, admin write
- **duel_sequences**: Public read, admin write
- **duel_matchmaking_queue**: Users read/write own entry
- **duel_matches**: Players read own matches, Cloud Functions write
- **gameplay_events**: Players read own events, Cloud Functions write
- **duel_platform_revenue**: Authenticated read, Cloud Functions write

### Anti-Cheat Validation

**Server-side checks in settlement**:
1. Timestamps must be sequential
2. Minimum human reaction time: 100ms per answer
3. Flag if >30% of answers are suspiciously fast
4. All scoring calculated server-side (client cannot manipulate)

---

## Data Generation Scripts

### Generate Questions with AI Images

**File**: `/scripts/duel/generate-questions-with-ai-images.ts`

**Usage**:
```bash
# Load API key from Secret Manager
GEMINI_API_KEY=$(gcloud secrets versions access latest --secret="gemini-api-key")

# Run generation script
npx ts-node scripts/duel/generate-questions-with-ai-images.ts
```

**Process**:
1. Fetch Gemini API key from Secret Manager
2. For each of 150 questions:
   - Generate 1 correct image
   - Generate 3 distractor images (similar but different)
   - Upload to Firebase Storage (optional) or store as base64
   - Write to Firestore: `duel_questions/{questionId}`
3. Rate limiting: 1 second delay between requests
4. Batch commit: Every 10 questions

**Output**: 150 questions in Firestore

---

### Generate Pre-Assembled Sequences

**File**: `/scripts/duel/generate-sequences.ts`

**Usage**:
```bash
npx ts-node scripts/duel/generate-sequences.ts
```

**Process**:
1. Fetch all 150 questions from Firestore
2. Create 6 sequences for 30s (60 questions each)
3. Create 6 sequences for 45s (90 questions each)
4. Apply strategies:
   - FLAT: Random shuffle
   - ASCENDING: Sort easy → medium → hard
   - DESCENDING: Sort hard → medium → easy
5. Write to Firestore: `duel_sequences/{sequenceId}`

**Output**: 12 sequences in Firestore

---

## Matchmaking Algorithm

### Criteria

Users can only match if ALL conditions are met:

1. **Different Stance Type**: `stanceTypeA !== stanceTypeB`
2. **Same Duration**: Both want 30s or both want 45s
3. **Similar Ping**: `|pingA - pingB| ≤ 60ms`
4. **Similar Entry Fee**: `|feeA - feeB| ≤ $5`

### Process Flow

```
User A clicks "Find Opponent"
    ↓
Frontend calls joinDuelQueue()
    ↓
Cloud Function writes to duel_matchmaking_queue/{userId}
    ↓
Scheduler (every 2 min) runs processMatchmakingQueue()
    ↓
Find compatible pair → Create match
    ↓
Hold credits for both players (atomic)
    ↓
Write to duel_matches/{matchId}
    ↓
Frontend listens to match document → Start gameplay
```

---

## Settlement Flow

### Game End Trigger

- Timer expires (30s or 45s)
- Client calls `finalizeDuelMatch(matchId)`

### Settlement Steps

1. **Fetch gameplay events** from subcollection
2. **Anti-cheat validation**:
   - Check timestamps are sequential
   - Verify human reaction times
   - Flag suspicious patterns
3. **Calculate scores** from events (correct = +1, wrong = -1)
4. **Determine winner**: `scoreA > scoreB` → A wins, else B or draw
5. **Calculate credits**:
   ```typescript
   victoryReward = feeA + feeB;  // System-issued

   if (winner === 'A') {
     rewardA = victoryReward;
     lossB = hasBeltB ? ceil(feeB / 2) : feeB;
     deductionB = lossB;
     platformRevenue = safetyFeeA + safetyFeeB;
   }
   ```
6. **Atomic settlement**:
   - Release held credits
   - Deduct from loser
   - Reward winner
   - Update match result
   - Record platform revenue

---

## Credits Accounting

### Transaction Flow

**Entry**:
```
User balance: $100
Entry fee: $10, Safety belt: $5
→ Hold $15
→ Balance shown: $100 (held amount tracked separately)
```

**Win**:
```
Victory reward: $20 (feeA $10 + feeB $10)
Release $15
Reward $20
Deduct entry: $0 (already held)
→ Net: +$5
→ New balance: $105
```

**Loss (with safety belt)**:
```
Release $15
Deduct $5 (half of $10 entry fee)
Deduct $5 (safety belt fee, non-refundable)
→ Net: -$10
→ New balance: $90
```

**Draw**:
```
Release $15 (full refund including safety belt)
→ Net: $0
→ Balance: $100
```

### Platform Revenue

**Source**: Safety belt fees only
```
Platform earns = safetyFeeA + safetyFeeB

Example:
- Both players use safety belt ($5 each)
- Match completes (win/loss/draw doesn't matter)
- Platform revenue: $10
```

**Note**: Entry fees are NOT platform revenue (they transfer between players as rewards)

---

## API Key Security

### Secret Manager Integration

All API keys retrieved from Google Secret Manager:

```typescript
// Pattern from /functions/src/index.ts
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

const secretClient = new SecretManagerServiceClient();

async function getGeminiApiKey(): Promise<string> {
  const [version] = await secretClient.accessSecretVersion({
    name: 'projects/gen-lang-client-0960644135/secrets/gemini-api-key/versions/latest',
  });

  return version.payload?.data?.toString() || '';
}
```

**Available Secrets**:
- `gemini-api-key`: For AI image generation
- `polygon-api-key`: For stock data (not used in DUEL)
- `FMP_API_KEY`: For ESG scores (not used in DUEL)

**NEVER**:
- ❌ Hardcode API keys in source code
- ❌ Store API keys in environment variables in code
- ❌ Commit API keys to Git

**ALWAYS**:
- ✅ Use Secret Manager for all production keys
- ✅ Cache keys in function instance (performance)
- ✅ Handle errors gracefully if secret unavailable

---

## Deployment

### Deploy Cloud Functions

```bash
cd functions
npm run build
firebase deploy --only functions
```

**Deployed Functions**:
- `runDuelMatchmaking` (Scheduler)
- `joinDuelQueue` (HTTP Callable)
- `leaveDuelQueue` (HTTP Callable)
- `getDuelCredits` (HTTP Callable)
- `getDuelCreditHistory` (HTTP Callable)
- `submitDuelAnswer` (HTTP Callable)
- `finalizeDuelMatch` (HTTP Callable)

### Deploy Firestore Rules

```bash
firebase deploy --only firestore:rules
```

### Generate Initial Data

```bash
# 1. Generate 150 questions with AI images
GEMINI_API_KEY=$(gcloud secrets versions access latest --secret="gemini-api-key")
npx ts-node scripts/duel/generate-questions-with-ai-images.ts

# 2. Generate 12 sequences
npx ts-node scripts/duel/generate-sequences.ts
```

---

## Testing Checklist

### Backend

- [ ] Credits:
  - [ ] User gets 100 credits on first duel entry
  - [ ] Credits hold/release works correctly
  - [ ] History records all transactions
  - [ ] Main document updates from history

- [ ] Matchmaking:
  - [ ] Two users with different stanceType can match
  - [ ] Users with same stanceType cannot match
  - [ ] Ping difference validation works (±60ms)
  - [ ] Entry fee similarity works (±$5)
  - [ ] Queue expires after 5 minutes

- [ ] Match Tracking:
  - [ ] Every answer creates gameplay event
  - [ ] Scores update in real-time
  - [ ] Anti-cheat catches suspicious patterns

- [ ] Settlement:
  - [ ] Winner receives correct reward
  - [ ] Loser loses correct amount
  - [ ] Safety belt reduces loss to 50%
  - [ ] Draw refunds everything
  - [ ] Platform revenue recorded

### Frontend

- [ ] Modal opens from Union tab
- [ ] Credits balance displays correctly
- [ ] Join matchmaking → see "Scanning" animation
- [ ] Match found → see opponent info
- [ ] Gameplay works with real questions from Firestore
- [ ] Timer countdown → auto-settlement
- [ ] Cash animation shows correct amount
- [ ] Results screen shows updated balance

---

## Monitoring & Analytics

### Admin Queries

**Total platform revenue**:
```typescript
const revenueSnap = await db.collection('duel_platform_revenue').get();
let totalRevenue = 0;
revenueSnap.forEach(doc => {
  totalRevenue += doc.data().safetyBeltFeesCollected;
});
```

**User statistics**:
```typescript
const userCredits = await db.collection('user_credits').doc(userId).get();
const history = await db
  .collection('user_credits')
  .doc(userId)
  .collection('history')
  .orderBy('timestamp', 'desc')
  .limit(50)
  .get();
```

**Match statistics**:
```typescript
const matches = await db
  .collection('duel_matches')
  .where('status', '==', 'finished')
  .orderBy('createdAt', 'desc')
  .limit(100)
  .get();
```

---

## Future Enhancements

### Phase 2: Real Money Integration

1. **Stripe Integration**:
   - Add `/user_payments/{userId}` collection
   - Link credits to USD via Stripe
   - Withdrawal function: `requestPayout(amount)`
   - KYC verification via Stripe Identity

2. **Regulatory Compliance**:
   - Age verification (18+)
   - Geolocation restrictions (state laws)
   - Self-exclusion options
   - Responsible gaming limits

3. **Audit Trail**:
   - Every transaction logged
   - Monthly reconciliation reports
   - Blockchain anchor for transparency

---

## Related Documents

- [12_duel_arena_pvp_system.md](../frontend/12_duel_arena_pvp_system.md) - Frontend architecture
- [28_api_key_security_guide.md](28_api_key_security_guide.md) - Secret Manager usage
- [40_security_checklist.md](40_security_checklist.md) - Security best practices

---

## Revision History

| Version | Date       | Changes                                      |
|---------|------------|----------------------------------------------|
| 1.0     | 2026-01-09 | Initial backend integration with Cloud Functions |
