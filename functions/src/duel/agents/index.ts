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

// Types
export * from './types';

// Question Generation Agent
export {
  transformRawQuestion,
  loadQuestionsFromJson,
  generateQuestionsFromRaw,
  uploadQuestionsToFirestore,
  getQuestionStats
} from './questionGenerationAgent';

// Question Validation Agent
export {
  validateStructure,
  validateRawQuestion,
  validateQuestion,
  batchValidateRawQuestions
} from './questionValidationAgent';

// Question Sequencing Agent
export {
  createMatchSequence,
  getRandomSequence,
  generateAllSequences,
  storeSequencesToFirestore,
  getSequenceStats
} from './questionSequencingAgent';
