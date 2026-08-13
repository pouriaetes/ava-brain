// AI Provider adapters for Workers AI, Gemini, OpenAI-compatible
// Each provider implements the same interface with provider-specific API calls

// Capabilities that exercise the text/chat path of a provider.
const TEXT_CAPABILITIES = ["chat", "judge", "smart_ai", "routing", "memory_analysis", "personality_optimization", "extract", "news", "summary", "followup"];

// Parse a capabilities value that may already be an array (created by
// AIProviderManager.createAdapter) or a JSON string. Never re-parse an array.
function parseCapabilities(capabilities) {
  if (Array.isArray(capabilities)) return capabilities;
  try {
    const p = JSON.parse(capabilities || "[]");
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}

// Translate the project's simple object schema into Gemini's responseSchema shape.
function toGeminiResponseSchema(schema) {
  const typeMap = { object: "OBJECT", string: "STRING", number: "NUMBER", integer: "INTEGER", boolean: "BOOLEAN", array: "ARRAY" };
  const out = { type: typeMap[schema.type] || "OBJECT" };
  if (schema.type === "object") {
    out.properties = {};
    for (const [key, prop] of Object.entries(schema.properties || {})) {
      const firstType = Array.isArray(prop.type) ? prop.type.find((x) => x !== "null") || "string" : prop.type;
      out.properties[key] = firstType === "object" ? { type: "OBJECT" } : { type: typeMap[firstType] || "STRING" };
    }
    if (Array.isArray(schema.required)) out.required = schema.required;
  }
  return out;
}

// Translate the project's simple object schema into OpenAI's json_schema shape.
function toOpenAISchema(schema) {
  const typeMap = { object: "object", string: "string", number: "number", integer: "integer", boolean: "boolean", array: "array" };
  const out = { type: typeMap[schema.type] || "object", additionalProperties: false };
  if (schema.type === "object") {
    out.properties = {};
    for (const [key, prop] of Object.entries(schema.properties || {})) {
      const firstType = Array.isArray(prop.type) ? prop.type.find((x) => x !== "null") || "string" : prop.type;
      out.properties[key] = firstType === "object" ? { type: "object", additionalProperties: false } : { type: typeMap[firstType] || "string" };
    }
    if (Array.isArray(schema.required)) out.required = schema.required;
  }
  return out;
}

// Flag an error as a structured-output format rejection so the AI manager does not
// count it as a provider health failure (the provider works fine for plain chat;
// it just does not support this response format).
function flagStructuredUnsupported(err) {
  const raw = String(err?.message || "");
  if (/400|response_format|json_schema|not support|does not support|unsupported|invalid_request/i.test(raw)) {
    err.structuredUnsupported = true;
  }
  return err;
}

// Coerce a model response body into plain text. Some models return nested
// {text:...} objects, an error-shaped body, or split output across an array of
// parts; callers then trim()/JSON-parse content, so it must always be a string.
function asContent(raw, depth = 0) {
  if (typeof raw === "string") return raw;
  if (raw == null) return "";
  if (Array.isArray(raw)) return raw.map((p) => asContent(p, depth + 1)).join("");
  if (typeof raw === "object" && depth < 5) {
    for (const key of ["text", "response", "content", "message", "value", "output"]) {
      if (typeof raw[key] === "string") return raw[key];
    }
    for (const key of Object.keys(raw)) {
      const v = raw[key];
      if (v && typeof v === "object") {
        const nested = asContent(v, depth + 1);
        if (nested) return nested;
      }
    }
  }
  return "";
}

// Never leak secrets into health diagnostics.
function sanitizeMessage(raw, apiKey) {
  let s = String(raw || "");
  if (apiKey && s.includes(apiKey)) {
    s = s.split(apiKey).join("[REDACTED]");
  }
  return s.substring(0, 500);
}

// Map a provider error to a clear, human-readable health status.
function classifyProviderError(error, extras = {}) {
  const raw = String(error?.message || error || "");
  const msg = raw.toLowerCase();
  const base = { ...extras, error: sanitizeMessage(raw, extras.apiKey), detail: sanitizeMessage(raw, extras.apiKey) };
  if (/401|403|unauthorized|invalid key|api key|authentication|permission denied/i.test(msg)) {
    return { ...base, status: "auth_error", message: "Authentication error — check the API key" };
  }
  if (/404|not found|no such model|invalid model|does not exist|deprecated|not supported/i.test(msg)) {
    return { ...base, status: "invalid_model", message: "Model not found, deprecated, or invalid" };
  }
  if (/429|quota|rate limit|too many requests|resource_exhausted/i.test(msg)) {
    return { ...base, status: "quota", message: "Rate limit or quota exceeded" };
  }
  if (/timeout|timed out|aborted|deadline/i.test(msg)) {
    return { ...base, status: "timeout", message: "Request timed out" };
  }
  if (/multipart|required properties/i.test(msg)) {
    return { ...base, status: "unsupported_capability", message: "Model input format not supported by this adapter" };
  }
  return { ...base, status: "failed", message: "Provider request failed" };
}

// Build a tiny silent WAV (16-bit PCM mono) used as the minimal valid STT input.
function buildSilentWav(seconds = 0.5, sampleRate = 16000) {
  const numSamples = Math.floor(sampleRate * seconds);
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);
  const writeStr = (offset, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + numSamples * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, numSamples * 2, true);
  return buffer;
}

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
        {
          messages: formattedMessages,
          max_tokens: options.maxTokens || 1024,
          temperature: options.temperature !== undefined ? options.temperature : 0.7
        }
      );
      const responseText = asContent(completion.response || completion.result || "");
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

  async health() {
    const caps = parseCapabilities(this.config.capabilities);
    const lastCheck = (/* @__PURE__ */ new Date()).toISOString();
    const extras = { provider: "workers_ai", last_check: lastCheck, model: this.model };
    try {
      if (!this.ai) {
        return { ...extras, status: "failed", message: "Workers AI binding is not available (no [ai] binding)" };
      }
      if (caps.includes("tts")) {
        const result = await this.speak("OK");
        if (!result || !result.audio_base64) {
          return { ...extras, status: "failed", message: "TTS returned no audio" };
        }
        return { ...extras, status: "healthy", message: "TTS OK" };
      }
      if (caps.includes("image_gen")) {
        const result = await this.generateImage("a tiny red square");
        if (!result || !result.image_base64) {
          return { ...extras, status: "failed", message: "Image generation returned no image" };
        }
        return { ...extras, status: "healthy", message: "Image generation OK" };
      }
      if (caps.includes("stt")) {
        // Minimal valid audio input — exercises the real STT request path.
        await this.transcribe(buildSilentWav(0.5));
        return { ...extras, status: "healthy", message: "STT accepted audio input" };
      }
      // Default: any text/chat-capable provider.
      const result = await this.chat([{ role: "user", content: "Reply with: OK" }], {});
      if (!result || typeof result.content !== "string" || result.content.trim() === "") {
        return { ...extras, status: "failed", message: "Model returned an empty response" };
      }
      return { ...extras, status: "healthy", message: "Chat OK" };
    } catch (error3) {
      return classifyProviderError(error3, extras);
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
      generationConfig: {
        maxOutputTokens: options.maxTokens || 8192,
        temperature: options.temperature !== undefined ? options.temperature : 0.7
      }
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
    if (!response.ok) {
      let errorDetail = "";
      try {
        errorDetail = (await response.text()).substring(0, 500);
      } catch {
      }
      throw new Error(`Gemini API error ${response.status}${errorDetail ? ": " + errorDetail : ""}`);
    }
    const data = await response.json();
    return {
      content: asContent(data.candidates?.[0]?.content?.parts || ""),
      provider: "gemini",
      model: modelName
    };
  }

  supportsStructuredOutput(schema) {
    return !!(schema && typeof schema === "object" && schema.type === "object");
  }

  // Native structured output via Gemini's responseMimeType + responseSchema.
  async structuredOutput(messages, options = {}, schema) {
    if (!this.apiKey) throw new Error("Gemini API key not configured");
    const modelName = this.config.model || "gemini-3.6-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;
    const formattedContents = messages.filter((m) => m.role !== "system").map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content || "" }]
    }));
    const requestBody = {
      contents: formattedContents,
      generationConfig: {
        maxOutputTokens: options.maxTokens || 8192,
        temperature: options.temperature !== undefined ? options.temperature : 0.1,
        responseMimeType: "application/json",
        responseSchema: toGeminiResponseSchema(schema),
      },
    };
    if (options.systemPrompt) {
      requestBody.systemInstruction = { parts: [{ text: options.systemPrompt }] };
    }
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": this.apiKey },
      body: JSON.stringify(requestBody)
    });
    if (!response.ok) {
      let errorDetail = "";
      try { errorDetail = (await response.text()).substring(0, 500); } catch {}
      throw flagStructuredUnsupported(new Error(`Gemini API error ${response.status}${errorDetail ? ": " + errorDetail : ""}`));
    }
    const data = await response.json();
    const content = asContent(data.candidates?.[0]?.content?.parts || "");
    let parsed = null;
    try { parsed = JSON.parse(content); } catch {}
    return {
      content: parsed !== null ? parsed : content,
      provider: "gemini",
      model: modelName
    };
  }

  async health() {
    const lastCheck = (/* @__PURE__ */ new Date()).toISOString();
    const extras = { provider: "gemini", last_check: lastCheck, model: this.config.model };
    if (!this.apiKey) return { ...extras, status: "auth_error", message: "API key missing" };
    if (!this.config.model) return { ...extras, status: "invalid_model", message: "No model configured" };
    try {
      const result = await this.chat([{ role: "user", content: "Reply with: OK" }], {});
      if (!result || typeof result.content !== "string" || result.content.trim() === "") {
        return { ...extras, status: "failed", message: "Model returned an empty response" };
      }
      return { ...extras, status: "healthy", message: "Chat OK" };
    } catch (error) {
      return classifyProviderError(error, { ...extras, apiKey: this.apiKey });
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
        max_tokens: options.maxTokens || 1024,
        temperature: options.temperature !== undefined ? options.temperature : 0.7,
        ...(options.jsonMode ? { response_format: { type: "json_object" } } : {})
      }),
    });

    if (!response.ok) {
      let errorDetail = "";
      try {
        errorDetail = (await response.text()).substring(0, 500);
      } catch {
      }
      throw new Error(`OpenAI-compatible API error ${response.status}${errorDetail ? ": " + errorDetail : ""}`);
    }
    const data = await response.json();
    return {
      content: data.choices?.[0]?.message?.content || "",
      provider: "openai_compatible",
      model: this.config.model,
    };
  }

  supportsStructuredOutput(schema) {
    return !!(schema && typeof schema === "object" && schema.type === "object");
  }

  // Native structured output via response_format json_schema.
  async structuredOutput(messages, options = {}, schema) {
    if (!this.apiKey) throw new Error("OpenAI-compatible API key not configured");
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: this.config.model || "gpt-3.5-turbo",
        messages: options.systemPrompt ? [{ role: "system", content: options.systemPrompt }, ...messages] : messages,
        max_tokens: options.maxTokens || 2048,
        temperature: options.temperature !== undefined ? options.temperature : 0.1,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "structured_output",
            strict: true,
            schema: toOpenAISchema(schema),
          },
        },
      }),
    });
    if (!response.ok) {
      let errorDetail = "";
      try { errorDetail = (await response.text()).substring(0, 500); } catch {}
      throw flagStructuredUnsupported(new Error(`OpenAI-compatible API error ${response.status}${errorDetail ? ": " + errorDetail : ""}`));
    }
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    let parsed = null;
    try { parsed = JSON.parse(content); } catch {}
    return {
      content: parsed !== null ? parsed : content,
      provider: "openai_compatible",
      model: this.config.model,
    };
  }

  async health() {
    const lastCheck = (/* @__PURE__ */ new Date()).toISOString();
    const extras = { provider: "openai_compatible", last_check: lastCheck, model: this.config.model };
    if (!this.apiKey) return { ...extras, status: "auth_error", message: "API key missing" };
    if (!this.config.model) return { ...extras, status: "invalid_model", message: "No model configured" };
    try {
      const result = await this.chat([{ role: "user", content: "Reply with: OK" }], {});
      if (!result || typeof result.content !== "string" || result.content.trim() === "") {
        return { ...extras, status: "failed", message: "Model returned an empty response" };
      }
      return { ...extras, status: "healthy", message: "Chat OK" };
    } catch (error) {
      return classifyProviderError(error, { ...extras, apiKey: this.apiKey });
    }
  }
}

