import { LLMProvider } from '../../types';

export interface LLMProviderConfig {
  apiKey?: string; // API key for the provider (optional for Gemini, required for others)
  endpoint?: string; // Custom endpoint for local models
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
  protected config: LLMProviderConfig;

  constructor(config: LLMProviderConfig) {
    this.config = config;
  }

  /**
   * Send a message to the LLM and get a response
   * @param userMessage The user's message
   * @param context Optional context (user profile, recent history)
   * @param language Optional language code for localized responses
   * @returns LLMResponse with success status, content, and any errors
   */
  abstract chat(
    userMessage: string,
    context?: string,
    language?: string
  ): Promise<LLMResponse>;

  /**
   * Check if the provider is properly configured with required credentials
   * @returns true if configured, false otherwise
   */
  abstract isConfigured(): boolean;
}
