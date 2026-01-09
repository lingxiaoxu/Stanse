#!/usr/bin/env ts-node
"use strict";
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
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
var app_1 = require("firebase-admin/app");
var firestore_1 = require("firebase-admin/firestore");
var secret_manager_1 = require("@google-cloud/secret-manager");
var genai_1 = require("@google/genai");
var fs = __importStar(require("fs"));
var path = __importStar(require("path"));
// Initialize Firebase Admin
var serviceAccountPath = path.join(__dirname, '../../service-account-key.json');
if (fs.existsSync(serviceAccountPath)) {
    (0, app_1.initializeApp)({ credential: (0, app_1.cert)(serviceAccountPath) });
}
else {
    (0, app_1.initializeApp)();
}
var db = (0, firestore_1.getFirestore)();
var secretClient = new secret_manager_1.SecretManagerServiceClient();
var PROJECT_ID = 'gen-lang-client-0960644135';
var GEMINI_SECRET_NAME = 'gemini-api-key';
var geminiApiKey = null;
/**
 * Get Gemini API key from Google Secret Manager
 * CRITICAL: Never hardcode API keys
 */
function getGeminiApiKey() {
    return __awaiter(this, void 0, void 0, function () {
        var version, payload, error_1;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (geminiApiKey)
                        return [2 /*return*/, geminiApiKey];
                    _c.label = 1;
                case 1:
                    _c.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, secretClient.accessSecretVersion({
                            name: "projects/".concat(PROJECT_ID, "/secrets/").concat(GEMINI_SECRET_NAME, "/versions/latest"),
                        })];
                case 2:
                    version = (_c.sent())[0];
                    payload = (_b = (_a = version.payload) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.toString();
                    if (!payload)
                        throw new Error('Empty payload from Secret Manager');
                    geminiApiKey = payload;
                    console.log('✅ Gemini API key loaded from Secret Manager');
                    return [2 /*return*/, payload];
                case 3:
                    error_1 = _c.sent();
                    console.error('❌ Failed to load API key from Secret Manager:', error_1);
                    throw new Error('Cannot proceed without API key from Secret Manager');
                case 4: return [2 /*return*/];
            }
        });
    });
}
// Question distribution plan
var QUESTION_PLAN = [
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
function generateQuestion(category, difficulty, index, apiKey) {
    return __awaiter(this, void 0, void 0, function () {
        var ai, prompt_1, result, text, lines, stemMatch, correctMatch, d1Match, d2Match, d3Match, error_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    ai = new genai_1.GoogleGenAI({ apiKey: apiKey });
                    prompt_1 = "Generate a ".concat(difficulty.toLowerCase(), " difficulty ").concat(category.toLowerCase(), " picture trivia question.\n\nCategory: ").concat(category, "\nDifficulty: ").concat(difficulty, "\n\nRequirements:\n1. Return a question stem (the thing to identify)\n2. Provide 1 CORRECT description (for image generation)\n3. Provide 3 DISTRACTOR descriptions (similar but WRONG)\n4. Distractors must be visually similar to correct answer but factually different\n5. All 4 options must be distinct\n\nFormat your response EXACTLY as:\nSTEM: [question text]\nCORRECT: [detailed image description]\nDISTRACTOR1: [detailed image description]\nDISTRACTOR2: [detailed image description]\nDISTRACTOR3: [detailed image description]\n\nExample for FLAGS/EASY:\nSTEM: Flag of Japan\nCORRECT: Japanese flag with large red circle centered on white background\nDISTRACTOR1: Flag of Bangladesh with red circle offset left on green background\nDISTRACTOR2: Flag of Palau with yellow circle offset left on light blue background\nDISTRACTOR3: Flag of South Korea with yin-yang symbol and trigrams\n\nNow generate for ").concat(category, "/").concat(difficulty, ":");
                    return [4 /*yield*/, ai.models.generateContent({
                            model: 'gemini-2.0-flash-exp',
                            contents: prompt_1
                        })];
                case 1:
                    result = _a.sent();
                    text = result.text || '';
                    lines = text.split('\n').map(function (l) { return l.trim(); }).filter(function (l) { return l; });
                    stemMatch = lines.find(function (l) { return l.startsWith('STEM:'); });
                    correctMatch = lines.find(function (l) { return l.startsWith('CORRECT:'); });
                    d1Match = lines.find(function (l) { return l.startsWith('DISTRACTOR1:'); });
                    d2Match = lines.find(function (l) { return l.startsWith('DISTRACTOR2:'); });
                    d3Match = lines.find(function (l) { return l.startsWith('DISTRACTOR3:'); });
                    if (!stemMatch || !correctMatch || !d1Match || !d2Match || !d3Match) {
                        console.warn("  \u26A0\uFE0F  Incomplete response for ".concat(category, "/").concat(difficulty, "/").concat(index));
                        return [2 /*return*/, null];
                    }
                    return [2 /*return*/, {
                            stem: stemMatch.replace('STEM:', '').trim(),
                            correct: correctMatch.replace('CORRECT:', '').trim(),
                            distractors: [
                                d1Match.replace('DISTRACTOR1:', '').trim(),
                                d2Match.replace('DISTRACTOR2:', '').trim(),
                                d3Match.replace('DISTRACTOR3:', '').trim()
                            ]
                        }];
                case 2:
                    error_2 = _a.sent();
                    console.error("  \u274C Failed to generate question:", error_2);
                    return [2 /*return*/, null];
                case 3: return [2 /*return*/];
            }
        });
    });
}
/**
 * Generate placeholder image (base64 SVG)
 */
