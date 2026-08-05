// Admin panel APIs page handler — manage AI providers
import { layout, escHtml } from "../lib/html.js";
import { log } from "../lib/logger.js";
import { encrypt, decrypt } from "../lib/crypto.js";
import { AIProviderManager } from "../lib/ai.js";

export async function handleApisPage(request, env, config) {
  const db = env.DB;

  if (request.method === "GET") {
    const providers = await db.prepare("SELECT * FROM api_providers ORDER BY priority ASC").all();
    return layout({
      title: "API Providers",
      content: renderProvidersList(providers.results || []),
      session: true,
    });
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
    return layout({
      title: "API Providers",
      content: renderProvidersList(providers.results || []),
      session: true,
    });
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
  const capabilities = JSON.stringify((formData.get("capabilities") || "chat").split(",").map(s => s.trim()));

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
  const capabilities = JSON.stringify((formData.get("capabilities") || "chat").split(",").map(s => s.trim()));
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
  `;

  for (const provider of providers) {
    const health = JSON.parse(provider.health_json || "{}");
    const caps = JSON.parse(provider.capabilities || "[]").join(", ");
    html += `
      <div class="card">
        <h3>${escHtml(provider.name)} <span class="badge ${provider.enabled ? "active" : "inactive"}">${provider.enabled ? "Enabled" : "Disabled"}</span></h3>
        <p class="muted">${escHtml(provider.kind)} | Model: ${escHtml(provider.model)} | Priority: ${provider.priority} | Capabilities: ${escHtml(caps)}</p>
        <p class="muted">Health: ${escHtml(health.status || "unknown")} | Timeout: ${provider.timeout_ms}ms</p>

        <form method="POST" action="/admin/ava_brain/apis" style="display:inline">
          <input type="hidden" name="action" value="toggle">
          <input type="hidden" name="id" value="${provider.id}">
          <button type="submit" class="small">${provider.enabled ? "Disable" : "Enable"}</button>
        </form>

        <form method="POST" action="/admin/ava_brain/apis" style="display:inline">
          <input type="hidden" name="action" value="test">
          <input type="hidden" name="id" value="${provider.id}">
          <button type="submit" class="small">Test</button>
        </form>

        <form method="POST" action="/admin/ava_brain/apis" style="display:inline">
          <input type="hidden" name="action" value="delete">
          <input type="hidden" name="id" value="${provider.id}">
          <button type="submit" class="small danger" onclick="return confirm('Delete this provider?')">Delete</button>
        </form>

        <form method="POST" action="/admin/ava_brain/apis" style="margin-top:12px">
          <input type="hidden" name="action" value="edit">
          <input type="hidden" name="id" value="${provider.id}">
          <div class="row">
            <div class="col"><label>Name</label><input type="text" name="name" value="${escHtml(provider.name)}"></div>
            <div class="col"><label>Kind</label>
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
          <div class="row">
            <div class="col"><label>Priority</label><input type="number" name="priority" value="${provider.priority}"></div>
            <div class="col"><label>Timeout (ms)</label><input type="number" name="timeout_ms" value="${provider.timeout_ms}"></div>
            <div class="col"><label>Max Retries</label><input type="number" name="max_retries" value="${provider.max_retries}"></div>
          </div>
          <label>Capabilities (comma-separated)</label><input type="text" name="capabilities" value="${escHtml(caps)}">
          <label><input type="checkbox" name="enabled" ${provider.enabled ? "checked" : ""}> Enabled</label>
          <button type="submit">Update Provider</button>
        </form>
      </div>
    `;
  }

  html += `
    <div class="card">
      <h3>Add New Provider</h3>
      <form method="POST" action="/admin/ava_brain/apis">
        <input type="hidden" name="action" value="add">
        <div class="row">
          <div class="col"><label>Name</label><input type="text" name="name" required></div>
          <div class="col"><label>Kind</label>
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
        <div class="row">
          <div class="col"><label>Priority</label><input type="number" name="priority" value="10"></div>
          <div class="col"><label>Timeout (ms)</label><input type="number" name="timeout_ms" value="30000"></div>
          <div class="col"><label>Max Retries</label><input type="number" name="max_retries" value="2"></div>
        </div>
        <label>Capabilities (comma-separated)</label><input type="text" name="capabilities" value="chat,summary,extract,news,followup,router">
        <button type="submit">Add Provider</button>
      </form>
    </div>
  `;

  return html;
}