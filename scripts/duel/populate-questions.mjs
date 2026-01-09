#!/usr/bin/env node
/**
 * Populate 150 questions to Firestore
 * Run: node scripts/duel/populate-questions.mjs
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, setDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyD1Hdjo17l2YrgakNzZW-lpx78vVE77keE",
  projectId: "stanseproject"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const categories = ['FLAGS', 'LANDMARKS', 'ANIMALS', 'FOOD', 'LOGOS', 'SYMBOLS'];

async function createQuestion(id, difficulty) {
  const qid = `q${String(id).padStart(3, '0')}`;
  const cat = categories[(id - 1) % categories.length];

  const question = {
    questionId: qid,
    stem: `${cat} Question #${id} (${difficulty})`,
    category: cat,
    difficulty: difficulty,
    images: [
      { url: `https://via.placeholder.com/512/${getColor(difficulty)}/000?text=${qid}-A`, isCorrect: false, prompt: 'Distractor A', index: 0, generatedAt: new Date().toISOString() },
      { url: `https://via.placeholder.com/512/${getColor(difficulty)}/000?text=${qid}-B`, isCorrect: false, prompt: 'Distractor B', index: 1, generatedAt: new Date().toISOString() },
      { url: `https://via.placeholder.com/512/00ff00/000?text=${qid}-CORRECT`, isCorrect: true, prompt: 'Correct answer', index: 2, generatedAt: new Date().toISOString() },
      { url: `https://via.placeholder.com/512/${getColor(difficulty)}/000?text=${qid}-D`, isCorrect: false, prompt: 'Distractor C', index: 3, generatedAt: new Date().toISOString() }
    ],
    correctIndex: 2,
    createdAt: new Date().toISOString(),
    metadata: {
      imageGenModel: 'placeholder-v1',
      imageSize: '512x512',
      stylePrompt: 'Placeholder for testing'
    }
  };

  await setDoc(doc(db, 'duel_questions', qid), question);
  if (id % 10 === 0) {
    console.log(`  ✅ Generated ${id}/150 questions...`);
  }
}

function getColor(difficulty) {
  switch(difficulty) {
    case 'EASY': return 'ccffcc';
    case 'MEDIUM': return 'ffffcc';
    case 'HARD': return 'ffcccc';
  }
}

async function main() {
  try {
    let id = 1;

    // EASY: 40
    for (let i = 0; i < 40; i++) {
      await createQuestion(id++, 'EASY');
    }

    // MEDIUM: 70
    for (let i = 0; i < 70; i++) {
      await createQuestion(id++, 'MEDIUM');
    }

    // HARD: 40
    for (let i = 0; i < 40; i++) {
      await createQuestion(id++, 'HARD');
    }

    console.log('\n✅ All 150 questions populated to Firestore!');
    console.log('📊 Distribution: 40 EASY, 70 MEDIUM, 40 HARD\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();
