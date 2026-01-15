"use strict";
/**
 * Collect all generated image URLs from Firestore
 * Output in format ready for geminiService.ts replacement
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
async function collectImages() {
    console.log('📸 Collecting generated images from Firestore...\n');
    const categories = ['POLITICS', 'TECH', 'MILITARY', 'WORLD', 'BUSINESS', 'DEFAULT'];
    const imagesByCategory = {};
    for (const category of categories) {
        console.log(`\n📁 ${category}:`);
        const imagesSnapshot = await db
            .collection('news_image_generation')
            .doc(category)
            .collection('images')
            .get();
        const urls = [];
        imagesSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.imageUrl) {
                urls.push(data.imageUrl);
                console.log(`  ✓ ${doc.id}`);
            }
        });
        imagesByCategory[category] = urls;
        console.log(`  Total: ${urls.length} images`);
    }
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('📊 SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════\n');
    let totalImages = 0;
    for (const [cat, urls] of Object.entries(imagesByCategory)) {
        console.log(`${cat}: ${urls.length} images`);
        totalImages += urls.length;
    }
    console.log(`\nTotal: ${totalImages} images\n`);
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('📋 CODE FOR geminiService.ts');
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log('const CATEGORY_IMAGES: Record<string, string[]> = {');
    for (const [category, urls] of Object.entries(imagesByCategory)) {
        console.log(`  '${category}': [`);
        urls.forEach(url => {
            console.log(`    '${url}',`);
        });
        console.log(`  ],`);
    }
    console.log('};');
    process.exit(0);
}
collectImages().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
//# sourceMappingURL=collect-generated-images.js.map