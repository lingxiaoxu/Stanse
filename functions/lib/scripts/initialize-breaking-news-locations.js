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
 * One-time batch script to initialize location data for existing breaking news.
 *
 * This script:
 * 1. Fetches all breaking news without location records
 * 2. Analyzes each using Gemini 2.5 Flash (location + severity)
 * 3. Stores location in breaking_news_locations collection
 *
 * Run: npx ts-node src/scripts/initialize-breaking-news-locations.ts
 */
const admin = __importStar(require("firebase-admin"));
const secret_manager_1 = require("@google-cloud/secret-manager");
const genai_1 = require("@google/genai");
const secretClient = new secret_manager_1.SecretManagerServiceClient();
const CLOUD_RUN_PROJECT_ID = 'gen-lang-client-0960644135';
const GEMINI_SECRET_NAME = 'gemini-api-key';
// Cache for Gemini API key
let geminiApiKey = null;
/**
 * Get Gemini API key from Google Secret Manager
 */
async function getGeminiApiKey() {
    if (geminiApiKey) {
        return geminiApiKey;
    }
    try {
        const [version] = await secretClient.accessSecretVersion({
            name: `projects/${CLOUD_RUN_PROJECT_ID}/secrets/${GEMINI_SECRET_NAME}/versions/latest`,
        });
        const payload = version.payload?.data?.toString();
        if (payload) {
            geminiApiKey = payload;
            console.log('✅ Gemini API key loaded from Secret Manager');
            return payload;
        }
    }
    catch (error) {
        console.error('Failed to load Gemini API key from Secret Manager:', error);
    }
    return '';
}
/**
 * Analyzes breaking news content using Gemini 2.5 Flash.
 */
