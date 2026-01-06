#!/usr/bin/env node
/**
 * Initialize Promotion Codes
 *
 * This script generates 50 random 8-character promotion codes and saves them to Firebase.
 * Each code can be used once to get one free billing cycle (to next month's 1st).
 *
 * Run: npx tsx scripts/subscription/init-promo-codes.ts
 */

import admin from 'firebase-admin';

try {
  admin.app();
} catch (e) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'stanseproject'
  });
}

const db = admin.firestore();

/**
 * Generate a random 8-character promotion code
 * Excludes confusing characters (0, O, I, 1, L)
 */
function generatePromoCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 8 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join('');
}

/**
 * Check if code already exists in database
 */
async function codeExists(code: string): Promise<boolean> {
  const snapshot = await db.collection('promotion_codes')
    .where('code', '==', code)
    .limit(1)
    .get();

  return !snapshot.empty;
}

/**
 * Generate promotion codes
 */
async function initPromoCodes() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎟️  Initializing Promotion Codes');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  const TARGET_COUNT = 50;
  const codesRef = db.collection('promotion_codes');

  // Check existing codes
  const existingSnapshot = await codesRef.get();
  console.log(`Found ${existingSnapshot.size} existing codes`);
  console.log('');

  if (existingSnapshot.size >= TARGET_COUNT) {
    console.log(`✅ Already have ${existingSnapshot.size} codes. No need to generate more.`);
    console.log('');
    console.log('Existing codes:');
    existingSnapshot.docs.forEach((doc, i) => {
      const data = doc.data();
      console.log(`  ${i + 1}. ${data.code} - ${data.isUsed ? '❌ Used' : '✅ Available'}`);
    });
    return;
  }

  const needed = TARGET_COUNT - existingSnapshot.size;
  console.log(`Generating ${needed} new codes...`);
  console.log('');

  let generated = 0;
  const newCodes: string[] = [];

  while (generated < needed) {
    const code = generatePromoCode();

    // Check for duplicates
    if (await codeExists(code)) {
      console.log(`⚠️  Duplicate generated: ${code}, retrying...`);
      continue;
    }

    await codesRef.add({
      code,
      isUsed: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    newCodes.push(code);
    generated++;

    if (generated % 10 === 0) {
      console.log(`✅ Generated ${generated}/${needed} codes`);
    }
  }

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Summary:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Total codes in database: ${existingSnapshot.size + generated}`);
  console.log(`Newly generated: ${generated}`);
  console.log('');
  console.log('Sample new codes:');
  newCodes.slice(0, 5).forEach((code, i) => {
    console.log(`  ${i + 1}. ${code}`);
  });
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

initPromoCodes()
  .then(() => {
    console.log('\n✅ Initialization completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Initialization failed:', error);
    process.exit(1);
  });
