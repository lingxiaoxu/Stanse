"use strict";
/**
 * Question Validation Agent
 *
 * 职责：
 * - 对每一道生成题目进行结构校验
 * - 检查是否包含一个明确的名词主干
 * - 检查是否恰好包含 4 个图片选项
 * - 检查是否只有 1 个正确答案
 * - 检查是否 3 个错误选项均不正确
 * - 检查是否四个选项彼此不重复
 * - 在校验通过后，为题目打上难度标签：EASY/MEDIUM/HARD
 *
 * 配合使用：
 * - /scripts/duel/upload-complete-questions.mjs (上传前校验)
 * - /populate-duel-questions.html (Web界面校验)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateStructure = validateStructure;
exports.validateRawQuestion = validateRawQuestion;
exports.validateQuestion = validateQuestion;
exports.batchValidateRawQuestions = batchValidateRawQuestions;
/**
 * Validate question structure
 * 结构校验：检查问题格式是否正确
 */
function validateStructure(question) {
    const errors = [];
    const warnings = [];
    // Check 1: 是否包含一个明确的名词主干
    if (!question.stem || question.stem.trim().length === 0) {
        errors.push('Missing question stem (noun/concept)');
    }
    else if (question.stem.length < 3) {
        warnings.push('Question stem is very short');
    }
    // Check 2: 是否恰好包含 4 个图片选项
    if (!question.images || !Array.isArray(question.images)) {
        errors.push('Images array is missing or invalid');
    }
    else if (question.images.length !== 4) {
        errors.push(`Expected exactly 4 images, got ${question.images.length}`);
    }
    // Check 3: 是否只有 1 个正确答案
    const correctCount = question.images?.filter(img => img.isCorrect).length || 0;
    if (correctCount === 0) {
        errors.push('No correct answer marked');
    }
    else if (correctCount > 1) {
        errors.push(`Multiple correct answers marked (${correctCount})`);
    }
    // Check 4: 是否 3 个错误选项均不正确
    const incorrectCount = question.images?.filter(img => !img.isCorrect).length || 0;
    if (incorrectCount !== 3) {
        errors.push(`Expected 3 incorrect options, got ${incorrectCount}`);
    }
    // Check 5: correctIndex 是否匹配 isCorrect 标记
    if (question.images && question.images.length === 4) {
        const markedCorrectIndex = question.images.findIndex(img => img.isCorrect);
        if (markedCorrectIndex !== question.correctIndex) {
            errors.push(`correctIndex (${question.correctIndex}) doesn't match isCorrect flag (${markedCorrectIndex})`);
        }
    }
    // Check 6: 四个选项是否彼此不重复 (by prompt)
    if (question.images) {
        const prompts = question.images.map(img => img.prompt.toLowerCase().trim());
        const uniquePrompts = new Set(prompts);
        if (uniquePrompts.size !== prompts.length) {
            errors.push('Duplicate image options detected');
        }
    }
    // Check 7: 所有图片是否有有效 URL
    if (question.images) {
        for (const img of question.images) {
            if (!img.url || !img.url.startsWith('http')) {
                errors.push(`Invalid image URL: ${img.url}`);
            }
        }
    }
    // Check 8: 是否有有效的 category
    const validCategories = ['FLAGS', 'LANDMARKS', 'ANIMALS', 'FOOD', 'LOGOS', 'SYMBOLS'];
    if (!validCategories.includes(question.category)) {
        errors.push(`Invalid category: ${question.category}`);
    }
    return {
        isValid: errors.length === 0,
        errors,
        warnings
    };
}
/**
 * Validate question from complete-questions.json format
 * 校验原始 JSON 格式的问题
 */
