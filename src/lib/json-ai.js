// Shared helpers for getting a reliable JSON reply out of a model. Every place
// that needs structured output (Judge, decision system, fact extraction) uses
// these so the "model returned prose instead of JSON" handling is fixed once,
// centrally.
//
// Strategy (provider-aware):
//   1. When a schema is supplied and the chosen provider supports native
//      structured output (Gemini responseSchema, OpenAI-compatible json_schema),
//      ask the model for schema-valid JSON directly.
//   2. Otherwise (Workers AI, or providers without native support, or a native
//      failure) fall back to the classic "return JSON only" prompt + robust
//      parsing, with a single corrective retry.
//   3. Every result is validated against the schema before it is returned.

export function extractJson(raw) {
  if (!raw) return null;
  let t = String(raw).trim();
  try { return JSON.parse(t); } catch {}
  // Strip common markdown fences
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  try { return JSON.parse(t); } catch {}
  // Extract the first balanced {...} object
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try { return JSON.parse(t.substring(start, end + 1)); } catch {}
  }
  // Fall back to the first balanced [...] array
  const arrStart = t.indexOf("[");
  const arrEnd = t.lastIndexOf("]");
  if (arrStart !== -1 && arrEnd > arrStart) {
    try { return JSON.parse(t.substring(arrStart, arrEnd + 1)); } catch {}
  }
  return null;
}

// Coerce a model response body into plain text.
export function contentToText(content) {
  if (typeof content === "string") return content;
  if (content && typeof content.text === "string") return content.text;
  if (Array.isArray(content)) return content.map((p) => (p && typeof p.text === "string" ? p.text : "")).join("");
  return String(content ?? "");
}

// Minimal schema validation for the simple object schemas used across the code.
// schema = { type: "object", required: [..], properties: { field: { type: "..." } } }
function typeMatches(v, types) {
  const list = Array.isArray(types) ? types : [types];
  for (const t of list) {
    if (t === "number" && typeof v === "number") return true;
    if (t === "integer" && Number.isInteger(v)) return true;
    if (t === "string" && typeof v === "string") return true;
    if (t === "boolean" && typeof v === "boolean") return true;
    if (t === "array" && Array.isArray(v)) return true;
    if (t === "object" && v && typeof v === "object" && !Array.isArray(v)) return true;
    if (t === "null" && v === null) return true;
    if (t === "any") return true;
  }
  return false;
}

export function validateAgainstSchema(value, schema) {
  if (!schema) return true;
  if (schema.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    if (Array.isArray(schema.required)) {
      for (const key of schema.required) {
        if (value[key] === undefined || value[key] === null) return false;
      }
    }
  }
  for (const [key, prop] of Object.entries(schema.properties || {})) {
    if (value[key] === undefined || value[key] === null) continue;
    if (!typeMatches(value[key], prop.type)) return false;
  }
  return true;
}

async function tryNativeStructured(aiManager, messages, schema, options) {
  if (!schema || typeof aiManager.supportsStructuredOutput !== "function") return null;
  if (!aiManager.supportsStructuredOutput(schema)) return null;
  const result = await aiManager.chat(messages, { ...options, jsonSchema: schema });
  const content = result?.content;
  const parsed = content && typeof content === "object" ? content : extractJson(contentToText(content));
  if (!parsed || !validateAgainstSchema(parsed, schema)) return null;
  return {
    parsed,
    raw: typeof content === "string" ? content : JSON.stringify(parsed),
    attempts: 1,
    mode: "native",
  };
}

async function promptBasedJson(aiManager, messages, options) {
  const baseOptions = { ...options, temperature: options.temperature ?? 0.1, jsonMode: true };
  let lastRaw = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const callOptions = attempt === 0 ? baseOptions : {
      ...baseOptions,
      systemPrompt: (baseOptions.systemPrompt || "") + "\n\nCRITICAL: Your previous reply was not valid JSON. Reply with ONLY the raw JSON object, no markdown, no explanation, nothing before or after the braces."
    };
    const result = await aiManager.chat(messages, callOptions);
    const content = result?.content;
    lastRaw = contentToText(content).trim();
    const parsed = extractJson(lastRaw);
    if (parsed) return { parsed, raw: lastRaw, attempts: attempt + 1, mode: "prompt" };
  }
  throw new Error(`Model did not return valid JSON after 2 attempts. Last raw output: ${lastRaw.substring(0, 300)}`);
}

// aiManager: an already-initialized AIProviderManager instance
// messages: same shape as aiManager.chat's first argument
// options: same options as aiManager.chat, plus optional `schema`
export async function chatJson(aiManager, messages, options = {}) {
  const { schema, ...rest } = options;
  if (schema) {
    try {
      const native = await tryNativeStructured(aiManager, messages, schema, rest);
      if (native) return native;
    } catch (e) {
      // Native structured output failed — fall through to the prompt-based path.
    }
  }
  const base = { ...rest, temperature: rest.temperature ?? 0.1 };
  const result = await promptBasedJson(aiManager, messages, base);
  if (schema && !validateAgainstSchema(result.parsed, schema)) {
    throw new Error("Model returned JSON that failed schema validation");
  }
  return result;
}
