"use strict";
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
/**
 * Delete news_locations documents with error:true
 * Then we can re-run initialize-news-locations.ts to retry them
 *
 * Run: npx ts-node src/scripts/delete-error-news-locations.ts
 */
const admin = __importStar(require("firebase-admin"));
async function deleteErrorNewsLocations() {
    console.log('🗑️  Deleting error news locations...\n');
    if (!admin.apps.length) {
        admin.initializeApp({
            projectId: 'stanseproject',
            databaseURL: 'https://stanseproject.firebaseio.com'
        });
    }
    const db = admin.firestore();
    try {
        // Find all news_locations with error:true
        const errorSnapshot = await db.collection('news_locations')
            .where('error', '==', true)
            .get();
        console.log(`Found ${errorSnapshot.size} error records to delete\n`);
        let deleted = 0;
        for (const doc of errorSnapshot.docs) {
            const newsId = doc.data().newsId;
            console.log(`🗑️  Deleting ${newsId.substring(0, 10)}...`);
            await doc.ref.delete();
            deleted++;
        }
        console.log(`\n✅ Deleted ${deleted} error records`);
        console.log('Now you can run: npx ts-node src/scripts/initialize-news-locations.ts');
    }
    catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}
deleteErrorNewsLocations()
    .then(() => process.exit(0))
    .catch(error => {
    console.error('💥 Failed:', error);
    process.exit(1);
});
//# sourceMappingURL=delete-error-news-locations.js.map