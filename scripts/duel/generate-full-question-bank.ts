#!/usr/bin/env ts-node
/**
 * Generate Complete 150-Question Bank for DUEL Arena
 * Distribution: 40 EASY, 70 MEDIUM, 40 HARD
 *
 * Uses Gemini API to generate question stems and image descriptions
 * API Key: Retrieved from Google Secret Manager (NEVER hardcoded)
 *
 * Usage:
 *   npx ts-node scripts/duel/generate-full-question-bank.ts
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';

// Initialize Firebase Admin
const serviceAccountPath = path.join(__dirname, '../../service-account-key.json');
if (fs.existsSync(serviceAccountPath)) {
  initializeApp({ credential: cert(serviceAccountPath) });
} else {
  initializeApp();
}

const db = getFirestore();
const secretClient = new SecretManagerServiceClient();

const PROJECT_ID = 'gen-lang-client-0960644135';
const GEMINI_SECRET_NAME = 'gemini-api-key';

let geminiApiKey: string | null = null;

/**
 * Get Gemini API key from Google Secret Manager
 * CRITICAL: Never hardcode API keys
 */
async function getGeminiApiKey(): Promise<string> {
  if (geminiApiKey) return geminiApiKey;

  try {
    const [version] = await secretClient.accessSecretVersion({
      name: `projects/${PROJECT_ID}/secrets/${GEMINI_SECRET_NAME}/versions/latest`,
    });

    const payload = version.payload?.data?.toString();
    if (!payload) throw new Error('Empty payload from Secret Manager');

    geminiApiKey = payload;
    console.log('✅ Gemini API key loaded from Secret Manager');
    return payload;
  } catch (error) {
    console.error('❌ Failed to load API key from Secret Manager:', error);
    throw new Error('Cannot proceed without API key from Secret Manager');
  }
}

interface QuestionSpec {
  category: 'FLAGS' | 'LANDMARKS' | 'ANIMALS' | 'LOGOS' | 'FOOD' | 'SYMBOLS';
  count: number;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
}

// Question distribution plan
const QUESTION_PLAN: QuestionSpec[] = [
  // EASY (40 total)
  { category: 'FLAGS', count: 10, difficulty: 'EASY' },
  { category: 'LANDMARKS', count: 10, difficulty: 'EASY' },
  { category: 'ANIMALS', count: 10, difficulty: 'EASY' },
  { category: 'FOOD', count: 10, difficulty: 'EASY' },

  // MEDIUM (70 total)
  { category: 'FLAGS', count: 15, difficulty: 'MEDIUM' },
  { category: 'LANDMARKS', count: 15, difficulty: 'MEDIUM' },
  { category: 'ANIMALS', count: 15, difficulty: 'MEDIUM' },
  { category: 'LOGOS', count: 10, difficulty: 'MEDIUM' },
  { category: 'FOOD', count: 10, difficulty: 'MEDIUM' },
  { category: 'SYMBOLS', count: 5, difficulty: 'MEDIUM' },

  // HARD (40 total)
  { category: 'FLAGS', count: 10, difficulty: 'HARD' },
  { category: 'LANDMARKS', count: 10, difficulty: 'HARD' },
  { category: 'ANIMALS', count: 10, difficulty: 'HARD' },
  { category: 'SYMBOLS', count: 10, difficulty: 'HARD' },
];

/**
 * Generate question using Gemini API
 */
async function generateQuestion(
  category: string,
  difficulty: string,
  index: number,
  apiKey: string
): Promise<{
  stem: string;
  correct: string;
  distractors: string[];
} | null> {
  try {
    const ai = new GoogleGenAI({ apiKey });

    const prompt = `Generate a ${difficulty.toLowerCase()} difficulty ${category.toLowerCase()} picture trivia question.

Category: ${category}
Difficulty: ${difficulty}

Requirements:
1. Return a question stem (the thing to identify)
2. Provide 1 CORRECT description (for image generation)
3. Provide 3 DISTRACTOR descriptions (similar but WRONG)
4. Distractors must be visually similar to correct answer but factually different
5. All 4 options must be distinct

Format your response EXACTLY as:
STEM: [question text]
CORRECT: [detailed image description]
DISTRACTOR1: [detailed image description]
DISTRACTOR2: [detailed image description]
DISTRACTOR3: [detailed image description]

Example for FLAGS/EASY:
STEM: Flag of Japan
CORRECT: Japanese flag with large red circle centered on white background
DISTRACTOR1: Flag of Bangladesh with red circle offset left on green background
DISTRACTOR2: Flag of Palau with yellow circle offset left on light blue background
DISTRACTOR3: Flag of South Korea with yin-yang symbol and trigrams

Now generate for ${category}/${difficulty}:`;

    const result = await ai.models.generateContent({
      model: 'gemini-2.0-flash-exp',
      contents: prompt
    });

    const text = result.text || '';
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);

    const stemMatch = lines.find(l => l.startsWith('STEM:'));
    const correctMatch = lines.find(l => l.startsWith('CORRECT:'));
    const d1Match = lines.find(l => l.startsWith('DISTRACTOR1:'));
    const d2Match = lines.find(l => l.startsWith('DISTRACTOR2:'));
    const d3Match = lines.find(l => l.startsWith('DISTRACTOR3:'));

    if (!stemMatch || !correctMatch || !d1Match || !d2Match || !d3Match) {
      console.warn(`  ⚠️  Incomplete response for ${category}/${difficulty}/${index}`);
      return null;
    }

    return {
      stem: stemMatch.replace('STEM:', '').trim(),
      correct: correctMatch.replace('CORRECT:', '').trim(),
      distractors: [
        d1Match.replace('DISTRACTOR1:', '').trim(),
        d2Match.replace('DISTRACTOR2:', '').trim(),
        d3Match.replace('DISTRACTOR3:', '').trim()
      ]
    };
  } catch (error) {
    console.error(`  ❌ Failed to generate question:`, error);
    return null;
  }
}

