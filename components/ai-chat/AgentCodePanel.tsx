import React, { useState } from 'react';
import { Rocket, X } from 'lucide-react';
import { StanseAgentSchema, ExecutionResult } from '../../types';
import { CodeView } from './CodeView';
import { PreviewView } from './PreviewView';

interface Props {
  stanseAgent: StanseAgentSchema | null;
  sandboxResult: ExecutionResult | null;
  activeTab: 'code' | 'preview';
  onTabChange: (tab: 'code' | 'preview') => void;
  onDeploy: () => void;
  language: string;
}

export const AgentCodePanel: React.FC<Props> = ({
  stanseAgent,
  sandboxResult,
  activeTab,
  onTabChange,
  onDeploy,
  language
}) => {
  const [showDeployDialog, setShowDeployDialog] = useState(false);

  if (!stanseAgent) return null;

  const hasPreview = sandboxResult && 'url' in sandboxResult && sandboxResult.url;

  const handleDeployClick = (duration: string) => {
    setShowDeployDialog(false);
    // For now, just open the URL directly
    // In the future, this could call E2B publish API with duration
    onDeploy();
  };

  return (
    <div className="h-full flex flex-col bg-white border-l-4 border-black">
      {/* Header with Tabs and Deploy Button */}
      <div className="flex items-center justify-between p-2 border-b-2 border-black bg-gray-50">
        {/* Tabs */}
        <div className="flex gap-1">
          <button
            onClick={() => onTabChange('code')}
            className={`px-3 py-1 font-pixel text-xs border-2 border-black transition-colors ${
              activeTab === 'code'
                ? 'bg-black text-white'
                : 'bg-white text-black hover:bg-gray-100'
            }`}
          >
            {language === 'ZH' ? '代码' :
             language === 'JA' ? 'コード' :
             language === 'FR' ? 'Code' :
             language === 'ES' ? 'Código' :
             'Code'}
          </button>
          <button
            onClick={() => onTabChange('preview')}
            disabled={!hasPreview}
            className={`px-3 py-1 font-pixel text-xs border-2 border-black transition-colors ${
              activeTab === 'preview'
                ? 'bg-black text-white'
                : 'bg-white text-black hover:bg-gray-100'
            } ${!hasPreview ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {language === 'ZH' ? '预览' :
             language === 'JA' ? 'プレビュー' :
             language === 'FR' ? 'Aperçu' :
             language === 'ES' ? 'Vista previa' :
             'Preview'}
          </button>
        </div>

        {/* Deploy to E2B Button - matching black/white/gray theme */}
        {hasPreview && (
          <div className="relative">
            <button
              onClick={() => setShowDeployDialog(!showDeployDialog)}
              className="flex items-center gap-1 px-3 py-1 bg-black text-white font-mono text-xs border-2 border-black hover:bg-gray-800 transition-colors"
            >
              <Rocket size={14} />
              <span>
                {language === 'ZH' ? '部署到 E2B' :
                 language === 'JA' ? 'E2Bにデプロイ' :
                 language === 'FR' ? 'Déployer sur E2B' :
                 language === 'ES' ? 'Implementar en E2B' :
                 'Deploy to E2B'}
              </span>
            </button>

            {/* Deploy Time Selection Dialog */}
            {showDeployDialog && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-black text-white border-2 border-white shadow-pixel z-50">
                {/* Header */}
                <div className="flex items-center justify-between p-2 border-b-2 border-white">
                  <span className="font-pixel text-xs">
                    {language === 'ZH' ? '选择时长' :
                     language === 'JA' ? '期間選択' :
                     language === 'FR' ? 'Durée' :
                     language === 'ES' ? 'Duración' :
                     'Select Time'}
                  </span>
                  <button
                    onClick={() => setShowDeployDialog(false)}
                    className="hover:bg-white hover:text-black p-1 transition-colors"
                  >
                    <X size={12} />
                  </button>
                </div>

                {/* Time Options */}
                <div className="p-2 space-y-1">
                  <button
                    onClick={() => handleDeployClick('15m')}
                    className="w-full text-left px-2 py-1 font-mono text-xs hover:bg-white hover:text-black transition-colors border border-white"
                  >
                    {language === 'ZH' ? '15分钟' :
                     language === 'JA' ? '15分' :
                     language === 'FR' ? '15 min' :
                     language === 'ES' ? '15 min' :
                     '15 minutes'}
                  </button>
                  <button
                    onClick={() => handleDeployClick('30m')}
                    className="w-full text-left px-2 py-1 font-mono text-xs hover:bg-white hover:text-black transition-colors border border-white"
                  >
                    {language === 'ZH' ? '30分钟' :
                     language === 'JA' ? '30分' :
                     language === 'FR' ? '30 min' :
                     language === 'ES' ? '30 min' :
                     '30 minutes'}
                  </button>
                  <button
                    onClick={() => handleDeployClick('1h')}
                    className="w-full text-left px-2 py-1 font-mono text-xs hover:bg-white hover:text-black transition-colors border border-white"
                  >
                    {language === 'ZH' ? '1小时' :
                     language === 'JA' ? '1時間' :
                     language === 'FR' ? '1 heure' :
                     language === 'ES' ? '1 hora' :
                     '1 hour'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Content Area - ensure full height */}
      <div className="flex-1 overflow-auto h-full">
        {activeTab === 'code' && <CodeView stanseAgent={stanseAgent} language={language} />}
        {activeTab === 'preview' && <PreviewView result={sandboxResult} language={language} />}
      </div>
    </div>
  );
};
