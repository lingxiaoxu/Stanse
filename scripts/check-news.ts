/**
 * Script to check news in Firestore database
 * Run with: npx ts-node scripts/check-news.ts
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, orderBy, limit } from 'firebase/firestore';

// Firebase config from environment or hardcoded for script
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || "AIzaSyDd6bWFLJfVp0k9vFJTlMKxkNyPyPLsKCE",
  authDomain: "stanse-9c151.firebaseapp.com",
  projectId: "stanse-9c151",
  storageBucket: "stanse-9c151.firebasestorage.app",
  messagingSenderId: "837715360412",
  appId: "1:837715360412:web:b0e3ccb09c8c07ed56ad90"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function checkNews() {
  console.log('Fetching recent news from Firestore...\n');

  const q = query(
    collection(db, 'news'),
    orderBy('createdAt', 'desc'),
    limit(20)
  );

  const snapshot = await getDocs(q);

  console.log(`Found ${snapshot.size} news items:\n`);

  snapshot.forEach((doc) => {
    const data = doc.data();
    const title = data.title || 'No title';
    const imageUrl = data.imageUrl || 'NO IMAGE';
    const isSindoor = title.toLowerCase().includes('sindoor');

    console.log('---');
    console.log(`ID: ${doc.id}`);
    console.log(`Title: ${title.slice(0, 80)}${title.length > 80 ? '...' : ''}`);
    console.log(`Image URL: ${imageUrl.slice(0, 100)}${imageUrl.length > 100 ? '...' : ''}`);
    console.log(`Category: ${data.category || 'N/A'}`);

    if (isSindoor) {
      console.log('\n*** FOUND OPERATION SINDOOR NEWS ***');
      console.log('Full image URL:', imageUrl);
      console.log('Full data:', JSON.stringify(data, null, 2));
    }
  });
}

checkNews().catch(console.error);
