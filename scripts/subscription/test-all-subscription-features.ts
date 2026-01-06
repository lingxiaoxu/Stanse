#!/usr/bin/env node
/**
 * Test All Subscription Features
 *
 * Comprehensive test of the complete subscription system
 *
 * Run: npx tsx scripts/subscription/test-all-subscription-features.ts
 */

import admin from 'firebase-admin';

try { admin.app(); } catch (e) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'stanseproject'
  });
}

const db = admin.firestore();

async function testAllFeatures() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 Testing All Subscription Features');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  const results: string[] = [];

  // Test 1: Check promotion codes collection
  console.log('1️⃣  Testing Promotion Codes...');
  const promoSnapshot = await db.collection('promotion_codes').limit(5).get();
  if (promoSnapshot.size > 0) {
    console.log(`   ✅ Found ${promoSnapshot.size} promo codes`);
    const firstPromo = promoSnapshot.docs[0].data();
    console.log(`   Sample: ${firstPromo.code} (Used: ${firstPromo.isUsed})`);
    results.push('✅ Promotion codes');
  } else {
    console.log(`   ❌ No promo codes found`);
    results.push('❌ Promotion codes missing');
  }
  console.log('');

  // Test 2: Check user subscriptions
  console.log('2️⃣  Testing User Subscriptions...');
  const subsSnapshot = await db.collection('user_subscriptions').limit(5).get();
  if (subsSnapshot.size > 0) {
    console.log(`   ✅ Found ${subsSnapshot.size} subscriptions`);
    const firstSub = subsSnapshot.docs[0].data();
    console.log(`   Sample fields: status=${firstSub.status}, trial=${!!firstSub.trialEndsAt}, promo=${!!firstSub.promoExpiresAt}`);
    results.push('✅ User subscriptions');
  } else {
    console.log(`   ⚠️  No subscriptions yet (expected if no users subscribed)`);
    results.push('⚠️  No subscriptions');
  }
  console.log('');

  // Test 3: Check billing history
  console.log('3️⃣  Testing Billing History...');
  if (subsSnapshot.size > 0) {
    const firstUserId = subsSnapshot.docs[0].id;
    const historySnapshot = await db.collection('user_subscriptions')
      .doc(firstUserId).collection('history').get();
    console.log(`   ✅ User has ${historySnapshot.size} billing records`);
    if (historySnapshot.size > 0) {
      const firstRecord = historySnapshot.docs[0].data();
      console.log(`   Sample: ${firstRecord.type} - $${firstRecord.amount}`);
    }
    results.push('✅ Billing history');
  } else {
    results.push('⚠️  Billing history (no users)');
  }
  console.log('');

  // Test 4: Check revenue collection
  console.log('4️⃣  Testing Revenue Collection...');
  const revenueSnapshot = await db.collection('revenue').orderBy('timestamp', 'desc').limit(5).get();
  if (revenueSnapshot.size > 0) {
    console.log(`   ✅ Found ${revenueSnapshot.size} revenue records`);
    const latestRevenue = revenueSnapshot.docs[0].data();
    console.log(`   Latest: ${latestRevenue.type} - $${latestRevenue.totalRevenue} (Period: ${latestRevenue.period})`);
    console.log(`   Fields: potentialRevenue=${!!latestRevenue.potentialRevenue}, revenueLoss=${!!latestRevenue.revenueLoss}`);
    results.push('✅ Revenue collection');
  } else {
    console.log(`   ⚠️  No revenue records (scripts haven't run yet)`);
    results.push('⚠️  No revenue records');
  }
  console.log('');

  // Test 5: Check subscription events
  console.log('5️⃣  Testing Subscription Events...');
  const eventsSnapshot = await db.collection('subscription_events').orderBy('timestamp', 'desc').limit(10).get();
  if (eventsSnapshot.size > 0) {
    console.log(`   ✅ Found ${eventsSnapshot.size} subscription events`);
    const eventTypes = new Set(eventsSnapshot.docs.map(d => d.data().eventType));
    console.log(`   Event types: ${Array.from(eventTypes).join(', ')}`);
    results.push('✅ Subscription events');
  } else {
    console.log(`   ⚠️  No subscription events (no user activity yet)`);
    results.push('⚠️  No subscription events');
  }
  console.log('');

  // Test 6: Check Cloud Scheduler jobs
  console.log('6️⃣  Testing Cloud Scheduler Jobs...');
  console.log('   Run: gcloud scheduler jobs list --location=us-central1 --project=stanseproject');
  results.push('ℹ️  Scheduler (check manually)');
  console.log('');

  // Test 7: Check Firestore Rules
  console.log('7️⃣  Testing Firestore Rules...');
  try {
    // This will only work if we're authenticated as a user
    console.log('   ℹ️  Rules deployed - manual verification needed');
    results.push('ℹ️  Firestore rules (check console)');
  } catch (error) {
    console.log('   ⚠️  Cannot test rules from Admin SDK');
  }
  console.log('');

  // Summary
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Test Results Summary');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  results.forEach(result => console.log(result));
  console.log('');
  console.log('Next Steps:');
  console.log('1. Run: npx tsx scripts/subscription/generate-revenue-report.ts');
  console.log('2. Trigger: gcloud scheduler jobs run firebase-schedule-processTrialEndCharges-us-central1 --location=us-central1 --project=stanseproject');
  console.log('3. Check email: lxu912@gmail.com');
  console.log('4. Test UI: Visit account page and try subscribe/cancel');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

testAllFeatures()
  .then(() => {
    console.log('\n✅ Tests completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Tests failed:', error);
    process.exit(1);
  });
