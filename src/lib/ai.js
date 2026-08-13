// AI Provider Manager with fallback, circuit-breaker health monitoring, and
// provider-aware structured output. Uses the ai-providers.js adapters to provide
// a unified interface across providers.

import { WorkersAIAdapter, GeminiAdapter, OpenAICompatibleAdapter, TavilyAdapter } from "./ai-providers.js";
import { orderAvailableProviders, recordSuccess, recordFailure, isCoolingDown } from "./provider-health.js";

export class AIProviderManager {
  constructor(config, crypto, logger, db) {
    this.config = config;
    this.crypto = crypto;
    this.logger = logger;
    this.db = db;
    this.providers = [];
    this.adapters = {};
    this.initialized = false;
    // Read-only observability: per-capability record of which providers were
    // actually attempted and the resulting outcome. Populated by
    // _recordCapabilityAttempt during real calls — never used to drive logic.
    this.lastAttempts = {};
  }

  resetAttempts() {
    this.lastAttempts = {};
  }

  _recordCapabilityAttempt(capabilities, provider, ok, errorMsg) {
    const key = Array.isArray(capabilities) && capabilities.length === 1 ? capabilities[0] : "multi";
    let entry = this.lastAttempts[key];
    if (!entry) {
      entry = this.lastAttempts[key] = { providers: [], ok: false, error: null };
    }
    const name = provider ? String(provider.name || provider.id || provider.kind || "") : "";
    if (name && !entry.providers.includes(name)) entry.providers.push(name);
    if (ok) entry.ok = true;
    if (errorMsg) entry.error = String(errorMsg).substring(0, 300);
  }

