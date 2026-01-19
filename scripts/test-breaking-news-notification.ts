#!/usr/bin/env node
/**
 * Test Breaking News Notification
 *
 * Manually adds a breaking news notification to Firestore
 * to test browser popup functionality
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

async function diagnoseNotifications() {
  console.log('🔍 Breaking News Notification Diagnostics\n');
  console.log('═'.repeat(60));

  // 1. Check userNotification collection
  console.log('\n1️⃣  Checking userNotification collection...');
  const notifSnapshot = await db.collection('userNotifications')
    .where('status', '==', 'granted')
    .get();

  console.log(`   Found ${notifSnapshot.size} users with notifications GRANTED`);

  if (!notifSnapshot.empty) {
    for (const doc of notifSnapshot.docs) {
      const data = doc.data();
      console.log(`\n   User ID: ${data.userId}`);
      console.log(`   Status: ${data.status}`);
      console.log(`   Device: ${data.deviceType} (${data.browser})`);
      console.log(`   Last breaking news notif: ${data.lastBreakingNewsNotification || 'Never'}`);

      // Get user email
      const userDoc = await db.collection('users').doc(data.userId).get();
      if (userDoc.exists) {
        console.log(`   Email: ${userDoc.data()?.email}`);
      }
    }
  }

  // 2. Check breaking_news_notifications collection
  console.log('\n2️⃣  Checking breaking_news_notifications collection...');
  const breakingSnapshot = await db.collection('breaking_news_notifications')
    .orderBy('timestamp', 'desc')
    .limit(5)
    .get();

  console.log(`   Found ${breakingSnapshot.size} breaking news notifications (recent 5)`);

  if (!breakingSnapshot.empty) {
    breakingSnapshot.forEach(doc => {
      const data = doc.data();
      console.log(`\n   ID: ${doc.id}`);
      console.log(`   Title: ${data.title}`);
      console.log(`   Category: ${data.category}`);
      console.log(`   Timestamp: ${data.timestamp}`);
      console.log(`   Read: ${data.read}`);
    });
  }

  // 3. Check unread count
  const unreadSnapshot = await db.collection('breaking_news_notifications')
    .where('read', '==', false)
    .get();

  console.log(`\n3️⃣  Unread breaking news notifications: ${unreadSnapshot.size}`);

  console.log('\n═'.repeat(60));
}

async function testBreakingNewsNotification() {
  console.log('\n🧪 Creating test breaking news notification...\n');

  try {
    // Add a test breaking news notification
    const notificationRef = await db.collection('breaking_news_notifications').add({
      title: 'URGENT: Test Breaking News Alert',
      body: 'This is a test notification to verify browser push notifications are working correctly. If you see this popup, the system is working!',
      category: 'TECH',
      sources: 'Test Source',
      timestamp: new Date().toISOString(),
      read: false,
      isTest: true
    });

    console.log('✅ Test notification created!');
    console.log('Notification ID:', notificationRef.id);
    console.log('');
    console.log('📱 CHECK YOUR BROWSER NOW - you should see a popup!');
    console.log('');
    console.log('Expected popup content:');
    console.log('  ⚡ TECH: URGENT: Test Breaking News Alert');
    console.log('  This is a test notification to verify...');
    console.log('');
    console.log('If no popup appears:');
    console.log('  1. Open browser DevTools (F12)');
    console.log('  2. Check Console for "⚡ New breaking news detected"');
    console.log('  3. Check if Notification.permission === "granted"');
    console.log('  4. Make sure you\'re on the app page with notifications enabled');
    console.log('');

    // Wait longer for user to check
    console.log('Waiting 30 seconds before cleanup...');
    await new Promise(resolve => setTimeout(resolve, 30000));

    // Delete test notification
    await notificationRef.delete();
    console.log('🗑️  Test notification cleaned up');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

async function main() {
  await diagnoseNotifications();
  await testBreakingNewsNotification();
}

main()
  .then(() => {
    console.log('\n✅ Test completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });
