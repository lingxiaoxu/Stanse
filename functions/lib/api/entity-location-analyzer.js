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
exports.analyzeEntityLocation = void 0;
const functions = __importStar(require("firebase-functions/v2"));
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
 * Analyzes the geographic location of a searched entity.
 * Used when user searches for a person, company, or organization.
 */
exports.analyzeEntityLocation = functions.https.onCall(async (request) => {
    const { entityName, entityType } = request.data;
    if (!entityName) {
        throw new functions.https.HttpsError('invalid-argument', 'Entity name is required');
    }
    try {
        const apiKey = await getGeminiApiKey();
        if (!apiKey) {
            throw new Error('Failed to load Gemini API key');
        }
        const ai = new genai_1.GoogleGenAI({ apiKey });
        const prompt = `
You are a geolocation expert. Determine the primary geographic location associated with this entity.

Entity: ${entityName}
Type: ${entityType || 'Unknown'}

For a person: Their primary residence or headquarters
For a company: Headquarters location
For an organization: Main office or operational center

Return ONLY valid JSON:
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
  "locationSummary": "Brief context about this location",
  "entitySummary": "Brief 1-sentence summary of the entity"
}
`;
        const result = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: {
                temperature: 0.3,
                maxOutputTokens: 800,
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
            throw new Error('Failed to parse entity location');
        }
        try {
            return {
                success: true,
                data: JSON.parse(jsonMatch[0]),
            };
        }
        catch (parseError) {
            console.error('JSON parse error:', parseError.message);
            throw new Error('Failed to parse entity location: ' + parseError.message);
        }
    }
    catch (error) {
        console.error('Error analyzing entity location:', error);
        throw new functions.https.HttpsError('internal', 'Failed to analyze entity location: ' + error.message);
    }
});
//# sourceMappingURL=entity-location-analyzer.js.map