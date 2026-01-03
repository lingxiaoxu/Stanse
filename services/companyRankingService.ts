import { GoogleGenAI } from "@google/genai";
import { SP500_COMPANIES, StanceType, getStanceType } from '../data/sp500Companies';
import {
  getCompanyRankingsFromCache,
  saveCompanyRankingsToCache,
  RankedCompany,
  CompanyRanking
} from './companyRankingCache';
import { getRecentMixedNews } from './newsCache';
import { db } from './firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { calculatePersonaAwareScore } from './personaAwareScoring';

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

// ============================================================================
// FIREBASE DATA READING FUNCTIONS
// ============================================================================

/**
 * Fetch FEC donation data for a company
 */
const fetchFECData = async (ticker: string): Promise<any | null> => {
  try {
    const docRef = doc(db, 'company_rankings_by_ticker', ticker);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data();
      return data.fec_data || null;
    }
    return null;
  } catch (error) {
    console.error(`Error fetching FEC data for ${ticker}:`, error);
    return null;
  }
};

/**
 * Fetch ESG scores for a company
 */
const fetchESGData = async (ticker: string): Promise<any | null> => {
  try {
    const docRef = doc(db, 'company_esg_by_ticker', ticker);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data();
      return data.summary || null;  // Changed from 'esg_data' to 'summary'
    }
    return null;
  } catch (error) {
    console.error(`Error fetching ESG data for ${ticker}:`, error);
    return null;
  }
};

/**
 * Fetch executive statements analysis for a company
 */
const fetchExecutiveData = async (ticker: string): Promise<any | null> => {
  try {
    const docRef = doc(db, 'company_executive_statements_by_ticker', ticker);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data();
      return data.analysis || null;
    }
    return null;
  } catch (error) {
    console.error(`Error fetching executive data for ${ticker}:`, error);
    return null;
  }
};

/**
 * Fetch recent news for a company
 */
const fetchNewsData = async (ticker: string): Promise<any | null> => {
  try {
    const docRef = doc(db, 'company_news_by_ticker', ticker);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data();
      return data.articles || null;
    }
    return null;
  } catch (error) {
    console.error(`Error fetching news data for ${ticker}:`, error);
    return null;
  }
};

// ============================================================================
// AI-DATA BASED SCORING FUNCTIONS
// ============================================================================

interface CompanyDataScore {
  ticker: string;
  name: string;
  sector: string;
  // Method A: Numerical calculation
  fecScore: number;        // 0-100, FEC donations alignment
  esgScore: number;        // 0-100, ESG practices alignment
  executiveScore: number;  // 0-100, Executive statements alignment
  newsScore: number;       // 0-100, News sentiment alignment
  numericalScore: number;  // Weighted average (FEC 40% + ESG 30% + Exec 20% + News 10%)
  // Method B: LLM comprehensive analysis
  llmComprehensiveScore: number;  // 0-100, AI综合分析评分
  llmReasoning: string;           // LLM的综合分析理由
  // Combined
  totalScore: number;      // Final score (average of numerical + LLM or fallback)
  hasData: boolean;        // True if any real data available
  dataMode: 'ai-data' | 'llm-fallback';
  calculationMethod: 'numerical+llm' | 'llm-only';
  reasoning: string;       // Combined reasoning
  // Persona-Aware detailed information
  personaAwareDetails: {
    fecScore: number | null;           // Actual FEC score (null if no data)
    esgScore: number | null;           // Actual ESG score (null if no data)
    executiveScore: number | null;     // Actual Executive score (null if no data)
    newsScore: number | null;          // Actual News score (null if no data)
    dataAvailability: {                // Which data sources are available
      hasFEC: boolean;
      hasESG: boolean;
      hasExecutive: boolean;
      hasNews: boolean;
    };
    usedWeights: {                     // Dynamic weights used (redistributed)
      fec: number;
      esg: number;
      executive: number;
      news: number;
    };
    dataSourceCount: number;           // How many sources had data
    hasAnyData: boolean;               // True if at least one source has data
  };
}

