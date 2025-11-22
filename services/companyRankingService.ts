import { GoogleGenAI, Type, Schema } from "@google/genai";
import { SP500_COMPANIES, StanceType, STANCE_TYPES, getStanceType } from '../data/sp500Companies';
import {
  getCompanyRankingsFromCache,
  saveCompanyRankingsToCache,
  RankedCompany,
  CompanyRanking
} from './companyRankingCache';

// Get base URL for API proxy in production
const getBaseUrl = () => {
  if (typeof window === 'undefined') return undefined;
  if (window.location.hostname === 'localhost') return undefined;
  return `${window.location.origin}/api/gemini`;
};

// Initialize Gemini Client with proxy for production (CORS workaround)
const baseUrl = getBaseUrl();
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
  httpOptions: baseUrl ? { baseUrl } : undefined
});

/**
 * Get stance description for prompt
 */
const getStanceDescription = (stanceType: StanceType): string => {
  const descriptions: Record<StanceType, string> = {
    'progressive-globalist': 'Values: Left-leaning economics (supports regulation, workers rights, wealth redistribution), Progressive social values (diversity, LGBTQ+ rights, environmental protection), Pro-international cooperation and globalization',
    'progressive-nationalist': 'Values: Left-leaning economics (supports regulation, workers rights), Progressive social values (diversity, environmental protection), but prioritizes domestic focus over international involvement',
    'socialist-libertarian': 'Values: Left-leaning economics (state intervention, public services), Traditional/conservative social values, Pro-international cooperation',
    'socialist-nationalist': 'Values: Left-leaning economics (protectionism, state control), Traditional social values, Strong nationalist/isolationist stance',
    'capitalist-globalist': 'Values: Free market capitalism (deregulation, low taxes), Progressive social values (diversity, innovation), Strong support for global trade and international cooperation',
    'capitalist-nationalist': 'Values: Free market capitalism domestically, Progressive social values, but "America First" approach - prioritizes domestic industry, skeptical of foreign involvement',
    'conservative-globalist': 'Values: Free market capitalism, Traditional/conservative social values, Pro-international trade and military alliances (neoconservative)',
    'conservative-nationalist': 'Values: Free market capitalism, Traditional/conservative social values, Nationalist approach prioritizing domestic concerns over international involvement'
  };
  return descriptions[stanceType];
};

/**
 * Rank companies using AI with search grounding for recent news
 */
export const rankCompaniesForStance = async (
  stanceType: StanceType,
  forceRefresh: boolean = false
): Promise<CompanyRanking> => {
  // Check cache first (unless force refresh)
  if (!forceRefresh) {
    const cached = await getCompanyRankingsFromCache(stanceType);
    if (cached) {
      console.log('Returning cached company rankings for:', stanceType);
      return cached;
    }
  }

  console.log('Generating new company rankings for:', stanceType);
  const stanceDescription = getStanceDescription(stanceType);
  const companyList = SP500_COMPANIES.map(c => `${c.symbol}: ${c.name} (${c.sector})`).join('\n');

  const prompt = `
    === COMPANY VALUES ALIGNMENT ANALYSIS ===

    Analyze S&P 500 companies for alignment with this political/values profile:
    ${stanceDescription}

    COMPANIES:
    ${companyList}

    ANALYSIS CRITERIA (use recent news from last 30 days):
    - Corporate political donations and lobbying
    - CEO public statements and social media
    - ESG practices, labor practices
    - International vs domestic focus
    - Political controversies

    Score each 0-100 (100 = perfectly aligned, 0 = completely opposed).
    Return TOP 5 to SUPPORT (highest) and TOP 5 to OPPOSE (lowest).
  `;

  const responseSchema: Schema = {
    type: Type.OBJECT,
    properties: {
      supportCompanies: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            symbol: { type: Type.STRING },
            name: { type: Type.STRING },
            sector: { type: Type.STRING },
            score: { type: Type.NUMBER },
            reasoning: { type: Type.STRING }
          },
          required: ['symbol', 'name', 'sector', 'score', 'reasoning']
        }
      },
      opposeCompanies: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            symbol: { type: Type.STRING },
            name: { type: Type.STRING },
            sector: { type: Type.STRING },
            score: { type: Type.NUMBER },
            reasoning: { type: Type.STRING }
          },
          required: ['symbol', 'name', 'sector', 'score', 'reasoning']
        }
      }
    },
    required: ['supportCompanies', 'opposeCompanies']
  };

  try {
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

    const supportCompanies: RankedCompany[] = (result.supportCompanies || [])
      .slice(0, 5)
      .map((c: any) => ({
        symbol: c.symbol,
        name: c.name,
        sector: c.sector,
        score: Math.min(100, Math.max(0, c.score)),
        reasoning: c.reasoning
      }));

    const opposeCompanies: RankedCompany[] = (result.opposeCompanies || [])
      .slice(0, 5)
      .map((c: any) => ({
        symbol: c.symbol,
        name: c.name,
        sector: c.sector,
        score: Math.min(100, Math.max(0, c.score)),
        reasoning: c.reasoning
      }));

    const ranking = { stanceType, supportCompanies, opposeCompanies };
    await saveCompanyRankingsToCache(ranking);

    return {
      ...ranking,
      updatedAt: new Date(),
      expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000)
    };

  } catch (error: any) {
    console.error('Error ranking companies:', error);
    return getFallbackRankings(stanceType);
  }
};

