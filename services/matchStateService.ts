/**
 * Match State Service
 *
 * Tracks active matches in Realtime Database for monitoring
 */

import { rtdb } from './firebase';
import { ref, set, remove, update } from 'firebase/database';

/**
 * Add match to active matches tracking
 */
export async function addActiveMatch(
  matchId: string,
  playerAId: string,
  playerBId: string,
  duration: 30 | 45
): Promise<void> {
  const now = Date.now();
  const matchRef = ref(rtdb, `active_matches/${matchId}`);

  await set(matchRef, {
    matchId,
    playerAId,
    playerBId,
    firestoreMatchId: matchId,
    startedAt: now,
    expiresAt: now + (duration * 1000),
    status: 'playing'
  });

  // Update players' presence status (do NOT update other player's presence - permission denied)
  // Players will update their own presence when they see the match
  // Just track the match itself
  console.log(`[MatchState] Match tracking added (players will update own presence)`);

  console.log(`[MatchState] Added active match ${matchId}`);
}

/**
 * Remove match from active matches (when finished)
 */
export async function removeActiveMatch(matchId: string): Promise<void> {
  const matchRef = ref(rtdb, `active_matches/${matchId}`);
  await remove(matchRef);

  console.log(`[MatchState] Removed active match ${matchId}`);
}

/**
 * Update match status
 */
export async function updateMatchStatus(
  matchId: string,
  status: 'playing' | 'finished'
): Promise<void> {
  await update(ref(rtdb, `active_matches/${matchId}`), {
    status
  });
}
