# AI Chat Assistant Implementation

**Date:** 2026-01-22
**Version:** 1.0.0
**Status:** Implemented

## Overview

This document describes the implementation of a multi-provider AI chat assistant feature in STANSE. The assistant supports multiple LLM providers (Gemini, ChatGPT, Claude, Local models) and provides a floating chat interface accessible from all pages.

## Architecture

### Component Structure

```
App.tsx
├── AIChatFloatingButton (fixed right-6 bottom-[100px])
│   └── Hover 2s shows X to close
│   └── Z-index: 40
│
└── AIChatSidebar (400px width, slide-in from right)
    ├── Header (Provider selector + Clear + Close)
    ├── ChatMessages (scrollable, auto-scroll)
    └── ChatInput (text + send button)
    └── Z-index: 50
```

### Service Architecture

```
services/llm/
├── llmProvider.ts (Base interface + types)
├── llmService.ts (Factory + singleton)
└── providers/
    ├── GeminiProvider.ts (uses process.env.GEMINI_API_KEY from Secret Manager)
    ├── ChatGPTProvider.ts (user-provided API key)
    ├── ClaudeProvider.ts (user-provided API key)
    └── LocalProvider.ts (user-provided endpoint)

services/chatHistoryService.ts (Firestore operations)
```

## Data Models

### TypeScript Interfaces

```typescript
// types.ts

export enum ViewState {
  // ... existing states
  AI_CHAT = 'AI_CHAT'
}

export enum LLMProvider {
  GEMINI = 'GEMINI',
  CHATGPT = 'CHATGPT',
  CLAUDE = 'CLAUDE',
  LOCAL = 'LOCAL'
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string; // ISO date string
  provider: LLMProvider;
}

export interface ChatHistoryRecord {
  id: string;
  userId: string;
  question: string;
  answer: string;
  provider: LLMProvider;
  timestamp: string;
  createdAt: Timestamp;
}
```

### Firestore Collection Structure

```
users/{userId}/chatHistory/{messageId}
  - userId: string
  - question: string
  - answer: string
  - provider: 'GEMINI' | 'CHATGPT' | 'CLAUDE' | 'LOCAL'
  - timestamp: string (ISO)
  - createdAt: Timestamp (server)
```

**Maximum Records:** 5 per user (enforced client-side)
- When 6th message is saved, oldest is automatically deleted

## Security

### API Key Management

**Gemini (Managed - Most Secure):**
```typescript
// services/llm/providers/GeminiProvider.ts
const apiKey = process.env.GEMINI_API_KEY || '';

// Retrieved from Google Secret Manager:
// - Project: gen-lang-client-0960644135
// - Secret: gemini-api-key
// - Access: Via cloudbuild.yaml during build
```

**Other Providers (User-Provided):**
- ChatGPT, Claude, Local model API keys are:
  - Stored **in memory only** (LLMService instance)
  - **Never persisted** to Firebase or localStorage
  - **Reset on page refresh**
  - Warning displayed: "Your key is stored locally only, never saved to the server"

### Firestore Security Rules

```javascript
// firestore.rules

match /users/{userId}/chatHistory/{messageId} {
  allow read, write: if request.auth != null && request.auth.uid == userId;
}
```

**Protection:**
- Users can only access their own chat history
- No cross-user data leakage
- Standard user-scoped pattern

## User Interface

### Entry Points

**1. Floating Button (Primary)**
- Position: Fixed right-6 bottom-[100px]
- Size: 64x64px
- Icon: MessageSquare
- Hover behavior: Shows X after 2 seconds
- Z-index: 40 (below modals, above content)
- Availability: All pages when logged in

**2. Menu Item (Secondary)**
- Location: Hamburger menu → AI ASSISTANT (between ACCOUNT and ABOUT US)
- Action: Opens chat sidebar
- Translation keys: `menu.aiAssistant` and `menu.subs.aiAssistant`

### Chat Sidebar

**Dimensions:**
- Width: 400px
- Height: 100vh (full height)
- Position: Fixed right
- Animation: slide-in from right
- Z-index: 50

