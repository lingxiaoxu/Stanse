import React, { useState } from 'react';
import { DollarSign, TrendingUp, Zap, Info, HelpCircle, Bot } from 'lucide-react';

interface CostInfo {
  currentCost: number;       // 本次对话成本
  todayCost: number;          // 今日总成本
  monthCost: number;          // 本月总成本
  tokens: {
    prompt: number;
    completion: number;
    total: number;
  };
  modelUsed: string;
  estimatedBudget?: number;   // 今日预算
}

interface Props {
  costInfo: CostInfo | null;
  language?: string;
  userLabel?: string;  // 用户政治标签
}

export const CostTracker: React.FC<Props> = ({
  costInfo,
  language = 'EN',
  userLabel
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  if (!costInfo) {
    return null;
  }

  const {
    currentCost,
    todayCost,
    monthCost,
    tokens,
    modelUsed,
    estimatedBudget = 1.0
  } = costInfo;

  // 计算预算使用百分比
  const budgetUsedPercent = (todayCost / estimatedBudget) * 100;

  // 获取预算状态颜色
  const getBudgetColor = () => {
    if (budgetUsedPercent < 50) return 'text-green-600';
    if (budgetUsedPercent < 80) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="border-t-2 border-black bg-gray-50 p-2">
      {/* 简洁显示 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1">
          {/* 本次成本 */}
          <div className="flex items-center gap-1">
            <Zap size={12} className="text-blue-600" />
            <span className="font-mono text-[10px] text-gray-700">
              ${currentCost.toFixed(4)}
            </span>
          </div>

          {/* 今日成本 */}
          <div className="flex items-center gap-1">
            <DollarSign size={12} className={getBudgetColor()} />
            <span className={`font-mono text-[10px] ${getBudgetColor()}`}>
              ${todayCost.toFixed(2)}
            </span>
          </div>

          {/* 本月成本 */}
          <div className="flex items-center gap-1">
            <TrendingUp size={12} className="text-purple-600" />
            <span className="font-mono text-[10px] text-gray-700">
              ${monthCost.toFixed(2)}
            </span>
          </div>

          {/* 帮助提示 - 紧挨着数字 */}
          <div className="relative">
            <button
              onClick={() => setShowTooltip(!showTooltip)}
              onBlur={() => setTimeout(() => setShowTooltip(false), 200)}
              className="p-1 hover:bg-gray-200 border border-transparent hover:border-black transition-colors"
            >
              <HelpCircle size={12} className="text-gray-500" />
            </button>

            {/* Tooltip - 5种语言 (标题和解释都翻译) */}
            {showTooltip && (
              <div className="absolute right-0 bottom-full mb-2 w-52 bg-black text-white p-2 text-[9px] font-mono border-2 border-white shadow-lg z-50">
                <div className="space-y-1">
                  <div>⚡ <strong>{
                    language === 'ZH' ? '本次' :
                    language === 'JA' ? '今回' :
                    language === 'FR' ? 'Actuel' :
                    language === 'ES' ? 'Actual' :
                    'Current'
                  }</strong>: {
                    language === 'ZH' ? '本次对话消耗的成本' :
                    language === 'JA' ? '今回の会話で消費したコスト' :
                    language === 'FR' ? 'Coût de cette conversation' :
                    language === 'ES' ? 'Costo de esta conversación' :
                    'Cost of this conversation'
                  }</div>
                  <div>💵 <strong>{
                    language === 'ZH' ? '今日' :
                    language === 'JA' ? '本日' :
                    language === 'FR' ? 'Aujourd\'hui' :
                    language === 'ES' ? 'Hoy' :
                    'Today'
                  }</strong>: {
                    language === 'ZH' ? '今日累计消耗的成本' :
                    language === 'JA' ? '本日の累積コスト' :
                    language === 'FR' ? 'Coût total aujourd\'hui' :
                    language === 'ES' ? 'Costo total de hoy' :
                    'Total cost today'
                  }</div>
                  <div>📈 <strong>{
                    language === 'ZH' ? '本月' :
                    language === 'JA' ? '今月' :
                    language === 'FR' ? 'Ce mois' :
                    language === 'ES' ? 'Este mes' :
                    'Month'
                  }</strong>: {
                    language === 'ZH' ? '本月累计消耗的成本' :
                    language === 'JA' ? '今月の累積コスト' :
                    language === 'FR' ? 'Coût total ce mois' :
                    language === 'ES' ? 'Costo total de este mes' :
                    'Total cost this month'
                  }</div>
                </div>
                {/* 小三角 */}
                <div className="absolute top-full right-2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-black"></div>
              </div>
            )}
          </div>
        </div>

        {/* 展开详情按钮 - 最右边 */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-1 hover:bg-gray-200 border border-transparent hover:border-black transition-colors"
          title={language === 'ZH' ? '详细统计' :
                 language === 'JA' ? '詳細統計' :
                 language === 'FR' ? 'Statistiques' :
                 language === 'ES' ? 'Estadísticas' :
                 'Detailed Statistics'}
        >
          <Info size={12} />
        </button>
      </div>

      {/* 预算进度条 */}
      <div className="mt-1">
        <div className="h-1 bg-gray-300 border border-black overflow-hidden">
          <div
            className={`h-full transition-all ${
              budgetUsedPercent < 50 ? 'bg-green-600' :
              budgetUsedPercent < 80 ? 'bg-yellow-600' :
              'bg-red-600'
            }`}
            style={{ width: `${Math.min(budgetUsedPercent, 100)}%` }}
          />
        </div>
        <div className="font-mono text-[8px] text-gray-500 mt-0.5">
          {language === 'ZH' ? '今日预算' :
           language === 'JA' ? '本日の予算' :
           language === 'FR' ? 'Budget Quotidien' :
           language === 'ES' ? 'Presupuesto Diario' :
           'Daily Budget'}: ${todayCost.toFixed(2)} / ${estimatedBudget.toFixed(2)} ({budgetUsedPercent.toFixed(1)}%)
        </div>
      </div>

      {/* 详细信息 (展开时显示) */}
      {isExpanded && (
        <div className="mt-2 p-2 bg-white border-2 border-black shadow-sm">
          <div className="font-pixel text-xs mb-2">
            {language === 'ZH' ? '详细统计' :
             language === 'JA' ? '詳細統計' :
             language === 'FR' ? 'Statistiques Détaillées' :
             language === 'ES' ? 'Estadísticas Detalladas' :
             'Detailed Statistics'}
          </div>

          <div className="space-y-1 font-mono text-[9px]">
            {/* Token 使用 */}
            <div className="flex justify-between">
              <span className="text-gray-600">
                {language === 'ZH' ? 'Tokens (输入/输出)' :
                 language === 'JA' ? 'トークン (入力/出力)' :
                 language === 'FR' ? 'Tokens (entrée/sortie)' :
                 language === 'ES' ? 'Tokens (entrada/salida)' :
                 'Tokens (in/out)'}:
              </span>
              <span className="font-semibold">
                {tokens.prompt} / {tokens.completion}
              </span>
            </div>

            {/* 总 Tokens */}
            <div className="flex justify-between">
              <span className="text-gray-600">
                {language === 'ZH' ? '总 Tokens' :
                 language === 'JA' ? '総トークン' :
                 language === 'FR' ? 'Tokens totaux' :
                 language === 'ES' ? 'Tokens totales' :
                 'Total Tokens'}:
              </span>
              <span className="font-semibold">{tokens.total}</span>
            </div>

            {/* 使用模型 */}
            <div className="flex justify-between">
              <span className="text-gray-600">
                {language === 'ZH' ? '模型' :
                 language === 'JA' ? 'モデル' :
                 language === 'FR' ? 'Modèle' :
                 language === 'ES' ? 'Modelo' :
                 'Model'}:
              </span>
              <span className="font-semibold text-blue-600">{modelUsed}</span>
            </div>

            {/* 分隔线 */}
            <div className="border-t border-gray-300 my-1" />

            {/* 本次成本 */}
            <div className="flex justify-between">
              <span className="text-gray-600">
                {language === 'ZH' ? '本次成本' :
                 language === 'JA' ? '今回のコスト' :
                 language === 'FR' ? 'Coût actuel' :
                 language === 'ES' ? 'Costo actual' :
                 'Current Cost'}:
              </span>
              <span className="font-semibold text-blue-600">
                ${currentCost.toFixed(6)}
              </span>
            </div>

            {/* 今日成本 */}
            <div className="flex justify-between">
              <span className="text-gray-600">
                {language === 'ZH' ? '今日总计' :
                 language === 'JA' ? '本日の合計' :
                 language === 'FR' ? 'Total aujourd\'hui' :
                 language === 'ES' ? 'Total hoy' :
                 'Today Total'}:
              </span>
              <span className={`font-semibold ${getBudgetColor()}`}>
                ${todayCost.toFixed(4)}
              </span>
            </div>

            {/* 本月成本 */}
            <div className="flex justify-between">
              <span className="text-gray-600">
                {language === 'ZH' ? '本月总计' :
                 language === 'JA' ? '今月の合計' :
                 language === 'FR' ? 'Total ce mois' :
                 language === 'ES' ? 'Total mes' :
                 'Month Total'}:
              </span>
              <span className="font-semibold text-purple-600">
                ${monthCost.toFixed(4)}
              </span>
            </div>

            {/* 剩余预算 */}
            <div className="flex justify-between">
              <span className="text-gray-600">
                {language === 'ZH' ? '今日剩余' :
                 language === 'JA' ? '本日の残高' :
                 language === 'FR' ? 'Reste aujourd\'hui' :
                 language === 'ES' ? 'Restante hoy' :
                 'Remaining Today'}:
              </span>
              <span className={`font-semibold ${
                (estimatedBudget - todayCost) > 0.1 ? 'text-green-600' : 'text-red-600'
              }`}>
                ${Math.max(0, estimatedBudget - todayCost).toFixed(4)}
              </span>
            </div>
          </div>

          {/* 提示信息 */}
          <div className="mt-2 p-1 bg-blue-50 border border-blue-300">
            <div className="font-mono text-[8px] text-blue-700">
              {language === 'ZH' ? '💡 提示: 使用"快速问答"模式可节省成本' :
               language === 'JA' ? '💡 ヒント: "クイック回答"モードでコストを節約' :
               language === 'FR' ? '💡 Astuce: Utilisez le mode "Réponse rapide" pour économiser' :
               language === 'ES' ? '💡 Consejo: Use el modo "Respuesta rápida" para ahorrar' :
               '💡 Tip: Use "Quick Answer" mode to save costs'}
            </div>
          </div>

          {/* 预算警告 */}
          {budgetUsedPercent > 80 && (
            <div className="mt-1 p-1 bg-orange-50 border border-orange-300">
              <div className="font-mono text-[8px] text-orange-700">
                ⚠️ {language === 'ZH'
                  ? '今日预算即将用完，请注意使用'
                  : 'Daily budget almost depleted, please use wisely'}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 用户标签 - 显示 "AI for <label>" - 5种语言 + 黑白图标 */}
      {userLabel && (
        <div className="font-mono text-[8px] text-gray-400 mt-1 flex items-center gap-1">
          <Bot size={10} className="text-gray-500" />
          <span>
            {language === 'ZH' ? `为 ${userLabel} 定制的 AI` :
             language === 'JA' ? `${userLabel} のための AI` :
             language === 'FR' ? `IA pour ${userLabel}` :
             language === 'ES' ? `IA para ${userLabel}` :
             `AI for ${userLabel}`}
          </span>
        </div>
      )}
    </div>
  );
};
