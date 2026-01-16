"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanupStalePresence = void 0;
const functions = __importStar(require("firebase-functions/v2"));
const admin = __importStar(require("firebase-admin"));
const rtdb = admin.database();
const PRESENCE_STALE_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes
const MATCH_EXPIRY_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes (same as presence)
exports.cleanupStalePresence = functions.scheduler.onSchedule({
    schedule: '*/15 * * * *', // Every 15 minutes
    timeZone: 'UTC',
    region: 'us-central1'
}, async () => {
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
        const cleanedUsers = [];
        if (presenceData) {
            for (const [userId, data] of Object.entries(presenceData)) {
                const lastSeen = data.lastSeen || 0;
                const minutesAgo = Math.floor((now - lastSeen) / 1000 / 60);
                if ((now - lastSeen) > PRESENCE_STALE_THRESHOLD_MS) {
                    await presenceRef.child(userId).remove();
                    cleanedUsers.push(`${data.email || userId} (${minutesAgo}m)`);
                    presenceCleanedCount++;
                }
                else {
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
        const cleanedMatches = [];
        if (matchesData) {
            for (const [matchId, matchData] of Object.entries(matchesData)) {
                const startedAt = matchData.startedAt || matchData.expiresAt || 0;
                const matchAge = now - startedAt;
                const minutesOld = Math.floor(matchAge / 1000 / 60);
                if (matchAge > MATCH_EXPIRY_THRESHOLD_MS) {
                    // Match is over 15 minutes old - expired
                    await matchesRef.child(matchId).remove();
                    cleanedMatches.push(`${matchId} (${minutesOld}m old)`);
                    matchesCleanedCount++;
                }
                else {
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
    }
    catch (error) {
        console.error('❌ Error:', error);
    }
});
//# sourceMappingURL=cleanup-stale-presence.js.map