"use strict";
/**
 * Universal DUEL Image Generation Script
 *
 * Generates images for DUEL questions using both gemini-3-pro-image-preview and imagen-4.0-generate-001.
 * Reads questions from Firestore (duel_questions collection) and stores generated image URLs back.
 *
 * Usage:
 *   cd functions
 *   npm run build
 *
 *   # Generate images for all questions
 *   node lib/scripts/generate-duel-images.js
 *
 *   # Generate images for specific questions
 *   node lib/scripts/generate-duel-images.js --questions q001,q002,q003
 *
 *   # Generate only with a specific model
 *   node lib/scripts/generate-duel-images.js --model gemini-3-pro-image-preview
 *   node lib/scripts/generate-duel-images.js --model imagen-4.0-generate-001
 *
 *   # Regenerate specific question with specific model
 *   node lib/scripts/generate-duel-images.js --questions q011 --model imagen-4.0-generate-001
 *
 * Prerequisites:
 *   - GEMINI_API_KEY must be set in Google Secret Manager
 *   - gcloud auth application-default login
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
const secret_manager_1 = require("@google-cloud/secret-manager");
const storage_1 = require("@google-cloud/storage");
const genai_1 = require("@google/genai");
const admin = __importStar(require("firebase-admin"));
// Initialize Firebase Admin
if (!admin.apps.length) {
    admin.initializeApp({
        projectId: 'stanseproject',
    });
}
const db = admin.firestore();
// Initialize Google Cloud Storage
const storage = new storage_1.Storage({ projectId: 'gen-lang-client-0960644135' });
const bucket = storage.bucket('stanse-public-assets');
const secretClient = new secret_manager_1.SecretManagerServiceClient();
// Configuration
const CLOUD_RUN_PROJECT_ID = 'gen-lang-client-0960644135';
const GEMINI_SECRET_NAME = 'gemini-api-key';
const GEMINI_BACKUP_SECRET_NAME = 'gemini-api-key-backup';
const IMAGE_CONFIG = {
    aspectRatio: '1:1',
    size: '1024x1024',
};
// Global state for API key management
let backupApiKey = null;
let usingBackupKey = false;
// ADC token refresh configuration
let questionsProcessed = 0;
const TOKEN_REFRESH_INTERVAL = 40; // Refresh ADC token every 40 questions
// Model names
const MODELS = {
    GEMINI3: 'gemini-3-pro-image-preview',
    IMAGEN4: 'imagen-4.0-generate-001',
};
/**
 * Parse command line arguments
 */
function parseArgs() {
    const args = process.argv.slice(2);
    let questions = null;
    let model = null;
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--questions' && args[i + 1]) {
            questions = args[i + 1].split(',').map(q => q.trim());
            i++;
        }
        else if (args[i] === '--model' && args[i + 1]) {
            model = args[i + 1];
            i++;
        }
    }
    return { questions, model };
}
/**
 * Get Gemini API key from Google Secret Manager
 */
async function getGeminiApiKey() {
    console.log('🔐 Loading Gemini API key from Secret Manager...');
    try {
        const [version] = await secretClient.accessSecretVersion({
            name: `projects/${CLOUD_RUN_PROJECT_ID}/secrets/${GEMINI_SECRET_NAME}/versions/latest`,
        });
        const payload = version.payload?.data?.toString();
        if (payload) {
            console.log('✅ Primary Gemini API key loaded successfully');
            return payload;
        }
        throw new Error('Empty payload from Secret Manager');
    }
    catch (error) {
        console.error('❌ Failed to load Gemini API key:', error);
        throw error;
    }
}
/**
 * Refresh ADC token by reinitializing Firestore client
 * Similar to Python script's refresh_firestore_client()
 * Firebase Admin SDK will automatically refresh the ADC token
 */
async function refreshADCToken() {
    console.log('  🔄 Refreshing ADC token and Firestore connection...');
    try {
        // Re-initialize Firestore client to refresh ADC token
        // Firebase Admin SDK automatically handles token refresh from ADC
        const newDb = admin.firestore();
        // Test connection with a simple read
        await newDb.collection('duel_questions').limit(1).get();
        console.log('  ✅ ADC token refreshed successfully');
        return true;
    }
    catch (error) {
        console.error(`  ❌ Failed to refresh ADC token: ${error.message}`);
        return false;
    }
}
/**
 * Get backup Gemini API key from Google Secret Manager
 */
async function getBackupApiKey() {
    if (backupApiKey) {
        return backupApiKey;
    }
    console.log('🔐 Loading backup Gemini API key from Secret Manager...');
    try {
        const [version] = await secretClient.accessSecretVersion({
            name: `projects/${CLOUD_RUN_PROJECT_ID}/secrets/${GEMINI_BACKUP_SECRET_NAME}/versions/latest`,
        });
        const payload = version.payload?.data?.toString();
        if (payload) {
            backupApiKey = payload;
            console.log('✅ Backup Gemini API key loaded successfully');
            return payload;
        }
        throw new Error('Empty payload from backup Secret Manager');
    }
    catch (error) {
        console.error('❌ Failed to load backup Gemini API key:', error);
        throw error;
    }
}
/**
 * Switch to backup API key when quota is exhausted
 */