  async initialize() {
    try {
      const providers = await this.db.prepare("SELECT * FROM api_providers WHERE enabled = 1 ORDER BY priority ASC").all();
      this.providers = providers.results;

      // OPT-007: pre-parse each provider's capabilities once.
      for (const provider of this.providers) {
        try {
          provider._capabilities = JSON.parse(provider.capabilities || "[]");
        } catch (e) {
          provider._capabilities = [];
        }
      }

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
    const adapterMap = {
      workers_ai: WorkersAIAdapter,
      gemini: GeminiAdapter,
      openai_compatible: OpenAICompatibleAdapter,
      tavily: TavilyAdapter,
    };

    const AdapterClass = adapterMap[provider.kind];
    if (!AdapterClass) {
      throw new Error(`Unknown provider kind: ${provider.kind}`);
    }

    let apiKey = "";
    if (provider.api_key_enc) {
      try {
        apiKey = await this.crypto.decrypt(provider.api_key_enc, this.config.MASTER_KEY);
      } catch (e) {
        await this.logger.warn(this.db, "ai_provider_manager", "decryption_failed", { provider: provider.name });
      }
    }

    const adapterConfig = {
      ...provider,
      AI: this.config.AI,
      timeout_ms: provider.timeout_ms || 30000,
      max_retries: provider.max_retries || 2,
      capabilities: provider._capabilities || JSON.parse(provider.capabilities || "[]"),
      apiKey,
      db: this.db,
      crypto: this.crypto,
      logger: this.logger,
    };

    this.adapters[provider.id] = new AdapterClass(adapterConfig, this.crypto, this.logger);
  }

  // Route an ordered provider list to the front, filtering cooling-down providers.
  _suitableForCapability(capability) {
    const suitable = this.providers.filter((p) => {
      const caps = p._capabilities || [];
      return caps.includes(capability) && p.enabled;
    });
    return orderAvailableProviders(suitable);
  }

  _preferProvider(ordered, preferredProviderId) {
    if (!preferredProviderId) return ordered;
    const preferred = ordered.find((p) => p.id === preferredProviderId);
    if (!preferred) return ordered;
    return [preferred, ...ordered.filter((p) => p.id !== preferredProviderId)];
  }

  async chat(messages, options = {}) {
    if (!this.initialized) {
      throw new Error("AI Provider Manager not initialized");
    }

    const requiredCapabilities = options.capabilities || ["chat"];
    let orderedProviders;
    if (requiredCapabilities.length === 1) {
      orderedProviders = await this.getOrderedProvidersForCapability(requiredCapabilities[0]);
    } else {
      const suitableProviders = this.providers.filter((p) => {
        const caps = p._capabilities || [];
        return requiredCapabilities.every((cap) => caps.includes(cap)) && p.enabled;
      });
      orderedProviders = orderAvailableProviders(suitableProviders);
    }
    orderedProviders = this._preferProvider(orderedProviders, options.preferredProviderId);
    if (orderedProviders.length === 0) {
      throw new Error("No suitable AI providers available for chat");
    }

    for (const provider of orderedProviders) {
      try {
        const adapter = this.adapters[provider.id];
        if (!adapter) continue;

        const useNative = !!(options.jsonSchema && adapter.structuredOutput && adapter.supportsStructuredOutput(options.jsonSchema));
        const result = await this.withTimeout(
          useNative ? adapter.structuredOutput(messages, options, options.jsonSchema) : adapter.chat(messages, options),
          provider.timeout_ms || 30000
        );

        await recordSuccess(this.db, provider.id, requiredCapabilities[0]);
        this._recordCapabilityAttempt(requiredCapabilities, provider, true, null);
        return result;
      } catch (error) {
        await this.logger.error(this.db, "ai_provider_manager", "provider_error", {
          provider: provider.name,
          error: error.message,
        });
        this._recordCapabilityAttempt(requiredCapabilities, provider, false, error.message);
        if (!error.structuredUnsupported) {
          await recordFailure(this.db, provider.id, requiredCapabilities[0], error.message);
        }
        continue;
      }
    }

    this._recordCapabilityAttempt(requiredCapabilities, null, false, "All AI providers failed");
    throw new Error("All AI providers failed");
  }

  async webSearch(query, options = {}) {
    if (!this.initialized) {
      throw new Error("AI Provider Manager not initialized");
    }
    let orderedProviders = this._preferProvider(await this.getOrderedProvidersForCapability("web_search"), options.preferredProviderId);
    if (orderedProviders.length === 0) {
      throw new Error("No suitable AI providers available for web search");
    }
    for (const provider of orderedProviders) {
      try {
        const adapter = this.adapters[provider.id];
        if (!adapter || typeof adapter.webSearch !== "function") continue;
        const result = await this.withTimeout(
          adapter.webSearch(query, options),
          provider.timeout_ms || 3e4
        );
        await recordSuccess(this.db, provider.id, "web_search");
        this._recordCapabilityAttempt(["web_search"], provider, true, null);
        return result;
      } catch (error) {
        await this.logger.error(this.db, "ai_provider_manager", "web_search_error", {
          provider: provider.name,
          error: error.message
        });
        this._recordCapabilityAttempt(["web_search"], provider, false, error.message);
        await recordFailure(this.db, provider.id, "web_search", error.message);
        continue;
      }
    }
    this._recordCapabilityAttempt(["web_search"], null, false, "All AI providers failed for web search");
    throw new Error("All AI providers failed for web search");
  }

  async generateImage(prompt, options = {}) {
    if (!this.initialized) {
      throw new Error("AI Provider Manager not initialized");
    }
    let orderedProviders = this._preferProvider(await this.getOrderedProvidersForCapability("image_gen"), options.preferredProviderId);
    if (orderedProviders.length === 0) {
      throw new Error("No suitable AI providers available for image generation");
    }
    for (const provider of orderedProviders) {
      try {
        const adapter = this.adapters[provider.id];
        if (!adapter || typeof adapter.generateImage !== "function") continue;
        const result = await this.withTimeout(
          adapter.generateImage(prompt, options),
          provider.timeout_ms || 6e4
        );
        await recordSuccess(this.db, provider.id, "image_gen");
        return result;
      } catch (error) {
        await this.logger.error(this.db, "ai_provider_manager", "image_generation_error", {
          provider: provider.name,
          error: error.message
        });
        await recordFailure(this.db, provider.id, "image_gen", error.message);
        continue;
      }
    }
    throw new Error("All AI providers failed for image generation");
  }

  async transcribeAudio(audioArrayBuffer, options = {}) {
    if (!this.initialized) {
      throw new Error("AI Provider Manager not initialized");
    }
    let orderedProviders = this._preferProvider(await this.getOrderedProvidersForCapability("stt"), options.preferredProviderId);
    if (orderedProviders.length === 0) {
      throw new Error("No suitable AI providers available for speech-to-text");
    }
    for (const provider of orderedProviders) {
      try {
        const adapter = this.adapters[provider.id];
        if (!adapter || typeof adapter.transcribe !== "function") continue;
        const result = await this.withTimeout(
          adapter.transcribe(audioArrayBuffer, options),
          provider.timeout_ms || 6e4
        );
        await recordSuccess(this.db, provider.id, "stt");
        return result;
      } catch (error) {
        await this.logger.error(this.db, "ai_provider_manager", "transcription_error", {
          provider: provider.name,
          error: error.message
        });
        await recordFailure(this.db, provider.id, "stt", error.message);
        continue;
      }
    }
    throw new Error("All AI providers failed for speech-to-text");
  }

  async textToSpeech(text, options = {}) {
    if (!this.initialized) {
      throw new Error("AI Provider Manager not initialized");
    }
    let orderedProviders = this._preferProvider(await this.getOrderedProvidersForCapability("tts"), options.preferredProviderId);
    if (orderedProviders.length === 0) {
      throw new Error("No suitable AI providers available for text-to-speech");
    }
    for (const provider of orderedProviders) {
      try {
        const adapter = this.adapters[provider.id];
        if (!adapter || typeof adapter.speak !== "function") continue;
        const result = await this.withTimeout(
          adapter.speak(text, options),
          provider.timeout_ms || 6e4
        );
        await recordSuccess(this.db, provider.id, "tts");
        return result;
      } catch (error) {
        await this.logger.error(this.db, "ai_provider_manager", "tts_error", {
          provider: provider.name,
          error: error.message
        });
        await recordFailure(this.db, provider.id, "tts", error.message);
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

  // Run a real minimal capability test for a single provider (admin Health Test).
  async testProvider(providerId) {
    const provider = await this.db.prepare("SELECT * FROM api_providers WHERE id = ?").bind(providerId).first();
    if (!provider) {
      return { status: "not_found", message: "Provider not found", providerId, checkedAt: new Date().toISOString() };
    }
    if (!this.initialized) {
      await this.initialize();
    }
    if (!this.adapters[provider.id]) {
      try {
        await this.createAdapter(provider);
      } catch (adapterError) {
        return {
          status: "failed",
          message: `Adapter init failed: ${adapterError.message}`,
          provider: provider.kind,
          providerId,
          model: provider.model,
          checkedAt: new Date().toISOString(),
        };
      }
    }
    const adapter = this.adapters[provider.id];
    if (!adapter || typeof adapter.health !== "function") {
      return {
        status: "unsupported_capability",
        message: "No health test available for this provider kind",
        provider: provider.kind,
        providerId,
        model: provider.model,
        checkedAt: new Date().toISOString(),
      };
    }
    const timeoutMs = provider.timeout_ms || 30000;
    try {
      const health = await this.withTimeout(adapter.health(), timeoutMs);
      // A successful manual probe clears any circuit-breaker cooldown.
      if (health.status === "healthy") {
        await recordSuccess(this.db, providerId, "chat");
      }
      return { ...health, providerId, provider: provider.kind, model: provider.model, checkedAt: new Date().toISOString() };
    } catch (error) {
      const msg = String(error?.message || error || "");
      if (/timeout|timed out|aborted/i.test(msg)) {
        return {
          status: "timeout",
          message: `Request timed out after ${timeoutMs}ms`,
          provider: provider.kind,
          providerId,
          model: provider.model,
          checkedAt: new Date().toISOString(),
        };
      }
      return {
        status: "failed",
        message: msg || "Provider request failed",
        provider: provider.kind,
        providerId,
        model: provider.model,
        checkedAt: new Date().toISOString(),
      };
    }
  }

  async withTimeout(promise, timeoutMs) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await Promise.race([
        promise,
        new Promise((_, reject) => {
          controller.signal.addEventListener("abort", () => {
            reject(new Error(`Timeout after ${timeoutMs}ms`));
          });
        })
      ]);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async getOrderedProvidersForCapability(capability) {
    try {
      const rows = (await this.db.prepare(
        "SELECT cp.provider_id, cp.priority FROM capability_priorities cp WHERE cp.capability = ? AND cp.enabled = 1 ORDER BY cp.priority ASC"
      ).bind(capability).all()).results || [];
      if (rows.length > 0) {
        const ordered = [];
        for (const row of rows) {
          const provider = this.providers.find((p) => p.id === row.provider_id && p.enabled);
          if (provider) ordered.push(provider);
        }
        const available = ordered.filter((p) => !isCoolingDown(p));
        if (available.length > 0) return available;
      }
    } catch (error) {
      try {
        await this.logger.warn(this.db, "ai_provider_manager", "capability_priorities_lookup_failed", { capability, error: String((error && error.message) || error) });
      } catch (logErr) {}
    }
    return this._suitableForCapability(capability);
  }

  // Whether any configured provider can produce native structured output for the
  // given schema (used by chatJson to decide whether to attempt the native path).
  supportsStructuredOutput(schema) {
    if (!schema) return false;
    return this.providers.some((p) => {
      const adapter = this.adapters[p.id];
      return adapter && typeof adapter.supportsStructuredOutput === "function" && adapter.supportsStructuredOutput(schema);
    });
  }

  getProviders() {
    return this.providers;
  }

  getAdapters() {
    return this.adapters;
  }
}
