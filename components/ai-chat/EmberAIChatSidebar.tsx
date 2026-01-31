import React, { useState, useEffect, useRef } from 'react';
import { X, Send, Loader, Trash2, ChevronDown, ChevronUp, Check, Square, RotateCcw, Terminal } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { ChatMessage, LLMProvider } from '../../types';
import {
  saveChatMessage,
  loadChatHistory,
  clearOldestMessage,
  clearAllChatHistory
} from '../../services/chatHistoryService';
import { translatePersonaLabel } from '../../services/agents/stanceAgent';
import { ChatBubble } from './ChatBubble';
import { ChatModeSelector, ChatMode } from './ChatModeSelector';
import { CostTracker } from './CostTracker';
import { AgentModeChat } from './AgentModeChat';
import { isRateLimitError, isOverloadedError, isAccessDeniedError } from '../../lib/stanseagent/api-errors';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  prefilledMessage?: string;
}

interface EmberResponse {
  success: boolean;
  data?: {
    answer: string | Array<{
      model: string;
      answer: string;
      cost: number;
    }>;
    candidates?: string[];
    cost: number;
    tokens: {
      prompt?: number;
      completion?: number;
      total: number;
    };
    model_used: string;
    mode: string;
    execution_time: number;
    from_cache?: boolean;
  };
  error?: string;
}

