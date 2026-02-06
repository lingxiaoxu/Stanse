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
// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
    admin.initializeApp({
        projectId: 'stanseproject'
    });
}
/**
 * Delete a user from Firebase Authentication by email
 * Usage: npm run delete-user <email>
 */
async function deleteUserByEmail(email) {
    try {
        console.log(`Looking for user with email: ${email}`);
        // Get user by email
        const userRecord = await admin.auth().getUserByEmail(email);
        console.log(`Found user: ${userRecord.uid}`);
        // Delete user from Authentication
        await admin.auth().deleteUser(userRecord.uid);
        console.log(`✅ Successfully deleted user ${email} from Firebase Authentication`);
        // Also delete from Firestore if exists
        try {
            await admin.firestore().collection('users').doc(userRecord.uid).delete();
            console.log(`✅ Successfully deleted user document from Firestore`);
        }
        catch (firestoreError) {
            console.log(`⚠️  No Firestore document found (already deleted)`);
        }
    }
    catch (error) {
        if (error.code === 'auth/user-not-found') {
            console.log(`❌ User ${email} not found in Firebase Authentication`);
        }
        else {
            console.error(`❌ Error deleting user:`, error);
        }
    }
    process.exit(0);
}
// Get email from command line arguments
const email = process.argv[2];
if (!email) {
    console.error('Usage: npm run delete-user <email>');
    process.exit(1);
}
deleteUserByEmail(email);
//# sourceMappingURL=delete-auth-user.js.map