async function switchToBackupKey() {
    if (usingBackupKey) {
        throw new Error('Already using backup key, both keys exhausted');
    }
    console.log('\n⚠️  Primary API key quota exhausted, switching to backup key...');
    const apiKey = await getBackupApiKey();
    usingBackupKey = true;
    console.log('✅ Switched to backup API key\n');
    return new genai_1.GoogleGenAI({ apiKey });
}
/**
 * Generate images using gemini-3-pro-image-preview
 */
async function generateWithGemini3(client, prompts, questionId) {
    console.log(`  🎨 Generating with ${MODELS.GEMINI3}...`);
    const results = [];
    for (let i = 0; i < prompts.length; i++) {
        const prompt = prompts[i];
        console.log(`    [${i + 1}/${prompts.length}] ${prompt.substring(0, 40)}...`);
        try {
            const response = await client.models.generateContent({
                model: MODELS.GEMINI3,
                contents: [{
                        role: 'user',
                        parts: [{
                                text: `Create a 1024x1024 pixel SQUARE photograph of: ${prompt}.

CRITICAL REQUIREMENTS:
- Output MUST be exactly 1024x1024 pixels (perfect square)
- Image content MUST fill 100% of the canvas
- ABSOLUTELY NO white borders, black bars, letterboxing, or padding
- Frame the subject to fit naturally in a square composition
- Use a close-up or cropped view if needed to fill the square
- High quality, photorealistic style suitable for a trivia quiz game`
                            }]
                    }],
                config: {
                    responseModalities: ['IMAGE', 'TEXT'],
                    imageConfig: {
                        aspectRatio: IMAGE_CONFIG.aspectRatio,
                        imageSize: '1K',
                    }
                }
            });
            // Extract image from response
            let imageBuffer = null;
            if (response.candidates && response.candidates[0]?.content?.parts) {
                for (const part of response.candidates[0].content.parts) {
                    if (part.inlineData?.data) {
                        imageBuffer = Buffer.from(part.inlineData.data, 'base64');
                        break;
                    }
                }
            }
            if (imageBuffer && imageBuffer.length > 0) {
                // Upload to GCS
                const fileName = `duel-images/${MODELS.GEMINI3}/${questionId}_option_${i}.png`;
                const file = bucket.file(fileName);
                await file.save(imageBuffer, {
                    metadata: { contentType: 'image/png' }
                });
                await file.makePublic();
                const url = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
                results.push({ url, generatedAt: new Date().toISOString() });
                console.log(`      ✅ Uploaded`);
            }
            else {
                console.log(`      ⚠️ No image generated`);
                results.push({ url: '', generatedAt: '' });
            }
            // Rate limiting
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        catch (error) {
            console.error(`      ❌ Error: ${error.message}`);
            results.push({ url: '', generatedAt: '' });
        }
    }
    return results;
}
/**
 * Generate images using imagen-4.0-generate-001 with automatic backup key switching
 */
async function generateWithImagen4(clientRef, prompts, questionId) {
    console.log(`  🖼️ Generating with ${MODELS.IMAGEN4}...`);
    const results = [];
    for (let i = 0; i < prompts.length; i++) {
        const prompt = prompts[i];
        console.log(`    [${i + 1}/${prompts.length}] ${prompt.substring(0, 40)}...`);
        try {
            const response = await clientRef.current.models.generateImages({
                model: MODELS.IMAGEN4,
                prompt: `A stunning photograph of ${prompt}. Dramatic lighting, professional photography, full frame composition with the subject filling the entire image.`,
                config: {
                    numberOfImages: 1,
                    aspectRatio: IMAGE_CONFIG.aspectRatio,
                }
            });
            // Extract image from response
            let imageBuffer = null;
            if (response.generatedImages && response.generatedImages[0]?.image?.imageBytes) {
                imageBuffer = Buffer.from(response.generatedImages[0].image.imageBytes, 'base64');
            }
            if (imageBuffer && imageBuffer.length > 0) {
                // Upload to GCS
                const fileName = `duel-images/${MODELS.IMAGEN4}/${questionId}_option_${i}.png`;
                const file = bucket.file(fileName);
                await file.save(imageBuffer, {
                    metadata: { contentType: 'image/png' }
                });
                await file.makePublic();
                const url = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
                results.push({ url, generatedAt: new Date().toISOString() });
                console.log(`      ✅ Uploaded`);
            }
            else {
                console.log(`      ⚠️ No image generated`);
                results.push({ url: '', generatedAt: '' });
            }
            // Rate limiting
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        catch (error) {
            // Check if it's a quota exhaustion error (429)
            if (error.message && error.message.includes('429') && error.message.includes('quota')) {
                console.log(`      ⚠️ Quota exhausted, attempting to switch to backup key...`);
                try {
                    clientRef.current = await switchToBackupKey();
                    // Retry with backup key
                    console.log(`      🔄 Retrying with backup key...`);
                    const retryResponse = await clientRef.current.models.generateImages({
                        model: MODELS.IMAGEN4,
                        prompt: `A stunning photograph of ${prompt}. Dramatic lighting, professional photography, full frame composition with the subject filling the entire image.`,
                        config: {
                            numberOfImages: 1,
                            aspectRatio: IMAGE_CONFIG.aspectRatio,
                        }
                    });
                    let imageBuffer = null;
                    if (retryResponse.generatedImages && retryResponse.generatedImages[0]?.image?.imageBytes) {
                        imageBuffer = Buffer.from(retryResponse.generatedImages[0].image.imageBytes, 'base64');
                    }
                    if (imageBuffer && imageBuffer.length > 0) {
                        const fileName = `duel-images/${MODELS.IMAGEN4}/${questionId}_option_${i}.png`;
                        const file = bucket.file(fileName);
                        await file.save(imageBuffer, {
                            metadata: { contentType: 'image/png' }
                        });
                        await file.makePublic();
                        const url = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
                        results.push({ url, generatedAt: new Date().toISOString() });
                        console.log(`      ✅ Uploaded (backup key)`);
                    }
                    else {
                        console.log(`      ⚠️ No image generated (backup key)`);
                        results.push({ url: '', generatedAt: '' });
                    }
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    continue;
                }
                catch (switchError) {
                    console.error(`      ❌ Failed to switch or retry: ${switchError.message}`);
                    results.push({ url: '', generatedAt: '' });
                }
            }
            else {
                console.error(`      ❌ Error: ${error.message}`);
                results.push({ url: '', generatedAt: '' });
            }
        }
    }
    return results;
}
/**
 * Process a single question
 */
async function processQuestion(clientRef, question, modelFilter) {
    console.log(`\n📋 Processing: ${question.questionId} - ${question.stem}`);
    // Get prompts from options array
    const prompts = question.options.map(opt => opt.prompt);
    // Get existing images or initialize empty
    const existingImages = question.generatedImages || {
        gemini3: [],
        imagen4: [],
    };
    // Generate with Gemini 3
    if (!modelFilter || modelFilter === MODELS.GEMINI3) {
        existingImages.gemini3 = await generateWithGemini3(clientRef.current, prompts, question.questionId);
    }
    // Generate with Imagen 4
    if (!modelFilter || modelFilter === MODELS.IMAGEN4) {
        existingImages.imagen4 = await generateWithImagen4(clientRef, prompts, question.questionId);
    }
    // Update Firestore
    await db.collection('duel_questions').doc(question.questionId).update({
        generatedImages: existingImages,
        imagesGeneratedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`  ✅ Saved to Firestore: duel_questions/${question.questionId}`);
    // Increment counter and check if ADC token refresh is needed
    questionsProcessed++;
    if (questionsProcessed % TOKEN_REFRESH_INTERVAL === 0) {
        console.log(`\n💡 Processed ${questionsProcessed} questions, refreshing ADC token...`);
        await refreshADCToken();
    }
}
/**
 * Main function
 */
async function main() {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  DUEL Image Generation');
    console.log('  Models: gemini-3-pro-image-preview, imagen-4.0-generate-001');
    console.log('═══════════════════════════════════════════════════════════');
    // Parse arguments
    const { questions: questionFilter, model: modelFilter } = parseArgs();
    if (questionFilter) {
        console.log(`\n🎯 Filtering to questions: ${questionFilter.join(', ')}`);
    }
    if (modelFilter) {
        console.log(`🎯 Using only model: ${modelFilter}`);
    }
    // Get API key and create client reference
    const apiKey = await getGeminiApiKey();
    const clientRef = { current: new genai_1.GoogleGenAI({ apiKey }) };
    // Fetch questions from Firestore
    let query = db.collection('duel_questions');
    if (questionFilter) {
        // Fetch specific questions
        const questions = [];
        for (const qId of questionFilter) {
            const doc = await db.collection('duel_questions').doc(qId).get();
            if (doc.exists) {
                questions.push(doc.data());
            }
            else {
                console.log(`⚠️ Question ${qId} not found in Firestore`);
            }
        }
        console.log(`\n📊 Found ${questions.length} questions to process`);
        for (const question of questions) {
            await processQuestion(clientRef, question, modelFilter);
        }
    }
    else {
        // Fetch all questions
        const snapshot = await query.get();
        const questions = snapshot.docs.map(doc => doc.data());
        console.log(`\n📊 Found ${questions.length} questions to process`);
        for (const question of questions) {
            await processQuestion(clientRef, question, modelFilter);
        }
    }
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  Generation complete!');
    console.log('═══════════════════════════════════════════════════════════');
    process.exit(0);
}
main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
//# sourceMappingURL=generate-duel-images.js.map