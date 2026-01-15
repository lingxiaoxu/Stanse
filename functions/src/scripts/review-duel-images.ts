/**
 * Universal DUEL Image Review Script
 *
 * Reviews generated images for DUEL questions and selects the best one from each model.
 * Marks questions as defective if both models fail for any option.
 *
 * Review process:
 * 1. Python checks if image is square (1024x1024)
 * 2. Gemini 3 checks for artificial borders, text overlay, wrong subject
 *
 * Selection logic:
 * - If both valid: use imagen-4.0-generate-001
 * - If only one valid: use the valid one
 * - If both invalid: mark option as defective
 *
 * Usage:
 *   cd functions
 *   npm run build
 *
 *   # Review all questions
 *   node lib/scripts/review-duel-images.js
 *
 *   # Review specific questions
 *   node lib/scripts/review-duel-images.js --questions q001,q002,q011
 *
 * Prerequisites:
 *   - Images must be generated first (run generate-duel-images.js)
 *   - GEMINI_API_KEY must be set in Google Secret Manager
 *   - Python 3 with PIL installed
 */

import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { GoogleGenAI } from '@google/genai';
import * as admin from 'firebase-admin';

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'stanseproject',
  });
}
const db = admin.firestore();
const secretClient = new SecretManagerServiceClient();

// Configuration
const CLOUD_RUN_PROJECT_ID = 'gen-lang-client-0960644135';
const GEMINI_SECRET_NAME = 'gemini-api-key';
const GEMINI_BACKUP_SECRET_NAME = 'gemini-api-key-backup';

// Global state for API key management
let backupApiKey: string | null = null;
let usingBackupKey = false;

// Model names
const MODELS = {
  GEMINI3: 'gemini-3-pro-image-preview',
  IMAGEN4: 'imagen-4.0-generate-001',
};

// ADC token refresh configuration
let questionsProcessed = 0;
const TOKEN_REFRESH_INTERVAL = 25; // Refresh ADC token every 25 questions

interface ImageInfo {
  url: string;
  generatedAt: string;
}

interface OptionInfo {
  prompt: string;
  isCorrect: boolean;
}

interface QuestionDoc {
  questionId: string;
  stem: string;
  category: string;
  difficulty: string;
  correctIndex: number;
  options: OptionInfo[];
  generatedImages?: {
    gemini3: ImageInfo[];
    imagen4: ImageInfo[];
  };
}

interface ReviewResult {
  url: string;
  model: string;
  isValid: boolean;
  issues: string[];
}

interface OptionReview {
  optionIndex: number;
  prompt: string;
  gemini3: ReviewResult;
  imagen4: ReviewResult;
  selectedUrl: string;
  selectedModel: string;
  isDefective: boolean;
}

/**
 * Parse command line arguments
 */
function parseArgs(): { questions: string[] | null } {
  const args = process.argv.slice(2);
  let questions: string[] | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--questions' && args[i + 1]) {
      questions = args[i + 1].split(',').map(q => q.trim());
      i++;
    }
  }

  return { questions };
}

/**
 * Refresh ADC token by reinitializing Firestore client
 * Similar to Python script's refresh_firestore_client()
 * Firebase Admin SDK will automatically refresh the ADC token
 */
async function refreshADCToken(): Promise<boolean> {
  console.log('  🔄 Refreshing ADC token and Firestore connection...');

  try {
    // Re-initialize Firestore client to refresh ADC token
    // Firebase Admin SDK automatically handles token refresh from ADC
    const newDb = admin.firestore();

    // Test connection with a simple read
    await newDb.collection('duel_questions').limit(1).get();

    console.log('  ✅ ADC token refreshed successfully');
    return true;
  } catch (error: any) {
    console.error(`  ❌ Failed to refresh ADC token: ${error.message}`);
    return false;
  }
}

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
      console.log('✅ Primary Gemini API key loaded successfully');
      return payload;
    }
    throw new Error('Empty payload from Secret Manager');
  } catch (error) {
    console.error('❌ Failed to load Gemini API key:', error);
    throw error;
  }
}

