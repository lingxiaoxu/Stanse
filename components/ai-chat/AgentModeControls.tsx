import React, { useRef, useState } from 'react';
import { Paperclip, X, Settings, ChevronDown, ChevronUp } from 'lucide-react';
import { LLMModelConfig } from '../../types';
import { isFileInArray } from '../../lib/stanseagent/utils';

interface Props {
  selectedTemplate: string;
  onTemplateChange: (template: string) => void;
  selectedModel: LLMModelConfig;
  onModelChange: (model: LLMModelConfig) => void;
  files: File[];
  onFileChange: (files: File[]) => void;
  language: string;
  useMorphApply: boolean;
  onUseMorphApplyChange: (value: boolean) => void;
}

const TEMPLATES = [
  { id: 'auto', name: 'Auto', nameZH: '自动', nameJA: '自動', nameFR: 'Auto', nameES: 'Auto' },
  { id: 'code-interpreter-v1', name: 'Python Analyst', nameZH: 'Python分析师', nameJA: 'Pythonアナリスト', nameFR: 'Analyste Python', nameES: 'Analista Python' },
  { id: 'streamlit-developer', name: 'Streamlit', nameZH: 'Streamlit', nameJA: 'Streamlit', nameFR: 'Streamlit', nameES: 'Streamlit' },
  { id: 'gradio-developer', name: 'Gradio', nameZH: 'Gradio', nameJA: 'Gradio', nameFR: 'Gradio', nameES: 'Gradio' },
  { id: 'nextjs-developer', name: 'Next.js', nameZH: 'Next.js', nameJA: 'Next.js', nameFR: 'Next.js', nameES: 'Next.js' },
  { id: 'vue-developer', name: 'Vue.js', nameZH: 'Vue.js', nameJA: 'Vue.js', nameFR: 'Vue.js', nameES: 'Vue.js' }
];

const MODELS = [
  // Claude 4.5 series
  { id: 'claude-opus-4-5-20251101', name: 'Claude Opus 4.5', provider: 'Anthropic' },
  { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5', provider: 'Anthropic' },
  { id: 'claude-haiku-4-5-20251030', name: 'Claude Haiku 4.5', provider: 'Anthropic' },
  // Claude 4.0 series
  { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', provider: 'Anthropic' },
  // Gemini 3.0 series
  { id: 'gemini-3.0-pro', name: 'Gemini 3.0 Pro', provider: 'Google' },
  { id: 'gemini-3.0-flash', name: 'Gemini 3.0 Flash', provider: 'Google' },
  // Gemini 2.5 series (minimum version - no 2.0 or lower)
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'Google' },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'Google' },
  // GPT 5.0 series - ONLY GPT-5 models (removed GPT-4.x, o3, and local)
  { id: 'gpt-5', name: 'GPT-5', provider: 'OpenAI' },
  { id: 'gpt-5-mini', name: 'GPT-5 Mini', provider: 'OpenAI' },
  { id: 'gpt-5-nano', name: 'GPT-5 Nano', provider: 'OpenAI' },
  // Local model (Ollama, etc.)
  { id: 'local', name: 'Local Model', provider: 'Local' }
];