// ============================================================================
// NOTE: Individual scoring functions have been replaced by persona-aware scoring
// See: services/personaAwareScoring.ts and services/personaScoringConfig.ts
// The new system provides:
// - 8 distinct persona configurations (progressive-globalist, conservative-nationalist, etc.)
// - Dynamic weight redistribution when data sources are missing
// - Persona-specific preferences for FEC, ESG, Executive, and News scoring
// ============================================================================

/**
 * Calculate LLM comprehensive score using all available data
 * This is Method B in AI-Data Based mode
 */
const calculateLLMComprehensiveScore = async (
  ticker: string,
  name: string,
  fecData: any,
  esgData: any,
  execData: any,
  newsData: any,
  stanceType: StanceType
): Promise<{ score: number; reasoning: string }> => {
  // Check if any data is available
  const hasAnyData = !!(fecData || esgData || execData || newsData);

  const stanceDescription = getStanceDescription(stanceType);

  // Format data for LLM prompt
  const fecSummary = fecData
    ? `FEC Donations: Total $${fecData.total_amount?.toLocaleString() || 0}, Democrat: $${fecData.dem_amount?.toLocaleString() || 0}, Republican: $${fecData.rep_amount?.toLocaleString() || 0}`
    : 'FEC Donations: No data available';

  const esgSummary = esgData
    ? `ESG Scores: Environmental: ${esgData.environmentalScore || 'N/A'}, Social: ${esgData.socialScore || 'N/A'}, Governance: ${esgData.governanceScore || 'N/A'}`
    : 'ESG Scores: No data available';

  const execSummary = execData?.has_executive_statements
    ? `Executive Analysis: Political stance: ${execData.political_stance?.overall_leaning || 'unknown'}, Confidence: ${execData.political_stance?.confidence || 0}%, Recommendation Score: ${execData.recommendation_score || 'N/A'}`
    : 'Executive Analysis: No statements found';

  const newsSummary = newsData && newsData.length > 0
    ? `Recent News: ${newsData.length} articles available`
    : 'Recent News: No recent news available';

  // Build prompt based on data availability (MUST match Python logic)
  let prompt: string;

  if (hasAnyData) {
    // Has data: analyze based on available data
    prompt = `
You are analyzing ${name} (${ticker}) for alignment with this political/values profile:
${stanceDescription}

Available Data:
- ${fecSummary}
- ${esgSummary}
- ${execSummary}
- ${newsSummary}

Based on ALL the data above, provide a comprehensive alignment score (0-100) where:
- 100 = Perfectly aligned with the values profile
- 50 = Neutral or mixed signals
- 0 = Completely opposed to the values profile

Respond in this EXACT format:
SCORE: [0-100]
REASONING: [Brief 1-sentence explanation combining insights from FEC, ESG, Executive, and News data]
`;
  } else {
    // No data: use LLM's general knowledge (MUST match Python logic)
    prompt = `
You are analyzing ${name} for alignment with this political/values profile:
${stanceDescription}

NOTE: No structured data (FEC donations, ESG scores, executive statements, or recent news) is available for this company.
Please use your general knowledge about this company to provide an assessment.

Consider:
- The company's public reputation and known political/social stances
- Industry sector and typical practices
- Known controversies or positive initiatives
- Corporate culture and values (if publicly known)

Provide a comprehensive alignment score (0-100) where:
- 100 = Perfectly aligned with the values profile
- 50 = Neutral or unknown
- 0 = Completely opposed to the values profile

Respond in this EXACT format:
SCORE: [0-100]
REASONING: [Brief explanation based on general knowledge about this company]
`;
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        temperature: 0.3, // Lower temperature for more consistent scoring
      }
    });

    const rawText = response.text || '';

    // Parse score and reasoning
    const scoreMatch = rawText.match(/SCORE:\s*(\d+)/);
    const reasoningMatch = rawText.match(/REASONING:\s*(.+?)(?:\n|$)/);

    const score = scoreMatch ? Math.min(100, Math.max(0, parseInt(scoreMatch[1]))) : 50;
    const reasoning = reasoningMatch ? reasoningMatch[1].trim() : 'LLM analysis completed';

    console.log(`[LLM Comprehensive] ${ticker}: Score=${score}, Reasoning="${reasoning}"`);

    return { score, reasoning };
  } catch (error) {
    console.error(`Error in LLM comprehensive analysis for ${ticker}:`, error);
    return { score: 50, reasoning: 'LLM analysis failed, using neutral score' };
  }
};

