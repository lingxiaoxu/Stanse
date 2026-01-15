"use strict";
/**
 * Test Image Generation Script
 *
 * Tests both gemini-3-pro-image-preview and imagen-3.0-generate-002
 * for generating DUEL question images.
 *
 * Usage:
 *   cd functions
 *   npm run build
 *   node lib/scripts/test-image-generation.js
 *
 * Prerequisites:
 *   - GEMINI_API_KEY must be set in Google Secret Manager
 *   - gcloud auth application-default login
 */
Object.defineProperty(exports, "__esModule", { value: true });
const secret_manager_1 = require("@google-cloud/secret-manager");
const genai_1 = require("@google/genai");
const storage_1 = require("@google-cloud/storage");
// Initialize Google Cloud Storage (in gen-lang-client project)
const storage = new storage_1.Storage({ projectId: 'gen-lang-client-0960644135' });
const bucket = storage.bucket('stanse-public-assets');
const secretClient = new secret_manager_1.SecretManagerServiceClient();
// Project ID where gemini-api-key is stored
const CLOUD_RUN_PROJECT_ID = 'gen-lang-client-0960644135';
const GEMINI_SECRET_NAME = 'gemini-api-key';
// Image configuration - MUST be square and consistent resolution
const IMAGE_CONFIG = {
    aspectRatio: '1:1', // Square images
    size: '1024x1024', // Consistent resolution for all images
};
// Timestamp suffix to avoid browser cache
const TIMESTAMP = Date.now();
// Test question - Eiffel Tower (LANDMARKS category)
const TEST_QUESTION = {
    id: `test_eiffel_tower_${TIMESTAMP}`,
    stem: 'Eiffel Tower',
    correct: 'Eiffel Tower in Paris, France, iconic wrought-iron lattice tower on the Champ de Mars',
    distractors: [
        'Tokyo Tower in Japan, red and white steel lattice communications tower inspired by Eiffel Tower',
        'Blackpool Tower in England, Victorian-era iron lattice tower on the seafront promenade',
        'Petrin Lookout Tower in Prague, Czech Republic, steel framework tower resembling a smaller Eiffel Tower'
    ]
};
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
            console.log('✅ Gemini API key loaded successfully');
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
 * Generate images using gemini-3-pro-image-preview (Nano Banana)
 * Images are square (1:1 aspect ratio) with consistent resolution
 */
async function generateWithGemini3(client, prompts) {
    console.log(`\n🎨 Generating images with gemini-3-pro-image-preview (${IMAGE_CONFIG.size}, ${IMAGE_CONFIG.aspectRatio})...`);
    const images = [];
    for (let i = 0; i < prompts.length; i++) {
        const prompt = prompts[i];
        console.log(`  [${i + 1}/4] Generating: ${prompt.substring(0, 50)}...`);
        try {
            const response = await client.models.generateContent({
                model: 'gemini-3-pro-image-preview',
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
                    // Force square 1:1 aspect ratio and 1K resolution
                    imageConfig: {
                        aspectRatio: '1:1',
                        imageSize: '1K', // 1024x1024 pixels
                    }
                }
            });
            // Extract image from response
            if (response.candidates && response.candidates[0]?.content?.parts) {
                for (const part of response.candidates[0].content.parts) {
                    if (part.inlineData?.data) {
                        const imageBuffer = Buffer.from(part.inlineData.data, 'base64');
                        images.push(imageBuffer);
                        console.log(`    ✅ Image generated (${imageBuffer.length} bytes)`);
                        break;
                    }
                }
            }
            if (images.length <= i) {
                console.log('    ⚠️ No image in response, using placeholder');
                images.push(Buffer.alloc(0));
            }
            // Rate limiting - wait between requests
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        catch (error) {
            console.error(`    ❌ Error: ${error.message}`);
            images.push(Buffer.alloc(0));
        }
    }
    return images;
}
/**
 * Generate images using Imagen 4
 * Note: Imagen 3 was deprecated on Nov 10, 2025
 * Using Imagen 4 models: imagen-4.0-generate-001, imagen-4.0-fast-generate-001
 * Images are square (1:1 aspect ratio) with consistent resolution
 */