/**
 * Get backup Gemini API key from Google Secret Manager
 */
async function getBackupApiKey(): Promise<string> {
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
  } catch (error) {
    console.error('❌ Failed to load backup Gemini API key:', error);
    throw error;
  }
}

/**
 * Switch to backup API key when quota is exhausted
 */
async function switchToBackupKey(): Promise<GoogleGenAI> {
  if (usingBackupKey) {
    throw new Error('Already using backup key, both keys exhausted');
  }

  console.log('\n⚠️  Primary API key quota exhausted, switching to backup key...');
  const apiKey = await getBackupApiKey();
  usingBackupKey = true;
  console.log('✅ Switched to backup API key\n');

  return new GoogleGenAI({ apiKey });
}

/**
 * Check if image is square using Python (via child process)
 */
async function checkImageSquareWithPython(imageUrl: string): Promise<{ isSquare: boolean; width: number; height: number }> {
  const { spawnSync } = await import('child_process');

  const pythonScript = `
import urllib.request
import sys
from PIL import Image
from io import BytesIO

url = sys.argv[1]
with urllib.request.urlopen(url, timeout=30) as response:
    img_data = response.read()
img = Image.open(BytesIO(img_data))
w, h = img.size
print(f"{w},{h},{w == h}")
`;

  try {
    const result = spawnSync('python3', ['-c', pythonScript, imageUrl], {
      encoding: 'utf-8',
      timeout: 60000, // 60 second timeout
      maxBuffer: 1024 * 1024, // 1MB buffer
    });

    if (result.error) {
      console.log(`      ⚠️ Python spawn error: ${result.error.message}`);
      return { isSquare: false, width: 0, height: 0 };
    }

    if (result.status !== 0) {
      const errorMsg = result.stderr?.trim() || 'Unknown error';
      console.log(`      ⚠️ Python script error: ${errorMsg}`);
      return { isSquare: false, width: 0, height: 0 };
    }

    const output = result.stdout?.trim();
    if (!output) {
      console.log(`      ⚠️ Python returned no output`);
      return { isSquare: false, width: 0, height: 0 };
    }

    const [width, height, isSquare] = output.split(',');
    return {
      width: parseInt(width),
      height: parseInt(height),
      isSquare: isSquare === 'True',
    };
  } catch (error: any) {
    console.log(`      ⚠️ Python check failed: ${error.message}`);
    return { isSquare: false, width: 0, height: 0 };
  }
}

/**
 * Fetch image from URL and convert to base64
 */
async function fetchImageAsBase64(url: string): Promise<string> {
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return buffer.toString('base64');
}

/**
 * Review a single image using Python (square check) + Gemini 3 (content check)
 * Uses clientRef to allow switching to backup key on quota errors
 */