**Sections:**

1. **Header**
   - Title: "AI ASSISTANT"
   - Provider selector dropdown (Gemini, ChatGPT, Claude, Local)
   - Clear history button (Trash icon)
   - Close button (X icon)
   - Border: 4px bottom

2. **Messages Area**
   - Background: gray-50
   - Scrollable: overflow-y-auto
   - Auto-scroll to latest message
   - Empty state with hint text
   - Message bubbles:
     - User: right-aligned, gray-100 background
     - Assistant: left-aligned, provider-specific color
     - Avatar icons: User/Bot
     - Timestamp (HH:MM format)
     - Provider badge on assistant messages

3. **Input Area**
   - Text input: full width, border-2
   - Send button: black background, Send icon
   - Hint text: "Press Enter to send, Shift+Enter for new line"
   - Border: 4px top

### Provider Configuration UI

When selecting unconfigured provider:
1. Dropdown closes
2. Configuration panel appears in header
3. Shows:
   - Provider name
   - Input field for API key/endpoint
   - Security warning (local storage only)
   - SAVE / CANCEL buttons
4. After saving, provider becomes available

## LLM Provider Integration

### Base Provider Interface

```typescript
// services/llm/llmProvider.ts

export interface LLMProviderConfig {
  apiKey?: string;
  endpoint?: string; // For local models
  temperature?: number;
  maxTokens?: number;
}

export interface LLMResponse {
  success: boolean;
  content: string;
  error?: string;
  provider: LLMProvider;
}

export abstract class BaseLLMProvider {
  abstract chat(
    userMessage: string,
    context?: string,
    language?: string
  ): Promise<LLMResponse>;

  abstract isConfigured(): boolean;
}
```

### Gemini Provider

**File:** `services/llm/providers/GeminiProvider.ts`

**Features:**
- Uses existing `@google/genai` SDK integration
- Reuses CORS proxy pattern from `geminiService.ts`
- API key from Secret Manager via `process.env.GEMINI_API_KEY`
- Model: gemini-2.5-flash
- Supports language-specific responses
- Temperature: 0.7 (configurable)
- Max tokens: 2048 (configurable)

**Context Injection:**
```typescript
// User profile context automatically added
const context = `
User Political Profile:
- Economic: ${userProfile.coordinates.economic}
- Social: ${userProfile.coordinates.social}
- Diplomatic: ${userProfile.coordinates.diplomatic}
- Persona: ${userProfile.coordinates.label}
`;
```

### ChatGPT Provider

**File:** `services/llm/providers/ChatGPTProvider.ts`

**API:**
- Endpoint: `https://api.openai.com/v1/chat/completions`
- Model: gpt-4o
- Headers: `Authorization: Bearer ${apiKey}`
- System message includes user context

### Claude Provider

**File:** `services/llm/providers/ClaudeProvider.ts`

**API:**
- Endpoint: `https://api.anthropic.com/v1/messages`
- Model: claude-3-5-sonnet-20241022
- Headers: `x-api-key: ${apiKey}`, `anthropic-version: 2023-06-01`
- System prompt includes user context

### Local Model Provider

**File:** `services/llm/providers/LocalProvider.ts`

**Features:**
- Supports OpenAI-compatible endpoints
- Configurable endpoint URL
- Optional API key for authentication
- Response format detection (OpenAI, Ollama, direct)
- Fallback parsing for various formats

**Example Endpoints:**
- Ollama: `http://localhost:11434/api/chat`
- LM Studio: `http://localhost:1234/v1/chat/completions`
- Custom: Any OpenAI-compatible endpoint

## Chat History Management

### Service Functions

**File:** `services/chatHistoryService.ts`

```typescript
// Load last 5 conversations
loadChatHistory(userId: string): Promise<ChatMessage[]>

// Save Q&A pair (returns total count)
saveChatMessage(
  userId: string,
  question: string,
  answer: string,
  provider: LLMProvider
): Promise<number>

// Delete oldest record (for 5-record limit)
clearOldestMessage(userId: string): Promise<void>

// Clear all history (user action)
clearAllChatHistory(userId: string): Promise<void>
```

