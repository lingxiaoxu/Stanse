import * as admin from 'firebase-admin';

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
async function deleteUserByEmail(email: string) {
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
    } catch (firestoreError) {
      console.log(`⚠️  No Firestore document found (already deleted)`);
    }

  } catch (error: any) {
    if (error.code === 'auth/user-not-found') {
      console.log(`❌ User ${email} not found in Firebase Authentication`);
    } else {
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
