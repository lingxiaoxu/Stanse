import { BaseLLMProvider, LLMProviderConfig, LLMResponse } from '../llmProvider';
import { LLMProvider } from '../../../types';

export class ClaudeProvider extends BaseLLMProvider {
  async chat(userMessage: string, context?: string, language?: string): Promise<LLMResponse> {
    if (!this.config.apiKey) {
      return {
        success: false,
        content: '',
        error: 'Claude API key not configured. Please provide your Anthropic API key.',
        provider: LLMProvider.CLAUDE
      };
    }

    try {
      const systemPrompt = context
        ? `You are Claude, a helpful AI assistant. Here is some context about the user:\n${context}`
        : 'You are Claude, a helpful AI assistant.';

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.config.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: this.config.maxTokens || 2048,
          system: systemPrompt,
          messages: [
            {
              role: 'user',
              content: userMessage
            }
          ]
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Anthropic API request failed');
      }

      const data = await response.json();
      const content = data.content?.[0]?.text || 'No response generated';

      return {
        success: true,
        content,
        provider: LLMProvider.CLAUDE
      };
    } catch (error: any) {
      console.error('[ClaudeProvider] Chat error:', error);
      return {
        success: false,
        content: '',
        error: error.message || 'Failed to get response from Claude',
        provider: LLMProvider.CLAUDE
      };
    }
  }

  isConfigured(): boolean {
    return !!this.config.apiKey;
  }
}
