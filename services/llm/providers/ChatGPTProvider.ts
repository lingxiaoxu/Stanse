import { BaseLLMProvider, LLMProviderConfig, LLMResponse } from '../llmProvider';
import { LLMProvider } from '../../../types';

export class ChatGPTProvider extends BaseLLMProvider {
  async chat(userMessage: string, context?: string, language?: string): Promise<LLMResponse> {
    if (!this.config.apiKey) {
      return {
        success: false,
        content: '',
        error: 'ChatGPT API key not configured. Please provide your OpenAI API key.',
        provider: LLMProvider.CHATGPT
      };
    }

    try {
      const messages: any[] = [];

      // Add system message with context
      if (context) {
        messages.push({
          role: 'system',
          content: `You are a helpful assistant. Here is some context about the user:\n${context}`
        });
      } else {
        messages.push({
          role: 'system',
          content: 'You are a helpful assistant.'
        });
      }

      // Add user message
      messages.push({
        role: 'user',
        content: userMessage
      });

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: messages,
          temperature: this.config.temperature || 0.7,
          max_tokens: this.config.maxTokens || 2048
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'OpenAI API request failed');
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || 'No response generated';

      return {
        success: true,
        content,
        provider: LLMProvider.CHATGPT
      };
    } catch (error: any) {
      console.error('[ChatGPTProvider] Chat error:', error);
      return {
        success: false,
        content: '',
        error: error.message || 'Failed to get response from ChatGPT',
        provider: LLMProvider.CHATGPT
      };
    }
  }

  isConfigured(): boolean {
    return !!this.config.apiKey;
  }
}
