// Admin panel APIs page handler — manage AI providers
import { layout, escHtml } from "../lib/html.js";
import { log } from "../lib/logger.js";
import { encrypt, decrypt } from "../lib/crypto.js";
import { AIProviderManager } from "../lib/ai.js";

export async function handleApisPage(request, env, config) {
  const db = env.DB;

  if (request.method === "GET") {
    const providers = await db.prepare("SELECT * FROM api_providers ORDER BY priority ASC").all();
    return new Response(layout({
      title: "API Providers",
      content: renderProvidersList(providers.results || []),
      session: true,
    }), { headers: { "Content-Type": "text/html" } });
  }

  if (request.method === "POST") {
    const formData = await request.formData();
    const action = formData.get("action");

    if (action === "add") {
      await addProvider(db, formData, config);
    } else if (action === "edit") {
      await editProvider(db, formData, config);
    } else if (action === "delete") {
      await deleteProvider(db, formData, config);
    } else if (action === "toggle") {
      await toggleProvider(db, formData, config);
    } else if (action === "test") {
      await testProvider(db, formData, config);
    }

    const providers = await db.prepare("SELECT * FROM api_providers ORDER BY priority ASC").all();
    return new Response(layout({
      title: "API Providers",
      content: renderProvidersList(providers.results || []),
      session: true,
    }), { headers: { "Content-Type": "text/html" } });
  }

  return new Response("Method Not Allowed", { status: 405 });
}

