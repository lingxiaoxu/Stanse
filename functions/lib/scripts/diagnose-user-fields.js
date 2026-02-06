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
 * 诊断用户字段：查看用户实际有哪些location相关字段
 *
 * Run: npx ts-node src/scripts/diagnose-user-fields.ts
 */
const admin = __importStar(require("firebase-admin"));
async function diagnoseUserFields() {
    console.log('🔍 Diagnosing user fields...\n');
    if (!admin.apps.length) {
        admin.initializeApp({
            projectId: 'stanseproject',
            databaseURL: 'https://stanseproject.firebaseio.com'
        });
    }
    const db = admin.firestore();
    try {
        const usersSnapshot = await db.collection('users').limit(20).get();
        console.log(`Found ${usersSnapshot.size} users\n`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        let usersWithOnboarding = 0;
        let usersWithCoordinates = 0;
        let usersWithLocationInOnboarding = 0;
        usersSnapshot.docs.forEach((doc, index) => {
            const userId = doc.id;
            const userData = doc.data();
            console.log(`[${index + 1}] User: ${userId.substring(0, 12)}`);
            console.log(`    All fields: ${Object.keys(userData).join(', ')}`);
            // Check for various location-related fields
            if (userData.birthCountry) {
                console.log(`    ✅ birthCountry: ${userData.birthCountry}`);
            }
            if (userData.currentCountry) {
                console.log(`    ✅ currentCountry: ${userData.currentCountry}`);
            }
            if (userData.currentState) {
                console.log(`    ✅ currentState: ${userData.currentState}`);
            }
            // Check coordinates object
            if (userData.coordinates) {
                console.log(`    ✅ coordinates: ${JSON.stringify(userData.coordinates)}`);
                usersWithCoordinates++;
            }
            // Check onboarding object
            if (userData.onboarding) {
                console.log(`    ✅ onboarding object exists`);
                console.log(`       Fields: ${Object.keys(userData.onboarding).join(', ')}`);
                usersWithOnboarding++;
                // Check for location in onboarding
                if (userData.onboarding.birthCountry) {
                    console.log(`       → birthCountry: ${userData.onboarding.birthCountry}`);
                    usersWithLocationInOnboarding++;
                }
                if (userData.onboarding.currentCountry) {
                    console.log(`       → currentCountry: ${userData.onboarding.currentCountry}`);
                }
                if (userData.onboarding.state) {
                    console.log(`       → state: ${userData.onboarding.state}`);
                }
            }
            console.log('');
        });
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        console.log('📊 Summary:');
        console.log(`   Users with 'onboarding' object: ${usersWithOnboarding}`);
        console.log(`   Users with 'coordinates' field: ${usersWithCoordinates}`);
        console.log(`   Users with location in onboarding: ${usersWithLocationInOnboarding}`);
    }
    catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}
diagnoseUserFields()
    .then(() => process.exit(0))
    .catch(error => {
    console.error('💥 Failed:', error);
    process.exit(1);
});
//# sourceMappingURL=diagnose-user-fields.js.map