/**
 * AgentModeChat - Complete port of stanse-agent/app/page.tsx
 * Handles AI code generation with E2B sandbox execution
 * Only rendered when chatMode === 'agent'
 */

import React, { useState, useEffect } from 'react';
import { experimental_useObject as useObject } from 'ai/react';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { StanseAgentSchema, ExecutionResult, LLMModelConfig } from '../../types';
import { stanseAgentSchema } from '../../lib/stanseagent/schema';
import templates from '../../lib/stanseagent/templates';
import { toAISDKMessages, toMessageImage } from '../../lib/stanseagent/messages';
import { AgentModeControls } from './AgentModeControls';
import { AgentCodePanel } from './AgentCodePanel';
import { Send } from 'lucide-react';

interface Props {
  onClose: () => void;
}

export const AgentModeChat: React.FC<Props> = ({ onClose }) => {
  const { user } = useAuth();
  const { language } = useLanguage();

  // Agent Mode state
  const [input, setInput] = useState('');
  const [agentTemplate, setAgentTemplate] = useState<string>('auto');
  const [agentModel, setAgentModel] = useState<LLMModelConfig>({ model: 'claude-sonnet-4-5-20250929' });
  const [agentFiles, setAgentFiles] = useState<File[]>([]);
  const [generatedCode, setGeneratedCode] = useState<StanseAgentSchema | null>(null);
  const [sandboxResult, setSandboxResult] = useState<ExecutionResult | null>(null);
  const [codeTab, setCodeTab] = useState<'code' | 'preview'>('code');
  const [splitRatio, setSplitRatio] = useState(50);
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Message management helpers (like page.tsx addMessage/setMessage)
  const addMessage = (msg: { role: 'user' | 'assistant'; content: string }) => {
    setMessages(prev => [...prev, msg]);
    return messages.concat(msg);
  };

  const updateLastMessage = (updates: Partial<{ role: 'user' | 'assistant'; content: string }>) => {
    setMessages(prev => {
      const updated = [...prev];
      if (updated.length > 0) {
        updated[updated.length - 1] = { ...updated[updated.length - 1], ...updates };
      }
      return updated;
    });
  };

  const STANSEAGENT_API_URL = process.env.NEXT_PUBLIC_STANSEAGENT_API_URL || 'https://stanseagent-837715360412.us-central1.run.app';

  // Build template object
  const currentTemplate = agentTemplate === 'auto'
    ? templates
    : { [agentTemplate]: (templates as any)[agentTemplate] };

  const currentModel = {
    id: agentModel.model || 'claude-sonnet-4-5-20250929',
    providerId: 'anthropic',
    provider: 'Anthropic',
    name: agentModel.model || 'Claude Sonnet 4.5'
  };

  // Base app keywords detection (from page.tsx lines 182-186)
  const BASE_APP_KEYWORDS = ['base app', 'base template', 'firebase base', '一样的app', '基础模板', '同样的'];

  function isBaseAppRequest(text: string): boolean {
    return BASE_APP_KEYWORDS.some(keyword => text.toLowerCase().includes(keyword.toLowerCase()));
  }

  // Analytics placeholder (posthog equivalent)
  const trackEvent = (eventName: string, properties?: any) => {
    console.log(`[Analytics] ${eventName}`, properties);
    // In production, this could send to your analytics service
  };

  // useObject hook for streaming code generation (from page.tsx lines 88-136)
  const { object, submit, isLoading, stop, error } = useObject({
    api: `${STANSEAGENT_API_URL}/api/chat`,
    schema: stanseAgentSchema,
    onError: (error) => {
      console.error('[Agent Mode] Error:', error);
      setErrorMessage((error as any)?.message || String(error));
    },
    onFinish: async ({ object: generatedAgent }) => {
      console.log('[Agent Mode] onFinish:', generatedAgent);
      if (!generatedAgent) return;

      // Track code generation (like posthog in page.tsx line 112)
      trackEvent('stanseAgent_generated', {
        template: (generatedAgent as any)?.template,
      });

      // Deploy to E2B sandbox (from page.tsx lines 116-134)
      try {
        const response = await fetch(`${STANSEAGENT_API_URL}/api/sandbox`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            stanseAgent: generatedAgent,
            userID: user?.uid
          })
        });

        const result = await response.json();
        console.log('[Agent Mode] Sandbox result:', result);

        // Track sandbox creation (like posthog in page.tsx line 128)
        trackEvent('sandbox_created', {
          url: (result as any).url
        });

        setSandboxResult(result);
        setCodeTab('preview');
      } catch (err) {
        console.error('[Agent Mode] Sandbox deployment failed:', err);
        setErrorMessage(String(err));
      }
    },
  });

  // Watch for object updates (from page.tsx lines 138-162)
  useEffect(() => {
    if (object) {
      setGeneratedCode(object as StanseAgentSchema);
      // Add assistant message
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `**${(object as any).title}**\n\n${(object as any).commentary}`
      }]);
    }
  }, [object]);

  // Handle submit (from page.tsx lines 188-279)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !user) return;

    // Check for base app request (lines 199-252)
    if (isBaseAppRequest(input)) {
      try {
        setMessages(prev => [...prev, { role: 'user', content: input }]);

        const response = await fetch(`${STANSEAGENT_API_URL}/api/base-app`);
        const baseApp = await response.json();
        setGeneratedCode(baseApp);
        setMessages(prev => [...prev, { role: 'assistant', content: `**${baseApp.title}**\n\n${baseApp.commentary}` }]);

        // Track base app generation
        trackEvent('stanseAgent_generated', { template: baseApp.template });

        // Deploy base app
        const sandboxResponse = await fetch(`${STANSEAGENT_API_URL}/api/sandbox`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stanseAgent: baseApp, userID: user.uid })
        });
        const result = await sandboxResponse.json();

        // Track sandbox creation
        trackEvent('sandbox_created', { url: result.url });

        setSandboxResult(result);
        setCodeTab('preview');

        setInput('');
        return;
      } catch (err) {
        console.error('[Agent Mode] Base app failed:', err);
        setErrorMessage(language === 'ZH' ? 'Base app 加载失败' :
                       language === 'JA' ? 'Base appの読み込みに失敗しました' :
                       language === 'FR' ? 'Échec du chargement de base app' :
                       language === 'ES' ? 'Error al cargar base app' :
                       'Failed to load base app');
      }
    }

    // Convert files using toMessageImage (from messages.ts)
    const images = await toMessageImage(agentFiles);

    // Build message content (like page.tsx lines 254-261)
    const content: any[] = [{ type: 'text', text: input }];
    if (images.length > 0) {
      images.forEach((image) => {
        content.push({ type: 'image', image });
      });
    }

    // Add user message to chat history
    const userMsg = { role: 'user' as const, content: input };
    const updatedMessages = addMessage(userMsg);

    // Convert to AI SDK format using toAISDKMessages
    const aiMessages = [{ role: 'user' as const, content }];

    setInput('');
    setAgentFiles([]);

    // Submit using AI SDK (like page.tsx lines 268-276)
    submit({
      userID: user.uid,
      messages: aiMessages,
      template: currentTemplate,
      model: currentModel,
      config: agentModel
    });
  };

  return (
    <div className="flex h-full">
      {/* Chat Panel */}
      <div style={{ width: generatedCode ? `${splitRatio}%` : '100%' }} className="flex flex-col h-full">
        {/* Controls */}
        <div className="p-4 border-b-2 border-black">
          <AgentModeControls
            selectedTemplate={agentTemplate}
            onTemplateChange={setAgentTemplate}
            selectedModel={agentModel}
            onModelChange={setAgentModel}
            files={agentFiles}
            onFileChange={setAgentFiles}
            language={language}
          />
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
          {messages.map((msg, idx) => (
            <div key={idx} className={`p-3 border-2 border-black ${msg.role === 'user' ? 'bg-gray-100 ml-auto max-w-[80%]' : 'bg-white mr-auto max-w-[80%]'}`}>
              <div className="font-mono text-sm whitespace-pre-wrap">{msg.content}</div>
            </div>
          ))}
          {isLoading && (
            <div className="text-center text-gray-500 font-mono text-sm">
              {language === 'ZH' ? '生成中...' :
               language === 'JA' ? '生成中...' :
               language === 'FR' ? 'Génération...' :
               language === 'ES' ? 'Generando...' :
               'Generating...'}
            </div>
          )}
          {error && (
            <div className="p-3 border-2 border-red-500 bg-red-50">
              <div className="font-mono text-sm text-red-700">{(error as any)?.message || String(error)}</div>
            </div>
          )}
          {errorMessage && (
            <div className="p-3 border-2 border-red-500 bg-red-50">
              <div className="font-mono text-sm text-red-700">{errorMessage}</div>
            </div>
          )}
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit} className="p-4 border-t-4 border-black bg-white">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={language === 'ZH' ? '描述你想要的应用...' :
                          language === 'JA' ? 'アプリを説明...' :
                          language === 'FR' ? 'Décrivez votre app...' :
                          language === 'ES' ? 'Describe tu app...' :
                          'Describe your app...'}
              className="flex-1 border-2 border-black p-3 font-mono text-sm focus:outline-none focus:border-blue-500"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="bg-black text-white p-3 hover:bg-gray-800 disabled:opacity-50 border-2 border-black"
            >
              <Send size={20} />
            </button>
          </div>
        </form>
      </div>

      {/* Split Divider */}
      {generatedCode && (
        <div
          className="w-1 bg-gray-300 hover:bg-blue-500 cursor-col-resize border-l-2 border-r-2 border-black"
          onMouseDown={(e) => {
            e.preventDefault();
            const startX = e.clientX;
            const startRatio = splitRatio;
            const handleMove = (moveEvent: MouseEvent) => {
              const container = (e.target as HTMLElement).closest('.flex');
              if (!container) return;
              const rect = container.getBoundingClientRect();
              const deltaX = moveEvent.clientX - startX;
              const deltaPercent = (deltaX / rect.width) * 100;
              const newRatio = Math.max(40, Math.min(60, startRatio + deltaPercent));
              setSplitRatio(newRatio);
            };
            const handleUp = () => {
              document.removeEventListener('mousemove', handleMove);
              document.removeEventListener('mouseup', handleUp);
            };
            document.addEventListener('mousemove', handleMove);
            document.addEventListener('mouseup', handleUp);
          }}
        />
      )}

      {/* Code Panel */}
      {generatedCode && (
        <div style={{ width: `${100 - splitRatio}%` }}>
          <AgentCodePanel
            stanseAgent={generatedCode}
            sandboxResult={sandboxResult}
            activeTab={codeTab}
            onTabChange={setCodeTab}
            onDeploy={() => {
              if (sandboxResult && 'url' in sandboxResult && sandboxResult.url) {
                window.open(sandboxResult.url, '_blank');
              }
            }}
            language={language}
          />
        </div>
      )}
    </div>
  );
};
