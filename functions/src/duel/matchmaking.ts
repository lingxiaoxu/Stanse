/**
 * Matchmaking System for DUEL Arena
 *
 * Real-time matching of online users based on:
 * - Different political stanceType (ensure opposing views)
 * - Similar network ping (±60ms for fairness)
 * - Similar entry fee (±$5 for balanced stakes)
 * - Same duration preference
 */

import * as admin from 'firebase-admin';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { GoogleGenAI } from '@google/genai';
import { holdCredits, getUserCredits } from './creditManager';

const db = admin.firestore();
const secretClient = new SecretManagerServiceClient();

const PROJECT_ID = 'gen-lang-client-0960644135';
const GEMINI_SECRET_NAME = 'gemini-api-key';

const MAX_PING_DIFF = 60; // Maximum ping difference (ms)
const MAX_FEE_DIFF = 5; // Maximum entry fee difference ($)
const QUEUE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const AI_OPPONENT_WAIT_TIME = 30 * 1000; // Wait 30s before creating AI opponent

// Cache for Gemini API key
let geminiApiKey: string | null = null;

/**
 * Get Gemini API key from Google Secret Manager
 */
async function getGeminiApiKey(): Promise<string> {
  if (geminiApiKey) {
    return geminiApiKey;
  }

  try {
    const [version] = await secretClient.accessSecretVersion({
      name: `projects/${PROJECT_ID}/secrets/${GEMINI_SECRET_NAME}/versions/latest`,
    });

    const payload = version.payload?.data?.toString();
    if (payload) {
      geminiApiKey = payload;
      console.log('✅ Gemini API key loaded from Secret Manager');
      return payload;
    }
  } catch (error) {
    console.error('❌ Failed to load Gemini API key:', error);
  }

  throw new Error('Gemini API key not available');
}

interface QueueEntry {
  userId: string;
  stanceType: string;
  personaLabel: string;
  pingMs: number;
  entryFee: number;
  safetyBelt: boolean;
  safetyFee: number;
  duration: 30 | 45;
  joinedAt: string;
  expiresAt: string;
}

/**
 * Process matchmaking queue - called every 2 seconds by scheduler
 */
export async function processMatchmakingQueue(): Promise<void> {
  const now = new Date();
  const nowIso = now.toISOString();

  console.log(`🔄 [${nowIso}] Running matchmaking...`);

  try {
    // Query all waiting users
    const queueSnapshot = await db
      .collection('duel_matchmaking_queue')
      .where('expiresAt', '>', nowIso)
      .orderBy('expiresAt')
      .orderBy('joinedAt')
      .get();

    if (queueSnapshot.empty) {
      console.log('  ℹ️  Queue empty');
      return;
    }

    const entries: (QueueEntry & { docId: string })[] = [];
    queueSnapshot.forEach(doc => {
      entries.push({ docId: doc.id, ...doc.data() as QueueEntry });
    });

    console.log(`  📊 Found ${entries.length} users in queue`);

    // Try to match pairs
    const matched: string[] = []; // Track matched user IDs

    for (let i = 0; i < entries.length; i++) {
      if (matched.includes(entries[i].userId)) continue;

      const userA = entries[i];

      // Find compatible opponent
      for (let j = i + 1; j < entries.length; j++) {
        if (matched.includes(entries[j].userId)) continue;

        const userB = entries[j];

        // Check match criteria
        if (!canMatch(userA, userB)) continue;

        // Found a match!
        console.log(`  ✅ Matched ${userA.userId} with ${userB.userId}`);

        // Create match
        await createMatch(userA, userB);

        // Mark as matched
        matched.push(userA.userId, userB.userId);

        // Remove from queue
        await db.collection('duel_matchmaking_queue').doc(userA.docId).delete();
        await db.collection('duel_matchmaking_queue').doc(userB.docId).delete();

        break;
      }
    }

    console.log(`  🎯 Matched ${matched.length / 2} pairs`);

    // Create AI opponents for users waiting too long
    for (let i = 0; i < entries.length; i++) {
      if (matched.includes(entries[i].userId)) continue;

      const user = entries[i];
      const waitTime = now.getTime() - new Date(user.joinedAt).getTime();

      // If user waited > 30 seconds, match with AI
      if (waitTime > AI_OPPONENT_WAIT_TIME) {
        console.log(`  🤖 Creating AI opponent for ${user.userId} (waited ${Math.round(waitTime / 1000)}s)`);

        try {
          const aiOpponent = await createAIOpponent(user.stanceType, user.pingMs);
          await createMatch(user, aiOpponent, true);

          matched.push(user.userId);
          await db.collection('duel_matchmaking_queue').doc(user.docId).delete();
        } catch (error) {
          console.error(`  ❌ Failed to create AI opponent: ${error}`);
        }
      }
    }

    // Clean up expired entries
    await cleanupExpiredEntries();
  } catch (error) {
    console.error('❌ Matchmaking error:', error);
  }
}