async function generateWithImagen4(client, prompts) {
    // Imagen 4 models (Imagen 3 is deprecated)
    const imagenModels = ['imagen-4.0-generate-001', 'imagen-4.0-fast-generate-001', 'imagen-4.0-ultra-generate-001'];
    let workingModel = '';
    console.log(`\n🖼️ Generating images with Imagen 4 (${IMAGE_CONFIG.size}, ${IMAGE_CONFIG.aspectRatio})...`);
    const images = [];
    for (let i = 0; i < prompts.length; i++) {
        const prompt = prompts[i];
        console.log(`  [${i + 1}/4] Generating: ${prompt.substring(0, 50)}...`);
        let success = false;
        for (const model of workingModel ? [workingModel] : imagenModels) {
            try {
                const response = await client.models.generateImages({
                    model: model,
                    prompt: `A stunning photograph of ${prompt}. Dramatic lighting, professional photography, full frame composition with the subject filling the entire image.`,
                    config: {
                        numberOfImages: 1,
                        aspectRatio: IMAGE_CONFIG.aspectRatio, // Square 1:1 aspect ratio
                    }
                });
                // Extract image from response
                if (response.generatedImages && response.generatedImages[0]?.image?.imageBytes) {
                    const imageBuffer = Buffer.from(response.generatedImages[0].image.imageBytes, 'base64');
                    images.push(imageBuffer);
                    console.log(`    ✅ Image generated with ${model} (${imageBuffer.length} bytes)`);
                    workingModel = model; // Remember which model works
                    success = true;
                    break;
                }
            }
            catch (error) {
                if (!workingModel) {
                    console.log(`    ⚠️ ${model} not available: ${error.message?.substring(0, 80)}...`);
                }
            }
        }
        if (!success) {
            console.log('    ❌ All Imagen 4 models failed');
            images.push(Buffer.alloc(0));
        }
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    return images;
}
/**
 * Upload images to Google Cloud Storage
 */
async function uploadToStorage(images, modelName, labels) {
    console.log(`\n📤 Uploading ${modelName} images to GCS (stanse-public-assets)...`);
    const urls = [];
    for (let i = 0; i < images.length; i++) {
        if (images[i].length === 0) {
            console.log(`  [${i + 1}/4] Skipping empty image`);
            urls.push('');
            continue;
        }
        const fileName = `duel-images-test/${modelName}/${TEST_QUESTION.id}_option_${i}.png`;
        const file = bucket.file(fileName);
        try {
            await file.save(images[i], {
                metadata: {
                    contentType: 'image/png',
                    metadata: {
                        prompt: labels[i],
                        model: modelName,
                        questionId: TEST_QUESTION.id,
                        isCorrect: i === 0 ? 'true' : 'false'
                    }
                }
            });
            // Make file public
            await file.makePublic();
            const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
            urls.push(publicUrl);
            console.log(`  [${i + 1}/4] ✅ Uploaded: ${publicUrl}`);
        }
        catch (error) {
            console.error(`  [${i + 1}/4] ❌ Upload failed: ${error.message}`);
            urls.push('');
        }
    }
    return urls;
}
/**
 * Main test function
 */
async function main() {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  DUEL Image Generation Test');
    console.log('  Testing: gemini-3-pro-image-preview vs imagen-3.0-generate-002');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('\n📋 Test Question:');
    console.log(`  ID: ${TEST_QUESTION.id}`);
    console.log(`  Stem: ${TEST_QUESTION.stem}`);
    console.log(`  Correct: ${TEST_QUESTION.correct}`);
    console.log(`  Distractors: ${TEST_QUESTION.distractors.length}`);
    // Get API key from Secret Manager
    const apiKey = await getGeminiApiKey();
    const client = new genai_1.GoogleGenAI({ apiKey });
    // Prepare prompts (correct answer first, then distractors)
    const prompts = [TEST_QUESTION.correct, ...TEST_QUESTION.distractors];
    const labels = ['CORRECT: ' + TEST_QUESTION.correct, ...TEST_QUESTION.distractors.map(d => 'DISTRACTOR: ' + d)];
    // Generate with both models
    const gemini3Images = await generateWithGemini3(client, prompts);
    const imagen4Images = await generateWithImagen4(client, prompts);
    // Upload to Firebase Storage
    const gemini3Urls = await uploadToStorage(gemini3Images, 'gemini-3-pro-image-preview', labels);
    const imagen4Urls = await uploadToStorage(imagen4Images, 'imagen-4.0-generate-001', labels);
    // Print summary
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  RESULTS SUMMARY');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('\n🎨 gemini-3-pro-image-preview:');
    gemini3Urls.forEach((url, i) => {
        const label = i === 0 ? '✅ CORRECT (Brooklyn Bridge)' : `❌ Distractor ${i}`;
        console.log(`  ${label}: ${url || '(failed)'}`);
    });
    console.log('\n🖼️ imagen-4.0-generate-001:');
    imagen4Urls.forEach((url, i) => {
        const label = i === 0 ? '✅ CORRECT (Brooklyn Bridge)' : `❌ Distractor ${i}`;
        console.log(`  ${label}: ${url || '(failed)'}`);
    });
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  Review the images at the URLs above');
    console.log('═══════════════════════════════════════════════════════════');
    process.exit(0);
}
main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
//# sourceMappingURL=test-image-generation.js.map