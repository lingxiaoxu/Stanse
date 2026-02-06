/**
 * Retry failed news location analyses
 *
 * This script finds news_locations documents with error:true and retries them
 *
 * Run: npx ts-node src/scripts/retry-failed-news-locations.ts
 */
import * as admin from 'firebase-admin';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { GoogleGenAI } from "@google/genai";

const secretClient = new SecretManagerServiceClient();
const CLOUD_RUN_PROJECT_ID = 'gen-lang-client-0960644135';
const GEMINI_SECRET_NAME = 'gemini-api-key';

let geminiApiKey: string | null = null;

async function getGeminiApiKey(): Promise<string> {
  if (geminiApiKey) return geminiApiKey;

  try {
    const [version] = await secretClient.accessSecretVersion({
      name: `projects/${CLOUD_RUN_PROJECT_ID}/secrets/${GEMINI_SECRET_NAME}/versions/latest`,
    });
    const payload = version.payload?.data?.toString();
    if (payload) {
      geminiApiKey = payload;
      console.log('✅ Gemini API key loaded from Secret Manager');
      return payload;
    }
  } catch (error) {
    console.error('Failed to load Gemini API key from Secret Manager:', error);
  }
  return '';
}

async function analyzeNewsLocation(content: string) {
  const apiKey = await getGeminiApiKey();
  if (!apiKey) throw new Error('Failed to load Gemini API key');

  const ai = new GoogleGenAI({ apiKey });

  const prompt = `You are a geolocation expert. Analyze the news and return location as pure JSON.

News: ${content}

Return ONLY this JSON structure:
{
  "country": "Country Name",
  "countryCode": "ISO code",
  "state": null,
  "city": "City or null",
  "coordinates": {"latitude": 0.0, "longitude": 0.0},
  "confidence": "HIGH",
  "specificityLevel": "CITY",
  "locationSummary": "Brief context"
}`;

  const result = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: {
      temperature: 0.1,
      maxOutputTokens: 1200,
      responseMimeType: 'application/json'
    }
  });

  return JSON.parse(result.text || '{}');
}

async function retryFailedNewsLocations() {
  console.log('🔄 Retrying failed news locations...\n');

  if (!admin.apps.length) {
    admin.initializeApp({
      projectId: 'stanseproject',
      databaseURL: 'https://stanseproject.firebaseio.com'
    });
  }

  const db = admin.firestore();

  try {
    // Find all news_locations with error:true
    const errorSnapshot = await db.collection('news_locations')
      .where('error', '==', true)
      .get();

    console.log(`Found ${errorSnapshot.size} failed news locations to retry\n`);

    let succeeded = 0;
    let failed = 0;

    for (const doc of errorSnapshot.docs) {
      const newsId = doc.data().newsId;

      try {
        // Get original news content
        const newsDoc = await db.collection('news').doc(newsId).get();
        if (!newsDoc.exists) {
          console.log(`⚠️  News ${newsId.substring(0, 10)} not found, skipping`);
          continue;
        }

        const newsData = newsDoc.data()!;
        const content = `Title: ${newsData.title || ''}\nSummary: ${newsData.summary || ''}`.trim();

        console.log(`🔄 Retrying ${newsId.substring(0, 10)}...`);
        const startTime = Date.now();

        const locationData = await analyzeNewsLocation(content);

        // Update with successful data
        await db.collection('news_locations').doc(newsId).set({
          newsId,
          ...locationData,
          analyzedAt: admin.firestore.FieldValue.serverTimestamp(),
          aiModel: 'gemini-2.5-flash',
          processingTimeMs: Date.now() - startTime,
          error: false,
        });

        console.log(`✅ Success: ${locationData.country} (${Date.now() - startTime}ms)\n`);
        succeeded++;

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error: any) {
        console.error(`❌ Still failed for ${newsId.substring(0, 10)}:`, error.message);
        failed++;
      }
    }

    console.log('\n✅ Retry complete!');
    console.log(`Succeeded: ${succeeded}`);
    console.log(`Still failed: ${failed}`);

  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

retryFailedNewsLocations()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('💥 Failed:', error);
    process.exit(1);
  });
