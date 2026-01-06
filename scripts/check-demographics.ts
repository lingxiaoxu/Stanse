#!/usr/bin/env node
import admin from 'firebase-admin';

try { admin.app(); } catch (e) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'stanseproject'
  });
}

const db = admin.firestore();

async function checkDemographics() {
  const userIds = [
    'B7ihvElEBwdnhRffIkky9QjNbJN2',  // admin@someopark.com
    'O5zWHhv80ZN8uBohaM54eJA6m6B3',  // tedgiordanointradiem@gmail.com
    'EKC4yKTxrLhtG171EtkqdPBMYbB2',  // yaxuancai248@gmail.com
    'OkNexZrKwXb8ANVz2VSp3eC62i22',  // anonymous.person.newyorkcity@gmail.com
    'PSfxNR5noFh2vObUMcXa6f8cwIE2'   // lingxiao.xu@aya.yale.edu
  ];

  for (const userId of userIds) {
    const doc = await db.collection('users').doc(userId).get();
    const data = doc.data();
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Email:', data?.email);
    console.log('Demographics:');
    console.log('  birthCountry:', data?.onboarding?.demographics?.birthCountry);
    console.log('  currentCountry:', data?.onboarding?.demographics?.currentCountry);
    console.log('Current nationalityPrefix:', data?.coordinates?.nationalityPrefix);
    console.log('Current label:', data?.coordinates?.label);
    console.log('');
  }
}

checkDemographics().then(() => process.exit(0)).catch(console.error);
