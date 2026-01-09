"use strict";
/**
 * Question Populator - HTTP Callable Function
 * Generates 150 questions directly in Firestore
 * Call this once to populate the question bank
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
exports.populateQuestions = populateQuestions;
const admin = __importStar(require("firebase-admin"));
const db = admin.firestore();
const categories = ['FLAGS', 'LANDMARKS', 'ANIMALS', 'FOOD', 'LOGOS', 'SYMBOLS'];
function getColor(difficulty) {
    switch (difficulty) {
        case 'EASY': return 'ccffcc';
        case 'MEDIUM': return 'ffffcc';
        case 'HARD': return 'ffcccc';
        default: return 'cccccc';
    }
}
/**
 * Populate all 150 questions
 * Distribution: 40 EASY, 70 MEDIUM, 40 HARD
 */
async function populateQuestions() {
    console.log('🎲 Populating 150 questions to Firestore...');
    const batch = db.batch();
    let id = 1;
    // EASY: 40 questions
    for (let i = 0; i < 40; i++) {
        const qid = `q${String(id).padStart(3, '0')}`;
        const cat = categories[(id - 1) % categories.length];
        const question = {
            questionId: qid,
            stem: `${cat} Question #${id} (EASY)`,
            category: cat,
            difficulty: 'EASY',
            images: [
                { url: `https://via.placeholder.com/512/${getColor('EASY')}/000?text=${qid}-A`, isCorrect: false, prompt: 'Distractor A', index: 0, generatedAt: new Date().toISOString() },
                { url: `https://via.placeholder.com/512/${getColor('EASY')}/000?text=${qid}-B`, isCorrect: false, prompt: 'Distractor B', index: 1, generatedAt: new Date().toISOString() },
                { url: `https://via.placeholder.com/512/00ff00/000?text=${qid}-CORRECT`, isCorrect: true, prompt: 'Correct answer', index: 2, generatedAt: new Date().toISOString() },
                { url: `https://via.placeholder.com/512/${getColor('EASY')}/000?text=${qid}-D`, isCorrect: false, prompt: 'Distractor C', index: 3, generatedAt: new Date().toISOString() }
            ],
            correctIndex: 2,
            createdAt: new Date().toISOString(),
            metadata: {
                imageGenModel: 'placeholder-v1',
                imageSize: '512x512'
            }
        };
        const docRef = db.collection('duel_questions').doc(qid);
        batch.set(docRef, question);
        id++;
        // Commit in batches of 50
        if (id % 50 === 0) {
            await batch.commit();
            console.log(`  ✅ Committed ${id}/150 questions...`);
        }
    }
    // MEDIUM: 70 questions
    for (let i = 0; i < 70; i++) {
        const qid = `q${String(id).padStart(3, '0')}`;
        const cat = categories[(id - 1) % categories.length];
        const question = {
            questionId: qid,
            stem: `${cat} Question #${id} (MEDIUM)`,
            category: cat,
            difficulty: 'MEDIUM',
            images: [
                { url: `https://via.placeholder.com/512/${getColor('MEDIUM')}/000?text=${qid}-A`, isCorrect: false, prompt: 'Distractor A', index: 0, generatedAt: new Date().toISOString() },
                { url: `https://via.placeholder.com/512/${getColor('MEDIUM')}/000?text=${qid}-B`, isCorrect: false, prompt: 'Distractor B', index: 1, generatedAt: new Date().toISOString() },
                { url: `https://via.placeholder.com/512/00ff00/000?text=${qid}-CORRECT`, isCorrect: true, prompt: 'Correct answer', index: 2, generatedAt: new Date().toISOString() },
                { url: `https://via.placeholder.com/512/${getColor('MEDIUM')}/000?text=${qid}-D`, isCorrect: false, prompt: 'Distractor C', index: 3, generatedAt: new Date().toISOString() }
            ],
            correctIndex: 2,
            createdAt: new Date().toISOString(),
            metadata: {
                imageGenModel: 'placeholder-v1',
                imageSize: '512x512'
            }
        };
        const docRef = db.collection('duel_questions').doc(qid);
        batch.set(docRef, question);
        id++;
        if (id % 50 === 0) {
            await batch.commit();
            console.log(`  ✅ Committed ${id}/150 questions...`);
        }
    }
    // HARD: 40 questions
    for (let i = 0; i < 40; i++) {
        const qid = `q${String(id).padStart(3, '0')}`;
        const cat = categories[(id - 1) % categories.length];
        const question = {
            questionId: qid,
            stem: `${cat} Question #${id} (HARD)`,
            category: cat,
            difficulty: 'HARD',
            images: [
                { url: `https://via.placeholder.com/512/${getColor('HARD')}/000?text=${qid}-A`, isCorrect: false, prompt: 'Distractor A', index: 0, generatedAt: new Date().toISOString() },
                { url: `https://via.placeholder.com/512/${getColor('HARD')}/000?text=${qid}-B`, isCorrect: false, prompt: 'Distractor B', index: 1, generatedAt: new Date().toISOString() },
                { url: `https://via.placeholder.com/512/00ff00/000?text=${qid}-CORRECT`, isCorrect: true, prompt: 'Correct answer', index: 2, generatedAt: new Date().toISOString() },
                { url: `https://via.placeholder.com/512/${getColor('HARD')}/000?text=${qid}-D`, isCorrect: false, prompt: 'Distractor C', index: 3, generatedAt: new Date().toISOString() }
            ],
            correctIndex: 2,
            createdAt: new Date().toISOString(),
            metadata: {
                imageGenModel: 'placeholder-v1',
                imageSize: '512x512'
            }
        };
        const docRef = db.collection('duel_questions').doc(qid);
        batch.set(docRef, question);
        id++;
    }
    // Final commit
    await batch.commit();
    console.log(`✅ All 150 questions populated!`);
    console.log(`📊 Distribution: 40 EASY, 70 MEDIUM, 40 HARD`);
    return { success: true, count: 150 };
}
//# sourceMappingURL=questionPopulator.js.map