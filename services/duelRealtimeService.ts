/**
 * DUEL Arena Realtime Service
 *
 * Uses Firebase Realtime Database for:
 * - Matchmaking queue (faster than Firestore)
 * - Online user presence
 * - Real-time queue monitoring
 */

import { rtdb } from './firebase';
import { ref, set, remove, onValue, get, serverTimestamp, onDisconnect } from 'firebase/database';

export interface QueueEntry {
  userId: string;
  stanceType: string;
  personaLabel: string;
  pingMs: number;
  entryFee: number;
  safetyBelt: boolean;
  safetyFee: number;
  duration: 30 | 45;
  joinedAt: number;
  expiresAt: number;
}

/**
 * Join matchmaking queue in Realtime Database
 * Auto-removes on disconnect
 */
export async function joinQueue(params: {
  userId: string;
  stanceType: string;
  personaLabel: string;
  pingMs: number;
  entryFee: number;
  safetyBelt: boolean;
  duration: 30 | 45;
}): Promise<void> {
  const queueRef = ref(rtdb, `matchmaking_queue/${params.userId}`);
  const presenceRef = ref(rtdb, `presence/${params.userId}/inDuelQueue`);

  const now = Date.now();
  const QUEUE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

  const queueEntry: QueueEntry = {
    userId: params.userId,
    stanceType: params.stanceType,
    personaLabel: params.personaLabel,
    pingMs: params.pingMs,
    entryFee: params.entryFee,
    safetyBelt: params.safetyBelt,
    safetyFee: params.safetyBelt ? 5 : 0,
    duration: params.duration,
    joinedAt: now,
    expiresAt: now + QUEUE_TIMEOUT_MS
  };

  // Set queue entry
  await set(queueRef, queueEntry);

  // Update presence
  await set(presenceRef, true);

  // Auto-remove on disconnect
  onDisconnect(queueRef).remove();
  onDisconnect(presenceRef).set(false);

  console.log(`[RTDB Queue] User ${params.userId} joined queue`);
}

/**
 * Leave matchmaking queue
 */
export async function leaveQueue(userId: string): Promise<void> {
  const queueRef = ref(rtdb, `matchmaking_queue/${userId}`);
  const presenceRef = ref(rtdb, `presence/${userId}/inDuelQueue`);

  await remove(queueRef);
  await set(presenceRef, false);

  console.log(`[RTDB Queue] User ${userId} left queue`);
}

/**
 * Get all users in queue (one-time fetch)
 */
export async function getQueueSnapshot(): Promise<QueueEntry[]> {
  const queueRef = ref(rtdb, 'matchmaking_queue');
  const snapshot = await get(queueRef);

  const entries: QueueEntry[] = [];
  const now = Date.now();

  if (snapshot.exists()) {
    const data = snapshot.val();
    Object.values(data).forEach((entry: any) => {
      // Filter out expired entries
      if (entry.expiresAt > now) {
        entries.push(entry);
      }
    });
  }

  return entries;
}

/**
 * Listen for queue updates in real-time
 * Returns unsubscribe function
 */
export function listenToQueue(
  callback: (entries: QueueEntry[]) => void
): () => void {
  const queueRef = ref(rtdb, 'matchmaking_queue');

  return onValue(queueRef, (snapshot) => {
    const entries: QueueEntry[] = [];
    const now = Date.now();

    if (snapshot.exists()) {
      const data = snapshot.val();
      Object.values(data).forEach((entry: any) => {
        if (entry.expiresAt > now) {
          entries.push(entry);
        }
      });
    }

    callback(entries);
  });
}

/**
 * Find compatible opponent for user
 * Returns userId of opponent or null
 */
export async function findOpponent(
  userId: string,
  userEntry: QueueEntry
): Promise<QueueEntry | null> {
  const entries = await getQueueSnapshot();

  const MAX_PING_DIFF = 60;
  const MAX_FEE_DIFF = 5;

  for (const entry of entries) {
    // Skip self
    if (entry.userId === userId) continue;

    // Must have different stance
    if (entry.stanceType === userEntry.stanceType) continue;

    // Must have same duration
    if (entry.duration !== userEntry.duration) continue;

    // Similar ping
    if (Math.abs(entry.pingMs - userEntry.pingMs) > MAX_PING_DIFF) continue;

    // Similar fee
    if (Math.abs(entry.entryFee - userEntry.entryFee) > MAX_FEE_DIFF) continue;

    // Found match!
    return entry;
  }

  return null;
}

/**
 * Remove user from queue (after match found)
 */
export async function removeFromQueue(userId: string): Promise<void> {
  await leaveQueue(userId);
}
