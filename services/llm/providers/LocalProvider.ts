import { BaseLLMProvider, LLMProviderConfig, LLMResponse } from '../llmProvider';
import { LLMProvider } from '../../../types';

export class LocalProvider extends BaseLLMProvider {
  async chat(userMessage: string, context?: string, language?: string): Promise<LLMResponse> {
    if (!this.config.endpoint) {
      return {
        success: false,
        content: '',
        error: 'Local model endpoint not configured. Please provide your API endpoint URL.',
        provider: LLMProvider.LOCAL
      };
    }

    try {
      // Support OpenAI-compatible endpoint format
      const messages: any[] = [];

      if (context) {
        messages.push({
          role: 'system',
          content: context
        });
      }

      messages.push({
        role: 'user',
        content: userMessage
      });

      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` })
        },
        body: JSON.stringify({
          messages: messages,
          temperature: this.config.temperature || 0.7,
          max_tokens: this.config.maxTokens || 2048
        })
      });

      if (!response.ok) {
        throw new Error(`Local model API request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      // Try to extract content from various response formats
      let content = '';
      if (data.choices && data.choices[0]?.message?.content) {
        // OpenAI-compatible format
        content = data.choices[0].message.content;
      } else if (data.response) {
        // Ollama format
        content = data.response;
      } else if (data.content) {
        // Direct content field
        content = data.content;
      } else {
        content = JSON.stringify(data);
      }

      return {
        success: true,
        content,
        provider: LLMProvider.LOCAL
      };
    } catch (error: any) {
      console.error('[LocalProvider] Chat error:', error);
      return {
        success: false,
        content: '',
        error: error.message || 'Failed to get response from local model',
        provider: LLMProvider.LOCAL
      };
    }
  }

  isConfigured(): boolean {
    return !!this.config.endpoint;
  }
}
