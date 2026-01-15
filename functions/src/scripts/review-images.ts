/**
 * Review Image Quality Script
 *
 * Uses Gemini to check if generated images have issues:
 * - White borders or padding
 * - Not square
 * - Text/numbers overlaid on image
 * - Wrong subject (completely wrong image)
 *
 * For each option, compares both models and:
 * - If one is good and one is bad: use the good one
 * - If both are good: use imagen-4.0-generate-001
 * - If both are bad: mark as defective in Firestore
 *
 * Usage:
 *   cd functions
 *   npm run build
 *   node lib/scripts/review-images.js
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

// Project ID where gemini-api-key is stored
const CLOUD_RUN_PROJECT_ID = 'gen-lang-client-0960644135';
const GEMINI_SECRET_NAME = 'gemini-api-key';

// Test data - Brooklyn Bridge and Eiffel Tower images
const TEST_QUESTIONS = [
  {
    id: 'test_brooklyn_bridge',
    stem: 'Brooklyn Bridge',
    options: [
      {
        index: 0,
        label: 'Brooklyn Bridge (CORRECT)',
        expectedSubject: 'Brooklyn Bridge in New York City',
        gemini3Url: 'https://storage.googleapis.com/stanse-public-assets/duel-images-test/gemini-3-pro-image-preview/test_brooklyn_bridge_1768276555571_option_0.png',
        imagen4Url: 'https://storage.googleapis.com/stanse-public-assets/duel-images-test/imagen-4.0-generate-001/test_brooklyn_bridge_1768276555571_option_0.png',
      },
      {
        index: 1,
        label: 'Golden Gate Bridge',
        expectedSubject: 'Golden Gate Bridge in San Francisco',
        gemini3Url: 'https://storage.googleapis.com/stanse-public-assets/duel-images-test/gemini-3-pro-image-preview/test_brooklyn_bridge_1768276555571_option_1.png',
        imagen4Url: 'https://storage.googleapis.com/stanse-public-assets/duel-images-test/imagen-4.0-generate-001/test_brooklyn_bridge_1768276555571_option_1.png',
      },
      {
        index: 2,
        label: 'Tower Bridge',
        expectedSubject: 'Tower Bridge in London',
        gemini3Url: 'https://storage.googleapis.com/stanse-public-assets/duel-images-test/gemini-3-pro-image-preview/test_brooklyn_bridge_1768276555571_option_2.png',
        imagen4Url: 'https://storage.googleapis.com/stanse-public-assets/duel-images-test/imagen-4.0-generate-001/test_brooklyn_bridge_1768276555571_option_2.png',
      },
      {
        index: 3,
        label: 'Sydney Harbour Bridge',
        expectedSubject: 'Sydney Harbour Bridge in Australia',
        gemini3Url: 'https://storage.googleapis.com/stanse-public-assets/duel-images-test/gemini-3-pro-image-preview/test_brooklyn_bridge_1768276555571_option_3.png',
        imagen4Url: 'https://storage.googleapis.com/stanse-public-assets/duel-images-test/imagen-4.0-generate-001/test_brooklyn_bridge_1768276555571_option_3.png',
      },
    ],
  },
  {
    id: 'test_eiffel_tower',
    stem: 'Eiffel Tower',
    options: [
      {
        index: 0,
        label: 'Eiffel Tower (CORRECT)',
        expectedSubject: 'Eiffel Tower in Paris, France',
        gemini3Url: 'https://storage.googleapis.com/stanse-public-assets/duel-images-test/gemini-3-pro-image-preview/test_eiffel_tower_1768277666955_option_0.png',
        imagen4Url: 'https://storage.googleapis.com/stanse-public-assets/duel-images-test/imagen-4.0-generate-001/test_eiffel_tower_1768277666955_option_0.png',
      },
      {
        index: 1,
        label: 'Tokyo Tower',
        expectedSubject: 'Tokyo Tower in Japan',
        gemini3Url: 'https://storage.googleapis.com/stanse-public-assets/duel-images-test/gemini-3-pro-image-preview/test_eiffel_tower_1768277666955_option_1.png',
        imagen4Url: 'https://storage.googleapis.com/stanse-public-assets/duel-images-test/imagen-4.0-generate-001/test_eiffel_tower_1768277666955_option_1.png',
      },
      {
        index: 2,
        label: 'Blackpool Tower',
        expectedSubject: 'Blackpool Tower in England',
        gemini3Url: 'https://storage.googleapis.com/stanse-public-assets/duel-images-test/gemini-3-pro-image-preview/test_eiffel_tower_1768277666955_option_2.png',
        imagen4Url: 'https://storage.googleapis.com/stanse-public-assets/duel-images-test/imagen-4.0-generate-001/test_eiffel_tower_1768277666955_option_2.png',
      },
      {
        index: 3,
        label: 'Petrin Lookout Tower',
        expectedSubject: 'Petrin Lookout Tower in Prague',
        gemini3Url: 'https://storage.googleapis.com/stanse-public-assets/duel-images-test/gemini-3-pro-image-preview/test_eiffel_tower_1768277666955_option_3.png',
        imagen4Url: 'https://storage.googleapis.com/stanse-public-assets/duel-images-test/imagen-4.0-generate-001/test_eiffel_tower_1768277666955_option_3.png',
      },
    ],
  },
];

interface ImageReviewResult {
  url: string;
  model: string;
  isValid: boolean;
  issues: string[];
}

interface OptionReviewResult {
  optionIndex: number;
  label: string;
  gemini3: ImageReviewResult;
  imagen4: ImageReviewResult;
  selectedUrl: string;
  selectedModel: string;
  isDefective: boolean;
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
 * Check if image is square using Python (via child process)
 */