/**
 * Calculate overall data-based score for a company
 * Mode 1 (AI-Data Based): Uses BOTH numerical calculation AND LLM comprehensive analysis
 */
const calculateCompanyDataScore = async (
  ticker: string,
  name: string,
  sector: string,
  stanceType: StanceType
): Promise<CompanyDataScore> => {
  // Fetch all data sources
  const [fecData, esgData, execData, newsData] = await Promise.all([
    fetchFECData(ticker),
    fetchESGData(ticker),
    fetchExecutiveData(ticker),
    fetchNewsData(ticker)
  ]);

  const hasData = !!(fecData || esgData || execData || newsData);

  // METHOD A: Persona-Aware Numerical Calculation with Dynamic Weights
  const personaScore = calculatePersonaAwareScore(
    fecData,
    esgData,
    execData,
    newsData,
    stanceType
  );

  // Keep individual scores with null information (for reasoning display)
  const fecScore = personaScore.fecScore ?? 50;
  const esgScore = personaScore.esgScore ?? 50;
  const executiveScore = personaScore.executiveScore ?? 50;
  const newsScore = personaScore.newsScore ?? 50;
  const numericalScore = personaScore.numericalScore;

  // METHOD B: LLM comprehensive analysis (only if we have data)
  let llmComprehensiveScore = 50;
  let llmReasoning = 'No data available for LLM analysis';

  if (hasData) {
    const llmResult = await calculateLLMComprehensiveScore(
      ticker,
      name,
      fecData,
      esgData,
      execData,
      newsData,
      stanceType
    );
    llmComprehensiveScore = llmResult.score;
    llmReasoning = llmResult.reasoning;
  }

  // COMBINED SCORE: Average of both methods when data is available
  const totalScore = hasData
    ? (numericalScore + llmComprehensiveScore) / 2
    : 50; // Fallback if no data

  // Build numerical reasoning using actual scores (null values show as 'N/A')
  const fecDisplay = personaScore.fecScore !== null ? personaScore.fecScore.toFixed(0) : 'N/A';
  const esgDisplay = personaScore.esgScore !== null ? personaScore.esgScore.toFixed(0) : 'N/A';
  const execDisplay = personaScore.executiveScore !== null ? personaScore.executiveScore.toFixed(0) : 'N/A';
  const newsDisplay = personaScore.newsScore !== null ? personaScore.newsScore.toFixed(0) : 'N/A';

  const numericalReasoning = `Numerical: FEC=${fecDisplay}, ESG=${esgDisplay}, Exec=${execDisplay}, News=${newsDisplay}`;
  const combinedReasoning = hasData
    ? `${numericalReasoning} | LLM: ${llmReasoning}`
    : 'No data available';

  // Log detailed calculation information for debugging/analysis
  console.log(`[${ticker}] ${numericalReasoning}`);
  console.log(`[AI-Data] ${ticker}: Numerical=${numericalScore.toFixed(1)}, LLM=${llmComprehensiveScore.toFixed(1)}, Final=${totalScore.toFixed(1)}`);

  return {
    ticker,
    name,
    sector,
    // Method A results (with fallback values for compatibility)
    fecScore,
    esgScore,
    executiveScore,
    newsScore,
    numericalScore,
    // Method B results
    llmComprehensiveScore,
    llmReasoning,
    // Combined
    totalScore,
    hasData,
    dataMode: hasData ? 'ai-data' : 'llm-fallback',
    calculationMethod: hasData ? 'numerical+llm' : 'llm-only',
    reasoning: combinedReasoning,
    // NEW: Persona-Aware detailed information
    personaAwareDetails: {
      fecScore: personaScore.fecScore,
      esgScore: personaScore.esgScore,
      executiveScore: personaScore.executiveScore,
      newsScore: personaScore.newsScore,
      dataAvailability: personaScore.dataAvailability,
      usedWeights: personaScore.usedWeights,
      dataSourceCount: personaScore.dataSourceCount,
      hasAnyData: personaScore.hasAnyData
    }
  };
};


