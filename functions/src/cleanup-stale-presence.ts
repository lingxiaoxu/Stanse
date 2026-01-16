/**
 * Cleanup Stale Presence and Active Matches
 *
 * 1. Removes users from /presence who haven't sent a heartbeat in 15 minutes
 * 2. Removes expired active_matches (older than 1 hour)
 *
 * Frontend sends heartbeat every 30 seconds.
 * 15 minutes = 30 missed heartbeats = user is definitely offline.
 *
 * Schedule: Every 15 minutes
 */

import * as functions from 'firebase-functions/v2';
import * as admin from 'firebase-admin';

const rtdb = admin.database();
const PRESENCE_STALE_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes
const MATCH_EXPIRY_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes (same as presence)

export const cleanupStalePresence = functions.scheduler.onSchedule(
  {
    schedule: '*/15 * * * *', // Every 15 minutes
    timeZone: 'UTC',
    region: 'us-central1'
  },
  async () => {
    console.log('🧹 [CLEANUP] Starting presence and match cleanup...');

    try {
      const now = Date.now();

      // ===== 1. CLEANUP PRESENCE =====
      console.log('\n1️⃣  Cleaning stale presence records...');
      console.log(`   Threshold: 15 minutes without heartbeat`);

      const presenceRef = rtdb.ref('presence');
      const presenceSnapshot = await presenceRef.once('value');
      const presenceData = presenceSnapshot.val();

      let presenceCleanedCount = 0;
      let presenceActiveCount = 0;
      const cleanedUsers: string[] = [];

      if (presenceData) {
        for (const [userId, data] of Object.entries<any>(presenceData)) {
          const lastSeen = data.lastSeen || 0;
          const minutesAgo = Math.floor((now - lastSeen) / 1000 / 60);

          if ((now - lastSeen) > PRESENCE_STALE_THRESHOLD_MS) {
            await presenceRef.child(userId).remove();
            cleanedUsers.push(`${data.email || userId} (${minutesAgo}m)`);
            presenceCleanedCount++;
          } else {
            presenceActiveCount++;
          }
        }
      }

      console.log(`   Cleaned: ${presenceCleanedCount}, Active: ${presenceActiveCount}`);
      if (cleanedUsers.length > 0) {
        cleanedUsers.forEach(u => console.log(`   🗑️  ${u}`));
      }

      // ===== 2. CLEANUP ACTIVE MATCHES =====
      console.log('\n2️⃣  Cleaning expired active matches...');
      console.log(`   Threshold: 15 minutes old`);

      const matchesRef = rtdb.ref('active_matches');
      const matchesSnapshot = await matchesRef.once('value');
      const matchesData = matchesSnapshot.val();

      let matchesCleanedCount = 0;
      let matchesActiveCount = 0;
      const cleanedMatches: string[] = [];

      if (matchesData) {
        for (const [matchId, matchData] of Object.entries<any>(matchesData)) {
          const startedAt = matchData.startedAt || matchData.expiresAt || 0;
          const matchAge = now - startedAt;
          const minutesOld = Math.floor(matchAge / 1000 / 60);

          if (matchAge > MATCH_EXPIRY_THRESHOLD_MS) {
            // Match is over 15 minutes old - expired
            await matchesRef.child(matchId).remove();
            cleanedMatches.push(`${matchId} (${minutesOld}m old)`);
            matchesCleanedCount++;
          } else {
            matchesActiveCount++;
          }
        }
      }

      console.log(`   Cleaned: ${matchesCleanedCount}, Active: ${matchesActiveCount}`);
      if (cleanedMatches.length > 0) {
        cleanedMatches.forEach(m => console.log(`   🗑️  ${m}`));
      }

      // ===== SUMMARY =====
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📊 Cleanup Summary:');
      console.log(`   Presence: ${presenceCleanedCount} cleaned, ${presenceActiveCount} active`);
      console.log(`   Matches: ${matchesCleanedCount} cleaned, ${matchesActiveCount} active`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    } catch (error) {
      console.error('❌ Error:', error);
    }
  }
);
