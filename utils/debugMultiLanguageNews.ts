/**
 * Multi-Language News Debug Utilities
 *
 * Browser console utilities for debugging multi-language news system.
 *
 * Usage:
 * import('/utils/debugMultiLanguageNews').then(m => m.checkNewsLanguages())
 * import('/utils/debugMultiLanguageNews').then(m => m.checkUserPersonaEmbeddings('userId'))
 * import('/utils/debugMultiLanguageNews').then(m => m.compareNewsAcrossLanguages('titleHash'))
 */

import { db } from '../services/firebase';
import { collection, query, where, getDocs, doc, getDoc, orderBy, limit, deleteDoc } from 'firebase/firestore';

/**
 * Check news distribution across languages
 */
export const checkNewsLanguages = async (): Promise<void> => {
  console.log('\n🌐 Checking news distribution across languages...\n');

  const languages = ['en', 'zh', 'ja', 'fr', 'es'];
  const results: Record<string, number> = {};

  for (const lang of languages) {
    try {
      const q = query(
        collection(db, 'news'),
        where('originalLanguage', '==', lang),
        limit(1000)
      );
      const snapshot = await getDocs(q);
      results[lang] = snapshot.size;
      console.log(`${lang.toUpperCase()}: ${snapshot.size} news items`);
    } catch (error: any) {
      console.error(`Failed to query ${lang}:`, error.message);
      results[lang] = 0;
    }
  }

  console.log('\n📊 Summary:');
  console.log(`Total: ${Object.values(results).reduce((a, b) => a + b, 0)} news items`);
  console.log(`Languages: ${Object.entries(results).filter(([_, count]) => count > 0).map(([lang]) => lang).join(', ')}`);
};

/**
 * Check user persona embeddings for all languages
 */
export const checkUserPersonaEmbeddings = async (userId: string): Promise<void> => {
  console.log(`\n👤 Checking persona embeddings for user: ${userId}\n`);

  try {
    const docRef = doc(db, 'user_persona_embeddings', userId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      console.log('❌ No persona embedding found for this user');
      return;
    }

    const data = docSnap.data();
    const languages = ['EN', 'ZH', 'JA', 'FR', 'ES'];

    console.log('📝 Description lengths:');
    languages.forEach(lang => {
      const desc = data[`description${lang}`];
      if (desc) {
        const wordCount = lang === 'EN' || lang === 'FR' || lang === 'ES'
          ? desc.split(' ').length
          : desc.length; // Characters for Asian languages
        console.log(`  ${lang}: ${wordCount} ${lang === 'EN' || lang === 'FR' || lang === 'ES' ? 'words' : 'characters'}`);
      } else {
        console.log(`  ${lang}: ❌ Missing`);
      }
    });

    console.log('\n🔢 Embedding dimensions:');
    languages.forEach(lang => {
      const embedding = data[`embedding${lang}`];
      if (embedding && Array.isArray(embedding)) {
        console.log(`  ${lang}: ${embedding.length} dimensions`);
      } else {
        console.log(`  ${lang}: ❌ Missing`);
      }
    });

    console.log('\n📊 Metadata:');
    console.log(`  Generated: ${data.metadata?.generatedAt}`);
    console.log(`  Model: ${data.metadata?.modelVersion}`);
    console.log(`  Version: ${data.version}`);

  } catch (error: any) {
    console.error('❌ Error:', error.message);
  }
};

/**
 * Compare news items across languages by titleHash
 */
export const compareNewsAcrossLanguages = async (titleHash: string): Promise<void> => {
  console.log(`\n🔍 Finding news with titleHash: ${titleHash}\n`);

  try {
    const q = query(
      collection(db, 'news'),
      where('titleHash', '==', titleHash),
      orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      console.log('❌ No news found with this titleHash');
      return;
    }

    console.log(`✅ Found ${snapshot.size} language version(s):\n`);

    snapshot.docs.forEach((doc, index) => {
      const data = doc.data();
      console.log(`${index + 1}. Language: ${data.originalLanguage?.toUpperCase()}`);
      console.log(`   Document ID: ${doc.id}`);
      console.log(`   Title: ${data.title?.slice(0, 60)}...`);
      console.log(`   Summary: ${data.summary?.slice(0, 100)}...`);
      console.log(`   Category: ${data.category}`);
      console.log(`   Source: ${data.sourceType || 'N/A'}`);
      console.log(`   Created: ${data.createdAt?.toDate().toISOString()}`);
      console.log('');
    });

  } catch (error: any) {
    console.error('❌ Error:', error.message);
  }
};

/**
 * List recent news for a specific language
 */
export const listRecentNews = async (language: string = 'en', maxItems: number = 10): Promise<void> => {
  console.log(`\n📰 Recent ${language.toUpperCase()} news (last ${maxItems} items):\n`);

  try {
    const q = query(
      collection(db, 'news'),
      where('originalLanguage', '==', language),
      orderBy('createdAt', 'desc'),
      limit(maxItems)
    );
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      console.log(`❌ No news found for language: ${language}`);
      return;
    }

    snapshot.docs.forEach((doc, index) => {
      const data = doc.data();
      console.log(`${index + 1}. [${data.category}] ${data.title?.slice(0, 50)}...`);
      console.log(`   ID: ${doc.id} | titleHash: ${data.titleHash}`);
      console.log(`   Source: ${data.sourceType || 'N/A'} | Breaking: ${data.isBreaking ? 'YES' : 'No'}`);
      console.log('');
    });

  } catch (error: any) {
    console.error('❌ Error:', error.message);
  }
};