/**
 * Save persona-based company ranking to Firebase with history tracking
 * Collection: enhanced_company_rankings
 * Document ID: {stanceType}
 *
 * Structure follows company_esg_by_ticker pattern:
 * - Main document stores current ranking
 * - history/{timestamp} subcollection stores historical rankings
 */
export const savePersonaRankingToFirebase = async (
  ranking: CompanyRanking
): Promise<void> => {
  try {
    const { stanceType, supportCompanies, opposeCompanies, updatedAt, expiresAt } = ranking;

    // Generate timestamp
    const now = new Date();
    const timestamp_str = now.toISOString().replace(/[-:]/g, '').replace('T', '_').split('.')[0];

    // Prepare ranking data
    const rankingData = {
      stanceType,
      opposeCompanies: opposeCompanies.map(c => ({
        name: c.name,
        reasoning: c.reasoning,
        score: c.score,
        sector: c.sector,
        symbol: c.symbol
      })),
      supportCompanies: supportCompanies.map(c => ({
        name: c.name,
        reasoning: c.reasoning,
        score: c.score,
        sector: c.sector,
        symbol: c.symbol
      })),
      updatedAt: updatedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      version: '3.0'  // Version 3.0 with history tracking
    };

    const docRef = doc(db, 'enhanced_company_rankings', stanceType);

    // 1. Save to history first (snapshot of current state)
    const historyRef = doc(db, 'enhanced_company_rankings', stanceType, 'history', timestamp_str);
    await setDoc(historyRef, rankingData);
    console.log(`[Firebase] Saved ranking history: enhanced_company_rankings/${stanceType}/history/${timestamp_str}`);

    // 2. Update main document (merge=true to preserve other fields)
    await setDoc(docRef, rankingData, { merge: true });
    console.log(`[Firebase] Updated main ranking: enhanced_company_rankings/${stanceType}`);

  } catch (error) {
    console.error(`[Firebase] Error saving persona ranking for ${ranking.stanceType}:`, error);
  }
};

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

// ============================================================================
// DUAL-MODE RANKING SYSTEM (AI-DATA + LLM FALLBACK)
// ============================================================================

/**
 * Enhanced company ranking with dual-mode support
 * Mode 1 (AI-Data Based): Uses FEC + ESG + Executive + News data
 * Mode 2 (LLM Fallback): Uses existing LLM-based ranking for companies without data
 */