### Storage Pattern

1. User sends message
2. Assistant responds
3. Save to Firestore: `users/{userId}/chatHistory`
4. Check count: if > 5, delete oldest
5. On next load: Retrieve all records, convert to ChatMessage[]

**Record Structure:**
- Each record contains ONE question-answer pair
- Display as TWO ChatMessages (user + assistant)
- Ordered by `createdAt` (server timestamp)

## Multi-Language Support

### Translation Namespaces

**Menu Namespace (`menu`):**
```typescript
{
  aiAssistant: "AI ASSISTANT",  // Menu item label
  subs: {
    aiAssistant: "Chat with AI"  // Menu item subtitle
  }
}
```

**AI Chat Namespace (`aiChat`):**
```typescript
{
  title: "AI ASSISTANT",
  subtitle: "Multi-Provider LLM Chat",
  inputPlaceholder: "Ask me anything...",
  emptyState: "Start a conversation with your AI assistant",
  emptyHint: "Ask about brands, politics, or get personalized recommendations!",
  thinking: "Thinking...",
  providerLabel: "AI Provider:",
  providerGemini: "Gemini (Default)",
  providerChatGPT: "ChatGPT",
  providerClaude: "Claude",
  providerLocal: "Local Model",
  apiKeyLabel: "API Key:",
  apiKeyPlaceholder: "Enter your API key",
  configureProvider: "Configure Provider",
  providerNotConfigured: "This provider requires an API key",
  errorMessage: "Failed to get response. Please try again.",
  clearHistory: "Clear history",
  confirmClear: "Clear all chat history?",
  save: "SAVE",
  cancel: "CANCEL",
  default: "Default",
  hint: "Press Enter to send, Shift+Enter for new line"
}
```

### Language-Specific Responses

When user's language is not English, Gemini provider automatically adds:
```
Please respond in [Chinese/Japanese/French/Spanish].
```

## Files Created

### Components
1. `components/ai-chat/AIChatFloatingButton.tsx` (47 lines)
2. `components/ai-chat/AIChatSidebar.tsx` (236 lines)
3. `components/ai-chat/ChatBubble.tsx` (68 lines)
4. `components/ai-chat/ProviderSelector.tsx` (137 lines)

### Services
5. `services/llm/llmProvider.ts` (44 lines) - Base interfaces
6. `services/llm/llmService.ts` (129 lines) - Factory + singleton
7. `services/llm/providers/GeminiProvider.ts` (78 lines)
8. `services/llm/providers/ChatGPTProvider.ts` (82 lines)
9. `services/llm/providers/ClaudeProvider.ts` (71 lines)
10. `services/llm/providers/LocalProvider.ts` (95 lines)
11. `services/chatHistoryService.ts` (131 lines)

### Modified Files
12. `types.ts` - Added ViewState.AI_CHAT, LLMProvider enum, ChatMessage/ChatHistoryRecord interfaces
13. `App.tsx` - Added state, imports, navigation handler, floating button + sidebar rendering
14. `components/ui/MenuOverlay.tsx` - Added AI ASSISTANT menu item + MessageSquare icon
15. `contexts/LanguageContext.tsx` - Added `menu.aiAssistant` and `aiChat` namespace for 5 languages
16. `firestore.rules` - Added chatHistory security rules

## Testing Instructions

### Browser Console Utilities

No test utilities needed - use the UI directly:

1. **Open Chat:**
   - Click floating button (right bottom corner)
   - OR Menu → AI ASSISTANT

2. **Test Gemini (Default):**
   - Type message: "Hello, what can you help me with?"
   - Should respond immediately

3. **Test Provider Switching:**
   - Click provider dropdown in header
   - Select "ChatGPT"
   - Enter OpenAI API key
   - Click SAVE
   - Send message

4. **Test Chat History:**
   - Send 6 messages
   - Refresh page
   - Open chat
   - Should see last 5 conversations only

