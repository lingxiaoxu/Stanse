import React from 'react';
import { Zap, Users, Brain, List, DollarSign, Clock, Award } from 'lucide-react';

export type ChatMode = 'default' | 'multi' | 'ensemble' | 'batch';

interface ChatModeInfo {
  id: ChatMode;
  name: string;           // EN
  nameZH: string;         // 中文
  nameJA: string;         // 日本語
  nameFR: string;         // Français
  nameES: string;         // Español
  description: string;    // EN
  descriptionZH: string;  // 中文
  descriptionJA: string;  // 日本語
  descriptionFR: string;  // Français
  descriptionES: string;  // Español
  icon: React.ReactNode;
  costLevel: 'low' | 'medium' | 'high';
  speed: 'fast' | 'medium' | 'slow';
  quality: 'good' | 'better' | 'best';
  estimatedCost: string;
  estimatedTime: string;
}

const CHAT_MODES: ChatModeInfo[] = [
  {
    id: 'default',
    name: 'Quick Answer',
    nameZH: '快速问答',
    nameJA: 'クイック回答',
    nameFR: 'Réponse Rapide',
    nameES: 'Respuesta Rápida',
    description: 'Fast and efficient for simple questions',
    descriptionZH: '最快速，适合简单问题',
    descriptionJA: '簡単な質問に高速で効率的',
    descriptionFR: 'Rapide et efficace pour les questions simples',
    descriptionES: 'Rápido y eficiente para preguntas simples',
    icon: <Zap size={18} />,
    costLevel: 'low',
    speed: 'fast',
    quality: 'good',
    estimatedCost: '$0.001',
    estimatedTime: '<2s'
  },
  {
    id: 'multi',
    name: 'Expert Panel',
    nameZH: '专家会诊',
    nameJA: 'エキスパートパネル',
    nameFR: 'Panel d\'Experts',
    nameES: 'Panel de Expertos',
    description: '3 AIs answer simultaneously for comparison',
    descriptionZH: '3个AI同时回答，对比观点',
    descriptionJA: '3つのAIが同時に回答し比較',
    descriptionFR: '3 IA répondent simultanément pour comparaison',
    descriptionES: '3 IA responden simultáneamente para comparar',
    icon: <Users size={18} />,
    costLevel: 'medium',
    speed: 'medium',
    quality: 'better',
    estimatedCost: '$0.004',
    estimatedTime: '3-5s'
  },
  {
    id: 'ensemble',
    name: 'Deep Analysis',
    nameZH: '深度分析',
    nameJA: '深層分析',
    nameFR: 'Analyse Approfondie',
    nameES: 'Análisis Profundo',
    description: '6 AIs collaborate for highest quality',
    descriptionZH: '6个AI协作，最高质量',
    descriptionJA: '6つのAIが協力し最高品質',
    descriptionFR: '6 IA collaborent pour la meilleure qualité',
    descriptionES: '6 IA colaboran para la máxima calidad',
    icon: <Brain size={18} />,
    costLevel: 'high',
    speed: 'slow',
    quality: 'best',
    estimatedCost: '$0.018',
    estimatedTime: '8-12s'
  },
  {
    id: 'batch',
    name: 'Batch Processing',
    nameZH: '批量处理',
    nameJA: 'バッチ処理',
    nameFR: 'Traitement par Lot',
    nameES: 'Procesamiento por Lotes',
    description: 'Process multiple questions at once',
    descriptionZH: '同时处理多个问题',
    descriptionJA: '複数の質問を一度に処理',
    descriptionFR: 'Traiter plusieurs questions à la fois',
    descriptionES: 'Procesar múltiples preguntas a la vez',
    icon: <List size={18} />,
    costLevel: 'medium',
    speed: 'fast',
    quality: 'good',
    estimatedCost: '$0.0002/q',
    estimatedTime: '2-5s'
  }
];

interface Props {
  activeMode: ChatMode;
  onChange: (mode: ChatMode) => void;
  language?: string;
}

