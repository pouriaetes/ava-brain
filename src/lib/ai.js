// AI Provider Manager with fallback, health monitoring, and timeout handling
// Uses the ai-providers.js adapters to provide unified interface across providers

import { WorkersAIAdapter, GeminiAdapter, OpenAICompatibleAdapter } from "./ai-providers.js";

export class AIProviderManager {
  constructor(config, crypto, logger, db) {
    this.config = config;
    this.crypto = crypto;
    this.logger = logger;
    this.db = db;
    this.providers = [];
    this.adapters = {};
    this.initialized = false;
  }

  async initialize() {
    try {
      // Load providers from database
      const providers = await this.db.prepare("SELECT * FROM api_providers WHERE enabled = 1 ORDER BY priority ASC").all();
      this.providers = providers.results;

      // Create adapters for each provider
      for (const provider of this.providers) {
        await this.createAdapter(provider);
      }

      this.initialized = true;
      await this.logger.info(this.db, "ai_provider_manager", "initialized", { providerCount: this.providers.length });
    } catch (error) {
      await this.logger.error(this.db, "ai_provider_manager", "initialization_failed", { error: error.message });
      throw error;
    }
  }

  async createAdapter(provider) {
    const { kind } = provider;
    const adapterMap = {
      workers_ai: WorkersAIAdapter,
      gemini: GeminiAdapter,
      openai_compatible: OpenAICompatibleAdapter,
    };

    const AdapterClass = adapterMap[kind];
    if (!AdapterClass) {
      throw new Error(`Unknown provider kind: ${kind}`);
    }

    // Decrypt API key if present
    let apiKey = "";
    if (provider.api_key_enc) {
      try {
        apiKey = await this.crypto.decrypt(provider.api_key_enc, this.config.MASTER_KEY);
      } catch (e) {
        await this.logger.warn(this.db, "ai_provider_manager", "decryption_failed", { provider: provider.name });
      }
    }

    // Prepare adapter config
    const adapterConfig = {
      ...provider,
      AI: this.config.AI,
      timeout_ms: provider.timeout_ms || 30000,
      max_retries: provider.max_retries || 2,
      capabilities: JSON.parse(provider.capabilities || "[]"),
      apiKey,
      db: this.db,
      crypto: this.crypto,
      logger: this.logger,
    };

    this.adapters[provider.id] = new AdapterClass(adapterConfig, this.crypto, this.logger);
  }

  async chat(messages, options = {}) {
    if (!this.initialized) {
      throw new Error("AI Provider Manager not initialized");
    }

    const requiredCapabilities = options.capabilities || ["chat"];
    const suitableProviders = this.providers.filter((p) => {
      const caps = JSON.parse(p.capabilities || "[]");
      return requiredCapabilities.every((cap) => caps.includes(cap)) && p.enabled;
    });

    if (suitableProviders.length === 0) {
      throw new Error("No suitable AI providers available for chat");
    }

    const orderedProviders = suitableProviders.sort((a, b) => a.priority - b.priority);

    for (const provider of orderedProviders) {
      try {
        const adapter = this.adapters[provider.id];
        if (!adapter) continue;

        // Try with timeout
        const result = await this.withTimeout(
          adapter.chat(messages, options),
          provider.timeout_ms || 30000
        );

        // Update health on success
        await this.updateProviderHealth(provider.id, { status: "healthy", last_success: Date.now() });
        return result;

      } catch (error) {
        await this.logger.error(this.db, "ai_provider_manager", "provider_error", {
          provider: provider.name,
          error: error.message,
        });

        // Update health on failure
        await this.updateProviderHealth(provider.id, {
          status: "unhealthy",
          last_error: error.message,
          failing_since: Date.now(),
        });

        // Continue to next provider
        continue;
      }
    }

    throw new Error("All AI providers failed");
  }

  async extract(text, task, options = {}) {
    if (!this.initialized) {
      throw new Error("AI Provider Manager not initialized");
    }

    const suitableProviders = this.providers.filter(p => {
      const caps = JSON.parse(p.capabilities || "[]");
      return caps.includes("extract") && p.enabled;
    });

    for (const provider of suitableProviders) {
      try {
        const adapter = this.adapters[provider.id];
        if (!adapter) continue;

        const result = await this.withTimeout(
          adapter.extract(text, task, options),
          provider.timeout_ms || 30000
        );

        await this.updateProviderHealth(provider.id, { status: "healthy", last_success: Date.now() });
        return result;

      } catch (error) {
        await this.logger.error(this.db, "ai_provider_manager", "extract_error", {
          provider: provider.name,
          error: error.message,
        });
        continue;
      }
    }

    throw new Error("All AI providers failed for extraction");
  }