/**
 * Check breaking news across all languages
 */
export const checkBreakingNews = async (): Promise<void> => {
  console.log('\n⚡ Checking breaking news across all languages...\n');

  const languages = ['en', 'zh', 'ja', 'fr', 'es'];

  for (const lang of languages) {
    try {
      const q = query(
        collection(db, 'news'),
        where('originalLanguage', '==', lang),
        where('isBreaking', '==', true),
        orderBy('createdAt', 'desc'),
        limit(5)
      );
      const snapshot = await getDocs(q);

      console.log(`${lang.toUpperCase()}: ${snapshot.size} breaking news`);
      snapshot.docs.forEach((doc, index) => {
        const data = doc.data();
        console.log(`  ${index + 1}. ${data.title?.slice(0, 50)}...`);
      });
      console.log('');

    } catch (error: any) {
      console.error(`Failed to query ${lang}:`, error.message);
    }
  }
};

/**
 * Test multi-language news embeddings
 */
export const testNewsEmbeddings = async (newsId: string): Promise<void> => {
  console.log(`\n🔢 Checking embeddings for news: ${newsId}\n`);

  try {
    // Get news document
    const newsDoc = await getDoc(doc(db, 'news', newsId));
    if (!newsDoc.exists()) {
      console.log('❌ News not found');
      return;
    }

    const newsData = newsDoc.data();
    console.log(`Title: ${newsData.title}`);
    console.log(`Language: ${newsData.originalLanguage}`);
    console.log(`TitleHash: ${newsData.titleHash}\n`);

    // Check embedding
    const embeddingDoc = await getDoc(doc(db, 'news_embeddings', newsData.titleHash));
    if (!embeddingDoc.exists()) {
      console.log('❌ No embedding found');
      return;
    }

    const embeddingData = embeddingDoc.data();
    console.log('✅ Embedding found:');
    console.log(`  Dimensions: ${embeddingData.embedding?.length || 0}`);
    console.log(`  Category: ${embeddingData.category}`);
    console.log(`  Created: ${embeddingData.createdAt?.toDate().toISOString()}`);

  } catch (error: any) {
    console.error('❌ Error:', error.message);
  }
};

/**
 * Clear all persona embeddings (admin only)
 */
export const clearAllPersonaEmbeddings = async (): Promise<void> => {
  const confirm = window.confirm(
    '⚠️ WARNING: This will delete ALL user persona embeddings!\n\n' +
    'This action cannot be undone. Are you sure?'
  );

  if (!confirm) {
    console.log('❌ Operation cancelled');
    return;
  }

  console.log('\n🗑️  Clearing all persona embeddings...\n');

  try {
    const q = query(collection(db, 'user_persona_embeddings'), limit(100));
    const snapshot = await getDocs(q);

    console.log(`Found ${snapshot.size} persona embeddings to process`);

    for (const docSnapshot of snapshot.docs) {
      try {
        await deleteDoc(docSnapshot.ref);
        console.log(`✅ Deleted: ${docSnapshot.id}`);
      } catch (error: any) {
        console.error(`❌ Failed to delete ${docSnapshot.id}:`, error.message);
      }
    }

    console.log('\n✅ Cleanup complete');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
  }
};

/**
 * Quick status check of multi-language system
 */
export const systemStatus = async (): Promise<void> => {
  console.log('\n🌐 Multi-Language News System Status\n');
  console.log('═'.repeat(60));

  // Check news distribution
  await checkNewsLanguages();

  console.log('\n' + '═'.repeat(60));

  // Check breaking news
  const q = query(
    collection(db, 'news'),
    where('isBreaking', '==', true),
    limit(1000)
  );
  const breakingSnapshot = await getDocs(q);
  console.log(`\n⚡ Total breaking news: ${breakingSnapshot.size}`);

  console.log('\n' + '═'.repeat(60));
  console.log('\n✅ System status check complete\n');
};

/**
 * Verify collection linking for a specific news item
 * Tests: news ↔ news_embeddings ↔ news_images ↔ news_original
 */
