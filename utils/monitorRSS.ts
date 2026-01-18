/**
 * Monitor RSS fetching status and scheduled task execution
 */

import { db } from '../services/firebase';
import { collection, query, orderBy, limit, getDocs, where } from 'firebase/firestore';

/**
 * Check RSS status and recent news
 */
export async function checkRSSStatus() {
  console.log('\n📊 RSS Status Monitor\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    // 1. Check recent news by source type
    console.log('📰 News by Source Type (last 100):\n');

    const newsRef = collection(db, 'news');
    const recentQuery = query(newsRef, orderBy('createdAt', 'desc'), limit(100));
    const snapshot = await getDocs(recentQuery);

    const stats = {
      total: snapshot.size,
      bySource: {} as Record<string, number>,
      byLanguage: {} as Record<string, number>,
      recent: [] as any[]
    };

    snapshot.docs.forEach(doc => {
      const data = doc.data();
      const src = data.sourceType || 'unknown';
      const lang = data.originalLanguage || 'unknown';

      stats.bySource[src] = (stats.bySource[src] || 0) + 1;
      stats.byLanguage[lang] = (stats.byLanguage[lang] || 0) + 1;

      if (stats.recent.length < 10) {
        stats.recent.push({
          title: data.title?.slice(0, 50),
          source: src,
          lang: lang,
          created: data.createdAt?.toDate().toISOString()
        });
      }
    });

    console.log('   Total news: %c' + stats.total, 'font-weight: bold');
    console.log('\n   By Source:');
    Object.entries(stats.bySource).forEach(([src, count]) => {
      const color = src === 'rss' ? 'color: lime' :
                    src === 'grounding' ? 'color: cyan' :
                    src === '6park' ? 'color: orange' : 'color: gray';
      const emoji = src === 'rss' ? '📡' :
                    src === 'grounding' ? '🔍' :
                    src === '6park' ? '🇨🇳' : '❓';
      console.log(`      %c${emoji} ${src}: ${count}`, color);
    });

    console.log('\n   By Language:');
    Object.entries(stats.byLanguage).forEach(([lang, count]) => {
      const flag = { 'en': '🇺🇸', 'zh': '🇨🇳', 'ja': '🇯🇵', 'fr': '🇫🇷', 'es': '🇪🇸' }[lang] || '🌐';
      console.log(`      ${flag} ${lang}: ${count}`);
    });

    console.log('\n   Latest 10 news:');
    stats.recent.forEach((item, i) => {
      const srcEmoji = item.source === 'rss' ? '📡' :
                       item.source === 'grounding' ? '🔍' : '❓';
      const langFlag = { 'en': '🇺🇸', 'zh': '🇨🇳', 'ja': '🇯🇵' }[item.lang] || '🌐';
      console.log(`      ${i + 1}. [${srcEmoji}${langFlag}] ${item.title}...`);
    });

    // 2. Check scheduled task logs
    console.log('\n\n⏰ Scheduled Fetch History:\n');

    try {
      const logsRef = collection(db, 'news_fetch_logs');
      const logsQuery = query(logsRef, orderBy('timestamp', 'desc'), limit(5));
      const logsSnapshot = await getDocs(logsQuery);

      if (logsSnapshot.empty) {
        console.log('   ⚠️  No logs found yet');
        console.log('   Scheduled task will run at: 3am, 7am, 11am, 3pm UTC');
      } else {
        logsSnapshot.docs.forEach((doc, i) => {
          const data = doc.data();
          console.log(`   ${i + 1}. ${data.timestamp}`);
          console.log(`      Fetched: ${data.totalFetched} | Failed: ${data.totalFailed}`);
          console.log(`      Languages: ${data.languages?.join(', ')}`);
        });
      }
    } catch (e) {
      console.log('   ℹ️  Log collection not accessible or doesn\'t exist yet');
    }

    // 3. RSS Success Rate
    console.log('\n\n📈 RSS Success Indicators:\n');

    const rssCount = stats.bySource['rss'] || 0;
    const totalCount = stats.total;
    const rssPercentage = totalCount > 0 ? Math.round((rssCount / totalCount) * 100) : 0;

    if (rssCount > 0) {
      console.log(`   %c✅ RSS is working!`, 'color: lime; font-weight: bold');
      console.log(`   ${rssCount}/${totalCount} news from RSS (${rssPercentage}%)`);
    } else if (stats.bySource['grounding'] > 0) {
      console.log(`   %c⚠️  RSS not working, using Grounding fallback`, 'color: orange; font-weight: bold');
      console.log(`   ${stats.bySource['grounding']} news from Google Search`);
    } else {
      console.log(`   %c❌ No news sources working`, 'color: red; font-weight: bold');
    }

    // 4. Recommendations
    console.log('\n\n💡 Recommendations:\n');

    if (rssCount === 0) {
      console.log('   • RSS is returning 0 items (likely rate limited)');
      console.log('   • Wait for scheduled task to run (next: check UTC time)');
      console.log('   • Or try again in 15-30 minutes');
    }

    if (stats.bySource['unknown'] > 0) {
      console.log(`   • Found ${stats.bySource['unknown']} old news without sourceType`);
      console.log('   • Run: window.cleanAllNews() to remove them');
    }

    const fakeNews = Object.keys(stats.bySource).filter(s => s.includes('0-'));
    if (fakeNews.length > 0) {
      console.log('   • %cFound fake news! Run window.cleanAllNews()', 'color: red');
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Monitor complete!\n');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
  }
}

/**
 * Test if RSS is working right now
 */
export async function testRSSNow(language: string = 'en') {
  console.log(`\n🧪 Testing RSS for ${language.toUpperCase()}...\n`);

  try {
    const { httpsCallable } = await import('firebase/functions');
    const { functions } = await import('../services/firebase');

    const fetchRSS = httpsCallable(functions, 'fetchGoogleNewsRSS');

    console.log('Calling Cloud Function...');
    const startTime = Date.now();

    const result = await fetchRSS({
      language,
      categories: ['WORLD'],  // Just test one category
      maxPerCategory: 3
    });

    const elapsed = Date.now() - startTime;
    const data = result.data as any;

    console.log(`\n⏱️  Time: ${elapsed}ms`);

    if (data.success && data.data && data.data.length > 0) {
      console.log(`%c✅ RSS Working!`, 'color: lime; font-size: 16px; font-weight: bold');
      console.log(`   Fetched ${data.data.length} news items`);
      console.log('\n   Sample:');
      data.data.slice(0, 3).forEach((item: any, i: number) => {
        console.log(`   ${i + 1}. ${item.title?.slice(0, 60)}...`);
      });
    } else {
      console.log(`%c⚠️  RSS Failed`, 'color: orange; font-size: 16px; font-weight: bold');
      console.log(`   Error: ${data.error || 'No data returned'}`);
      console.log('\n   This is likely due to:');
      console.log('   - Google News rate limiting (503 errors)');
      console.log('   - Try again in 15-30 minutes');
      console.log('   - Scheduled task will handle it automatically');
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  } catch (error: any) {
    console.log(`%c❌ Error`, 'color: red; font-size: 16px; font-weight: bold');
    console.log(`   ${error.message}`);
  }
}

// Expose to window
if (typeof window !== 'undefined') {
  (window as any).checkRSSStatus = checkRSSStatus;
  (window as any).testRSSNow = testRSSNow;
}
