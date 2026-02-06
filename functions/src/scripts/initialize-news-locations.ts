/**
 * One-time batch script to initialize location data for existing news articles.
 *
 * This script:
 * 1. Fetches all news articles without location records
 * 2. Analyzes each news article using Gemini 2.5 Flash
 * 3. Stores location in news_locations collection
 *
 * Run: npx ts-node src/scripts/initialize-news-locations.ts
 */
import * as admin from 'firebase-admin';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { GoogleGenAI } from "@google/genai";

const secretClient = new SecretManagerServiceClient();
const CLOUD_RUN_PROJECT_ID = 'gen-lang-client-0960644135';
const GEMINI_SECRET_NAME = 'gemini-api-key';

// Cache for Gemini API key
let geminiApiKey: string | null = null;

/**
 * Get Gemini API key from Google Secret Manager
 */
async function getGeminiApiKey(): Promise<string> {
  if (geminiApiKey) {
    return geminiApiKey;
  }

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

/**
 * Analyzes news content using Gemini 2.5 Flash to extract location.
 */
async function analyzeNewsLocation(content: string, retries = 5): Promise<any> {
  const apiKey = await getGeminiApiKey();
  if (!apiKey) {
    throw new Error('Failed to load Gemini API key');
  }

  const ai = new GoogleGenAI({ apiKey });

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await attemptAnalysis(ai, content);
    } catch (error: any) {
      if (attempt === retries) throw error;
      console.log(`  ⚠️  Attempt ${attempt} failed, retrying...`);
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s before retry
    }
  }
  throw new Error('All retries failed');
}

async function attemptAnalysis(ai: any, content: string) {

  const prompt = `
You are a geolocation expert. Analyze the following news article and determine its primary geographic location.

IMPORTANT: Return ONLY pure JSON, no markdown, no code blocks, no explanations.

News Article:
${content}

Extract:
1. Country (required)
2. State/Province (if mentioned or determinable)
3. City (if mentioned or determinable)
4. Precise latitude and longitude coordinates for the most specific location you can determine
5. Your confidence level in this location assessment
6. A brief location context (1 sentence)

Use null for missing values, not the string "null".

Return format (PURE JSON ONLY):
{
  "country": "Country Name",
  "countryCode": "ISO 3166-1 alpha-2 code",
  "state": "State/Province or null",
  "city": "City name or null",
  "coordinates": {
    "latitude": 0.0,
    "longitude": 0.0
  },
  "confidence": "HIGH|MEDIUM|LOW",
  "specificityLevel": "CITY|STATE|COUNTRY",
  "locationSummary": "Brief context about this location"
}

If the article doesn't have a clear geographic location, use the country most relevant to the story.
`;

  const result = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: {
      temperature: 0.1,
      maxOutputTokens: 4096,
      responseMimeType: 'application/json'
    }
  });

  const response = result.text;

  // Clean response - remove markdown code blocks if present
  let cleanedResponse = response?.trim() || '';
  cleanedResponse = cleanedResponse.replace(/```json\s*/g, '').replace(/```\s*/g, '');

  // Parse JSON response
  const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);

  if (!jsonMatch) {
    console.error('Failed to parse AI response:', cleanedResponse);
    throw new Error('Failed to parse location data from AI response');
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);

    // Normalize field names (lat/lng → latitude/longitude)
    if (parsed.coordinates) {
      if (parsed.coordinates.lat !== undefined) {
        parsed.coordinates.latitude = parsed.coordinates.lat;
        delete parsed.coordinates.lat;
      }
      if (parsed.coordinates.lng !== undefined) {
        parsed.coordinates.longitude = parsed.coordinates.lng;
        delete parsed.coordinates.lng;
      }
    }

    // Normalize confidence (High → HIGH)
    if (parsed.confidence) {
      parsed.confidence = parsed.confidence.toUpperCase();
    }

    // Normalize specificityLevel (Continent → COUNTRY, etc.)
    if (parsed.specificityLevel) {
      parsed.specificityLevel = parsed.specificityLevel.toUpperCase();
      if (parsed.specificityLevel === 'CONTINENT') {
        parsed.specificityLevel = 'COUNTRY';
      }
    }

    return parsed;
  } catch (parseError: any) {
    console.error('JSON parse error:', parseError.message);
    console.error('Attempted to parse:', jsonMatch[0].substring(0, 200));
    throw new Error('Failed to parse location data: ' + parseError.message);
  }
}

/**
 * Main initialization function
 */
async function initializeNewsLocations() {
  console.log('🚀 Starting news location initialization...\n');

  // Initialize Firebase Admin if not already initialized
  if (!admin.apps.length) {
    admin.initializeApp({
      projectId: 'stanseproject',
      databaseURL: 'https://stanseproject.firebaseio.com'
    });

    console.log('✅ Firebase Admin initialized for project: stanseproject\n');
  }

  const db = admin.firestore();

  try {
    // Fetch all news articles
    // Try with 'date' field (actual field name) instead of 'publishedAt'
    const newsSnapshot = await db.collection('news')
      .orderBy('date', 'desc')
      .limit(200) // Process most recent 100 news first
      .get()
      .catch(async () => {
        // If date field doesn't have index, just get first 100
        console.log('⚠️  No index on date field, fetching without ordering...');
        return db.collection('news').limit(100).get();
      });

    console.log(`Found ${newsSnapshot.size} news articles to process\n`);

    let processed = 0;
    let succeeded = 0;
    let failed = 0;
    let skipped = 0;

    for (const newsDoc of newsSnapshot.docs) {
      const newsId = newsDoc.id;
      const newsData = newsDoc.data();

      // Check if location already exists
      const existingLocation = await db.collection('news_locations').doc(newsId).get();
      if (existingLocation.exists) {
        console.log(`⏭️  Skipping ${newsId} - already has location data`);
        skipped++;
        continue;
      }

      try {
        console.log(`📍 Processing news ${newsId.substring(0, 10)}...`);
        const startTime = Date.now();

        // Extract news content
        const content = `
Title: ${newsData.title || ''}
Description: ${newsData.description || ''}
Content: ${newsData.content || newsData.summary || ''}
        `.trim();

        // Analyze location
        const locationData = await analyzeNewsLocation(content);

        // Store in news_locations collection
        await db
          .collection('news_locations')
          .doc(newsId)
          .set({
            newsId,
            ...locationData,
            analyzedAt: admin.firestore.FieldValue.serverTimestamp(),
            aiModel: 'gemini-2.5-flash',
            processingTimeMs: Date.now() - startTime,
          });

        console.log(`✅ Success: ${locationData.country}, ${locationData.city || locationData.state || 'N/A'} (${Date.now() - startTime}ms)\n`);
        succeeded++;

      } catch (error: any) {
        console.error(`❌ Failed for ${newsId}:`, error.message);
        // Don't create error record - allow retry on next run
        failed++;
      }

      processed++;

      // Rate limiting: wait 1 second between requests
      if (processed % 20 === 0) {
        console.log(`\n--- Progress: ${processed}/${newsSnapshot.size} (${succeeded} succeeded, ${failed} failed, ${skipped} skipped) ---\n`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log('\n✅ Initialization complete!');
    console.log(`Total news: ${newsSnapshot.size}`);
    console.log(`Processed: ${processed}`);
    console.log(`Succeeded: ${succeeded}`);
    console.log(`Failed: ${failed}`);
    console.log(`Skipped: ${skipped}`);

  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

// Run the script
initializeNewsLocations()
  .then(() => {
    console.log('\n🎉 Script completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n💥 Script failed:', error);
    process.exit(1);
  });