export const verifyCollectionLinking = async (newsId: string): Promise<void> => {
  console.log(`\n🔗 Verifying collection linking for news: ${newsId}\n`);

  try {
    // 1. Get news document
    const newsDoc = await getDoc(doc(db, 'news', newsId));
    if (!newsDoc.exists()) {
      console.log('❌ News not found in news collection');
      return;
    }

    const newsData = newsDoc.data();
    console.log('✅ Found in news collection:');
    console.log(`   Title: ${newsData.title}`);
    console.log(`   Language: ${newsData.originalLanguage}`);
    console.log(`   TitleHash: ${newsData.titleHash}`);
    console.log(`   Breaking: ${newsData.isBreaking ? 'YES' : 'No'}`);
    console.log('');

    const titleHash = newsData.titleHash;

    // 2. Check news_embeddings (linked by titleHash)
    const embeddingDoc = await getDoc(doc(db, 'news_embeddings', titleHash));
    if (embeddingDoc.exists()) {
      const embData = embeddingDoc.data();
      console.log('✅ Found in news_embeddings:');
      console.log(`   Document ID: ${titleHash}`);
      console.log(`   Embedding dimensions: ${embData.embedding?.length || 0}`);
      console.log(`   Category: ${embData.category}`);
      console.log('');
    } else {
      console.log('⚠️  NOT found in news_embeddings');
      console.log(`   Expected document ID: ${titleHash}`);
      console.log('');
    }

    // 3. Check news_images (linked by titleHash)
    const imageDoc = await getDoc(doc(db, 'news_images', titleHash));
    if (imageDoc.exists()) {
      const imgData = imageDoc.data();
      console.log('✅ Found in news_images:');
      console.log(`   Document ID: ${titleHash}`);
      console.log(`   Image URL: ${imgData.imageUrl?.slice(0, 80)}...`);
      console.log(`   Source: ${imgData.source}`);
      console.log('');
    } else {
      console.log('⚠️  NOT found in news_images');
      console.log(`   Expected document ID: ${titleHash}`);
      console.log('');
    }

    // 4. Check news_original (for breaking news, uses "news-{hash}" format)
    if (newsData.isBreaking) {
      // Try to find by titleHash (search all documents)
      const originalQuery = query(
        collection(db, 'news_original'),
        where('titleHash', '==', titleHash),
        where('originalLanguage', '==', newsData.originalLanguage)
      );
      const originalSnapshot = await getDocs(originalQuery);

      if (!originalSnapshot.empty) {
        const originalDoc = originalSnapshot.docs[0];
        const origData = originalDoc.data();
        console.log('✅ Found in news_original (breaking news):');
        console.log(`   Document ID: ${originalDoc.id}`);
        console.log(`   TitleHash: ${origData.titleHash}`);
        console.log(`   Has full content: ${origData.originalContent?.length > 200 ? 'YES' : 'No'}`);
        console.log(`   URL: ${origData.url || 'N/A'}`);
        console.log('');
      } else {
        console.log('⚠️  NOT found in news_original');
        console.log(`   This is normal for non-breaking news`);
        console.log('');
      }
    } else {
      console.log('ℹ️  news_original check skipped (not breaking news)');
      console.log('');
    }

    // 5. Find all language versions of this news
    console.log('🌐 Finding all language versions:');
    const allVersionsQuery = query(
      collection(db, 'news'),
      where('titleHash', '==', titleHash)
    );
    const allVersionsSnapshot = await getDocs(allVersionsQuery);

    if (allVersionsSnapshot.size > 1) {
      console.log(`   Found ${allVersionsSnapshot.size} language version(s):`);
      allVersionsSnapshot.docs.forEach((doc, index) => {
        const data = doc.data();
        console.log(`   ${index + 1}. ${data.originalLanguage?.toUpperCase()} - ${doc.id} - "${data.title?.slice(0, 40)}..."`);
      });
    } else {
      console.log(`   Only this language version exists`);
    }

    console.log('\n✅ Collection linking verification complete\n');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
  }
};

/**
 * Clear all news for a specific language (to force refresh)
 */
export const clearLanguageNews = async (language: string): Promise<void> => {
  const confirm = window.confirm(
    `⚠️ WARNING: This will delete ALL ${language.toUpperCase()} news!\n\n` +
    'News will be refetched automatically on next refresh.\n\n' +
    'Continue?'
  );

  if (!confirm) {
    console.log('❌ Operation cancelled');
    return;
  }

  console.log(`\n🗑️  Clearing all ${language.toUpperCase()} news...\n`);

  try {
    const q = query(
      collection(db, 'news'),
      where('originalLanguage', '==', language),
      limit(500)
    );
    const snapshot = await getDocs(q);

    console.log(`Found ${snapshot.size} ${language.toUpperCase()} news to delete`);

    for (const docSnapshot of snapshot.docs) {
      try {
        const data = docSnapshot.data();
        await deleteDoc(docSnapshot.ref);
        console.log(`✅ Deleted: ${data.title?.slice(0, 50)}...`);
      } catch (error: any) {
        console.error(`❌ Failed to delete ${docSnapshot.id}:`, error.message);
      }
    }

    console.log(`\n✅ Cleanup complete: ${snapshot.size} ${language.toUpperCase()} news deleted`);
    console.log('💡 Refresh the page to fetch fresh news with correct language summaries');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
  }
};

/**
 * Export all debug functions
 */
export default {
  checkNewsLanguages,
  checkUserPersonaEmbeddings,
  compareNewsAcrossLanguages,
  listRecentNews,
  checkBreakingNews,
  testNewsEmbeddings,
  clearAllPersonaEmbeddings,
  clearLanguageNews,
  verifyCollectionLinking,
  systemStatus
};
