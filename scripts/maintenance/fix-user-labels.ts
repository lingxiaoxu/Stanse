#!/usr/bin/env node
/**
 * Fix User Labels to Match StanceType
 *
 * This script updates all user profiles to ensure their label matches
 * the actual stanceType calculated from their coordinates.
 *
 * Run: npx tsx scripts/maintenance/fix-user-labels.ts
 * Or: node --loader tsx scripts/maintenance/fix-user-labels.ts
 */

import admin from 'firebase-admin';

// StanceType definition (copied from sp500Companies.ts to avoid import issues)
type StanceType =
  | 'progressive-globalist'
  | 'progressive-nationalist'
  | 'socialist-libertarian'
  | 'socialist-nationalist'
  | 'capitalist-globalist'
  | 'capitalist-nationalist'
  | 'conservative-globalist'
  | 'conservative-nationalist';

// getStanceType logic (copied from sp500Companies.ts)
function getStanceType(economic: number, social: number, diplomatic: number): StanceType {
  const isLeftEcon = economic < 0;
  const isLibSocial = social > 0;
  const isGlobalDiplo = diplomatic > 0;

  if (isLeftEcon && isLibSocial && isGlobalDiplo) return 'progressive-globalist';
  if (isLeftEcon && isLibSocial && !isGlobalDiplo) return 'progressive-nationalist';
  if (isLeftEcon && !isLibSocial && isGlobalDiplo) return 'socialist-libertarian';
  if (isLeftEcon && !isLibSocial && !isGlobalDiplo) return 'socialist-nationalist';
  if (!isLeftEcon && isLibSocial && isGlobalDiplo) return 'capitalist-globalist';
  if (!isLeftEcon && isLibSocial && !isGlobalDiplo) return 'capitalist-nationalist';
  if (!isLeftEcon && !isLibSocial && isGlobalDiplo) return 'conservative-globalist';
  return 'conservative-nationalist';
}

// Initialize Firebase Admin
try {
  admin.app();
} catch (e) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'stanseproject'
  });
}

const db = admin.firestore();

// StanceType to friendly label mapping
const STANCE_TYPE_LABELS: Record<StanceType, string> = {
  'progressive-globalist': 'Progressive Globalist',
  'progressive-nationalist': 'Progressive Nationalist',
  'socialist-libertarian': 'Socialist Libertarian',
  'socialist-nationalist': 'Socialist Nationalist',
  'capitalist-globalist': 'Capitalist Globalist',
  'capitalist-nationalist': 'Capitalist Nationalist',
  'conservative-globalist': 'Conservative Globalist',
  'conservative-nationalist': 'Conservative Nationalist'
};

/**
 * Extract nationality prefix from current label
 * e.g., "Chinese American Progressive Globalist" → "Chinese American"
 */
function extractNationalityPrefix(currentLabel: string): string {
  // Remove known stance types from the label
  for (const stanceLabel of Object.values(STANCE_TYPE_LABELS)) {
    if (currentLabel.endsWith(stanceLabel)) {
      return currentLabel.substring(0, currentLabel.length - stanceLabel.length).trim();
    }
  }
  // If no known stance type found, return empty (user has simple label)
  return '';
}

/**
 * Fix labels for all users
 */
async function fixUserLabels() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔧 Fixing User Labels to Match StanceType');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  try {
    const usersRef = db.collection('users');
    const snapshot = await usersRef.get();

    console.log(`Found ${snapshot.size} users to check`);
    console.log('');

    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const doc of snapshot.docs) {
      const userData = doc.data();
      const userId = doc.id;

      // Skip users without coordinates
      if (!userData.coordinates || !userData.coordinates.economic || !userData.coordinates.social || !userData.coordinates.diplomatic) {
        console.log(`⏭️  Skipped ${userId}: No coordinates`);
        skippedCount++;
        continue;
      }

      const { economic, social, diplomatic, label: currentLabel } = userData.coordinates;

      // Calculate actual stanceType
      const actualStanceType = getStanceType(economic, social, diplomatic);
      const correctPersonaType = STANCE_TYPE_LABELS[actualStanceType];

      // Extract nationality prefix from current label
      const nationalityPrefix = extractNationalityPrefix(currentLabel || '');

      // Build correct label
      const correctLabel = nationalityPrefix
        ? `${nationalityPrefix} ${correctPersonaType}`
        : correctPersonaType;

      // Check if update needed
      if (currentLabel === correctLabel) {
        console.log(`✅ ${userId}: Label already correct ("${currentLabel}")`);
        skippedCount++;
        continue;
      }

      console.log(`🔧 ${userId}:`);
      console.log(`   Coordinates: econ=${economic}, social=${social}, diplo=${diplomatic}`);
      console.log(`   StanceType: ${actualStanceType}`);
      console.log(`   Current Label: "${currentLabel}"`);
      console.log(`   Correct Label: "${correctLabel}"`);

      try {
        // Update the label
        await usersRef.doc(userId).update({
          'coordinates.label': correctLabel,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log(`   ✅ Updated successfully`);
        updatedCount++;

      } catch (error: any) {
        console.error(`   ❌ Error updating: ${error.message}`);
        errorCount++;
      }

      console.log('');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Summary:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Total users: ${snapshot.size}`);
    console.log(`Updated: ${updatedCount}`);
    console.log(`Skipped: ${skippedCount}`);
    console.log(`Errors: ${errorCount}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  } catch (error: any) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

// Run the script
fixUserLabels()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
