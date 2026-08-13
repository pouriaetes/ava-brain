// Admin panel settings page handler — reorganized into clear tabs:
//   Core & Personality, Routing & AI, Keyword Filters, Daily Check & Learning
// Core identity (bot_name, owner_name, persona) is administrator-controlled and is
// never rewritten by the AI. Adaptive personality (learned preferences) is stored in
// profile_facts and reviewed/managed under "Daily Check & Learning".
import { layout, escHtml, pageHeader, tabs, toggle, flash, badge } from "../lib/html.js";
import { log } from "../lib/logger.js";
import { getAllSettings } from "../lib/settings.js";

// Field names per tab. Only the fields of the active tab are submitted, so saving one
// tab never touches the others.
const TAB_FIELDS = {
  core: ["bot_name", "owner_name", "timezone", "persona", "response_style"],
  routing: ["judge_provider_id", "judge_routing_enabled", "judge_debug_enabled", "judge_manual_fallback_enabled", "keyword_judge_fallback_triggers"],
  filters: [
    "keyword_note_triggers",
    "keyword_reminder_triggers",
    "keyword_project_trigger",
    "keyword_project_create_triggers",
    "keyword_project_exclude_triggers",
    "keyword_voice_reply_triggers",
    "keyword_image_request_triggers",
    "keyword_help_triggers",
    "keyword_memory_exclude_triggers",
  ],
  learning: ["checkin_enabled", "nightly_summary_enabled", "personality_optimization_enabled"],
};

// Boolean settings stored as "true"/"false". An unchecked checkbox is not submitted,
// so absence means "false".
const CHECKBOX_FIELDS = new Set([
  "judge_routing_enabled",
  "judge_debug_enabled",
  "judge_manual_fallback_enabled",
  "checkin_enabled",
  "nightly_summary_enabled",
  "personality_optimization_enabled",
]);

const TAB_NAV = [
  { id: "core", label: "Core & Personality" },
  { id: "routing", label: "Routing & AI" },
  { id: "filters", label: "Keyword Filters" },
  { id: "learning", label: "Daily Check & Learning" },
];

const ADAPTIVE_CATEGORIES = ["behavioral_preference", "communication_preference", "interaction_habit"];

export async function handleSettingsPage(request, env, config) {
  const db = env.DB;
  const url = new URL(request.url);
  const tab = url.searchParams.get("tab") || "core";
  let flashMsg = null;
  let error = null;

  if (request.method === "GET") {
    const settings = await getAllSettings(db);
    const providers = await getApiProviders(db);
    const adaptiveFacts = await getAdaptiveFacts(db);
    return new Response(layout({
      title: "Settings",
      currentPage: "/admin/ava_brain/settings",
      content: renderSettingsPage(settings, providers, tab, adaptiveFacts, flashMsg, error),
      session: true,
    }), { headers: { "Content-Type": "text/html" } });
  }

  if (request.method === "POST") {
    const formData = await request.formData();
    const action = formData.get("action");
    const activeTab = formData.get("tab") || "core";

    try {
      if (action === "save_settings") {
        const updates = {};
        for (const field of TAB_FIELDS[activeTab] || []) {
          if (CHECKBOX_FIELDS.has(field)) {
            updates[field] = formData.has(field) ? "true" : "false";
          } else if (formData.has(field)) {
            updates[field] = formData.get(field) || "";
          }
        }
        for (const [key, value] of Object.entries(updates)) {
          await db
            .prepare("UPDATE settings SET value = ?, updated_at = datetime('now') WHERE key = ?")
            .bind(value, key)
            .run();
        }
        await log(db, "info", "settings_updated", { tab: activeTab, keys: Object.keys(updates) });
        flashMsg = "Settings saved.";
      } else if (action === "delete_adaptive") {
        const id = parseInt(formData.get("id"), 10);
        await db.prepare("DELETE FROM profile_facts WHERE id = ?").bind(id).run();
        await log(db, "info", "adaptive_profile_deleted", { id });
        flashMsg = "Learned preference deleted.";
      } else if (action === "toggle_adaptive") {
        const id = parseInt(formData.get("id"), 10);
        const fact = await db.prepare("SELECT * FROM profile_facts WHERE id = ?").bind(id).first();
        if (fact) {
          await db.prepare("UPDATE profile_facts SET is_permanent = ?, updated_at = datetime('now') WHERE id = ?")
            .bind(fact.is_permanent ? 0 : 1, id).run();
          await log(db, "info", "adaptive_profile_toggled", { id, active: fact.is_permanent ? 0 : 1 });
          flashMsg = fact.is_permanent ? "Learned preference disabled." : "Learned preference enabled.";
        }
      }
    } catch (e) {
      error = e.message;
    }

    const settings = await getAllSettings(db);
    const providers = await getApiProviders(db);
    const adaptiveFacts = await getAdaptiveFacts(db);
    return new Response(layout({
      title: "Settings",
      currentPage: "/admin/ava_brain/settings",
      content: renderSettingsPage(settings, providers, activeTab, adaptiveFacts, flashMsg, error),
      session: true,
    }), { headers: { "Content-Type": "text/html" } });
  }

  return new Response("Method Not Allowed", { status: 405 });
}

