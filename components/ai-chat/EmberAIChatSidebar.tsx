import React, { useState, useEffect, useRef } from 'react';
import { X, Send, Loader, Trash2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { ChatMessage } from '../../types';
import {
  saveChatMessage,
  loadChatHistory,
  clearOldestMessage,
  clearAllChatHistory
} from '../../services/chatHistoryService';
import { ChatBubble } from './ChatBubble';
import { ChatModeSelector, ChatMode } from './ChatModeSelector';
import { CostTracker } from './CostTracker';

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

  // Ensemble 候选选择
  const [pendingCandidates, setPendingCandidates] = useState<{
    question: string;
    finalAnswer: string;
    candidates: string[];
    messageIds: string[];
  } | null>(null);

  // Swipe to close
  const [swipeStartX, setSwipeStartX] = useState<number | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 可调整宽度（桌面端）
  const [sidebarWidth, setSidebarWidth] = useState(400); // 初始宽度 400px
  const [isResizing, setIsResizing] = useState(false);
  const [resizeStartX, setResizeStartX] = useState(0);
  const [resizeStartWidth, setResizeStartWidth] = useState(0);

  // Ember API URL (需要根据部署配置)
  const EMBER_API_URL = process.env.NEXT_PUBLIC_EMBER_API_URL || 'https://us-central1-gen-lang-client-0960644135.cloudfunctions.net/ember_api';

  // Load history on open
  useEffect(() => {
    if (isOpen && user) {
      loadChatHistory(user.uid).then(setMessages);
      // Load cost stats
      loadCostStats();
    }
  }, [isOpen, user]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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
      provider: 'ember' as any  // Use 'ember' as provider
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);
    setError(null);

    try {
      // Build context from user profile
      const userContext = userProfile ? {
        economic: userProfile.coordinates.economic,
        social: userProfile.coordinates.social,
        diplomatic: userProfile.coordinates.diplomatic,
        label: userProfile.coordinates.label
      } : undefined;

      // Call Ember API
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
        })
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
        // Multi-model mode: show all answers
        data.answer.forEach((resp, idx) => {
          assistantMessages.push({
            id: `${Date.now()}-assistant-${idx}`,
            role: 'assistant',
            content: `**${resp.model}**: ${resp.answer}`,
            timestamp: new Date().toISOString(),
            provider: 'ember' as any
          });
        });
      } else if (chatMode === 'ensemble' && data.candidates) {
        // Ensemble mode: show final answer + candidates with selection buttons
        answerContent = typeof data.answer === 'string' ? data.answer : JSON.stringify(data.answer);

        const finalMsgId = `${Date.now()}-assistant-final`;
        const candidateIds: string[] = [];

        // Add final answer
        assistantMessages.push({
          id: finalMsgId,
          role: 'assistant',
          content: `**最终答案 (Ensemble)**:\n${answerContent}\n\n💡 *从下面的候选答案中选择你最喜欢的，其他候选将被删除*`,
          timestamp: new Date().toISOString(),
          provider: 'ember' as any
        });

        // Add candidates with selection buttons
        data.candidates.forEach((candidate, idx) => {
          const candidateId = `${Date.now()}-candidate-${idx}`;
          candidateIds.push(candidateId);

          assistantMessages.push({
            id: candidateId,
            role: 'assistant',
            content: `**候选 ${idx + 1}**:\n${candidate}`,
            timestamp: new Date().toISOString(),
            provider: 'ember' as any,
            // 添加候选索引用于选择
            candidateIndex: idx
          } as any);
        });

        // 保存待选择的候选信息
        setPendingCandidates({
          question: trimmedInput,
          finalAnswer: answerContent,
          candidates: data.candidates,
          messageIds: [finalMsgId, ...candidateIds]
        });
      } else {
        // Default/batch mode: single answer
        answerContent = typeof data.answer === 'string' ? data.answer : JSON.stringify(data.answer);
        assistantMessages.push({
          id: `${Date.now()}-assistant`,
          role: 'assistant',
          content: answerContent,
          timestamp: new Date().toISOString(),
          provider: 'ember' as any
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

      // Save to Firestore (max 5 records)
      // 对于 Ensemble/Multi 模式，等待用户选择后再保存
      try {
        // Ensemble 模式：不立即保存，等待用户选择候选
        if (chatMode === 'ensemble' && data.candidates) {
          // 由 handleSelectCandidate 处理保存
          console.log('Ensemble 模式：等待用户选择候选答案');
          return;
        }

        // Multi 模式：保存所有答案
        let contentToSave = answerContent;
        if (chatMode === 'multi' && Array.isArray(data.answer)) {
          contentToSave = '';
          data.answer.forEach((resp) => {
            contentToSave += `**${resp.model}**: ${resp.answer}\n\n`;
          });
        }

        const historyCount = await saveChatMessage(
          user.uid,
          trimmedInput,
          contentToSave,
          'ember' as any
        );

        if (historyCount > 5) {
          await clearOldestMessage(user.uid);
        }
      } catch (saveError) {
        console.error('Failed to save chat history:', saveError);
      }

      // Reload cost stats after saving
      // 延迟一下让 Firestore 写入完成
      setTimeout(() => {
        loadCostStats();
      }, 1000);

    } catch (err: any) {
      console.error('Chat error:', err);
      setError(err.message || t('aiChat', 'errorMessage'));
    } finally {
      setLoading(false);
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

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // 处理候选答案选择
  const handleSelectCandidate = async (candidateIndex: number) => {
    if (!pendingCandidates || !user) return;

    const { question, candidates, messageIds } = pendingCandidates;
    const selectedCandidate = candidates[candidateIndex];

    // 保存选中的候选到 Firestore
    try {
      const contentToSave = `**Ensemble 答案 (已选择候选 ${candidateIndex + 1})**:\n\n${selectedCandidate}`;

      await saveChatMessage(
        user.uid,
        question,
        contentToSave,
        'ember' as any
      );

      // 删除界面上的其他候选消息
      setMessages(prev => prev.filter(msg =>
        !messageIds.includes(msg.id) || msg.id === messageIds[candidateIndex + 1]
      ));

      // 更新选中候选的内容（移除选择按钮）
      setMessages(prev => prev.map(msg => {
        if (msg.id === messageIds[candidateIndex + 1]) {
          return {
            ...msg,
            content: `**✅ 已选择的答案**:\n${selectedCandidate}`
          };
        }
        return msg;
      }));

      // 清除待选择状态
      setPendingCandidates(null);

    } catch (error) {
      console.error('Failed to save selected candidate:', error);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-[45]"
        onClick={onClose}
      />

      {/* Sidebar */}
      <div
        ref={sidebarRef}
        className="fixed right-0 top-0 h-full bg-white border-l-4 border-black shadow-pixel z-50 flex flex-col animate-slide-in"
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

          {/* Mode Selector */}
          <ChatModeSelector
            activeMode={chatMode}
            onChange={setChatMode}
            language={language}
          />
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
          {messages.length === 0 && !loading && (
            <div className="text-center text-gray-400 font-mono text-sm mt-8">
              <p>{t('aiChat', 'emptyState')}</p>
              <p className="text-xs mt-2">
                💡 选择不同模式获得不同质量的回答
              </p>
            </div>
          )}

          {messages.map(msg => (
            <div key={msg.id}>
              <ChatBubble message={msg} />
              {/* 如果是候选答案，显示选择按钮 */}
              {pendingCandidates && (msg as any).candidateIndex !== undefined && (
                <div className="mt-2 flex justify-end">
                  <button
                    onClick={() => handleSelectCandidate((msg as any).candidateIndex)}
                    className="px-4 py-2 bg-blue-600 text-white font-mono text-xs border-2 border-black hover:bg-blue-700 transition-colors"
                  >
                    ✅ 选择此答案
                  </button>
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex items-center gap-2 text-gray-500 font-mono text-sm">
              <Loader size={16} className="animate-spin" />
              <span>{t('aiChat', 'thinking')}</span>
            </div>
          )}

          {error && (
            <div className="bg-red-100 border-2 border-red-500 p-3 font-mono text-sm text-red-700">
              {error}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Cost Tracker - 始终显示 */}
        <CostTracker
          costInfo={costInfo}
          language={language}
          userLabel={userProfile?.coordinates?.label}
        />

        {/* Input */}
        <div className="p-4 border-t-4 border-black bg-white">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={t('aiChat', 'inputPlaceholder')}
              className="flex-1 border-2 border-black p-3 font-mono text-sm focus:outline-none focus:border-blue-500"
              disabled={loading}
            />
            <button
              onClick={handleSend}
              disabled={loading || !input.trim()}
              className="bg-black text-white p-3 hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed border-2 border-black transition-colors"
            >
              <Send size={20} />
            </button>
          </div>
          <p className="font-mono text-[9px] text-gray-400 mt-1">
            {t('aiChat', 'hint') || 'Press Enter to send'}
          </p>
        </div>
      </div>
    </>
  );
};
