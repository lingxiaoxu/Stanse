"use strict";
/**
 * Question Generation Agent
 *
 * 职责：
 * - 从 complete-questions.json 加载问题数据
 * - 或根据名词/概念主干生成新题目
 * - 自动生成 1 个正确图片选项 + 3 个高度相似的迷惑选项
 *
 * 数据源：
 * - /scripts/duel/complete-questions.json (150个预定义问题)
 * - /scripts/duel/upload-complete-questions.mjs (上传脚本)
 * - /populate-duel-questions.html (Web管理界面)
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
exports.transformRawQuestion = transformRawQuestion;
exports.loadQuestionsFromJson = loadQuestionsFromJson;
exports.generateQuestionsFromRaw = generateQuestionsFromRaw;
exports.uploadQuestionsToFirestore = uploadQuestionsToFirestore;
exports.getQuestionStats = getQuestionStats;
const admin = __importStar(require("firebase-admin"));
const db = admin.firestore();
// Difficulty colors for placeholder images (matches upload-complete-questions.mjs)
const DIFFICULTY_COLORS = {
    EASY: ['86efac', '4ade80', '22c55e', '16a34a'],
    MEDIUM: ['fde047', 'facc15', 'eab308', 'ca8a04'],
    HARD: ['fca5a5', 'f87171', 'ef4444', 'dc2626']
};
/**
 * Generate placeholder image URL (same as upload-complete-questions.mjs)
 */
function getPlaceholderUrl(text, difficulty, index) {
    const colors = DIFFICULTY_COLORS[difficulty];
    const color = colors[index % colors.length];
    const shortText = text.substring(0, 25).replace(/[^a-zA-Z0-9 ]/g, '');
    const encodedText = encodeURIComponent(shortText);
    return `https://placehold.co/512x512/${color}/000000?text=${encodedText}`;
}
/**
 * Shuffle array using Fisher-Yates algorithm
 */
function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}
/**
 * Transform raw question from complete-questions.json to GeneratedQuestion format
 * This is the same logic used in upload-complete-questions.mjs and populate-duel-questions.html
 */
function transformRawQuestion(raw) {
    // Create all options (1 correct + 3 distractors)
    const allOptions = [
        { description: raw.correct, isCorrect: true },
        ...raw.distractors.map(d => ({ description: d, isCorrect: false }))
    ];
    // Shuffle options
    const shuffled = shuffleArray(allOptions);
    const correctIndex = shuffled.findIndex(item => item.isCorrect);
    // Generate images array
    const images = shuffled.map((item, idx) => ({
        url: getPlaceholderUrl(item.description, raw.difficulty, idx),
        isCorrect: item.isCorrect,
        prompt: item.description,
        index: idx,
        generatedAt: new Date().toISOString()
    }));
    return {
        questionId: raw.id,
        stem: raw.stem,
        category: raw.category,
        images,
        correctIndex,
        metadata: {
            imageGenModel: 'placeholder-v2',
            imageSize: '512x512',
            stylePrompt: 'Educational trivia image',
            generatedBy: 'QuestionGenerationAgent'
        }
    };
}
/**
 * Load questions from complete-questions.json
 * Used by: upload-complete-questions.mjs, populate-duel-questions.html
 */
async function loadQuestionsFromJson(jsonPath) {
    const logs = [];
    logs.push(`[QuestionGenerationAgent] Loading from: ${jsonPath}`);
    try {
        // In Cloud Functions environment, use dynamic import or fs
        const fs = await Promise.resolve().then(() => __importStar(require('fs')));
        const content = fs.readFileSync(jsonPath, 'utf-8');
        const questions = JSON.parse(content);
        logs.push(`[QuestionGenerationAgent] Loaded ${questions.length} questions`);
        // Validate distribution
        const easy = questions.filter(q => q.difficulty === 'EASY').length;
        const medium = questions.filter(q => q.difficulty === 'MEDIUM').length;
        const hard = questions.filter(q => q.difficulty === 'HARD').length;
        logs.push(`[QuestionGenerationAgent] Distribution: ${easy} EASY, ${medium} MEDIUM, ${hard} HARD`);
        return {
            success: true,
            data: questions,
            logs
        };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logs.push(`[QuestionGenerationAgent] ERROR: ${errorMessage}`);
        return {
            success: false,
            error: errorMessage,
            logs
        };
    }
}
/**
 * Generate questions from raw data and prepare for Firestore
 * Same logic as upload-complete-questions.mjs
 */
async function generateQuestionsFromRaw(rawQuestions) {
    const logs = [];
    logs.push(`[QuestionGenerationAgent] Transforming ${rawQuestions.length} questions`);
    try {
        const questions = rawQuestions.map(raw => transformRawQuestion(raw));
        logs.push(`[QuestionGenerationAgent] Generated ${questions.length} questions`);
        return {
            success: true,
            data: questions,
            logs
        };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logs.push(`[QuestionGenerationAgent] ERROR: ${errorMessage}`);
        return {
            success: false,
            error: errorMessage,
            logs
        };
    }
}
/**
 * Upload questions to Firestore
 * Same logic as upload-complete-questions.mjs
 */
async function uploadQuestionsToFirestore(questions, difficulty) {
    const logs = [];
    logs.push(`[QuestionGenerationAgent] Uploading ${questions.length} questions to Firestore`);
    try {
        const batchSize = 50;
        let batch = db.batch();
        let count = 0;
        for (const question of questions) {
            const questionDoc = {
                ...question,
                difficulty,
                createdAt: new Date().toISOString()
            };
            const docRef = db.collection('duel_questions').doc(question.questionId);
            batch.set(docRef, questionDoc);
            count++;
            if (count % batchSize === 0) {
                await batch.commit();
                batch = db.batch();
                logs.push(`[QuestionGenerationAgent] Uploaded ${count}/${questions.length}...`);
            }
        }
        // Commit remaining
        if (count % batchSize !== 0) {
            await batch.commit();
        }
        logs.push(`[QuestionGenerationAgent] Successfully uploaded ${count} questions`);
        return {
            success: true,
            data: count,
            logs
        };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logs.push(`[QuestionGenerationAgent] ERROR: ${errorMessage}`);
        return {
            success: false,
            error: errorMessage,
            logs
        };
    }
}
/**
 * Get question count from Firestore
 */
async function getQuestionStats() {
    const logs = [];
    logs.push('[QuestionGenerationAgent] Fetching question stats');
    try {
        const snapshot = await db.collection('duel_questions').get();
        const stats = {
            total: 0,
            easy: 0,
            medium: 0,
            hard: 0,
            byCategory: {}
        };
        snapshot.forEach(doc => {
            const data = doc.data();
            stats.total++;
            if (data.difficulty === 'EASY')
                stats.easy++;
            else if (data.difficulty === 'MEDIUM')
                stats.medium++;
            else if (data.difficulty === 'HARD')
                stats.hard++;
            stats.byCategory[data.category] = (stats.byCategory[data.category] || 0) + 1;
        });
        logs.push(`[QuestionGenerationAgent] Stats: ${stats.total} total (${stats.easy}E, ${stats.medium}M, ${stats.hard}H)`);
        return {
            success: true,
            data: stats,
            logs
        };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logs.push(`[QuestionGenerationAgent] ERROR: ${errorMessage}`);
        return {
            success: false,
            error: errorMessage,
            logs
        };
    }
}
//# sourceMappingURL=questionGenerationAgent.js.map