/**
 * Fallback rankings if AI fails
 */
const getFallbackRankings = (stanceType: StanceType): CompanyRanking => {
  const fallbacks: Record<StanceType, { support: string[]; oppose: string[] }> = {
    'progressive-globalist': {
      support: ['TSLA', 'CRM', 'NFLX', 'NKE', 'SBUX'],
      oppose: ['XOM', 'CVX', 'LMT', 'RTX', 'NOC']
    },
    'progressive-nationalist': {
      support: ['COST', 'HD', 'CAT', 'DE', 'GE'],
      oppose: ['XOM', 'CVX', 'BA', 'LMT', 'RTX']
    },
    'socialist-libertarian': {
      support: ['JNJ', 'PG', 'KO', 'WMT', 'CVS'],
      oppose: ['GS', 'JPM', 'BLK', 'MS', 'C']
    },
    'socialist-nationalist': {
      support: ['CAT', 'DE', 'GE', 'HD', 'LOW'],
      oppose: ['AAPL', 'NVDA', 'AMZN', 'META', 'GOOGL']
    },
    'capitalist-globalist': {
      support: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'V'],
      oppose: ['GD', 'NOC', 'RTX', 'LMT', 'BA']
    },
    'capitalist-nationalist': {
      support: ['XOM', 'CVX', 'LMT', 'RTX', 'CAT'],
      oppose: ['DIS', 'NFLX', 'META', 'NKE', 'SBUX']
    },
    'conservative-globalist': {
      support: ['JPM', 'GS', 'BLK', 'V', 'MA'],
      oppose: ['TSLA', 'NFLX', 'DIS', 'NKE', 'SBUX']
    },
    'conservative-nationalist': {
      support: ['XOM', 'CVX', 'LMT', 'CAT', 'DE'],
      oppose: ['META', 'DIS', 'NFLX', 'NKE', 'SBUX']
    }
  };

  const fallback = fallbacks[stanceType] || fallbacks['capitalist-globalist'];

  const getCompanyDetails = (symbol: string, isSupport: boolean): RankedCompany => {
    const company = SP500_COMPANIES.find(c => c.symbol === symbol);
    return {
      symbol,
      name: company?.name || symbol,
      sector: company?.sector || 'Unknown',
      score: isSupport ? 85 : 15,
      reasoning: 'Based on general political alignment'
    };
  };

  return {
    stanceType,
    supportCompanies: fallback.support.map(s => getCompanyDetails(s, true)),
    opposeCompanies: fallback.oppose.map(s => getCompanyDetails(s, false)),
    updatedAt: new Date(),
    expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000)
  };
};

/**
 * Get company rankings for a user based on their political coordinates
 */
export const getCompanyRankingsForUser = async (
  economic: number,
  social: number,
  diplomatic: number
): Promise<CompanyRanking> => {
  const stanceType = getStanceType(economic, social, diplomatic);
  return rankCompaniesForStance(stanceType);
};