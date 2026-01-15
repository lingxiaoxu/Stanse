"use strict";
/**
 * Clear all documents from duel_questions collection
 *
 * Usage:
 *   cd functions
 *   npm run build
 *   node lib/scripts/clear-duel-questions.js
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
// Initialize Firebase Admin
if (!admin.apps.length) {
    admin.initializeApp({
        projectId: 'stanseproject',
    });
}
const db = admin.firestore();
/**
 * Delete all documents in a collection in batches
 */
async function deleteCollection(collectionPath, batchSize = 100) {
    const collectionRef = db.collection(collectionPath);
    const query = collectionRef.limit(batchSize);
    return new Promise((resolve, reject) => {
        deleteQueryBatch(query, resolve).catch(reject);
    });
    async function deleteQueryBatch(query, resolve) {
        const snapshot = await query.get();
        const batchSize = snapshot.size;
        if (batchSize === 0) {
            // No more documents to delete
            resolve(0);
            return;
        }
        // Delete documents in a batch
        const batch = db.batch();
        snapshot.docs.forEach((doc) => {
            batch.delete(doc.ref);
        });
        await batch.commit();
        console.log(`  Deleted ${batchSize} documents`);
        // Recurse on the next batch
        process.nextTick(() => {
            deleteQueryBatch(query, resolve);
        });
    }
}
async function main() {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  Clear DUEL Questions Collection');
    console.log('═══════════════════════════════════════════════════════════\n');
    // Get count first
    const snapshot = await db.collection('duel_questions').count().get();
    const totalCount = snapshot.data().count;
    console.log(`📊 Found ${totalCount} documents in duel_questions collection`);
    if (totalCount === 0) {
        console.log('✅ Collection is already empty');
        process.exit(0);
    }
    console.log('\n🗑️  Deleting all documents...\n');
    await deleteCollection('duel_questions');
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log(`  ✅ Successfully cleared duel_questions collection`);
    console.log('  Next step: Run populate-duel-questions.js to reload data');
    console.log('═══════════════════════════════════════════════════════════');
    process.exit(0);
}
main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
//# sourceMappingURL=clear-duel-questions.js.map