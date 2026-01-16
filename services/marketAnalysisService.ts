/**
 * Market Analysis Service
 * Generates AI-powered daily market analysis using Gemini API
 */

export interface MarketStock {
  symbol: string;
  name: string;
  price: number;
  change: number;
  alignment: 'HIGH' | 'LOW';
}

export interface MarketAnalysisResult {
  explanation: string;
  generatedAt: Date;
}

// Language code to full name mapping for AI prompts
// Supports both uppercase (from Language enum) and lowercase
const LANGUAGE_NAMES: Record<string, string> = {
  'en': 'English',
  'EN': 'English',
  'zh': 'Chinese (Simplified)',
  'ZH': 'Chinese (Simplified)',
  'ja': 'Japanese',
  'JA': 'Japanese',
  'fr': 'French',
  'FR': 'French',
  'es': 'Spanish',
  'ES': 'Spanish'
};

/**
 * Generate AI-powered explanation for why today's stocks performed the way they did
 * @param stocks - Array of market stocks with current prices and changes
 * @param personaLabel - User's political persona label (e.g., "Socialist-Nationalist")
 * @param language - Language code for the response (en, zh, ja, fr, es)
 * @returns Explanation text
 */
export const generateTodayAnalysis = async (
  stocks: MarketStock[],
  personaLabel: string,
  language: string = 'en'
): Promise<MarketAnalysisResult> => {
  try {
    // Import dynamically to avoid circular dependency
    const { GoogleGenAI } = await import('@google/genai');

    // Get API key from environment
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY not configured');
    }

    const ai = new GoogleGenAI({ apiKey });

    // Separate aligned (HIGH) and opposed (LOW) stocks
    const alignedStocks = stocks.filter(s => s.alignment === 'HIGH');
    const opposedStocks = stocks.filter(s => s.alignment === 'LOW');

    // Calculate overall performance for aligned vs opposed
    const alignedAvgChange = alignedStocks.reduce((sum: number, s) => sum + s.change, 0) / (alignedStocks.length || 1);
    const opposedAvgChange = opposedStocks.reduce((sum: number, s) => sum + s.change, 0) / (opposedStocks.length || 1);
    const overallPerformance = alignedAvgChange - opposedAvgChange;

    // Format stock data for the prompt
    const alignedList = alignedStocks.map(s =>
      `${s.symbol} (${s.name}): ${s.change > 0 ? '+' : ''}${s.change.toFixed(2)}%`
    ).join(', ');

    const opposedList = opposedStocks.map(s =>
      `${s.symbol} (${s.name}): ${s.change > 0 ? '+' : ''}${s.change.toFixed(2)}%`
    ).join(', ');

    const targetLanguage = LANGUAGE_NAMES[language] || 'English';

    // Define minimum character counts per language to ensure consistent output length
    const minChars: Record<string, number> = {
      'English': 150,
      'Chinese (Simplified)': 300,
      'Japanese': 250,
      'French': 150,
      'Spanish': 150
    };
    const targetMinChars = minChars[targetLanguage] || 400;

    const prompt = `You are a financial analyst explaining today's market movements to a user with "${personaLabel}" political values.

Today's market data:

ALIGNED POSITIONS (support these companies):
${alignedList}
Average change: ${alignedAvgChange > 0 ? '+' : ''}${alignedAvgChange.toFixed(2)}%

OPPOSED POSITIONS (oppose these companies):
${opposedList}
Average change: ${opposedAvgChange > 0 ? '+' : ''}${opposedAvgChange.toFixed(2)}%

Overall alignment performance: ${overallPerformance > 0 ? '+' : ''}${overallPerformance.toFixed(2)}%

Generate a 3-4 sentence explanation of WHY the market performed this way today. Focus on:
1. The sector or industry trends that affected these stocks
2. How the performance aligns with the user's values (${personaLabel})
3. Keep it factual and educational, not prescriptive

CRITICAL REQUIREMENTS:
- Write your response ONLY in ${targetLanguage}
- Your response MUST be at least ${targetMinChars} characters long
- Be conversational and directly answer "why today?"
- Do not use bullet points, just flowing prose`;

    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt
    });

    const text = result.text?.trim() || 'Market analysis unavailable';

    return {
      explanation: text,
      generatedAt: new Date()
    };
  } catch (error) {
    console.error('Error generating today analysis:', error);
    // Return fallback explanation
    return {
      explanation: `Energy & Financial sector outperformance created drag on ${personaLabel} aligned positions.`,
      generatedAt: new Date()
    };
  }
};