// Collapsible component for Ensemble candidates (view only, no selection)
const EnsembleCandidatesCollapsible: React.FC<{ candidates: string[]; language?: string }> = ({ candidates, language }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const getLabel = () => {
    switch (language) {
      case 'ZH': return isExpanded ? '隐藏候选答案' : '查看候选答案';
      case 'JA': return isExpanded ? '候補回答を隠す' : '候補回答を表示';
      case 'FR': return isExpanded ? 'Masquer les candidats' : 'Voir les candidats';
      case 'ES': return isExpanded ? 'Ocultar candidatos' : 'Ver candidatos';
      default: return isExpanded ? 'Hide Candidates' : 'View Candidates';
    }
  };

  return (
    <div className="mt-2 border-2 border-gray-300 bg-gray-50">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-3 py-2 flex items-center justify-between hover:bg-gray-100 transition-colors"
      >
        <span className="font-mono text-xs text-gray-600">
          {getLabel()} ({candidates.length})
        </span>
        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {isExpanded && (
        <div className="p-3 border-t-2 border-gray-300 space-y-3">
          <div className="font-mono text-[10px] text-gray-500 mb-2">
            {language === 'ZH' ? '💡 以下是 Claude 评估的 5 个候选答案（仅供参考）' :
             language === 'JA' ? '💡 以下はClaudeが評価した5つの候補回答（参考用）' :
             language === 'FR' ? '💡 Voici les 5 candidats évalués par Claude (référence)' :
             language === 'ES' ? '💡 Los 5 candidatos evaluados por Claude (referencia)' :
             '💡 5 candidate answers evaluated by Claude (for reference)'}
          </div>
          {candidates.map((candidate, idx) => (
            <div
              key={idx}
              className="p-2 bg-white border border-gray-300 font-mono text-xs"
            >
              <div className="font-semibold text-gray-700 mb-1">
                {language === 'ZH' ? '候选' :
                 language === 'JA' ? '候補' :
                 language === 'FR' ? 'Candidat' :
                 language === 'ES' ? 'Candidato' :
                 'Candidate'} {idx + 1}
              </div>
              <div className="text-gray-600 whitespace-pre-wrap">{candidate}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const EmberAIChatSidebar: React.FC<Props> = ({ isOpen, onClose, prefilledMessage }) => {
  const { user, userProfile } = useAuth();
  const { t, language } = useLanguage();

  // 聊天状态
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ember 特定状态
  const [chatMode, setChatMode] = useState<ChatMode>('default');

  // Track if this is initial open (for slide-in animation)
  const [isInitialOpen, setIsInitialOpen] = useState(true);

  // Track if closing (for slide-out animation)
  const [isClosing, setIsClosing] = useState(false);

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

  // Track last request for retry functionality
  const [lastRequest, setLastRequest] = useState<{input: string; mode: ChatMode} | null>(null);

  // Add messagesEndRef for auto-scroll
  const messagesEndRefEmber = useRef<HTMLDivElement>(null);

  // AbortController for stopping fetch requests
  const abortControllerRef = useRef<AbortController | null>(null);

  // Track Ensemble mode candidates for collapsible view
  const [ensembleCandidates, setEnsembleCandidates] = useState<{[messageId: string]: string[]}>({});

  // Track Multi mode answers for selection (Expert Panel)
  const [pendingMultiAnswers, setPendingMultiAnswers] = useState<{
    question: string;
    answers: Array<{ model: string; answer: string; messageId: string }>;
  } | null>(null);

  // Translated user label (synced with Stance tab translation)
  const [translatedUserLabel, setTranslatedUserLabel] = useState<string | undefined>(undefined);

  // Swipe to close
  const [swipeStartX, setSwipeStartX] = useState<number | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 可调整宽度（桌面端）
  // 初始宽度：宽屏(>=768px)为50%浏览器宽度，手机屏幕保持400px
  // 但必须在最小宽度(400px)和最大宽度(11/12屏宽)之间
  const getInitialWidth = () => {
    if (typeof window === 'undefined') return 400;
    const isMobile = window.innerWidth < 768;
    if (isMobile) return 400;

    const desiredWidth = Math.floor(window.innerWidth * 0.5);
    const maxWidth = Math.floor(window.innerWidth * 11 / 12);
    const minWidth = 400;
    return Math.min(Math.max(desiredWidth, minWidth), maxWidth);
  };
  const [sidebarWidth, setSidebarWidth] = useState(getInitialWidth());
  const [isResizing, setIsResizing] = useState(false);
  const [resizeStartX, setResizeStartX] = useState(0);
  const [resizeStartWidth, setResizeStartWidth] = useState(0);

  // Ember API URL (需要根据部署配置)
  const EMBER_API_URL = process.env.NEXT_PUBLIC_EMBER_API_URL || 'https://us-central1-gen-lang-client-0960644135.cloudfunctions.net/ember_api';

  // Reset sidebar width to initial value when opening (only on first open)
  useEffect(() => {
    if (isOpen) {
      setSidebarWidth(getInitialWidth());
    }
  }, [isOpen]);

  // Load history on open - DO NOT reload when mode changes to preserve history
  useEffect(() => {
    if (isOpen && user) {
      loadChatHistory(user.uid).then(setMessages);
      // Load cost stats
      loadCostStats();
    }
  }, [isOpen, user]); // Removed chatMode to preserve history across mode switches

  // Auto-scroll to messagesEndRefEmber (matching AgentModeChat pattern)
  useEffect(() => {
    messagesEndRefEmber.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Handle prefilled message (但不自动 focus，避免手机弹出键盘)
  useEffect(() => {
    if (isOpen) {
      // 不自动 focus，让用户手动点击输入框
      // inputRef.current?.focus();  // 移除自动 focus

      if (prefilledMessage && prefilledMessage.trim()) {
        setInput(prefilledMessage);
        // 如果有预填充消息，才自动 focus（文本选择场景）
        inputRef.current?.focus();
      }
    }
  }, [isOpen, prefilledMessage]);

  // Translate user label when language changes (sync with Stance tab)
  useEffect(() => {
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
          console.log(`[EmberAIChat] Using cached translated label for ${language}:`, cached);
          setTranslatedUserLabel(cached);
          return;
        }
      } catch (e) {
        console.warn('[EmberAIChat] Failed to read label cache');
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
          console.warn('[EmberAIChat] Failed to cache translated label');
        }
      } catch (error) {
        console.error('[EmberAIChat] Failed to translate label:', error);
        setTranslatedUserLabel(originalLabel); // Fallback to original
      }
    };

    translateLabel();
  }, [language, userProfile?.coordinates?.label]);

  // Load cost statistics
  const loadCostStats = async () => {
    if (!user) return;

    try {
      // Load today's cost
      const todayResponse = await fetch(
        `${EMBER_API_URL}/cost/stats?user_id=${user.uid}&period=today`
      );
      const todayData = await todayResponse.json();
      if (todayData.success) {
        const todayCost = todayData.data.summary.total_cost || 0;
        setTodayTotalCost(todayCost);

        // 更新 costInfo 的今日成本
        setCostInfo(prev => ({
          ...prev,
          todayCost: todayCost
        }));
      }

      // Load month's cost
      const monthResponse = await fetch(
        `${EMBER_API_URL}/cost/stats?user_id=${user.uid}&period=month`
      );
      const monthData = await monthResponse.json();
      if (monthData.success) {
        const monthCost = monthData.data.summary.total_cost || 0;
        setMonthTotalCost(monthCost);

        // 更新 costInfo 的本月成本
        setCostInfo(prev => ({
          ...prev,
          monthCost: monthCost
        }));
      }
    } catch (err) {
      console.error('Failed to load cost stats:', err);
    }
  };

  // Swipe handlers (手机端关闭)
  const handleTouchStart = (e: React.TouchEvent) => {
    setSwipeStartX(e.touches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (swipeStartX === null) return;
    const currentX = e.touches[0].clientX;
    const diff = currentX - swipeStartX;
    if (diff > 0) {
      setSwipeOffset(diff);
    }
  };

  const handleTouchEnd = () => {
    if (swipeOffset > 100) {
      onClose();
    }
    setSwipeStartX(null);
    setSwipeOffset(0);
  };

  // 宽度调整 handlers (桌面端)
  const handleResizeStart = (e: React.MouseEvent) => {
    setIsResizing(true);
    setResizeStartX(e.clientX);
    setResizeStartWidth(sidebarWidth);
    e.preventDefault();
  };

  const handleResizeMove = (e: MouseEvent) => {
    if (!isResizing) return;

    const deltaX = resizeStartX - e.clientX; // 向左拉是正值
    const newWidth = resizeStartWidth + deltaX;

    // 最小宽度 400px，最大宽度为屏幕宽度的 11/12
    const maxWidth = Math.floor(window.innerWidth * 11 / 12);
    const minWidth = 400;

    const clampedWidth = Math.min(Math.max(newWidth, minWidth), maxWidth);
    setSidebarWidth(clampedWidth);
  };

  const handleResizeEnd = () => {
    setIsResizing(false);
  };

  // 监听鼠标移动和释放（桌面端调整宽度）
  React.useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', handleResizeMove);
      window.addEventListener('mouseup', handleResizeEnd);
      return () => {
        window.removeEventListener('mousemove', handleResizeMove);
        window.removeEventListener('mouseup', handleResizeEnd);
      };
    }
  }, [isResizing, resizeStartX, resizeStartWidth]);

  const handleSend = async () => {
    if (!input.trim() || !user || loading) return;

    const trimmedInput = input.trim();
    const userMessage: ChatMessage = {
      id: `${Date.now()}-user`,
      role: 'user',
      content: trimmedInput,
      timestamp: new Date().toISOString(),
      provider: LLMProvider.EMBER  // Use 'ember' as provider
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);
    setError(null);

    // Save request for retry functionality
    setLastRequest({ input: trimmedInput, mode: chatMode });

    // Create AbortController for this request
    abortControllerRef.current = new AbortController();

    try {
      // Build context from user profile
      const userContext = userProfile ? {
        economic: userProfile.coordinates.economic,
        social: userProfile.coordinates.social,
        diplomatic: userProfile.coordinates.diplomatic,
        label: userProfile.coordinates.label
      } : undefined;

      // Call Ember API with abort signal
      const response = await fetch(`${EMBER_API_URL}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: trimmedInput,
          mode: chatMode,
          user_context: userContext,
          language: language || 'ZH',
          model_preference: 'auto',
          user_id: user.uid,
          use_cache: true
        }),
        signal: abortControllerRef.current.signal
      });

      const result: EmberResponse = await response.json();

      if (!result.success || !result.data) {
        throw new Error(result.error || 'Failed to get response');
      }

      const { data } = result;

      // Process answer based on mode
      let answerContent = '';
      let assistantMessages: ChatMessage[] = [];

      if (chatMode === 'multi' && Array.isArray(data.answer)) {
        // Multi-model mode: show all answers with selection capability
        const multiAnswers: Array<{ model: string; answer: string; messageId: string }> = [];

        data.answer.forEach((resp, idx) => {
          const msgId = `${Date.now()}-assistant-${idx}`;
          multiAnswers.push({
            model: resp.model,
            answer: resp.answer,
            messageId: msgId
          });
          assistantMessages.push({
            id: msgId,
            role: 'assistant',
            content: `**${resp.model}**: ${resp.answer}`,
            timestamp: new Date().toISOString(),
            provider: LLMProvider.EMBER
          });
        });

        // Store for selection UI
        setPendingMultiAnswers({
          question: trimmedInput,
          answers: multiAnswers
        });
      } else if (chatMode === 'ensemble' && data.candidates) {
        // Ensemble mode: show ONLY final answer (Claude already selected best from 5 candidates)
        answerContent = typeof data.answer === 'string' ? data.answer : JSON.stringify(data.answer);

        const ensembleMessageId = `${Date.now()}-assistant-ensemble`;

        // Only show Claude's synthesized final answer
        assistantMessages.push({
          id: ensembleMessageId,
          role: 'assistant',
          content: `**深度分析 (Deep Analysis)**:\n\n${answerContent}\n\n_✨ 此答案由 Claude 从 5 个 AI 候选中评估综合得出_`,
          timestamp: new Date().toISOString(),
          provider: LLMProvider.EMBER
        });

        // Store candidates for collapsible view (not for selection, just for reference)
        setEnsembleCandidates(prev => ({
          ...prev,
          [ensembleMessageId]: data.candidates || []
        }));
      } else {
        // Default/batch mode: single answer
        answerContent = typeof data.answer === 'string' ? data.answer : JSON.stringify(data.answer);
        assistantMessages.push({
          id: `${Date.now()}-assistant`,
          role: 'assistant',
          content: answerContent,
          timestamp: new Date().toISOString(),
          provider: LLMProvider.EMBER
        });
      }

      // Add to messages
      setMessages(prev => [...prev, ...assistantMessages]);

      // Update cost info - 确保正确读取 tokens
      const tokensData: any = data.tokens || {};
      setCostInfo({
        currentCost: data.cost || 0,
        todayCost: todayTotalCost + (data.cost || 0),
        monthCost: monthTotalCost + (data.cost || 0),
        tokens: {
          prompt: (tokensData as any).prompt || 0,
          completion: (tokensData as any).completion || 0,
          total: (tokensData as any).total || 0
        },
        modelUsed: data.model_used || 'unknown',
        estimatedBudget: 1.0
      });

      // Debug: 打印 tokens 数据
      console.log('[EmberAIChatSidebar] Tokens data:', tokensData);

      // Update today's total cost
      setTodayTotalCost(prev => prev + (data.cost || 0));

      // Save chat history - but for Multi mode, wait for user selection
      // Multi mode saves only the selected answer via handleSelectMultiAnswer
      if (chatMode !== 'multi') {
        try {
          const historyCount = await saveChatMessage(
            user.uid,
            trimmedInput,
            answerContent,
            LLMProvider.EMBER
          );

          if (historyCount > 5) {
            await clearOldestMessage(user.uid);
          }
        } catch (saveError) {
          console.error('Failed to save chat history:', saveError);
        }
      }
      // For Multi mode: user must select an answer, which triggers handleSelectMultiAnswer to save

      // Reload cost stats after saving
      setTimeout(() => {
        loadCostStats();
      }, 1000);

    } catch (err: any) {
      console.error('Chat error:', err);

      // Check if request was aborted
      if (err.name === 'AbortError') {
        setError(language === 'ZH' ? '请求已取消' :
                language === 'JA' ? 'リクエストがキャンセルされました' :
                language === 'FR' ? 'Requête annulée' :
                language === 'ES' ? 'Solicitud cancelada' :
                'Request cancelled');
      } else if (isRateLimitError(err)) {
        setError(language === 'ZH' ? '已达到请求限制。请稍后再试或使用您自己的 API 密钥。' :
                language === 'JA' ? 'リクエスト制限に達しました。後でもう一度お試しいただくか、独自のAPIキーを使用してください。' :
                language === 'FR' ? 'Limite de requêtes atteinte. Veuillez réessayer plus tard ou utiliser votre propre clé API.' :
                language === 'ES' ? 'Límite de solicitudes alcanzado. Inténtelo más tarde o use su propia clave API.' :
                'Rate limit reached. Please try again later or use your own API key.');
      } else if (isOverloadedError(err)) {
        setError(language === 'ZH' ? '服务当前不可用。请稍后再试。' :
                language === 'JA' ? 'サービスは現在利用できません。後でもう一度お試しください。' :
                language === 'FR' ? 'Service actuellement indisponible. Veuillez réessayer plus tard.' :
                language === 'ES' ? 'Servicio actualmente no disponible. Inténtelo más tarde.' :
                'Service currently unavailable. Please try again later.');
      } else if (isAccessDeniedError(err)) {
        setError(language === 'ZH' ? '访问被拒绝。请检查您的 API 密钥。' :
                language === 'JA' ? 'アクセスが拒否されました。APIキーを確認してください。' :
                language === 'FR' ? 'Accès refusé. Veuillez vérifier votre clé API.' :
                language === 'ES' ? 'Acceso denegado. Verifique su clave API.' :
                'Access denied. Please check your API key.');
      } else {
        setError(err.message || t('aiChat', 'errorMessage'));
      }
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleClearHistory = async () => {
    if (!user) return;
    if (!window.confirm(t('aiChat', 'confirmClear') || 'Clear all chat history?')) return;

    try {
      await clearAllChatHistory(user.uid);
      setMessages([]);
    } catch (err) {
      console.error('Failed to clear history:', err);
      setError('Failed to clear history');
    }
  };

  // Handle close with slide-out animation
  const handleClose = () => {
    setIsClosing(true);  // Trigger slide-out animation
    setTimeout(() => {
      setIsClosing(false);  // Reset closing state
      setIsInitialOpen(true);  // Reset for slide-in animation on next open
      onClose();  // Actually close after animation completes
    }, 300);  // Match animation duration (300ms)
  };

  // Handle mode change without animation
  const handleModeChange = (mode: ChatMode) => {
    setIsInitialOpen(false);  // No animation when switching modes
    setChatMode(mode);
  };

  // Stop handler - abort current request
  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setLoading(false);
    }
  };

  // Retry handler - resend last request
  const handleRetry = () => {
    if (!lastRequest) return;

    setInput(lastRequest.input);
    setError(null);

    // Trigger send after state update
    setTimeout(() => {
      handleSend();
    }, 100);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !(e.nativeEvent as any).isComposing) {
      e.preventDefault();
      if (input.trim() && !loading) {
        handleSend();
      }
    }
  };

  // Handle Multi mode answer selection (Expert Panel)
  const handleSelectMultiAnswer = async (selectedMessageId: string, model: string, answer: string) => {
    if (!user || !pendingMultiAnswers) return;

    // Save only the selected answer to Firebase
    try {
      const historyCount = await saveChatMessage(
        user.uid,
        pendingMultiAnswers.question,
        `**${model}** (Selected): ${answer}`,
        LLMProvider.EMBER
      );

      if (historyCount > 5) {
        await clearOldestMessage(user.uid);
      }

      // Mark the selected answer visually - update messages
      setMessages(prev => prev.map(msg => {
        if (pendingMultiAnswers.answers.some(a => a.messageId === msg.id)) {
          const isSelected = msg.id === selectedMessageId;
          if (isSelected) {
            // Add checkmark to selected answer
            return {
              ...msg,
              content: `✅ **${model}** (Selected): ${answer}`
            };
          } else {
            // Dim non-selected answers
            return {
              ...msg,
              content: msg.content.replace(/^\*\*/, '~~**').replace(/\*\*:/, '**:~~')
            };
          }
        }
        return msg;
      }));

      // Clear pending state
      setPendingMultiAnswers(null);

    } catch (saveError) {
      console.error('Failed to save selected answer:', saveError);
    }
  };

  if (!isOpen) return null;

  // Agent Mode: Render with full UI inheritance (share sidebar width, no re-animation)
  if (chatMode === 'agent') {
    // Find last agent message with code to restore
    const lastAgentMessage = [...messages].reverse().find(m => m.object);

    return (
      <AgentModeChat
        onClose={handleClose}
        chatMode={chatMode}
        onModeChange={handleModeChange}
        sidebarWidth={sidebarWidth}
        onSidebarWidthChange={setSidebarWidth}
        isInitialOpen={isInitialOpen}  // Use shared animation state
        initialCode={lastAgentMessage?.object}
        initialResult={lastAgentMessage?.result}
        sharedMessages={messages}  // Share messages across all modes
        onMessagesChange={setMessages}  // Allow AgentModeChat to update shared messages
      />
    );
  }

  // Other 4 modes: Original Ember Chat UI
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-[45]"
        onClick={handleClose}
      />

      {/* Sidebar */}
      <div
        ref={sidebarRef}
        className={`fixed right-0 top-0 h-full bg-white border-l-4 border-black shadow-pixel z-50 flex flex-col ${
          isInitialOpen ? 'animate-slide-in' : ''
        } ${isClosing ? 'animate-slide-out' : ''}`}
        style={{
          width: `${sidebarWidth}px`,
          transform: swipeOffset > 0 ? `translateX(${swipeOffset}px)` : 'translateX(0)',
          cursor: isResizing ? 'ew-resize' : 'default'
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* 左边框拖拽手柄（桌面端） */}
        <div
          className="absolute left-0 top-0 bottom-0 w-1 hover:w-2 bg-transparent hover:bg-blue-500 cursor-ew-resize transition-all hidden md:block"
          onMouseDown={handleResizeStart}
          style={{
            zIndex: 100
          }}
        >
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-12 bg-gray-400 rounded-full opacity-50 hover:opacity-100" />
        </div>
        {/* Header */}
        <div className="p-4 border-b-4 border-black bg-white">
          <div className="flex items-start justify-between mb-2">
            <div className="flex-1">
              <h2 className="font-pixel text-2xl">{t('aiChat', 'title')}</h2>
              <div className="text-[10px] font-mono text-gray-500 mt-1">
                {language === 'ZH' ? '由 Stanse AI 提供支持' :
                 language === 'JA' ? 'Stanse AI により提供' :
                 language === 'FR' ? 'Propulsé par Stanse AI' :
                 language === 'ES' ? 'Desarrollado por Stanse AI' :
                 'Powered by Stanse AI'}
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
                onClick={handleClose}
                className="p-2 hover:bg-gray-100 border-2 border-transparent hover:border-black transition-colors"
              >
                <X size={24} />
              </button>
            </div>
          </div>

          {/* Mode Selector */}
          <ChatModeSelector
            activeMode={chatMode}
            onChange={handleModeChange}
            language={language}
          />
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
          {messages.length === 0 && !loading && (
            <div className="text-center text-gray-400 font-mono text-sm mt-8">
              <p>{t('aiChat', 'emptyState')}</p>
              <p className="text-xs mt-2">
                💡 {language === 'ZH' ? '选择不同模式获得不同质量的回答' :
                   language === 'JA' ? '異なるモードで異なる品質の回答を取得' :
                   language === 'FR' ? 'Choisissez le mode pour différentes qualités' :
                   language === 'ES' ? 'Elige el modo para diferentes calidades' :
                   'Choose different modes for different quality answers'}
              </p>
            </div>
          )}

          {messages.map(msg => {
            const candidates = ensembleCandidates[msg.id];
            // Check if this message is part of pending Multi mode selection
            const pendingAnswer = pendingMultiAnswers?.answers.find(a => a.messageId === msg.id);
            const isPendingMultiAnswer = !!pendingAnswer;

            return (
              <div key={msg.id}>
                <ChatBubble message={msg} />

                {/* Agent mode: Show code preview thumbnail for ALL modes (not just agent mode) */}
                {msg.object && (
                  <div
                    onClick={() => {
                      // Switch to agent mode and restore code (no animation)
                      handleModeChange('agent');
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
                        {language === 'ZH' ? '点击切换至代码模式' :
                         language === 'JA' ? 'コードモードに切り替え' :
                         language === 'FR' ? 'Passer au mode code' :
                         language === 'ES' ? 'Cambiar a modo código' :
                         'Click to switch to Agent mode'}
                      </span>
                    </div>
                  </div>
                )}

                {/* Multi mode: selection button for each answer */}
                {isPendingMultiAnswer && pendingAnswer && (
                  <div className="mt-2 flex justify-end">
                    <button
                      onClick={() => handleSelectMultiAnswer(
                        pendingAnswer.messageId,
                        pendingAnswer.model,
                        pendingAnswer.answer
                      )}
                      className="flex items-center gap-1 px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white font-mono text-xs border-2 border-green-700 transition-colors"
                    >
                      <Check size={14} />
                      {language === 'ZH' ? '选择此答案' :
                       language === 'JA' ? 'この回答を選択' :
                       language === 'FR' ? 'Choisir cette réponse' :
                       language === 'ES' ? 'Elegir esta respuesta' :
                       'Select this answer'}
                    </button>
                  </div>
                )}
                {/* Ensemble mode: collapsible candidate view (for reference only, no selection) */}
                {candidates && candidates.length > 0 && (
                  <EnsembleCandidatesCollapsible candidates={candidates} language={language} />
                )}
              </div>
            );
          })}

          {loading && (
            <div className="flex items-center gap-2 text-gray-500 font-mono text-sm">
              <Loader size={16} className="animate-spin" />
              <span>{t('aiChat', 'thinking')}</span>
            </div>
          )}

          {error && (
            <div className="bg-red-100 border-2 border-red-500 p-3">
              <div className="flex items-center justify-between">
                <div className="font-mono text-sm text-red-700 flex-1">{error}</div>
                {lastRequest && (
                  <button
                    onClick={handleRetry}
                    className="ml-2 px-3 py-1 bg-red-500 text-white font-mono text-xs border-2 border-black hover:bg-red-600 transition-colors flex items-center gap-1"
                  >
                    <RotateCcw size={12} />
                    {language === 'ZH' ? '重试' :
                     language === 'JA' ? '再試行' :
                     language === 'FR' ? 'Réessayer' :
                     language === 'ES' ? 'Reintentar' :
                     'Retry'}
                  </button>
                )}
              </div>
            </div>
          )}

          <div ref={messagesEndRefEmber} />
        </div>

        {/* Cost Tracker - 始终显示，使用翻译后的标签 */}
        <CostTracker
          costInfo={costInfo}
          language={language}
          userLabel={translatedUserLabel || userProfile?.coordinates?.label}
        />

        {/* Input */}
        <div className="p-4 border-t-4 border-black bg-white">
          <div className="flex gap-2 items-end">
            <textarea
              ref={inputRef as any}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('aiChat', 'inputPlaceholder')}
              className="flex-1 border-2 border-black p-3 font-mono text-sm focus:outline-none focus:border-blue-500 resize-none min-h-[48px] max-h-[120px]"
              disabled={loading}
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
            {loading ? (
              <button
                onClick={handleStop}
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
                onClick={handleSend}
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
        </div>
      </div>
    </>
  );
};
