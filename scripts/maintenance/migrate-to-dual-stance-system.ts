#!/usr/bin/env node
/**
 * Migrate to Dual StanceType System
 *
 * This script migrates user profiles to the new dual stanceType system:
 * 1. displayLabel (AI-generated, shown to users) - e.g., "Indian-American Statist Nationalist"
 * 2. coreStanceType (canonical, for rankings) - e.g., "socialist-nationalist"
 * 3. nationalityPrefix (extracted/inferred) - e.g., "Indian-American"
 *
 * Run: npx tsx scripts/maintenance/migrate-to-dual-stance-system.ts
 */

import admin from 'firebase-admin';

// StanceType definition
type StanceType =
  | 'progressive-globalist'
  | 'progressive-nationalist'
  | 'socialist-libertarian'
  | 'socialist-nationalist'
  | 'capitalist-globalist'
  | 'capitalist-nationalist'
  | 'conservative-globalist'
  | 'conservative-nationalist';

// getStanceType logic
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
 * Infer nationality prefix from demographics
 */
function inferNationalityFromDemographics(
  birthCountry?: string,
  currentCountry?: string
): string {
  if (!birthCountry || !currentCountry) return '';

  // Normalize country names
  const birth = birthCountry.toLowerCase();
  const current = currentCountry.toLowerCase();

  // If same country, just use country name
  if (birth === current) {
    return capitalizeCountry(birth);
  }

  // If different, create hyphenated identity
  // e.g., "India" + "United States" → "Indian-American"
  const birthAdjective = getCountryAdjective(birth);
  const currentAdjective = getCountryAdjective(current);

  if (birthAdjective && currentAdjective) {
    return `${birthAdjective}-${currentAdjective}`;
  }

  return '';
}

/**
 * Convert country name to adjective
 */
function getCountryAdjective(country: string): string {
  const mapping: Record<string, string> = {
    'united states': 'American',
    'usa': 'American',
    'us': 'American',
    'america': 'American',
    'china': 'Chinese',
    'india': 'Indian',
    'mexico': 'Mexican',
    'canada': 'Canadian',
    'united kingdom': 'British',
    'uk': 'British',
    'france': 'French',
    'germany': 'German',
    'spain': 'Spanish',
    'italy': 'Italian',
    'japan': 'Japanese',
    'korea': 'Korean',
    'south korea': 'Korean',
    'vietnam': 'Vietnamese',
    'philippines': 'Filipino',
    'brazil': 'Brazilian',
    'argentina': 'Argentine',
    'russia': 'Russian',
    'poland': 'Polish',
    'israel': 'Israeli',
    'egypt': 'Egyptian',
    'nigeria': 'Nigerian',
    'south africa': 'South African',
    'australia': 'Australian',
    'new zealand': 'New Zealander'
  };

  return mapping[country.toLowerCase()] || capitalizeCountry(country);
}

/**
 * Capitalize country name
 */
