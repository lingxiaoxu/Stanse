"use strict";
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
exports.generateApiKey = void 0;
const functions = __importStar(require("firebase-functions/v2"));
const admin = __importStar(require("firebase-admin"));
const crypto = __importStar(require("crypto"));
/**
 * 生成一个新的 API Key
 * 格式：stanse-{40位base36字符}
 * 总长度：47字符
 */
function generateRawApiKey() {
    const raw = crypto.randomBytes(30).toString('hex'); // 60位十六进制
    const base36 = BigInt('0x' + raw).toString(36).slice(0, 40).padStart(40, '0');
    return `stanse-${base36}`;
}
/**
 * SHA-256 hash API Key（用于 Firestore 存储，不存明文）
 */
function hashApiKey(key) {
    return crypto.createHash('sha256').update(key).digest('hex');
}
/**
 * generateApiKey - callable Cloud Function
 *
 * 功能：为已登录用户生成或重新生成 API Key
 * 前提：
 *   1. 用户已通过 Firebase Auth 登录
 *   2. 用户已完成 Onboarding（坐标 label != 'Uncalibrated'）
 *
 * 流程：
 *   1. 验证登录状态
 *   2. 检查用户坐标 label 不为 Uncalibrated
 *   3. 读取 user_subscriptions 确定 plan
 *   4. 若已有旧 key，将旧 key 写入 history 子集合
 *   5. 生成新 key，hash 后写入 authentication_api_keys/{userId}
 *   6. 返回明文 key（只此一次，不再存储明文）
 */
exports.generateApiKey = functions.https.onCall({
    region: 'us-central1',
    timeoutSeconds: 30,
    memory: '256MiB',
}, async (request) => {
    // 1. 验证用户已登录
    if (!request.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'You must be logged in to generate an API key.');
    }
    const userId = request.auth.uid;
    const db = admin.firestore();
    // 2. 检查用户坐标 label 不为 Uncalibrated
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'User profile not found.');
    }
    const userData = userDoc.data();
    const coordinatesLabel = userData?.coordinates?.label;
    if (!coordinatesLabel || coordinatesLabel === 'Uncalibrated') {
        throw new functions.https.HttpsError('failed-precondition', 'You must complete the Fingerprint survey before generating an API key.');
    }
    // 3. 读取 user_subscriptions 确定 plan（找不到则默认 free）
    let plan = 'free';
    try {
        const subDoc = await db.collection('user_subscriptions').doc(userId).get();
        if (subDoc.exists) {
            const subData = subDoc.data();
            plan = subData.status === 'active' ? 'premium' : 'free';
        }
    }
    catch (err) {
        console.warn('Could not read subscription status, defaulting to free:', err);
    }
    // 4. 检查是否已有旧 key，若有则写入 history
    const keyDocRef = db.collection('authentication_api_keys').doc(userId);
    const existingDoc = await keyDocRef.get();
    let generationCount = 1;
    if (existingDoc.exists) {
        const existingData = existingDoc.data();
        generationCount = (existingData.generationCount ?? 1) + 1;
        // 将旧 key 写入 history 子集合
        const historyId = new Date().toISOString().replace(/[:.]/g, '-');
        await keyDocRef.collection('history').doc(historyId).set({
            keyHash: existingData.keyHash,
            keyPrefix: existingData.keyPrefix,
            keySuffix: existingData.keySuffix,
            revokedAt: admin.firestore.FieldValue.serverTimestamp(),
            revokedReason: 'regenerated',
            createdAt: existingData.createdAt ?? null,
            usageCount: 0, // 简化处理，不追踪旧 key 使用次数
        });
        console.log(`📜 Old API key archived to history for user: ${userId}`);
    }
    // 5. 生成新 key
    const newKey = generateRawApiKey();
    const newHash = hashApiKey(newKey);
    // 提取前8位和后6位用于 UI 展示（不含 "stanse-" 前缀部分）
    // newKey 格式：stanse-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
    // 前8位含前缀：stanse-a（8位）
    const keyPrefix = newKey.slice(0, 8); // "stanse-x"
    const keySuffix = newKey.slice(-6); // 最后6位
    const keyPreview = `${keyPrefix}...${keySuffix}`;
    // 6. 写入 Firestore（只存 hash，不存明文）
    const now = admin.firestore.FieldValue.serverTimestamp();
    await keyDocRef.set({
        userId,
        keyHash: newHash,
        keyPrefix,
        keySuffix,
        keyPreview,
        isActive: true,
        createdAt: now,
        updatedAt: now,
        lastUsedAt: null,
        lastUsedFromSkill: null,
        plan,
        generationCount,
    });
    console.log(`✅ New API key generated for user: ${userId} (generation #${generationCount})`);
    // 7. 返回明文 key（只此一次）
    return { key: newKey };
});
//# sourceMappingURL=api-key-manager.js.map