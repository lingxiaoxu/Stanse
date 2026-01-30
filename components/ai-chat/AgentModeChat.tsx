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
import { ChatModeSelector, ChatMode } from './ChatModeSelector';
import { CostTracker } from './CostTracker';
import { ChatBubble } from './ChatBubble';
import { Send, X, Trash2, Square, Terminal, Loader } from 'lucide-react';
import { isRateLimitError, isOverloadedError, isAccessDeniedError } from '../../lib/stanseagent/api-errors';
import {
  saveChatMessage,
  loadChatHistory,
  clearOldestMessage,
  clearAllChatHistory
} from '../../services/chatHistoryService';
import { ChatMessage, LLMProvider, MessageContentPart } from '../../types';
import { useLanguage as useLanguageContext } from '../../contexts/LanguageContext';
import { translatePersonaLabel } from '../../services/agents/stanceAgent';

interface Props {
  onClose: () => void;
  chatMode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
  sidebarWidth: number;
  onSidebarWidthChange: (width: number) => void;
  isInitialOpen?: boolean;
  initialCode?: any;  // Restored agent code when switching from other modes
  initialResult?: any;  // Restored execution result when switching from other modes
}

export const AgentModeChat: React.FC<Props> = ({
  onClose,
  chatMode,
  onModeChange,
  sidebarWidth: initialWidth,
  onSidebarWidthChange,
  isInitialOpen = true,
  initialCode,
  initialResult
}) => {
  const { user, userProfile } = useAuth();
  const { t, language } = useLanguage();

  // Agent Mode state
  const [input, setInput] = useState('');
  const [agentTemplate, setAgentTemplate] = useState<string>('auto');
  const [agentModel, setAgentModel] = useState<LLMModelConfig>({ model: 'claude-sonnet-4-5-20250929' });
  const [agentFiles, setAgentFiles] = useState<File[]>([]);
  const [generatedCode, setGeneratedCode] = useState<StanseAgentSchema | null>(null);
  const [sandboxResult, setSandboxResult] = useState<ExecutionResult | null>(null);
  const [codeTab, setCodeTab] = useState<'code' | 'preview'>('code');
  const [splitRatio, setSplitRatio] = useState(50);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [useMorphApply, setUseMorphApply] = useState(true);

  // Store last request for retry functionality
  const [lastRequest, setLastRequest] = useState<{ input: string; files: File[] } | null>(null);

  // Ref for auto-scroll (matching chat.tsx)
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  // Cost tracking state (matching EmberAIChatSidebar)
  const [costInfo, setCostInfo] = useState<any>({
    currentCost: 0,
    todayCost: 0,
    monthCost: 0,
    tokens: { prompt: 0, completion: 0, total: 0 },
    modelUsed: '',
    estimatedBudget: 1.0
  });
  const [todayTotalCost, setTodayTotalCost] = useState(0);
  const [monthTotalCost, setMonthTotalCost] = useState(0);

  // Translated user label (synced with EmberAIChatSidebar and Stance tab translation)
  const [translatedUserLabel, setTranslatedUserLabel] = useState<string | undefined>(undefined);

  // Load cost statistics from Ember API cost_service.py
  const loadCostStats = async () => {
    if (!user) return;

    try {
      // Load today's cost using Ember cost_service.py
      const todayResponse = await fetch(`${EMBER_API_URL}/cost/stats?user_id=${user.uid}&period=today`);
      const todayData = await todayResponse.json();

      // Load month's cost using Ember cost_service.py
      const monthResponse = await fetch(`${EMBER_API_URL}/cost/stats?user_id=${user.uid}&period=month`);
      const monthData = await monthResponse.json();

      if (todayData.success && monthData.success) {
        const todayCost = todayData.data?.summary?.total_cost || 0;
        const monthCost = monthData.data?.summary?.total_cost || 0;

        setCostInfo(prev => ({
          ...prev,
          todayCost: todayCost,
          monthCost: monthCost
        }));

        console.log('[Agent Mode] Loaded cost from Ember cost_service.py:', { todayCost, monthCost });
      }
    } catch (err) {
      console.error('[Agent Mode] Failed to load cost from Ember API:', err);
    }
  };

  // Load history only once when component mounts, not when switching modes
  // This prevents losing messages when switching between modes
  React.useEffect(() => {
    if (user) {
      loadChatHistory(user.uid).then(setMessages);
      loadCostStats();  // Load cost stats from Ember API
    }
  }, [user]); // Don't include chatMode - only load once per user session

  // Restore code and result when switching to agent mode from other modes
  React.useEffect(() => {
    if (initialCode) {
      setGeneratedCode(initialCode);
      console.log('[Agent Mode] Restored code from other mode:', initialCode.title);
    }
    if (initialResult) {
      setSandboxResult(initialResult);
      console.log('[Agent Mode] Restored result from other mode');
    }
  }, [initialCode, initialResult]);

  // Translate user label when language changes (sync with EmberAIChatSidebar and Stance tab)
  React.useEffect(() => {
    const translateLabel = async () => {
      if (!userProfile?.coordinates?.label) {
        setTranslatedUserLabel(undefined);
        return;
      }

      const originalLabel = userProfile.coordinates.label;

      // Check localStorage cache first - MUST match FingerprintView's cache key format!
      // FingerprintView uses: `stanse_persona_${label}_${language.toLowerCase()}`
      const cacheKey = `stanse_persona_${originalLabel}_${language.toLowerCase()}`;
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          console.log(`[Agent Mode] Using cached translated label for ${language}:`, cached);
          setTranslatedUserLabel(cached);
          return;
        }
      } catch (e) {
        console.warn('[Agent Mode] Failed to read label cache');
      }

      // If English, use original
      if (language === 'EN' || language === 'en') {
        setTranslatedUserLabel(originalLabel);
        return;
      }

      // Translate using the same service as Stance tab
      try {
        const translated = await translatePersonaLabel(userProfile.coordinates, language);
        setTranslatedUserLabel(translated);
        // Cache the result with the SAME key format as FingerprintView
        try {
          localStorage.setItem(cacheKey, translated);
        } catch (e) {
          console.warn('[Agent Mode] Failed to cache translated label');
        }
      } catch (error) {
        console.error('[Agent Mode] Failed to translate label:', error);
        setTranslatedUserLabel(originalLabel); // Fallback to original
      }
    };

    translateLabel();
  }, [language, userProfile?.coordinates?.label]);

  // Clear history handler (matching EmberAIChatSidebar)
  const handleClearHistory = async () => {
    if (!user) return;
    if (!window.confirm(t('aiChat', 'confirmClear') || 'Clear all chat history?')) return;

    try {
      await clearAllChatHistory(user.uid);
      setMessages([]);
    } catch (err) {
      console.error('Failed to clear history:', err);
      setErrorMessage('Failed to clear history');
    }
  };

  // Message management helpers (like page.tsx addMessage/setMessage)
  const addMessage = (msg: ChatMessage) => {
    setMessages(prev => [...prev, msg]);
    return messages.concat(msg);
  };

  const updateLastMessage = (updates: Partial<ChatMessage>) => {
    setMessages(prev => {
      const updated = [...prev];
      if (updated.length > 0) {
        updated[updated.length - 1] = { ...updated[updated.length - 1], ...updates };
      }
      return updated;
    });
  };

  const STANSEAGENT_API_URL = process.env.NEXT_PUBLIC_STANSEAGENT_API_URL || 'https://stanseagent-837715360412.us-central1.run.app';
  const EMBER_API_URL = process.env.NEXT_PUBLIC_EMBER_API_URL || 'https://us-central1-gen-lang-client-0960644135.cloudfunctions.net/ember_api';

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

  // Determine which API to use based on morph toggle and existing code (from page.tsx lines 84-86)
  const shouldUseMorph = useMorphApply && generatedCode && generatedCode.code && generatedCode.file_path;
  const apiEndpoint = shouldUseMorph ? '/api/morph-chat' : '/api/chat';

  // Debug: Log morph mode changes only when it actually changes
  React.useEffect(() => {
    console.log('[Agent Mode] Morph mode:', { shouldUseMorph, useMorphApply, hasCode: !!generatedCode?.code, apiEndpoint });
  }, [shouldUseMorph, apiEndpoint]);

  // useObject hook for streaming code generation (from page.tsx lines 88-136)
  const { object, submit, isLoading, stop, error } = useObject({
    api: `${STANSEAGENT_API_URL}${apiEndpoint}`,
    schema: stanseAgentSchema,
    onError: (error) => {
      console.error('[Agent Mode] Error:', error);

      // Use api-errors.ts logic for better error categorization
      if (isRateLimitError(error)) {
        setErrorMessage(language === 'ZH' ? '已达到请求限制。请稍后再试或使用您自己的 API 密钥。' :
                       language === 'JA' ? 'リクエスト制限に達しました。後でもう一度お試しいただくか、独自のAPIキーを使用してください。' :
                       language === 'FR' ? 'Limite de requêtes atteinte. Veuillez réessayer plus tard ou utiliser votre propre clé API.' :
                       language === 'ES' ? 'Límite de solicitudes alcanzado. Inténtelo más tarde o use su propia clave API.' :
                       'Rate limit reached. Please try again later or use your own API key.');
      } else if (isOverloadedError(error)) {
        setErrorMessage(language === 'ZH' ? '服务当前不可用。请稍后再试。' :
                       language === 'JA' ? 'サービスは現在利用できません。後でもう一度お試しください。' :
                       language === 'FR' ? 'Service actuellement indisponible. Veuillez réessayer plus tard.' :
                       language === 'ES' ? 'Servicio actualmente no disponible. Inténtelo más tarde.' :
                       'Service currently unavailable. Please try again later.');
      } else if (isAccessDeniedError(error)) {
        setErrorMessage(language === 'ZH' ? '访问被拒绝。请检查您的 API 密钥。' :
                       language === 'JA' ? 'アクセスが拒否されました。APIキーを確認してください。' :
                       language === 'FR' ? 'Accès refusé. Veuillez vérifier votre clé API.' :
                       language === 'ES' ? 'Acceso denegado. Verifique su clave API.' :
                       'Access denied. Please check your API key.');
      } else {
        setErrorMessage((error as any)?.message || String(error));
      }
    },
    onFinish: async ({ object: generatedAgent }) => {
      console.log('[Agent Mode] onFinish:', generatedAgent);
      if (!generatedAgent) return;

      // 使用 Ember API cost_service.py 统一计算和记录 cost
      try {
        // 估算 tokens（前端只负责估算 tokens）
        const estimateTokens = (text: string) => Math.ceil(text.length / 4);
        const codeText = typeof generatedAgent.code === 'string' ? generatedAgent.code : JSON.stringify(generatedAgent.code);
        const inputTokens = estimateTokens(input);
        const outputTokens = estimateTokens(codeText + (generatedAgent.commentary || ''));

        // 调用 Ember API /cost/record 端点
        // 让 cost_service.py 的 calculate_cost_from_tokens() 计算 cost（统一定价逻辑）
        const costResponse = await fetch(`${EMBER_API_URL}/cost/record`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: user.uid,
            model: agentModel.model || 'claude-sonnet-4-5-20250929',
            mode: 'agent',
            tokens: {
              prompt: inputTokens,
              completion: outputTokens,
              total: inputTokens + outputTokens
            },
            execution_time: 0
          })
        });

        const costData = await costResponse.json();

        if (costData.success) {
          // 更新显示（使用 cost_service.py 计算的 cost）
          setCostInfo(prev => ({
            ...prev,
            currentCost: costData.cost,
            tokens: costData.tokens,
            modelUsed: agentModel.model || 'claude-sonnet-4-5-20250929'
          }));

          // 重新加载统计（从 Firebase ember_cost_sessions 获取总和）
          setTimeout(() => {
            loadCostStats();
          }, 1000);

          console.log('[Agent Mode] Cost recorded via cost_service.py:', costData);
        }
      } catch (costErr) {
        console.error('[Agent Mode] Failed to record cost:', costErr);
      }

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

        // Save to Firebase chat history with agent metadata
        if (user && lastRequest) {
          try {
            const title = (generatedAgent as any)?.title || 'Code Generated';
            const commentary = (generatedAgent as any)?.commentary || 'Code has been generated successfully';
            const historyCount = await saveChatMessage(
              user.uid,
              lastRequest.input,
              `**${title}**\n\n${commentary}`,
              LLMProvider.EMBER,
              generatedAgent, // Save agent code object
              result // Save agent execution result
            );

            // Clear oldest if exceeds limit
            if (historyCount > 5) {
              await clearOldestMessage(user.uid);
            }
          } catch (saveError) {
            console.error('[Agent Mode] Failed to save chat history:', saveError);
          }
        }
      } catch (err) {
        console.error('[Agent Mode] Sandbox deployment failed:', err);
        setErrorMessage(String(err));
      }
    },
  });

  // Watch for object updates (from page.tsx lines 138-162)
  // IMPORTANT: Only add message if last message is NOT already from assistant (avoid duplicates during streaming)
  useEffect(() => {
    if (object) {
      setGeneratedCode(object as StanseAgentSchema);

      // Safely add assistant message with type checking
      const title = (object as any)?.title || 'Code Generated';
      const commentary = (object as any)?.commentary || 'Code has been generated successfully';

      const lastMessage = messages[messages.length - 1];

      // Only add new message if last message is not from assistant (matching page.tsx logic)
      if (!lastMessage || lastMessage.role !== 'assistant') {
        const assistantMessage: ChatMessage = {
          id: `${Date.now()}-assistant`,
          role: 'assistant',
          content: `**${title}**\n\n${commentary}`,
          timestamp: new Date().toISOString(),
          provider: LLMProvider.EMBER,
          object: object, // Add object for preview card
          result: sandboxResult // Add result if available
        };

        setMessages(prev => [...prev, assistantMessage]);
      } else {
        // Update existing assistant message (during streaming updates)
        setMessages(prev => {
          const updated = [...prev];
          if (updated.length > 0) {
            updated[updated.length - 1] = {
              ...updated[updated.length - 1],
              content: `**${title}**\n\n${commentary}`,
              object: object,
              result: sandboxResult
            };
          }
          return updated;
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [object]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading, error, errorMessage]);

  // Retry handler
  const handleRetry = () => {
    if (!lastRequest) return;

    setInput(lastRequest.input);
    setAgentFiles(lastRequest.files);
    setErrorMessage('');

    // Trigger submit with saved request
    setTimeout(() => {
      const form = document.querySelector('form');
      if (form) {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      }
    }, 100);
  };

  // Handle submit (from page.tsx lines 188-279)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !user) return;

    // Save request for retry
    setLastRequest({ input, files: agentFiles });

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

    // Add user message to chat history (with proper ChatMessage structure)
    // If there are images, use complex content format, otherwise use simple string
    const userMessage: ChatMessage = {
      id: `${Date.now()}-user`,
      role: 'user',
      content: images.length > 0 ? content as MessageContentPart[] : input,
      timestamp: new Date().toISOString(),
      provider: LLMProvider.EMBER
    };
    setMessages(prev => [...prev, userMessage]);

    // Convert to AI SDK format using toAISDKMessages
    const aiMessages = [{ role: 'user' as const, content }];

    setInput('');
    setAgentFiles([]);

    // Submit using AI SDK (like page.tsx lines 268-276)
    // In morph mode, pass currentStanseAgent to enable incremental code editing
    submit({
      userID: user.uid,
      messages: aiMessages,
      template: currentTemplate,
      model: currentModel,
      config: agentModel,
      ...(shouldUseMorph && generatedCode ? { currentStanseAgent: generatedCode } : {})
    });
  };

  // UI state (matching EmberAIChatSidebar) - use shared width
  const [isResizing, setIsResizing] = React.useState(false);
  const [resizeStartX, setResizeStartX] = React.useState(0);
  const [resizeStartWidth, setResizeStartWidth] = React.useState(0);

  // Resizable handlers (matching EmberAIChatSidebar)
  const handleResizeStart = (e: React.MouseEvent) => {
    setIsResizing(true);
    setResizeStartX(e.clientX);
    setResizeStartWidth(initialWidth);
    e.preventDefault();
  };

  const handleResizeMove = (e: MouseEvent) => {
    if (!isResizing) return;
    const deltaX = resizeStartX - e.clientX;
    const newWidth = resizeStartWidth + deltaX;
    const maxWidth = Math.floor(window.innerWidth * 11 / 12);
    const minWidth = 400;
    const clampedWidth = Math.min(Math.max(newWidth, minWidth), maxWidth);
    onSidebarWidthChange(clampedWidth);
  };

  const handleResizeEnd = () => {
    setIsResizing(false);
  };

  // Listen for resize events
  React.useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', handleResizeMove);
      window.addEventListener('mouseup', handleResizeEnd);
      return () => {
        window.removeEventListener('mousemove', handleResizeMove);
        window.removeEventListener('mouseup', handleResizeEnd);
      };
    }
  }, [isResizing, resizeStartX, resizeStartWidth, onSidebarWidthChange]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-[45]"
        onClick={onClose}
      />

      {/* Agent Mode Sidebar - matching EmberAIChatSidebar structure */}
      <div
        className={`fixed right-0 top-0 h-full bg-white border-l-4 border-black shadow-pixel z-50 flex flex-col ${isInitialOpen ? 'animate-slide-in' : ''}`}
        style={{
          width: `${initialWidth}px`,
          cursor: isResizing ? 'ew-resize' : 'default'
        }}
      >
        {/* Left resize handle (matching EmberAIChatSidebar) */}
        <div
          className="absolute left-0 top-0 bottom-0 w-1 hover:w-2 bg-transparent hover:bg-blue-500 cursor-ew-resize transition-all hidden md:block"
          onMouseDown={handleResizeStart}
          style={{ zIndex: 100 }}
        >
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-12 bg-gray-400 rounded-full opacity-50 hover:opacity-100" />
        </div>

        {/* Header (matching EmberAIChatSidebar) */}
        <div className="p-4 border-b-4 border-black bg-white">
          <div className="flex items-start justify-between mb-2">
            <div className="flex-1">
              <h2 className="font-pixel text-2xl">{t('aiChat', 'title')}</h2>
              <div className="text-[10px] font-mono text-gray-500 mt-1">
                Powered by Stanse AI
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleClearHistory}
                className="p-2 hover:bg-gray-100 border-2 border-transparent hover:border-black transition-colors"
                title={t('aiChat', 'clearHistory') || 'Clear history'}
              >
                <Trash2 size={20} />
              </button>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 border-2 border-transparent hover:border-black transition-colors"
              >
                <X size={24} />
              </button>
            </div>
          </div>

          {/* Mode Selector (matching EmberAIChatSidebar) */}
          <ChatModeSelector
            activeMode={chatMode}
            onChange={onModeChange}
            language={language}
          />

          {/* Agent Mode Controls (only shown in agent mode) */}
          <div className="mt-2">
            <AgentModeControls
              selectedTemplate={agentTemplate}
              onTemplateChange={setAgentTemplate}
              selectedModel={agentModel}
              onModelChange={setAgentModel}
              files={agentFiles}
              onFileChange={setAgentFiles}
              language={language}
              useMorphApply={useMorphApply}
              onUseMorphApplyChange={setUseMorphApply}
            />
          </div>
        </div>

        {/* Content area with split view */}
        <div className="flex h-full w-full overflow-hidden">
          {/* Chat Panel */}
          <div style={{ width: generatedCode ? `${splitRatio}%` : '100%' }} className="flex flex-col h-full">

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
          {messages.map((msg, idx) => (
            <div key={msg.id || idx}>
              {/* Use ChatBubble for message display with avatars and timestamps */}
              <ChatBubble message={msg} />

              {/* Object Preview Card (for code generation) - shown below ChatBubble */}
              {msg.object && (
                <div
                  onClick={() => {
                    setGeneratedCode(msg.object);
                    if (msg.result) setSandboxResult(msg.result);
                    setCodeTab('code');
                  }}
                  className="mt-2 p-2 w-full flex items-center border-2 border-black hover:bg-gray-50 cursor-pointer bg-white"
                >
                  <div className="w-10 h-10 bg-black/5 flex items-center justify-center border-2 border-black">
                    <Terminal strokeWidth={2} className="text-orange-500" size={20} />
                  </div>
                  <div className="pl-2 pr-4 flex flex-col">
                    <span className="font-mono font-bold text-sm">
                      {msg.object.title || 'Generated Code'}
                    </span>
                    <span className="font-mono text-xs text-gray-500">
                      {language === 'ZH' ? '点击查看预览' :
                       language === 'JA' ? 'クリックしてプレビュー' :
                       language === 'FR' ? 'Cliquez pour voir' :
                       language === 'ES' ? 'Haz clic para ver' :
                       'Click to see preview'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          ))}
          {isLoading && (
            <div className="flex items-center gap-2 text-gray-500 font-mono text-sm">
              <Loader size={16} className="animate-spin" />
              <span>
                {language === 'ZH' ? '思考中...' :
                 language === 'JA' ? '考え中...' :
                 language === 'FR' ? 'Réflexion...' :
                 language === 'ES' ? 'Pensando...' :
                 'Thinking...'}
              </span>
            </div>
          )}
          {error && (
            <div className="p-3 border-2 border-red-500 bg-red-50">
              <div className="flex items-center justify-between">
                <div className="font-mono text-sm text-red-700 flex-1">{(error as any)?.message || String(error)}</div>
                <button
                  onClick={handleRetry}
                  className="ml-2 px-3 py-1 bg-red-500 text-white font-mono text-xs border-2 border-black hover:bg-red-600 transition-colors"
                >
                  {language === 'ZH' ? '重试' :
                   language === 'JA' ? '再試行' :
                   language === 'FR' ? 'Réessayer' :
                   language === 'ES' ? 'Reintentar' :
                   'Retry'}
                </button>
              </div>
            </div>
          )}
          {errorMessage && (
            <div className="p-3 border-2 border-red-500 bg-red-50">
              <div className="flex items-center justify-between">
                <div className="font-mono text-sm text-red-700 flex-1">{errorMessage}</div>
                <button
                  onClick={handleRetry}
                  className="ml-2 px-3 py-1 bg-red-500 text-white font-mono text-xs border-2 border-black hover:bg-red-600 transition-colors"
                >
                  {language === 'ZH' ? '重试' :
                   language === 'JA' ? '再試行' :
                   language === 'FR' ? 'Réessayer' :
                   language === 'ES' ? 'Reintentar' :
                   'Retry'}
                </button>
              </div>
            </div>
          )}

          {/* Auto-scroll anchor */}
          <div ref={messagesEndRef} />
        </div>

            {/* CostTracker (matching EmberAIChatSidebar) */}
            <CostTracker
              costInfo={costInfo}
              language={language}
              userLabel={translatedUserLabel || userProfile?.coordinates?.label}
            />

            {/* Input */}
            <form onSubmit={handleSubmit} className="p-4 border-t-4 border-black bg-white">
              <div className="flex gap-2 items-end">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      if (input.trim()) {
                        handleSubmit(e as any);
                      }
                    }
                  }}
                  placeholder={language === 'ZH' ? '描述你想要的应用...' :
                              language === 'JA' ? 'アプリを説明...' :
                              language === 'FR' ? 'Décrivez votre app...' :
                              language === 'ES' ? 'Describe tu app...' :
                              'Describe your app...'}
                  className="flex-1 border-2 border-black p-3 font-mono text-sm focus:outline-none focus:border-blue-500 resize-none min-h-[48px] max-h-[120px]"
                  disabled={isLoading}
                  rows={1}
                  style={{
                    height: 'auto',
                    overflowY: input.split('\n').length > 3 ? 'auto' : 'hidden'
                  }}
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement;
                    target.style.height = 'auto';
                    target.style.height = Math.min(target.scrollHeight, 120) + 'px';
                  }}
                />
                {isLoading ? (
                  <button
                    type="button"
                    onClick={stop}
                    className="bg-red-600 text-white p-3 hover:bg-red-700 border-2 border-black transition-colors flex-shrink-0"
                    title={language === 'ZH' ? '停止生成' :
                           language === 'JA' ? '生成を停止' :
                           language === 'FR' ? 'Arrêter' :
                           language === 'ES' ? 'Detener' :
                           'Stop'}
                  >
                    <Square size={20} />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!input.trim()}
                    className="bg-black text-white p-3 hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed border-2 border-black transition-colors flex-shrink-0"
                  >
                    <Send size={20} />
                  </button>
                )}
              </div>
              <p className="font-mono text-[9px] text-gray-400 mt-1">
                {language === 'ZH' ? '按 Enter 发送，Shift+Enter 换行' :
                 language === 'JA' ? 'Enterで送信、Shift+Enterで改行' :
                 language === 'FR' ? 'Entrée pour envoyer, Maj+Entrée pour nouvelle ligne' :
                 language === 'ES' ? 'Enter para enviar, Shift+Enter para nueva línea' :
                 'Press Enter to send, Shift+Enter for new line'}
              </p>
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
                onDeploy={async (duration: string) => {
                  if (sandboxResult && 'url' in sandboxResult && sandboxResult.url) {
                    try {
                      // Call stanse-agent publish API to extend sandbox timeout
                      const publishResponse = await fetch(`${STANSEAGENT_API_URL}/api/publish`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          url: sandboxResult.url,
                          sbxId: sandboxResult.sbxId,
                          duration: duration  // '15m', '30m', or '1h'
                        })
                      });

                      const publishResult = await publishResponse.json();

                      if (publishResult.url) {
                        // Open the published URL (could be a Vercel KV short link or original URL)
                        window.open(publishResult.url, '_blank');
                        console.log(`[Agent Mode] Published sandbox with ${duration} duration:`, publishResult.url);
                      } else {
                        // Fallback to original URL
                        window.open(sandboxResult.url, '_blank');
                      }
                    } catch (err) {
                      console.error('[Agent Mode] Failed to publish with duration:', err);
                      // Fallback: just open the URL
                      window.open(sandboxResult.url, '_blank');
                    }
                  }
                }}
                language={language}
              />
            </div>
          )}
        </div>
      </div>
    </>
  );
};