5. **Test Multi-Language:**
   - Switch app language to Chinese
   - Send message in English
   - Should receive Chinese response

### Verification Checklist

- [ ] Floating button appears on all pages (Feed, Sense, Stance, Union)
- [ ] Button shows X after 2-second hover
- [ ] Sidebar slides in from right (400px width)
- [ ] Provider selector shows all 4 options
- [ ] Gemini works without configuration
- [ ] ChatGPT/Claude/Local require API key
- [ ] Messages save to Firestore
- [ ] Max 5 records enforced
- [ ] Clear history button works
- [ ] All 5 languages display correctly
- [ ] Menu item appears between ACCOUNT and ABOUT US
- [ ] Context includes user political profile

## User Experience Flow

### First-Time User

1. Sees floating chat button (black square with message icon)
2. Clicks button → Sidebar opens
3. Empty state message displayed
4. Types first question
5. Gemini responds (default provider, no setup needed)
6. Message saved to history

### Switching Providers

1. Clicks provider dropdown
2. Sees: Gemini ✓ (active), ChatGPT ⚙️, Claude ⚙️, Local Model ⚙️
3. Selects ChatGPT
4. Configuration panel appears
5. Enters OpenAI API key
6. Sees warning: "Your key is stored locally only"
7. Clicks SAVE
8. ChatGPT now available, dropdown shows ChatGPT ✓
9. Sends message → ChatGPT responds

### Chat History

**Persistence:**
- Survives page refresh
- Survives logout/login
- Synced across devices (Firestore)

**Limits:**
- Maximum 5 conversation pairs
- Oldest auto-deleted when exceeding limit
- Manual clear: Trash button → Confirmation → All cleared

## Performance Considerations

### Lazy Loading
- Chat sidebar only renders when `isOpen === true`
- Provider instances created on-demand
- History loaded only when sidebar opens

### Optimization
- Auto-scroll uses smooth behavior
- Input focus on open for better UX
- Disabled state during API calls
- Error recovery with user-friendly messages

### Rate Limiting
- Client-side: 1 message per request (no batch)
- Relies on provider rate limits
- Loading state prevents multiple simultaneous requests

## Security Best Practices

### API Keys
✅ Gemini: Secret Manager (never exposed)
✅ Others: Memory-only (never persisted)
✅ HTTPS: All API calls encrypted
✅ Warning: Displayed to users about local storage

### Firestore Rules
✅ User-scoped: Only own chat history accessible
✅ Write validation: userId must match auth.uid
✅ No public access: Authentication required

### Context Injection
✅ Safe data: Political coordinates, persona label
❌ No sensitive data: Email, payment info excluded
✅ Prompt injection: User messages sanitized by provider SDKs

## Provider-Specific Details

### Gemini
- Model: gemini-2.5-flash
- Free tier: Yes
- Rate limit: Per Google Cloud quota
- Features: Multi-language, context-aware
- Configuration: Automatic (Secret Manager)

### ChatGPT
- Model: gpt-4o
- Free tier: No (requires paid API key)
- Rate limit: Based on user's OpenAI plan
- API: OpenAI v1
- Configuration: User provides key

### Claude
- Model: claude-3-5-sonnet-20241022
- Free tier: No (requires Anthropic API key)
- Rate limit: Based on user's plan
- API: Anthropic v1 (2023-06-01)
- Configuration: User provides key

### Local Model
- Model: User's choice
- Free: Yes (self-hosted)
- Supports: Ollama, LM Studio, any OpenAI-compatible
- Configuration: User provides endpoint URL

## Error Handling

### Network Errors
- Message: "Failed to get response. Please try again."
- Action: Retry button (send again)
- Provider status: Shows if misconfigured

### API Errors
- Invalid key: "Provider not configured"
- Rate limit: Provider-specific error message
- Timeout: Standard network error

