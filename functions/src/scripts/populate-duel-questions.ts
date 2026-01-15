/**
 * Populate DUEL Questions from complete-questions.json to Firestore
 *
 * Imports 150 real questions with proper structure for dual-model image generation.
 *
 * Usage:
 *   cd functions
 *   npm run build
 *   node lib/scripts/populate-duel-questions.js
 *
 * Data structure in Firestore (duel_questions collection):
 * {
 *   questionId: "q001",
 *   stem: "Flag of the United States",
 *   category: "FLAGS",
 *   difficulty: "EASY",
 *   correctIndex: 0,  // Which option is correct (0-3)
 *   options: [
 *     { prompt: "American flag with 50 white stars...", isCorrect: true },
 *     { prompt: "Flag of Liberia...", isCorrect: false },
 *     { prompt: "Flag of Malaysia...", isCorrect: false },
 *     { prompt: "Flag of Chile...", isCorrect: false },
 *   ],
 *   generatedImages: {
 *     gemini3: [{ url: "...", generatedAt: "..." }, ...],  // 4 images (one per option)
 *     imagen4: [{ url: "...", generatedAt: "..." }, ...],  // 4 images (one per option)
 *   },
 *   selectedImages: [{ url: "...", model: "...", optionIndex: 0 }, ...],  // 4 selected (one per option)
 *   defective: false,
 *   defectiveOptions: [],  // Indices of options where both models failed
 *   createdAt: timestamp,
 * }
 */

import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'stanseproject',
  });
}
const db = admin.firestore();

interface RawQuestion {
  id: string;
  stem: string;
  correct: string;
  distractors: string[];
  difficulty: string;
  category: string;
}

/**
 * Load questions from JSON file
 */
function loadQuestionsFromFile(): RawQuestion[] {
  const possiblePaths = [
    path.join(__dirname, '../../../scripts/duel/complete-questions.json'),
    path.join(__dirname, '../../scripts/duel/complete-questions.json'),
    path.join(process.cwd(), '../scripts/duel/complete-questions.json'),
    path.join(process.cwd(), 'scripts/duel/complete-questions.json'),
    '/Users/xuling/code/Stanse/scripts/duel/complete-questions.json',
  ];

  for (const p of possiblePaths) {
    try {
      if (fs.existsSync(p)) {
        console.log(`📂 Loading questions from: ${p}`);
        const rawData = fs.readFileSync(p, 'utf-8');
        return JSON.parse(rawData);
      }
    } catch {
      continue;
    }
  }

  throw new Error('Could not find complete-questions.json');
}

/**
 * Populate questions to Firestore
 * Exported for use by Cloud Function in index.ts
 */
export async function populateQuestions(): Promise<{ success: boolean; count: number }> {
  console.log('🎲 Populating questions to Firestore...');

  const questions = loadQuestionsFromFile();
  console.log(`✅ Loaded ${questions.length} questions`);

  // Count by category and difficulty
  const stats = {
    categories: {} as Record<string, number>,
    difficulties: {} as Record<string, number>,
  };

  for (const q of questions) {
    stats.categories[q.category] = (stats.categories[q.category] || 0) + 1;
    stats.difficulties[q.difficulty] = (stats.difficulties[q.difficulty] || 0) + 1;
  }

  console.log('📊 Distribution:');
  console.log('   Categories:', stats.categories);
  console.log('   Difficulties:', stats.difficulties);

  // Upload to Firestore in batches
  console.log('📤 Uploading to Firestore...');

  const batchSize = 50;
  let uploaded = 0;

  for (let i = 0; i < questions.length; i += batchSize) {
    const batch = db.batch();
    const chunk = questions.slice(i, i + batchSize);

    for (const q of chunk) {
      const docRef = db.collection('duel_questions').doc(q.id);

      // Build options array: correct answer first, then distractors
      const options = [
        { prompt: q.correct, isCorrect: true },
        ...q.distractors.map(d => ({ prompt: d, isCorrect: false })),
      ];

      const docData = {
        questionId: q.id,
        stem: q.stem,
        category: q.category,
        difficulty: q.difficulty,
        correctIndex: 0, // Correct answer is always at index 0
        options,
        generatedImages: {
          gemini3: [] as { url: string; generatedAt: string }[],
          imagen4: [] as { url: string; generatedAt: string }[],
        },
        selectedImages: [] as { url: string; model: string; optionIndex: number }[],
        defective: false,
        defectiveOptions: [] as number[],
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        // Legacy compatibility: Keep 'images' array for backward compatibility with client
        images: options.map((opt, idx) => ({
          url: '', // Will be populated after image generation and review
          prompt: opt.prompt,
          isCorrect: opt.isCorrect,
          index: idx,
          generatedAt: '',
        })),
        metadata: {
          imageGenModel: '', // Will be set after review selects the best model
          imageSize: '1024x1024',
          aspectRatio: '1:1',
        },
      };

      batch.set(docRef, docData, { merge: true });
    }

    await batch.commit();
    uploaded += chunk.length;
    console.log(`  ✅ Uploaded ${uploaded}/${questions.length} questions`);
  }

  console.log(`✅ Successfully populated ${questions.length} questions`);
  return { success: true, count: questions.length };
}

/**
 * CLI entry point
 */
async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Populate DUEL Questions to Firestore');
  console.log('═══════════════════════════════════════════════════════════\n');

  const result = await populateQuestions();

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`  ✅ Successfully populated ${result.count} questions`);
  console.log('  Next step: Run generate-duel-images.js to generate images');
  console.log('═══════════════════════════════════════════════════════════');

  process.exit(0);
}

// Only run main() if this script is executed directly (not imported)
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
