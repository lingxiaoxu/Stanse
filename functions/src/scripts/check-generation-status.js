const admin = require('firebase-admin');
if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'stanseproject' });
}
const db = admin.firestore();

async function check() {
  console.log('Checking q001-q020 generation status...\n');

  let complete = 0;
  let partial = 0;
  let missing = 0;

  for (let i = 1; i <= 20; i++) {
    const qid = 'q' + String(i).padStart(3, '0');
    const doc = await db.collection('duel_questions').doc(qid).get();

    if (doc.exists) {
      const data = doc.data();
      const g3 = data.generatedImages?.gemini3?.filter(i => i.url).length || 0;
      const i4 = data.generatedImages?.imagen4?.filter(i => i.url).length || 0;

      let status = '';
      if (g3 === 4 && i4 === 4) {
        status = '✅';
        complete++;
      } else if (g3 > 0 || i4 > 0) {
        status = '⚠️ ';
        partial++;
      } else {
        status = '❌';
        missing++;
      }

      console.log(`${status} ${qid}: Gemini3=${g3}/4, Imagen4=${i4}/4`);
    } else {
      console.log(`❌ ${qid}: Not found`);
      missing++;
    }
  }

  console.log('\n===================');
  console.log(`Complete: ${complete}/20`);
  console.log(`Partial: ${partial}/20`);
  console.log(`Missing: ${missing}/20`);

  process.exit(0);
}
check();
