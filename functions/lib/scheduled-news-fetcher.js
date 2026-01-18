"use strict";
/**
 * Scheduled News Fetcher
 *
 * Runs 4 times per day to pre-fetch and cache news from RSS
 * Schedule: 3am, 7am, 11am, 3pm UTC
 *
 * This reduces real-time RSS requests and avoids rate limiting
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
exports.scheduledNewsFetch = void 0;
const functions = __importStar(require("firebase-functions/v2"));
const admin = __importStar(require("firebase-admin"));
const db = admin.firestore();
/**
 * Pre-fetch news for all languages and cache to Firestore
 * This runs on a schedule to avoid rate limiting during user requests
 */
exports.scheduledNewsFetch = functions.scheduler.onSchedule({
    // Run 4 times per day: 3am, 7am, 11am, 3pm UTC
    schedule: '0 3,7,11,15 * * *',
    timeZone: 'UTC',
    region: 'us-central1',
    memory: '512MiB',
    timeoutSeconds: 540 // 9 minutes (enough for all languages with delays)
}, async () => {
    console.log('🔔 [SCHEDULED NEWS FETCH] Starting...');
    console.log(`Time: ${new Date().toISOString()}`);
    const languages = ['en', 'zh', 'ja']; // Start with 3 languages
    const categoriesPerLanguage = 2; // Only fetch 2 most important categories per language
    let totalFetched = 0;
    let totalFailed = 0;
    try {
        // Fetch news for each language (with delays between languages)
        for (let i = 0; i < languages.length; i++) {
            const lang = languages[i];
            // Add delay between languages (except first)
            if (i > 0) {
                const delay = 60000; // 1 minute between languages
                console.log(`⏰ Waiting ${delay / 1000}s before fetching ${lang}...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
            console.log(`\n📰 Fetching news for language: ${lang}`);
            try {
                // Call our RSS fetcher function
                const { httpsCallable } = require('firebase-admin/functions');
                const fetchRSS = httpsCallable('fetchGoogleNewsRSS');
                const result = await fetchRSS({
                    language: lang,
                    categories: ['WORLD', 'POLITICS'], // Only 2 categories to reduce load
                    maxPerCategory: 5
                });
                if (result.data.success && result.data.data) {
                    const newsCount = result.data.data.length;
                    console.log(`✅ ${lang}: Fetched ${newsCount} news items`);
                    totalFetched += newsCount;
                    // News will be automatically cached by the agent when users request them
                    // We don't manually save here to avoid duplication
                }
                else {
                    console.log(`⚠️ ${lang}: No news fetched - ${result.data.error || 'unknown error'}`);
                    totalFailed++;
                }
            }
            catch (error) {
                console.error(`❌ ${lang}: Error - ${error.message}`);
                totalFailed++;
            }
        }
        console.log(`\n✅ Scheduled fetch complete:`);
        console.log(`   Total fetched: ${totalFetched}`);
        console.log(`   Failed: ${totalFailed}`);
        // Log to Firestore for monitoring
        await db.collection('news_fetch_logs').add({
            timestamp: new Date().toISOString(),
            totalFetched,
            totalFailed,
            languages,
            categoriesPerLanguage
        });
    }
    catch (error) {
        console.error('❌ Fatal error in scheduled news fetch:', error);
    }
});
//# sourceMappingURL=scheduled-news-fetcher.js.map