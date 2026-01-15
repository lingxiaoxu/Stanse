/**
 * Match Recovery Service
 *
 * Handles cleanup of abandoned matches and queue entries
 * Runs on page load to recover from crashes/disconnects
 */

import { rtdb } from './firebase';
import { ref, get, remove, update } from 'firebase/database';

/**
 * Check for and cleanup abandoned state on page load
 * Call this when user logs in
 */
export async function recoverUserState(userId: string): Promise<void> {
  console.log('[MatchRecovery] Checking for abandoned state for user:', userId);

  try {
    // Check if user is in matchmaking queue
    const queueRef = ref(rtdb, `matchmaking_queue/${userId}`);
    const queueSnapshot = await get(queueRef);

    if (queueSnapshot.exists()) {
      const queueData = queueSnapshot.val();
      const now = Date.now();

      // If queue entry expired or user is not actively searching, remove it
      if (queueData.expiresAt < now) {
        await remove(queueRef);
        console.log('[MatchRecovery] Removed expired queue entry');
      } else {
        // Queue entry is valid but user refreshed - keep it
        console.log('[MatchRecovery] Valid queue entry found, keeping it');
      }
    }

    // Check if user is in an active match
    const presenceRef = ref(rtdb, `presence/${userId}`);
    const presenceSnapshot = await get(presenceRef);

    if (presenceSnapshot.exists()) {
      const presenceData = presenceSnapshot.val();

      if (presenceData.currentMatchId) {
        // User was in a match - check if it's still active
        const matchRef = ref(rtdb, `active_matches/${presenceData.currentMatchId}`);
        const matchSnapshot = await get(matchRef);

        if (!matchSnapshot.exists() || matchSnapshot.val().status === 'finished') {
          // Match is gone or finished, reset user state
          await update(presenceRef, {
            status: 'online',
            currentMatchId: null,
            inDuelQueue: false
          });
          console.log('[MatchRecovery] Reset user state (match ended)');
        } else {
          // Match is still active - user probably refreshed during match
          // Let them continue or timeout will clean it up
          console.log('[MatchRecovery] User has active match, monitoring...');
        }
      }
    }

    console.log('[MatchRecovery] State recovery complete');
  } catch (error) {
    console.error('[MatchRecovery] Error during recovery:', error);
  }
}

/**
 * Cleanup expired matches (backend function would be better)
 * This is a client-side fallback
 */
export async function cleanupExpiredMatches(): Promise<void> {
  try {
    const matchesRef = ref(rtdb, 'active_matches');
    const snapshot = await get(matchesRef);

    if (!snapshot.exists()) return;

    const now = Date.now();
    const updates: Record<string, null> = {};
    let cleanedCount = 0;

    snapshot.forEach((child) => {
      const match = child.val();
      // Cleanup matches that expired > 1 minute ago
      if (match.expiresAt < now - 60000) {
        updates[`active_matches/${child.key}`] = null;
        cleanedCount++;

        // Also reset players' presence
        if (match.playerAId) {
          updates[`presence/${match.playerAId}/status`] = 'online' as any;
          updates[`presence/${match.playerAId}/currentMatchId`] = null;
        }
        if (match.playerBId) {
          updates[`presence/${match.playerBId}/status`] = 'online' as any;
          updates[`presence/${match.playerBId}/currentMatchId`] = null;
        }
      }
    });

    if (cleanedCount > 0) {
      await update(ref(rtdb), updates);
      console.log(`[MatchRecovery] Cleaned up ${cleanedCount} expired matches`);
    }
  } catch (error) {
    console.error('[MatchRecovery] Error cleaning up matches:', error);
  }
}
