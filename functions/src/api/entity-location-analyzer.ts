import * as functions from 'firebase-functions/v2';
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
 * Analyzes the geographic location of a searched entity.
 * Used when user searches for a person, company, or organization.
 */
export const analyzeEntityLocation = functions.https.onCall(
  async (request) => {
    const { entityName, entityType } = request.data;

    if (!entityName) {
      throw new functions.https.HttpsError('invalid-argument', 'Entity name is required');
    }

    try {
      const apiKey = await getGeminiApiKey();
      if (!apiKey) {
        throw new Error('Failed to load Gemini API key');
      }

      const ai = new GoogleGenAI({ apiKey });

      const prompt = `
You are a geolocation expert. Determine the primary geographic location associated with this entity.

Entity: ${entityName}
Type: ${entityType || 'Unknown'}

For a person: Their primary residence or headquarters
For a company: Headquarters location
For an organization: Main office or operational center

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
  "locationSummary": "Brief context about this location",
  "entitySummary": "Brief 1-sentence summary of the entity"
}
`;

      const result = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          temperature: 0.3,
          maxOutputTokens: 800,
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
        throw new Error('Failed to parse entity location');
      }

      try {
        return {
          success: true,
          data: JSON.parse(jsonMatch[0]),
        };
      } catch (parseError: any) {
        console.error('JSON parse error:', parseError.message);
        throw new Error('Failed to parse entity location: ' + parseError.message);
      }

    } catch (error: any) {
      console.error('Error analyzing entity location:', error);
      throw new functions.https.HttpsError('internal', 'Failed to analyze entity location: ' + error.message);
    }
  }
);
