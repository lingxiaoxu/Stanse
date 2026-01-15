# Realtime Database Structure for DUEL Arena

## Overview

Move all real-time user state and matchmaking queue from Firestore to Realtime Database for:
- Better real-time performance
- Automatic presence detection
- Lower latency for matchmaking
- Simpler online user tracking

## Database Structure

```
stanseproject-default-rtdb/
├── presence/                    # Online users (auto-cleanup on disconnect)
│   └── {userId}/
│       ├── userId: string
│       ├── email: string
│       ├── personaLabel: string
│       ├── stanceType: string
│       ├── status: "online" | "away" | "in_queue" | "in_match"
│       ├── lastSeen: timestamp
│       ├── inDuelQueue: boolean
│       └── currentMatchId?: string  # If in match
│
├── matchmaking_queue/           # Users actively looking for match
│   └── {userId}/
│       ├── userId: string
│       ├── stanceType: string
│       ├── personaLabel: string
│       ├── pingMs: number
│       ├── entryFee: number
│       ├── safetyBelt: boolean
│       ├── safetyFee: number
│       ├── duration: 30 | 45
│       ├── joinedAt: timestamp
│       └── expiresAt: timestamp
│
└── active_matches/              # Currently ongoing matches
    └── {matchId}/
        ├── matchId: string
        ├── playerAId: string
        ├── playerBId: string
        ├── firestoreMatchId: string  # Reference to duel_matches doc
        ├── startedAt: timestamp
        ├── expiresAt: timestamp
        └── status: "playing" | "finished"
```

## State Transitions

1. **Login** → `presence/{userId}` created with `status: "online"`
2. **Click FIND OPPONENT** →
   - Add to `matchmaking_queue/{userId}`
   - Update `presence/{userId}/status` to `"in_queue"`
3. **Match Found** →
   - Remove from `matchmaking_queue/{userId}`
   - Add to `active_matches/{matchId}`
   - Update both players `presence/{userId}/status` to `"in_match"`
   - Set `presence/{userId}/currentMatchId`
4. **Match Ends** →
   - Remove from `active_matches/{matchId}`
   - Update `presence/{userId}/status` back to `"online"`
   - Clear `presence/{userId}/currentMatchId`
5. **Disconnect** → Remove all entries (onDisconnect)

## Security Rules

```json
{
  "rules": {
    "presence": {
      "$userId": {
        ".read": true,
        ".write": "$userId === auth.uid"
      }
    },
    "matchmaking_queue": {
      "$userId": {
        ".read": true,
        ".write": "$userId === auth.uid"
      }
    },
    "active_matches": {
      ".read": true,
      "$matchId": {
        ".write": "auth != null"
      }
    }
  }
}
```

## Migration Plan

### Phase 1: Keep Both Systems (Current)
- Firestore: Match data, answers, credit ledger (authoritative)
- RTDB: Presence, queue status (real-time indicators)

### Phase 2: Migrate Queue (Recommended)
- Move `duel_matchmaking_queue` from Firestore to RTDB
- Faster polling, better real-time updates
- Automatic cleanup via `onDisconnect()`

### Benefits

**Realtime Database:**
- Sub-100ms latency for presence updates
- Automatic disconnect handling
- Simpler queries (no compound indexes)
- Better for frequently changing data

**Firestore (Keep for):**
- Match results and history
- Credit ledger (transactional)
- Gameplay events (audit trail)
- Long-term storage

## Implementation Notes

1. **Presence System** - Users auto-marked online on login, offline on disconnect
2. **Queue in RTDB** - Faster matchmaking, real-time queue monitoring
3. **Match Data in Firestore** - Permanent records, complex queries, transactions
4. **Hybrid Approach** - Use each database for what it's best at
