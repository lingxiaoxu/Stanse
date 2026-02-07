'use client';

import { useMemo } from 'react';
import { TrendingUp, TrendingDown, Fuel, Cpu, DollarSign, BarChart3 } from 'lucide-react';
import { type Language, t, getPersonaName } from './portfolioChartTranslations';

// Performance insight data structure
export interface PersonaPerformance {
  key: string;
  name: string; // This is actually the key, will be translated
  color: string;
  accumulatedReturn: number;
  avgDailyReturn: number;
  winRate: number;
  vsSpy: number;
}

export interface SectorDriver {
  sector: string; // translation key
  symbol: string;
  return: number;
  impact: 'positive' | 'negative';
  description: string; // translation key
}

export interface MarketIndex {
  name: string; // translation key
  symbol: string;
  return: number;
}

export interface MarketContext {
  benchmark: string;
  benchmarkReturn: number;
  period: string;
  marketIndices: MarketIndex[]; // Gold, Oil, QQQ, SMH
  keyDrivers: SectorDriver[]; // Top moving stocks from portfolio
}

export interface HoldingPerformance {
  symbol: string;
  return: number;
  position: 'long' | 'short';
  sector?: 'tech' | 'energy' | 'other';
}

export interface PerformerInsight {
  name: string; // persona key, will be translated
  reason: string; // dynamic format: "longReturn:X|shortReturn:Y"
  keyHoldings: string[]; // display strings like "AMAT +19.9%"
  holdingDetails?: HoldingPerformance[]; // detailed holding data for analysis
  longReturn: number;
  shortReturn: number;
}

export interface PerformanceInsightsData {
  personas: PersonaPerformance[];
  marketContext: MarketContext;
  topPerformer: PerformerInsight;
  bottomPerformer: PerformerInsight;
}

interface PerformanceInsightsProps {
  data: PerformanceInsightsData;
  language: Language;
}

// Icon mapping for sectors/commodities
const getSectorIcon = (sector: string) => {
  const lowerSector = sector.toLowerCase();
  if (lowerSector.includes('oil') || lowerSector.includes('crude') || lowerSector.includes('energy')) {
    return <Fuel className="w-4 h-4" />;
  }
  if (lowerSector.includes('tech') || lowerSector.includes('nasdaq') || lowerSector.includes('ai')) {
    return <Cpu className="w-4 h-4" />;
  }
  if (lowerSector.includes('gold') || lowerSector.includes('silver') || lowerSector.includes('metal')) {
    return <DollarSign className="w-4 h-4" />;
  }
  return <BarChart3 className="w-4 h-4" />;
};