async function getApiProviders(db) {
  const results = await db.prepare("SELECT id, name, kind, model, enabled FROM api_providers WHERE enabled = 1 ORDER BY priority ASC").all();
  return results.results || [];
}

async function getAdaptiveFacts(db) {
  const placeholders = ADAPTIVE_CATEGORIES.map(() => "?").join(",");
  const results = await db.prepare(
    `SELECT * FROM profile_facts WHERE category IN (${placeholders}) ORDER BY is_permanent DESC, confidence DESC, updated_at DESC`
  ).bind(...ADAPTIVE_CATEGORIES).all();
  return results.results || [];
}

function renderSettingsPage(settings, providers, tab, adaptiveFacts, flashMsg, error) {
  const section = {
    core: renderCoreTab(settings),
    routing: renderRoutingTab(settings, providers),
    filters: renderFiltersTab(settings),
    learning: renderLearningTab(settings),
  }[tab] || renderCoreTab(settings);

  const activeLabel = (TAB_NAV.find((t) => t.id === tab) || TAB_NAV[0]).label;

  let content = `
    ${flashMsg ? flash("success", flashMsg) : ""}
    ${error ? flash("error", error) : ""}
    ${pageHeader("Settings", {
      description: "Core identity, AI routing, keyword filters, and daily learning. Only the active tab's fields are saved.",
    })}
    ${tabs(TAB_NAV.map((t) => ({
      href: `/admin/ava_brain/settings?tab=${t.id}`,
      label: t.label,
      active: tab === t.id,
    })))}
    <div class="card">
      <h3>${escHtml(activeLabel)}</h3>
      <form method="POST" action="/admin/ava_brain/settings">
        <input type="hidden" name="action" value="save_settings">
        <input type="hidden" name="tab" value="${escHtml(tab)}">
        ${section}
        <button type="submit" style="margin-top:20px;">Save Settings</button>
      </form>
    </div>
  `;

  if (tab === "learning") {
    content += renderAdaptiveSection(adaptiveFacts);
  }

  return content;
}

function renderCoreTab(settings) {
  return `
    <p class="muted">Core identity is administrator-controlled and is <strong>never</strong> rewritten automatically by Ava. Adaptive behavior learned from conversations is managed under <a href="/admin/ava_brain/settings?tab=learning">Daily Check & Learning</a>.</p>

    <label>Bot Name</label>
    <input type="text" name="bot_name" value="${escHtml(settings.bot_name || "Ava")}">

    <label>Owner Name</label>
    <input type="text" name="owner_name" value="${escHtml(settings.owner_name || "Pouria")}">

    <label>Timezone</label>
    <input type="text" name="timezone" value="${escHtml(settings.timezone || "Asia/Tehran")}">

    <label>Core Identity / System Prompt (immutable)</label>
    <textarea name="persona" rows="6">${escHtml(settings.persona || "")}</textarea>
    <small>Defines Ava's fundamental identity, safety rules, and fixed behavior. This is never auto-modified by the AI.</small>

    <label>Response Style (baseline)</label>
    <input type="text" name="response_style" value="${escHtml(settings.response_style || "")}">
    <small>Default communication style. Specific learned preferences for this user take precedence where they apply.</small>
  `;
}

function renderRoutingTab(settings, providers) {
  const providerOptions = providers
    .map(p => `<option value="${p.id}"${settings.judge_provider_id === String(p.id) ? ' selected' : ''}>${escHtml(p.name)} (${escHtml(p.model)})</option>`)
    .join('');

  return `
    <p class="muted">AI routing and the Judge classifier. Per-model capability priorities are managed on the <a href="/admin/ava_brain/capabilities">Capabilities</a> page.</p>

    <label>Judge / Classifier Provider</label>
    <select name="judge_provider_id">
      <option value="">-- Use Default --</option>
      ${providerOptions}
    </select>
    <small style="display:block;margin-top:4px;">Select which AI provider should be used for initial message classification (Judge).</small>

    <div style="display:flex;flex-direction:column;gap:12px;margin:16px 0;">
      ${toggle({
        name: "judge_routing_enabled",
        checked: settings.judge_routing_enabled === "true",
        label: "Judge Routing",
        hint: "Route every normal message through Judge before replying. Default is OFF; users can also toggle per-chat in Telegram with /judge_off and /judge_on.",
      })}
      ${toggle({
        name: "judge_debug_enabled",
        checked: settings.judge_debug_enabled === "true",
        label: "Judge Debug Mode",
        hint: "Prefix Telegram replies with a diagnostic line showing whether Judge ran and what it decided. For troubleshooting only; does not change routing behavior.",
      })}
      ${toggle({
        name: "judge_manual_fallback_enabled",
        checked: settings.judge_manual_fallback_enabled === "true",
        label: "Manual fallback when Judge is unavailable",
        hint: "When the Judge classifier fails, reply with a list of /commands (e.g. /web_search, /tts, /image) and an apology instead of guessing, so you can pick the action manually.",
      })}
    </div>

    <label>Judge Fallback Trigger Words (used only if the AI classifier fails)</label>
    <textarea name="keyword_judge_fallback_triggers" rows="2">${escHtml(settings.keyword_judge_fallback_triggers || "")}</textarea>
  `;
}

