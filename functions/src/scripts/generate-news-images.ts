/**
 * Generate news images using Gemini Imagen 4
 * SECURITY: API keys ONLY from Google Secret Manager, NEVER hardcoded
 * Pattern: Based on generate-duel-images.ts with automatic backup key switching
 */

import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { Storage } from '@google-cloud/storage';
import { GoogleGenAI } from '@google/genai';
import * as admin from 'firebase-admin';

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'stanseproject',
  });
}

const db = admin.firestore();

// Initialize Google Cloud Storage
const storage = new Storage({ projectId: 'gen-lang-client-0960644135' });
const bucket = storage.bucket('stanse-public-assets');
const secretClient = new SecretManagerServiceClient();

// Configuration
const SECRET_PROJECT_ID = 'gen-lang-client-0960644135';
const GEMINI_SECRET_NAME = 'gemini-api-key';
const GEMINI_BACKUP_SECRET_NAME = 'gemini-api-key-backup';

// Global state for API key management
let backupApiKey: string | null = null;
let usingBackupKey = false;

/**
 * SECURITY: Get primary API key from Secret Manager
 */
async function getGeminiApiKey(): Promise<string> {
  console.log('🔐 Loading primary API key from Secret Manager...');
  try {
    const [version] = await secretClient.accessSecretVersion({
      name: `projects/${SECRET_PROJECT_ID}/secrets/${GEMINI_SECRET_NAME}/versions/latest`,
    });
    const payload = version.payload?.data?.toString();
    if (payload) {
      console.log('✅ Primary API key loaded');
      return payload;
    }
    throw new Error('Empty payload from Secret Manager');
  } catch (error: any) {
    console.error('❌ Failed to load primary API key:', error.message);
    throw error;
  }
}

/**
 * SECURITY: Get backup API key from Secret Manager
 */
async function getBackupApiKey(): Promise<string> {
  if (backupApiKey) {
    return backupApiKey;
  }
  console.log('🔐 Loading backup API key from Secret Manager...');
  try {
    const [version] = await secretClient.accessSecretVersion({
      name: `projects/${SECRET_PROJECT_ID}/secrets/${GEMINI_BACKUP_SECRET_NAME}/versions/latest`,
    });
    const payload = version.payload?.data?.toString();
    if (payload) {
      backupApiKey = payload;
      console.log('✅ Backup API key loaded');
      return payload;
    }
    throw new Error('Empty payload from backup Secret Manager');
  } catch (error: any) {
    console.error('❌ Failed to load backup API key:', error.message);
    throw error;
  }
}

/**
 * Switch to backup API key when quota exhausted
 */
async function switchToBackupKey(): Promise<GoogleGenAI> {
  if (usingBackupKey) {
    throw new Error('Already using backup key, both keys exhausted');
  }
  console.log('\n⚠️  Primary API key quota exhausted, switching to backup...');
  const apiKey = await getBackupApiKey();
  usingBackupKey = true;
  console.log('✅ Switched to backup API key\n');
  return new GoogleGenAI({ apiKey });
}

/**
 * Generate image using Imagen 4 with backup key fallback
 */