export default function PerformanceInsights({ data, language }: PerformanceInsightsProps) {
  // Helper functions for translations
  const txt = (key: string, vars?: Record<string, string | number>) => t(language, key, vars);
  const pn = (key: string) => getPersonaName(language, key);

  // Sort personas by accumulated return
  const sortedPersonas = useMemo(() => {
    return [...data.personas].sort((a, b) => b.accumulatedReturn - a.accumulatedReturn);
  }, [data.personas]);

  const topThree = sortedPersonas.slice(0, 3);
  // Bottom three: keep original order (worst last), don't reverse
  const bottomThree = sortedPersonas.slice(-3);

  // Get market index returns for context
  const getMarketContext = () => {
    const oilIndex = data.marketContext.marketIndices.find(i => i.name === 'crudeOilIndex');
    const techIndex = data.marketContext.marketIndices.find(i => i.name === 'nasdaqIndex' || i.name === 'aiIndex');
    const goldIndex = data.marketContext.marketIndices.find(i => i.name === 'goldIndex');
    return {
      oilReturn: oilIndex?.return ?? 0,
      techReturn: techIndex?.return ?? 0,
      goldReturn: goldIndex?.return ?? 0,
    };
  };

  const marketContext = getMarketContext();

  // Analyze holdings to generate insights about sector exposure
  const analyzeHoldings = (holdings: HoldingPerformance[] | undefined, isTop: boolean): {
    techExposure: { longCount: number; shortCount: number };
    energyExposure: { longCount: number; shortCount: number };
    keyContributors: string[];
    sectorInsight: string;
  } => {
    if (!holdings || holdings.length === 0) {
      return {
        techExposure: { longCount: 0, shortCount: 0 },
        energyExposure: { longCount: 0, shortCount: 0 },
        keyContributors: [],
        sectorInsight: '',
      };
    }

    const techHoldings = holdings.filter(h => h.sector === 'tech');
    const energyHoldings = holdings.filter(h => h.sector === 'energy');
    const keyContributors: string[] = [];

    const techLongCount = techHoldings.filter(h => h.position === 'long').length;
    const techShortCount = techHoldings.filter(h => h.position === 'short').length;
    const energyLongCount = energyHoldings.filter(h => h.position === 'long').length;
    const energyShortCount = energyHoldings.filter(h => h.position === 'short').length;

    // Sort by contribution to find key contributors
    const sorted = [...holdings].sort((a, b) => {
      const aContrib = a.position === 'long' ? a.return : -a.return;
      const bContrib = b.position === 'long' ? b.return : -b.return;
      return isTop ? (bContrib - aContrib) : (aContrib - bContrib);
    });

    // Get top 2-3 contributors
    sorted.slice(0, 3).forEach(h => {
      const contribution = h.position === 'long' ? h.return : -h.return;
      if (isTop && contribution > 0) {
        keyContributors.push(`${h.position === 'long' ? 'Long' : 'Short'} ${h.symbol} (${h.return >= 0 ? '+' : ''}${h.return.toFixed(1)}%)`);
      } else if (!isTop && contribution < 0) {
        keyContributors.push(`${h.position === 'long' ? 'Long' : 'Short'} ${h.symbol} (${h.return >= 0 ? '+' : ''}${h.return.toFixed(1)}%)`);
      }
    });

    // Generate sector insight based on market context
    let sectorInsight = '';
    const oilUp = marketContext.oilReturn > 2;
    const oilDown = marketContext.oilReturn < -2;
    const techUp = marketContext.techReturn > 2;
    const techDown = marketContext.techReturn < -2;

    if (isTop) {
      // Explain why top performer won
      if (oilUp && energyLongCount > 0) {
        sectorInsight = language === 'ZH'
          ? `原油上涨${marketContext.oilReturn.toFixed(1)}%，做多${energyLongCount}只能源股获利。`
          : language === 'JA'
          ? `原油が${marketContext.oilReturn.toFixed(1)}%上昇、${energyLongCount}銘柄のエネルギー株ロングが好調。`
          : `Crude oil +${marketContext.oilReturn.toFixed(1)}%, long ${energyLongCount} energy stocks benefited.`;
      } else if (techDown && techShortCount > 0) {
        sectorInsight = language === 'ZH'
          ? `科技股下跌${Math.abs(marketContext.techReturn).toFixed(1)}%，做空${techShortCount}只科技股获利。`
          : language === 'JA'
          ? `テック株が${Math.abs(marketContext.techReturn).toFixed(1)}%下落、${techShortCount}銘柄のテック株ショートが好調。`
          : `Tech down ${Math.abs(marketContext.techReturn).toFixed(1)}%, short ${techShortCount} tech stocks profited.`;
      } else if (techUp && techLongCount > 0) {
        sectorInsight = language === 'ZH'
          ? `科技股上涨${marketContext.techReturn.toFixed(1)}%，做多${techLongCount}只科技股获利。`
          : language === 'JA'
          ? `テック株が${marketContext.techReturn.toFixed(1)}%上昇、${techLongCount}銘柄のテック株ロングが好調。`
          : `Tech up ${marketContext.techReturn.toFixed(1)}%, long ${techLongCount} tech stocks benefited.`;
      }
    } else {
      // Explain why bottom performer lost
      if (oilUp && energyShortCount > 0) {
        sectorInsight = language === 'ZH'
          ? `原油上涨${marketContext.oilReturn.toFixed(1)}%，但做空${energyShortCount}只能源股导致亏损。`
          : language === 'JA'
          ? `原油が${marketContext.oilReturn.toFixed(1)}%上昇、${energyShortCount}銘柄のエネルギー株ショートで損失。`
          : `Crude oil +${marketContext.oilReturn.toFixed(1)}%, but short ${energyShortCount} energy stocks caused losses.`;
      } else if (techDown && techLongCount > 0) {
        sectorInsight = language === 'ZH'
          ? `科技股下跌${Math.abs(marketContext.techReturn).toFixed(1)}%，做多${techLongCount}只科技股导致亏损。`
          : language === 'JA'
          ? `テック株が${Math.abs(marketContext.techReturn).toFixed(1)}%下落、${techLongCount}銘柄のテック株ロングで損失。`
          : `Tech down ${Math.abs(marketContext.techReturn).toFixed(1)}%, long ${techLongCount} tech stocks caused losses.`;
      } else if (oilDown && energyLongCount > 0) {
        sectorInsight = language === 'ZH'
          ? `原油下跌${Math.abs(marketContext.oilReturn).toFixed(1)}%，做多${energyLongCount}只能源股导致亏损。`
          : language === 'JA'
          ? `原油が${Math.abs(marketContext.oilReturn).toFixed(1)}%下落、${energyLongCount}銘柄のエネルギー株ロングで損失。`
          : `Crude oil down ${Math.abs(marketContext.oilReturn).toFixed(1)}%, long ${energyLongCount} energy stocks caused losses.`;
      }
    }

    return {
      techExposure: { longCount: techLongCount, shortCount: techShortCount },
      energyExposure: { longCount: energyLongCount, shortCount: energyShortCount },
      keyContributors,
      sectorInsight,
    };
  };

  // Parse dynamic reason string to generate explanation
  const parseReason = (performer: PerformerInsight, isTop: boolean): string => {
    const { longReturn, shortReturn, holdingDetails } = performer;
    const analysis = analyzeHoldings(holdingDetails, isTop);

    // Combine sector insight with key contributors
    let contextExplanation = '';

    // First, add sector/market context if available
    if (analysis.sectorInsight) {
      contextExplanation = analysis.sectorInsight;
    }

    // Then add specific stock contributors if we have them
    if (analysis.keyContributors.length > 0 && !analysis.sectorInsight) {
      const contributorText = analysis.keyContributors.slice(0, 2).join(', ');
      if (language === 'ZH') {
        contextExplanation = isTop
          ? `主要贡献: ${contributorText}。`
          : `主要拖累: ${contributorText}。`;
      } else if (language === 'JA') {
        contextExplanation = isTop
          ? `主要な貢献: ${contributorText}。`
          : `主な足かせ: ${contributorText}。`;
      } else if (language === 'FR') {
        contextExplanation = isTop
          ? `Principaux contributeurs: ${contributorText}.`
          : `Principaux freins: ${contributorText}.`;
      } else if (language === 'ES') {
        contextExplanation = isTop
          ? `Principales contribuyentes: ${contributorText}.`
          : `Principales lastres: ${contributorText}.`;
      } else {
        contextExplanation = isTop
          ? `Key contributors: ${contributorText}.`
          : `Key drags: ${contributorText}.`;
      }
    }

    // Default fallback messages
    const defaultMsg = {
      ZH: isTop ? '组合策略在当前市场环境下表现优异。' : '组合策略在当前市场环境下表现不佳。',
      JA: isTop ? '現在の市場環境で優れたパフォーマンス。' : '現在の市場環境でパフォーマンスが低迷。',
      FR: isTop ? 'Excellente performance dans l\'environnement actuel.' : 'Performance faible dans l\'environnement actuel.',
      ES: isTop ? 'Excelente desempeño en el entorno actual.' : 'Bajo rendimiento en el entorno actual.',
      EN: isTop ? 'Strong portfolio performance in current market conditions.' : 'Weak portfolio performance in current market conditions.',
    };

    const finalContext = contextExplanation || defaultMsg[language] || defaultMsg.EN;

    if (language === 'ZH') {
      return `多头收益 ${longReturn >= 0 ? '+' : ''}${longReturn.toFixed(2)}%，空头收益 ${shortReturn >= 0 ? '+' : ''}${shortReturn.toFixed(2)}%。${finalContext}`;
    } else if (language === 'JA') {
      return `ロングリターン ${longReturn >= 0 ? '+' : ''}${longReturn.toFixed(2)}%、ショートリターン ${shortReturn >= 0 ? '+' : ''}${shortReturn.toFixed(2)}%。${finalContext}`;
    } else if (language === 'FR') {
      return `Rendement long ${longReturn >= 0 ? '+' : ''}${longReturn.toFixed(2)}%, rendement court ${shortReturn >= 0 ? '+' : ''}${shortReturn.toFixed(2)}%. ${finalContext}`;
    } else if (language === 'ES') {
      return `Rendimiento largo ${longReturn >= 0 ? '+' : ''}${longReturn.toFixed(2)}%, rendimiento corto ${shortReturn >= 0 ? '+' : ''}${shortReturn.toFixed(2)}%. ${finalContext}`;
    } else {
      return `Long return ${longReturn >= 0 ? '+' : ''}${longReturn.toFixed(2)}%, short return ${shortReturn >= 0 ? '+' : ''}${shortReturn.toFixed(2)}%. ${finalContext}`;
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-lg space-y-6">
      {/* Header */}
      <div className="border-b pb-4">
        <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <BarChart3 className="w-6 h-6" />
          {txt('performanceInsights')}
        </h2>
        <p className="text-gray-600 text-sm mt-1">
          {data.marketContext.period} | {txt('benchmark')}: {data.marketContext.benchmark} ({data.marketContext.benchmarkReturn >= 0 ? '+' : ''}{data.marketContext.benchmarkReturn.toFixed(2)}%)
        </p>
      </div>

      {/* Section 1a: Market Indices */}
      <div className="bg-blue-50 p-4 rounded-lg">
        <h3 className="font-bold text-gray-700 mb-3 flex items-center gap-2">
          <BarChart3 className="w-5 h-5" />
          {txt('marketIndices')}
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {data.marketContext.marketIndices.map((index, idx) => (
            <div
              key={idx}
              className={`p-3 rounded border-l-4 ${
                index.return >= 0
                  ? 'border-blue-500 bg-white'
                  : 'border-orange-500 bg-white'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                {getSectorIcon(index.name)}
                <span className="font-bold text-sm">{txt(index.name)}</span>
              </div>
              <div className="text-xs text-gray-500 mb-1">{index.symbol}</div>
              <div className={`text-lg font-mono font-bold ${index.return >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {index.return >= 0 ? '+' : ''}{index.return.toFixed(2)}%
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Section 1b: Top Moving Stocks */}
      <div className="bg-gray-50 p-4 rounded-lg">
        <h3 className="font-bold text-gray-700 mb-3 flex items-center gap-2">
          <DollarSign className="w-5 h-5" />
          {txt('marketDrivers')}
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {data.marketContext.keyDrivers.map((driver, idx) => (
            <div
              key={idx}
              className={`p-3 rounded border-l-4 ${
                driver.impact === 'positive'
                  ? 'border-green-500 bg-green-50'
                  : 'border-red-500 bg-red-50'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="font-bold text-sm font-mono">{driver.symbol}</span>
              </div>
              <div className={`text-lg font-mono ${driver.return >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {driver.return >= 0 ? '+' : ''}{driver.return.toFixed(2)}%
              </div>
              <p className="text-xs text-gray-600 mt-1 truncate" title={driver.description}>{driver.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Section 2: Rankings */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Top Performers */}
        <div className="bg-green-50 p-4 rounded-lg border border-green-200">
          <h3 className="font-bold text-green-800 mb-3 flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            {txt('topPerformers')}
          </h3>
          <div className="space-y-2">
            {topThree.map((persona, idx) => (
              <div
                key={persona.key}
                className="flex items-center justify-between bg-white p-2 rounded"
              >
                <div className="flex items-center gap-2">
                  <span className="font-bold text-lg text-gray-400">#{idx + 1}</span>
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: persona.color }}
                  />
                  <span className="font-medium">{pn(persona.key)}</span>
                </div>
                <div className="text-right">
                  <span className={`font-mono font-bold ${persona.accumulatedReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {persona.accumulatedReturn >= 0 ? '+' : ''}{persona.accumulatedReturn.toFixed(2)}%
                  </span>
                  <span className="text-xs text-gray-500 ml-2">
                    ({persona.winRate.toFixed(0)}% {txt('win')})
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Performers */}
        <div className="bg-red-50 p-4 rounded-lg border border-red-200">
          <h3 className="font-bold text-red-800 mb-3 flex items-center gap-2">
            <TrendingDown className="w-5 h-5" />
            {txt('bottomPerformers')}
          </h3>
          <div className="space-y-2">
            {bottomThree.map((persona, idx) => (
              <div
                key={persona.key}
                className="flex items-center justify-between bg-white p-2 rounded"
              >
                <div className="flex items-center gap-2">
                  <span className="font-bold text-lg text-gray-400">#{sortedPersonas.length - 3 + idx + 1}</span>
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: persona.color }}
                  />
                  <span className="font-medium">{pn(persona.key)}</span>
                </div>
                <div className="text-right">
                  <span className={`font-mono font-bold ${persona.accumulatedReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {persona.accumulatedReturn >= 0 ? '+' : ''}{persona.accumulatedReturn.toFixed(2)}%
                  </span>
                  <span className="text-xs text-gray-500 ml-2">
                    ({persona.winRate.toFixed(0)}% {txt('win')})
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Section 3: Key Insights */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Top Performer Insight */}
        <div className="bg-green-100 p-4 rounded-lg border-2 border-green-300">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-5 h-5 text-green-700" />
            <h4 className="font-bold text-green-800">
              {txt('whyWon', { name: pn(data.topPerformer.name) })}
            </h4>
          </div>
          <p className="text-sm text-green-900 mb-2">{parseReason(data.topPerformer, true)}</p>
          <div className="flex flex-wrap gap-1">
            {data.topPerformer.keyHoldings.map((holding, idx) => (
              <span
                key={idx}
                className="px-2 py-1 bg-green-200 text-green-800 text-xs rounded font-mono"
              >
                {holding}
              </span>
            ))}
          </div>
        </div>

        {/* Bottom Performer Insight */}
        <div className="bg-red-100 p-4 rounded-lg border-2 border-red-300">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="w-5 h-5 text-red-700" />
            <h4 className="font-bold text-red-800">
              {txt('whyLost', { name: pn(data.bottomPerformer.name) })}
            </h4>
          </div>
          <p className="text-sm text-red-900 mb-2">{parseReason(data.bottomPerformer, false)}</p>
          <div className="flex flex-wrap gap-1">
            {data.bottomPerformer.keyHoldings.map((holding, idx) => (
              <span
                key={idx}
                className="px-2 py-1 bg-red-200 text-red-800 text-xs rounded font-mono"
              >
                {holding}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Section 4: Full Ranking Table */}
      <div className="overflow-x-auto">
        <h3 className="font-bold text-gray-700 mb-3">{txt('completeRanking')}</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="text-left p-2">{txt('rank')}</th>
              <th className="text-left p-2">{txt('persona')}</th>
              <th className="text-right p-2">{txt('return')}</th>
              <th className="text-right p-2">{txt('vsSpy')}</th>
              <th className="text-right p-2">{txt('winRate')}</th>
              <th className="text-right p-2">{txt('avgDaily')}</th>
            </tr>
          </thead>
          <tbody>
            {sortedPersonas.map((persona, idx) => (
              <tr
                key={persona.key}
                className={`border-b ${idx === 0 ? 'bg-green-50' : idx === sortedPersonas.length - 1 ? 'bg-red-50' : ''}`}
              >
                <td className="p-2 font-bold text-gray-500">#{idx + 1}</td>
                <td className="p-2">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: persona.color }}
                    />
                    <span className="font-medium">{pn(persona.key)}</span>
                  </div>
                </td>
                <td className={`p-2 text-right font-mono ${persona.accumulatedReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {persona.accumulatedReturn >= 0 ? '+' : ''}{persona.accumulatedReturn.toFixed(2)}%
                </td>
                <td className={`p-2 text-right font-mono ${persona.vsSpy >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {persona.vsSpy >= 0 ? '+' : ''}{persona.vsSpy.toFixed(2)}%
                </td>
                <td className="p-2 text-right font-mono">{persona.winRate.toFixed(1)}%</td>
                <td className={`p-2 text-right font-mono ${persona.avgDailyReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {persona.avgDailyReturn >= 0 ? '+' : ''}{persona.avgDailyReturn.toFixed(3)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