function capitalizeCountry(country: string): string {
  return country.split(' ').map(word =>
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ');
}

/**
 * Extract nationality prefix from existing label
 */
function extractNationalityFromLabel(currentLabel: string): string {
  if (!currentLabel) return '';

  const words = currentLabel.split(/\s+/);

  const personaKeywords = [
    'Socialist', 'Statist', 'Capitalist', 'Libertarian', 'Conservative',
    'Progressive', 'Liberal', 'Authoritarian', 'Populist', 'Nationalist',
    'Globalist', 'Internationalist', 'Isolationist', 'Centrist', 'Moderate',
    'Democrat', 'Republican', 'Neoconservative', 'Paleoconservative',
    'Communitarian', 'Pragmatic', 'Traditional', 'Contrarian'
  ];

  // Find where persona type starts
  let prefixEndIndex = -1;
  for (let i = 0; i < words.length; i++) {
    if (personaKeywords.some(keyword => words[i].includes(keyword))) {
      prefixEndIndex = i;
      break;
    }
  }

  if (prefixEndIndex > 0) {
    return words.slice(0, prefixEndIndex).join(' ');
  }

  return '';
}

/**
 * Migrate users to dual stanceType system
 */
async function migrateUsers() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔄 Migrating to Dual StanceType System');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  try {
    const usersRef = db.collection('users');
    const snapshot = await usersRef.get();

    console.log(`Found ${snapshot.size} users to migrate`);
    console.log('');

    let updatedCount = 0;
    let skippedCount = 0;

    for (const doc of snapshot.docs) {
      const userData = doc.data();
      const userId = doc.id;

      if (!userData.coordinates) {
        console.log(`⏭️  Skipped ${userId}: No coordinates`);
        skippedCount++;
        continue;
      }

      const { economic, social, diplomatic, label: currentLabel } = userData.coordinates;

      // Calculate core stanceType from coordinates
      const coreStanceType = getStanceType(economic, social, diplomatic);
      const canonicalPersona = STANCE_TYPE_LABELS[coreStanceType];

      // Try to extract nationality from existing label first
      let nationalityPrefix = extractNationalityFromLabel(currentLabel || '');

      // If not found in label, infer from demographics
      if (!nationalityPrefix && userData.onboarding?.demographics) {
        const { birthCountry, currentCountry } = userData.onboarding.demographics;
        nationalityPrefix = inferNationalityFromDemographics(birthCountry, currentCountry);
      }

      // Build display label (preserve AI-generated if it exists, otherwise use canonical)
      let displayLabel = currentLabel || canonicalPersona;

      // If we have nationality but it's not in the label, add it
      if (nationalityPrefix && !displayLabel.startsWith(nationalityPrefix)) {
        // Extract just the persona type from current label
        const personaType = extractPersonaType(displayLabel);
        displayLabel = `${nationalityPrefix} ${personaType || canonicalPersona}`;
      }

      // Build update object
      const updates: any = {
        'coordinates.coreStanceType': coreStanceType,
        'coordinates.displayLabel': displayLabel,
        'coordinates.label': displayLabel, // Keep label in sync with displayLabel
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      if (nationalityPrefix) {
        updates['coordinates.nationalityPrefix'] = nationalityPrefix;
      }

      // Ensure tourCompleted has all languages (preserve existing true values, add missing as false)
      const currentTourCompleted = userData.tourCompleted || {};
      const completeTourCompleted = {
        EN: currentTourCompleted.EN || false,
        ZH: currentTourCompleted.ZH || false,
        JA: currentTourCompleted.JA || false,
        FR: currentTourCompleted.FR || false,
        ES: currentTourCompleted.ES || false
      };
      updates['tourCompleted'] = completeTourCompleted;

      console.log(`🔄 ${userId} (${userData.email}):`);
      console.log(`   Coordinates: econ=${economic}, social=${social}, diplo=${diplomatic}`);
      console.log(`   Core StanceType: ${coreStanceType}`);
      console.log(`   Nationality: "${nationalityPrefix || 'None'}"`);
      console.log(`   Display Label: "${displayLabel}"`);
      console.log(`   Previous Label: "${currentLabel}"`);
      console.log(`   Tour Completed: ${JSON.stringify(completeTourCompleted)}`);

      try {
        await usersRef.doc(userId).update(updates);
        console.log(`   ✅ Migrated successfully`);
        updatedCount++;
      } catch (error: any) {
        console.error(`   ❌ Error: ${error.message}`);
      }

      console.log('');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Migration Summary:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Total users: ${snapshot.size}`);
    console.log(`Migrated: ${updatedCount}`);
    console.log(`Skipped: ${skippedCount}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  } catch (error: any) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

/**
 * Extract persona type from label (remove nationality prefix)
 */
function extractPersonaType(label: string): string {
  const words = label.split(/\s+/);

  const personaKeywords = [
    'Socialist', 'Statist', 'Capitalist', 'Libertarian', 'Conservative',
    'Progressive', 'Liberal', 'Authoritarian', 'Populist', 'Nationalist',
    'Globalist', 'Internationalist',
    'Communitarian', 'Pragmatic', 'Traditional', 'Contrarian'
  ];

  // Find where persona type starts
  for (let i = 0; i < words.length; i++) {
    if (personaKeywords.some(keyword => words[i].includes(keyword))) {
      return words.slice(i).join(' ');
    }
  }

  return label; // Return full label if no keyword found
}

// Run the script
migrateUsers()
  .then(() => {
    console.log('✅ Migration completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  });