export const rankCompaniesForStanceEnhanced = async (
  stanceType: StanceType,
  forceRefresh: boolean = false
): Promise<CompanyRanking> => {
  console.log('========================================');
  console.log('Enhanced Dual-Mode Company Ranking');
  console.log(`Stance Type: ${stanceType}`);
  console.log('========================================');

  // Step 1: Calculate data-based scores for all SP500 companies
  const companyScores = await Promise.all(
    SP500_COMPANIES.map(company =>
      calculateCompanyDataScore(company.symbol, company.name, company.sector, stanceType)
    )
  );

  // Step 2: Separate companies by data availability
  const companiesWithData = companyScores.filter(c => c.hasData);
  const companiesWithoutData = companyScores.filter(c => !c.hasData);

  console.log('');
  console.log('Data Availability Summary:');
  console.log(`- Companies with data (Mode 1: AI-Data Based): ${companiesWithData.length}`);
  console.log(`- Companies without data (Mode 2: LLM Fallback): ${companiesWithoutData.length}`);

  // Step 3: Sort by score
  companiesWithData.sort((a, b) => b.totalScore - a.totalScore);

  // Step 4: Log detailed scores for each company
  console.log('');
  console.log('Detailed Scoring Results:');
  console.log('----------------------------------------');
  companyScores.forEach(c => {
    console.log(`${c.ticker} (${c.name})`);
    console.log(`  Mode: ${c.dataMode === 'ai-data' ? 'Mode 1 (AI-Data Based)' : 'Mode 2 (LLM Fallback)'}`);
    console.log(`  Calculation Method: ${c.calculationMethod}`);
    if (c.hasData) {
      console.log(`  FEC Score: ${c.fecScore.toFixed(1)}`);
      console.log(`  ESG Score: ${c.esgScore.toFixed(1)}`);
      console.log(`  Executive Score: ${c.executiveScore.toFixed(1)}`);
      console.log(`  News Score: ${c.newsScore.toFixed(1)}`);
      console.log(`  Numerical Score (40% FEC + 30% ESG + 20% Exec + 10% News): ${c.numericalScore.toFixed(1)}`);
      console.log(`  LLM Comprehensive Score: ${c.llmComprehensiveScore.toFixed(1)}`);
      console.log(`  LLM Reasoning: ${c.llmReasoning}`);
    }
    console.log(`  Final Total Score: ${c.totalScore.toFixed(1)}`);
    console.log('');
  });

  // Step 5: Get top 5 to support and bottom 5 to oppose from data-based scoring
  const supportCompanies: RankedCompany[] = companiesWithData.slice(0, 5).map(c => ({
    symbol: c.ticker,
    name: c.name,
    sector: c.sector,
    score: Math.round(c.totalScore),
    reasoning: `[AI-Data] ${c.reasoning}`
  }));

  const opposeCompanies: RankedCompany[] = companiesWithData.slice(-5).reverse().map(c => ({
    symbol: c.ticker,
    name: c.name,
    sector: c.sector,
    score: Math.round(c.totalScore),
    reasoning: `[AI-Data] ${c.reasoning}`
  }));

  // Step 6: If we don't have enough companies with data, use LLM fallback
  if (supportCompanies.length < 5 || opposeCompanies.length < 5) {
    console.log('⚠️ Not enough data-based companies, switching to Mode 2 (LLM Fallback)');
    return rankCompaniesForStanceLLM(stanceType, forceRefresh);
  }

  console.log('Top 5 Companies to Support:');
  supportCompanies.forEach((c, i) => {
    console.log(`${i + 1}. ${c.symbol} - Score: ${c.score}`);
  });
  console.log('');
  console.log('Top 5 Companies to Oppose:');
  opposeCompanies.forEach((c, i) => {
    console.log(`${i + 1}. ${c.symbol} - Score: ${c.score}`);
  });
  console.log('========================================');

  // Step 7: Save to cache and Firebase with history
  const ranking: CompanyRanking = {
    stanceType,
    supportCompanies,
    opposeCompanies,
    updatedAt: new Date(),
    expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000)
  };

  // Save to both cache and Firebase (with history tracking)
  await Promise.all([
    saveCompanyRankingsToCache(ranking),
    savePersonaRankingToFirebase(ranking)
  ]);

  return ranking;
};

/**
 * ORIGINAL LLM-BASED RANKING (Preserved as fallback)
 * Rank companies using AI with search grounding for recent news
 * Uses real news from the last 12 hours to make rankings dynamic
 */
