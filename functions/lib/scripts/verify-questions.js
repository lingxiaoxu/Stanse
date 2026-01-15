"use strict";
/**
 * Verify that questions are stored correctly in Firestore
 * Checks that correctIndex matches isCorrect in options array
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
const admin = __importStar(require("firebase-admin"));
if (!admin.apps.length) {
    admin.initializeApp({
        projectId: 'stanseproject',
    });
}
const db = admin.firestore();
async function main() {
    console.log('🔍 Verifying question data...\n');
    const snapshot = await db.collection('duel_questions').limit(5).get();
    for (const doc of snapshot.docs) {
        const data = doc.data();
        console.log(`\n📋 ${data.questionId}: ${data.stem}`);
        console.log(`   correctIndex: ${data.correctIndex}`);
        console.log(`   Options:`);
        data.options.forEach((opt, idx) => {
            const marker = opt.isCorrect ? '✓' : ' ';
            const indexMarker = idx === data.correctIndex ? '←' : ' ';
            console.log(`     [${marker}] ${idx} ${indexMarker} ${opt.prompt.substring(0, 60)}...`);
        });
        console.log(`   Images array:`);
        data.images.forEach((img, idx) => {
            const marker = img.isCorrect ? '✓' : ' ';
            console.log(`     [${marker}] ${idx} url: "${img.url}" prompt: ${img.prompt.substring(0, 40)}...`);
        });
        // Verify correctness
        const correctOption = data.options[data.correctIndex];
        const correctImage = data.images[data.correctIndex];
        if (!correctOption.isCorrect) {
            console.log(`   ❌ ERROR: Option at correctIndex ${data.correctIndex} has isCorrect=false!`);
        }
        else {
            console.log(`   ✅ Correct option properly marked`);
        }
        if (!correctImage.isCorrect) {
            console.log(`   ❌ ERROR: Image at correctIndex ${data.correctIndex} has isCorrect=false!`);
        }
        else {
            console.log(`   ✅ Correct image properly marked`);
        }
    }
    console.log('\n═══════════════════════════════════════════════════════════');
    process.exit(0);
}
main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
//# sourceMappingURL=verify-questions.js.map