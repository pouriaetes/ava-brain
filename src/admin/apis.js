// Admin panel APIs page handler — manage AI providers
import { layout, escHtml, pageHeader, flash } from "../lib/html.js";
import { log } from "../lib/logger.js";
import { encrypt, decrypt } from "../lib/crypto.js";
import { AIProviderManager } from "../lib/ai.js";

export async function handleApisPage(request, env, config) {
  const db = env.DB;
  let flashMsg = null;

  if (request.method === "GET") {
    const providers = await db.prepare("SELECT * FROM api_providers ORDER BY priority ASC").all();
    return new Response(layout({
      title: "API Providers",
      currentPage: "/admin/ava_brain/apis",
      content: renderProvidersList(providers.results || [], flashMsg),
      session: true,
    }), { headers: { "Content-Type": "text/html" } });
  }

  if (request.method === "POST") {
    const formData = await request.formData();
    const action = formData.get("action");

    if (action === "add") {
      await addProvider(db, formData, config);
      flashMsg = "Provider added.";
    } else if (action === "edit") {
      await editProvider(db, formData, config);
      flashMsg = "Provider updated.";
    } else if (action === "delete") {
      await deleteProvider(db, formData, config);
      flashMsg = "Provider deleted.";
    } else if (action === "toggle") {
      await toggleProvider(db, formData, config);
      flashMsg = "Provider toggled.";
    } else if (action === "test") {
      flashMsg = await testProvider(db, formData, config);
    }

    const providers = await db.prepare("SELECT * FROM api_providers ORDER BY priority ASC").all();
    return new Response(layout({
      title: "API Providers",
      currentPage: "/admin/ava_brain/apis",
      content: renderProvidersList(providers.results || [], flashMsg),
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
  // New providers start with a sensible default capability. Capability assignment is
  // managed centrally on the Capabilities → Models page after creation.
  const capabilities = kind === "tavily" ? JSON.stringify(["web_search"]) : JSON.stringify(["chat"]);

  let apiKeyEnc = "";
  if (apiKey && config.MASTER_KEY) {
    apiKeyEnc = await encrypt(apiKey, config.MASTER_KEY);
  }

  await db
    .prepare(
      "INSERT INTO api_providers (name, kind, base_url, model, api_key_enc, enabled, priority, timeout_ms, max_retries, capabilities) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(name, kind, baseUrl, model || "tavily-search", apiKeyEnc, 1, priority, timeoutMs, maxRetries, capabilities)
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
  // Capabilities are managed centrally on the Capabilities → Models page. Editing a
  // provider's connection info must NOT reset its capability assignments.
  const existingRow = await db.prepare("SELECT capabilities FROM api_providers WHERE id = ?").bind(id).first();
  let existingCaps = [];
  try {
    existingCaps = JSON.parse(existingRow?.capabilities || "[]");
  } catch {}
  if (!Array.isArray(existingCaps)) existingCaps = [];
  const capabilities = JSON.stringify(existingCaps.length > 0 ? existingCaps : ["chat"]);
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
  const aiManager = new AIProviderManager(config, { encrypt, decrypt }, { info: log.info, error: log.error, warn: log.warn }, db);
  let health;
  try {
    health = await aiManager.testProvider(id);
  } catch (error) {
    health = { status: "failed", message: error.message || "Provider request failed", checkedAt: new Date().toISOString() };
  }
  const provider = await db.prepare("SELECT id, name FROM api_providers WHERE id = ?").bind(id).first();
  try {
    await db
      .prepare("UPDATE api_providers SET health_json = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(JSON.stringify(health), id)
      .run();
    await log(db, "info", "provider_tested", { id, status: health.status });
  } catch (writeError) {
    await log(db, "warn", "provider_health_write_failed", { id, error: writeError.message });
  }
  const name = provider?.name ? `${provider.name}: ` : "";
  return `Health test (${name}${health.status}): ${health.message || ""}`;
}

function renderProvidersList(providers, flashMsg = null) {
  let html = `
    ${flashMsg ? flash("success", flashMsg) : ""}
    ${pageHeader("AI Providers", {
      description: "Manage model providers. Health Test runs a real minimal request for the provider's assigned capabilities.",
    })}

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
              <option value="tavily">Tavily (Web Search)</option>
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
    const healthStatus = health.status || "unknown";
    const healthBadgeClass = healthStatus === "healthy" ? "active"
      : (healthStatus === "failed" || healthStatus === "auth_error" || healthStatus === "timeout" || healthStatus === "invalid_model" ? "inactive"
      : "warning");
    const caps = (() => { try { const c = JSON.parse(provider.capabilities || "[]"); return Array.isArray(c) ? c : []; } catch { return []; } })();

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
            ${caps.length > 0 ? `<div class="muted" style="font-size:0.78rem;margin-top:6px;">Capabilities: ${caps.map((c) => `<span class="badge">${escHtml(c)}</span>`).join(" ")}</div>` : ""}
            ${health.status === "cooldown" ? `<div class="muted" style="font-size:0.78rem;margin-top:4px;color:var(--warning-text);">⏳ Cooling down — skipped by selection until ${escHtml(health.cooldown_until ? new Date(health.cooldown_until).toISOString() : "unknown")}${health.consecutive_failures ? ` (${health.consecutive_failures} consecutive failures)` : ""}</div>` : ""}
            ${health.message ? `<div class="muted" style="font-size:0.78rem;margin-top:4px;" title="${escHtml(health.detail || health.error || health.message || "")}">${escHtml(health.message)}</div>` : ""}
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
              <button type="submit" class="small">Health Test</button>
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
                  <option value="tavily" ${provider.kind === "tavily" ? "selected" : ""}>Tavily (Web Search)</option>
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
            <p class="muted" style="font-size:0.8rem;">Capabilities are managed centrally on the <a href="/admin/ava_brain/capabilities?tab=models">Capabilities → Models</a> page.</p>
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
