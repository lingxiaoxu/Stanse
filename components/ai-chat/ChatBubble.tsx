import React from 'react';
import { User, Bot } from 'lucide-react';
import { ChatMessage, LLMProvider } from '../../types';

interface Props {
  message: ChatMessage;
}

/**
 * Simple Markdown-to-HTML converter for chat messages
 * Handles: **bold**, *italic*, `code`, bullet lists
 * Fixed to support Chinese/Japanese and multiline content
 */
const formatMarkdown = (text: string): string => {
  if (!text) return '';

  let formatted = text;

  // Step 1: Protect bullet list markers from being treated as italic
  // Replace "* " at start of line with placeholder
  formatted = formatted.replace(/^(\s*)\*\s+/gm, '$1BULLET_MARKER_PLACEHOLDER ');

  // Step 2: Convert **bold** to <strong> (use [\s\S] to match across lines)
  formatted = formatted.replace(/\*\*([^\*]+?)\*\*/g, '<strong>$1</strong>');

  // Step 3: Convert *italic* to <em> (only single * not followed/preceded by *)
  // Use negative lookahead/lookbehind to avoid matching ** or bullet markers
  formatted = formatted.replace(/(?<![*\w])\*([^*\n]+?)\*(?![*\w])/g, '<em>$1</em>');

  // Step 4: Restore bullet markers and convert to <li>
  formatted = formatted.replace(/^(\s*)BULLET_MARKER_PLACEHOLDER\s+(.+)$/gm, '$1<li class="ml-4">$2</li>');

  // Step 5: Also handle "• " markers
  formatted = formatted.replace(/^(\s*)•\s+(.+)$/gm, '$1<li class="ml-4">$2</li>');

  // Step 6: Wrap consecutive <li> items in <ul>
  formatted = formatted.replace(/(<li.*?<\/li>\s*)+/g, (match) => `<ul class="list-disc ml-4 space-y-1">${match}</ul>`);

  // Step 7: Convert `code` to <code>
  formatted = formatted.replace(/`([^`]+)`/g, '<code class="bg-gray-200 px-1 rounded text-xs font-mono">$1</code>');

  // Step 8: Convert line breaks to <br> (preserve spacing)
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
