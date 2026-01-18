/**
 * Test utility for language switching and news feed
 * Test how changing language affects news sources
 */

import { db } from '../services/firebase';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';

/**
 * Test language switching impact on news feed
 * Usage: window.testLanguageSwitch('ja')
 */
export async function testLanguageSwitch(targetLanguage: string = 'ja') {
  console.log('\n🌍 Testing Language Switch Impact\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const validLanguages = ['en', 'zh', 'ja', 'fr', 'es'];
  if (!validLanguages.includes(targetLanguage)) {
    console.log(`❌ Invalid language: ${targetLanguage}`);
    console.log(`   Valid options: ${validLanguages.join(', ')}`);
    return;
  }

  try {
    // 1. Check current localStorage cache
    console.log('📦 Step 1: Current cached news\n');
    const cachedNews = JSON.parse(localStorage.getItem('stanse_news_cache') || '[]');
    console.log(`   Cached news count: ${cachedNews.length}`);

    if (cachedNews.length > 0) {
      const languages = {};
      const sources = {};

      cachedNews.forEach((news: any) => {
        const lang = news.originalLanguage || 'unknown';
        const src = news.sourceType || 'unknown';
        languages[lang] = (languages[lang] || 0) + 1;
        sources[src] = (sources[src] || 0) + 1;
      });

      console.log('\n   Language distribution:');
      Object.entries(languages).forEach(([lang, count]) => {
        const flag = { 'en': '🇺🇸', 'zh': '🇨🇳', 'ja': '🇯🇵', 'fr': '🇫🇷', 'es': '🇪🇸' }[lang] || '🌐';
        console.log(`      ${flag} ${lang}: ${count}`);
      });

      console.log('\n   Source distribution:');
      Object.entries(sources).forEach(([src, count]) => {
        const color = src === 'rss' ? 'color: lime' : src === 'grounding' ? 'color: cyan' : 'color: orange';
        console.log(`      %c${src}: ${count}`, color);
      });
    }

    // 2. Query Firestore for news in target language
    console.log(`\n📰 Step 2: News available in ${targetLanguage.toUpperCase()}\n`);

    const langQuery = query(
      collection(db, 'news'),
      where('originalLanguage', '==', targetLanguage),
      orderBy('createdAt', 'desc'),
      limit(20)
    );

    const langSnapshot = await getDocs(langQuery);

    if (langSnapshot.empty) {
      console.log(`   ⚠️  No news found in ${targetLanguage.toUpperCase()}`);
      console.log('   This is normal if you haven\'t fetched news in this language yet.\n');
      console.log('   📝 To fetch news in this language:');
      console.log(`      1. Go to Settings`);
      console.log(`      2. Change language to ${targetLanguage.toUpperCase()}`);
      console.log(`      3. Return to Feed and click refresh`);
    } else {
      console.log(`   ✅ Found ${langSnapshot.size} news items in ${targetLanguage.toUpperCase()}\n`);

      const sourceTypes = {};
      const categories = {};

      langSnapshot.docs.forEach(doc => {
        const data = doc.data();
        const src = data.sourceType || 'unknown';
        const cat = data.category || 'unknown';
        sourceTypes[src] = (sourceTypes[src] || 0) + 1;
        categories[cat] = (categories[cat] || 0) + 1;
      });

      console.log('   Source types:');
      Object.entries(sourceTypes).forEach(([src, count]) => {
        console.log(`      - ${src}: ${count}`);
      });

      console.log('\n   Categories:');
      Object.entries(categories).forEach(([cat, count]) => {
        console.log(`      - ${cat}: ${count}`);
      });

      console.log(`\n   📰 Sample headlines (first 5):\n`);
      langSnapshot.docs.slice(0, 5).forEach((doc, i) => {
        const data = doc.data();
        console.log(`      ${i + 1}. ${data.title?.slice(0, 60)}...`);
        console.log(`         Source: ${data.sources?.[0] || 'N/A'} | Type: ${data.sourceType || 'N/A'}\n`);
      });
    }

    // 3. Test what will happen when switching
    console.log(`\n🔄 Step 3: What happens when you switch to ${targetLanguage.toUpperCase()}?\n`);

    console.log(`   When you change language to ${targetLanguage.toUpperCase()}:`);
    console.log('   1️⃣  FeedView detects language change');
    console.log(`   2️⃣  Calls fetchPersonalizedNews(..., language='${targetLanguage}')`);
    console.log(`   3️⃣  fetchAllNews() is called with language='${targetLanguage}'`);
    console.log(`   4️⃣  fetchGoogleNewsRSS(['WORLD', 'POLITICS', ...], '${targetLanguage}')`);
    console.log(`   5️⃣  Cloud Function fetches Google News RSS (${targetLanguage.toUpperCase()})`);

    if (targetLanguage === 'zh') {
      console.log('   6️⃣  ALSO fetches from 6park Chinese news');
    } else if (targetLanguage === 'en') {
      console.log('   6️⃣  ALSO fetches from Google Search Grounding');
    }

    console.log(`   7️⃣  News saved with originalLanguage='${targetLanguage}'`);
    console.log('   8️⃣  Displayed in Feed (titles/summaries translated to English)');

    // 4. Provide test instructions
    console.log('\n\n📋 Test Instructions:\n');
    console.log(`   To test ${targetLanguage.toUpperCase()} news:`);
    console.log('   ────────────────────────────────────');
    console.log('   1. Go to Settings (⚙️ menu)');
    console.log(`   2. Change Language to ${targetLanguage.toUpperCase()}`);
    console.log('   3. Return to Feed page');
    console.log('   4. Click refresh button 🔄');
    console.log('   5. Wait 10-20 seconds');
    console.log('   6. Run: window.testLanguageSwitch(\'' + targetLanguage + '\')');
    console.log('   7. Check if originalLanguage distribution changed\n');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Test complete!\n');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error);
  }
}

/**
 * Quick comparison of news before and after language switch
 */
export async function compareLanguages() {
  console.log('\n📊 Multi-Language News Comparison\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    const languages = ['en', 'zh', 'ja', 'fr', 'es'];

    for (const lang of languages) {
      const q = query(
        collection(db, 'news'),
        where('originalLanguage', '==', lang),
        limit(100)
      );

      const snapshot = await getDocs(q);

      const flag = { 'en': '🇺🇸', 'zh': '🇨🇳', 'ja': '🇯🇵', 'fr': '🇫🇷', 'es': '🇪🇸' }[lang] || '🌐';

      if (snapshot.size > 0) {
        const sources = {};
        snapshot.docs.forEach(doc => {
          const src = doc.data().sourceType || 'unknown';
          sources[src] = (sources[src] || 0) + 1;
        });

        console.log(`${flag} ${lang.toUpperCase()}: ${snapshot.size} news items`);
        Object.entries(sources).forEach(([src, count]) => {
          console.log(`   ├─ ${src}: ${count}`);
        });
        console.log('');
      } else {
        console.log(`${flag} ${lang.toUpperCase()}: %c0 items`, 'color: gray');
        console.log('');
      }
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
  }
}

// Expose to window
if (typeof window !== 'undefined') {
  (window as any).testLanguageSwitch = testLanguageSwitch;
  (window as any).compareLanguages = compareLanguages;
}