async function analyzeBreakingNewsLocation(content, retries = 5) {
    const apiKey = await getGeminiApiKey();
    if (!apiKey) {
        throw new Error('Failed to load Gemini API key');
    }
    const ai = new genai_1.GoogleGenAI({ apiKey });
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            return await attemptAnalysis(ai, content);
        }
        catch (error) {
            if (attempt === retries)
                throw error;
            console.log(`  ⚠️  Attempt ${attempt} failed, retrying...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    throw new Error('All retries failed');
}
async function attemptAnalysis(ai, content) {
    const prompt = `
You are analyzing a BREAKING NEWS event. Extract location and assess severity.

IMPORTANT: Return ONLY pure JSON, no markdown, no code blocks, no explanations.

Breaking News:
${content}

Extract:
1. Geographic location (Country → State → City)
2. Coordinates
3. Confidence level
4. Event severity (CRITICAL/HIGH/MEDIUM)
5. Brief summary of the breaking event (max 100 chars)
6. Location context

Use null for missing values, not the string "null".

Return format (PURE JSON ONLY):
{
  "country": "Country Name",
  "countryCode": "ISO code",
  "state": "State or null",
  "city": "City or null",
  "coordinates": {
    "latitude": 0.0,
    "longitude": 0.0
  },
  "confidence": "HIGH|MEDIUM|LOW",
  "specificityLevel": "CITY|STATE|COUNTRY",
  "locationSummary": "Location context",
  "breakingSummary": "Brief event summary",
  "severity": "CRITICAL|HIGH|MEDIUM"
}
`;
    const result = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
            temperature: 0.1,
            maxOutputTokens: 4096,
            responseMimeType: 'application/json'
        }
    });
    const response = result.text;
    // Clean response
    let cleanedResponse = response?.trim() || '';
    cleanedResponse = cleanedResponse.replace(/```json\s*/g, '').replace(/```\s*/g, '');
    // Parse JSON response
    const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        console.error('Failed to parse AI response:', cleanedResponse);
        throw new Error('Failed to parse breaking news location from AI response');
    }
    try {
        const parsed = JSON.parse(jsonMatch[0]);
        // Normalize field names (lat/lng → latitude/longitude)
        if (parsed.coordinates) {
            if (parsed.coordinates.lat !== undefined) {
                parsed.coordinates.latitude = parsed.coordinates.lat;
                delete parsed.coordinates.lat;
            }
            if (parsed.coordinates.lng !== undefined) {
                parsed.coordinates.longitude = parsed.coordinates.lng;
                delete parsed.coordinates.lng;
            }
        }
        // Validate coordinates are not null
        if (!parsed.coordinates ||
            parsed.coordinates.latitude === null ||
            parsed.coordinates.longitude === null ||
            typeof parsed.coordinates.latitude !== 'number' ||
            typeof parsed.coordinates.longitude !== 'number') {
            throw new Error('Invalid or null coordinates in response');
        }
        // Normalize confidence and severity
        if (parsed.confidence) {
            parsed.confidence = parsed.confidence.toUpperCase();
        }
        if (parsed.severity) {
            parsed.severity = parsed.severity.toUpperCase();
        }
        if (parsed.specificityLevel) {
            parsed.specificityLevel = parsed.specificityLevel.toUpperCase();
        }
        return parsed;
    }
    catch (parseError) {
        console.error('JSON parse error:', parseError.message);
        console.error('Attempted to parse:', jsonMatch[0].substring(0, 200));
        throw new Error('Failed to parse breaking news location: ' + parseError.message);
    }
}
/**
 * Main initialization function
 */
async function initializeBreakingNewsLocations() {
    console.log('🚀 Starting breaking news location initialization...\n');
    // Initialize Firebase Admin if not already initialized
    if (!admin.apps.length) {
        admin.initializeApp({
            projectId: 'stanseproject',
            databaseURL: 'https://stanseproject.firebaseio.com'
        });
        console.log('✅ Firebase Admin initialized for project: stanseproject\n');
    }
    const db = admin.firestore();
    try {
        // Fetch all breaking news notifications
        const breakingSnapshot = await db.collection('breaking_news_notifications')
            .orderBy('timestamp', 'desc')
            .get()
            .catch(async () => {
            // If timestamp doesn't have index, get all without ordering
            console.log('⚠️  No index on timestamp, fetching all...');
            return db.collection('breaking_news_notifications').get();
        });
        console.log(`Found ${breakingSnapshot.size} breaking news to process\n`);
        let processed = 0;
        let succeeded = 0;
        let failed = 0;
        let skipped = 0;
        for (const breakingDoc of breakingSnapshot.docs) {
            const breakingId = breakingDoc.id;
            const breakingData = breakingDoc.data();
            // Check if location already exists
            const existingLocation = await db.collection('breaking_news_locations').doc(breakingId).get();
            if (existingLocation.exists) {
                console.log(`⏭️  Skipping ${breakingId.substring(0, 10)} - already has location data`);
                skipped++;
                continue;
            }
            try {
                console.log(`🚨 Processing breaking news ${breakingId.substring(0, 10)}...`);
                const startTime = Date.now();
                // Extract content
                const content = `
Title: ${breakingData.title || ''}
Description: ${breakingData.description || ''}
Content: ${breakingData.content || breakingData.summary || ''}
        `.trim();
                // Analyze location + severity
                const locationData = await analyzeBreakingNewsLocation(content);
                // Store in breaking_news_locations collection
                await db
                    .collection('breaking_news_locations')
                    .doc(breakingId)
                    .set({
                    breakingNewsId: breakingId,
                    ...locationData,
                    analyzedAt: admin.firestore.FieldValue.serverTimestamp(),
                    aiModel: 'gemini-2.5-flash',
                    processingTimeMs: Date.now() - startTime,
                });
                console.log(`✅ Success: ${locationData.country}, Severity: ${locationData.severity} (${Date.now() - startTime}ms)\n`);
                succeeded++;
            }
            catch (error) {
                console.error(`❌ Failed for ${breakingId}:`, error.message);
                // Don't create error record - allow retry on next run
                failed++;
            }
            processed++;
            // Rate limiting: wait 1 second between requests
            if (processed % 20 === 0) {
                console.log(`\n--- Progress: ${processed}/${breakingSnapshot.size} (${succeeded} succeeded, ${failed} failed, ${skipped} skipped) ---\n`);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        console.log('\n✅ Initialization complete!');
        console.log(`Total breaking news: ${breakingSnapshot.size}`);
        console.log(`Processed: ${processed}`);
        console.log(`Succeeded: ${succeeded}`);
        console.log(`Failed: ${failed}`);
        console.log(`Skipped: ${skipped}`);
    }
    catch (error) {
        console.error('❌ Fatal error:', error);
        process.exit(1);
    }
}
// Run the script
initializeBreakingNewsLocations()
    .then(() => {
    console.log('\n🎉 Script completed successfully');
    process.exit(0);
})
    .catch(error => {
    console.error('\n💥 Script failed:', error);
    process.exit(1);
});
//# sourceMappingURL=initialize-breaking-news-locations.js.map