# DUEL Arena PvP System

**Document Number**: 12
**Status**: Implemented
**Date**: 2026-01-09
**Author**: Claude Code

---

## Overview

DUEL Arena is a skill-based, real-time PvP (Player vs Player) game integrated into the Union tab. Players compete in a picture trivia challenge, wagering credits on their reaction speed and accuracy.

### Core Principles

1. **Skill-Based Competition**: Outcomes determined by reaction time and accuracy, not chance
2. **Persona-Based Matchmaking**: Players matched with opponents of different political personas
3. **Entry Fee Model**: Entry fee for gameplay access, victory reward issued by system
4. **Safety Belt Mechanic**: Optional loss protection insurance for high-stakes matches
5. **Credits System**: Virtual currency ($1 = 1 credit), prepared for future real-money integration

---

## Architecture

### Three-Agent System (AI-Powered Question Generation)

The question generation system uses a modern agentic architecture with three specialized agents:

#### 1. **Question Generation Agent**
- **Location**: `/services/agents/questionAgents.ts`
- **Responsibility**: Generate questions with 1 correct + 3 visually similar distractors
- **Input**: Topic cluster key (e.g., "flags_red", "landmarks_tower")
- **Output**: Raw question object with stem, 4 shuffled choices, correct index

**Example**:
```typescript
{
  stem: "Flag of Turkey",
  choices: [shuffled URLs of 4 similar flags],
  correctIndex: 2
}
```

#### 2. **Question Validation Agent**
- **Responsibility**: Validate structure and assign difficulty rating
- **Checks**:
  - Non-empty stem
  - Exactly 4 choices
  - No duplicate choices
  - Valid correct index (0-3)
- **Difficulty Assignment**: EASY / MEDIUM / HARD based on visual similarity analysis

#### 3. **Question Sequencing Agent**
- **Responsibility**: Assemble complete question sequences for matches
- **Strategies**:
  - **FLAT**: Random shuffle, mixed difficulty
  - **ASCENDING**: Easy → Medium → Hard (recommended for onboarding)
  - **DESCENDING**: Hard → Easy (for experienced players)
- **Buffer**: Generates 20% extra questions to prevent exhaustion

**Sequence Generation**:
```typescript
// 30s match → 20-24 questions (1.5s avg response time)
// 45s match → 30-36 questions
const sequence = await questionSequencingAgent.generateSequence(30, 'ASCENDING');
```

---

## Match Flow

### 1. Entry & Validation

**Location**: `ImpactView.tsx` → DUEL Arena Card → `DuelModal.tsx`

**Eligibility Check**:
- User has completed onboarding (has persona/stanceType)
- Sufficient credit balance
- Entry fee within range ($1-$20)
- Safety belt only available for entry fee ≥ $18

### 2. Matchmaking

**Current Implementation** (MVP):
- Mock opponent pool with 6 different persona types
- Ensures opponent has different `stanceType` than user
- Simulates network latency (ping)

**Future Real Matchmaking** (TODO):
```typescript
// Firestore matchmaking queue
duel_matchmaking_queue/{userId}
{
  userId: string,
  stanceType: string,
  entryFee: number,
  safetyBelt: boolean,
  pingMs: number,
  createdAt: timestamp,
  status: 'waiting' | 'matched' | 'expired'
}
```

### 3. Pre-Match Check

**Duration**: 4 seconds
**Purpose**: Network fairness validation

**Ping Difference Check**:
```typescript
if (Math.abs(pingA - pingB) > 60ms) {
  // Cancel match, return to queue
  setError("Connection mismatch. Rematching...");
}
```

### 4. Gameplay

**Mechanics**:
- Timer countdown: 30s or 45s
- Each question:
  - 4 image choices displayed in 2x2 grid
  - First to answer gets the attempt
  - Correct: +1 point
  - Incorrect: -1 point (penalty for guessing)
- Opponent behavior:
  - Simulated reaction time: 1-4 seconds
  - 90% accuracy rate

**UI Components**:
- **HUD**: Scores, timer, opponent persona
- **Question Card**: Text question stem
- **Image Grid**: 4 clickable image choices
- **Overlay**: "TOO SLOW!" when opponent answers first

### 5. Result Calculation

**Algorithm**:
```typescript
// Determine winner
winner = scoreA > scoreB ? 'A' : scoreB > scoreA ? 'B' : 'DRAW';

// Victory Reward (system-issued)
victoryReward = feeA + feeB;

// Winner receives
winnerEarnings = victoryReward - entryFee - safetyBeltFee;

// Loser deduction
loserLoss = safetyBelt ? Math.ceil(entryFee / 2) : entryFee;
loserLoss += safetyBeltFee; // Safety belt fee never refunded on loss
```

