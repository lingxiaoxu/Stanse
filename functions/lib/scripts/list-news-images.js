"use strict";
/**
 * List all news image URLs by category
 * Shows the curated Unsplash images used as backup/fallback images
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
    admin.initializeApp();
}
const db = admin.firestore();
// Import the actual image URLs from geminiService (updated with better quality images)
const CATEGORY_IMAGES = {
    'POLITICS': [
        'https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?w=800&h=450&fit=crop', // US Capitol
        'https://images.unsplash.com/photo-1541872703-74c5e44368f9?w=800&h=450&fit=crop', // White House
        'https://images.unsplash.com/photo-1582213782179-e0d53f98f2ca?w=800&h=450&fit=crop', // Capitol dome
        'https://images.unsplash.com/photo-1555848962-6e79363ec58f?w=800&h=450&fit=crop', // Voting ballot
        'https://images.unsplash.com/photo-1432847712612-926caafaa802?w=800&h=450&fit=crop', // Government building
        'https://images.unsplash.com/photo-1577495508326-19a1b3cf65b7?w=800&h=450&fit=crop', // American flag
        'https://images.unsplash.com/photo-1551135049-8a33b5883817?w=800&h=450&fit=crop', // Political debate
        'https://images.unsplash.com/photo-1591117207239-788bf8de6c3b?w=800&h=450&fit=crop', // Political rally
        'https://images.unsplash.com/photo-1569098644584-210bcd375b59?w=800&h=450&fit=crop', // Legislation
        'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&h=450&fit=crop', // Political campaign
        'https://images.unsplash.com/photo-1593115057655-e2091616193a?w=800&h=450&fit=crop', // Election
        'https://images.unsplash.com/photo-1509021436665-8f07dbf5bf1d?w=800&h=450&fit=crop', // Democracy
    ],
    'TECH': [
        'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&h=450&fit=crop', // Circuit board
        'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=800&h=450&fit=crop', // Cybersecurity
        'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=800&h=450&fit=crop', // Data matrix
        'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&h=450&fit=crop', // Global network
        'https://images.unsplash.com/photo-1488590528505-98d2b5aba04b?w=800&h=450&fit=crop', // Laptop code
        'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=800&h=450&fit=crop', // AI robot
        'https://images.unsplash.com/photo-1558346490-a72e53ae2d4f?w=800&h=450&fit=crop', // Server room
        'https://images.unsplash.com/photo-1563986768609-322da13575f3?w=800&h=450&fit=crop', // Data center
        'https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=800&h=450&fit=crop', // Team coding
        'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800&h=450&fit=crop', // Smart city
        'https://images.unsplash.com/photo-1535223289827-42f1e9919769?w=800&h=450&fit=crop', // Technology
        'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=800&h=450&fit=crop', // Tech meeting
        'https://images.unsplash.com/photo-1504639725590-34d0984388bd?w=800&h=450&fit=crop', // Developer
    ],
    'MILITARY': [
        'https://images.unsplash.com/photo-1579912437766-7896df6d3cd3?w=800&h=450&fit=crop', // Aircraft carrier
        'https://images.unsplash.com/photo-1569242840510-9fe6f0112cee?w=800&h=450&fit=crop', // Fighter jet
        'https://images.unsplash.com/photo-1562564055-71e051d33c19?w=800&h=450&fit=crop', // Naval vessel
        'https://images.unsplash.com/photo-1571172965836-3619c8ad7565?w=800&h=450&fit=crop', // Military personnel
        'https://images.unsplash.com/photo-1551076805-e1869033e561?w=800&h=450&fit=crop', // Helicopter
        'https://images.unsplash.com/photo-1577495508326-19a1b3cf65b7?w=800&h=450&fit=crop', // Air force
        'https://images.unsplash.com/photo-1569083689865-f7e0d1d17043?w=800&h=450&fit=crop', // Fleet
        'https://images.unsplash.com/photo-1585751119635-f32be5af44b3?w=800&h=450&fit=crop', // Military tech
        'https://images.unsplash.com/photo-1606318313656-b2e8f1a8e1d1?w=800&h=450&fit=crop', // Defense
        'https://images.unsplash.com/photo-1544636331-e26879cd4d9b?w=800&h=450&fit=crop', // Military equipment
        'https://images.unsplash.com/photo-1593941707882-a5bba14938c7?w=800&h=450&fit=crop', // Drone
        'https://images.unsplash.com/photo-1580752300992-559f8e6a7b36?w=800&h=450&fit=crop', // Armed forces
    ],
    'WORLD': [
        'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&h=450&fit=crop', // Earth from space
        'https://images.unsplash.com/photo-1526778548025-fa2f459cd5c1?w=800&h=450&fit=crop', // World map
        'https://images.unsplash.com/photo-1524661135-423995f22d0b?w=800&h=450&fit=crop', // International flags
        'https://images.unsplash.com/photo-1478860409698-8707f313ee8b?w=800&h=450&fit=crop', // Globe
        'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=800&h=450&fit=crop', // UN conference
        'https://images.unsplash.com/photo-1589519160732-57fc498494f8?w=800&h=450&fit=crop', // Airport
        'https://images.unsplash.com/photo-1503149779833-1de50ebe5f8a?w=800&h=450&fit=crop', // Cityscape
        'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=800&h=450&fit=crop', // Global business
        'https://images.unsplash.com/photo-1464746133101-a2c3f88e0dd9?w=800&h=450&fit=crop', // Bridge
        'https://images.unsplash.com/photo-1488085061387-422e29b40080?w=800&h=450&fit=crop', // Travel
        'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=800&h=450&fit=crop', // Summit
        'https://images.unsplash.com/photo-1541888946425-d81bb19240f5?w=800&h=450&fit=crop', // World news
        'https://images.unsplash.com/photo-1569163139394-de4798aa62b6?w=800&h=450&fit=crop', // United Nations
    ],
    'BUSINESS': [
        'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800&h=450&fit=crop', // Skyscrapers
        'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&h=450&fit=crop', // Business charts
        'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=800&h=450&fit=crop', // Analytics
        'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800&h=450&fit=crop', // Stock market
        'https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=800&h=450&fit=crop', // City business
        'https://images.unsplash.com/photo-1444653614773-995cb1ef9efa?w=800&h=450&fit=crop', // Wall Street
        'https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=800&h=450&fit=crop', // Corporate
        'https://images.unsplash.com/photo-1559526324-593bc073d938?w=800&h=450&fit=crop', // Business deal
        'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=800&h=450&fit=crop', // Office work
        'https://images.unsplash.com/photo-1553729459-efe14ef6055d?w=800&h=450&fit=crop', // Finance
        'https://images.unsplash.com/photo-1579532537598-459ecdaf39cc?w=800&h=450&fit=crop', // Banking
        'https://images.unsplash.com/photo-1563013544-824ae1b704d3?w=800&h=450&fit=crop', // Investment
        'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=800&h=450&fit=crop', // Market
    ],
};
const DEFAULT_IMAGES = [
    'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=800&h=450&fit=crop',
    'https://images.unsplash.com/photo-1495020689067-958852a7765e?w=800&h=450&fit=crop',
    'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=800&h=450&fit=crop',
    'https://images.unsplash.com/photo-1586339949216-35c2747cc36d?w=800&h=450&fit=crop',
    'https://images.unsplash.com/photo-1563986768609-322da13575f3?w=800&h=450&fit=crop',
    'https://images.unsplash.com/photo-1563986768494-4dee2763ff3f?w=800&h=450&fit=crop',
    'https://images.unsplash.com/photo-1508921340878-ba53e1f016ec?w=800&h=450&fit=crop',
    'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&h=450&fit=crop',
];
async function listImages() {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('📸 NEWS IMAGE LIBRARY - CURATED UNSPLASH IMAGES');
    console.log('═══════════════════════════════════════════════════════════════\n');
    // List all backup images by category
    let totalImages = 0;
    for (const [category, images] of Object.entries(CATEGORY_IMAGES)) {
        console.log(`\n🏷️  ${category} (${images.length} images):`);
        console.log('─'.repeat(60));
        images.forEach((url, index) => {
            console.log(`  ${index + 1}. ${url}`);
        });
        totalImages += images.length;
    }
    console.log(`\n\n🏷️  DEFAULT FALLBACK (${DEFAULT_IMAGES.length} images):`);
    console.log('─'.repeat(60));
    DEFAULT_IMAGES.forEach((url, index) => {
        console.log(`  ${index + 1}. ${url}`);
    });
    totalImages += DEFAULT_IMAGES.length;
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log(`📊 TOTAL: ${totalImages} curated Unsplash images`);
    console.log('═══════════════════════════════════════════════════════════════\n');
    // Now check cached news in Firestore
    console.log('📰 Checking cached news in Firestore...\n');
    const snapshot = await db.collection('news_cache')
        .orderBy('timestamp', 'desc')
        .limit(20)
        .get();
    if (snapshot.empty) {
        console.log('No cached news found in Firestore');
        return;
    }
    console.log(`Found ${snapshot.size} cached news items:\n`);
    const imageUsage = {};
    snapshot.forEach(doc => {
        const data = doc.data();
        const imageUrl = data.imageUrl || 'No image';
        // Count image usage
        if (imageUrl !== 'No image') {
            const imageType = imageUrl.startsWith('data:') ? 'SVG Fallback' :
                imageUrl.startsWith('https://images.unsplash.com') ? 'Unsplash' :
                    imageUrl.startsWith('https://storage.googleapis.com') ? 'Firebase Storage' :
                        'Other';
            imageUsage[imageType] = (imageUsage[imageType] || 0) + 1;
        }
        console.log(`Title: ${data.title?.slice(0, 60)}...`);
        console.log(`Category: ${data.category}`);
        console.log(`Image: ${imageUrl.startsWith('data:') ? 'SVG Fallback' : imageUrl.startsWith('https://images.unsplash.com') ? imageUrl.slice(0, 80) + '...' : imageUrl}`);
        console.log(`Timestamp: ${data.timestamp}`);
        console.log('');
    });
    console.log('\n📊 Image Usage Statistics:');
    console.log('─'.repeat(60));
    Object.entries(imageUsage).forEach(([type, count]) => {
        console.log(`  ${type}: ${count} news items`);
    });
    process.exit(0);
}
listImages().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
//# sourceMappingURL=list-news-images.js.map