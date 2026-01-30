import React from 'react';
import { User, Bot } from 'lucide-react';
import { ChatMessage, LLMProvider, MessageContentPart } from '../../types';

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

  // Step 2: Convert **bold** to <strong>
  // Match: ** followed by any chars (non-greedy) followed by **
  // Use [\s\S] to include newlines, but be careful not to match nested **
  formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

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
  [LLMProvider.LOCAL]: 'bg-gray-100 border-gray-500',
  [LLMProvider.EMBER]: 'bg-white border-black'
};

const providerLabels: Record<LLMProvider, string> = {
  [LLMProvider.GEMINI]: 'Gemini',
  [LLMProvider.CHATGPT]: 'ChatGPT',
  [LLMProvider.CLAUDE]: 'Claude',
  [LLMProvider.LOCAL]: 'Local',
  [LLMProvider.EMBER]: 'Stanse AI'
};

export const ChatBubble: React.FC<Props> = ({ message }) => {
  const isUser = message.role === 'user';

  // Convert content to string for markdown rendering
  const getContentString = (): string => {
    if (typeof message.content === 'string') {
      return message.content;
    }
    // For complex content (MessageContentPart[]), extract text parts
    return (message.content as MessageContentPart[])
      .filter(part => part.type === 'text')
      .map(part => part.text)
      .join('\n');
  };

  // Extract images from complex content
  const getImages = (): string[] => {
    if (typeof message.content === 'string') {
      return [];
    }
    return (message.content as MessageContentPart[])
      .filter(part => part.type === 'image')
      .map(part => part.image);
  };

  const contentString = getContentString();
  const images = getImages();

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      <div className={`flex-shrink-0 w-8 h-8 rounded-full border-2 border-black flex items-center justify-center ${isUser ? 'bg-black text-white' : 'bg-white text-black'}`}>
        {isUser ? <User size={16} /> : <Bot size={16} />}
      </div>

      {/* Message Content */}
      <div className={`flex-1 max-w-[70%] ${isUser ? 'items-end' : 'items-start'}`}>
        <div className={`border-2 border-black p-3 ${isUser ? 'bg-gray-100' : providerColors[message.provider]}`}>
          {/* Images (if any) */}
          {images.length > 0 && (
            <div className="flex gap-2 mb-2 flex-wrap">
              {images.map((img, idx) => (
                <img
                  key={idx}
                  src={img}
                  alt="uploaded"
                  className="w-12 h-12 object-cover border-2 border-black inline-block"
                />
              ))}
            </div>
          )}

          {/* Text Content */}
          <div
            className="font-mono text-sm break-words leading-relaxed"
            style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}
            dangerouslySetInnerHTML={{ __html: formatMarkdown(contentString) }}
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
