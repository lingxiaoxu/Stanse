"use strict";
/**
 * Stanse OpenClaw Skill API
 *
 * HTTP endpoints for OpenClaw/ZeroClaw skills.
 * Authentication: Authorization: Bearer <stanse-api-key>
 *
 * All endpoints return JSON. Errors return { error: string } with appropriate HTTP status.
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
exports.skillPing = exports.skillGetCompanyRankings = exports.skillGetDuelCredits = exports.skillGetMyPersona = exports.skillGetChinaRadar = exports.skillGetBreakingNews = exports.skillGetNews = void 0;
const functions = __importStar(require("firebase-functions/v2"));
const admin = __importStar(require("firebase-admin"));
const crypto = __importStar(require("crypto"));
// ── Auth Middleware ──────────────────────────────────────────────────────────
function hashApiKey(key) {
    return crypto.createHash('sha256').update(key).digest('hex');
}
/**
 * 从 Authorization: Bearer <key> 提取并验证 API Key。
 * 验证成功返回 { userId, plan }，失败直接写 401 响应并返回 null。
 */
async function requireApiKey(req, res, skillName = 'openclaw-skill') {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Missing Authorization header. Use: Authorization: Bearer <stanse-api-key>' });
        return null;
    }
    const rawKey = authHeader.slice(7).trim();
    if (!rawKey.startsWith('stanse-')) {
        res.status(401).json({ error: 'Invalid API key format. Key must start with "stanse-"' });
        return null;
    }
    const keyHash = hashApiKey(rawKey);
    const db = admin.firestore();
    const snapshot = await db
        .collection('authentication_api_keys')
        .where('keyHash', '==', keyHash)
        .where('isActive', '==', true)
        .limit(1)
        .get();
    if (snapshot.empty) {
        res.status(401).json({ error: 'Invalid or revoked API key' });
        return null;
    }
    const docData = snapshot.docs[0].data();
    // 异步更新 lastUsedAt（不阻塞响应）
    snapshot.docs[0].ref.update({
        lastUsedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastUsedFromSkill: skillName,
    }).catch(err => console.error('Failed to update lastUsedAt:', err));
    return {
        userId: docData.userId,
        plan: docData.plan ?? 'free',
    };
}
// ── CORS helper ──────────────────────────────────────────────────────────────
function setCors(res) {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
}
// ── Common function options ──────────────────────────────────────────────────
const HTTP_OPTS = {
    region: 'us-central1',
    timeoutSeconds: 30,
    memory: '256MiB',
};
// ══════════════════════════════════════════════════════════════════════════════
// GET /stanse/news
// 返回最新新闻列表（从 Firestore news 集合）
// Query params: language (en/zh/ja/fr/es), category (optional), limit (default 20)
// ══════════════════════════════════════════════════════════════════════════════
exports.skillGetNews = functions.https.onRequest(HTTP_OPTS, async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }
    const auth = await requireApiKey(req, res);
    if (!auth)
        return;
    const language = req.query.language || 'en';
    const category = req.query.category;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const db = admin.firestore();
    try {
        let query = db.collection('news')
            .where('language', '==', language)
            .orderBy('publishedAt', 'desc')
            .limit(limit);
        if (category) {
            query = db.collection('news')
                .where('language', '==', language)
                .where('category', '==', category.toUpperCase())
                .orderBy('publishedAt', 'desc')
                .limit(limit);
        }
        const snap = await query.get();
        const items = snap.docs.map(doc => {
            const d = doc.data();
            return {
                id: doc.id,
                title: d.title,
                summary: d.summary,
                source: d.source,
                category: d.category,
                publishedAt: d.publishedAt,
                url: d.url || null,
                imageUrl: d.imageUrl || null,
            };
        });
        res.status(200).json({ items, count: items.length, language });
    }
    catch (err) {
        console.error('skillGetNews error:', err);
        res.status(500).json({ error: 'Failed to fetch news' });
    }
});
// ══════════════════════════════════════════════════════════════════════════════
// GET /stanse/breaking-news
// 返回最新 breaking news
// Query params: language (en/zh/ja/fr/es), limit (default 5)
// ══════════════════════════════════════════════════════════════════════════════
exports.skillGetBreakingNews = functions.https.onRequest(HTTP_OPTS, async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }
    const auth = await requireApiKey(req, res);
    if (!auth)
        return;
    const language = req.query.language || 'en';
    const limit = Math.min(parseInt(req.query.limit) || 5, 20);
    const db = admin.firestore();
    try {
        const snap = await db.collection('breaking_news_notifications')
            .where('language', '==', language)
            .orderBy('detectedAt', 'desc')
            .limit(limit)
            .get();
        const items = snap.docs.map(doc => {
            const d = doc.data();
            return {
                id: doc.id,
                title: d.title,
                summary: d.summary || null,
                severity: d.severity || 'TIER2',
                detectedAt: d.detectedAt,
                source: d.source || null,
            };
        });
        res.status(200).json({ items, count: items.length, language });
    }
    catch (err) {
        console.error('skillGetBreakingNews error:', err);
        res.status(500).json({ error: 'Failed to fetch breaking news' });
    }
});
// ══════════════════════════════════════════════════════════════════════════════
// GET /stanse/china-radar
// 返回最新中国新闻播报（来自 news_stanseradar_china_consolidated）
// ══════════════════════════════════════════════════════════════════════════════
exports.skillGetChinaRadar = functions.https.onRequest(HTTP_OPTS, async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }
    const auth = await requireApiKey(req, res);
    if (!auth)
        return;
    const db = admin.firestore();
    try {
        const snap = await db.collection('news_stanseradar_china_consolidated')
            .orderBy('metadata.created_at', 'desc')
            .limit(1)
            .get();
        if (snap.empty) {
            res.status(404).json({ error: 'No radar data available' });
            return;
        }
        const doc = snap.docs[0];
        const d = doc.data();
        res.status(200).json({
            id: doc.id,
            broadcast: d.broadcast,
            broadcastLength: d.broadcast_length,
            beijingTime: d.time?.beijing_time || null,
            statistics: d.statistics || null,
            createdAt: d.metadata?.created_at || null,
        });
    }
    catch (err) {
        console.error('skillGetChinaRadar error:', err);
        res.status(500).json({ error: 'Failed to fetch China radar' });
    }
});
// ══════════════════════════════════════════════════════════════════════════════
// GET /stanse/me/persona
// 返回当前用户的政治指纹 persona
// ══════════════════════════════════════════════════════════════════════════════
exports.skillGetMyPersona = functions.https.onRequest(HTTP_OPTS, async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }
    const auth = await requireApiKey(req, res);
    if (!auth)
        return;
    const db = admin.firestore();
    try {
        const userDoc = await db.collection('users').doc(auth.userId).get();
        if (!userDoc.exists) {
            res.status(404).json({ error: 'User profile not found' });
            return;
        }
        const d = userDoc.data();
        const coords = d.coordinates || {};
        res.status(200).json({
            label: coords.label || 'Uncalibrated',
            x: coords.x ?? null, // economic axis
            y: coords.y ?? null, // social axis
            z: coords.z ?? null, // diplomatic axis
            calibrated: coords.label && coords.label !== 'Uncalibrated',
            plan: auth.plan,
        });
    }
    catch (err) {
        console.error('skillGetMyPersona error:', err);
        res.status(500).json({ error: 'Failed to fetch persona' });
    }
});
// ══════════════════════════════════════════════════════════════════════════════
// GET /stanse/me/duel-credits
// 返回当前用户的 Duel Arena 积分余额
// ══════════════════════════════════════════════════════════════════════════════
exports.skillGetDuelCredits = functions.https.onRequest(HTTP_OPTS, async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }
    const auth = await requireApiKey(req, res);
    if (!auth)
        return;
    const db = admin.firestore();
    try {
        const credDoc = await db.collection('user_credits').doc(auth.userId).get();
        if (!credDoc.exists) {
            res.status(200).json({ balance: 0, totalGranted: 0, totalSpent: 0, totalEarned: 0 });
            return;
        }
        const d = credDoc.data();
        res.status(200).json({
            balance: d.balance ?? 0,
            totalGranted: d.totalGranted ?? 0,
            totalSpent: d.totalSpent ?? 0,
            totalEarned: d.totalEarned ?? 0,
            lastTransactionAt: d.lastTransactionAt || null,
        });
    }
    catch (err) {
        console.error('skillGetDuelCredits error:', err);
        res.status(500).json({ error: 'Failed to fetch credits' });
    }
});
// ══════════════════════════════════════════════════════════════════════════════
// GET /stanse/company-rankings
// 返回公司 ESG/政治对齐排名
// Query params: limit (default 10, max 50)
// ══════════════════════════════════════════════════════════════════════════════
exports.skillGetCompanyRankings = functions.https.onRequest(HTTP_OPTS, async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }
    const auth = await requireApiKey(req, res);
    if (!auth)
        return;
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const db = admin.firestore();
    try {
        // 用 persona label 查找对应排名
        const userDoc = await db.collection('users').doc(auth.userId).get();
        const personaLabel = userDoc.data()?.coordinates?.label || 'Centrist';
        const rankingDoc = await db.collection('enhanced_company_rankings').doc(personaLabel).get();
        if (!rankingDoc.exists) {
            res.status(404).json({ error: 'No rankings available for your persona' });
            return;
        }
        const d = rankingDoc.data();
        const rankings = (d.rankings || []).slice(0, limit).map((item) => ({
            rank: item.rank,
            company: item.company,
            ticker: item.ticker || null,
            alignmentScore: item.alignmentScore || item.score || null,
            verdict: item.verdict || null,
        }));
        res.status(200).json({
            persona: personaLabel,
            rankings,
            count: rankings.length,
            updatedAt: d.updatedAt || null,
        });
    }
    catch (err) {
        console.error('skillGetCompanyRankings error:', err);
        res.status(500).json({ error: 'Failed to fetch company rankings' });
    }
});
// ══════════════════════════════════════════════════════════════════════════════
// GET /stanse/ping
// 健康检查 + API Key 验证测试
// ══════════════════════════════════════════════════════════════════════════════
exports.skillPing = functions.https.onRequest(HTTP_OPTS, async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }
    const auth = await requireApiKey(req, res);
    if (!auth)
        return;
    res.status(200).json({
        ok: true,
        message: 'Stanse API key is valid',
        userId: auth.userId,
        plan: auth.plan,
        timestamp: new Date().toISOString(),
    });
});
//# sourceMappingURL=skill-api.js.map