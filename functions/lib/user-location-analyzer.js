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
exports.onUserLocationUpdated = void 0;
const functions = __importStar(require("firebase-functions/v2"));
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
 * Analyzes user's birth and current country locations using Gemini 2.5 Flash.
 */
async function analyzeUserCountryLocations(userData) {
    const apiKey = await getGeminiApiKey();
    if (!apiKey) {
        throw new Error('Failed to load Gemini API key');
    }
    const ai = new genai_1.GoogleGenAI({ apiKey });
    const prompt = `
You are a geolocation expert. Generate precise location data for a user's geographic information.

User Data:
- Birth Country: ${userData.birthCountry || 'Not specified'}
- Current Country: ${userData.currentCountry || 'Not specified'}
- Current State: ${userData.currentState || 'Not specified'}

For each location provided, return:
1. Country name and ISO code
2. Capital city with coordinates
3. For current location: if state is provided, also include state capital with coordinates

Return ONLY valid JSON in this exact format:
{
  "birthCountry": "Full country name or null",
  "birthCountryCode": "ISO code or null",
  "birthCountryCapital": {
    "name": "Capital city name",
    "coordinates": {
      "latitude": 0.0,
      "longitude": 0.0
    }
  } or null,

  "currentCountry": "Full country name or null",
  "currentCountryCode": "ISO code or null",
  "currentState": "State name or null",
  "currentStateCapital": {
    "name": "State capital name",
    "coordinates": {
      "latitude": 0.0,
      "longitude": 0.0
    }
  } or null,
  "currentCountryCapital": {
    "name": "Country capital name",
    "coordinates": {
      "latitude": 0.0,
      "longitude": 0.0
    }
  } or null,

  "confidence": "HIGH|MEDIUM|LOW"
}

Examples:
- Birth Country "China" → birthCountryCapital: {"name": "Beijing", "coordinates": {"latitude": 39.9042, "longitude": 116.4074}}
- Current Country "United States", State "New York" → currentStateCapital: {"name": "Albany", "coordinates": {"latitude": 42.6526, "longitude": -73.7562}}, currentCountryCapital: {"name": "Washington, D.C.", "coordinates": {"latitude": 38.9072, "longitude": -77.0369}}
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
    const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        console.error('Failed to parse AI response:', cleanedResponse);
        throw new Error('Failed to parse user location data from AI response');
    }
    const parsed = JSON.parse(jsonMatch[0]);
    // Normalize field names for all coordinate objects
    const normalizeCoords = (coords) => {
        if (!coords)
            return coords;
        if (coords.lat !== undefined) {
            coords.latitude = coords.lat;
            delete coords.lat;
        }
        if (coords.lng !== undefined) {
            coords.longitude = coords.lng;
            delete coords.lng;
        }
        return coords;
    };
    if (parsed.birthCountryCapital?.coordinates) {
        normalizeCoords(parsed.birthCountryCapital.coordinates);
    }
    if (parsed.currentCountryCapital?.coordinates) {
        normalizeCoords(parsed.currentCountryCapital.coordinates);
    }
    if (parsed.currentStateCapital?.coordinates) {
        normalizeCoords(parsed.currentStateCapital.coordinates);
    }
    // Normalize confidence
    if (parsed.confidence)
        parsed.confidence = parsed.confidence.toUpperCase();
    return parsed;
}
/**
 * Triggered when user document is updated.
 * Detects changes to birthCountry, currentCountry, or currentState.
 * Generates coordinates and stores in users/{userId}/users_countries_locations subcollection.
 */
exports.onUserLocationUpdated = functions.firestore.onDocumentUpdated({
    document: 'users/{userId}',
    region: 'us-central1',
    timeoutSeconds: 60,
    memory: '512MiB'
}, async (event) => {
    const userId = event.params.userId;
    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();
    if (!beforeData || !afterData) {
        return null;
    }
    // Check if location-related fields changed
    const birthCountryChanged = beforeData.birthCountry !== afterData.birthCountry;
    const currentCountryChanged = beforeData.currentCountry !== afterData.currentCountry;
    const currentStateChanged = beforeData.currentState !== afterData.currentState;
    if (!birthCountryChanged && !currentCountryChanged && !currentStateChanged) {
        // No location changes, skip
        return null;
    }
    console.log(`📍 User location updated for ${userId}`);
    const startTime = Date.now();
    try {
        // Analyze locations using Gemini
        const locationData = await analyzeUserCountryLocations({
            birthCountry: afterData.birthCountry,
            currentCountry: afterData.currentCountry,
            currentState: afterData.currentState,
        });
        // Store in subcollection (creates new document each time)
        const db = admin.firestore();
        await db
            .collection('users')
            .doc(userId)
            .collection('users_countries_locations')
            .add({
            userId,
            ...locationData,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            aiModel: 'gemini-2.5-flash',
            processingTimeMs: Date.now() - startTime,
            sourceData: {
                birthCountry: afterData.birthCountry,
                currentCountry: afterData.currentCountry,
                currentState: afterData.currentState,
            },
        });
        console.log(`✅ User location analyzed and stored for ${userId}`);
    }
    catch (error) {
        console.error(`❌ Failed to analyze user location for ${userId}:`, error);
    }
    return null;
});
//# sourceMappingURL=user-location-analyzer.js.map