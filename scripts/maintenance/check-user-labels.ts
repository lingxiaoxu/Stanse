#!/usr/bin/env node
/**
 * Check User Labels Consistency
 *
 * This script checks if user labels match their actual stanceType
 * without modifying any data.
 *
 * Run: npx tsx scripts/maintenance/check-user-labels.ts
 * Or: node --loader tsx scripts/maintenance/check-user-labels.ts
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
 */
function extractNationalityPrefix(currentLabel: string): string {
  for (const stanceLabel of Object.values(STANCE_TYPE_LABELS)) {
    if (currentLabel.endsWith(stanceLabel)) {
      return currentLabel.substring(0, currentLabel.length - stanceLabel.length).trim();
    }
  }
  return '';
}

/**
 * Check labels for all users
 */
async function checkUserLabels() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 Checking User Label Consistency (Read-Only)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  try {
    const usersRef = db.collection('users');
    const snapshot = await usersRef.get();

    console.log(`Found ${snapshot.size} users`);
    console.log('');

    let correctCount = 0;
    let incorrectCount = 0;
    let noCoordinatesCount = 0;

    const issues: Array<{userId: string; current: string; expected: string; stanceType: string}> = [];

    for (const doc of snapshot.docs) {
      const userData = doc.data();
      const userId = doc.id;

      // Skip users without coordinates
      if (!userData.coordinates ||
          userData.coordinates.economic === undefined ||
          userData.coordinates.social === undefined ||
          userData.coordinates.diplomatic === undefined) {
        console.log(`⏭️  ${userId}: No valid coordinates`);
        noCoordinatesCount++;
        continue;
      }

      const { economic, social, diplomatic, label: currentLabel } = userData.coordinates;

      // Calculate actual stanceType
      const actualStanceType = getStanceType(economic, social, diplomatic);
      const correctPersonaType = STANCE_TYPE_LABELS[actualStanceType];

      // Extract nationality prefix
      const nationalityPrefix = extractNationalityPrefix(currentLabel || '');

      // Build correct label
      const correctLabel = nationalityPrefix
        ? `${nationalityPrefix} ${correctPersonaType}`
        : correctPersonaType;

      // Check consistency
      if (currentLabel === correctLabel) {
        console.log(`✅ ${userId}:`);
        console.log(`   Label: "${currentLabel}"`);
        console.log(`   StanceType: ${actualStanceType}`);
        console.log(`   Status: CORRECT ✅`);
        correctCount++;
      } else {
        console.log(`❌ ${userId}:`);
        console.log(`   Coordinates: econ=${economic}, social=${social}, diplo=${diplomatic}`);
        console.log(`   StanceType: ${actualStanceType}`);
        console.log(`   Current Label: "${currentLabel}"`);
        console.log(`   Expected Label: "${correctLabel}"`);
        console.log(`   Status: MISMATCH ❌`);
        incorrectCount++;

        issues.push({
          userId,
          current: currentLabel || '(empty)',
          expected: correctLabel,
          stanceType: actualStanceType
        });
      }

      console.log('');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Summary:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Total users: ${snapshot.size}`);
    console.log(`✅ Correct: ${correctCount}`);
    console.log(`❌ Incorrect: ${incorrectCount}`);
    console.log(`⏭️  No coordinates: ${noCoordinatesCount}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    if (issues.length > 0) {
      console.log('');
      console.log('🔧 Issues to fix:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      issues.forEach(issue => {
        console.log(`User: ${issue.userId}`);
        console.log(`  StanceType: ${issue.stanceType}`);
        console.log(`  Current: "${issue.current}"`);
        console.log(`  Expected: "${issue.expected}"`);
        console.log('');
      });
      console.log('Run fix-user-labels.ts to update all users.');
    }

  } catch (error: any) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

// Run the script
checkUserLabels()
  .then(() => {
    console.log('✅ Check completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Check failed:', error);
    process.exit(1);
  });