export const rankCompaniesForStanceLLM = async (
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

// ============================================================================
// MAIN ENTRY POINT - USES ENHANCED MODE BY DEFAULT
// ============================================================================

/**
 * Main entry point for company ranking
 * Uses enhanced AI-Data mode by default, with LLM fallback
 */
export const rankCompaniesForStance = async (
  stanceType: StanceType,
  forceRefresh: boolean = false,
  useEnhanced: boolean = true
): Promise<CompanyRanking> => {
  if (useEnhanced) {
    return rankCompaniesForStanceEnhanced(stanceType, forceRefresh);
  } else {
    return rankCompaniesForStanceLLM(stanceType, forceRefresh);
  }
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

// ============================================================================
// ON-DEMAND SINGLE COMPANY SCORING (for non-S&P 500 companies)
// ============================================================================

export interface SingleCompanyScoreResult {
  companyIdentifier: string;
  stanceType: StanceType;
  calculationMode: 'hybrid' | 'llm-only' | 'numerical-only' | 'neutral';
  dataAvailability: {
    fec: boolean;
    esg: boolean;
    executive: boolean;
    news: boolean;
    dataSourceCount: number;
  };
  scores: {
    fecScore: number | null;
    esgScore: number | null;
    executiveScore: number | null;
    newsScore: number | null;
    numericalScore: number;
    llmScore: number | null;
    finalScore: number;
  };
  llmAnalysis: {
    reasoning: string;
    prompt: string;
  };
  weightsUsed: {
    fec: number;
    esg: number;
    executive: number;
    news: number;
  };
}

/**
 * Calculate persona-aware score for a single company (including private/non-S&P 500 companies)
 *
 * Workflow:
 * 1. Try to fetch FEC/ESG/Executive/News data from Firebase
 * 2. If data insufficient, rely more on LLM comprehensive analysis
 * 3. Return score result (does not save to enhanced_company_rankings)
 *
 * IMPORTANT: This function's logic MUST match Python's calculate_single_company_score()
 */
export const calculateCompanyScoreOnDemand = async (
  companyIdentifier: string,
  stanceType: StanceType
): Promise<SingleCompanyScoreResult> => {
  console.log(`🎯 Calculating score for: ${companyIdentifier}`);
  console.log(`   Persona: ${stanceType}`);

  // Step 1: Try to fetch data from Firebase
  console.log('📥 Fetching data from Firebase...');
  const [fecData, esgData, execData, newsData] = await Promise.all([
    fetchFECData(companyIdentifier),
    fetchESGData(companyIdentifier),
    fetchExecutiveData(companyIdentifier),
    fetchNewsData(companyIdentifier)
  ]);

  const hasFEC = !!fecData;
  const hasESG = !!esgData;
  const hasExecutive = !!execData;
  const hasNews = !!newsData;

  console.log(`   FEC data: ${hasFEC ? '✅' : '❌'}`);
  console.log(`   ESG data: ${hasESG ? '✅' : '❌'}`);
  console.log(`   Executive data: ${hasExecutive ? '✅' : '❌'}`);
  console.log(`   News data: ${hasNews ? '✅' : '❌'}`);

  // Step 2: Calculate persona-aware numerical score
  console.log('📊 Calculating persona-aware numerical score...');
  const personaScore = calculatePersonaAwareScore(
    fecData,
    esgData,
    execData,
    newsData,
    stanceType
  );

  // Step 3: LLM comprehensive scoring
  console.log('🤖 Calling LLM for comprehensive analysis...');
  const llmResult = await calculateLLMComprehensiveScore(
    companyIdentifier,
    companyIdentifier,
    fecData,
    esgData,
    execData,
    newsData,
    stanceType
  );

  // ADAPTIVE WEIGHTING: If data insufficient, increase LLM weight to 100%
  let finalScore: number;
  let calculationMode: 'hybrid' | 'llm-only' | 'numerical-only' | 'neutral';

  if (personaScore.hasAnyData) {
    // Normal mode: 50% numerical + 50% LLM
    finalScore = (personaScore.numericalScore + llmResult.score) / 2;
    calculationMode = 'hybrid';
  } else {
    // Insufficient data mode: 100% LLM
    finalScore = llmResult.score;
    calculationMode = 'llm-only';
  }

  console.log(`✅ Calculation Complete`);
  console.log(`   Final Score: ${finalScore.toFixed(1)}`);
  console.log(`   Calculation Mode: ${calculationMode}`);
  console.log(`   Data Sources: ${personaScore.dataSourceCount}/4`);

  return {
    companyIdentifier,
    stanceType,
    calculationMode,
    dataAvailability: {
      fec: hasFEC,
      esg: hasESG,
      executive: hasExecutive,
      news: hasNews,
      dataSourceCount: personaScore.dataSourceCount
    },
    scores: {
      fecScore: personaScore.fecScore,
      esgScore: personaScore.esgScore,
      executiveScore: personaScore.executiveScore,
      newsScore: personaScore.newsScore,
      numericalScore: personaScore.numericalScore,
      llmScore: llmResult.score,
      finalScore: Math.round(finalScore * 10) / 10
    },
    llmAnalysis: {
      reasoning: llmResult.reasoning,
      prompt: '' // Prompt not stored in current implementation
    },
    weightsUsed: personaScore.usedWeights
  };
};