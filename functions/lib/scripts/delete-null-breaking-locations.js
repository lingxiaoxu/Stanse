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
 * Delete breaking_news_locations with null coordinates
 */
const admin = __importStar(require("firebase-admin"));
async function deleteNullCoordinates() {
    console.log('🗑️  Deleting breaking news locations with null coordinates...\n');
    if (!admin.apps.length) {
        admin.initializeApp({
            projectId: 'stanseproject',
            databaseURL: 'https://stanseproject.firebaseio.com'
        });
    }
    const db = admin.firestore();
    try {
        const snapshot = await db.collection('breaking_news_locations').get();
        console.log(`Checking ${snapshot.size} breaking news locations...\n`);
        let deleted = 0;
        for (const doc of snapshot.docs) {
            const data = doc.data();
            const coords = data.coordinates;
            // Check if coordinates are null or have null lat/lng
            if (!coords || coords.latitude === null || coords.longitude === null) {
                console.log(`🗑️  Deleting ${doc.id.substring(0, 12)}: country=${data.country || 'null'}`);
                await doc.ref.delete();
                deleted++;
            }
        }
        console.log(`\n✅ Deleted ${deleted} records with null coordinates`);
    }
    catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}
deleteNullCoordinates()
    .then(() => process.exit(0))
    .catch(error => {
    console.error('💥 Failed:', error);
    process.exit(1);
});
//# sourceMappingURL=delete-null-breaking-locations.js.map