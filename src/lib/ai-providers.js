// AI Provider adapters for Workers AI, Gemini, OpenAI-compatible
// Each provider implements the same interface with provider-specific API calls

export class WorkersAIAdapter {
  constructor(config, crypto, logger) {
    this.config = config;
    this.crypto = crypto;
    this.logger = logger;
    this.ai = config.AI;
    this.model = config.model || "@cf/meta/llama-3.1-8b-instruct";
    this.timeout = config.timeout_ms || 30000;
  }

  async chat(messages, options = {}) {
    try {
      const systemPrompt = options.systemPrompt || "You are Ava, a helpful assistant.";
      const formattedMessages = [
        { role: "system", content: systemPrompt },
        ...messages.filter((m) => m.role !== "system").map((m) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content || ""
        }))
      ];
      const completion = await this.ai.run(
        this.model,
        { messages: formattedMessages, max_tokens: 1024, temperature: 0.7 }
      );
      const responseText = completion.response || completion.result || "";
      return {
        content: responseText,
        provider: "workers_ai",
        model: this.model
      };
    } catch (error) {
      if (this.logger?.error) this.logger.error(this.config.db, "ai_providers", "workers_ai_error", { error: error.message });
      throw error;
    }
  }

  async extract(text, task, options = {}) {
    const prompt = `Extract ${task} from this text: ${text}\n\nReturn JSON only.`;
    const result = await this.ai.run(
      this.model,
      { prompt, max_tokens: 1024 }
    );

    try {
      const jsonStr = result.result.trim();
      const jsonStart = jsonStr.indexOf("{");
      const jsonEnd = jsonStr.lastIndexOf("}");
      if (jsonStart !== -1 && jsonEnd !== -1) {
        return JSON.parse(jsonStr.substring(jsonStart, jsonEnd + 1));
      }
      return { extracted: text, task };
    } catch (e) {
      return { extracted: text, task, error: e.message };
    }
  }

  async summarize(text, options = {}) {
    const prompt = `Summarize this text in 3-5 sentences:\n\n${text}`;
    const result = await this.ai.run(
      this.model,
      { prompt, max_tokens: 1024 }
    );

    return {
      summary: result.result || "",
      original: text.substring(0, 200) + "...",
      provider: "workers_ai",
    };
  }

  async news(rssUrls, options = {}) {
    const prompt = `Given these RSS feed sources, provide a concise news summary:\n\n${rssUrls.map(content => `- ${content.substring(0, 300)}`).join("\n")}`;
    const result = await this.ai.run(
      this.model,
      { prompt, max_tokens: 1024 }
    );

    return {
      summary: result.result || "",
      articles: rssUrls,
      provider: "workers_ai",
    };
  }

  async followupResponse(context, options = {}) {
    const prompt = `Given this project context: ${context}, provide a natural, helpful followup response as Ava.`;
    const result = await this.ai.run(
      this.model,
      { prompt, max_tokens: 1024 }
    );

    return {
      response: result.result || "",
      provider: "workers_ai",
    };
  }

  async health() {
    try {
      await this.ai.run(this.model, { messages: [{ role: "user", content: "test" }], max_tokens: 1 });
      return {
        status: "healthy",
        last_check: (/* @__PURE__ */ new Date()).toISOString(),
        provider: "workers_ai"
      };
    } catch (error) {
      return {
        status: "unhealthy",
        error: error.message,
        last_check: (/* @__PURE__ */ new Date()).toISOString(),
        provider: "workers_ai"
      };
    }
  }
  async generateImage(prompt, options = {}) {
    if (!this.ai) {
      throw new Error('Workers AI binding not available. Ensure [ai] binding = "AI" exists in wrangler.toml');
    }
    try {
      const result = await this.ai.run(this.model, { prompt });
      let imageBase64 = "";
      if (result && typeof result.image === "string") {
        imageBase64 = result.image;
      } else if (result instanceof ArrayBuffer) {
        imageBase64 = btoa(String.fromCharCode(...new Uint8Array(result)));
      } else if (result instanceof Uint8Array) {
        imageBase64 = btoa(String.fromCharCode(...result));
      } else if (result && typeof result.response === "string") {
        imageBase64 = result.response;
      }
      if (!imageBase64) {
        throw new Error("Workers AI image model returned an unrecognized response shape");
      }
      return {
        image_base64: imageBase64,
        provider: "workers_ai",
        model: this.model
      };
    } catch (error) {
      if (this.logger?.error) this.logger.error(this.config.db, "ai_providers", "workers_ai_image_error", { error: error.message });
      throw error;
    }
  }
  async transcribe(audioArrayBuffer, options = {}) {
    if (!this.ai) {
      throw new Error('Workers AI binding not available. Ensure [ai] binding = "AI" exists in wrangler.toml');
    }
    try {
      const audioArray = Array.from(new Uint8Array(audioArrayBuffer));
      const result = await this.ai.run(this.model, { audio: audioArray });
      const text = result?.text || result?.response || "";
      return {
        text,
        provider: "workers_ai",
        model: this.model
      };
    } catch (error) {
      if (this.logger?.error) this.logger.error(this.config.db, "ai_providers", "workers_ai_stt_error", { error: error.message });
      throw error;
    }
  }
  async speak(text, options = {}) {
    if (!this.ai) {
      throw new Error('Workers AI binding not available. Ensure [ai] binding = "AI" exists in wrangler.toml');
    }
    try {
      const result = await this.ai.run(this.model, { prompt: text, lang: options.lang || "en" });
      let audioBase64 = "";
      if (result && typeof result.audio === "string") {
        audioBase64 = result.audio;
      } else if (result instanceof ArrayBuffer) {
        audioBase64 = btoa(String.fromCharCode(...new Uint8Array(result)));
      } else if (result instanceof Uint8Array) {
        audioBase64 = btoa(String.fromCharCode(...result));
      } else if (result && typeof result.response === "string") {
        audioBase64 = result.response;
      }
      if (!audioBase64) {
        throw new Error("Workers AI TTS model returned an unrecognized response shape");
      }
      return {
        audio_base64: audioBase64,
        provider: "workers_ai",
        model: this.model
      };
    } catch (error) {
      if (this.logger?.error) this.logger.error(this.config.db, "ai_providers", "workers_ai_tts_error", { error: error.message });
      throw error;
    }
  }
}