async function checkImageSquareWithPython(imageUrl: string): Promise<{ isSquare: boolean; width: number; height: number }> {
  const { execSync } = await import('child_process');

  const pythonScript = `
import urllib.request
import sys
from PIL import Image
from io import BytesIO

url = sys.argv[1]
with urllib.request.urlopen(url) as response:
    img_data = response.read()
img = Image.open(BytesIO(img_data))
w, h = img.size
print(f"{w},{h},{w == h}")
`;

  try {
    const result = execSync(`python3 -c '${pythonScript}' "${imageUrl}"`, {
      encoding: 'utf-8',
      timeout: 30000,
    }).trim();

    const [width, height, isSquare] = result.split(',');
    return {
      width: parseInt(width),
      height: parseInt(height),
      isSquare: isSquare === 'True',
    };
  } catch (error: any) {
    console.log(`    ⚠️ Python check failed: ${error.message}`);
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
 * Review a single image:
 * - Python checks if image is square
 * - Gemini 3 checks for borders, text, wrong subject
 */
async function reviewImage(
  client: GoogleGenAI,
  imageUrl: string,
  expectedSubject: string,
  model: string
): Promise<ImageReviewResult> {
  try {
    // Step 1: Check if image is square using Python
    const dimensions = await checkImageSquareWithPython(imageUrl);
    if (!dimensions.isSquare) {
      console.log(`    ❌ Not square: ${dimensions.width}x${dimensions.height}`);
      return {
        url: imageUrl,
        model,
        isValid: false,
        issues: [`Not square: ${dimensions.width}x${dimensions.height}`],
      };
    }
    console.log(`    ✓ Square: ${dimensions.width}x${dimensions.height}`);

    // Step 2: Use Gemini 3 to check content issues (borders, text, wrong subject)
    const imageBase64 = await fetchImageAsBase64(imageUrl);

    const response = await client.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: [{
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType: 'image/png',
              data: imageBase64,
            }
          },
          {
            text: `You are an image quality reviewer for a trivia quiz game.

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

IMPORTANT: Natural sky (even uniform blue), water, or landscape backgrounds are NOT artificial borders. Only flag true white/black rectangular frames.`
          }
        ]
      }],
    });

    // Parse the response
    const responseText = response.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Extract JSON from response (handle markdown code blocks)
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
      console.log(`    ⚠️ Could not parse response: ${responseText.substring(0, 100)}...`);
      return {
        url: imageUrl,
        model,
        isValid: false,
        issues: ['Could not parse review response'],
      };
    }
  } catch (error: any) {
    console.error(`    ❌ Error reviewing image: ${error.message}`);
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
 */
async function reviewQuestion(
  client: GoogleGenAI,
  question: typeof TEST_QUESTIONS[0]
): Promise<OptionReviewResult[]> {
  console.log(`\n📋 Reviewing: ${question.stem}`);
  console.log('─'.repeat(60));

  const results: OptionReviewResult[] = [];

  for (const option of question.options) {
    console.log(`\n  Option ${option.index}: ${option.label}`);

    // Review both images
    console.log(`    Reviewing gemini-3-pro-image-preview...`);
    const gemini3Result = await reviewImage(client, option.gemini3Url, option.expectedSubject, 'gemini-3-pro-image-preview');

    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log(`    Reviewing imagen-4.0-generate-001...`);
    const imagen4Result = await reviewImage(client, option.imagen4Url, option.expectedSubject, 'imagen-4.0-generate-001');

    // Determine which image to use
    let selectedUrl: string;
    let selectedModel: string;
    let isDefective = false;

    if (gemini3Result.isValid && imagen4Result.isValid) {
      // Both good - prefer Imagen 4
      selectedUrl = option.imagen4Url;
      selectedModel = 'imagen-4.0-generate-001';
      console.log(`    ✅ Both valid - using Imagen 4`);
    } else if (imagen4Result.isValid && !gemini3Result.isValid) {
      // Only Imagen 4 is good
      selectedUrl = option.imagen4Url;
      selectedModel = 'imagen-4.0-generate-001';
      console.log(`    ✅ Imagen 4 valid, Gemini 3 has issues: ${gemini3Result.issues.join(', ')}`);
    } else if (gemini3Result.isValid && !imagen4Result.isValid) {
      // Only Gemini 3 is good
      selectedUrl = option.gemini3Url;
      selectedModel = 'gemini-3-pro-image-preview';
      console.log(`    ✅ Gemini 3 valid, Imagen 4 has issues: ${imagen4Result.issues.join(', ')}`);
    } else {
      // Both are bad - mark as defective
      selectedUrl = '';
      selectedModel = 'none';
      isDefective = true;
      console.log(`    ❌ DEFECTIVE - Both images have issues:`);
      console.log(`       Gemini 3: ${gemini3Result.issues.join(', ')}`);
      console.log(`       Imagen 4: ${imagen4Result.issues.join(', ')}`);
    }

    results.push({
      optionIndex: option.index,
      label: option.label,
      gemini3: gemini3Result,
      imagen4: imagen4Result,
      selectedUrl,
      selectedModel,
      isDefective,
    });

    // Rate limiting between options
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  return results;
}

/**
 * Save review results to Firestore
 */
async function saveResultsToFirestore(
  questionId: string,
  results: OptionReviewResult[]
): Promise<void> {
  console.log(`\n📤 Saving results to Firestore for ${questionId}...`);

  const hasDefective = results.some(r => r.isDefective);

  const docData = {
    questionId,
    reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
    defective: hasDefective,
    defectiveOptions: results.filter(r => r.isDefective).map(r => r.optionIndex),
    options: results.map(r => ({
      index: r.optionIndex,
      label: r.label,
      selectedUrl: r.selectedUrl,
      selectedModel: r.selectedModel,
      isDefective: r.isDefective,
      gemini3: {
        url: r.gemini3.url,
        isValid: r.gemini3.isValid,
        issues: r.gemini3.issues,
      },
      imagen4: {
        url: r.imagen4.url,
        isValid: r.imagen4.isValid,
        issues: r.imagen4.issues,
      },
    })),
  };

  await db.collection('duel-image-reviews').doc(questionId).set(docData);
  console.log(`  ✅ Saved to duel-image-reviews/${questionId}`);
}

/**
 * Main function
 */
async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  DUEL Image Quality Review');
  console.log('  Checking: white borders, square, text overlay, wrong subject');
  console.log('═══════════════════════════════════════════════════════════');

  // Get API key
  const apiKey = await getGeminiApiKey();
  const client = new GoogleGenAI({ apiKey });

  // Review all test questions
  for (const question of TEST_QUESTIONS) {
    const results = await reviewQuestion(client, question);
    await saveResultsToFirestore(question.id, results);
  }

  // Print summary
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  REVIEW SUMMARY');
  console.log('═══════════════════════════════════════════════════════════');

  for (const question of TEST_QUESTIONS) {
    const doc = await db.collection('duel-image-reviews').doc(question.id).get();
    const data = doc.data();

    console.log(`\n📋 ${question.stem}:`);
    if (data?.defective) {
      console.log(`  ⚠️ DEFECTIVE - Options with issues: ${data.defectiveOptions.join(', ')}`);
    } else {
      console.log(`  ✅ All options have valid images`);
    }

    for (const opt of data?.options || []) {
      const status = opt.isDefective ? '❌' : '✅';
      console.log(`  ${status} Option ${opt.index}: ${opt.selectedModel || 'NONE'}`);
      if (opt.gemini3.issues.length > 0) {
        console.log(`     Gemini 3 issues: ${opt.gemini3.issues.join(', ')}`);
      }
      if (opt.imagen4.issues.length > 0) {
        console.log(`     Imagen 4 issues: ${opt.imagen4.issues.join(', ')}`);
      }
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  Review complete! Check Firestore: duel-image-reviews');
  console.log('═══════════════════════════════════════════════════════════');

  process.exit(0);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
