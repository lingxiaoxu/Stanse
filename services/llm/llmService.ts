import { LLMProvider } from '../../types';
import { BaseLLMProvider, LLMResponse, LLMProviderConfig } from './llmProvider';
import { GeminiProvider } from './providers/GeminiProvider';
import { ChatGPTProvider } from './providers/ChatGPTProvider';
import { ClaudeProvider } from './providers/ClaudeProvider';
import { LocalProvider } from './providers/LocalProvider';

export class LLMService {
  private providers: Map<LLMProvider, BaseLLMProvider>;
  private activeProvider: LLMProvider;
  private providerConfigs: Map<LLMProvider, LLMProviderConfig>;

  constructor() {
    this.providers = new Map();
    this.providerConfigs = new Map();
    this.activeProvider = LLMProvider.GEMINI; // Default
    this.initializeProviders();
  }

  private initializeProviders() {
    // Gemini is always available via Secret Manager
    this.providers.set(
      LLMProvider.GEMINI,
      new GeminiProvider({})
    );
    this.providerConfigs.set(LLMProvider.GEMINI, {});
  }

  /**
   * Set the active provider and optionally configure it with API key/endpoint
   * @param provider The provider to activate
   * @param apiKey API key for the provider (or endpoint for local model)
   * @param temperature Optional temperature setting
   * @param maxTokens Optional max tokens setting
   */
  setProvider(
    provider: LLMProvider,
    apiKey?: string,
    temperature?: number,
    maxTokens?: number
  ) {
    const config: LLMProviderConfig = {
      apiKey,
      endpoint: provider === LLMProvider.LOCAL ? apiKey : undefined, // For local, apiKey is the endpoint
      temperature,
      maxTokens
    };

    this.providerConfigs.set(provider, config);

    // Create provider instance with config
    switch (provider) {
      case LLMProvider.GEMINI:
        // Gemini already initialized, just update config if needed
        if (temperature || maxTokens) {
          this.providers.set(provider, new GeminiProvider(config));
        }
        break;
      case LLMProvider.CHATGPT:
        this.providers.set(provider, new ChatGPTProvider(config));
        break;
      case LLMProvider.CLAUDE:
        this.providers.set(provider, new ClaudeProvider(config));
        break;
      case LLMProvider.LOCAL:
        this.providers.set(provider, new LocalProvider(config));
        break;
    }

    this.activeProvider = provider;
  }

  /**
   * Send a message to the active LLM provider
   * @param message User's message
   * @param context Optional context (user profile, conversation history)
   * @param language Optional language code for response
   * @returns LLMResponse with success status and content
   */
  async chat(message: string, context?: string, language?: string): Promise<LLMResponse> {
    const provider = this.providers.get(this.activeProvider);

    if (!provider) {
      return {
        success: false,
        content: '',
        error: `Provider ${this.activeProvider} not initialized`,
        provider: this.activeProvider
      };
    }

    if (!provider.isConfigured()) {
      return {
        success: false,
        content: '',
        error: `Provider ${this.activeProvider} is not configured. Please provide an API key.`,
        provider: this.activeProvider
      };
    }

    return provider.chat(message, context, language);
  }

  /**
   * Get the currently active provider
   */
  getActiveProvider(): LLMProvider {
    return this.activeProvider;
  }

  /**
   * Check if a specific provider is configured and ready to use
   * @param provider The provider to check
   */
  isProviderConfigured(provider: LLMProvider): boolean {
    const p = this.providers.get(provider);
    return p ? p.isConfigured() : false;
  }

  /**
   * Get the configuration for a specific provider
   * @param provider The provider to get config for
   */
  getProviderConfig(provider: LLMProvider): LLMProviderConfig | undefined {
    return this.providerConfigs.get(provider);
  }
}

// Singleton instance
export const llmService = new LLMService();