  async summarize(text, options = {}) {
    if (!this.initialized) {
      throw new Error("AI Provider Manager not initialized");
    }

    const suitableProviders = this.providers.filter(p => {
      const caps = JSON.parse(p.capabilities || "[]");
      return caps.includes("summary") && p.enabled;
    });

    for (const provider of suitableProviders) {
      try {
        const adapter = this.adapters[provider.id];
        if (!adapter) continue;

        const result = await this.withTimeout(
          adapter.summarize(text, options),
          provider.timeout_ms || 30000
        );

        await this.updateProviderHealth(provider.id, { status: "healthy", last_success: Date.now() });
        return result;

      } catch (error) {
        await this.logger.error(this.db, "ai_provider_manager", "summarize_error", {
          provider: provider.name,
          error: error.message,
        });
        continue;
      }
    }

    throw new Error("All AI providers failed for summarization");
  }

  async news(rssUrls, options = {}) {
    if (!this.initialized) {
      throw new Error("AI Provider Manager not initialized");
    }

    const suitableProviders = this.providers.filter(p => {
      const caps = JSON.parse(p.capabilities || "[]");
      return caps.includes("news") && p.enabled;
    });

    for (const provider of suitableProviders) {
      try {
        const adapter = this.adapters[provider.id];
        if (!adapter) continue;

        const result = await this.withTimeout(
          adapter.news(rssUrls, options),
          provider.timeout_ms || 30000
        );

        await this.updateProviderHealth(provider.id, { status: "healthy", last_success: Date.now() });
        return result;

      } catch (error) {
        await this.logger.error(this.db, "ai_provider_manager", "news_error", {
          provider: provider.name,
          error: error.message,
        });
        continue;
      }
    }

    throw new Error("All AI providers failed for news");
  }

  async followupResponse(context, options = {}) {
    if (!this.initialized) {
      throw new Error("AI Provider Manager not initialized");
    }

    const suitableProviders = this.providers.filter(p => {
      const caps = JSON.parse(p.capabilities || "[]");
      return caps.includes("followup") && p.enabled;
    });

    for (const provider of suitableProviders) {
      try {
        const adapter = this.adapters[provider.id];
        if (!adapter) continue;

        const result = await this.withTimeout(
          adapter.followupResponse(context, options),
          provider.timeout_ms || 30000
        );

        await this.updateProviderHealth(provider.id, { status: "healthy", last_success: Date.now() });
        return result;

      } catch (error) {
        await this.logger.error(this.db, "ai_provider_manager", "followup_error", {
          provider: provider.name,
          error: error.message,
        });
        continue;
      }
    }

    throw new Error("All AI providers failed for followup");
  }

  async generateImage(prompt, options = {}) {
    if (!this.initialized) {
      throw new Error("AI Provider Manager not initialized");
    }
    const suitableProviders = this.providers.filter((p) => {
      const caps = JSON.parse(p.capabilities || "[]");
      return caps.includes("image_gen") && p.enabled;
    });
    if (suitableProviders.length === 0) {
      throw new Error("No suitable AI providers available for image generation");
    }
    const orderedProviders = suitableProviders.sort((a, b) => a.priority - b.priority);
    for (const provider of orderedProviders) {
      try {
        const adapter = this.adapters[provider.id];
        if (!adapter || typeof adapter.generateImage !== "function") continue;
        const result = await this.withTimeout(
          adapter.generateImage(prompt, options),
          provider.timeout_ms || 6e4
        );
        await this.updateProviderHealth(provider.id, { status: "healthy", last_success: Date.now() });
        return result;
      } catch (error) {
        await this.logger.error(this.db, "ai_provider_manager", "image_generation_error", {
          provider: provider.name,
          error: error.message
        });
        continue;
      }
    }
    throw new Error("All AI providers failed for image generation");
  }