async function generateImage(
  clientRef: { current: GoogleGenAI },
  category: string,
  keyword: string,
  description: string
): Promise<string | null> {

  const prompt = `Professional news photograph: ${description}.

Category: ${category}
Theme: ${keyword}

CRITICAL VISUAL REQUIREMENTS:
- Style: Photorealistic editorial news photography, documentary journalism
- Realism: Use REAL recognizable political figures, locations, and events when relevant
- People: Include real politicians, leaders, and public figures when appropriate
- Faces: If you cannot show real faces, use back views, silhouettes, or dramatic shadows
- NEVER use fake/AI-generated faces - prefer back views, side angles, or shadow compositions
- Color: Full color, vivid, saturated, dramatic colors with professional grading
- Composition: Image MUST fill entire 16:9 frame completely edge-to-edge
- NO black borders, NO white borders, NO padding, NO letterboxing, NO empty margins
- Subject must fill 100% of the canvas from edge to edge

DIVERSITY REQUIREMENTS (when multiple people are shown):
- Each person must have UNIQUE facial features - NO repeated/duplicated faces
- Show ethnic and racial diversity: include people of different races and backgrounds
- Vary age, gender, and appearance across individuals in the scene
- Represent global diversity naturally and authentically

TEXT REQUIREMENTS:
- Minimize text - only include when essential to the news scene
- Any text MUST be sharp, clear, and fully readable
- Letters and numbers must be crisp and legible (not blurry or distorted)
- Use text naturally: street signs, building names, protest signs, newspapers, banners
- Text should enhance realism, not clutter the image

ABSOLUTELY FORBIDDEN:
- Brand names, corporate logos, or watermarks
- Black/white borders or frames of any kind
- Blurry or illegible text
- Fake/AI-generated human faces (use back views or shadows instead)
- Duplicate or repeated faces on multiple people
- Abstract or artistic interpretations - must be realistic

FOCUS: Photorealistic, full-frame news imagery with diverse, unique individuals (back views/shadows OK) and minimal clear text.`;

  console.log(`  📸 ${keyword}`);

  try {
    const response = await clientRef.current.models.generateImages({
      model: 'imagen-4.0-generate-001',
      prompt,
      config: {
        numberOfImages: 1,
        aspectRatio: '16:9',
      }
    });

    let imageBuffer: Buffer | null = null;
    if (response.generatedImages && response.generatedImages[0]?.image?.imageBytes) {
      imageBuffer = Buffer.from(response.generatedImages[0].image.imageBytes, 'base64');
    }

    if (imageBuffer && imageBuffer.length > 0) {
      const fileName = `news_images/${category}/${keyword}_${Date.now()}.jpg`;
      const file = bucket.file(fileName);
      await file.save(imageBuffer, {
        metadata: { contentType: 'image/jpeg' }
      });
      await file.makePublic();
      const url = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
      console.log(`     ✅ Generated`);
      return url;
    }

    console.log(`     ⚠️  No image`);
    return null;

  } catch (error: any) {
    // Check for quota exhaustion (429 error)
    if (error.message && error.message.includes('429') && error.message.includes('quota')) {
      console.log(`     ⚠️  Quota exhausted, switching to backup key...`);
      try {
        clientRef.current = await switchToBackupKey();
        console.log(`     🔄 Retrying with backup key...`);

        const retryResponse = await clientRef.current.models.generateImages({
          model: 'imagen-4.0-generate-001',
          prompt,
          config: {
            numberOfImages: 1,
            aspectRatio: '16:9',
          }
        });

        let imageBuffer: Buffer | null = null;
        if (retryResponse.generatedImages && retryResponse.generatedImages[0]?.image?.imageBytes) {
          imageBuffer = Buffer.from(retryResponse.generatedImages[0].image.imageBytes, 'base64');
        }

        if (imageBuffer && imageBuffer.length > 0) {
          const fileName = `news_images/${category}/${keyword}_${Date.now()}.jpg`;
          const file = bucket.file(fileName);
          await file.save(imageBuffer, {
            metadata: { contentType: 'image/jpeg' }
          });
          await file.makePublic();
          const url = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
          console.log(`     ✅ Generated (backup key)`);
          return url;
        }

        console.log(`     ⚠️  No image (backup key)`);
        return null;

      } catch (switchError: any) {
        console.error(`     ❌ Backup failed: ${switchError.message}`);
        return null;
      }
    }

    console.error(`     ❌ Error: ${error.message}`);
    return null;
  }
}

/**
 * Generate images for all categories and keywords (150 total)
 */
async function generateAllImages() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🚀 GENERATING ALL NEWS IMAGES - 150 KEYWORDS');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const startTime = Date.now();
  const categories = ['POLITICS', 'TECH', 'MILITARY', 'WORLD', 'BUSINESS', 'DEFAULT'];

  try {
    // Get API key and create client
    const apiKey = await getGeminiApiKey();
    const clientRef = { current: new GoogleGenAI({ apiKey }) };

    let totalSuccess = 0;
    let totalFailed = 0;
    let totalKeywords = 0;

    for (const category of categories) {
      console.log(`\n${'═'.repeat(60)}`);
      console.log(`📁 CATEGORY: ${category}`);
      console.log('═'.repeat(60));

      // Get category keywords
      const categoryDoc = await db.collection('news_image_generation').doc(category).get();

      if (!categoryDoc.exists) {
        console.error(`❌ ${category} not found, skipping...`);
        continue;
      }

      const data = categoryDoc.data();
      const keywords = data?.keywords || [];

      console.log(`📋 ${keywords.length} keywords to process\n`);

      for (let i = 0; i < keywords.length; i++) {
        const kw = keywords[i];
        totalKeywords++;

        console.log(`[${i + 1}/${keywords.length}]`);

        const url = await generateImage(clientRef, category, kw.keyword, kw.description);

        if (url) {
          // Save to images subcollection
          await categoryDoc.ref.collection('images').doc(kw.keyword).set({
            keyword: kw.keyword,
            description: kw.description,
            imageUrl: url,
            generatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          totalSuccess++;
        } else {
          totalFailed++;
        }

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Progress update every 10 images
        if (totalKeywords % 10 === 0) {
          const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
          console.log(`\n📊 Progress: ${totalKeywords}/150 (${totalSuccess} success, ${totalFailed} failed) | ${elapsed} min\n`);
        }
      }
    }

    const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('🎉 GENERATION COMPLETE');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`Total keywords: ${totalKeywords}`);
    console.log(`✅ Successful: ${totalSuccess}`);
    console.log(`❌ Failed: ${totalFailed}`);
    console.log(`⏱️  Total time: ${totalTime} minutes`);
    console.log(`📊 Success rate: ${((totalSuccess / totalKeywords) * 100).toFixed(1)}%`);
    console.log('═══════════════════════════════════════════════════════════════\n');

    process.exit(0);

  } catch (error: any) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  }
}

generateAllImages();
