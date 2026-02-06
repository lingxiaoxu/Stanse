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
/**
 * Check failed news to see their content
 */
const admin = __importStar(require("firebase-admin"));
async function checkFailedNews() {
    if (!admin.apps.length) {
        admin.initializeApp({
            projectId: 'stanseproject',
            databaseURL: 'https://stanseproject.firebaseio.com'
        });
    }
    const db = admin.firestore();
    const errorSnapshot = await db.collection('news_locations')
        .where('error', '==', true)
        .get();
    console.log(`Found ${errorSnapshot.size} failed news\n`);
    for (const doc of errorSnapshot.docs) {
        const newsId = doc.data().newsId;
        const newsDoc = await db.collection('news').doc(newsId).get();
        if (newsDoc.exists) {
            const data = newsDoc.data();
            console.log(`━━━ ${newsId} ━━━`);
            console.log(`Title: ${data.title?.substring(0, 80)}`);
            console.log(`Summary length: ${(data.summary || '').length} chars`);
            console.log(`Has summary: ${!!data.summary}`);
            console.log('');
        }
    }
}
checkFailedNews().then(() => process.exit(0));
//# sourceMappingURL=check-failed-news.js.map