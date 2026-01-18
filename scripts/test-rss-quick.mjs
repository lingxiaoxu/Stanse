// Quick test for RSS fetcher Cloud Function (ES Module)
import { initializeApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';

// Your Firebase config
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || "AIzaSyCsOMA65GTn_OdQoLuJoANGgcbUPcq-tT8",
  authDomain: "stanseproject.firebaseapp.com",
  projectId: "stanseproject",
  storageBucket: "stanseproject.firebasestorage.app",
  messagingSenderId: "490176272662",
  appId: "1:490176272662:web:a17d7d7e3fcd6bf2b46a05"
};

const app = initializeApp(firebaseConfig);
const functions = getFunctions(app);

async function testRSS() {
  console.log('\n🧪 Testing RSS Fetcher Cloud Function...\n');
  console.log('📍 Project: stanseproject');
  console.log('🌍 Testing multiple languages...\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const tests = [
    { language: 'en', category: 'WORLD', name: 'English World News' },
    { language: 'zh', category: 'POLITICS', name: 'Chinese Politics News' },
    { language: 'ja', category: 'TECH', name: 'Japanese Tech News' }
  ];

  for (const test of tests) {
    try {
      console.log(`\n📰 Testing: ${test.name}`);
      console.log(`   Language: ${test.language}, Category: ${test.category}`);

      const fetchRSS = httpsCallable(functions, 'fetchGoogleNewsRSS');

      const result = await fetchRSS({
        language: test.language,
        categories: [test.category],
        maxPerCategory: 3
      });

      if (result.data.success) {
        const newsCount = result.data.data.length;
        console.log(`   ✅ Success! Fetched ${newsCount} news items`);

        if (newsCount > 0) {
          const firstNews = result.data.data[0];
          const headline = firstNews.title.slice(0, 80);
          console.log(`   📌 First headline: ${headline}...`);
          console.log(`   🏢 Source: ${firstNews.source}`);
        }
      } else {
        console.log(`   ❌ Failed: ${result.data.error}`);
      }
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
      if (error.code) {
        console.log(`   🔴 Error Code: ${error.code}`);
      }
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\n✨ Test complete!\n');
}

testRSS().catch(console.error);