export const AgentModeControls: React.FC<Props> = ({
  selectedTemplate,
  onTemplateChange,
  selectedModel,
  onModelChange,
  files,
  onFileChange,
  language,
  useMorphApply,
  onUseMorphApplyChange
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files) as File[];
      const uniqueFiles = newFiles.filter((file: File) => !isFileInArray(file, files));
      onFileChange([...files, ...uniqueFiles]);
    }
  };

  const handleRemoveFile = (index: number) => {
    onFileChange(files.filter((_, i) => i !== index));
  };

  // Drag and drop handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const droppedFiles = Array.from(e.dataTransfer.files).filter((file: File) =>
      file.type.startsWith('image/')
    );

    if (droppedFiles.length > 0) {
      const uniqueFiles = droppedFiles.filter((file: File) => !isFileInArray(file, files));
      onFileChange([...files, ...uniqueFiles]);
    }
  };

  // Paste handler
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);

    for (const item of items) {
      if ((item as DataTransferItem).type.indexOf('image') !== -1) {
        e.preventDefault();

        const file = (item as DataTransferItem).getAsFile();
        if (file && !isFileInArray(file, files)) {
          onFileChange([...files, file]);
        }
      }
    }
  };

  const getTemplateName = (template: typeof TEMPLATES[0]) => {
    switch (language) {
      case 'ZH': return template.nameZH;
      case 'JA': return template.nameJA;
      case 'FR': return template.nameFR;
      case 'ES': return template.nameES;
      default: return template.name;
    }
  };

  return (
    <div className="mb-2 space-y-2">
      {/* Controls Row - Unified height for all 3 controls */}
      <div className="flex items-stretch gap-2">
        {/* Template Selector - 30% width with custom arrow */}
        <div className="relative" style={{ width: '30%' }}>
          <select
            value={selectedTemplate}
            onChange={(e) => onTemplateChange(e.target.value)}
            className="w-full border-2 border-black bg-white font-mono text-xs pl-3 pr-8 py-2 hover:bg-gray-50 focus:outline-none focus:border-blue-500 appearance-none cursor-pointer"
          >
            {TEMPLATES.map((template) => (
              <option key={template.id} value={template.id}>
                {getTemplateName(template)}
              </option>
            ))}
          </select>
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-sm">
            ▼
          </div>
        </div>

        {/* Model Selector - 30% width with custom arrow */}
        <div className="relative" style={{ width: '30%' }}>
          <select
            value={selectedModel.model || 'claude-sonnet-4-5-20250929'}
            onChange={(e) => onModelChange({ ...selectedModel, model: e.target.value })}
            className="w-full border-2 border-black bg-white font-mono text-xs pl-3 pr-8 py-2 hover:bg-gray-50 focus:outline-none focus:border-blue-500 appearance-none cursor-pointer"
          >
            {MODELS.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name}
              </option>
            ))}
          </select>
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-sm">
            ▼
          </div>
        </div>

        {/* File Upload Button - 40% width (25% wider than others) with drag-and-drop */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onPaste={handlePaste}
          className={`flex items-center justify-center gap-1 border-2 bg-white hover:bg-gray-100 transition-colors font-mono text-xs relative ${
            dragActive ? 'border-dashed border-blue-500' : 'border-black'
          }`}
          style={{ width: '40%' }}
          title={language === 'ZH' ? '上传文件（拖放或粘贴）' :
                 language === 'JA' ? 'ファイルをアップロード（ドラッグ＆ドロップまたは貼り付け）' :
                 language === 'FR' ? 'Télécharger fichier (glisser-déposer ou coller)' :
                 language === 'ES' ? 'Subir archivo (arrastrar y soltar o pegar)' :
                 'Upload file (drag & drop or paste)'}
        >
          <Paperclip size={14} />
          <span>
            {language === 'ZH' ? '文件' :
             language === 'JA' ? 'ファイル' :
             language === 'FR' ? 'Fichier' :
             language === 'ES' ? 'Archivo' :
             'File'}
          </span>
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {/* File Preview Chips with Thumbnails */}
      {files.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {files.map((file, index) => (
            <div
              key={index}
              className="flex items-center gap-1 px-2 py-1 bg-gray-100 border-2 border-black font-mono text-[10px] relative"
            >
              <img
                src={URL.createObjectURL(file)}
                alt={file.name}
                className="w-5 h-5 object-cover border border-black"
              />
              <span className="truncate max-w-[100px]">{file.name}</span>
              <button
                onClick={() => handleRemoveFile(index)}
                className="hover:bg-gray-200 p-0.5"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Advanced Settings Toggle */}
      <div className="mt-2">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-1 text-[10px] font-mono text-gray-600 hover:text-black"
        >
          <Settings size={12} />
          <span>
            {language === 'ZH' ? '高级设置' :
             language === 'JA' ? '詳細設定' :
             language === 'FR' ? 'Paramètres avancés' :
             language === 'ES' ? 'Configuración avanzada' :
             'Advanced Settings'}
          </span>
          {showAdvanced ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>

        {/* Advanced Settings Panel */}
        {showAdvanced && (
          <div className="mt-2 p-3 border-2 border-black bg-gray-50 space-y-3">
            {/* Morph Apply Toggle - matching Settings toggle style */}
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px]">
                {language === 'ZH' ? 'Morph 编辑模式' :
                 language === 'JA' ? 'Morph編集モード' :
                 language === 'FR' ? 'Mode Morph Apply' :
                 language === 'ES' ? 'Modo Morph Apply' :
                 'Use Morph Apply'}
              </span>
              <button
                onClick={() => onUseMorphApplyChange(!useMorphApply)}
                className={`w-12 h-7 border-2 border-black relative transition-colors ${
                  useMorphApply ? 'bg-black' : 'bg-white'
                }`}
              >
                <div className={`absolute top-0.5 bottom-0.5 w-4 bg-current border border-black transition-all ${
                  useMorphApply ? 'left-6 bg-white' : 'left-0.5 bg-black'
                }`} />
              </button>
            </div>

            {/* Model Name / API Key Input (label changes based on Local Model selection) */}
            <div>
              <label className="block font-mono text-[10px] mb-1 text-gray-700">
                {selectedModel.model === 'local' ? (
                  language === 'ZH' ? '模型名称（必填）' :
                  language === 'JA' ? 'モデル名（必須）' :
                  language === 'FR' ? 'Nom du modèle (requis)' :
                  language === 'ES' ? 'Nombre del modelo (requerido)' :
                  'Model Name (required)'
                ) : (
                  language === 'ZH' ? 'API密钥（可选）' :
                  language === 'JA' ? 'APIキー（オプション）' :
                  language === 'FR' ? 'Clé API (optionnel)' :
                  language === 'ES' ? 'Clave API (opcional)' :
                  'API Key (optional)'
                )}
              </label>
              <input
                type={selectedModel.model === 'local' ? 'text' : 'password'}
                value={selectedModel.apiKey || ''}
                onChange={(e) => onModelChange({ ...selectedModel, apiKey: e.target.value })}
                placeholder={selectedModel.model === 'local' ? 'deepseek-r1:latest' : (
                  language === 'ZH' ? '自动' : language === 'JA' ? '自動' : language === 'FR' ? 'Auto' : language === 'ES' ? 'Auto' : 'Auto'
                )}
                className="w-full border-2 border-black px-2 py-1 font-mono text-[10px] focus:outline-none focus:border-blue-500"
              />
              {selectedModel.model === 'local' && (
                <div className="mt-1 font-mono text-[8px] text-gray-500">
                  {language === 'ZH' ? '💡 例如: deepseek-r1:latest, llama3:70b' :
                   language === 'JA' ? '💡 例: deepseek-r1:latest, llama3:70b' :
                   language === 'FR' ? '💡 Ex: deepseek-r1:latest, llama3:70b' :
                   language === 'ES' ? '💡 Ej: deepseek-r1:latest, llama3:70b' :
                   '💡 e.g., deepseek-r1:latest, llama3:70b'}
                </div>
              )}
            </div>

            {/* Base URL Input (required for Local Model) */}
            <div>
              <label className="block font-mono text-[10px] mb-1 text-gray-700">
                {selectedModel.model === 'local' ? (
                  language === 'ZH' ? 'Base URL（必填）' :
                  language === 'JA' ? 'Base URL（必須）' :
                  language === 'FR' ? 'Base URL (requis)' :
                  language === 'ES' ? 'Base URL (requerido)' :
                  'Base URL (required)'
                ) : (
                  language === 'ZH' ? 'Base URL（可选）' :
                  language === 'JA' ? 'Base URL（オプション）' :
                  language === 'FR' ? 'Base URL (optionnel)' :
                  language === 'ES' ? 'Base URL (opcional)' :
                  'Base URL (optional)'
                )}
              </label>
              <input
                type="text"
                value={selectedModel.baseURL || ''}
                onChange={(e) => onModelChange({ ...selectedModel, baseURL: e.target.value })}
                placeholder={selectedModel.model === 'local' ? 'http://localhost:11434' : (
                  language === 'ZH' ? '自动' : language === 'JA' ? '自動' : language === 'FR' ? 'Auto' : language === 'ES' ? 'Auto' : 'Auto'
                )}
                className="w-full border-2 border-black px-2 py-1 font-mono text-[10px] focus:outline-none focus:border-blue-500"
              />
              {selectedModel.model === 'local' && (
                <div className="mt-1 font-mono text-[8px] text-gray-500">
                  {language === 'ZH' ? '💡 Ollama默认: http://localhost:11434' :
                   language === 'JA' ? '💡 Ollamaデフォルト: http://localhost:11434' :
                   language === 'FR' ? '💡 Ollama par défaut: http://localhost:11434' :
                   language === 'ES' ? '💡 Ollama por defecto: http://localhost:11434' :
                   '💡 Ollama default: http://localhost:11434'}
                </div>
              )}
            </div>

            {/* Parameters */}
            <div className="grid grid-cols-2 gap-2">
              {/* Max Tokens */}
              <div>
                <label className="block font-mono text-[9px] mb-1 text-gray-700">
                  {language === 'ZH' ? '输出长度' :
                   language === 'JA' ? '出力トークン' :
                   language === 'FR' ? 'Tokens sortie' :
                   language === 'ES' ? 'Tokens salida' :
                   'Output tokens'}
                </label>
                <input
                  type="number"
                  value={selectedModel.maxTokens || ''}
                  onChange={(e) => onModelChange({ ...selectedModel, maxTokens: Number(e.target.value) })}
                  placeholder={language === 'ZH' ? '自动' : language === 'JA' ? '自動' : language === 'FR' ? 'Auto' : language === 'ES' ? 'Auto' : 'Auto'}
                  className="w-full border-2 border-black px-2 py-1 font-mono text-[9px] focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Temperature */}
              <div>
                <label className="block font-mono text-[9px] mb-1 text-gray-700">Temperature</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="2"
                  value={selectedModel.temperature || ''}
                  onChange={(e) => onModelChange({ ...selectedModel, temperature: Number(e.target.value) })}
                  placeholder={language === 'ZH' ? '自动' : language === 'JA' ? '自動' : language === 'FR' ? 'Auto' : language === 'ES' ? 'Auto' : 'Auto'}
                  className="w-full border-2 border-black px-2 py-1 font-mono text-[9px] focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Top P */}
              <div>
                <label className="block font-mono text-[9px] mb-1 text-gray-700">Top P</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="1"
                  value={selectedModel.topP || ''}
                  onChange={(e) => onModelChange({ ...selectedModel, topP: Number(e.target.value) })}
                  placeholder={language === 'ZH' ? '自动' : language === 'JA' ? '自動' : language === 'FR' ? 'Auto' : language === 'ES' ? 'Auto' : 'Auto'}
                  className="w-full border-2 border-black px-2 py-1 font-mono text-[9px] focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Top K */}
              <div>
                <label className="block font-mono text-[9px] mb-1 text-gray-700">Top K</label>
                <input
                  type="number"
                  min="0"
                  value={selectedModel.topK || ''}
                  onChange={(e) => onModelChange({ ...selectedModel, topK: Number(e.target.value) })}
                  placeholder={language === 'ZH' ? '自动' : language === 'JA' ? '自動' : language === 'FR' ? 'Auto' : language === 'ES' ? 'Auto' : 'Auto'}
                  className="w-full border-2 border-black px-2 py-1 font-mono text-[9px] focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Frequency Penalty */}
              <div>
                <label className="block font-mono text-[9px] mb-1 text-gray-700">
                  {language === 'ZH' ? '频率惩罚' :
                   language === 'JA' ? '頻度ペナルティ' :
                   language === 'FR' ? 'Pénalité fréq.' :
                   language === 'ES' ? 'Penalización frec.' :
                   'Freq. penalty'}
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="-2"
                  max="2"
                  value={selectedModel.frequencyPenalty || ''}
                  onChange={(e) => onModelChange({ ...selectedModel, frequencyPenalty: Number(e.target.value) })}
                  placeholder={language === 'ZH' ? '自动' : language === 'JA' ? '自動' : language === 'FR' ? 'Auto' : language === 'ES' ? 'Auto' : 'Auto'}
                  className="w-full border-2 border-black px-2 py-1 font-mono text-[9px] focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Presence Penalty */}
              <div>
                <label className="block font-mono text-[9px] mb-1 text-gray-700">
                  {language === 'ZH' ? '存在惩罚' :
                   language === 'JA' ? '存在ペナルティ' :
                   language === 'FR' ? 'Pénalité prés.' :
                   language === 'ES' ? 'Penalización pres.' :
                   'Pres. penalty'}
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="-2"
                  max="2"
                  value={selectedModel.presencePenalty || ''}
                  onChange={(e) => onModelChange({ ...selectedModel, presencePenalty: Number(e.target.value) })}
                  placeholder={language === 'ZH' ? '自动' : language === 'JA' ? '自動' : language === 'FR' ? 'Auto' : language === 'ES' ? 'Auto' : 'Auto'}
                  className="w-full border-2 border-black px-2 py-1 font-mono text-[9px] focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