export const ChatModeSelector: React.FC<Props> = ({
  activeMode,
  onChange,
  language = 'EN'
}) => {
  const [isExpanded, setIsExpanded] = React.useState(false);

  const activeInfo = CHAT_MODES.find(m => m.id === activeMode)!;

  return (
    <div className="relative">
      {/* 当前模式按钮 */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-2 border-2 border-black bg-white hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          {activeInfo.icon}
          <div className="text-left">
            <div className="font-pixel text-xs">
              {language === 'ZH' ? activeInfo.nameZH :
               language === 'JA' ? activeInfo.nameJA :
               language === 'FR' ? activeInfo.nameFR :
               language === 'ES' ? activeInfo.nameES :
               activeInfo.name}
            </div>
            <div className="font-mono text-[9px] text-gray-500">
              {activeInfo.estimatedCost} • {activeInfo.estimatedTime}
            </div>
          </div>
        </div>
        <div className={`transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
          ▼
        </div>
      </button>

      {/* 模式选择面板 */}
      {isExpanded && (
        <>
          {/* 背景遮罩 */}
          <div
            className="fixed inset-0 z-[100]"
            onClick={() => setIsExpanded(false)}
          />

          {/* 选择面板 - 移除 max-h 限制，让内容完整显示 */}
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border-4 border-black shadow-pixel z-[101]">
            {CHAT_MODES.map((mode) => {
              const isActive = mode.id === activeMode;

              return (
                <button
                  key={mode.id}
                  onClick={() => {
                    onChange(mode.id);
                    setIsExpanded(false);
                  }}
                  className={`w-full p-3 border-b-2 border-black last:border-b-0 hover:bg-gray-50 transition-colors text-left ${
                    isActive ? 'bg-blue-50' : ''
                  }`}
                >
                  {/* 模式头部 */}
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {mode.icon}
                      <div>
                        <div className="font-pixel text-sm">
                          {language === 'ZH' ? mode.nameZH :
                           language === 'JA' ? mode.nameJA :
                           language === 'FR' ? mode.nameFR :
                           language === 'ES' ? mode.nameES :
                           mode.name}
                        </div>
                        <div className="font-mono text-[10px] text-gray-600">
                          {language === 'ZH' ? mode.descriptionZH :
                           language === 'JA' ? mode.descriptionJA :
                           language === 'FR' ? mode.descriptionFR :
                           language === 'ES' ? mode.descriptionES :
                           mode.description}
                        </div>
                      </div>
                    </div>
                    {isActive && (
                      <div className="bg-blue-600 text-white px-2 py-1 font-mono text-[9px] border border-black">
                        ACTIVE
                      </div>
                    )}
                  </div>

                  {/* 模式指标 */}
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    {/* 成本 */}
                    <div className="flex items-center gap-1">
                      <DollarSign size={12} className={`
                        ${mode.costLevel === 'low' && 'text-green-600'}
                        ${mode.costLevel === 'medium' && 'text-yellow-600'}
                        ${mode.costLevel === 'high' && 'text-red-600'}
                      `} />
                      <span className="font-mono text-[9px]">{mode.estimatedCost}</span>
                    </div>

                    {/* 速度 */}
                    <div className="flex items-center gap-1">
                      <Clock size={12} className={`
                        ${mode.speed === 'fast' && 'text-green-600'}
                        ${mode.speed === 'medium' && 'text-yellow-600'}
                        ${mode.speed === 'slow' && 'text-orange-600'}
                      `} />
                      <span className="font-mono text-[9px]">{mode.estimatedTime}</span>
                    </div>

                    {/* 质量 */}
                    <div className="flex items-center gap-1">
                      <Award size={12} className={`
                        ${mode.quality === 'good' && 'text-blue-600'}
                        ${mode.quality === 'better' && 'text-purple-600'}
                        ${mode.quality === 'best' && 'text-pink-600'}
                      `} />
                      <span className="font-mono text-[9px] capitalize">{mode.quality}</span>
                    </div>
                  </div>

                  {/* 推荐场景 - 5种语言 */}
                  {mode.id === 'default' && (
                    <div className="mt-2 text-[9px] font-mono text-gray-500">
                      💡 {language === 'ZH' ? '推荐: 日常问答、快速查询' :
                         language === 'JA' ? '推奨: 日常的な質問、クイック検索' :
                         language === 'FR' ? 'Idéal pour: Q&R quotidiennes, requêtes rapides' :
                         language === 'ES' ? 'Ideal para: P&R diarias, consultas rápidas' :
                         'Best for: daily Q&A, quick queries'}
                    </div>
                  )}
                  {mode.id === 'multi' && (
                    <div className="mt-2 text-[9px] font-mono text-gray-500">
                      💡 {language === 'ZH' ? '推荐: 需要多视角、重要决策' :
                         language === 'JA' ? '推奨: 多角的視点、重要な決定' :
                         language === 'FR' ? 'Idéal pour: perspectives multiples, décisions importantes' :
                         language === 'ES' ? 'Ideal para: perspectivas múltiples, decisiones importantes' :
                         'Best for: multiple perspectives, important decisions'}
                    </div>
                  )}
                  {mode.id === 'ensemble' && (
                    <div className="mt-2 text-[9px] font-mono text-gray-500">
                      💡 {language === 'ZH' ? '推荐: 复杂问题、深度分析' :
                         language === 'JA' ? '推奨: 複雑な問題、深い分析' :
                         language === 'FR' ? 'Idéal pour: questions complexes, analyse approfondie' :
                         language === 'ES' ? 'Ideal para: preguntas complejas, análisis profundo' :
                         'Best for: complex questions, deep analysis'}
                    </div>
                  )}
                  {mode.id === 'batch' && (
                    <div className="mt-2 text-[9px] font-mono text-gray-500">
                      💡 {language === 'ZH' ? '推荐: FAQ生成、批量咨询' :
                         language === 'JA' ? '推奨: FAQ生成、一括相談' :
                         language === 'FR' ? 'Idéal pour: génération FAQ, requêtes en masse' :
                         language === 'ES' ? 'Ideal para: generación FAQ, consultas masivas' :
                         'Best for: FAQ generation, bulk queries'}
                    </div>
                  )}
                </button>
              );
            })}

            {/* 说明文字 - 5种语言 */}
            <div className="p-2 bg-gray-50 border-t-2 border-black">
              <div className="font-mono text-[9px] text-gray-600">
                💡 {language === 'ZH' ? '提示: 选择合适的模式可以平衡质量、速度和成本' :
                    language === 'JA' ? 'ヒント: 適切なモードを選択して品質、速度、コストのバランスを取ります' :
                    language === 'FR' ? 'Astuce: Choisissez le bon mode pour équilibrer qualité, vitesse et coût' :
                    language === 'ES' ? 'Consejo: Elija el modo adecuado para equilibrar calidad, velocidad y costo' :
                    'Tip: Choose the right mode to balance quality, speed, and cost'}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