function renderFiltersTab(settings) {
  return `
    <p class="muted">Comma-separated words/phrases. Leave a field empty to use the built-in default list. These control how Ava detects intent without needing a code change.</p>

    <label>Note / Remember Trigger Words</label>
    <textarea name="keyword_note_triggers" rows="2">${escHtml(settings.keyword_note_triggers || "")}</textarea>

    <label>Reminder Trigger Words</label>
    <textarea name="keyword_reminder_triggers" rows="2">${escHtml(settings.keyword_reminder_triggers || "")}</textarea>

    <label>Project Trigger Word</label>
    <textarea name="keyword_project_trigger" rows="1">${escHtml(settings.keyword_project_trigger || "")}</textarea>

    <label>Project Create Trigger Words</label>
    <textarea name="keyword_project_create_triggers" rows="2">${escHtml(settings.keyword_project_create_triggers || "")}</textarea>

    <label>Project Exclude Trigger Words (skip create-detection when these appear)</label>
    <textarea name="keyword_project_exclude_triggers" rows="2">${escHtml(settings.keyword_project_exclude_triggers || "")}</textarea>

    <label>Voice Reply Trigger Words</label>
    <textarea name="keyword_voice_reply_triggers" rows="2">${escHtml(settings.keyword_voice_reply_triggers || "")}</textarea>

    <label>Image Request Trigger Words</label>
    <textarea name="keyword_image_request_triggers" rows="2">${escHtml(settings.keyword_image_request_triggers || "")}</textarea>

    <label>Help Trigger Words</label>
    <textarea name="keyword_help_triggers" rows="2">${escHtml(settings.keyword_help_triggers || "")}</textarea>

    <label>Memory Context Exclude Words (hide these short-term memory items from AI context)</label>
    <textarea name="keyword_memory_exclude_triggers" rows="2">${escHtml(settings.keyword_memory_exclude_triggers || "")}</textarea>
  `;
}

function renderLearningTab(settings) {
  return `
    <p class="muted">Periodic analysis of conversations. When enabled, Ava can learn stable communication preferences about you over time. These are stored separately from the immutable core identity and are reviewable below.</p>

    <div style="display:flex;flex-direction:column;gap:12px;margin:16px 0;">
      ${toggle({
        name: "checkin_enabled",
        checked: settings.checkin_enabled === "true",
        label: "Enable daily check-in",
      })}
      ${toggle({
        name: "nightly_summary_enabled",
        checked: settings.nightly_summary_enabled === "true",
        label: "Enable nightly summary",
      })}
      ${toggle({
        name: "personality_optimization_enabled",
        checked: settings.personality_optimization_enabled === "true",
        label: "Enable personality optimization (learn communication preferences)",
        hint: "Runs during the nightly analysis. Only stable, repeated patterns are saved; a single unusual message never permanently changes the profile. Uses the personality_optimization capability when assigned, otherwise falls back to chat.",
      })}
    </div>
  `;
}

function renderAdaptiveSection(facts) {
  const rows = facts.length === 0
    ? `<tr><td colspan="7" class="muted">No learned preferences yet. They will appear here after nightly analysis with personality optimization enabled.</td></tr>`
    : facts.map((f) => `
        <tr>
          <td>${escHtml(f.category)}</td>
          <td>${escHtml(f.fact_value)}</td>
          <td>${Math.round(Number(f.confidence || 0) * 100)}%</td>
          <td class="muted">${escHtml(f.source || "")}</td>
          <td class="muted">${escHtml((f.updated_at || f.created_at || "").substring(0, 10))}</td>
          <td>${f.is_permanent ? badge("success", "Active") : badge("neutral", "Disabled")}</td>
          <td>
            <form method="POST" action="/admin/ava_brain/settings?tab=learning" style="display:inline">
              <input type="hidden" name="action" value="toggle_adaptive">
              <input type="hidden" name="id" value="${f.id}">
              <button type="submit" class="small secondary">${f.is_permanent ? "Disable" : "Enable"}</button>
            </form>
            <form method="POST" action="/admin/ava_brain/settings?tab=learning" style="display:inline">
              <input type="hidden" name="action" value="delete_adaptive">
              <input type="hidden" name="id" value="${f.id}">
              <button type="submit" class="small danger" onclick="return confirm('Delete this learned preference?')">Delete</button>
            </form>
          </td>
        </tr>
      `).join("");

  return `
    <div class="card">
      <h3>Learned Communication Profile</h3>
      <p class="muted">These preferences were learned automatically from your conversations by the nightly analysis. They influence how Ava communicates with you. All profile facts (including manual ones) are also editable on the <a href="/admin/ava_brain/memory">Memory</a> page.</p>
      <div class="table-wrap">
        <table>
          <tr><th>Category</th><th>Observation</th><th>Confidence</th><th>Evidence / Source</th><th>Updated</th><th>Status</th><th></th></tr>
          ${rows}
        </table>
      </div>
    </div>
  `;
}