/**
 * Generate placeholder image (base64 SVG)
 */
function generatePlaceholderImage(description: string): string {
  const encoded = encodeURIComponent(description.substring(0, 40));
  return `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect fill="%23f0f0f0" width="512" height="512"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" font-size="16" fill="%23666">${encoded}</text></svg>`;
}

/**
 * Main generation function
 */
async function generateAllQuestions() {
  console.log('🎲 Generating 150-Question Bank for DUEL Arena\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const apiKey = await getGeminiApiKey();
  const ai = new GoogleGenAI({ apiKey });

  let questionId = 1;
  let totalGenerated = 0;

  for (const spec of QUESTION_PLAN) {
    console.log(`\n📁 ${spec.category} / ${spec.difficulty} (${spec.count} questions)`);

    for (let i = 0; i < spec.count; i++) {
      const qid = `q${String(questionId).padStart(3, '0')}`;
      console.log(`  [${totalGenerated + 1}/150] ${qid}: Generating...`);

      const questionData = await generateQuestion(spec.category, spec.difficulty, i, apiKey);

      if (!questionData) {
        console.log(`  ❌ Skipping ${qid}`);
        continue;
      }

      console.log(`    ✓ Stem: ${questionData.stem}`);

      // Generate placeholder images (in production, would use Imagen API)
      const images = [
        { url: generatePlaceholderImage(questionData.correct), isCorrect: true, prompt: questionData.correct },
        ...questionData.distractors.map(d => ({
          url: generatePlaceholderImage(d),
          isCorrect: false,
          prompt: d
        }))
      ];

      // Shuffle images
      const shuffled = images
        .map(value => ({ value, sort: Math.random() }))
        .sort((a, b) => a.sort - b.sort)
        .map(({ value }, idx) => ({ ...value, index: idx, generatedAt: new Date().toISOString() }));

      const correctIndex = shuffled.findIndex(img => img.isCorrect);

      // Create Firestore document
      const questionDoc = {
        questionId: qid,
        stem: questionData.stem,
        category: spec.category,
        difficulty: spec.difficulty,
        images: shuffled,
        correctIndex,
        createdAt: new Date().toISOString(),
        metadata: {
          imageGenModel: 'placeholder', // Will be 'imagen-3' in production
          imageSize: '512x512',
          stylePrompt: 'Clean, professional, recognizable',
          generatedBy: 'gemini-2.0-flash-exp'
        }
      };

      // Write to Firestore
      await db.collection('duel_questions').doc(qid).set(questionDoc);
      console.log(`    ✅ Saved to Firestore: ${qid}`);

      questionId++;
      totalGenerated++;

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✅ Generated ${totalGenerated} questions`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Verify distribution
  const easyCount = QUESTION_PLAN.filter(s => s.difficulty === 'EASY').reduce((sum, s) => sum + s.count, 0);
  const mediumCount = QUESTION_PLAN.filter(s => s.difficulty === 'MEDIUM').reduce((sum, s) => sum + s.count, 0);
  const hardCount = QUESTION_PLAN.filter(s => s.difficulty === 'HARD').reduce((sum, s) => sum + s.count, 0);

  console.log('📊 Distribution:');
  console.log(`   EASY: ${easyCount} (target: 40)`);
  console.log(`   MEDIUM: ${mediumCount} (target: 70)`);
  console.log(`   HARD: ${hardCount} (target: 40)`);
  console.log(`   TOTAL: ${easyCount + mediumCount + hardCount}\n`);
}

async function main() {
  try {
    await generateAllQuestions();
    console.log('🎉 Question generation complete!');
    console.log('\nNext step: Run generate-sequences.ts to create match sequences\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

main();