### Firestore Errors
- Load failure: Empty state (no errors shown)
- Save failure: Logged to console (doesn't block UX)
- Delete failure: Silent (user can retry)

## Recent Enhancements (2026-01-22)

### Phase 2 (Completed)
1. **Contextual Highlight Feature** ✅
   - Select text in Feed → "?" icon appears
   - Click → Opens chat with pre-filled context
   - Implementation: Text selection detection in FeedView (selectionchange event)
   - Minimum text length: 10 characters
   - Floating icon positioned at selection end

2. **Message Formatting** ✅
   - Markdown support (bold, italic, code blocks, lists)
   - ChatBubble component renders HTML from formatMarkdown()
   - Sanitizes and converts: `**bold**`, `*italic*`, `` `code` ``, `* lists`

3. **Enhanced Button Control** ✅
   - Floating button hide/show toggle in Settings
   - Persist preference in localStorage
   - X button hides button (not opens chat)
   - Desktop: Hover 2s shows X
   - Mobile: Touch hold 2s shows X

4. **Swipe to Close** ✅
   - Right swipe gesture on sidebar
   - Threshold: 100px
   - Visual feedback with transform
   - Animation < 1 second
   - Mobile-optimized touch handlers

## Future Enhancements

### Phase 3 (Planned)
1. **Advanced Formatting**
   - Syntax highlighting for code blocks
   - Link preview
   - Image embedding

3. **Voice Input**
   - Speech-to-text
   - Text-to-speech for responses

4. **Chat Templates**
   - Quick actions: "Analyze this brand", "Compare entities"
   - One-click prompts

5. **Advanced Context**
   - Include recent news from Feed
   - Include user's action history
   - Reference previous conversations

### Phase 3 (Future)
1. Multi-turn conversations (threads)
2. Export chat history
3. Share conversations
4. RAG integration (search Stanse database)

## Deployment

### Build Process

**Frontend (Cloud Run):**
```bash
gcloud builds submit \
  --config=cloudbuild.yaml \
  --project=gen-lang-client-0960644135
```

**Gemini API Key Injection:**
```yaml
# cloudbuild.yaml
steps:
  - name: gcr.io/cloud-builders/gcloud
    args: ['secrets', 'versions', 'access', 'latest', '--secret=gemini-api-key']

  - name: gcr.io/cloud-builders/docker
    args: ['build', '--build-arg', 'GEMINI_API_KEY=$(cat /workspace/gemini_key.txt)']
```

### Firestore Rules Deployment

```bash
firebase deploy --only firestore:rules --project stanseproject
```

## Related Documentation

- [Gemini API Key Security Audit](../backend/56_gemini_api_key_security_audit_2026_01_22.md)
- [China News Translation & UI Fixes](./19_china_news_translation_and_ui_fixes.md)
- [Enhanced Rankings Integration](./01_enhanced_rankings_integration.md)

## Code References

### Key Components
- [AIChatSidebar.tsx](../../components/ai-chat/AIChatSidebar.tsx) - Main chat UI
- [AIChatFloatingButton.tsx](../../components/ai-chat/AIChatFloatingButton.tsx) - Floating button
- [llmService.ts](../../services/llm/llmService.ts) - Provider factory
- [chatHistoryService.ts](../../services/chatHistoryService.ts) - Firestore operations

### Integration Points
- [App.tsx](../../App.tsx) - Main integration (lines 18-19, 49, 301-316, 389-397)
- [MenuOverlay.tsx](../../components/ui/MenuOverlay.tsx) - Menu item (lines 123-128)
- [LanguageContext.tsx](../../contexts/LanguageContext.tsx) - Translations
- [firestore.rules](../../firestore.rules) - Security rules (lines 489-492)

## Summary

The AI Chat Assistant feature is fully implemented with:
- ✅ Multi-provider support (4 LLM providers)
- ✅ Secure API key management
- ✅ Persistent chat history (max 5 records)
- ✅ Multi-language UI (5 languages)
- ✅ Floating button + Sidebar UI
- ✅ Menu integration
- ✅ Firestore security rules
- ✅ User profile context injection

**Total Lines of Code:** ~1,100 lines
**Total Files:** 16 (11 new, 5 modified)
**Implementation Time:** 2026-01-22
**Status:** Ready for deployment
