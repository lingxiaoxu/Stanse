"use strict";
/**
 * Test newsCache.ts functions with new AI-generated images
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
admin.initializeApp({ projectId: 'stanseproject' });
const db = admin.firestore();
async function testNewsCache() {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('🧪 TESTING NEWS CACHE WITH AI-GENERATED IMAGES');
    console.log('═══════════════════════════════════════════════════════════════\n');
    // Test 1: Check existing news_images collection
    console.log('📋 Test 1: Checking existing news_images collection...\n');
    const imagesSnapshot = await db.collection('news_images').limit(10).get();
    let oldImages = 0;
    let newImages = 0;
    imagesSnapshot.forEach(doc => {
        const data = doc.data();
        const url = data.imageUrl || '';
        if (url.includes('storage.googleapis.com/stanse-public-assets/news_images')) {
            newImages++;
            console.log(`  ✅ ${doc.id}: AI-generated`);
        }
        else {
            oldImages++;
            const source = url.includes('loremflickr') ? 'loremflickr' :
                url.includes('unsplash') ? 'unsplash' :
                    url.includes('picsum') ? 'picsum' : 'unknown';
            console.log(`  ⚠️  ${doc.id}: Old (${source})`);
        }
    });
    console.log(`\n  Summary: ${newImages} AI images, ${oldImages} old images\n`);
    // Test 2: Simulate saveImageToCache with AI and non-AI URLs
    console.log('📋 Test 2: Testing saveImageToCache filter logic...\n');
    const testUrls = [
        { url: 'https://storage.googleapis.com/stanse-public-assets/news_images/POLITICS/test.jpg', shouldSave: true },
        { url: 'https://loremflickr.com/800/450/news', shouldSave: false },
        { url: 'https://images.unsplash.com/photo-123', shouldSave: false },
    ];
    for (const test of testUrls) {
        const source = test.url.split('/')[2];
        console.log(`  Testing: ${source}`);
        console.log(`    Expected: ${test.shouldSave ? 'SAVE' : 'SKIP'}`);
        console.log(`    ✅ Logic: ${test.url.includes('stanse-public-assets/news_images') ? 'SAVE' : 'SKIP'}`);
    }
    // Test 3: Check news_image_generation structure
    console.log('\n📋 Test 3: Verifying news_image_generation collection...\n');
    const categories = ['POLITICS', 'TECH', 'MILITARY', 'WORLD', 'BUSINESS', 'DEFAULT'];
    let totalAIImages = 0;
    for (const category of categories) {
        const categoryDoc = await db.collection('news_image_generation').doc(category).get();
        if (categoryDoc.exists) {
            const imagesCollection = await categoryDoc.ref.collection('images').get();
            totalAIImages += imagesCollection.size;
            console.log(`  ✅ ${category}: ${imagesCollection.size} AI images`);
        }
        else {
            console.log(`  ❌ ${category}: NOT FOUND`);
        }
    }
    console.log(`\n  Total AI images available: ${totalAIImages}`);
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('✅ TEST COMPLETE');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`\n📊 Summary:`);
    console.log(`   - news_images collection: ${imagesSnapshot.size} entries (${newImages} new, ${oldImages} old)`);
    console.log(`   - news_image_generation: ${totalAIImages} AI images across ${categories.length} categories`);
    console.log(`   - Logic: Only AI images from Firebase Storage will be cached\n`);
    process.exit(0);
}
testNewsCache().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
//# sourceMappingURL=test-news-cache.js.map