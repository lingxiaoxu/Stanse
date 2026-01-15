"use strict";
/**
 * Check Matchmaking Queue Status
 *
 * Shows all users currently waiting for a match in DUEL Arena
 * Usage: npx ts-node src/scripts/check-matchmaking-queue.ts
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
const admin = __importStar(require("firebase-admin"));
// Initialize Firebase Admin
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();
async function checkQueue() {
    console.log('🔍 Checking DUEL Arena matchmaking queue...\n');
    try {
        const now = new Date();
        const nowIso = now.toISOString();
        // Get all queue entries (filter expired ones client-side)
        const queueSnapshot = await db
            .collection('duel_matchmaking_queue')
            .get();
        if (queueSnapshot.empty) {
            console.log('✅ Queue is empty - no users waiting for matches');
            return;
        }
        const entries = [];
        queueSnapshot.forEach(doc => {
            const data = doc.data();
            // Only include non-expired entries
            if (data.expiresAt > nowIso) {
                entries.push(data);
            }
        });
        console.log(`📊 Found ${entries.length} user(s) in queue:\n`);
        entries.forEach((entry, index) => {
            const waitTime = Math.round((now.getTime() - new Date(entry.joinedAt).getTime()) / 1000);
            const timeRemaining = Math.round((new Date(entry.expiresAt).getTime() - now.getTime()) / 1000);
            console.log(`${index + 1}. User: ${entry.userId.substring(0, 12)}...`);
            console.log(`   Persona: ${entry.personaLabel}`);
            console.log(`   Stance: ${entry.stanceType}`);
            console.log(`   Entry Fee: $${entry.entryFee} | Duration: ${entry.duration}s | Safety Belt: ${entry.safetyBelt ? 'YES' : 'NO'}`);
            console.log(`   Ping: ${entry.pingMs}ms`);
            console.log(`   Waiting: ${waitTime}s | Expires in: ${timeRemaining}s`);
            console.log('');
        });
        // Show compatibility matrix
        if (entries.length > 1) {
            console.log('🔗 Compatibility Matrix:');
            console.log('(✅ = can match, ❌ = incompatible)\n');
            for (let i = 0; i < entries.length; i++) {
                for (let j = i + 1; j < entries.length; j++) {
                    const a = entries[i];
                    const b = entries[j];
                    const stanceMatch = a.stanceType !== b.stanceType;
                    const durationMatch = a.duration === b.duration;
                    const pingDiff = Math.abs(a.pingMs - b.pingMs);
                    const pingMatch = pingDiff <= 60;
                    const feeDiff = Math.abs(a.entryFee - b.entryFee);
                    const feeMatch = feeDiff <= 5;
                    const compatible = stanceMatch && durationMatch && pingMatch && feeMatch;
                    console.log(`User ${i + 1} vs User ${j + 1}: ${compatible ? '✅ CAN MATCH' : '❌ INCOMPATIBLE'}`);
                    if (!compatible) {
                        const reasons = [];
                        if (!stanceMatch)
                            reasons.push('same stance');
                        if (!durationMatch)
                            reasons.push(`duration (${a.duration}s vs ${b.duration}s)`);
                        if (!pingMatch)
                            reasons.push(`ping diff ${pingDiff}ms > 60ms`);
                        if (!feeMatch)
                            reasons.push(`fee diff $${feeDiff} > $5`);
                        console.log(`   Reasons: ${reasons.join(', ')}`);
                    }
                }
            }
        }
    }
    catch (error) {
        console.error('❌ Error checking queue:', error);
    }
    process.exit(0);
}
checkQueue();
//# sourceMappingURL=check-matchmaking-queue.js.map