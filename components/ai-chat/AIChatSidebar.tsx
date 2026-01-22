import React, { useState, useEffect, useRef } from 'react';
import { X, Send, Loader, Trash2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { ChatMessage, LLMProvider } from '../../types';
import { llmService } from '../../services/llm/llmService';
import {
  saveChatMessage,
  loadChatHistory,
  clearOldestMessage,
  clearAllChatHistory
} from '../../services/chatHistoryService';
import { ChatBubble } from './ChatBubble';
import { ProviderSelector } from './ProviderSelector';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  prefilledMessage?: string; // For text selection feature
}

export const AIChatSidebar: React.FC<Props> = ({ isOpen, onClose, prefilledMessage }) => {
  const { user, userProfile } = useAuth();
  const { t, language } = useLanguage();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');

  // Swipe to close state
  const [swipeStartX, setSwipeStartX] = useState<number | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const [activeProvider, setActiveProvider] = useState<LLMProvider>(LLMProvider.GEMINI);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load history on open
  useEffect(() => {
    if (isOpen && user) {
      loadChatHistory(user.uid).then(setMessages);
    }
  }, [isOpen, user]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Focus input when opened & handle prefilled message
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
      // Set prefilled message if provided
      if (prefilledMessage && prefilledMessage.trim()) {
        setInput(prefilledMessage);
      }
    }
  }, [isOpen, prefilledMessage]);

  // Update llmService when provider changes
  useEffect(() => {
    llmService.setProvider(activeProvider);
  }, [activeProvider]);

  // Swipe to close gesture handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    setSwipeStartX(e.touches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (swipeStartX === null) return;

    const currentX = e.touches[0].clientX;
    const diff = currentX - swipeStartX;

    // Only allow right swipe (positive diff)
    if (diff > 0) {
      setSwipeOffset(diff);
    }
  };

  const handleTouchEnd = () => {
    if (swipeOffset > 100) {
      // Swipe threshold exceeded - close sidebar
      onClose();
    }

    // Reset swipe state
    setSwipeStartX(null);
    setSwipeOffset(0);
  };

  const handleSend = async () => {
    if (!input.trim() || !user || loading) return;

    const trimmedInput = input.trim();
    const userMessage: ChatMessage = {
      id: `${Date.now()}-user`,
      role: 'user',
      content: trimmedInput,
      timestamp: new Date().toISOString(),
      provider: activeProvider
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);
    setError(null);

    try {
      // Build context from user profile
      let context = '';
      if (userProfile) {
        context = `User Political Profile:
- Economic: ${userProfile.coordinates.economic} (${userProfile.coordinates.economic < 0 ? 'Socialist' : 'Free Market'})
- Social: ${userProfile.coordinates.social} (${userProfile.coordinates.social < 0 ? 'Authoritarian' : 'Libertarian'})
- Diplomatic: ${userProfile.coordinates.diplomatic} (${userProfile.coordinates.diplomatic < 0 ? 'Nationalist' : 'Internationalist'})
- Persona: ${userProfile.coordinates.label}

You are helping a user with these political leanings. Be respectful and provide balanced information.`;
      }

      const response = await llmService.chat(trimmedInput, context, language);

      if (response.success) {
        const assistantMessage: ChatMessage = {
          id: `${Date.now()}-assistant`,
          role: 'assistant',
          content: response.content,
          timestamp: new Date().toISOString(),
          provider: activeProvider
        };

        setMessages(prev => [...prev, assistantMessage]);

        // Save to Firestore (max 5 records)
        try {
          const historyCount = await saveChatMessage(
            user.uid,
            trimmedInput,
            response.content,
            activeProvider
          );

          // If we exceeded 5, delete oldest
          if (historyCount > 5) {
            await clearOldestMessage(user.uid);
          }
        } catch (saveError) {
          console.error('Failed to save chat history:', saveError);
          // Don't show error to user, just log it
        }
      } else {
        setError(response.error || t('aiChat', 'errorMessage'));
      }
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
        className="fixed right-0 top-0 h-full w-[400px] bg-white border-l-4 border-black shadow-pixel z-50 flex flex-col animate-slide-in transition-transform duration-300 ease-out"
        style={{
          transform: swipeOffset > 0 ? `translateX(${swipeOffset}px)` : 'translateX(0)',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Header */}
        <div className="p-4 border-b-4 border-black bg-white">
          <div className="flex items-start justify-between mb-2">
            <div className="flex-1">
              <h2 className="font-pixel text-2xl">{t('aiChat', 'title')}</h2>
              <ProviderSelector
                active={activeProvider}
                onChange={setActiveProvider}
              />
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
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
          {messages.length === 0 && !loading && (
            <div className="text-center text-gray-400 font-mono text-sm mt-8">
              <p>{t('aiChat', 'emptyState')}</p>
              <p className="text-xs mt-2">{t('aiChat', 'emptyHint') || 'Ask me anything about brands, politics, or get personalized recommendations!'}</p>
            </div>
          )}

          {messages.map(msg => (
            <ChatBubble key={msg.id} message={msg} />
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
            {t('aiChat', 'hint') || 'Press Enter to send, Shift+Enter for new line'}
          </p>
        </div>
      </div>
    </>
  );
};
