import * as functions from 'firebase-functions/v2';
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
 * Analyzes breaking news content using Gemini 2.5 Flash to extract location and assess severity.
 */
async function analyzeBreakingNewsLocation(content: string) {
  const apiKey = await getGeminiApiKey();
  if (!apiKey) {
    throw new Error('Failed to load Gemini API key');
  }

  const ai = new GoogleGenAI({ apiKey });

  const prompt = `
You are analyzing a BREAKING NEWS event. Extract location and assess severity.

Breaking News:
${content}

Extract:
1. Geographic location (Country → State → City)
2. Coordinates
3. Confidence level
4. Event severity (CRITICAL/HIGH/MEDIUM)
5. Brief summary of the breaking event (max 100 chars)
6. Location context

Return ONLY valid JSON:
{
  "country": "Country Name",
  "countryCode": "ISO code",
  "state": "State or null",
  "city": "City or null",
  "coordinates": {
    "latitude": 0.0,
    "longitude": 0.0
  },
  "confidence": "HIGH|MEDIUM|LOW",
  "specificityLevel": "CITY|STATE|COUNTRY",
  "locationSummary": "Location context",
  "breakingSummary": "Brief event summary",
  "severity": "CRITICAL|HIGH|MEDIUM"
}
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

  // Clean response
  let cleanedResponse = response?.trim() || '';
  cleanedResponse = cleanedResponse.replace(/```json\s*/g, '').replace(/```\s*/g, '');

  const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error('Failed to parse AI response:', cleanedResponse);
    throw new Error('Failed to parse breaking news location');
  }

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

  // Validate coordinates are not null
  if (!parsed.coordinates?.latitude || !parsed.coordinates?.longitude ||
      parsed.coordinates.latitude === null || parsed.coordinates.longitude === null ||
      typeof parsed.coordinates.latitude !== 'number' ||
      typeof parsed.coordinates.longitude !== 'number') {
    throw new Error('Invalid or null coordinates in response');
  }

  // Normalize fields
  if (parsed.confidence) parsed.confidence = parsed.confidence.toUpperCase();
  if (parsed.severity) parsed.severity = parsed.severity.toUpperCase();
  if (parsed.specificityLevel) parsed.specificityLevel = parsed.specificityLevel.toUpperCase();

  return parsed;
}

/**
 * Triggered when a new breaking news notification is created.
 * Similar to onNewsCreated but includes severity assessment.
 */
export const onBreakingNewsCreated = functions.firestore.onDocumentCreated(
  {
    document: 'breaking_news_notifications/{breakingId}',
    region: 'us-central1',
    timeoutSeconds: 60,
    memory: '512MiB'
  },
  async (event) => {
    const startTime = Date.now();
    const breakingId = event.params.breakingId;
    const breakingData = event.data?.data();

    if (!breakingData) {
      console.log('❌ No data in breaking news document:', breakingId);
      return;
    }

    try {
      const content = `
Title: ${breakingData.title || ''}
Description: ${breakingData.description || ''}
Content: ${breakingData.content || breakingData.summary || ''}
      `.trim();

      console.log(`🚨 Analyzing location for breaking news: ${breakingId}`);

      // Call Gemini for location + severity analysis
      const locationData = await analyzeBreakingNewsLocation(content);

      const db = admin.firestore();
      await db
        .collection('breaking_news_locations')
        .doc(breakingId)
        .set({
          breakingNewsId: breakingId,
          ...locationData,
          analyzedAt: admin.firestore.FieldValue.serverTimestamp(),
          aiModel: 'gemini-2.5-flash',
          processingTimeMs: Date.now() - startTime,
        });

      console.log(`✅ Location analyzed for breaking news ${breakingId}: ${locationData.country}, Severity: ${locationData.severity}`);
    } catch (error: any) {
      console.error(`❌ Failed to analyze breaking news location ${breakingId}:`, error);
      // Don't create error record - allow retry
    }
  }
);
