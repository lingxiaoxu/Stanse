import * as admin from 'firebase-admin';

admin.initializeApp({ projectId: 'stanseproject' });
const db = admin.firestore();

async function updateKeyword() {
  console.log('🔄 Replacing presidential_debate with midterm_election...\n');

  const docRef = db.collection('news_image_generation').doc('POLITICS');
  const doc = await docRef.get();

  if (!doc.exists) {
    console.log('❌ POLITICS document not found');
    process.exit(1);
  }

  const data = doc.data();
  const keywords = data!.keywords || [];

  const index = keywords.findIndex((k: any) => k.keyword === 'presidential_debate');

  if (index === -1) {
    console.log('❌ presidential_debate not found');
    process.exit(1);
  }

  console.log(`Found at index ${index}:`, keywords[index]);

  keywords[index] = {
    keyword: 'midterm_election',
    description: 'Congressional midterm elections determining control of House and Senate chambers'
  };

  console.log('Replaced with:', keywords[index]);

  await docRef.update({
    keywords: keywords,
    lastUpdated: admin.firestore.FieldValue.serverTimestamp()
  });

  console.log('\n✅ Successfully updated POLITICS keywords!');
  process.exit(0);
}

updateKeyword().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
