/**
 * Test utility for browser console
 * Can be called directly from browser console after importing
 */

import { db } from '../services/firebase';
import { collection, query, orderBy, limit, getDocs, doc, getDoc, deleteDoc } from 'firebase/firestore';

export async function testCollectionLinking() {
  console.log('\n🔗 Testing Collection Linking\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    // Get recent news
    console.log('📰 Fetching recent news from "news" collection...\n');

    const newsQuery = query(
      collection(db, 'news'),
      orderBy('createdAt', 'desc'),
      limit(5)
    );

    const newsSnapshot = await getDocs(newsQuery);

    if (newsSnapshot.empty) {
      console.log('❌ No news found');
      return;
    }

    console.log(`Found ${newsSnapshot.size} recent news items\n`);

    let linkedEmbeddings = 0;
    let linkedImages = 0;

    // Test each news item
    for (let i = 0; i < newsSnapshot.docs.length; i++) {
      const newsDoc = newsSnapshot.docs[i];
      const newsData = newsDoc.data();

      console.log(`\n📌 News Item #${i + 1}:`);
      console.log(`   Title: ${newsData.title?.slice(0, 60)}...`);
      console.log(`   TitleHash: ${newsData.titleHash || 'N/A'}`);
      console.log(`   %cOriginal Language: ${newsData.originalLanguage || 'N/A'}`,
        newsData.originalLanguage === 'zh' ? 'color: orange; font-weight: bold' :
        newsData.originalLanguage === 'ja' ? 'color: pink; font-weight: bold' :
        'color: lightblue');
      console.log(`   Category: ${newsData.category || 'N/A'}`);
      console.log(`   %cSource Type: ${newsData.sourceType || 'N/A'}`,
        newsData.sourceType === 'rss' ? 'color: lime; font-weight: bold' :
        newsData.sourceType === 'grounding' ? 'color: cyan' :
        newsData.sourceType === '6park' ? 'color: orange' :
        'color: gray');

      const titleHash = newsData.titleHash;
      if (!titleHash) continue;

      // Check embedding
      console.log('\n   🔍 Checking embedding...');
      try {
        const embeddingRef = doc(db, 'news_embeddings', titleHash);
        const embeddingDoc = await getDoc(embeddingRef);

        if (embeddingDoc.exists()) {
          const embData = embeddingDoc.data();
          console.log('   %c✅ Found embedding!', 'color: lime; font-weight: bold');
          console.log(`      - Dimensions: ${embData.embedding?.length || 0}`);
          console.log(`      - Title: ${embData.title?.slice(0, 40)}...`);
          console.log(`      - Category: ${embData.category}`);
          linkedEmbeddings++;
        } else {
          console.log('   ⚠️  No embedding found');
        }
      } catch (error: any) {
        console.log(`   ❌ Error: ${error.message}`);
      }

      // Check image
      console.log('\n   🔍 Checking image...');
      try {
        const imageRef = doc(db, 'news_images', titleHash);
        const imageDoc = await getDoc(imageRef);

        if (imageDoc.exists()) {
          const imgData = imageDoc.data();
          console.log('   %c✅ Found image!', 'color: lime; font-weight: bold');
          console.log(`      - URL: ${imgData.imageUrl?.slice(0, 50)}...`);
          console.log(`      - Source: ${imgData.source}`);
          linkedImages++;
        } else {
          console.log('   ⚠️  No image found');
        }
      } catch (error: any) {
        console.log(`   ❌ Error: ${error.message}`);
      }

      console.log('\n   ─────────────────────────────────────');
    }

    // Summary
    console.log('\n\n%c📊 Summary', 'color: cyan; font-size: 16px; font-weight: bold');
    console.log(`   Tested: ${newsSnapshot.size} news items`);
    console.log(`   - News → Embeddings: ${linkedEmbeddings}/${newsSnapshot.size} (${Math.round(linkedEmbeddings/newsSnapshot.size*100)}%)`);
    console.log(`   - News → Images: ${linkedImages}/${newsSnapshot.size} (${Math.round(linkedImages/newsSnapshot.size*100)}%)`);

    if (linkedEmbeddings === newsSnapshot.size && linkedImages === newsSnapshot.size) {
      console.log('\n%c✅ Perfect! All collections are properly linked!', 'color: lime; font-size: 14px; font-weight: bold');
    } else if (linkedEmbeddings > 0 || linkedImages > 0) {
      console.log('\n%c⚠️  Partial linking - some items missing embeddings/images', 'color: orange; font-size: 14px; font-weight: bold');
    } else {
      console.log('\n%c❌ No linking found - check permissions or data', 'color: red; font-size: 14px; font-weight: bold');
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('%c✅ Test complete!\n', 'color: lime; font-weight: bold');

  } catch (error: any) {
    console.error('❌ Fatal Error:', error.message);
    console.error(error);
  }
}

/**
 * Delete all news from Firestore
 */
export async function cleanAllNews() {
  console.log('\n🗑️ Cleaning all news...\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    const newsRef = collection(db, 'news');
    const snapshot = await getDocs(newsRef);

    console.log(`Found ${snapshot.size} news items in Firestore`);

    if (snapshot.size === 0) {
      console.log('✅ No news to delete');
    } else {
      console.log('Deleting...\n');

      let deleted = 0;
      for (const docSnap of snapshot.docs) {
        await deleteDoc(doc(db, 'news', docSnap.id));
        deleted++;
        if (deleted % 50 === 0) {
          console.log(`Progress: ${deleted}/${snapshot.size}`);
        }
      }

      console.log(`\n✅ Deleted ${deleted} news items from Firestore`);
    }

    // Clear localStorage
    localStorage.removeItem('stanse_news_cache');
    localStorage.removeItem('stanse_last_stance_hash');
    console.log('✅ Cleared localStorage cache');

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Cleanup complete! Refresh page (Cmd+R)');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
  }
}

// Expose to window for easy access
if (typeof window !== 'undefined') {
  (window as any).testCollectionLinking = testCollectionLinking;
  (window as any).cleanAllNews = cleanAllNews;
}
