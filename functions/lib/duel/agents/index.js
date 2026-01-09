"use strict";
/**
 * DUEL Arena Agents
 *
 * Three-agent architecture for question management:
 *
 * 1. Question Generation Agent (questionGenerationAgent.ts)
 *    - 从 complete-questions.json 加载问题数据
 *    - 转换为 Firestore 格式并上传
 *    - 配合: upload-complete-questions.mjs, populate-duel-questions.html
 *
 * 2. Question Validation Agent (questionValidationAgent.ts)
 *    - 结构校验：4 个选项、1 个正确答案、选项不重复
 *    - 校验 JSON 格式和 Firestore 格式
 *    - 配合: upload-complete-questions.mjs, populate-duel-questions.html
 *
 * 3. Question Sequencing Agent (questionSequencingAgent.ts)
 *    - 组合题目序列（30s: 40题, 45s: 60题）
 *    - 允许重复使用 150 个问题
 *    - 支持三种策略：FLAT、ASCENDING、DESCENDING
 *    - 配合: generate-sequences.ts
 *
 * 现有数据源：
 * - /scripts/duel/complete-questions.json - 150 个问题数据
 * - /scripts/duel/upload-complete-questions.mjs - CLI 上传脚本
 * - /scripts/duel/generate-sequences.ts - 序列生成脚本
 * - /populate-duel-questions.html - Web 管理界面
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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSequenceStats = exports.storeSequencesToFirestore = exports.generateAllSequences = exports.getRandomSequence = exports.createMatchSequence = exports.batchValidateRawQuestions = exports.validateQuestion = exports.validateRawQuestion = exports.validateStructure = exports.getQuestionStats = exports.uploadQuestionsToFirestore = exports.generateQuestionsFromRaw = exports.loadQuestionsFromJson = exports.transformRawQuestion = void 0;
// Types
__exportStar(require("./types"), exports);
// Question Generation Agent
var questionGenerationAgent_1 = require("./questionGenerationAgent");
Object.defineProperty(exports, "transformRawQuestion", { enumerable: true, get: function () { return questionGenerationAgent_1.transformRawQuestion; } });
Object.defineProperty(exports, "loadQuestionsFromJson", { enumerable: true, get: function () { return questionGenerationAgent_1.loadQuestionsFromJson; } });
Object.defineProperty(exports, "generateQuestionsFromRaw", { enumerable: true, get: function () { return questionGenerationAgent_1.generateQuestionsFromRaw; } });
Object.defineProperty(exports, "uploadQuestionsToFirestore", { enumerable: true, get: function () { return questionGenerationAgent_1.uploadQuestionsToFirestore; } });
Object.defineProperty(exports, "getQuestionStats", { enumerable: true, get: function () { return questionGenerationAgent_1.getQuestionStats; } });
// Question Validation Agent
var questionValidationAgent_1 = require("./questionValidationAgent");
Object.defineProperty(exports, "validateStructure", { enumerable: true, get: function () { return questionValidationAgent_1.validateStructure; } });
Object.defineProperty(exports, "validateRawQuestion", { enumerable: true, get: function () { return questionValidationAgent_1.validateRawQuestion; } });
Object.defineProperty(exports, "validateQuestion", { enumerable: true, get: function () { return questionValidationAgent_1.validateQuestion; } });
Object.defineProperty(exports, "batchValidateRawQuestions", { enumerable: true, get: function () { return questionValidationAgent_1.batchValidateRawQuestions; } });
// Question Sequencing Agent
var questionSequencingAgent_1 = require("./questionSequencingAgent");
Object.defineProperty(exports, "createMatchSequence", { enumerable: true, get: function () { return questionSequencingAgent_1.createMatchSequence; } });
Object.defineProperty(exports, "getRandomSequence", { enumerable: true, get: function () { return questionSequencingAgent_1.getRandomSequence; } });
Object.defineProperty(exports, "generateAllSequences", { enumerable: true, get: function () { return questionSequencingAgent_1.generateAllSequences; } });
Object.defineProperty(exports, "storeSequencesToFirestore", { enumerable: true, get: function () { return questionSequencingAgent_1.storeSequencesToFirestore; } });
Object.defineProperty(exports, "getSequenceStats", { enumerable: true, get: function () { return questionSequencingAgent_1.getSequenceStats; } });
//# sourceMappingURL=index.js.map