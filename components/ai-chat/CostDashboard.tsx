import React, { useState, useEffect } from 'react';
import { TrendingUp, DollarSign, Zap, BarChart3, PieChart } from 'lucide-react';

interface CostStats {
  summary: {
    total_cost: number;
    total_requests: number;
    total_tokens: number;
    avg_cost_per_request: number;
  };
  by_mode: {
    [mode: string]: {
      requests: number;
      cost: number;
      tokens: number;
    };
  };
  by_model: {
    [model: string]: {
      calls: number;
      cost: number;
      tokens: number;
    };
  };
  trend: Array<{
    time: string;
    cost: number;
    requests: number;
  }>;
}

interface Props {
  userId: string;
  period?: 'today' | 'week' | 'month';
  apiUrl?: string;
  language?: string;
}

export const CostDashboard: React.FC<Props> = ({
  userId,
  period = 'today',
  apiUrl = process.env.NEXT_PUBLIC_EMBER_API_URL,
  language = 'EN'
}) => {
  const [stats, setStats] = useState<CostStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState<'today' | 'week' | 'month'>(period);

  useEffect(() => {
    loadStats();
  }, [userId, selectedPeriod]);

  const loadStats = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `${apiUrl}/cost/stats?user_id=${userId}&period=${selectedPeriod}`
      );
      const data = await response.json();

      if (data.success) {
        setStats(data.data);
      }
    } catch (err) {
      console.error('Failed to load cost stats:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center">
        <div className="animate-spin inline-block w-8 h-8 border-4 border-black border-t-transparent" />
        <p className="font-mono text-sm text-gray-500 mt-2">Loading statistics...</p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="p-8 text-center">
        <p className="font-mono text-sm text-gray-500">No data available</p>
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-50">
      {/* 头部 */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-pixel text-2xl">
          {language === 'ZH' ? '成本统计' : 'Cost Analytics'}
        </h2>

        {/* 时间段选择 */}
        <div className="flex gap-2">
          {(['today', 'week', 'month'] as const).map(p => (
            <button
              key={p}
              onClick={() => setSelectedPeriod(p)}
              className={`px-3 py-1 font-mono text-xs border-2 border-black transition-colors ${
                selectedPeriod === p
                  ? 'bg-black text-white'
                  : 'bg-white hover:bg-gray-100'
              }`}
            >
              {p === 'today' && (language === 'ZH' ? '今日' : 'Today')}
              {p === 'week' && (language === 'ZH' ? '本周' : 'Week')}
              {p === 'month' && (language === 'ZH' ? '本月' : 'Month')}
            </button>
          ))}
        </div>
      </div>

      {/* 总览卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {/* 总成本 */}
        <div className="bg-white border-4 border-black p-4 shadow-pixel">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign size={20} className="text-green-600" />
            <span className="font-mono text-xs text-gray-600">
              {language === 'ZH' ? '总成本' : 'Total Cost'}
            </span>
          </div>
          <div className="font-pixel text-2xl">${stats.summary.total_cost.toFixed(4)}</div>
        </div>

        {/* 总请求 */}
        <div className="bg-white border-4 border-black p-4 shadow-pixel">
          <div className="flex items-center gap-2 mb-2">
            <Zap size={20} className="text-blue-600" />
            <span className="font-mono text-xs text-gray-600">
              {language === 'ZH' ? '总请求' : 'Total Requests'}
            </span>
          </div>
          <div className="font-pixel text-2xl">{stats.summary.total_requests}</div>
        </div>

        {/* 总Tokens */}
        <div className="bg-white border-4 border-black p-4 shadow-pixel">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 size={20} className="text-purple-600" />
            <span className="font-mono text-xs text-gray-600">Tokens</span>
          </div>
          <div className="font-pixel text-2xl">{stats.summary.total_tokens.toLocaleString()}</div>
        </div>

        {/* 平均成本 */}
        <div className="bg-white border-4 border-black p-4 shadow-pixel">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp size={20} className="text-orange-600" />
            <span className="font-mono text-xs text-gray-600">
              {language === 'ZH' ? '平均' : 'Average'}
            </span>
          </div>
          <div className="font-pixel text-lg">${stats.summary.avg_cost_per_request.toFixed(4)}</div>
        </div>
      </div>

      {/* 按模式分组 */}
      <div className="bg-white border-4 border-black p-6 shadow-pixel mb-4">
        <h3 className="font-pixel text-lg mb-4 flex items-center gap-2">
          <PieChart size={18} />
          {language === 'ZH' ? '按模式统计' : 'By Mode'}
        </h3>

        <div className="space-y-3">
          {Object.entries(stats.by_mode).map(([mode, data]) => {
            const percent = (data.requests / stats.summary.total_requests) * 100;

            return (
              <div key={mode}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-sm capitalize">{mode}</span>
                  <span className="font-mono text-xs text-gray-600">
                    {data.requests} requests ({percent.toFixed(1)}%)
                  </span>
                </div>

                {/* 进度条 */}
                <div className="h-6 bg-gray-200 border-2 border-black flex items-center overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all flex items-center justify-center"
                    style={{ width: `${percent}%` }}
                  >
                    {percent > 15 && (
                      <span className="font-mono text-[10px] text-white px-2">
                        ${data.cost.toFixed(4)}
                      </span>
                    )}
                  </div>
                  {percent <= 15 && (
                    <span className="font-mono text-[10px] text-gray-700 px-2">
                      ${data.cost.toFixed(4)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 按模型分组 */}
      <div className="bg-white border-4 border-black p-6 shadow-pixel">
        <h3 className="font-pixel text-lg mb-4 flex items-center gap-2">
          <BarChart3 size={18} />
          {language === 'ZH' ? '按模型统计' : 'By Model'}
        </h3>

        <div className="grid gap-3">
          {Object.entries(stats.by_model).map(([model, data]) => {
            const modelDisplay = model.includes('/')
              ? model.split('/')[1]
              : model.split('-')[0];

            return (
              <div key={model} className="flex items-center justify-between p-3 bg-gray-50 border-2 border-gray-300">
                <div className="flex-1">
                  <div className="font-mono text-sm font-semibold">{modelDisplay}</div>
                  <div className="font-mono text-[10px] text-gray-600">
                    {data.calls} calls • {data.tokens.toLocaleString()} tokens
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-sm font-semibold text-green-700">
                    ${data.cost.toFixed(4)}
                  </div>
                  <div className="font-mono text-[10px] text-gray-600">
                    ${(data.cost / data.calls).toFixed(6)}/call
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
