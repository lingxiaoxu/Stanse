
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { BrandAlignment, PoliticalCoordinates } from "../types";

// Initialize Gemini Client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

/**
 * Analyzes a brand OR individual against user values using Search Grounding.
 */
export const analyzeBrandAlignment = async (
  entityName: string,
  userProfile: PoliticalCoordinates
): Promise<BrandAlignment> => {
  try {
    const prompt = `
      Conduct a deep-dive intelligence report on "${entityName}" (Company, Public Figure, or CEO).
      
      User Profile Context:
      - Economic: ${userProfile.economic} (-100 Socialist <-> 100 Capitalist)
      - Social: ${userProfile.social} (-100 Authoritarian <-> 100 Libertarian)
      - Diplomatic: ${userProfile.diplomatic} (-100 Nationalist <-> 100 Globalist)

      Objectives:
      1. Analyze recent news, donations, and corporate actions.
      2. **CRITICAL**: Analyze recent public statements, tweets, and rhetoric on X (formerly Twitter). Summarize the "Social Signal".
      3. Determine alignment score (0-100).
      
      Output Format (JSON):
      - 'reportSummary': Professional, objective intelligence summary (Max 30 words).
      - 'socialSignal': Analysis of their recent Twitter/X presence and public rhetoric. What signals are they sending? (Max 25 words).
      - 'keyConflicts': Max 2 specific points of friction with user values.
      - 'keyAlignments': Max 2 specific points of resonance.
      - 'alternatives': Suggest 2 alternatives if score < 50.
    `;

    const responseSchema: Schema = {
      type: Type.OBJECT,
      properties: {
        brandName: { type: Type.STRING },
        score: { type: Type.NUMBER },
        status: { type: Type.STRING, enum: ['MATCH', 'CONFLICT', 'NEUTRAL'] },
        reportSummary: { type: Type.STRING },
        socialSignal: { type: Type.STRING },
        keyConflicts: { 
            type: Type.ARRAY,
            items: { type: Type.STRING }
        },
        keyAlignments: { 
            type: Type.ARRAY,
            items: { type: Type.STRING }
        },
        alternatives: { 
          type: Type.ARRAY, 
          items: { type: Type.STRING } 
        },
      },
      required: ['brandName', 'score', 'status', 'reportSummary', 'socialSignal', 'keyConflicts', 'keyAlignments']
    };

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: responseSchema,
      }
    });

    const result = JSON.parse(response.text || '{}');
    
    // Extract sources from grounding chunks
    const sources: string[] = [];
    if (response.candidates?.[0]?.groundingMetadata?.groundingChunks) {
      response.candidates[0].groundingMetadata.groundingChunks.forEach((chunk: any) => {
        if (chunk.web?.uri) {
          sources.push(chunk.web.uri);
        }
      });
    }

    return {
      ...result,
      reasoning: result.reportSummary, // Fallback
      sources: sources.slice(0, 3) // Top 3 sources
    };

  } catch (error) {
    console.error("Gemini Brand Analysis Error:", error);
    // Fallback mock for demo purposes if API fails or key missing
    return {
      brandName: entityName,
      score: 50,
      status: 'NEUTRAL',
      reportSummary: "Unable to establish secure connection to intelligence network.",
      socialSignal: "Signal lost.",
      keyConflicts: ["Data Unavailable"],
      keyAlignments: ["Data Unavailable"],
      reasoning: "Error",
      sources: []
    };
  }
};

/**
 * Generates a "Prism Summary" for a news topic using Gemini Pro (for deeper reasoning).
 */
export const generatePrismSummary = async (topic: string) => {
    try {
        const prompt = `
          Provide a 'Prism Summary' for the topic: "${topic}".
          I need three distinct perspectives:
          1. Support/Proponent narrative.
          2. Oppose/Critic narrative.
          3. Neutral/Objective observer narrative.
          Keep each section under 40 words.
        `;

        const responseSchema: Schema = {
            type: Type.OBJECT,
            properties: {
                support: { type: Type.STRING },
                oppose: { type: Type.STRING },
                neutral: { type: Type.STRING }
            },
            required: ['support', 'oppose', 'neutral']
        };

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash', // Flash is sufficient and faster
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: responseSchema,
                systemInstruction: "You are an objective political analyst translating complex events into clear narratives."
            }
        });
        
        return JSON.parse(response.text || '{}');
    } catch (error) {
        console.error("Gemini Prism Error:", error);
        return {
            support: "Data unavailable.",
            oppose: "Data unavailable.",
            neutral: "Data unavailable."
        };
    }
};

/**
 * Updates the political fingerprint based on a user action/swipe.
 * In a real app, this would likely be a heavier calculation.
 */
export const calculatePersona = async (coords: PoliticalCoordinates): Promise<string> => {
    try {
        const prompt = `
            Based on these coordinates:
            Economic: ${coords.economic} (-100 Socialist, 100 Capitalist)
            Social: ${coords.social} (-100 Auth, 100 Lib)
            Diplomatic: ${coords.diplomatic} (-100 National, 100 Global)
            
            Give me a 3-5 word creative political persona label. E.g., "Pragmatic Globalist", "Eco-Conservative".
        `;
        
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });

        return response.text?.trim() || "Undefined Observer";
    } catch (e) {
        return "Anonymous User";
    }
};
