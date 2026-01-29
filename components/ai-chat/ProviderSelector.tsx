import React, { useState } from 'react';
import { ChevronDown, Check, Settings } from 'lucide-react';
import { LLMProvider } from '../../types';
import { llmService } from '../../services/llm/llmService';
import { useLanguage } from '../../contexts/LanguageContext';

interface Props {
  active: LLMProvider;
  onChange: (provider: LLMProvider) => void;
}

const providerInfo: Record<LLMProvider, { label: string; requiresKey: boolean }> = {
  [LLMProvider.GEMINI]: { label: 'Gemini', requiresKey: false },
  [LLMProvider.CHATGPT]: { label: 'ChatGPT', requiresKey: true },
  [LLMProvider.CLAUDE]: { label: 'Claude', requiresKey: true },
  [LLMProvider.LOCAL]: { label: 'Local Model', requiresKey: true },
  [LLMProvider.EMBER]: { label: 'Stanse AI', requiresKey: false }
};

export const ProviderSelector: React.FC<Props> = ({ active, onChange }) => {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<LLMProvider | null>(null);
  const [apiKey, setApiKey] = useState('');

  const handleProviderSelect = (provider: LLMProvider) => {
    if (provider === LLMProvider.GEMINI) {
      // Gemini is always ready
      onChange(provider);
      setIsOpen(false);
    } else if (llmService.isProviderConfigured(provider)) {
      // Already configured
      onChange(provider);
      setIsOpen(false);
    } else {
      // Needs configuration
      setSelectedProvider(provider);
      setShowKeyInput(true);
      setApiKey('');
    }
  };

  const handleSaveApiKey = () => {
    if (!selectedProvider || !apiKey.trim()) return;

    try {
      llmService.setProvider(selectedProvider, apiKey);
      onChange(selectedProvider);
      setShowKeyInput(false);
      setIsOpen(false);
      setSelectedProvider(null);
      setApiKey('');
    } catch (error) {
      console.error('Failed to configure provider:', error);
    }
  };

  const handleCancel = () => {
    setShowKeyInput(false);
    setSelectedProvider(null);
    setApiKey('');
  };

  if (showKeyInput && selectedProvider) {
    return (
      <div className="bg-white border-2 border-black p-3 mt-2">
        <h4 className="font-pixel text-sm mb-2">
          {t('aiChat', 'configureProvider')}: {providerInfo[selectedProvider].label}
        </h4>
        <p className="font-mono text-[10px] text-gray-600 mb-2">
          {selectedProvider === LLMProvider.LOCAL
            ? 'Enter your API endpoint URL (e.g., http://localhost:11434/api/chat)'
            : t('aiChat', 'apiKeyLabel')}
        </p>
        <input
          type="text"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={selectedProvider === LLMProvider.LOCAL ? 'http://localhost:11434/api/chat' : t('aiChat', 'apiKeyPlaceholder')}
          className="w-full border-2 border-black p-2 font-mono text-xs mb-2 focus:outline-none focus:border-blue-500"
        />
        <p className="font-mono text-[9px] text-orange-600 mb-2">
          ⚠️ Your key is stored locally only, never saved to the server
        </p>
        <div className="flex gap-2">
          <button
            onClick={handleSaveApiKey}
            disabled={!apiKey.trim()}
            className="flex-1 bg-black text-white p-2 font-pixel text-xs hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed border-2 border-black"
          >
            {t('aiChat', 'save') || 'SAVE'}
          </button>
          <button
            onClick={handleCancel}
            className="flex-1 bg-white text-black p-2 font-pixel text-xs hover:bg-gray-100 border-2 border-black"
          >
            {t('aiChat', 'cancel') || 'CANCEL'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative mt-1">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 font-mono text-[10px] text-gray-600 hover:text-black"
      >
        <span>{providerInfo[active].label}</span>
        <ChevronDown size={12} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 bg-white border-2 border-black shadow-pixel z-10 min-w-[200px]">
          {Object.entries(providerInfo).map(([key, info]) => {
            const provider = key as LLMProvider;
            const isConfigured = llmService.isProviderConfigured(provider);
            const isActive = provider === active;

            return (
              <button
                key={key}
                onClick={() => handleProviderSelect(provider)}
                className={`w-full px-3 py-2 font-mono text-xs text-left hover:bg-gray-100 border-b border-gray-200 last:border-b-0 flex items-center justify-between ${isActive ? 'bg-gray-50' : ''}`}
              >
                <div className="flex items-center gap-2">
                  {isActive && <Check size={12} />}
                  <span>{info.label}</span>
                  {info.requiresKey && !isConfigured && (
                    <Settings size={10} className="text-gray-400" />
                  )}
                </div>
                {info.label === 'Gemini' && (
                  <span className="text-[9px] text-blue-600">{t('aiChat', 'default') || 'Default'}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