### 6. Cash Animation

**Duration**: 3 seconds
**Display**: Full-screen overlay with animated money amount

- **Victory**: `+$XX` in green, bouncing animation
- **Defeat**: `-$XX` in red, ping animation
- **Draw**: `$0` in gray, static

---

## Credits System

### Current Implementation (MVP)

**Storage**: Component state in `ImpactView.tsx`
```typescript
const [userCredits, setUserCredits] = useState(100);
```

**Initial Grant**: 100 credits on first use (TODO: integrate with user profile)

### Future Integration (Production)

**Firestore Structure**:
```typescript
users/{userId}/credits
{
  balance: 100,
  updatedAt: "2026-01-09T...",
  initialGrant: 100,
  grantedAt: "2026-01-09T..."
}

users/{userId}/credits/ledger/{eventId}
{
  type: 'GRANT' | 'HOLD' | 'RELEASE' | 'DEDUCT' | 'REWARD',
  amount: 100, // in cents (1 credit = 100 cents = $1.00)
  matchId: "match_xxx",
  timestamp: "...",
  metadata: {
    description: "Victory reward from match #123",
    balanceBefore: 100,
    balanceAfter: 130
  }
}
```

**Future Real Money Integration**:
- Credits represent $1 USD each
- Withdrawal system (Stripe/PayPal integration)
- KYC/age verification for regulatory compliance
- Transaction ledger for auditing

---

## Safety Belt Mechanic

### Design

**Purpose**: Loss protection insurance for high-stakes matches

**Activation Conditions**:
- Entry fee ≥ $18
- +$5 additional fee (non-refundable)

**Benefit**:
- On loss: Pay only 50% of entry fee (rounded up)
- Example: $20 entry + $5 belt = $25 cost
  - Win: +$40 - $25 = +$15 profit
  - Lose: -$10 - $5 = -$15 loss (saved $10)
  - Draw: $0 (belt fee refunded)

**UI Styling**:
- Yellow/black hazard stripe pattern
- Shield icon (filled when active)
- Prominent "Safety Belt Saved $XX" message on loss screen

---

## Internationalization

All DUEL text is translated into 5 languages (EN, ZH, JA, FR, ES).

**Translation Keys** (`contexts/LanguageContext.tsx`):
```typescript
duel: {
  title: "DUEL ARENA",
  lobby_title: "DUEL LOBBY",
  compliance_title: "Skill-Based Competition",
  compliance_desc: "Entry fee is for gameplay access...",
  find_opponent: "Find Opponent",
  victory: "VICTORY",
  defeat: "DEFEAT",
  // ... 40+ keys
}
```

---

## Compliance & Legal

### Skill-Based Game Classification

**Key Distinctions** (to avoid gambling classification):
1. **No Betting on External Events**: Outcomes determined by player skill, not real-world events
2. **Entry Fee vs. Wager**: Fee is for "gameplay access", not a bet
3. **System-Issued Rewards**: Victory reward comes from system, not "taken from opponent"
4. **Safety Belt = Insurance**: Not a "side bet", but loss protection service

### Required Disclaimers

**Displayed in Lobby**:
```
Skill-Based Competition
Entry fee is for gameplay access. Withdrawals supported.
```

**Future Real Money**:
- Age verification (18+)
- Geolocation check (jurisdiction compliance)
- Self-attestation: "This is entertainment, not gambling"

---

## File Structure

```
/types.ts
  - DuelState enum
  - DuelConfig, DuelPlayer, DuelMatch interfaces
  - Question, QuestionDifficulty types
  - FirestoreDuelMatch, CreditLedgerEvent interfaces

/services/agents/questionAgents.ts
  - QuestionGenerationAgent class
  - QuestionValidationAgent class
  - QuestionSequencingAgent class (exported)

/services/duelService.ts
  - validateEntry()
  - findOpponent() (mock)
  - initMatch()
  - calculateResults()
  - formatCredits()

/components/modals/DuelModal.tsx
  - Main DUEL UI component
  - State management (gameState, match, timers)
  - Gameplay loop
  - Result screens

/components/views/ImpactView.tsx
  - DUEL Arena entry card (between Active Allies and Campaigns)
  - Credits state management
  - Modal trigger

/contexts/LanguageContext.tsx
  - `duel` translation namespace (EN/ZH/JA/FR/ES)
```

---

## TODO: Backend Integration

### 1. Real User Matchmaking

**Cloud Function**: `matchmakeDuelPlayers`