/**
 * Create AI opponent using Gemini API
 * Generates a political persona different from the user
 */
async function createAIOpponent(userStanceType: string, userPingMs: number): Promise<QueueEntry & { docId: string }> {
  const apiKey = await getGeminiApiKey();
  const ai = new GoogleGenAI({ apiKey });

  // Possible stance types (different from user)
  const allStanceTypes = [
    'progressive-globalist',
    'progressive-nationalist',
    'socialist-libertarian',
    'socialist-nationalist',
    'capitalist-globalist',
    'capitalist-nationalist',
    'conservative-globalist',
    'conservative-nationalist'
  ];

  const differentStances = allStanceTypes.filter(s => s !== userStanceType);
  const aiStanceType = differentStances[Math.floor(Math.random() * differentStances.length)];

  // Generate persona label using Gemini
  let personaLabel = 'AI Opponent';
  try {
    const result = await ai.models.generateContent({
      model: 'gemini-2.0-flash-exp',
      contents: `Generate a short (2-3 words) political persona label for someone with stance type "${aiStanceType}". Just return the label, nothing else. Examples: "Progressive Globalist", "Conservative Nationalist"`
    });

    personaLabel = (result.text || 'AI Opponent').trim();
  } catch (error) {
    console.warn('Failed to generate AI persona label, using default');
  }

  // AI opponent with similar ping
  const aiPing = Math.max(15, Math.min(100, userPingMs + (Math.random() * 20 - 10)));

  const aiOpponent: QueueEntry & { docId: string } = {
    docId: `ai_opponent_${Date.now()}`,
    userId: `ai_bot_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    stanceType: aiStanceType,
    personaLabel: `${personaLabel} (AI)`, // Mark as AI in display
    pingMs: Math.round(aiPing),
    entryFee: 0, // AI doesn't pay entry fee
    safetyBelt: false,
    safetyFee: 0,
    duration: 30, // Will be overridden by user's preference
    joinedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + QUEUE_TIMEOUT_MS).toISOString()
  };

  console.log(`  🤖 Created AI opponent: ${aiOpponent.personaLabel} (${aiOpponent.stanceType})`);

  return aiOpponent;
}

/**
 * Check if two users can be matched
 */
function canMatch(userA: QueueEntry, userB: QueueEntry): boolean {
  // Must have different stanceType
  if (userA.stanceType === userB.stanceType) {
    return false;
  }

  // Must prefer same duration
  if (userA.duration !== userB.duration) {
    return false;
  }

  // Ping must be similar (±60ms)
  if (Math.abs(userA.pingMs - userB.pingMs) > MAX_PING_DIFF) {
    return false;
  }

  // Entry fee must be similar (±$5)
  if (Math.abs(userA.entryFee - userB.entryFee) > MAX_FEE_DIFF) {
    return false;
  }

  return true;
}

/**
 * Create a new match between two users (or user vs AI)
 */
async function createMatch(userA: QueueEntry, userB: QueueEntry, isAIOpponent: boolean = false): Promise<string> {
  const now = new Date().toISOString();
  const matchId = `match_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

  // Hold credits for human players only
  try {
    await holdCredits(userA.userId, userA.entryFee + userA.safetyFee, matchId);

    // Only hold credits for userB if not AI
    if (!isAIOpponent && userB.userId.startsWith('ai_bot_') === false) {
      await holdCredits(userB.userId, userB.entryFee + userB.safetyFee, matchId);
    }
  } catch (error) {
    console.error(`❌ Failed to hold credits for match ${matchId}:`, error);
    throw error;
  }

  // Select random pre-assembled sequence
  const sequenceId = await selectRandomSequence(userA.duration);

  // Create match document
  const matchData = {
    matchId,
    createdAt: now,
    status: 'ready',
    gameType: 'picture_trivia_v1',
    durationSec: userA.duration,

    // For client-side queries (array-contains)
    participantIds: [userA.userId, userB.userId],

    players: {
      A: {
        userId: userA.userId,
        stanceType: userA.stanceType,
        personaLabel: userA.personaLabel,
        pingMs: userA.pingMs
      },
      B: {
        userId: userB.userId,
        stanceType: userB.stanceType,
        personaLabel: userB.personaLabel,
        pingMs: userB.pingMs
      }
    },

    entry: {
      A: {
        fee: userA.entryFee,
        safetyBelt: userA.safetyBelt,
        safetyFee: userA.safetyFee
      },
      B: {
        fee: userB.entryFee,
        safetyBelt: userB.safetyBelt,
        safetyFee: userB.safetyFee
      }
    },

    holds: {
      A: userA.entryFee + userA.safetyFee,
      B: userB.entryFee + userB.safetyFee
    },

    result: {
      winner: null,
      scoreA: 0,
      scoreB: 0,
      victoryReward: 0,
      deductionA: 0,
      deductionB: 0
    },

    questionSequenceRef: sequenceId,

    audit: {
      version: 'v1',
      notes: isAIOpponent
        ? `User vs AI opponent (no real users available after ${AI_OPPONENT_WAIT_TIME / 1000}s wait)`
        : `Real user matchmaking`,
      isAIOpponent: isAIOpponent || false
    }
  };

  await db.collection('duel_matches').doc(matchId).set(matchData);

  console.log(`✅ Created match ${matchId}${isAIOpponent ? ' (vs AI)' : ''}`);
  return matchId;
}

/**
 * Select random pre-assembled sequence for match duration
 */
async function selectRandomSequence(duration: 30 | 45): Promise<string> {
  // Query sequences for this duration
  const sequencesSnapshot = await db
    .collection('duel_sequences')
    .where('duration', '==', duration)
    .get();

  if (sequencesSnapshot.empty) {
    throw new Error(`No sequences found for duration ${duration}s`);
  }

  // Select random sequence
  const sequences = sequencesSnapshot.docs;
  const randomIndex = Math.floor(Math.random() * sequences.length);
  return sequences[randomIndex].id;
}

/**
 * Clean up expired queue entries
 */
async function cleanupExpiredEntries(): Promise<void> {
  const now = new Date().toISOString();

  const expiredSnapshot = await db
    .collection('duel_matchmaking_queue')
    .where('expiresAt', '<=', now)
    .get();

  if (expiredSnapshot.empty) return;

  const batch = db.batch();
  expiredSnapshot.forEach(doc => {
    batch.delete(doc.ref);
  });

  await batch.commit();
  console.log(`  🗑️  Cleaned up ${expiredSnapshot.size} expired entries`);
}

/**
 * Add user to matchmaking queue
 * HTTP callable function exposed to frontend
 */
export async function joinMatchmakingQueue(data: {
  userId: string;
  stanceType: string;
  personaLabel: string;
  pingMs: number;
  entryFee: number;
  safetyBelt: boolean;
  duration: 30 | 45;
}): Promise<string> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + QUEUE_TIMEOUT_MS);

  const safetyFee = data.safetyBelt ? 5 : 0;

  // Validate user has sufficient credits
  const credits = await getUserCredits(data.userId);
  const required = data.entryFee + safetyFee;

  if (credits.balance < required) {
    throw new Error(`Insufficient balance: need ${required}, have ${credits.balance}`);
  }

  const queueEntry: QueueEntry = {
    userId: data.userId,
    stanceType: data.stanceType,
    personaLabel: data.personaLabel,
    pingMs: data.pingMs,
    entryFee: data.entryFee,
    safetyBelt: data.safetyBelt,
    safetyFee,
    duration: data.duration,
    joinedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString()
  };

  await db.collection('duel_matchmaking_queue').doc(data.userId).set(queueEntry);

  console.log(`✅ User ${data.userId} joined matchmaking queue`);
  return data.userId;
}

/**
 * Leave matchmaking queue
 */
export async function leaveMatchmakingQueue(userId: string): Promise<void> {
  await db.collection('duel_matchmaking_queue').doc(userId).delete();
  console.log(`✅ User ${userId} left matchmaking queue`);
}
