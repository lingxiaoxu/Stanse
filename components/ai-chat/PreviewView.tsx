import React from 'react';
import { Loader, AlertCircle } from 'lucide-react';
import { ExecutionResult } from '../../types';

interface Props {
  result: ExecutionResult | null;
  language: string;
}

export const PreviewView: React.FC<Props> = ({ result, language }) => {
  if (!result) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <div className="text-center">
          <Loader size={32} className="animate-spin mx-auto mb-2 text-gray-400" />
          <p className="font-mono text-sm text-gray-500">
            {language === 'ZH' ? '正在初始化预览...' :
             language === 'JA' ? 'プレビューを初期化中...' :
             language === 'FR' ? 'Initialisation de l\'aperçu...' :
             language === 'ES' ? 'Inicializando vista previa...' :
             'Initializing preview...'}
          </p>
        </div>
      </div>
    );
  }

  // Check if it's a web result with URL
  if ('url' in result && result.url) {
    return (
      <div className="h-full">
        <iframe
          src={result.url}
          className="w-full h-full border-0"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          title="E2B Sandbox Preview"
        />
      </div>
    );
  }

  // Check if it's an interpreter result with outputs
  if ('stdout' in result || 'stderr' in result) {
    return (
      <div className="p-4 bg-gray-50 h-full overflow-auto">
        <div className="font-pixel text-sm mb-4">
          {language === 'ZH' ? '执行结果' :
           language === 'JA' ? '実行結果' :
           language === 'FR' ? 'Résultat d\'exécution' :
           language === 'ES' ? 'Resultado de ejecución' :
           'Execution Result'}
        </div>

        {/* Stdout */}
        {result.stdout && result.stdout.length > 0 && (
          <div className="mb-4">
            <div className="font-mono text-xs font-bold mb-1 text-green-700">stdout:</div>
            <pre className="bg-white border-2 border-black p-3 font-mono text-[10px] overflow-auto">
              {result.stdout.join('\n')}
            </pre>
          </div>
        )}

        {/* Stderr */}
        {result.stderr && result.stderr.length > 0 && (
          <div className="mb-4">
            <div className="font-mono text-xs font-bold mb-1 text-red-700">stderr:</div>
            <pre className="bg-white border-2 border-red-500 p-3 font-mono text-[10px] overflow-auto">
              {result.stderr.join('\n')}
            </pre>
          </div>
        )}

        {/* Cell Results */}
        {'cellResults' in result && result.cellResults && result.cellResults.length > 0 && (
          <div>
            <div className="font-mono text-xs font-bold mb-1">
              {language === 'ZH' ? '单元格结果:' :
               language === 'JA' ? 'セル結果:' :
               language === 'FR' ? 'Résultats cellules:' :
               language === 'ES' ? 'Resultados de celdas:' :
               'Cell Results:'}
            </div>
            {result.cellResults.map((cellResult: any, index: number) => (
              <div key={index} className="mb-2 bg-white border-2 border-black p-2">
                <pre className="font-mono text-[10px]">
                  {JSON.stringify(cellResult, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Fallback: no preview available
  return (
    <div className="flex items-center justify-center h-full p-4">
      <div className="text-center">
        <AlertCircle size={32} className="mx-auto mb-2 text-gray-400" />
        <p className="font-mono text-sm text-gray-500">
          {language === 'ZH' ? '无可用预览' :
           language === 'JA' ? 'プレビューなし' :
           language === 'FR' ? 'Aucun aperçu disponible' :
           language === 'ES' ? 'Sin vista previa disponible' :
           'No preview available'}
        </p>
      </div>
    </div>
  );
};
