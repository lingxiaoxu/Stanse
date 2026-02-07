'use client';

import { useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/services/firebase';
import PerformanceInsights, { type PerformanceInsightsData, type HoldingPerformance } from './PerformanceInsights';
import {
  type Language,
  LANGUAGE_OPTIONS,
  t,
  getPersonaName,
} from './portfolioChartTranslations';

// 8 personas with their colors (keys only, names come from translations)
const PERSONAS = [
  { key: 'progressive-globalist', color: '#2563eb' },      // blue
  { key: 'progressive-nationalist', color: '#7c3aed' },    // purple
  { key: 'socialist-libertarian', color: '#dc2626' },      // red
  { key: 'socialist-nationalist', color: '#ea580c' },      // orange
  { key: 'capitalist-globalist', color: '#16a34a' },       // green
  { key: 'capitalist-nationalist', color: '#0d9488' },     // teal
  { key: 'conservative-globalist', color: '#ca8a04' },     // yellow
  { key: 'conservative-nationalist', color: '#be185d' },   // pink
];

// SPY (S&P 500 ETF) config
const SPY_CONFIG = { key: 'spy', name: 'S&P 500 (SPY)', color: '#000000' };

interface Position {
  symbol: string;
  name: string;
  price: number;
  change: number;
  weight?: number;
}

interface SnapshotData {
  snapshotId: string;
  portfolioReturn: number;
  longReturn: number;
  shortReturn: number;
  timestamp: string;
  dateHour: string;
  positions?: {
    long: Position[];
    short: Position[];
  };
}

interface ChartDataPoint {
  dateHour: string;
  displayLabel: string;
  [key: string]: number | string;
}

// Month names for formatting
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Format dateHour (YYYY-MM-DD-HH) to "Jan 02 4PM" format
const formatDateHour = (month: string, day: string, hour: string): string => {
  const monthIndex = parseInt(month, 10) - 1;
  const monthName = MONTH_NAMES[monthIndex] || month;
  const dayNum = parseInt(day, 10);
  const hourNum = parseInt(hour, 10);

  // Convert 24h to 12h format with AM/PM
  let hour12 = hourNum % 12;
  if (hour12 === 0) hour12 = 12;
  const ampm = hourNum >= 12 ? 'PM' : 'AM';

  return `${monthName} ${dayNum.toString().padStart(2, '0')} ${hour12}${ampm}`;
};

// Polygon API key from environment
const POLYGON_API_KEY = (import.meta as any).env?.VITE_POLYGON_API_KEY ||
                        (typeof process !== 'undefined' ? process.env.POLYGON_API_KEY : '');

export default function PortfolioReturnChart() {
  const [periodReturnData, setPeriodReturnData] = useState<ChartDataPoint[]>([]);
  const [accumulatedData, setAccumulatedData] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<{ totalPoints: number; dateRange: string }>({
    totalPoints: 0,
    dateRange: '',
  });
  const [insightsData, setInsightsData] = useState<PerformanceInsightsData | null>(null);
  const [language, setLanguage] = useState<Language>('EN');
  // State for highlighting lines on legend click
  const [highlightedLine, setHighlightedLine] = useState<string | null>(null);

  // Handle legend click to toggle highlight
  const handleLegendClick = (dataKey: string) => {
    setHighlightedLine((prev) => (prev === dataKey ? null : dataKey));
  };

  // Helper to get persona name in current language
  const pn = (key: string) => getPersonaName(language, key);
  // Helper to get UI text in current language
  const txt = (key: string, vars?: Record<string, string | number>) => t(language, key, vars);

  useEffect(() => {
    const fetchAllData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Store all snapshots per persona, grouped by dateHour
        const personaData: Map<string, Map<string, SnapshotData>> = new Map();

        // Fetch data for all 8 personas
        for (const persona of PERSONAS) {
          const snapshotsRef = collection(
            db,
            'enhanced_persona_index_longshort_fund',
            persona.key,
            'snapshots'
          );
          const snapshot = await getDocs(snapshotsRef);

          // Group by dateHour, keeping only the last snapshot per hour
          const hourlyData: Map<string, SnapshotData> = new Map();

          snapshot.docs.forEach((doc) => {
            const data = doc.data();
            const portfolioReturn = data.portfolioReturn;

            // Skip if portfolioReturn is 0 or missing
            if (!portfolioReturn || portfolioReturn === 0) {
              return;
            }

            // Parse snapshotId: format is YYYYMMdd_HHMMSS
            const snapshotId = doc.id;
            const match = snapshotId.match(/^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})$/);
            if (!match) return;

            const [, year, month, day, hour] = match;
            const dateHour = `${year}-${month}-${day}-${hour}`;

            const snapshotData: SnapshotData = {
              snapshotId,
              portfolioReturn,
              longReturn: data.longReturn || 0,
              shortReturn: data.shortReturn || 0,
              timestamp: data.timestamp || snapshotId,
              dateHour,
              positions: data.positions,
            };

            // Keep only the latest snapshot for each hour (highest minute value)
            const existing = hourlyData.get(dateHour);
            if (!existing || snapshotId > existing.snapshotId) {
              hourlyData.set(dateHour, snapshotData);
            }
          });

          personaData.set(persona.key, hourlyData);
        }

        // Find dateHours that ALL personas have data for
        const allDateHours = new Set<string>();
        personaData.forEach((hourlyData) => {
          hourlyData.forEach((_, dateHour) => {
            allDateHours.add(dateHour);
          });
        });

        // Filter to only dateHours where ALL 8 personas have data
        const commonDateHours: string[] = [];
        allDateHours.forEach((dateHour) => {
          let allHaveData = true;
          for (const persona of PERSONAS) {
            const hourlyData = personaData.get(persona.key);
            if (!hourlyData || !hourlyData.has(dateHour)) {
              allHaveData = false;
              break;
            }
          }
          if (allHaveData) {
            commonDateHours.push(dateHour);
          }
        });

        // Sort chronologically
        commonDateHours.sort();

        if (commonDateHours.length === 0) {
          setError('No common data points found across all 8 personas');
          setLoading(false);
          return;
        }

        // Fetch SPY data for each common dateHour
        const spyReturns: Map<string, number> = new Map();
        let previousClose: number | null = null;

        // Group dateHours by date to minimize API calls
        const dateGroups: Map<string, string[]> = new Map();
        commonDateHours.forEach((dateHour) => {
          const [year, month, day] = dateHour.split('-');
          const dateKey = `${year}-${month}-${day}`;
          if (!dateGroups.has(dateKey)) {
            dateGroups.set(dateKey, []);
          }
          dateGroups.get(dateKey)!.push(dateHour);
        });

        // Fetch SPY data for each date
        for (const [dateKey, hoursInDay] of dateGroups) {
          try {
            // Polygon aggregates API: get hourly bars for the day
            const response = await fetch(
              `https://api.polygon.io/v2/aggs/ticker/SPY/range/1/hour/${dateKey}/${dateKey}?adjusted=true&sort=asc&apiKey=${POLYGON_API_KEY}`
            );

            if (response.ok) {
              const data = await response.json();
              if (data.results && data.results.length > 0) {
                // Create a map of hour -> close price
                const hourlyPrices: Map<string, number> = new Map();
                data.results.forEach((bar: any) => {
                  const date = new Date(bar.t);
                  const hour = date.getUTCHours().toString().padStart(2, '0');
                  hourlyPrices.set(hour, bar.c);
                });

                // Calculate returns for each hour in this day
                for (const dateHour of hoursInDay) {
                  const hour = dateHour.split('-')[3];
                  const closePrice = hourlyPrices.get(hour);

                  if (closePrice && previousClose) {
                    const returnPct = ((closePrice - previousClose) / previousClose) * 100;
                    spyReturns.set(dateHour, returnPct);
                  } else if (closePrice) {
                    spyReturns.set(dateHour, 0); // First point, no return yet
                  }

                  if (closePrice) {
                    previousClose = closePrice;
                  }
                }
              }
            }
          } catch (err) {
            console.warn(`Failed to fetch SPY data for ${dateKey}:`, err);
          }
        }

        // Fetch market indices data (Gold, Oil, QQQ, AIQ)
        const MARKET_INDICES = [
          { symbol: 'GC=F', name: 'goldIndex' },      // Gold Futures (Yahoo format, need to convert for Polygon)
          { symbol: 'CL=F', name: 'crudeOilIndex' },  // Crude Oil Futures
          { symbol: 'QQQ', name: 'nasdaqIndex' },     // Nasdaq 100 ETF
          { symbol: 'AIQ', name: 'aiIndex' },         // Global X Artificial Intelligence & Technology ETF
        ];

        // For Polygon API, we need to use different symbols
        const POLYGON_SYMBOLS: Record<string, string> = {
          'GC=F': 'GLD',   // Use GLD ETF as proxy for gold
          'CL=F': 'USO',   // Use USO ETF as proxy for oil
          'QQQ': 'QQQ',
          'AIQ': 'AIQ',    // Global X AI & Technology ETF
        };

        const marketIndicesData: { name: string; symbol: string; return: number }[] = [];

        // Get date range for market indices
        const firstDate = commonDateHours[0]?.split('-').slice(0, 3).join('-');
        const lastDate = commonDateHours[commonDateHours.length - 1]?.split('-').slice(0, 3).join('-');

        if (firstDate && lastDate) {
          for (const index of MARKET_INDICES) {
            try {
              const polygonSymbol = POLYGON_SYMBOLS[index.symbol] || index.symbol;
              const response = await fetch(
                `https://api.polygon.io/v2/aggs/ticker/${polygonSymbol}/range/1/day/${firstDate}/${lastDate}?adjusted=true&sort=asc&apiKey=${POLYGON_API_KEY}`
              );

              if (response.ok) {
                const data = await response.json();
                if (data.results && data.results.length >= 2) {
                  const firstClose = data.results[0].c;
                  const lastClose = data.results[data.results.length - 1].c;
                  const returnPct = ((lastClose - firstClose) / firstClose) * 100;
                  marketIndicesData.push({
                    name: index.name,
                    symbol: index.symbol.replace('=F', ''),
                    return: Number(returnPct.toFixed(2)),
                  });
                } else if (data.results && data.results.length === 1) {
                  // Only one day of data, return is 0
                  marketIndicesData.push({
                    name: index.name,
                    symbol: index.symbol.replace('=F', ''),
                    return: 0,
                  });
                }
              }
            } catch (err) {
              console.warn(`Failed to fetch ${index.symbol} data:`, err);
              marketIndicesData.push({
                name: index.name,
                symbol: index.symbol.replace('=F', ''),
                return: 0,
              });
            }
          }
        }

        // Build period return chart data
        const periodPoints: ChartDataPoint[] = commonDateHours.map((dateHour) => {
          const [, month, day, hour] = dateHour.split('-');
          const displayLabel = formatDateHour(month, day, hour);

          const point: ChartDataPoint = {
            dateHour,
            displayLabel,
          };

          // Add each persona's return
          for (const persona of PERSONAS) {
            const hourlyData = personaData.get(persona.key);
            const snapshot = hourlyData?.get(dateHour);
            if (snapshot) {
              point[persona.key] = Number(snapshot.portfolioReturn.toFixed(2));
            }
          }

          return point;
        });

        // Build accumulated return chart data
        // IMPORTANT: For same-day multiple points, only use the LAST hour's return for accumulation
        // Because each point's return is relative to previous trading day's close
        // Same-day points should show the same accumulated value until the last point of that day

        // Step 1: Group commonDateHours by date, find the last hour for each date
        const dateToLastHour: Map<string, string> = new Map();
        commonDateHours.forEach((dateHour) => {
          const [year, month, day, hour] = dateHour.split('-');
          const dateKey = `${year}-${month}-${day}`;
          const existing = dateToLastHour.get(dateKey);
          if (!existing || hour > existing.split('-')[3]) {
            dateToLastHour.set(dateKey, dateHour);
          }
        });

        // Step 2: Calculate accumulated returns, only updating on the last hour of each day
        const accumulatedFactors: Map<string, number> = new Map();
        PERSONAS.forEach((p) => accumulatedFactors.set(p.key, 1));
        accumulatedFactors.set('spy', 1);

        // Track current day's accumulated value (before applying that day's return)
        const dayStartFactors: Map<string, number> = new Map();
        PERSONAS.forEach((p) => dayStartFactors.set(p.key, 1));
        dayStartFactors.set('spy', 1);

        let currentDate = '';

        const accPoints: ChartDataPoint[] = commonDateHours.map((dateHour, index) => {
          const [year, month, day, hour] = dateHour.split('-');
          const dateKey = `${year}-${month}-${day}`;
          const displayLabel = formatDateHour(month, day, hour);
          const isLastHourOfDay = dateToLastHour.get(dateKey) === dateHour;

          // If we're on a new day, save the accumulated factors as day start
          if (dateKey !== currentDate) {
            currentDate = dateKey;
            PERSONAS.forEach((p) => {
              dayStartFactors.set(p.key, accumulatedFactors.get(p.key) || 1);
            });
            dayStartFactors.set('spy', accumulatedFactors.get('spy') || 1);
          }

          const point: ChartDataPoint = {
            dateHour,
            displayLabel,
          };

          // Calculate accumulated for each persona
          for (const persona of PERSONAS) {
            const hourlyData = personaData.get(persona.key);
            const snapshot = hourlyData?.get(dateHour);

            if (snapshot) {
              if (isLastHourOfDay) {
                // Last hour of day: apply return and update accumulated
                const periodReturn = snapshot.portfolioReturn / 100;
                const dayStart = dayStartFactors.get(persona.key) || 1;
                const newFactor = dayStart * (1 + periodReturn);
                accumulatedFactors.set(persona.key, newFactor);
                point[persona.key] = Number(((newFactor - 1) * 100).toFixed(2));
              } else {
                // Not last hour: show current accumulated (before today's return applied)
                const dayStart = dayStartFactors.get(persona.key) || 1;
                point[persona.key] = Number(((dayStart - 1) * 100).toFixed(2));
              }
            }
          }

          // Calculate accumulated for SPY
          const spyReturn = spyReturns.get(dateHour);
          if (isLastHourOfDay && spyReturn !== undefined) {
            const periodReturn = spyReturn / 100;
            const dayStart = dayStartFactors.get('spy') || 1;
            const newFactor = dayStart * (1 + periodReturn);
            accumulatedFactors.set('spy', newFactor);
            point['spy'] = Number(((newFactor - 1) * 100).toFixed(2));
          } else {
            // Show current accumulated (before today's return applied)
            const dayStart = dayStartFactors.get('spy') || 1;
            point['spy'] = Number(((dayStart - 1) * 100).toFixed(2));
          }

          return point;
        });

        setPeriodReturnData(periodPoints);
        setAccumulatedData(accPoints);

        const dateRange = periodPoints.length > 0
          ? `${periodPoints[0].displayLabel} - ${periodPoints[periodPoints.length - 1].displayLabel}`
          : 'No data';

        setStats({
          totalPoints: periodPoints.length,
          dateRange,
        });

        // Calculate insights data
        const spyFinalReturn = accPoints.length > 0
          ? (accPoints[accPoints.length - 1]['spy'] as number || 0)
          : 0;

        // Calculate persona performance metrics (store key only, name will be translated at render time)
        const personaPerformances = PERSONAS.map((persona) => {
          const finalReturn = accPoints.length > 0
            ? (accPoints[accPoints.length - 1][persona.key] as number || 0)
            : 0;

          // Calculate win rate and average daily return
          let wins = 0;
          let totalDays = 0;
          let sumReturns = 0;

          // Get unique days and their returns
          const dayReturns: Map<string, number> = new Map();
          periodPoints.forEach((point) => {
            const [, month, day] = point.dateHour.split('-');
            const dayKey = `${month}-${day}`;
            const ret = point[persona.key] as number;
            if (ret !== undefined) {
              dayReturns.set(dayKey, ret); // Last hour of day's return
            }
          });

          dayReturns.forEach((ret) => {
            totalDays++;
            sumReturns += ret;
            if (ret > 0) wins++;
          });

          return {
            key: persona.key,
            name: persona.key, // Will be translated at render time
            color: persona.color,
            accumulatedReturn: finalReturn,
            avgDailyReturn: totalDays > 0 ? sumReturns / totalDays : 0,
            winRate: totalDays > 0 ? (wins / totalDays) * 100 : 0,
            vsSpy: finalReturn - spyFinalReturn,
          };
        });

        // Sort to find top and bottom performers
        const sorted = [...personaPerformances].sort((a, b) => b.accumulatedReturn - a.accumulatedReturn);
        const topPerformer = sorted[0];
        const bottomPerformer = sorted[sorted.length - 1];

        // Get the latest snapshot for top and bottom performers to analyze their holdings
        const topPersonaData = personaData.get(topPerformer.key);
        const bottomPersonaData = personaData.get(bottomPerformer.key);

        // Get the most recent snapshot with positions data
        let topLatestSnapshot: SnapshotData | undefined;
        let bottomLatestSnapshot: SnapshotData | undefined;

        if (topPersonaData) {
          const snapshots = Array.from(topPersonaData.values()).sort((a, b) =>
            b.snapshotId.localeCompare(a.snapshotId)
          );
          topLatestSnapshot = snapshots.find(s => s.positions);
        }
        if (bottomPersonaData) {
          const snapshots = Array.from(bottomPersonaData.values()).sort((a, b) =>
            b.snapshotId.localeCompare(a.snapshotId)
          );
          bottomLatestSnapshot = snapshots.find(s => s.positions);
        }

        // Collect all unique stock symbols from all personas' positions
        const allStockSymbols: Map<string, string> = new Map(); // symbol -> name

        personaData.forEach((hourlyData) => {
          const snapshots = Array.from(hourlyData.values()).sort((a, b) =>
            b.snapshotId.localeCompare(a.snapshotId)
          );
          const latestWithPositions = snapshots.find(s => s.positions);
          if (latestWithPositions?.positions) {
            [...latestWithPositions.positions.long, ...latestWithPositions.positions.short].forEach(pos => {
              if (!allStockSymbols.has(pos.symbol)) {
                allStockSymbols.set(pos.symbol, pos.name);
              }
            });
          }
        });

        // Fetch actual period returns for all stocks from Polygon API
        const stockReturns: { symbol: string; name: string; return: number }[] = [];

        if (firstDate && lastDate && allStockSymbols.size > 0) {
          // Fetch all unique stocks (usually around 30-40 across all personas)
          const symbolsToFetch = Array.from(allStockSymbols.entries());

          // Use Promise.all for parallel fetching with rate limiting
          const fetchPromises = symbolsToFetch.map(async ([symbol, name], index) => {
            // Small delay to avoid rate limiting (stagger requests)
            await new Promise(resolve => setTimeout(resolve, index * 50));

            try {
              const response = await fetch(
                `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${firstDate}/${lastDate}?adjusted=true&sort=asc&apiKey=${POLYGON_API_KEY}`
              );

              if (response.ok) {
                const data = await response.json();
                if (data.results && data.results.length >= 2) {
                  const firstClose = data.results[0].c;
                  const lastClose = data.results[data.results.length - 1].c;
                  const returnPct = ((lastClose - firstClose) / firstClose) * 100;
                  return {
                    symbol,
                    name,
                    return: Number(returnPct.toFixed(2)),
                  };
                }
              }
            } catch (err) {
              console.warn(`Failed to fetch ${symbol} data:`, err);
            }
            return null;
          });

          const results = await Promise.all(fetchPromises);
          results.forEach(result => {
            if (result) stockReturns.push(result);
          });
        }

        // Sort stocks by return to find top gainers and losers
        const sortedStocks = [...stockReturns].sort((a, b) => b.return - a.return);

        // Get top 2 gainers and top 2 losers
        const topGainers = sortedStocks.filter(s => s.return > 0).slice(0, 2);
        const topLosers = sortedStocks.filter(s => s.return < 0).slice(-2).reverse();

        // Build dynamic market drivers from actual stock performance (2 gainers + 2 losers)
        const keyDrivers = [
          ...topGainers.map(stock => ({
            sector: stock.symbol,
            symbol: stock.symbol,
            return: stock.return,
            impact: 'positive' as const,
            description: stock.name,
          })),
          ...topLosers.map(stock => ({
            sector: stock.symbol,
            symbol: stock.symbol,
            return: stock.return,
            impact: 'negative' as const,
            description: stock.name,
          })),
        ];

        // Create a map of stock returns for easy lookup
        const stockReturnMap = new Map(stockReturns.map(s => [s.symbol, s.return]));

        // Helper function to classify stock sector
        const classifySector = (symbol: string, name: string): 'tech' | 'energy' | 'other' => {
          const techSymbols = ['AAPL', 'MSFT', 'GOOGL', 'GOOG', 'META', 'AMZN', 'NVDA', 'AMD', 'INTC', 'TSLA', 'ADBE', 'CRM', 'ORCL', 'CSCO', 'AVGO', 'QCOM', 'TXN', 'MU', 'AMAT', 'LRCX', 'KLAC', 'MRVL', 'SNPS', 'CDNS', 'NFLX', 'PYPL', 'SQ', 'SHOP', 'ZM', 'DOCU', 'CRWD', 'ZS', 'OKTA', 'DDOG', 'NET', 'SNOW', 'PLTR', 'U', 'RBLX', 'AI', 'PATH', 'COIN'];
          const energySymbols = ['XOM', 'CVX', 'COP', 'EOG', 'SLB', 'MPC', 'PSX', 'VLO', 'OXY', 'PXD', 'DVN', 'HAL', 'BKR', 'FANG', 'HES', 'MRO', 'APA', 'OVV'];
          const lowerName = name.toLowerCase();

          if (techSymbols.includes(symbol) || lowerName.includes('tech') || lowerName.includes('software') || lowerName.includes('semiconductor') || lowerName.includes('computer')) {
            return 'tech';
          }
          if (energySymbols.includes(symbol) || lowerName.includes('oil') || lowerName.includes('energy') || lowerName.includes('petroleum') || lowerName.includes('gas')) {
            return 'energy';
          }
          return 'other';
        };

        // Generate detailed holdings for top performer
        const topKeyHoldings: string[] = [];
        const topHoldingDetails: HoldingPerformance[] = [];
        if (topLatestSnapshot?.positions) {
          // Process long positions
          topLatestSnapshot.positions.long.forEach(pos => {
            const ret = stockReturnMap.get(pos.symbol) ?? 0;
            topHoldingDetails.push({
              symbol: pos.symbol,
              return: ret,
              position: 'long',
              sector: classifySector(pos.symbol, pos.name),
            });
          });
          // Process short positions
          topLatestSnapshot.positions.short.forEach(pos => {
            const ret = stockReturnMap.get(pos.symbol) ?? 0;
            topHoldingDetails.push({
              symbol: pos.symbol,
              return: ret,
              position: 'short',
              sector: classifySector(pos.symbol, pos.name),
            });
          });

          // Get top contributing long positions for display
          const longWithReturns = topLatestSnapshot.positions.long
            .map(pos => ({
              symbol: pos.symbol,
              return: stockReturnMap.get(pos.symbol) ?? 0,
            }))
            .sort((a, b) => b.return - a.return)
            .slice(0, 3);
          longWithReturns.forEach(pos => {
            topKeyHoldings.push(`${pos.symbol} ${pos.return >= 0 ? '+' : ''}${pos.return.toFixed(1)}%`);
          });
        }

        // Generate detailed holdings for bottom performer
        const bottomKeyHoldings: string[] = [];
        const bottomHoldingDetails: HoldingPerformance[] = [];
        if (bottomLatestSnapshot?.positions) {
          // Process long positions
          bottomLatestSnapshot.positions.long.forEach(pos => {
            const ret = stockReturnMap.get(pos.symbol) ?? 0;
            bottomHoldingDetails.push({
              symbol: pos.symbol,
              return: ret,
              position: 'long',
              sector: classifySector(pos.symbol, pos.name),
            });
          });
          // Process short positions
          bottomLatestSnapshot.positions.short.forEach(pos => {
            const ret = stockReturnMap.get(pos.symbol) ?? 0;
            bottomHoldingDetails.push({
              symbol: pos.symbol,
              return: ret,
              position: 'short',
              sector: classifySector(pos.symbol, pos.name),
            });
          });

          // Get worst performing long positions for display
          const longWithReturns = bottomLatestSnapshot.positions.long
            .map(pos => ({
              symbol: pos.symbol,
              return: stockReturnMap.get(pos.symbol) ?? 0,
            }))
            .sort((a, b) => a.return - b.return)
            .slice(0, 2);
          longWithReturns.forEach(pos => {
            bottomKeyHoldings.push(`${pos.symbol} ${pos.return >= 0 ? '+' : ''}${pos.return.toFixed(1)}%`);
          });
          // Also show short positions that hurt (stocks that went up)
          const shortWithReturns = bottomLatestSnapshot.positions.short
            .map(pos => ({
              symbol: pos.symbol,
              return: stockReturnMap.get(pos.symbol) ?? 0,
            }))
            .sort((a, b) => b.return - a.return)
            .slice(0, 1);
          shortWithReturns.forEach(pos => {
            bottomKeyHoldings.push(`Short ${pos.symbol}`);
          });
        }

        // Build insights data with dynamically generated content
        const insights: PerformanceInsightsData = {
          personas: personaPerformances,
          marketContext: {
            benchmark: 'S&P 500 (SPY)',
            benchmarkReturn: spyFinalReturn,
            period: dateRange,
            marketIndices: marketIndicesData.length > 0 ? marketIndicesData : [
              { name: 'goldIndex', symbol: 'GLD', return: 0 },
              { name: 'crudeOilIndex', symbol: 'CL', return: 0 },
              { name: 'nasdaqIndex', symbol: 'QQQ', return: 0 },
              { name: 'aiIndex', symbol: 'AIQ', return: 0 },
            ],
            keyDrivers: keyDrivers.length > 0 ? keyDrivers : [
              { sector: 'N/A', symbol: '-', return: 0, impact: 'positive', description: 'No data available' }
            ],
          },
          topPerformer: {
            name: topPerformer.key,
            reason: `longReturn:${topLatestSnapshot?.longReturn?.toFixed(2) || '0'}|shortReturn:${topLatestSnapshot?.shortReturn?.toFixed(2) || '0'}`,
            keyHoldings: topKeyHoldings.length > 0 ? topKeyHoldings : ['No position data'],
            holdingDetails: topHoldingDetails,
            longReturn: topLatestSnapshot?.longReturn ?? 0,
            shortReturn: topLatestSnapshot?.shortReturn ?? 0,
          },
          bottomPerformer: {
            name: bottomPerformer.key,
            reason: `longReturn:${bottomLatestSnapshot?.longReturn?.toFixed(2) || '0'}|shortReturn:${bottomLatestSnapshot?.shortReturn?.toFixed(2) || '0'}`,
            keyHoldings: bottomKeyHoldings.length > 0 ? bottomKeyHoldings : ['No position data'],
            holdingDetails: bottomHoldingDetails,
            longReturn: bottomLatestSnapshot?.longReturn ?? 0,
            shortReturn: bottomLatestSnapshot?.shortReturn ?? 0,
          },
        };

        setInsightsData(insights);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching portfolio data:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch data');
        setLoading(false);
      }
    };

    fetchAllData();
  }, []);

  // Language selector component
  const LanguageSelector = () => (
    <div className="flex items-center gap-2">
      {LANGUAGE_OPTIONS.map((lang) => (
        <button
          key={lang.code}
          onClick={() => setLanguage(lang.code)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
            language === lang.code
              ? 'bg-gray-900 text-white shadow-md'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
          title={lang.label}
        >
          {lang.flag} {lang.code}
        </button>
      ))}
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96 bg-gray-50 rounded-lg">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4"></div>
          <p className="text-gray-600">{txt('loading')}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-96 bg-red-50 rounded-lg">
        <div className="text-center text-red-600">
          <p className="font-bold">{txt('errorLoadingData')}</p>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (periodReturnData.length === 0) {
    return (
      <div className="flex items-center justify-center h-96 bg-yellow-50 rounded-lg">
        <p className="text-yellow-700">{txt('noCommonDataPoints')}</p>
      </div>
    );
  }

  const xAxisInterval = Math.max(1, Math.floor(periodReturnData.length / 15));

  return (
    <div className="w-full space-y-8">
      {/* Language Selector - Fixed to top right */}
      <div className="flex justify-end sticky top-4 z-10">
        <LanguageSelector />
      </div>

      {/* Chart 1: Period Returns */}
      <div className="bg-white p-6 rounded-lg shadow-lg">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-800 mb-2">
            {txt('periodReturnsTitle')}
          </h2>
          <p className="text-gray-600">
            {stats.totalPoints} {txt('qualifiedDataPoints')} | {stats.dateRange}
          </p>
          <p className="text-sm text-gray-500 mt-1">
            {txt('periodReturnsSubtitle')}
          </p>
        </div>

        <ResponsiveContainer width="100%" height={500}>
          <LineChart
            data={periodReturnData}
            margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
            <XAxis
              dataKey="displayLabel"
              tick={{ fontSize: 10, fill: '#666' }}
              angle={-45}
              textAnchor="end"
              height={80}
              interval={xAxisInterval}
            />
            <YAxis
              tick={{ fontSize: 12, fill: '#666' }}
              tickFormatter={(value) => `${value}%`}
              domain={['auto', 'auto']}
            />
            <ReferenceLine y={0} stroke="#999" strokeDasharray="3 3" />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                border: '1px solid #ccc',
                borderRadius: '8px',
                fontSize: '12px',
              }}
              formatter={(value: number, name: string) => {
                return [`${value.toFixed(2)}%`, pn(name)];
              }}
              labelFormatter={(label) => `${txt('time')}: ${label}`}
            />
            <Legend
              wrapperStyle={{ paddingTop: '20px', cursor: 'pointer' }}
              formatter={(value) => pn(value)}
              onClick={(e) => handleLegendClick(e.dataKey as string)}
            />

            {PERSONAS.map((persona) => (
              <Line
                key={persona.key}
                type="monotone"
                dataKey={persona.key}
                name={persona.key}
                stroke={persona.color}
                strokeWidth={highlightedLine === persona.key ? 5 : (highlightedLine ? 1 : 2)}
                strokeOpacity={highlightedLine && highlightedLine !== persona.key ? 0.2 : 1}
                dot={false}
                activeDot={{ r: highlightedLine === persona.key ? 8 : 4 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Chart 2: Accumulated Returns */}
      <div className="bg-white p-6 rounded-lg shadow-lg">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-800 mb-2">
            {txt('accumulatedReturnsTitle')}
          </h2>
          <p className="text-gray-600">
            {stats.totalPoints} {txt('qualifiedDataPoints')} | {stats.dateRange}
          </p>
          <p className="text-sm text-gray-500 mt-1">
            {txt('accumulatedReturnsSubtitle')}
          </p>
        </div>

        <ResponsiveContainer width="100%" height={500}>
          <LineChart
            data={accumulatedData}
            margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
            <XAxis
              dataKey="displayLabel"
              tick={{ fontSize: 10, fill: '#666' }}
              angle={-45}
              textAnchor="end"
              height={80}
              interval={xAxisInterval}
            />
            <YAxis
              tick={{ fontSize: 12, fill: '#666' }}
              tickFormatter={(value) => `${value}%`}
              domain={['auto', 'auto']}
            />
            <ReferenceLine y={0} stroke="#999" strokeDasharray="3 3" />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                border: '1px solid #ccc',
                borderRadius: '8px',
                fontSize: '12px',
              }}
              formatter={(value: number, name: string) => {
                if (name === 'spy') {
                  return [`${value.toFixed(2)}%`, SPY_CONFIG.name];
                }
                return [`${value.toFixed(2)}%`, pn(name)];
              }}
              labelFormatter={(label) => `${txt('time')}: ${label}`}
            />
            <Legend
              wrapperStyle={{ paddingTop: '20px', cursor: 'pointer' }}
              formatter={(value) => {
                if (value === 'spy') return SPY_CONFIG.name;
                return pn(value);
              }}
              onClick={(e) => handleLegendClick(e.dataKey as string)}
            />

            {/* SPY line - black, thicker, dashed */}
            <Line
              key="spy"
              type="monotone"
              dataKey="spy"
              name="spy"
              stroke={SPY_CONFIG.color}
              strokeWidth={highlightedLine === 'spy' ? 6 : (highlightedLine ? 1.5 : 3)}
              strokeOpacity={highlightedLine && highlightedLine !== 'spy' ? 0.2 : 1}
              strokeDasharray="5 5"
              dot={false}
              activeDot={{ r: highlightedLine === 'spy' ? 8 : 5 }}
              connectNulls
            />

            {/* 8 Personas */}
            {PERSONAS.map((persona) => (
              <Line
                key={persona.key}
                type="monotone"
                dataKey={persona.key}
                name={persona.key}
                stroke={persona.color}
                strokeWidth={highlightedLine === persona.key ? 5 : (highlightedLine ? 1 : 2)}
                strokeOpacity={highlightedLine && highlightedLine !== persona.key ? 0.2 : 1}
                dot={false}
                activeDot={{ r: highlightedLine === persona.key ? 8 : 4 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>

        {/* Final Accumulated Returns Summary */}
        <div className="mt-6">
          <h3 className="text-lg font-bold text-gray-700 mb-3">{txt('finalAccumulatedReturns')}</h3>
          <div className="grid grid-cols-3 gap-4">
            {/* SPY First */}
            <div
              className="p-3 rounded-lg border-2"
              style={{ borderColor: SPY_CONFIG.color }}
            >
              <div
                className="font-bold text-sm mb-1"
                style={{ color: SPY_CONFIG.color }}
              >
                {SPY_CONFIG.name}
              </div>
              <div className="text-lg font-mono">
                {accumulatedData.length > 0
                  ? `${(accumulatedData[accumulatedData.length - 1]['spy'] as number || 0).toFixed(2)}%`
                  : 'N/A'}
              </div>
            </div>

            {/* 8 Personas */}
            {PERSONAS.map((persona) => {
              const finalReturn = accumulatedData.length > 0
                ? (accumulatedData[accumulatedData.length - 1][persona.key] as number || 0)
                : 0;
              const spyReturn = accumulatedData.length > 0
                ? (accumulatedData[accumulatedData.length - 1]['spy'] as number || 0)
                : 0;
              const outperformance = finalReturn - spyReturn;

              return (
                <div
                  key={persona.key}
                  className="p-3 rounded-lg border"
                  style={{ borderColor: persona.color }}
                >
                  <div
                    className="font-bold text-sm mb-1"
                    style={{ color: persona.color }}
                  >
                    {pn(persona.key)}
                  </div>
                  <div className="text-lg font-mono">
                    {finalReturn.toFixed(2)}%
                  </div>
                  <div className={`text-xs ${outperformance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {txt('vsSpy')}: {outperformance >= 0 ? '+' : ''}{outperformance.toFixed(2)}%
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Performance Insights Section */}
      {insightsData && <PerformanceInsights data={insightsData} language={language} />}
    </div>
  );
}