async function reviewImage(
  clientRef: { current: GoogleGenAI },
  imageUrl: string,
  expectedSubject: string,
  model: string
): Promise<ReviewResult> {
  // Skip if no URL
  if (!imageUrl) {
    return {
      url: imageUrl,
      model,
      isValid: false,
      issues: ['No image URL'],
    };
  }

  try {
    // Step 1: Check if image is square using Python
    const dimensions = await checkImageSquareWithPython(imageUrl);
    if (!dimensions.isSquare) {
      console.log(`      ❌ Not square: ${dimensions.width}x${dimensions.height}`);
      return {
        url: imageUrl,
        model,
        isValid: false,
        issues: [`Not square: ${dimensions.width}x${dimensions.height}`],
      };
    }

    // Step 2: Use Gemini 3 to check content issues
    const imageBase64 = await fetchImageAsBase64(imageUrl);

    const reviewPrompt = `You are an image quality reviewer for a trivia quiz game.

Expected subject: ${expectedSubject}

Check for these problems:

1. ARTIFICIAL BORDERS: Look for PURE WHITE (#FFFFFF or near-white) or PURE BLACK (#000000 or near-black) borders/letterboxing that form a rectangular frame around the image content.
   - NOT artificial borders: Blue sky, clouds, water, grass, buildings - these are natural scene backgrounds
   - IS artificial borders: Solid white strips, solid black bars, or uniform colored padding that looks like a picture frame

2. TEXT OVERLAY: Large artificial text, numbers, watermarks, or percentage signs overlaid on the image.
   - NOT text overlay: Small signs, building names, or text that is naturally part of the scene
   - IS text overlay: "100%", watermarks, titles, or labels added on top of the image

3. WRONG SUBJECT: Is the main subject completely wrong? (e.g., asked for Eiffel Tower but got a random building)

Respond in JSON:
{
  "hasArtificialBorders": true/false,
  "hasTextOverlay": true/false,
  "wrongSubject": true/false,
  "issues": [],
  "isValid": true/false
}

IMPORTANT: Natural sky (even uniform blue), water, or landscape backgrounds are NOT artificial borders. Only flag true white/black rectangular frames.`;

    const requestContent = {
      model: MODELS.GEMINI3,
      contents: [{
        role: 'user' as const,
        parts: [
          {
            inlineData: {
              mimeType: 'image/png',
              data: imageBase64,
            }
          },
          {
            text: reviewPrompt
          }
        ]
      }],
    };

    let response;
    try {
      response = await clientRef.current.models.generateContent(requestContent);
    } catch (error: any) {
      // Check if it's a quota exhaustion error (429)
      if (error.message && (error.message.includes('429') || error.message.includes('quota') || error.message.includes('RESOURCE_EXHAUSTED'))) {
        // If already using backup key, both keys are exhausted
        if (usingBackupKey) {
          console.error(`      ❌ Backup key also exhausted, cannot continue`);
          return {
            url: imageUrl,
            model,
            isValid: false,
            issues: ['Both API keys exhausted'],
          };
        }

        // Switch to backup key once for all remaining operations
        console.log(`      ⚠️ Quota exhausted, switching to backup key for all remaining operations...`);
        try {
          clientRef.current = await switchToBackupKey();
          console.log(`      🔄 Retrying with backup key...`);
          response = await clientRef.current.models.generateContent(requestContent);
        } catch (switchError: any) {
          console.error(`      ❌ Failed to switch or retry: ${switchError.message}`);
          return {
            url: imageUrl,
            model,
            isValid: false,
            issues: [`Error: ${switchError.message}`],
          };
        }
      } else {
        throw error;
      }
    }

    // Parse the response
    const responseText = response.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Extract JSON from response
    let jsonStr = responseText;
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    try {
      const review = JSON.parse(jsonStr);
      return {
        url: imageUrl,
        model,
        isValid: review.isValid === true,
        issues: review.issues || [],
      };
    } catch {
      console.log(`      ⚠️ Could not parse response`);
      return {
        url: imageUrl,
        model,
        isValid: false,
        issues: ['Could not parse review response'],
      };
    }
  } catch (error: any) {
    console.error(`      ❌ Error: ${error.message}`);
    return {
      url: imageUrl,
      model,
      isValid: false,
      issues: [`Error: ${error.message}`],
    };
  }
}

/**
 * Review all options for a question
 * Uses clientRef to allow switching to backup key on quota errors
 */
