/**
 * Test Image Generation Script
 *
 * Tests both gemini-3-pro-image-preview and imagen-3.0-generate-002
 * for generating DUEL question images.
 *
 * Usage:
 *   npx ts-node scripts/duel/test-image-generation.ts
 *
 * Prerequisites:
 *   - GEMINI_API_KEY must be set in Google Secret Manager
 *   - gcloud auth application-default login
 */

import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { GoogleGenAI, Modality } from '@google/genai';
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

// Initialize Firebase Admin
const serviceAccountPath = path.join(__dirname, '../../firebase-service-account.json');
if (fs.existsSync(serviceAccountPath)) {
  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf-8'));
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: 'stanseproject.firebasestorage.app'
  });
} else {
  admin.initializeApp({
    storageBucket: 'stanseproject.firebasestorage.app'
  });
}

const bucket = admin.storage().bucket();
const secretClient = new SecretManagerServiceClient();

// Project ID where gemini-api-key is stored
const CLOUD_RUN_PROJECT_ID = 'gen-lang-client-0960644135';
const GEMINI_SECRET_NAME = 'gemini-api-key';

// Test question - US Flag (q001)
const TEST_QUESTION = {
  id: 'q001',
  stem: 'Flag of the United States',
  correct: 'American flag with 50 white stars on blue canton and 13 alternating red and white horizontal stripes',
  distractors: [
    'Flag of Liberia with 11 red and white stripes and single white star on blue square',
    'Flag of Malaysia with 14 red and white stripes and yellow crescent moon with star on blue',
    'Flag of Chile with white star on blue square in top left, white and red horizontal stripes'
  ]
};

/**
 * Get Gemini API key from Google Secret Manager
 */
async function getGeminiApiKey(): Promise<string> {
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
  } catch (error) {
    console.error('❌ Failed to load Gemini API key:', error);
    throw error;
  }
}

/**
 * Generate images using gemini-3-pro-image-preview (Nano Banana)
 */
async function generateWithGemini3(client: GoogleGenAI, prompts: string[]): Promise<Buffer[]> {
  console.log('\n🎨 Generating images with gemini-3-pro-image-preview...');
  const images: Buffer[] = [];

  for (let i = 0; i < prompts.length; i++) {
    const prompt = prompts[i];
    console.log(`  [${i + 1}/4] Generating: ${prompt.substring(0, 50)}...`);

    try {
      const response = await client.models.generateContent({
        model: 'gemini-3-pro-image-preview',
        contents: [{
          role: 'user',
          parts: [{
            text: `Generate a clear, photorealistic image of: ${prompt}.
                   Make sure the image is high quality and clearly shows the subject.
                   The image should be suitable for a trivia quiz game.`
          }]
        }],
        config: {
          responseModalities: [Modality.IMAGE, Modality.TEXT],
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
    } catch (error: any) {
      console.error(`    ❌ Error: ${error.message}`);
      images.push(Buffer.alloc(0));
    }
  }

  return images;
}

/**
 * Generate images using imagen-3.0-generate-002
 */
async function generateWithImagen3(client: GoogleGenAI, prompts: string[]): Promise<Buffer[]> {
  console.log('\n🖼️ Generating images with imagen-3.0-generate-002...');
  const images: Buffer[] = [];

  for (let i = 0; i < prompts.length; i++) {
    const prompt = prompts[i];
    console.log(`  [${i + 1}/4] Generating: ${prompt.substring(0, 50)}...`);

    try {
      const response = await client.models.generateImages({
        model: 'imagen-3.0-generate-002',
        prompt: `A clear, photorealistic image of: ${prompt}. High quality, suitable for trivia quiz.`,
        config: {
          numberOfImages: 1,
        }
      });

      // Extract image from response
      if (response.generatedImages && response.generatedImages[0]?.image?.imageBytes) {
        const imageBuffer = Buffer.from(response.generatedImages[0].image.imageBytes, 'base64');
        images.push(imageBuffer);
        console.log(`    ✅ Image generated (${imageBuffer.length} bytes)`);
      } else {
        console.log('    ⚠️ No image in response');
        images.push(Buffer.alloc(0));
      }

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error: any) {
      console.error(`    ❌ Error: ${error.message}`);
      images.push(Buffer.alloc(0));
    }
  }

  return images;
}

/**
 * Upload images to Firebase Storage
 */
async function uploadToStorage(
  images: Buffer[],
  modelName: string,
  labels: string[]
): Promise<string[]> {
  console.log(`\n📤 Uploading ${modelName} images to Firebase Storage...`);
  const urls: string[] = [];

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
    } catch (error: any) {
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
  const client = new GoogleGenAI({ apiKey });

  // Prepare prompts (correct answer first, then distractors)
  const prompts = [TEST_QUESTION.correct, ...TEST_QUESTION.distractors];
  const labels = ['CORRECT: ' + TEST_QUESTION.correct, ...TEST_QUESTION.distractors.map(d => 'DISTRACTOR: ' + d)];

  // Generate with both models
  const gemini3Images = await generateWithGemini3(client, prompts);
  const imagen3Images = await generateWithImagen3(client, prompts);

  // Upload to Firebase Storage
  const gemini3Urls = await uploadToStorage(gemini3Images, 'gemini-3-pro-image-preview', labels);
  const imagen3Urls = await uploadToStorage(imagen3Images, 'imagen-3.0-generate-002', labels);

  // Print summary
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  RESULTS SUMMARY');
  console.log('═══════════════════════════════════════════════════════════');

  console.log('\n🎨 gemini-3-pro-image-preview:');
  gemini3Urls.forEach((url, i) => {
    const label = i === 0 ? '✅ CORRECT' : `❌ Distractor ${i}`;
    console.log(`  ${label}: ${url || '(failed)'}`);
  });

  console.log('\n🖼️ imagen-3.0-generate-002:');
  imagen3Urls.forEach((url, i) => {
    const label = i === 0 ? '✅ CORRECT' : `❌ Distractor ${i}`;
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
