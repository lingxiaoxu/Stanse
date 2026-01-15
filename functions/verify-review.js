const admin = require('firebase-admin');
if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'stanseproject' });
}
const db = admin.firestore();

async function verify() {
  console.log('Verifying review results for q001, q002, q010, q020...\n');

  const questions = ['q001', 'q002', 'q010', 'q020'];

  for (const qid of questions) {
    const doc = await db.collection('duel_questions').doc(qid).get();
    if (doc.exists) {
      const data = doc.data();

      console.log(`\n${qid} - ${data.stem}`);
      console.log(`  defective: ${data.defective}`);
      console.log(`  defectiveOptions: [${data.defectiveOptions}]`);
      console.log(`  selectedImages: ${data.selectedImages ? data.selectedImages.length : 0}/4`);
      console.log(`  images[].url filled: ${data.images ? data.images.filter(i => i.url).length : 0}/4`);
      console.log(`  metadata.imageGenModel: ${data.metadata ? data.metadata.imageGenModel : 'empty'}`);

      if (data.selectedImages && data.selectedImages.length > 0) {
        console.log(`  Model usage:`);
        const models = {};
        data.selectedImages.forEach(s => {
          const model = s.model.includes('gemini') ? 'Gemini3' : 'Imagen4';
          models[model] = (models[model] || 0) + 1;
        });
        Object.entries(models).forEach(([m, c]) => console.log(`    ${m}: ${c}/4`));
      }
    }
  }

  process.exit(0);
}
verify();
