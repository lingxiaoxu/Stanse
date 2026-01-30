import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { StanseAgentSchema } from '../../types';

interface Props {
  stanseAgent: StanseAgentSchema;
  language: string;
}

export const CodeView: React.FC<Props> = ({ stanseAgent, language }) => {
  const [copied, setCopied] = useState(false);

  // Safety check: code must exist and be a string (matching original stanse-agent)
  if (!stanseAgent.code || typeof stanseAgent.code !== 'string') {
    return (
      <div className="p-4 bg-yellow-50 border-2 border-yellow-500">
        <div className="font-mono text-xs text-yellow-700">
          {language === 'ZH' ? '等待代码生成...' :
           language === 'JA' ? 'コード生成待ち...' :
           language === 'FR' ? 'En attente de génération...' :
           language === 'ES' ? 'Esperando generación...' :
           'Waiting for code generation...'}
        </div>
      </div>
    );
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(stanseAgent.code as string);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="h-full flex flex-col p-4 bg-gray-50">
      {/* Title and Description */}
      <div className="mb-4 flex-shrink-0">
        <h3 className="font-pixel text-sm mb-1">{stanseAgent.title}</h3>
        <p className="font-mono text-[10px] text-gray-600">{stanseAgent.description}</p>
        {stanseAgent.commentary && (
          <p className="font-mono text-[10px] text-gray-500 mt-2 italic">
            {stanseAgent.commentary}
          </p>
        )}
      </div>

      {/* Code Display - takes remaining height */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-300 flex-shrink-0">
          <span className="font-mono text-xs text-gray-600">
            {stanseAgent.file_path || (language === 'ZH' ? '代码' :
                                      language === 'JA' ? 'コード' :
                                      language === 'FR' ? 'code' :
                                      language === 'ES' ? 'código' :
                                      'code')}
          </span>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2 py-1 border-2 border-black bg-white hover:bg-gray-100 transition-colors"
          >
            {copied ? <Check size={12} className="text-green-600" /> : <Copy size={12} />}
            <span className="font-mono text-[10px]">
              {copied ? (language === 'ZH' ? '已复制' :
                        language === 'JA' ? 'コピー済み' :
                        language === 'FR' ? 'Copié' :
                        language === 'ES' ? 'Copiado' :
                        'Copied') :
                       (language === 'ZH' ? '复制' :
                        language === 'JA' ? 'コピー' :
                        language === 'FR' ? 'Copier' :
                        language === 'ES' ? 'Copiar' :
                        'Copy')}
            </span>
          </button>
        </div>
        <pre className="flex-1 bg-white border-2 border-black p-3 overflow-auto font-mono text-xs md:min-h-0">
          <code>{stanseAgent.code}</code>
        </pre>
      </div>

      {/* Dependencies Info */}
      {stanseAgent.has_additional_dependencies && stanseAgent.additional_dependencies && stanseAgent.additional_dependencies.length > 0 && (
        <div className="mt-4 p-2 bg-yellow-50 border-2 border-yellow-500">
          <div className="font-mono text-[10px] font-bold mb-1">
            {language === 'ZH' ? '依赖项:' :
             language === 'JA' ? '依存関係:' :
             language === 'FR' ? 'Dépendances:' :
             language === 'ES' ? 'Dependencias:' :
             'Dependencies:'}
          </div>
          <div className="font-mono text-[9px] text-gray-700">
            {stanseAgent.additional_dependencies.join(', ')}
          </div>
        </div>
      )}
    </div>
  );
};