export class GeminiAdapter {
  constructor(config, crypto, logger) {
    this.config = config;
    this.crypto = crypto;
    this.logger = logger;
    this.apiKey = config.apiKey;
  }

  async chat(messages, options = {}) {
    if (!this.apiKey) throw new Error("Gemini API key not configured");
    const modelName = this.config.model || "gemini-3.6-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;
    const formattedContents = messages.filter((m) => m.role !== "system").map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content || "" }]
    }));
    const requestBody = {
      contents: formattedContents,
      generationConfig: { maxOutputTokens: 1024 }
    };
    if (options.systemPrompt) {
      requestBody.systemInstruction = { parts: [{ text: options.systemPrompt }] };
    }
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": this.apiKey
      },
      body: JSON.stringify(requestBody)
    });
    if (!response.ok) throw new Error(`Gemini API error ${response.status}`);
    const data = await response.json();
    return {
      content: data.candidates?.[0]?.content?.parts?.[0]?.text || "",
      provider: "gemini",
      model: modelName
    };
  }

  async health() {
    if (!this.apiKey) return { status: "unavailable", error: "API key missing", provider: "gemini" };
    try {
      await this.chat([{ role: "user", content: "test" }], {});
      return { status: "healthy", provider: "gemini" };
    } catch (error) {
      return { status: "unhealthy", error: error.message, provider: "gemini" };
    }
  }
}

export class OpenAICompatibleAdapter {
  constructor(config, crypto, logger) {
    this.config = config;
    this.crypto = crypto;
    this.logger = logger;
    this.apiKey = config.apiKey;
    this.baseUrl = (config.base_url || "https://api.openai.com/v1").replace(/\/$/, "");
  }

  async chat(messages, options = {}) {
    if (!this.apiKey) throw new Error("OpenAI-compatible API key not configured");
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model || "gpt-3.5-turbo",
        messages: options.systemPrompt ? [{ role: "system", content: options.systemPrompt }, ...messages] : messages,
        max_tokens: 1024,
        temperature: 0.7,
      }),
    });

    if (!response.ok) throw new Error(`OpenAI-compatible API error ${response.status}`);
    const data = await response.json();
    return {
      content: data.choices?.[0]?.message?.content || "",
      provider: "openai_compatible",
      model: this.config.model,
    };
  }

  async health() {
    if (!this.apiKey) return { status: "unavailable", error: "API key missing", provider: "openai_compatible" };
    try {
      await this.chat([{ role: "user", content: "test" }], {});
      return { status: "healthy", provider: "openai_compatible" };
    } catch (error) {
      return { status: "unhealthy", error: error.message, provider: "openai_compatible" };
    }
  }
}