async function reviewQuestion(
  clientRef: { current: GoogleGenAI },
  question: QuestionDoc
): Promise<{ reviews: OptionReview[]; defective: boolean; defectiveOptions: number[] }> {
  console.log(`\n📋 Reviewing: ${question.questionId} - ${question.stem}`);

  if (!question.generatedImages) {
    console.log('  ⚠️ No images generated for this question');
    return { reviews: [], defective: true, defectiveOptions: [0, 1, 2, 3] };
  }

  // Get prompts from options array
  const prompts = question.options.map(opt => opt.prompt);
  const reviews: OptionReview[] = [];
  const defectiveOptions: number[] = [];

  for (let i = 0; i < prompts.length; i++) {
    const prompt = prompts[i];
    console.log(`\n  Option ${i}: ${prompt.substring(0, 50)}...`);

    const gemini3Url = question.generatedImages.gemini3?.[i]?.url || '';
    const imagen4Url = question.generatedImages.imagen4?.[i]?.url || '';

    // Review Gemini 3 image
    console.log(`    Reviewing ${MODELS.GEMINI3}...`);
    const gemini3Result = await reviewImage(clientRef, gemini3Url, prompt, MODELS.GEMINI3);
    console.log(`      ${gemini3Result.isValid ? '✓ Valid' : '✗ Invalid'}`);

    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Review Imagen 4 image
    console.log(`    Reviewing ${MODELS.IMAGEN4}...`);
    const imagen4Result = await reviewImage(clientRef, imagen4Url, prompt, MODELS.IMAGEN4);
    console.log(`      ${imagen4Result.isValid ? '✓ Valid' : '✗ Invalid'}`);

    // Determine selection
    let selectedUrl: string;
    let selectedModel: string;
    let isDefective = false;

    if (gemini3Result.isValid && imagen4Result.isValid) {
      // Both valid - prefer Imagen 4
      selectedUrl = imagen4Url;
      selectedModel = MODELS.IMAGEN4;
      console.log(`    ✅ Both valid → using ${MODELS.IMAGEN4}`);
    } else if (imagen4Result.isValid && !gemini3Result.isValid) {
      selectedUrl = imagen4Url;
      selectedModel = MODELS.IMAGEN4;
      console.log(`    ✅ Using ${MODELS.IMAGEN4} (Gemini 3 issues: ${gemini3Result.issues.join(', ')})`);
    } else if (gemini3Result.isValid && !imagen4Result.isValid) {
      selectedUrl = gemini3Url;
      selectedModel = MODELS.GEMINI3;
      console.log(`    ✅ Using ${MODELS.GEMINI3} (Imagen 4 issues: ${imagen4Result.issues.join(', ')})`);
    } else {
      // Both invalid - defective
      selectedUrl = '';
      selectedModel = '';
      isDefective = true;
      defectiveOptions.push(i);
      console.log(`    ❌ DEFECTIVE - Both images have issues`);
      console.log(`       Gemini 3: ${gemini3Result.issues.join(', ')}`);
      console.log(`       Imagen 4: ${imagen4Result.issues.join(', ')}`);
    }

    reviews.push({
      optionIndex: i,
      prompt,
      gemini3: gemini3Result,
      imagen4: imagen4Result,
      selectedUrl,
      selectedModel,
      isDefective,
    });

    // Rate limiting between options
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  return {
    reviews,
    defective: defectiveOptions.length > 0,
    defectiveOptions,
  };
}

/**
 * Save review results to Firestore
 */
async function saveReviewResults(
  questionId: string,
  reviews: OptionReview[],
  defective: boolean,
  defectiveOptions: number[]
): Promise<void> {
  // Update the question document with review results
  const selectedImages = reviews.map(r => ({
    url: r.selectedUrl,
    model: r.selectedModel,
    optionIndex: r.optionIndex,
  }));

  // Update legacy 'images' array with selected URLs and generatedAt
  const images = reviews.map(r => ({
    url: r.selectedUrl,
    prompt: r.prompt,
    isCorrect: r.optionIndex === 0, // First option is correct
    index: r.optionIndex,
    generatedAt: r.selectedUrl ? new Date().toISOString() : '',
  }));

  // Determine most common model used (for metadata)
  const modelCounts = reviews.reduce((acc, r) => {
    if (r.selectedModel) {
      acc[r.selectedModel] = (acc[r.selectedModel] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);
  const mostUsedModel = Object.keys(modelCounts).sort((a, b) => modelCounts[b] - modelCounts[a])[0] || '';

  await db.collection('duel_questions').doc(questionId).update({
    defective,
    defectiveOptions,
    selectedImages,
    images, // Update legacy images array
    'metadata.imageGenModel': mostUsedModel,
    reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
    review: reviews.map(r => ({
      optionIndex: r.optionIndex,
      gemini3Valid: r.gemini3.isValid,
      gemini3Issues: r.gemini3.issues,
      imagen4Valid: r.imagen4.isValid,
      imagen4Issues: r.imagen4.issues,
      selectedModel: r.selectedModel,
      isDefective: r.isDefective,
    })),
  });

  console.log(`  💾 Saved review to duel_questions/${questionId}`);
}

/**
 * Main function
 */
async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  DUEL Image Review');
  console.log('  Checking: square, borders, text overlay, wrong subject');
  console.log('═══════════════════════════════════════════════════════════');

  // Parse arguments
  const { questions: questionFilter } = parseArgs();

  if (questionFilter) {
    console.log(`\n🎯 Filtering to questions: ${questionFilter.join(', ')}`);
  }

  // Get API key and create client reference (allows switching to backup key)
  const apiKey = await getGeminiApiKey();
  const clientRef = { current: new GoogleGenAI({ apiKey }) };

  // Track statistics
  let totalQuestions = 0;
  let defectiveQuestions = 0;
  const allDefective: { questionId: string; options: number[] }[] = [];

  // Fetch and process questions
  if (questionFilter) {
    for (const qId of questionFilter) {
      const doc = await db.collection('duel_questions').doc(qId).get();
      if (doc.exists) {
        const question = doc.data() as QuestionDoc;
        const { reviews, defective, defectiveOptions } = await reviewQuestion(clientRef, question);
        await saveReviewResults(question.questionId, reviews, defective, defectiveOptions);

        totalQuestions++;
        questionsProcessed++;
        if (defective) {
          defectiveQuestions++;
          allDefective.push({ questionId: question.questionId, options: defectiveOptions });
        }

        // Refresh ADC token periodically
        if (questionsProcessed % TOKEN_REFRESH_INTERVAL === 0) {
          console.log(`\n💡 Reviewed ${questionsProcessed} questions, refreshing ADC token...`);
          await refreshADCToken();
        }
      } else {
        console.log(`⚠️ Question ${qId} not found`);
      }
    }
  } else {
    const snapshot = await db.collection('duel_questions').get();

    for (const doc of snapshot.docs) {
      const question = doc.data() as QuestionDoc;
      const { reviews, defective, defectiveOptions } = await reviewQuestion(clientRef, question);
      await saveReviewResults(question.questionId, reviews, defective, defectiveOptions);

      totalQuestions++;
      questionsProcessed++;
      if (defective) {
        defectiveQuestions++;
        allDefective.push({ questionId: question.questionId, options: defectiveOptions });
      }

      // Refresh ADC token periodically
      if (questionsProcessed % TOKEN_REFRESH_INTERVAL === 0) {
        console.log(`\n💡 Reviewed ${questionsProcessed} questions, refreshing ADC token...`);
        await refreshADCToken();
      }
    }
  }

  // Print summary
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  REVIEW SUMMARY');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`\n📊 Total questions reviewed: ${totalQuestions}`);
  console.log(`✅ Valid questions: ${totalQuestions - defectiveQuestions}`);
  console.log(`❌ Defective questions: ${defectiveQuestions}`);

  if (allDefective.length > 0) {
    console.log('\n⚠️ Defective questions that need regeneration:');
    for (const d of allDefective) {
      console.log(`   ${d.questionId}: options ${d.options.join(', ')}`);
    }
    console.log('\nTo regenerate, run:');
    console.log(`   node lib/scripts/generate-duel-images.js --questions ${allDefective.map(d => d.questionId).join(',')}`);
  }

  console.log('\n═══════════════════════════════════════════════════════════');

  process.exit(0);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