**Logic**:
1. User enters queue → write to `duel_matchmaking_queue/{userId}`
2. Cloud Function triggered every 2s:
   - Query all `status='waiting'` users
   - Filter by:
     - Different `stanceType`
     - Similar `entryFee` (±$5)
     - Similar `pingMs` (±60ms)
   - Create match pair → write to `duel_matches/{matchId}`
   - Update both users: `status='matched'`
3. Client listens to user's queue document for `status` changes

### 2. Server-Side Settlement

**Cloud Function**: `settleDuelMatch`

**Inputs**:
- `matchId`
- `finalScoreA`, `finalScoreB` (from clients)
- Anti-cheat validation (reaction time patterns)

**Actions**:
1. Validate scores (cross-check with expected ranges)
2. Determine winner
3. Calculate credit changes using `calculateResults()`
4. **Atomically** update both users' credit balances
5. Write ledger events
6. Mark match as `status='finished'`

### 3. Credit Management Service

**Functions**:
- `grantInitialCredits(userId)` - Called on first duel entry
- `holdCredits(userId, amount, matchId)` - Freeze credits on match start
- `releaseCredits(userId, matchId)` - Refund on match cancel
- `deductCredits(userId, amount, matchId)` - On loss
- `rewardCredits(userId, amount, matchId)` - On win

**Firestore Security Rules**:
```javascript
match /users/{userId}/credits {
  allow read: if request.auth.uid == userId;
  allow write: if false; // Only cloud functions can write
}

match /users/{userId}/credits/ledger/{eventId} {
  allow read: if request.auth.uid == userId;
  allow create: if false; // Only cloud functions
}
```

---

## Testing

### Manual Test Checklist

- [ ] Enter DUEL Arena from Union tab
- [ ] Validate entry fee slider (1-20)
- [ ] Enable/disable safety belt at $18+ entry fee
- [ ] Switch between 30s/45s duration
- [ ] Click "Find Opponent" → see matching animation
- [ ] Pre-match check → see opponent persona and ping
- [ ] Gameplay:
  - [ ] Answer question correctly → score increases
  - [ ] Opponent answers first → see "TOO SLOW!" overlay
  - [ ] Timer countdown → match ends at 0
- [ ] Victory → see +$XX cash animation → results screen
- [ ] Defeat → see -$XX cash animation → safety belt message if active
- [ ] Draw → see $0 refund message
- [ ] Credits balance updates correctly
- [ ] Test in all 5 languages (EN/ZH/JA/FR/ES)

### Edge Cases

- Insufficient balance → error message
- Safety belt disabled when entry fee < $18
- Network timeout during matchmaking
- Rapid clicking (prevent double-submit)

---

## Performance Considerations

### Bundle Size Impact

**New Files**:
- `questionAgents.ts`: ~5 KB
- `duelService.ts`: ~4 KB
- `DuelModal.tsx`: ~15 KB
- Total: **~24 KB** (gzipped: ~8 KB)

**Optimization**:
- Modal lazy-loaded (only when opened)
- Image assets served from CDNs (flagcdn.com, unsplash.com)
- Question sequences generated once per match (cached)

### Network Efficiency

- Matchmaking: ~2-3 seconds (mock delay)
- Question sequence: Generated client-side (no API call)
- Real-time updates: Future Firestore listeners (~1-2 KB/match)

---

## Future Enhancements

### Short-Term
1. **Real User Matchmaking**: Implement Firestore queue + Cloud Function
2. **Credits Integration**: Connect to user profile in Firestore
3. **Match History**: Show past 10 matches in modal
4. **Leaderboard**: Top 50 players by earnings

### Medium-Term
1. **Question Categories**: Flags, Landmarks, Animals, Logos
2. **Custom Difficulty**: User selects difficulty before match
3. **Spectator Mode**: Watch live matches
4. **Rematch Opponent**: Challenge same opponent again

### Long-Term
1. **Real Money Integration**: Stripe payouts, KYC verification
2. **Tournament Mode**: 8-player bracket, winner-takes-all
3. **Team Duels**: 2v2 cooperative mode
4. **Custom Questions**: Users submit questions for approval

---

## Revision History

| Version | Date       | Changes                                      |
|---------|------------|----------------------------------------------|
| 1.0     | 2026-01-09 | Initial implementation with MVP features     |

---

## Related Documents

- [28_api_key_security_guide.md](../backend/28_api_key_security_guide.md) - API key management
- [40_security_checklist.md](../backend/40_security_checklist.md) - Security best practices
- [11_premium_subscription_system.md](11_premium_subscription_system.md) - Credits & payments reference
