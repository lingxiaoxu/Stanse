import { GoogleGenAI } from "@google/genai";
import { SP500_COMPANIES, StanceType, getStanceType } from '../data/sp500Companies';
import {
  getCompanyRankingsFromCache,
  saveCompanyRankingsToCache,
  RankedCompany,
  CompanyRanking
} from './companyRankingCache';
import { getRecentMixedNews } from './newsCache';

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
 * Uses real news from the last 12 hours to make rankings dynamic
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

  // Get recent news from database to provide context
  let recentNewsContext = '';
  try {
    const recentNews = await getRecentMixedNews(20);
    if (recentNews.length > 0) {
      recentNewsContext = `
      RECENT NEWS CONTEXT (from last 12 hours):
      ${recentNews.map(n => `- [${n.category}] ${n.title}`).join('\n')}
      `;
    }
  } catch (e) {
    console.warn('Could not fetch recent news for ranking context');
  }

  // IMPORTANT: Google Search Grounding does NOT support JSON response format
  // We must use plain text and parse manually
  const prompt = `
    === COMPANY VALUES ALIGNMENT ANALYSIS ===

    Analyze S&P 500 companies for alignment with this political/values profile:
    ${stanceDescription}

    ${recentNewsContext}

    COMPANIES TO ANALYZE:
    ${companyList}

    ANALYSIS CRITERIA (use Google Search for real-time news from last 12 hours):
    - Corporate political donations and lobbying
    - CEO public statements and social media (especially Twitter/X)
    - ESG practices, labor practices
    - International vs domestic focus
    - Recent political controversies or news

    Score each 0-100 (100 = perfectly aligned, 0 = completely opposed).

    Format your response EXACTLY like this:

    ---SUPPORT_COMPANIES---
    1. SYMBOL: [ticker] | NAME: [company name] | SECTOR: [sector] | SCORE: [0-100] | REASON: [brief reason, max 50 chars]
    2. SYMBOL: [ticker] | NAME: [company name] | SECTOR: [sector] | SCORE: [0-100] | REASON: [brief reason]
    3. SYMBOL: [ticker] | NAME: [company name] | SECTOR: [sector] | SCORE: [0-100] | REASON: [brief reason]
    4. SYMBOL: [ticker] | NAME: [company name] | SECTOR: [sector] | SCORE: [0-100] | REASON: [brief reason]
    5. SYMBOL: [ticker] | NAME: [company name] | SECTOR: [sector] | SCORE: [0-100] | REASON: [brief reason]
    ---END_SUPPORT---

    ---OPPOSE_COMPANIES---
    1. SYMBOL: [ticker] | NAME: [company name] | SECTOR: [sector] | SCORE: [0-100] | REASON: [brief reason]
    2. SYMBOL: [ticker] | NAME: [company name] | SECTOR: [sector] | SCORE: [0-100] | REASON: [brief reason]
    3. SYMBOL: [ticker] | NAME: [company name] | SECTOR: [sector] | SCORE: [0-100] | REASON: [brief reason]
    4. SYMBOL: [ticker] | NAME: [company name] | SECTOR: [sector] | SCORE: [0-100] | REASON: [brief reason]
    5. SYMBOL: [ticker] | NAME: [company name] | SECTOR: [sector] | SCORE: [0-100] | REASON: [brief reason]
    ---END_OPPOSE---

    Return TOP 5 to SUPPORT (highest scores) and TOP 5 to OPPOSE (lowest scores).
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      }
    });

    const rawText = response.text || '';
    console.log('Company ranking response length:', rawText.length);

    // Parse support companies
    const supportCompanies: RankedCompany[] = [];
    const supportMatch = rawText.match(/---SUPPORT_COMPANIES---([\s\S]*?)---END_SUPPORT---/);
    if (supportMatch) {
      const lines = supportMatch[1].trim().split('\n').filter(l => l.includes('SYMBOL:'));
      for (const line of lines.slice(0, 5)) {
        const symbolMatch = line.match(/SYMBOL:\s*([A-Z]+)/);
        const nameMatch = line.match(/NAME:\s*([^|]+)/);
        const sectorMatch = line.match(/SECTOR:\s*([^|]+)/);
        const scoreMatch = line.match(/SCORE:\s*(\d+)/);
        const reasonMatch = line.match(/REASON:\s*(.+?)(?:\||$)/);

        if (symbolMatch && nameMatch && scoreMatch) {
          supportCompanies.push({
            symbol: symbolMatch[1].trim(),
            name: nameMatch[1].trim(),
            sector: sectorMatch ? sectorMatch[1].trim() : 'Unknown',
            score: Math.min(100, Math.max(0, parseInt(scoreMatch[1]))),
            reasoning: reasonMatch ? reasonMatch[1].trim() : 'Aligned with values'
          });
        }
      }
    }

    // Parse oppose companies
    const opposeCompanies: RankedCompany[] = [];
    const opposeMatch = rawText.match(/---OPPOSE_COMPANIES---([\s\S]*?)---END_OPPOSE---/);
    if (opposeMatch) {
      const lines = opposeMatch[1].trim().split('\n').filter(l => l.includes('SYMBOL:'));
      for (const line of lines.slice(0, 5)) {
        const symbolMatch = line.match(/SYMBOL:\s*([A-Z]+)/);
        const nameMatch = line.match(/NAME:\s*([^|]+)/);
        const sectorMatch = line.match(/SECTOR:\s*([^|]+)/);
        const scoreMatch = line.match(/SCORE:\s*(\d+)/);
        const reasonMatch = line.match(/REASON:\s*(.+?)(?:\||$)/);

        if (symbolMatch && nameMatch && scoreMatch) {
          opposeCompanies.push({
            symbol: symbolMatch[1].trim(),
            name: nameMatch[1].trim(),
            sector: sectorMatch ? sectorMatch[1].trim() : 'Unknown',
            score: Math.min(100, Math.max(0, parseInt(scoreMatch[1]))),
            reasoning: reasonMatch ? reasonMatch[1].trim() : 'Conflicts with values'
          });
        }
      }
    }

    // If parsing failed, use fallback
    if (supportCompanies.length < 3 || opposeCompanies.length < 3) {
      console.warn('Parsing failed, using fallback rankings');
      return getFallbackRankings(stanceType);
    }

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