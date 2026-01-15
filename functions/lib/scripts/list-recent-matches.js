"use strict";
/**
 * List Recent Matches
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
async function listMatches() {
    const snapshot = await db.collection('duel_matches')
        .orderBy('createdAt', 'desc')
        .limit(5)
        .get();
    console.log(`\n📋 Last 5 matches:\n`);
    for (const doc of snapshot.docs) {
        const data = doc.data();
        console.log(`Match: ${doc.id}`);
        console.log(`  Created: ${data.createdAt}`);
        console.log(`  Status: ${data.status}`);
        console.log(`  Winner: ${data.result.winner || 'pending'}`);
        console.log(`  Score: ${data.result.scoreA} - ${data.result.scoreB}`);
        console.log(`  Players: ${data.players.A.personaLabel} vs ${data.players.B.personaLabel}`);
        console.log('');
    }
    process.exit(0);
}
listMatches().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
//# sourceMappingURL=list-recent-matches.js.map