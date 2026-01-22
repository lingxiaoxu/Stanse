import React from 'react';
import { User, Bot } from 'lucide-react';
import { ChatMessage, LLMProvider } from '../../types';

interface Props {
  message: ChatMessage;
}

/**
 * Simple Markdown-to-HTML converter for chat messages
 * Handles: **bold**, *italic*, `code`, bullet lists
 */
const formatMarkdown = (text: string): string => {
  if (!text) return '';

  let formatted = text;

  // Convert **bold** to <strong>
  formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

  // Convert *italic* to <em> (but not already converted ** patterns)
  formatted = formatted.replace(/(?<!\*)\*(?!\*)([^*]+)\*(?!\*)/g, '<em>$1</em>');

  // Convert `code` to <code>
  formatted = formatted.replace(/`([^`]+)`/g, '<code class="bg-gray-200 px-1 rounded text-xs">$1</code>');

  // Convert bullet lists: "* item" or "• item" to <li>
  formatted = formatted.replace(/^[\s]*[*•]\s+(.+)$/gm, '<li class="ml-4">$1</li>');

  // Wrap consecutive <li> items in <ul>
  formatted = formatted.replace(/(<li.*?<\/li>\s*)+/g, (match) => `<ul class="list-disc ml-4 space-y-1">${match}</ul>`);

  // Convert line breaks to <br> (preserve spacing)
  formatted = formatted.replace(/\n/g, '<br/>');

  return formatted;
};

const providerColors: Record<LLMProvider, string> = {
  [LLMProvider.GEMINI]: 'bg-blue-100 border-blue-500',
  [LLMProvider.CHATGPT]: 'bg-green-100 border-green-500',
  [LLMProvider.CLAUDE]: 'bg-purple-100 border-purple-500',
  [LLMProvider.LOCAL]: 'bg-gray-100 border-gray-500'
};

const providerLabels: Record<LLMProvider, string> = {
  [LLMProvider.GEMINI]: 'Gemini',
  [LLMProvider.CHATGPT]: 'ChatGPT',
  [LLMProvider.CLAUDE]: 'Claude',
  [LLMProvider.LOCAL]: 'Local'
};

export const ChatBubble: React.FC<Props> = ({ message }) => {
  const isUser = message.role === 'user';

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      <div className={`flex-shrink-0 w-8 h-8 rounded-full border-2 border-black flex items-center justify-center ${isUser ? 'bg-black text-white' : 'bg-white text-black'}`}>
        {isUser ? <User size={16} /> : <Bot size={16} />}
      </div>

      {/* Message Content */}
      <div className={`flex-1 max-w-[70%] ${isUser ? 'items-end' : 'items-start'}`}>
        <div className={`border-2 border-black p-3 ${isUser ? 'bg-gray-100' : providerColors[message.provider]}`}>
          <div
            className="font-mono text-sm break-words prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: formatMarkdown(message.content) }}
          />
        </div>

        {/* Timestamp and Provider Badge */}
        <div className={`flex gap-2 items-center mt-1 ${isUser ? 'justify-end' : 'justify-start'}`}>
          <span className="font-mono text-[10px] text-gray-400">
            {new Date(message.timestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit'
            })}
          </span>
          {!isUser && (
            <span className={`font-mono text-[10px] px-1 border ${providerColors[message.provider]}`}>
              {providerLabels[message.provider]}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