function validateRawQuestion(raw) {
    const errors = [];
    const warnings = [];
    // Check id
    if (!raw.id || raw.id.trim().length === 0) {
        errors.push('Missing question id');
    }
    // Check stem
    if (!raw.stem || raw.stem.trim().length === 0) {
        errors.push('Missing question stem');
    }
    // Check correct answer
    if (!raw.correct || raw.correct.trim().length === 0) {
        errors.push('Missing correct answer');
    }
    // Check distractors (exactly 3)
    if (!raw.distractors || !Array.isArray(raw.distractors)) {
        errors.push('Distractors must be an array');
    }
    else if (raw.distractors.length !== 3) {
        errors.push(`Expected 3 distractors, got ${raw.distractors.length}`);
    }
    else {
        // Check each distractor is non-empty
        raw.distractors.forEach((d, i) => {
            if (!d || d.trim().length === 0) {
                errors.push(`Distractor ${i + 1} is empty`);
            }
        });
    }
    // Check all options are unique
    if (raw.correct && raw.distractors) {
        const allOptions = [raw.correct, ...raw.distractors].map(o => o.toLowerCase().trim());
        const unique = new Set(allOptions);
        if (unique.size !== allOptions.length) {
            errors.push('Duplicate options detected (correct answer and distractors must all be unique)');
        }
    }
    // Check category
    const validCategories = ['FLAGS', 'LANDMARKS', 'ANIMALS', 'FOOD', 'LOGOS', 'SYMBOLS'];
    if (!validCategories.includes(raw.category)) {
        errors.push(`Invalid category: ${raw.category}`);
    }
    // Check difficulty
    const validDifficulties = ['EASY', 'MEDIUM', 'HARD'];
    if (!validDifficulties.includes(raw.difficulty)) {
        errors.push(`Invalid difficulty: ${raw.difficulty}`);
    }
    return {
        isValid: errors.length === 0,
        errors,
        warnings
    };
}
/**
 * Question Validation Agent - Main Function
 * 校验问题并添加验证信息
 */
async function validateQuestion(question, difficulty) {
    const logs = [];
    logs.push(`[QuestionValidationAgent] Validating question: ${question.questionId}`);
    try {
        // Validate structure
        const validation = validateStructure(question);
        logs.push(`[QuestionValidationAgent] Structure check: ${validation.isValid ? 'PASSED' : 'FAILED'}`);
        if (validation.errors.length > 0) {
            logs.push(`[QuestionValidationAgent] Errors: ${validation.errors.join(', ')}`);
        }
        if (validation.warnings.length > 0) {
            logs.push(`[QuestionValidationAgent] Warnings: ${validation.warnings.join(', ')}`);
        }
        if (!validation.isValid) {
            return {
                success: false,
                error: `Validation failed: ${validation.errors.join('; ')}`,
                logs
            };
        }
        // Create validated question
        const validatedQuestion = {
            ...question,
            difficulty,
            validation: {
                validatedAt: new Date().toISOString(),
                validatedBy: 'QuestionValidationAgent',
                structureCheck: true,
                uniquenessCheck: true,
                correctnessCheck: true
            },
            createdAt: new Date().toISOString()
        };
        logs.push(`[QuestionValidationAgent] Successfully validated question ${question.questionId}`);
        return {
            success: true,
            data: validatedQuestion,
            logs
        };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logs.push(`[QuestionValidationAgent] ERROR: ${errorMessage}`);
        return {
            success: false,
            error: errorMessage,
            logs
        };
    }
}
/**
 * Batch validate raw questions from complete-questions.json
 * 批量校验 JSON 文件中的原始问题
 */
async function batchValidateRawQuestions(rawQuestions) {
    const logs = [];
    logs.push(`[QuestionValidationAgent] Batch validating ${rawQuestions.length} raw questions`);
    const result = {
        valid: 0,
        invalid: 0,
        errors: []
    };
    for (const raw of rawQuestions) {
        const validation = validateRawQuestion(raw);
        if (validation.isValid) {
            result.valid++;
        }
        else {
            result.invalid++;
            result.errors.push({
                id: raw.id,
                errors: validation.errors
            });
        }
    }
    logs.push(`[QuestionValidationAgent] Result: ${result.valid} valid, ${result.invalid} invalid`);
    if (result.errors.length > 0) {
        logs.push(`[QuestionValidationAgent] First 3 errors:`);
        result.errors.slice(0, 3).forEach(e => {
            logs.push(`  - ${e.id}: ${e.errors.join(', ')}`);
        });
    }
    return {
        success: result.invalid === 0,
        data: result,
        logs
    };
}
//# sourceMappingURL=questionValidationAgent.js.map