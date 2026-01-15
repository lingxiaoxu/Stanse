/**
 * Collect all generated image URLs from Firestore
 * Output in format ready for geminiService.ts replacement
 */

import * as admin from 'firebase-admin';

admin.initializeApp({ projectId: 'stanseproject' });
const db = admin.firestore();

async function collectImages() {
  console.log('📸 Collecting generated images from Firestore...\n');

  const categories = ['POLITICS', 'TECH', 'MILITARY', 'WORLD', 'BUSINESS', 'DEFAULT'];
  const imagesByCategory: Record<string, string[]> = {};

  for (const category of categories) {
    console.log(`\n📁 ${category}:`);

    const imagesSnapshot = await db
      .collection('news_image_generation')
      .doc(category)
      .collection('images')
      .get();

    const urls: string[] = [];

    imagesSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.imageUrl) {
        urls.push(data.imageUrl);
        console.log(`  ✓ ${doc.id}`);
      }
    });

    imagesByCategory[category] = urls;
    console.log(`  Total: ${urls.length} images`);
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('📊 SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════\n');

  let totalImages = 0;
  for (const [cat, urls] of Object.entries(imagesByCategory)) {
    console.log(`${cat}: ${urls.length} images`);
    totalImages += urls.length;
  }
  console.log(`\nTotal: ${totalImages} images\n`);

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('📋 CODE FOR geminiService.ts');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log('const CATEGORY_IMAGES: Record<string, string[]> = {');

  for (const [category, urls] of Object.entries(imagesByCategory)) {
    console.log(`  '${category}': [`);
    urls.forEach(url => {
      console.log(`    '${url}',`);
    });
    console.log(`  ],`);
  }

  console.log('};');

  process.exit(0);
}

collectImages().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