  async transcribeAudio(audioArrayBuffer, options = {}) {
    if (!this.initialized) {
      throw new Error("AI Provider Manager not initialized");
    }
    const suitableProviders = this.providers.filter((p) => {
      const caps = JSON.parse(p.capabilities || "[]");
      return caps.includes("stt") && p.enabled;
    });
    if (suitableProviders.length === 0) {
      throw new Error("No suitable AI providers available for speech-to-text");
    }
    const orderedProviders = suitableProviders.sort((a, b) => a.priority - b.priority);
    for (const provider of orderedProviders) {
      try {
        const adapter = this.adapters[provider.id];
        if (!adapter || typeof adapter.transcribe !== "function") continue;
        const result = await this.withTimeout(
          adapter.transcribe(audioArrayBuffer, options),
          provider.timeout_ms || 6e4
        );
        await this.updateProviderHealth(provider.id, { status: "healthy", last_success: Date.now() });
        return result;
      } catch (error) {
        await this.logger.error(this.db, "ai_provider_manager", "transcription_error", {
          provider: provider.name,
          error: error.message
        });
        continue;
      }
    }
    throw new Error("All AI providers failed for speech-to-text");
  }

  async textToSpeech(text, options = {}) {
    if (!this.initialized) {
      throw new Error("AI Provider Manager not initialized");
    }
    const suitableProviders = this.providers.filter((p) => {
      const caps = JSON.parse(p.capabilities || "[]");
      return caps.includes("tts") && p.enabled;
    });
    if (suitableProviders.length === 0) {
      throw new Error("No suitable AI providers available for text-to-speech");
    }
    const orderedProviders = suitableProviders.sort((a, b) => a.priority - b.priority);
    for (const provider of orderedProviders) {
      try {
        const adapter = this.adapters[provider.id];
        if (!adapter || typeof adapter.speak !== "function") continue;
        const result = await this.withTimeout(
          adapter.speak(text, options),
          provider.timeout_ms || 6e4
        );
        await this.updateProviderHealth(provider.id, { status: "healthy", last_success: Date.now() });
        return result;
      } catch (error) {
        await this.logger.error(this.db, "ai_provider_manager", "tts_error", {
          provider: provider.name,
          error: error.message
        });
        continue;
      }
    }
    throw new Error("All AI providers failed for text-to-speech");
  }

  async getAllHealth() {
    const healthResults = {};
    for (const provider of this.providers) {
      try {
        const adapter = this.adapters[provider.id];
        if (adapter && typeof adapter.health === "function") {
          healthResults[provider.id] = await adapter.health();
        } else {
          healthResults[provider.id] = {
            status: "no_adapter",
            provider: provider.name,
            last_check: new Date().toISOString(),
          };
        }
      } catch (error) {
        healthResults[provider.id] = {
          status: "error",
          error: error.message,
          provider: provider.name,
          last_check: new Date().toISOString(),
        };
      }
    }
    return healthResults;
  }

  async updateProviderHealth(providerId, healthData) {
    try {
      const existing = await this.db.prepare("SELECT health_json FROM api_providers WHERE id = ?").bind(providerId).first();
      const currentHealth = existing?.health_json ? JSON.parse(existing.health_json) : {};

      const updatedHealth = {
        ...currentHealth,
        ...healthData,
        last_check: new Date().toISOString(),
      };

      await this.db
        .prepare("UPDATE api_providers SET health_json = ?, updated_at = datetime('now') WHERE id = ?")
        .bind(JSON.stringify(updatedHealth), providerId)
        .run();
    } catch (error) {
      await this.logger.error(this.db, "ai_provider_manager", "health_update_failed", {
        providerId,
        error: error.message,
      });
    }
  }

  async withTimeout(promise, timeoutMs) {
    const timeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs);
    });

    return Promise.race([promise, timeout]);
  }

  getProviders() {
    return this.providers;
  }

  getAdapters() {
    return this.adapters;
  }

  async cleanupFailedProviders() {
    const now = Date.now();
    const cooldownMinutes = 30;

    for (const provider of this.providers) {
      const health = provider.health_json ? JSON.parse(provider.health_json) : {};
      if (health.status === "unhealthy" && health.failing_since) {
        const minutesSinceFail = (now - health.failing_since) / 60000;
        if (minutesSinceFail > cooldownMinutes) {
          await this.updateProviderHealth(provider.id, { status: "healthy" });
        }
      }
    }
  }
}