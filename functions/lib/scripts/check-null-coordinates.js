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
 * Check for null coordinates in breaking_news_locations
 */
const admin = __importStar(require("firebase-admin"));
async function checkNullCoordinates() {
    if (!admin.apps.length) {
        admin.initializeApp({
            projectId: 'stanseproject',
            databaseURL: 'https://stanseproject.firebaseio.com'
        });
    }
    const db = admin.firestore();
    const snapshot = await db.collection('breaking_news_locations').get();
    console.log(`Total breaking news locations: ${snapshot.size}\n`);
    let nullCount = 0;
    const nullDocs = [];
    snapshot.docs.forEach(doc => {
        const data = doc.data();
        if (!data.coordinates ||
            data.coordinates.latitude === null ||
            data.coordinates.longitude === null ||
            data.coordinates.latitude === undefined ||
            data.coordinates.longitude === undefined) {
            nullCount++;
            nullDocs.push(doc.id);
            console.log(`❌ ${doc.id.substring(0, 12)}: country=${data.country || 'null'}, coords=${JSON.stringify(data.coordinates)}`);
        }
    });
    console.log(`\n📊 Summary:`);
    console.log(`   Total: ${snapshot.size}`);
    console.log(`   With null coordinates: ${nullCount}`);
    console.log(`   Valid: ${snapshot.size - nullCount}`);
    if (nullDocs.length > 0) {
        console.log(`\n🗑️  Null coordinate IDs:`);
        console.log(nullDocs.join(', '));
    }
}
checkNullCoordinates().then(() => process.exit(0));
//# sourceMappingURL=check-null-coordinates.js.map