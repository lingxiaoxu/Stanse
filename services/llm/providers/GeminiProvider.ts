import { GoogleGenAI } from "@google/genai";
import { BaseLLMProvider, LLMProviderConfig, LLMResponse } from '../llmProvider';
import { LLMProvider } from '../../../types';

// Get base URL for API proxy in production (same as geminiService)
const getBaseUrl = () => {
  if (typeof window === 'undefined') return undefined;
  if (window.location.hostname === 'localhost') return undefined;
  return `${window.location.origin}/api/gemini`;
};

export class GeminiProvider extends BaseLLMProvider {
  private ai: GoogleGenAI;

  constructor(config: LLMProviderConfig) {
    super(config);

    // Use existing Secret Manager API key pattern from geminiService.ts
    const baseUrl = getBaseUrl();
    const apiKey = process.env.GEMINI_API_KEY || '';

    this.ai = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: baseUrl ? { baseUrl } : undefined
    });
  }

  async chat(userMessage: string, context?: string, language?: string): Promise<LLMResponse> {
    try {
      // Build prompt with context if provided
      let prompt = userMessage;
      if (context) {
        prompt = `Context:\n${context}\n\nUser: ${userMessage}`;
      }

      // Add language instruction if provided
      if (language && language !== 'EN') {
        const languageMap: { [key: string]: string } = {
          'ZH': 'Chinese',
          'JA': 'Japanese',
          'FR': 'French',
          'ES': 'Spanish'
        };
        const langName = languageMap[language] || 'English';
        prompt += `\n\nPlease respond in ${langName}.`;
      }

      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          temperature: this.config.temperature || 0.7,
          maxOutputTokens: this.config.maxTokens || 2048
        }
      });

      return {
        success: true,
        content: response.text || 'No response generated',
        provider: LLMProvider.GEMINI
      };
    } catch (error: any) {
      console.error('[GeminiProvider] Chat error:', error);
      return {
        success: false,
        content: '',
        error: error.message || 'Failed to get response from Gemini',
        provider: LLMProvider.GEMINI
      };
    }
  }

  isConfigured(): boolean {
    return !!process.env.GEMINI_API_KEY;
  }
}
