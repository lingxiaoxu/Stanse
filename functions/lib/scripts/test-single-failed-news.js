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
const admin = __importStar(require("firebase-admin"));
const secret_manager_1 = require("@google-cloud/secret-manager");
const genai_1 = require("@google/genai");
const secretClient = new secret_manager_1.SecretManagerServiceClient();
async function getKey() {
    const [version] = await secretClient.accessSecretVersion({
        name: 'projects/gen-lang-client-0960644135/secrets/gemini-api-key/versions/latest',
    });
    return version.payload?.data?.toString() || '';
}
async function testFailedNews() {
    admin.initializeApp({
        projectId: 'stanseproject',
        databaseURL: 'https://stanseproject.firebaseio.com'
    });
    const db = admin.firestore();
    const newsDoc = await db.collection('news').doc('zh5x68').get();
    const data = newsDoc.data();
    const content = `Title: ${data.title}\nSummary: ${data.summary}`;
    console.log('Testing news zh5x68');
    console.log('Content length:', content.length, 'chars');
    console.log('Content:', content.substring(0, 150));
    console.log('\n━━━━━━━━━━━━━━━━━━\n');
    const apiKey = await getKey();
    const ai = new genai_1.GoogleGenAI({ apiKey });
    // Ultra simple prompt
    const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Return JSON with country, countryCode, coordinates(lat,lng), confidence, specificityLevel, locationSummary for: ${content}`,
        config: {
            temperature: 0,
            maxOutputTokens: 4096,
            responseMimeType: 'application/json'
        }
    });
    console.log('Response length:', result.text?.length);
    console.log('Response:', result.text);
    try {
        const parsed = JSON.parse(result.text || '{}');
        console.log('\n✅ Parsed:', JSON.stringify(parsed, null, 2));
    }
    catch (e) {
        console.log('\n❌ Parse failed:', e.message);
    }
}
testFailedNews().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
//# sourceMappingURL=test-single-failed-news.js.map