/**
 * Test script for Google News RSS fetcher
 *
 * Usage:
 *   npx ts-node scripts/test-rss-fetcher.ts [language] [category]
 *
 * Examples:
 *   npx ts-node scripts/test-rss-fetcher.ts en WORLD
 *   npx ts-node scripts/test-rss-fetcher.ts zh POLITICS
 *   npx ts-node scripts/test-rss-fetcher.ts ja TECH
 */

import { fetchGoogleNewsRSS } from '../services/agents/newsAgent';

async function testRSSFetcher() {
  const language = process.argv[2] || 'en';
  const category = process.argv[3] || 'WORLD';

  console.log(`\n🧪 Testing RSS Fetcher`);
  console.log(`   Language: ${language}`);
  console.log(`   Category: ${category}`);
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  try {
    const result = await fetchGoogleNewsRSS([category], language);

    if (result.success && result.data) {
      console.log(`✅ Success! Fetched ${result.data.length} news items\n`);

      result.data.forEach((item, index) => {
        console.log(`${index + 1}. ${item.title}`);
        console.log(`   Source: ${item.source}`);
        console.log(`   Category: ${item.category}`);
        console.log(`   Language: ${item.language}`);
        console.log(`   URL: ${item.url.slice(0, 100)}...`);
        console.log(`   Summary: ${item.summary.slice(0, 100)}...`);
        // Handle date parsing safely
        try {
          const pubDate = new Date(item.publishedAt);
          if (!isNaN(pubDate.getTime())) {
            console.log(`   Published: ${pubDate.toISOString()}`);
          }
        } catch (e) {
          // Skip invalid dates
        }
        console.log('');
      });

      console.log(`\n📊 Metadata:`);
      console.log(`   Source: ${result.metadata?.source}`);
      console.log(`   Processing time: ${result.metadata?.processingTime}ms`);
    } else {
      console.error(`❌ Failed: ${result.error}`);
    }
  } catch (error: any) {
    console.error(`❌ Error: ${error.message}`);
    console.error(error.stack);
  }
}

testRSSFetcher();
