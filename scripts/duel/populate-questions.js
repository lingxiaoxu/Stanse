#!/usr/bin/env node
/**
 * Populate 150 questions to Firestore
 * Run from project root: node scripts/duel/populate-questions.js
 */

const { initializeApp } = require('firebase/app');
const { getFirestore, collection, doc, setDoc } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: "AIzaSyD1Hdjo17l2YrgakNzZW-lpx78vVE77keE",
  projectId: "stanseproject"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const categories = ['FLAGS', 'LANDMARKS', 'ANIMALS', 'FOOD', 'LOGOS', 'SYMBOLS'];

async function populateQuestions() {
  console.log('🎲 Populating 150 questions to Firestore...\n');

  let id = 1;

  // EASY: 40 questions
  console.log('📁 Generating EASY questions (40)...');
  for (let i = 0; i < 40; i++) {
    await createQuestion(id++, 'EASY');
  }

  // MEDIUM: 70 questions
  console.log('\n📁 Generating MEDIUM questions (70)...');
  for (let i = 0; i < 70; i++) {
    await createQuestion(id++, 'MEDIUM');
  }

  // HARD: 40 questions
  console.log('\n📁 Generating HARD questions (40)...');
  for (let i = 0; i < 40; i++) {
    await createQuestion(id++, 'HARD');
  }

  console.log('\n✅ All 150 questions created!');
  console.log('\n📊 Distribution: 40 EASY, 70 MEDIUM, 40 HARD');
  process.exit(0);
}

async function createQuestion(id, difficulty) {
  const qid = `q${String(id).padStart(3, '0')}`;
  const cat = categories[(id - 1) % categories.length];

  const question = {
    questionId: qid,
    stem: `${cat} Question #${id} (${difficulty})`,
    category: cat,
    difficulty: difficulty,
    images: [
      { url: `https://via.placeholder.com/512/${getColor(difficulty)}/000?text=${qid}-Option-A`, isCorrect: false, prompt: 'Distractor A', index: 0, generatedAt: new Date().toISOString() },
      { url: `https://via.placeholder.com/512/${getColor(difficulty)}/000?text=${qid}-Option-B`, isCorrect: false, prompt: 'Distractor B', index: 1, generatedAt: new Date().toISOString() },
      { url: `https://via.placeholder.com/512/00ff00/000?text=${qid}-CORRECT`, isCorrect: true, prompt: 'Correct answer', index: 2, generatedAt: new Date().toISOString() },
      { url: `https://via.placeholder.com/512/${getColor(difficulty)}/000?text=${qid}-Option-D`, isCorrect: false, prompt: 'Distractor C', index: 3, generatedAt: new Date().toISOString() }
    ],
    correctIndex: 2,
    createdAt: new Date().toISOString(),
    metadata: {
      imageGenModel: 'placeholder-v1',
      imageSize: '512x512',
      stylePrompt: 'Generated for testing',
      generatedBy: 'populate-questions-script'
    }
  };

  await setDoc(doc(db, 'duel_questions', qid), question);
  console.log(`  ✅ ${qid}: ${cat} / ${difficulty}`);
}

function getColor(difficulty) {
  switch(difficulty) {
    case 'EASY': return 'ccffcc';
    case 'MEDIUM': return 'ffffcc';
    case 'HARD': return 'ffcccc';
    default: return 'cccccc';
  }
}

populateQuestions().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