async function addProvider(db, formData, config) {
  const name = formData.get("name");
  const kind = formData.get("kind");
  const baseUrl = formData.get("base_url") || "";
  const model = formData.get("model");
  const apiKey = formData.get("api_key") || "";
  const priority = parseInt(formData.get("priority") || "10", 10);
  const timeoutMs = parseInt(formData.get("timeout_ms") || "30000", 10);
  const maxRetries = parseInt(formData.get("max_retries") || "2", 10);
  const selectedCapabilities = [];
  if (formData.get("cap_chat")) selectedCapabilities.push("chat");
  if (formData.get("cap_routing")) selectedCapabilities.push("routing");
  if (formData.get("cap_judge")) selectedCapabilities.push("judge");
  if (formData.get("cap_memory_analysis")) selectedCapabilities.push("memory_analysis");
  if (formData.get("cap_image_gen")) selectedCapabilities.push("image_gen");
  if (formData.get("cap_stt")) selectedCapabilities.push("stt");
  if (formData.get("cap_tts")) selectedCapabilities.push("tts");
  const capabilities = JSON.stringify(selectedCapabilities.length > 0 ? selectedCapabilities : ["chat"]);

  let apiKeyEnc = "";
  if (apiKey && config.MASTER_KEY) {
    apiKeyEnc = await encrypt(apiKey, config.MASTER_KEY);
  }

  await db
    .prepare(
      "INSERT INTO api_providers (name, kind, base_url, model, api_key_enc, enabled, priority, timeout_ms, max_retries, capabilities) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(name, kind, baseUrl, model, apiKeyEnc, 1, priority, timeoutMs, maxRetries, capabilities)
    .run();

  await log(db, "info", "provider_added", { name, kind });
}

async function editProvider(db, formData, config) {
  const id = parseInt(formData.get("id"), 10);
  const name = formData.get("name");
  const kind = formData.get("kind");
  const baseUrl = formData.get("base_url") || "";
  const model = formData.get("model");
  const apiKey = formData.get("api_key") || "";
  const priority = parseInt(formData.get("priority") || "10", 10);
  const timeoutMs = parseInt(formData.get("timeout_ms") || "30000", 10);
  const maxRetries = parseInt(formData.get("max_retries") || "2", 10);
  const selectedCapabilities = [];
  if (formData.get("cap_chat")) selectedCapabilities.push("chat");
  if (formData.get("cap_routing")) selectedCapabilities.push("routing");
  if (formData.get("cap_judge")) selectedCapabilities.push("judge");
  if (formData.get("cap_memory_analysis")) selectedCapabilities.push("memory_analysis");
  if (formData.get("cap_image_gen")) selectedCapabilities.push("image_gen");
  if (formData.get("cap_stt")) selectedCapabilities.push("stt");
  if (formData.get("cap_tts")) selectedCapabilities.push("tts");
  const capabilities = JSON.stringify(selectedCapabilities.length > 0 ? selectedCapabilities : ["chat"]);
  const enabled = formData.get("enabled") === "on" ? 1 : 0;

  const fields = ["name = ?", "kind = ?", "base_url = ?", "model = ?", "priority = ?", "timeout_ms = ?", "max_retries = ?", "capabilities = ?", "enabled = ?"];
  const values = [name, kind, baseUrl, model, priority, timeoutMs, maxRetries, capabilities, enabled];

  if (apiKey) {
    const apiKeyEnc = await encrypt(apiKey, config.MASTER_KEY);
    fields.push("api_key_enc = ?");
    values.push(apiKeyEnc);
  }

  values.push(id);
  const query = `UPDATE api_providers SET ${fields.join(", ")}, updated_at = datetime('now') WHERE id = ?`;
  await db.prepare(query).bind(...values).run();

  await log(db, "info", "provider_edited", { id, name });
}

async function deleteProvider(db, formData, config) {
  const id = parseInt(formData.get("id"), 10);

  // Prevent deleting the last Workers AI provider (initial default)
  const workersAiCount = await db.prepare("SELECT COUNT(*) as count FROM api_providers WHERE kind = 'workers_ai'").first();
  const provider = await db.prepare("SELECT * FROM api_providers WHERE id = ?").bind(id).first();

  if (provider?.kind === "workers_ai" && workersAiCount.count <= 1) {
    await log(db, "warn", "provider_delete_blocked", { id, reason: "last_workers_ai" });
    return;
  }

  await db.prepare("DELETE FROM api_providers WHERE id = ?").bind(id).run();
  await log(db, "info", "provider_deleted", { id });
}

async function toggleProvider(db, formData, config) {
  const id = parseInt(formData.get("id"), 10);
  const provider = await db.prepare("SELECT * FROM api_providers WHERE id = ?").bind(id).first();
  if (!provider) return;

  const newEnabled = provider.enabled ? 0 : 1;
  await db
    .prepare("UPDATE api_providers SET enabled = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(newEnabled, id)
    .run();

  await log(db, "info", "provider_toggled", { id, enabled: newEnabled });
}

async function testProvider(db, formData, config) {
  const id = parseInt(formData.get("id"), 10);
  try {
    const aiManager = new AIProviderManager(config, { encrypt, decrypt }, { info: log.info, error: log.error, warn: log.warn }, db);
    await aiManager.initialize();

    const provider = await db.prepare("SELECT * FROM api_providers WHERE id = ?").bind(id).first();
    if (!provider) return;

    const adapter = aiManager.getAdapters()[provider.id];
    if (adapter && typeof adapter.health === "function") {
      const health = await adapter.health();
      await db
        .prepare("UPDATE api_providers SET health_json = ?, updated_at = datetime('now') WHERE id = ?")
        .bind(JSON.stringify(health), id)
        .run();
      await log(db, "info", "provider_tested", { id, status: health.status });
    }
  } catch (error) {
    await log(db, "error", "provider_test_error", { id, error: error.message });
  }
}

function renderProvidersList(providers) {
  let html = `
    <div class="card">
      <h2>AI Providers</h2>
      <p class="muted">Workers AI requires no API key. External providers need API key (encrypted).</p>
    </div>

    <!-- Add New Provider Section (hidden by default) -->
    <div class="card" id="add-provider-card" style="display:none;">
      <h3>Add New Provider</h3>
      <form method="POST" action="/admin/ava_brain/apis">
        <input type="hidden" name="action" value="add">
        <div class="row cols-2">
          <div><label>Name</label><input type="text" name="name" required></div>
          <div><label>Kind</label>
            <select name="kind">
              <option value="workers_ai">Workers AI</option>
              <option value="gemini">Gemini</option>
              <option value="openai_compatible">OpenAI Compatible</option>
            </select>
          </div>
        </div>
        <label>Model</label><input type="text" name="model" required>
        <label>Base URL</label><input type="text" name="base_url" placeholder="https://api.example.com/v1">
        <label>API Key</label><input type="password" name="api_key" placeholder="••••••••">
        <div class="row cols-3">
          <div><label>Priority</label><input type="number" name="priority" value="10"></div>
          <div><label>Timeout (ms)</label><input type="number" name="timeout_ms" value="30000"></div>
          <div><label>Max Retries</label><input type="number" name="max_retries" value="2"></div>
        </div>
        <label>Capabilities (what this provider should be used for)</label>
        <div class="capability-group">
          <h4 class="capability-group-title">Text / Chat</h4>
          <div class="capability-group-items">
            <label style="font-weight:normal;"><input type="checkbox" name="cap_chat" value="chat" checked> Chat (main conversation replies)</label>
            <label style="font-weight:normal;"><input type="checkbox" name="cap_routing" value="routing"> Routing (intent/action detection)</label>
            <label style="font-weight:normal;"><input type="checkbox" name="cap_judge" value="judge"> Judge (task/memory classifier)</label>
            <label style="font-weight:normal;"><input type="checkbox" name="cap_memory_analysis" value="memory_analysis"> Memory Analysis (periodic short-term memory review)</label>
            <label style="font-weight:normal;"><input type="checkbox" name="cap_image_gen" value="image_gen"> Image Generation (generate images from text prompts)</label>
          </div>
        </div>
        <div class="capability-group">
          <h4 class="capability-group-title">Voice (STT / TTS)</h4>
          <div class="capability-group-items">
            <label style="font-weight:normal;"><input type="checkbox" name="cap_stt" value="stt"> Speech-to-Text (transcribe incoming voice messages)</label>
            <label style="font-weight:normal;"><input type="checkbox" name="cap_tts" value="tts"> Text-to-Speech (generate voice replies)</label>
          </div>
        </div>
        <div class="capability-group capability-group-future">
          <h4 class="capability-group-title">Image Generation</h4>
          <div class="capability-group-items">
            <label class="disabled-capability">
              <input type="checkbox" name="capabilities" value="image_gen" disabled>
              Generate Images
            </label>
          </div>
          <p class="muted" style="font-size:0.75rem;margin-top:8px;">Coming soon — not yet supported by the backend.</p>
        </div>
        <div class="capability-group capability-group-future">
          <h4 class="capability-group-title">Web Search</h4>
          <div class="capability-group-items">
            <label class="disabled-capability">
              <input type="checkbox" name="capabilities" value="web_search" disabled>
              Search the Web
            </label>
          </div>
          <p class="muted" style="font-size:0.75rem;margin-top:8px;">Coming soon — not yet supported by the backend.</p>
        </div>
        <div style="margin-top:20px;display:flex;gap:8px;">
          <button type="submit">Add Provider</button>
          <button type="button" class="secondary" onclick="document.getElementById('add-provider-card').style.display='none'; document.getElementById('add-provider-btn').style.display='inline-flex';">Cancel</button>
        </div>
      </form>
    </div>

    <!-- Button to show Add New Provider form -->
    <div id="add-provider-btn" style="margin-bottom:20px;">
      <button type="button" class="success" onclick="this.style.display='none'; document.getElementById('add-provider-card').style.display='block';">
        + Add New Provider
      </button>
    </div>
  `;

  for (const provider of providers) {
    const health = JSON.parse(provider.health_json || "{}");
    const caps = JSON.parse(provider.capabilities || "[]");
    const healthStatus = health.status || "unknown";
    const healthBadgeClass = healthStatus === "healthy" ? "active" : (healthStatus === "unhealthy" ? "inactive" : "warning");

    html += `
      <div class="card provider-card ${provider.enabled ? 'enabled' : 'disabled'}">
        <!-- Collapsed Summary View -->
        <div id="provider-summary-${provider.id}" class="provider-summary">
          <div class="provider-info">
            <div class="provider-header">
              <span class="provider-name">${escHtml(provider.name)}</span>
              <span class="badge ${provider.enabled ? "active" : "inactive"}">${provider.enabled ? "Enabled" : "Disabled"}</span>
              <span class="badge ${healthBadgeClass}">${escHtml(healthStatus)}</span>
            </div>
            <div class="provider-meta">
              <span class="provider-meta-item">${escHtml(provider.kind)}</span>
              <span class="provider-meta-separator">·</span>
              <span class="provider-meta-item">Model: ${escHtml(provider.model)}</span>
              <span class="provider-meta-separator">·</span>
              <span class="provider-meta-item">Priority: ${provider.priority}</span>
            </div>
          </div>
          <div class="provider-actions">
            <form method="POST" action="/admin/ava_brain/apis" style="display:inline">
              <input type="hidden" name="action" value="toggle">
              <input type="hidden" name="id" value="${provider.id}">
              <button type="submit" class="small ${provider.enabled ? "secondary" : "success"}">${provider.enabled ? "Disable" : "Enable"}</button>
            </form>
            <form method="POST" action="/admin/ava_brain/apis" style="display:inline">
              <input type="hidden" name="action" value="test">
              <input type="hidden" name="id" value="${provider.id}">
              <button type="submit" class="small">Test</button>
            </form>
            <button type="button" class="small secondary" onclick="document.getElementById('provider-edit-${provider.id}').style.display='block'; document.getElementById('provider-summary-${provider.id}').style.display='none';">Edit</button>
            <form method="POST" action="/admin/ava_brain/apis" style="display:inline">
              <input type="hidden" name="action" value="delete">
              <input type="hidden" name="id" value="${provider.id}">
              <button type="submit" class="small danger" onclick="return confirm('Delete this provider?')">Delete</button>
            </form>
          </div>
        </div>

        <!-- Expanded Edit Form (hidden by default) -->
        <div id="provider-edit-${provider.id}" class="provider-edit-form" style="display:none;">
          <form method="POST" action="/admin/ava_brain/apis">
            <input type="hidden" name="action" value="edit">
            <input type="hidden" name="id" value="${provider.id}">
            <div class="row cols-2">
              <div><label>Name</label><input type="text" name="name" value="${escHtml(provider.name)}"></div>
              <div><label>Kind</label>
                <select name="kind">
                  <option value="workers_ai" ${provider.kind === "workers_ai" ? "selected" : ""}>Workers AI</option>
                  <option value="gemini" ${provider.kind === "gemini" ? "selected" : ""}>Gemini</option>
                  <option value="openai_compatible" ${provider.kind === "openai_compatible" ? "selected" : ""}>OpenAI Compatible</option>
                </select>
              </div>
            </div>
            <label>Model</label><input type="text" name="model" value="${escHtml(provider.model)}">
            ${provider.kind !== "workers_ai" ? `
              <label>Base URL</label><input type="text" name="base_url" value="${escHtml(provider.base_url || "")}" placeholder="https://api.example.com/v1">
              <label>API Key (leave blank to keep existing)</label><input type="password" name="api_key" placeholder="••••••••">
            ` : ""}
            <div class="row cols-3">
              <div><label>Priority</label><input type="number" name="priority" value="${provider.priority}"></div>
              <div><label>Timeout (ms)</label><input type="number" name="timeout_ms" value="${provider.timeout_ms}"></div>
              <div><label>Max Retries</label><input type="number" name="max_retries" value="${provider.max_retries}"></div>
            </div>
            <label>Capabilities (what this provider should be used for)</label>
            <div class="capability-group">
              <h4 class="capability-group-title">Text / Chat</h4>
              <div class="capability-group-items">
                <label style="font-weight:normal;"><input type="checkbox" name="cap_chat" value="chat" ${caps.includes("chat") ? "checked" : ""}> Chat (main conversation replies)</label>
                <label style="font-weight:normal;"><input type="checkbox" name="cap_routing" value="routing" ${caps.includes("routing") ? "checked" : ""}> Routing (intent/action detection)</label>
                <label style="font-weight:normal;"><input type="checkbox" name="cap_judge" value="judge" ${caps.includes("judge") ? "checked" : ""}> Judge (task/memory classifier)</label>
                <label style="font-weight:normal;"><input type="checkbox" name="cap_memory_analysis" value="memory_analysis" ${caps.includes("memory_analysis") ? "checked" : ""}> Memory Analysis (periodic short-term memory review)</label>
                <label style="font-weight:normal;"><input type="checkbox" name="cap_image_gen" value="image_gen" ${caps.includes("image_gen") ? "checked" : ""}> Image Generation (generate images from text prompts)</label>
              </div>
            </div>
            <div class="capability-group">
              <h4 class="capability-group-title">Voice (STT / TTS)</h4>
              <div class="capability-group-items">
                <label style="font-weight:normal;"><input type="checkbox" name="cap_stt" value="stt" ${caps.includes("stt") ? "checked" : ""}> Speech-to-Text (transcribe incoming voice messages)</label>
                <label style="font-weight:normal;"><input type="checkbox" name="cap_tts" value="tts" ${caps.includes("tts") ? "checked" : ""}> Text-to-Speech (generate voice replies)</label>
              </div>
            </div>
            <div class="capability-group capability-group-future">
              <h4 class="capability-group-title">Image Generation</h4>
              <div class="capability-group-items">
                <label class="disabled-capability">
                  <input type="checkbox" name="capabilities" value="image_gen" disabled>
                  Generate Images
                </label>
              </div>
              <p class="muted" style="font-size:0.75rem;margin-top:8px;">Coming soon — not yet supported by the backend.</p>
            </div>
            <div class="capability-group capability-group-future">
              <h4 class="capability-group-title">Web Search</h4>
              <div class="capability-group-items">
                <label class="disabled-capability">
                  <input type="checkbox" name="capabilities" value="web_search" disabled>
                  Search the Web
                </label>
              </div>
              <p class="muted" style="font-size:0.75rem;margin-top:8px;">Coming soon — not yet supported by the backend.</p>
            </div>
            <label><input type="checkbox" name="enabled" ${provider.enabled ? "checked" : ""}> Enabled</label>
            <div style="margin-top:16px;display:flex;gap:8px;">
              <button type="submit">Update Provider</button>
              <button type="button" class="secondary" onclick="document.getElementById('provider-edit-${provider.id}').style.display='none'; document.getElementById('provider-summary-${provider.id}').style.display='flex';">Cancel</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  return html;
}
