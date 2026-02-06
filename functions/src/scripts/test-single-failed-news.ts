import * as admin from 'firebase-admin';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { GoogleGenAI } from "@google/genai";

const secretClient = new SecretManagerServiceClient();

async function getKey() {
  const [version] = await secretClient.accessSecretVersion({
    name: 'projects/gen-lang-client-0960644135/secrets/gemini-api-key/versions/latest',
  });
  return version.payload?.data?.toString() || '';
}

async function testFailedNews() {
  admin.initializeApp({
    projectId: 'stanseproject',
    databaseURL: 'https://stanseproject.firebaseio.com'
  });

  const db = admin.firestore();
  const newsDoc = await db.collection('news').doc('zh5x68').get();
  const data = newsDoc.data()!;

  const content = `Title: ${data.title}\nSummary: ${data.summary}`;
  console.log('Testing news zh5x68');
  console.log('Content length:', content.length, 'chars');
  console.log('Content:', content.substring(0, 150));
  console.log('\n━━━━━━━━━━━━━━━━━━\n');

  const apiKey = await getKey();
  const ai = new GoogleGenAI({ apiKey });

  // Ultra simple prompt
  const result = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `Return JSON with country, countryCode, coordinates(lat,lng), confidence, specificityLevel, locationSummary for: ${content}`,
    config: {
      temperature: 0,
      maxOutputTokens: 4096,
      responseMimeType: 'application/json'
    }
  });

  console.log('Response length:', result.text?.length);
  console.log('Response:', result.text);

  try {
    const parsed = JSON.parse(result.text || '{}');
    console.log('\n✅ Parsed:', JSON.stringify(parsed, null, 2));
  } catch (e: any) {
    console.log('\n❌ Parse failed:', e.message);
  }
}

testFailedNews().then(() => process.exit(0)).catch(e => {console.error(e); process.exit(1);});
