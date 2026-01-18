/**
 * Test script to verify linking between news, news_embeddings, and news_images collections
 *
 * Usage:
 *   npx tsx scripts/test-collection-linking.ts <email> <password>
 *
 * Example:
 *   npx tsx scripts/test-collection-linking.ts lxu912@gmail.com yourpassword
 */

import { db, auth } from '../services/firebase';
import { collection, query, orderBy, limit, getDocs, doc, getDoc } from 'firebase/firestore';
import { signInWithEmailAndPassword } from 'firebase/auth';

async function testCollectionLinking() {
  console.log('\n🔗 Testing Collection Linking\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    // 0. Authenticate user
    const email = process.argv[2];
    const password = process.argv[3];

    if (!email || !password) {
      console.log('⚠️  No credentials provided, running without authentication');
      console.log('   Usage: npx tsx scripts/test-collection-linking.ts <email> <password>');
      console.log('   Note: news_embeddings and news_images require authentication\n');
    } else {
      console.log('🔐 Authenticating user...');
      await signInWithEmailAndPassword(auth, email, password);
      console.log('✅ Authenticated successfully\n');
    }

    // 1. Get a recent news item
    console.log('📰 Step 1: Fetching a recent news item from "news" collection...\n');

    const newsQuery = query(
      collection(db, 'news'),
      orderBy('createdAt', 'desc'),
      limit(5)
    );

    const newsSnapshot = await getDocs(newsQuery);

    if (newsSnapshot.empty) {
      console.log('❌ No news found in database');
      return;
    }

    console.log(`Found ${newsSnapshot.size} recent news items\n`);

    // Test each news item
    for (let i = 0; i < newsSnapshot.docs.length; i++) {
      const newsDoc = newsSnapshot.docs[i];
      const newsData = newsDoc.data();

      console.log(`\n📌 Testing News Item #${i + 1}:`);
      console.log(`   Title: ${newsData.title?.slice(0, 60)}...`);
      console.log(`   TitleHash: ${newsData.titleHash || 'N/A'}`);
      console.log(`   Original Language: ${newsData.originalLanguage || 'N/A'}`);
      console.log(`   Category: ${newsData.category || 'N/A'}`);
      console.log(`   Created: ${newsData.createdAt?.toDate().toISOString() || 'N/A'}`);

      const titleHash = newsData.titleHash;

      if (!titleHash) {
        console.log('   ⚠️  No titleHash found, skipping linking test');
        continue;
      }

      // 2. Try to find corresponding embedding using titleHash as doc ID
      console.log('\n   🔍 Searching for embedding...');
      try {
        const embeddingRef = doc(db, 'news_embeddings', titleHash);
        const embeddingDoc = await getDoc(embeddingRef);

        if (embeddingDoc.exists()) {
          const embData = embeddingDoc.data();
          console.log('   ✅ Found embedding!');
          console.log(`      - Embedding dimensions: ${embData.embedding?.length || 0}`);
          console.log(`      - Title match: ${embData.title?.slice(0, 40)}...`);
          console.log(`      - Category: ${embData.category}`);
          console.log(`      - ✅ titleHash linking works!`);
        } else {
          console.log('   ⚠️  No embedding found for this titleHash');
        }
      } catch (error: any) {
        console.log(`   ❌ Error fetching embedding: ${error.message}`);
      }

      // 3. Try to find corresponding image using titleHash as doc ID
      console.log('\n   🔍 Searching for image...');
      try {
        const imageRef = doc(db, 'news_images', titleHash);
        const imageDoc = await getDoc(imageRef);

        if (imageDoc.exists()) {
          const imgData = imageDoc.data();
          console.log('   ✅ Found image!');
          console.log(`      - Image URL: ${imgData.imageUrl?.slice(0, 60)}...`);
          console.log(`      - Source: ${imgData.source}`);
          console.log(`      - Created: ${imgData.createdAt?.toDate().toISOString()}`);
          console.log(`      - ✅ titleHash linking works!`);
        } else {
          console.log('   ⚠️  No image found for this titleHash');
        }
      } catch (error: any) {
        console.log(`   ❌ Error fetching image: ${error.message}`);
      }

      console.log('\n   ─────────────────────────────────────');
    }

    console.log('\n\n📊 Summary Statistics:\n');

    // Calculate linking percentages from tested items
    let linkedEmbeddings = 0;
    let linkedImages = 0;
    const totalTested = newsSnapshot.size;

    for (const newsDoc of newsSnapshot.docs) {
      const titleHash = newsDoc.data().titleHash;
      if (!titleHash) continue;

      try {
        const embeddingDoc = await getDoc(doc(db, 'news_embeddings', titleHash));
        if (embeddingDoc.exists()) linkedEmbeddings++;

        const imageDoc = await getDoc(doc(db, 'news_images', titleHash));
        if (imageDoc.exists()) linkedImages++;
      } catch (e) {
        // Skip on permission error
      }
    }

    console.log(`   Tested ${totalTested} news items`);
    console.log(`\n   Linking results:`);
    console.log(`   - News → Embeddings: ${linkedEmbeddings}/${totalTested} (${Math.round(linkedEmbeddings/totalTested*100)}%)`);
    console.log(`   - News → Images: ${linkedImages}/${totalTested} (${Math.round(linkedImages/totalTested*100)}%)`);

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Test complete!\n');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  }
}

testCollectionLinking();
