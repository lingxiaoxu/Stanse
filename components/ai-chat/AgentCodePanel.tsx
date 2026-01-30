import React from 'react';
import { Rocket } from 'lucide-react';
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
  if (!stanseAgent) return null;

  const hasPreview = sandboxResult && 'url' in sandboxResult && sandboxResult.url;

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
          <button
            onClick={onDeploy}
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
        )}
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'code' && <CodeView stanseAgent={stanseAgent} language={language} />}
        {activeTab === 'preview' && <PreviewView result={sandboxResult} language={language} />}
      </div>
    </div>
  );
};