function generatePlaceholderImage(description) {
    var encoded = encodeURIComponent(description.substring(0, 40));
    return "data:image/svg+xml,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"512\" height=\"512\"><rect fill=\"%23f0f0f0\" width=\"512\" height=\"512\"/><text x=\"50%\" y=\"50%\" text-anchor=\"middle\" dy=\".3em\" font-size=\"16\" fill=\"%23666\">".concat(encoded, "</text></svg>");
}
/**
 * Main generation function
 */
function generateAllQuestions() {
    return __awaiter(this, void 0, void 0, function () {
        var apiKey, ai, questionId, totalGenerated, _i, QUESTION_PLAN_1, spec, i, qid, questionData, images, shuffled, correctIndex, questionDoc, easyCount, mediumCount, hardCount;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log('🎲 Generating 150-Question Bank for DUEL Arena\n');
                    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
                    return [4 /*yield*/, getGeminiApiKey()];
                case 1:
                    apiKey = _a.sent();
                    ai = new genai_1.GoogleGenAI({ apiKey: apiKey });
                    questionId = 1;
                    totalGenerated = 0;
                    _i = 0, QUESTION_PLAN_1 = QUESTION_PLAN;
                    _a.label = 2;
                case 2:
                    if (!(_i < QUESTION_PLAN_1.length)) return [3 /*break*/, 9];
                    spec = QUESTION_PLAN_1[_i];
                    console.log("\n\uD83D\uDCC1 ".concat(spec.category, " / ").concat(spec.difficulty, " (").concat(spec.count, " questions)"));
                    i = 0;
                    _a.label = 3;
                case 3:
                    if (!(i < spec.count)) return [3 /*break*/, 8];
                    qid = "q".concat(String(questionId).padStart(3, '0'));
                    console.log("  [".concat(totalGenerated + 1, "/150] ").concat(qid, ": Generating..."));
                    return [4 /*yield*/, generateQuestion(spec.category, spec.difficulty, i, apiKey)];
                case 4:
                    questionData = _a.sent();
                    if (!questionData) {
                        console.log("  \u274C Skipping ".concat(qid));
                        return [3 /*break*/, 7];
                    }
                    console.log("    \u2713 Stem: ".concat(questionData.stem));
                    images = __spreadArray([
                        { url: generatePlaceholderImage(questionData.correct), isCorrect: true, prompt: questionData.correct }
                    ], questionData.distractors.map(function (d) { return ({
                        url: generatePlaceholderImage(d),
                        isCorrect: false,
                        prompt: d
                    }); }), true);
                    shuffled = images
                        .map(function (value) { return ({ value: value, sort: Math.random() }); })
                        .sort(function (a, b) { return a.sort - b.sort; })
                        .map(function (_a, idx) {
                        var value = _a.value;
                        return (__assign(__assign({}, value), { index: idx, generatedAt: new Date().toISOString() }));
                    });
                    correctIndex = shuffled.findIndex(function (img) { return img.isCorrect; });
                    questionDoc = {
                        questionId: qid,
                        stem: questionData.stem,
                        category: spec.category,
                        difficulty: spec.difficulty,
                        images: shuffled,
                        correctIndex: correctIndex,
                        createdAt: new Date().toISOString(),
                        metadata: {
                            imageGenModel: 'placeholder', // Will be 'imagen-3' in production
                            imageSize: '512x512',
                            stylePrompt: 'Clean, professional, recognizable',
                            generatedBy: 'gemini-2.0-flash-exp'
                        }
                    };
                    // Write to Firestore
                    return [4 /*yield*/, db.collection('duel_questions').doc(qid).set(questionDoc)];
                case 5:
                    // Write to Firestore
                    _a.sent();
                    console.log("    \u2705 Saved to Firestore: ".concat(qid));
                    questionId++;
                    totalGenerated++;
                    // Rate limiting
                    return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 500); })];
                case 6:
                    // Rate limiting
                    _a.sent();
                    _a.label = 7;
                case 7:
                    i++;
                    return [3 /*break*/, 3];
                case 8:
                    _i++;
                    return [3 /*break*/, 2];
                case 9:
                    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                    console.log("\u2705 Generated ".concat(totalGenerated, " questions"));
                    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
                    easyCount = QUESTION_PLAN.filter(function (s) { return s.difficulty === 'EASY'; }).reduce(function (sum, s) { return sum + s.count; }, 0);
                    mediumCount = QUESTION_PLAN.filter(function (s) { return s.difficulty === 'MEDIUM'; }).reduce(function (sum, s) { return sum + s.count; }, 0);
                    hardCount = QUESTION_PLAN.filter(function (s) { return s.difficulty === 'HARD'; }).reduce(function (sum, s) { return sum + s.count; }, 0);
                    console.log('📊 Distribution:');
                    console.log("   EASY: ".concat(easyCount, " (target: 40)"));
                    console.log("   MEDIUM: ".concat(mediumCount, " (target: 70)"));
                    console.log("   HARD: ".concat(hardCount, " (target: 40)"));
                    console.log("   TOTAL: ".concat(easyCount + mediumCount + hardCount, "\n"));
                    return [2 /*return*/];
            }
        });
    });
}
function main() {
    return __awaiter(this, void 0, void 0, function () {
        var error_3;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, generateAllQuestions()];
                case 1:
                    _a.sent();
                    console.log('🎉 Question generation complete!');
                    console.log('\nNext step: Run generate-sequences.ts to create match sequences\n');
                    process.exit(0);
                    return [3 /*break*/, 3];
                case 2:
                    error_3 = _a.sent();
                    console.error('❌ Fatal error:', error_3);
                    process.exit(1);
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    });
}
main();
