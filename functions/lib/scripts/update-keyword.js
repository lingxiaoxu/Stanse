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
const admin = __importStar(require("firebase-admin"));
admin.initializeApp({ projectId: 'stanseproject' });
const db = admin.firestore();
async function updateKeyword() {
    console.log('🔄 Replacing presidential_debate with midterm_election...\n');
    const docRef = db.collection('news_image_generation').doc('POLITICS');
    const doc = await docRef.get();
    if (!doc.exists) {
        console.log('❌ POLITICS document not found');
        process.exit(1);
    }
    const data = doc.data();
    const keywords = data.keywords || [];
    const index = keywords.findIndex((k) => k.keyword === 'presidential_debate');
    if (index === -1) {
        console.log('❌ presidential_debate not found');
        process.exit(1);
    }
    console.log(`Found at index ${index}:`, keywords[index]);
    keywords[index] = {
        keyword: 'midterm_election',
        description: 'Congressional midterm elections determining control of House and Senate chambers'
    };
    console.log('Replaced with:', keywords[index]);
    await docRef.update({
        keywords: keywords,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log('\n✅ Successfully updated POLITICS keywords!');
    process.exit(0);
}
updateKeyword().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
//# sourceMappingURL=update-keyword.js.map