export class TavilyAdapter {
  constructor(config, crypto, logger) {
    this.config = config;
    this.crypto = crypto;
    this.logger = logger;
    this.apiKey = config.apiKey;
  }

  async webSearch(query, options = {}) {
    if (!this.apiKey) throw new Error("Tavily API key not configured");
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: this.apiKey,
        query,
        search_depth: "basic",
        max_results: options.maxResults || 5,
        include_answer: false
      })
    });
    if (!response.ok) {
      let errorDetail = "";
      try {
        errorDetail = (await response.text()).substring(0, 500);
      } catch {
      }
      throw new Error(`Tavily API error ${response.status}${errorDetail ? ": " + errorDetail : ""}`);
    }
    const data = await response.json();
    const results = (data.results || []).map((r) => ({
      title: r.title || "",
      url: r.url || "",
      content: (r.content || "").substring(0, 500)
    }));
    return {
      results,
      provider: "tavily"
    };
  }

  async health() {
    const lastCheck = (/* @__PURE__ */ new Date()).toISOString();
    const extras = { provider: "tavily", last_check: lastCheck };
    if (!this.apiKey) return { ...extras, status: "auth_error", message: "API key missing" };
    try {
      const result = await this.webSearch("test", { maxResults: 1 });
      if (!result || !Array.isArray(result.results)) {
        return { ...extras, status: "failed", message: "Unexpected search response shape" };
      }
      return { ...extras, status: "healthy", message: "Search OK" };
    } catch (error) {
      return classifyProviderError(error, { ...extras, apiKey: this.apiKey });
    }
  }
}