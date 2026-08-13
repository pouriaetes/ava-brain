// src/admin/capabilities.js
import { layout, escHtml, pageHeader, toggle, tabs, flash } from "../lib/html.js";
import { log } from "../lib/logger.js";
import { STEP_CAPABILITIES, WORKFLOW_STEP_CAPABILITIES, getWorkflowCapabilities } from "../capabilities.js";
import { validateWorkflowGraph, parseDependsOn, runWorkflow } from "../lib/workflow-engine.js";
import { AIProviderManager } from "../lib/ai.js";
import { encrypt, decrypt } from "../lib/crypto.js";
import { sanitizeError } from "../lib/repos.js";

// Provider-level capability vocabulary — single source is the capability registry.
const CAPABILITY_DEFS = STEP_CAPABILITIES;
const CAP_IDS = STEP_CAPABILITIES.map((c) => c.id);

function capLabel(id) {
  const def = CAPABILITY_DEFS.find((c) => c.id === id);
  return def ? def.label : id;
}

function parseCaps(raw) {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Load every provider that currently has `capability` assigned, ordered by its
// explicit capability priority first (capability_priorities), then by its global
// priority. Providers without an explicit capability priority sort after the ones
// that have one.
async function getOrderedModelsForCapability(db, capability) {
  const providers = (await db.prepare("SELECT * FROM api_providers ORDER BY priority ASC, id ASC").all()).results || [];
  const prioRows = (await db.prepare(
    "SELECT provider_id, priority FROM capability_priorities WHERE capability = ? AND enabled = 1"
  ).bind(capability).all()).results || [];
  const prioMap = {};
  for (const r of prioRows) prioMap[r.provider_id] = r.priority;
  const withCap = providers.filter((p) => parseCaps(p.capabilities).includes(capability));
  return withCap.sort((a, b) => {
    const pa = prioMap[a.id] !== undefined ? prioMap[a.id] : 1000 + a.priority;
    const pb = prioMap[b.id] !== undefined ? prioMap[b.id] : 1000 + b.priority;
    if (pa !== pb) return pa - pb;
    return a.id - b.id;
  });
}

async function writeOrder(db, capability, ids) {
  for (let i = 0; i < ids.length; i++) {
    await db.prepare(
      "INSERT INTO capability_priorities (capability, provider_id, priority, enabled) VALUES (?, ?, ?, 1) " +
      "ON CONFLICT(capability, provider_id) DO UPDATE SET priority = excluded.priority, enabled = 1, updated_at = datetime('now')"
    ).bind(capability, ids[i], i + 1).run();
  }
}

async function renumberCapability(db, capability) {
  const rows = (await db.prepare(
    "SELECT provider_id FROM capability_priorities WHERE capability = ? ORDER BY priority ASC"
  ).bind(capability).all()).results || [];
  for (let i = 0; i < rows.length; i++) {
    await db.prepare(
      "UPDATE capability_priorities SET priority = ?, updated_at = datetime('now') WHERE capability = ? AND provider_id = ?"
    ).bind(i + 1, capability, rows[i].provider_id).run();
  }
}

async function reorderPriority(db, capability, providerId, direction) {
  const ordered = await getOrderedModelsForCapability(db, capability);
  const idx = ordered.findIndex((p) => p.id === providerId);
  if (idx === -1) return;
  const target = direction === "up" ? idx - 1 : idx + 1;
  if (target < 0 || target >= ordered.length) return;
  [ordered[idx], ordered[target]] = [ordered[target], ordered[idx]];
  await writeOrder(db, capability, ordered.map((p) => p.id));
}

async function setOrderForCapability(db, capability, order) {
  const ordered = await getOrderedModelsForCapability(db, capability);
  const orderedIds = order.filter((id) => ordered.some((p) => p.id === id));
  const extra = ordered.filter((p) => !orderedIds.includes(p.id)).map((p) => p.id);
  await writeOrder(db, capability, orderedIds.concat(extra));
}

// Central capability assignment. `selected` is the exact set of capabilities a model
// should have. Keeps api_providers.capabilities and capability_priorities in sync so
// a model can only have a priority for a capability it actually has.
async function setModelCapabilities(db, providerId, selected) {
  const provider = await db.prepare("SELECT capabilities FROM api_providers WHERE id = ?").bind(providerId).first();
  if (!provider) return;
  const current = parseCaps(provider.capabilities);
  const removed = current.filter((c) => !selected.includes(c));
  const added = selected.filter((c) => !current.includes(c));

  await db.prepare("UPDATE api_providers SET capabilities = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(JSON.stringify(selected), providerId).run();

  for (const c of added) {
    const exists = await db.prepare("SELECT id FROM capability_priorities WHERE capability = ? AND provider_id = ?")
      .bind(c, providerId).first();
    if (!exists) {
      const maxRow = await db.prepare("SELECT MAX(priority) as m FROM capability_priorities WHERE capability = ?")
        .bind(c).first();
      const next = (maxRow?.m || 0) + 1;
      await db.prepare("INSERT INTO capability_priorities (capability, provider_id, priority, enabled) VALUES (?, ?, ?, 1)")
        .bind(c, providerId, next).run();
    }
  }
  for (const c of removed) {
    await db.prepare("DELETE FROM capability_priorities WHERE capability = ? AND provider_id = ?")
      .bind(c, providerId).run();
    await renumberCapability(db, c);
  }
}

// <option> list of enabled providers for a workflow-step model select. Each
// option carries data-caps so a small script can filter by the step's capability.
function providerOptions(providers, selectedId) {
  return providers.filter((p) => p.enabled).map((p) => {
    const caps = parseCaps(p.capabilities);
    return `<option value="${p.id}"${p.id === selectedId ? " selected" : ""} data-caps="${escHtml(caps.join(","))}">${escHtml(p.name)} (${escHtml(p.model || "")})</option>`;
  }).join("");
}

// provider_id -> list of "workflow · step N · capability" strings, so the Models
// page can show where each model is actually used.
function buildUsedInMap(workflows, workflowSteps) {
  const wfName = {};
  for (const w of workflows) wfName[w.id] = w.name;
  const map = {};
  for (const s of workflowSteps) {
    if (s.provider_id) {
      (map[s.provider_id] = map[s.provider_id] || []).push(`${wfName[s.workflow_id] || ("workflow " + s.workflow_id)} · step ${s.step_order} · ${s.capability}`);
    }
  }
  return map;
}

// Server-side step validation. Returns an error string, or null when valid.
// - step_order must be a positive integer
// - depends_on ids must be integers, exist in the SAME workflow, and not be the
//   step itself
// - the chosen provider must actually list the step capability
// - fallback_step_id must point at another step of the SAME workflow
// - for a new step, step_order must not already be used in that workflow
//   (excludeStepId lets update_step skip the step being edited)
async function validateStepInput(db, { workflowId, stepOrder, capability, providerId, fallbackStepId, dependsOn = [], excludeStepId = null }) {
  if (!Number.isInteger(stepOrder) || stepOrder <= 0) return "Step Order must be a positive integer.";
  if (!capability) return "Capability is required.";
  const workflowSteps = (await db.prepare("SELECT id FROM workflow_steps WHERE workflow_id = ?").bind(workflowId).all()).results || [];
  const ids = new Set(workflowSteps.map((s) => s.id));
  for (const depId of dependsOn) {
    if (!Number.isInteger(depId)) return "Dependencies must be step ids.";
    if (!ids.has(depId)) return "A dependency points at a step outside this workflow.";
    if (excludeStepId !== null && depId === excludeStepId) return "A step cannot depend on itself.";
  }
  if (providerId) {
    const provider = await db.prepare("SELECT capabilities FROM api_providers WHERE id = ?").bind(providerId).first();
    if (!provider) return "Selected model no longer exists.";
    const caps = parseCaps(provider.capabilities);
    if (!caps.includes(capability)) return `The selected model does not support capability "${capability}". Pick a different model or leave it as default.`;
  }
  if (fallbackStepId) {
    const fb = await db.prepare("SELECT workflow_id FROM workflow_steps WHERE id = ?").bind(fallbackStepId).first();
    if (!fb) return "Fallback step no longer exists.";
    if (fb.workflow_id !== workflowId) return "Fallback step must belong to the same workflow.";
  }
  if (excludeStepId === null) {
    const existing = await db.prepare("SELECT id FROM workflow_steps WHERE workflow_id = ? AND step_order = ?").bind(workflowId, stepOrder).first();
    if (existing) return "This step_order is already used in this workflow; edit that step instead or choose a different number.";
  }
  return null;
}

// Simulate a pending workflow edit and validate the resulting graph (dependencies
// intact, no cycles). Returns { error } or { ok: true }.
async function withGraphCheck(db, workflowId, transform) {
  const steps = (await db.prepare("SELECT * FROM workflow_steps WHERE workflow_id = ?").bind(workflowId).all()).results || [];
  const next = transform(steps);
  const result = validateWorkflowGraph(next);
  if (!result.valid) {
    return { error: "This change would make the workflow graph invalid: " + result.errors.join("; ") };
  }
  return { ok: true };
}

function renderTopTabs(tab, cap, judgeRoutingEnabled, flashMsg) {
  // The ON/OFF toggle controls ONLY the global judge_routing_enabled setting.
  // Telegram's /judge_on and /judge_off instead set a per-chat override (state_json);
  // the effective Judge state is Global AND NOT chat-disabled. This toggle never
  // touches per-chat overrides. Preserve the current tab/cap after toggling.
  const toggleAction = tab === "capabilities"
    ? `/admin/ava_brain/capabilities?tab=capabilities&cap=${encodeURIComponent(cap)}`
    : `/admin/ava_brain/capabilities?tab=${encodeURIComponent(tab)}`;
  return `
    ${flashMsg ? flash("success", flashMsg) : ""}
    ${pageHeader("Workflow", {
      controls: `
        <form method="POST" action="${toggleAction}" class="toggle-form">
          <input type="hidden" name="action" value="judge_routing_toggle">
          ${toggle({
            name: "enabled",
            checked: judgeRoutingEnabled,
            label: "Global Judge Routing",
            hint: "Judge routes normal messages before replying; per-chat /judge_on|/judge_off overrides still apply.",
            dataSubmit: true,
          })}
        </form>`,
    })}
    ${tabs([
      { href: "/admin/ava_brain/capabilities?tab=workflows", label: "Workflows", active: tab === "workflows" },
      { href: "/admin/ava_brain/capabilities?tab=capabilities&cap=chat", label: "Model Priorities", active: tab === "capabilities" },
      { href: "/admin/ava_brain/capabilities?tab=models", label: "Models", active: tab === "models" },
    ])}
  `;
}

function renderModelsPage(providers, usedIn) {
  const rowForms = [];
  let html = `<div class="card">
    <h3>Models — Capability Assignment</h3>
    <p class="muted">Check or uncheck a box to assign or remove a capability for that model. Every change is saved immediately. Priorities per capability are managed on the <a href="/admin/ava_brain/capabilities?tab=capabilities&cap=chat">Model Priorities</a> tab, and which workflow steps use each model is listed below.</p>
    <div class="table-wrap">
    <table>
      <tr>
        <th>Model</th>
        ${CAPABILITY_DEFS.map((c) => `<th style="text-align:center;">${escHtml(c.label)}</th>`).join("")}
      </tr>`;
  for (const p of providers) {
    const caps = parseCaps(p.capabilities);
    const formId = `caps-${p.id}`;
    const used = usedIn[p.id] || [];
    html += `<tr>`;
    html += `<td>
        <strong>${escHtml(p.name)}</strong>
        ${p.enabled ? "" : ' <span class="badge inactive">disabled</span>'}
        <div class="muted" style="font-size:0.8rem;">${escHtml(p.kind)} · ${escHtml(p.model || "")} · Global priority ${p.priority}</div>
        <div class="muted" style="font-size:0.78rem;">Used in: ${used.length ? escHtml(used.join("; ")) : "—"}</div>
      </td>`;
    for (const c of CAPABILITY_DEFS) {
      const checked = caps.includes(c.id);
      html += `<td style="text-align:center;"><input type="checkbox" name="cap_${c.id}" form="${formId}" ${checked ? "checked" : ""} onchange="document.getElementById('${formId}').submit()"></td>`;
    }
    html += `</tr>`;
    rowForms.push(`
      <form id="${formId}" method="POST" action="/admin/ava_brain/capabilities?tab=models" style="display:none">
        <input type="hidden" name="action" value="set_capabilities">
        <input type="hidden" name="provider_id" value="${p.id}">
      </form>`);
  }
  html += `</table></div>
  </div>`;
  html += rowForms.join("");
  return html;
}

function renderCapabilityPage(capability, providers) {
  const label = capLabel(capability);
  const subTabs = tabs(CAPABILITY_DEFS.map((c) => ({
    href: `/admin/ava_brain/capabilities?tab=capabilities&cap=${c.id}`,
    label: c.label,
    active: c.id === capability,
  })));
  let html = `<div class="card">
    <h3>${escHtml(label)} — Priority Order</h3>
    <p class="muted">Priority 1 is tried first. If it fails, Ava falls back to Priority 2, then 3, and so on. Drag a row to reorder, or use the arrows. Only models with "${escHtml(label)}" checked on the Models page appear here.</p>
    ${subTabs}
    <style>
      .priority-row{display:flex;align-items:center;gap:12px;padding:10px 12px;border:1px solid var(--border-color);border-radius:var(--radius-md);margin-bottom:8px;background:var(--bg-secondary);}
      .priority-row.dragging{opacity:0.5;}
      .drag-handle{cursor:grab;color:var(--text-muted);}
      .priority-rank{font-weight:600;min-width:26px;}
      .priority-actions{margin-left:auto;display:flex;gap:6px;}
    </style>`;
  if (providers.length === 0) {
    html += `<p class="muted">No models have "${escHtml(label)}" assigned yet. Enable it for a model on the <a href="/admin/ava_brain/capabilities?tab=models">Models</a> page.</p>`;
  } else {
    html += `<div id="priority-list">`;
    providers.forEach((p, i) => {
      const upDisabled = i === 0 ? "disabled" : "";
      const downDisabled = i === providers.length - 1 ? "disabled" : "";
      html += `<div class="priority-row" draggable="true" data-id="${p.id}">
        <span class="drag-handle" title="Drag to reorder">☰</span>
        <span class="priority-rank">${i + 1}.</span>
        <strong>${escHtml(p.name)}</strong>
        ${p.enabled ? "" : ' <span class="badge inactive">disabled</span>'}
        <span class="muted" style="font-size:0.8rem;">(${escHtml(p.kind)} · ${escHtml(p.model || "")})</span>
        <span class="badge">Priority ${i + 1}</span>
        <span class="priority-actions">
          <form method="POST" action="/admin/ava_brain/capabilities?tab=capabilities&cap=${capability}" style="display:inline">
            <input type="hidden" name="action" value="reorder_priority">
            <input type="hidden" name="provider_id" value="${p.id}">
            <input type="hidden" name="direction" value="up">
            <button type="submit" class="small secondary" ${upDisabled} title="Move up">↑</button>
          </form>
          <form method="POST" action="/admin/ava_brain/capabilities?tab=capabilities&cap=${capability}" style="display:inline">
            <input type="hidden" name="action" value="reorder_priority">
            <input type="hidden" name="provider_id" value="${p.id}">
            <input type="hidden" name="direction" value="down">
            <button type="submit" class="small secondary" ${downDisabled} title="Move down">↓</button>
          </form>
        </span>
      </div>`;
    });
    html += `</div>`;
    html += `
      <form id="order-form" method="POST" action="/admin/ava_brain/capabilities?tab=capabilities&cap=${capability}">
        <input type="hidden" name="action" value="set_order">
        <input type="hidden" name="order" id="order-input" value="">
      </form>
      <script>
      (function(){
        var list = document.getElementById("priority-list");
        if (!list) return;
        var dragId = null;
        list.addEventListener("dragstart", function(e){
          var row = e.target.closest(".priority-row");
          if (!row) return;
          dragId = row.getAttribute("data-id");
          row.classList.add("dragging");
          e.dataTransfer.effectAllowed = "move";
        });
        list.addEventListener("dragend", function(e){
          var row = e.target.closest(".priority-row");
          if (row) row.classList.remove("dragging");
        });
        list.addEventListener("dragover", function(e){ e.preventDefault(); });
        list.addEventListener("drop", function(e){
          e.preventDefault();
          var target = e.target.closest(".priority-row");
          if (!target || !dragId || dragId === target.getAttribute("data-id")) return;
          var arr = Array.prototype.slice.call(list.querySelectorAll(".priority-row"));
          var from = arr.findIndex(function(r){ return r.getAttribute("data-id") === dragId; });
          var to = arr.findIndex(function(r){ return r.getAttribute("data-id") === target.getAttribute("data-id"); });
          if (from < 0 || to < 0) return;
          arr.splice(to, 0, arr.splice(from, 1)[0]);
          var order = arr.map(function(r){ return r.getAttribute("data-id"); }).join(",");
          document.getElementById("order-input").value = order;
          document.getElementById("order-form").submit();
        });
      })();
      </script>`;
  }
  html += `</div>`;
  return html;
}

function renderWorkflowsPage(workflows, workflowSteps, providers, highlightId = null) {
  const stepCapabilities = WORKFLOW_STEP_CAPABILITIES;
  const stepCapOptions = stepCapabilities.map((c) => `<option value="${c.id}">${escHtml(c.label)}</option>`).join("");
  const outputOptions = ["intermediate", "final"]
    .map((v) => `<option value="${v}">${v}</option>`).join("");
  const providerById = {};
  for (const p of providers) providerById[p.id] = p;

  // Steps of the same workflow, sorted by step_order (for dependency checkboxes).
  const otherSteps = (s, isEdit) => workflowSteps
    .filter((x) => x.workflow_id === s.workflow_id && (!isEdit || x.id !== s.id))
    .sort((a, b) => a.step_order - b.step_order);

  // Fallback options = every other step in this workflow.
  const fallbackOptions = (s, isEdit) => {
    return otherSteps(s, isEdit)
      .map((x) => `<option value="${x.id}"${x.id === s.fallback_step_id ? " selected" : ""}>step ${x.step_order} · ${escHtml(x.capability)}</option>`).join("");
  };

  const depIds = (s) => parseDependsOn(s);

  const stepFormFields = (s, isEdit) => `
    <input type="hidden" name="action" value="${isEdit ? "update_step" : "add_step"}">
    ${isEdit ? `<input type="hidden" name="id" value="${s.id}">` : `<input type="hidden" name="workflow_id" value="${s.workflow_id}">`}
    <div><label>Step Order</label><input type="number" name="step_order" value="${s.step_order}" style="width:70px;"></div>
    <div><label>Capability</label>
      <select name="capability" class="step-cap">
        ${stepCapOptions.replace(`<option value="${s.capability}">`, `<option value="${s.capability}" selected>`)}
      </select>
    </div>
    <div><label>Model (optional)</label>
      <select name="provider_id" class="step-provider">
        <option value="">-- Default (priority order) --</option>
        ${providerOptions(providers, s.provider_id || null)}
      </select>
    </div>
    <div><label>Runs after (dependencies)</label>
      <div style="border:1px solid var(--border-color);border-radius:6px;padding:6px;max-height:120px;overflow:auto;">
        ${otherSteps(s, isEdit).length === 0 ? '<span class="muted" style="font-size:0.78rem;">No other steps yet.</span>' : otherSteps(s, isEdit).map((x) => {
          const checked = depIds(s).includes(x.id) ? " checked" : "";
          return `<label style="display:flex;gap:6px;align-items:center;font-size:0.8rem;padding:2px 0;"><input type="checkbox" name="depends_on" value="${x.id}"${checked}> step ${x.step_order} · ${escHtml(x.capability)}</label>`;
        }).join("")}
      </div>
    </div>
    <div><label>If this fails, go to</label>
      <select name="fallback_step_id">
        <option value="">-- none --</option>
        ${fallbackOptions(s, isEdit)}
      </select>
    </div>
    <div><label>Output</label>
      <select name="output_role">
        ${outputOptions.replace(`<option value="${s.output_role}">`, `<option value="${s.output_role}" selected>`)}
      </select>
    </div>
    <div style="flex:1;min-width:240px;"><label>Prompt Template</label><textarea name="prompt_template" rows="2" placeholder="{{user_message}} {{previous_output}} {{step:N}}">${escHtml(s.prompt_template || "")}</textarea></div>
    <button type="submit" class="small">${isEdit ? "Save Step" : "Add Step"}</button>
  `;

  let content = `
    <div class="card" style="background:var(--bg-secondary);">
      <p class="muted" style="margin:0;font-size:0.85rem;">The <strong>Capability</strong> field above (workflow level) decides which Judge route this workflow replaces. Each <strong>Step's</strong> Capability field (below) decides exactly which AI service that step uses — e.g. inside a <code>smart_ai</code> workflow you can still use a step with capability <code>web_search</code> to search first and then analyze.</p>
    </div>
  `;

  content += `
    <div class="card">
      <h3>Create Custom Workflow</h3>
      <p class="muted">A workflow is a task Ava knows how to do: it has trigger keywords that select it directly (before Judge), and a chain of steps — each step uses its own model and prompt. Prompt variables: {{user_message}} (original message), {{previous_step}} (previous group's output), {{step:N}} (output of the step with order N).</p>
      <form method="POST" action="/admin/ava_brain/capabilities?tab=workflows">
        <input type="hidden" name="action" value="create_workflow">
        <label>Name</label><input type="text" name="name" required placeholder="کدنویسی">
        <label>Description</label><textarea name="description" rows="2" placeholder="کدنویسی پیشرفته"></textarea>
        <label>Capability (which Judge route this workflow replaces)</label>
        <select name="capability">
          ${getWorkflowCapabilities().map((c) => `<option value="${c.id}">${escHtml(c.id)} — ${escHtml(c.labels.en)}</option>`).join("")}
        </select>
        <label>Trigger Keywords (comma-separated — if the user's message contains one, this workflow runs directly, skipping Judge)</label>
        <input type="text" name="trigger_keywords" placeholder="coding, python, برنامه‌نویسی">
        <button type="submit" style="margin-top:12px;">Create Workflow</button>
      </form>
    </div>
  `;

  // Each workflow renders as a compact "command box" — the /wf:name you'd type in
  // chat — so the whole list reads like the bot's commands. Steps live behind an
  // expandable "manage" section to keep the list tidy.
  content += `
    <style>
      .wf-box{background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:var(--radius-lg);padding:16px 18px;margin-bottom:12px;}
      .wf-box-header{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;}
      .wf-box-command{font-family:'JetBrains Mono','Fira Code',Consolas,monospace;font-weight:700;font-size:0.95rem;background:var(--bg-input);border:1px solid var(--border-color);border-radius:6px;padding:4px 10px;color:var(--accent-primary);}
      .wf-box-meta{color:var(--text-muted);font-size:0.82rem;margin-top:6px;}
      .wf-box-manage{margin-top:12px;border-top:1px solid var(--border-color);padding-top:12px;}
      .wf-diagram{display:flex;flex-direction:column;gap:6px;margin:12px 0;}
      .wf-diagram-row{display:flex;align-items:stretch;gap:8px;flex-wrap:wrap;}
      .wf-diagram-arrow{align-self:center;color:var(--text-muted);font-size:1.1rem;font-weight:700;}
      .wf-diagram-arrow-down{text-align:center;color:var(--text-muted);font-weight:700;font-size:1rem;margin:2px 0;}
      .wf-diagram-box{flex:1;min-width:170px;max-width:230px;background:var(--bg-input);border:1px solid var(--border-color);border-radius:8px;padding:10px;}
      .wf-diagram-box-title{font-weight:700;font-size:0.85rem;color:var(--accent-primary);}
      .wf-diagram-box-cap{font-size:0.8rem;color:var(--text-secondary);margin-top:2px;}
      .wf-diagram-box-model{font-size:0.8rem;color:var(--text-muted);}
      .wf-diagram-box-fail{font-size:0.75rem;color:var(--warning-text);background:var(--warning-bg);border:1px solid var(--warning-border);border-radius:4px;padding:2px 6px;margin-top:6px;display:inline-block;}
    </style>
  `;

  // Render each workflow as a flow diagram: one row per parallel group, boxes
  // connected by arrows, each box showing its model and "on fail → step Y" badge.
  const stepById = {};
  for (const s of workflowSteps) stepById[s.id] = s;

  for (const wf of workflows) {
    // "Chat" is a direct system path, not a workflow — never show it here.
    if (wf.capability === "normal_chat") continue;
    const steps = workflowSteps.filter((s) => s.workflow_id === wf.id);
    const command = `/wf:${wf.name}`;
    const keywords = (wf.trigger_keywords || "").split(",").map((k) => k.trim()).filter(Boolean);

    // Group steps by group_id so parallel steps sit side by side.
    const groups = {};
    for (const s of steps) {
      if (!groups[s.group_id]) groups[s.group_id] = [];
      groups[s.group_id].push(s);
    }
    const orderedGroups = Object.keys(groups).map(Number).sort((a, b) => a - b);

    const renderBox = (s) => {
      const prov = providerById[s.provider_id];
      const failStep = s.fallback_step_id ? stepById[s.fallback_step_id] : null;
      return `
        <div class="wf-diagram-box">
          <div class="wf-diagram-box-title">step ${s.step_order}</div>
          <div class="wf-diagram-box-cap">${escHtml(s.capability)}</div>
          <div class="wf-diagram-box-model">${prov ? escHtml(prov.name) : "default model"}</div>
          ${failStep ? `<div class="wf-diagram-box-fail">on fail → step ${failStep.step_order} (${escHtml(failStep.capability)})</div>` : ""}
          <div style="margin-top:8px;display:flex;gap:6px;">
            <details style="flex:1;">
              <summary class="btn small secondary" style="display:inline-flex;width:100%;justify-content:center;">Edit</summary>
              <form method="POST" action="/admin/ava_brain/capabilities?tab=workflows" style="margin-top:8px;padding:10px;border:1px solid var(--border-color);border-radius:8px;display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end;">
                ${stepFormFields(s, true)}
              </form>
            </details>
            <form method="POST" action="/admin/ava_brain/capabilities?tab=workflows" onsubmit="return confirm('Delete this step?');" style="display:inline-flex;">
              <input type="hidden" name="action" value="delete_step">
              <input type="hidden" name="id" value="${s.id}">
              <button type="submit" class="btn small danger">Delete</button>
            </form>
          </div>
        </div>`;
    };

    // A horizontal row of boxes for one group, separated by → arrows.
    const renderRow = (groupSteps) => {
      const boxes = groupSteps
        .sort((a, b) => a.step_order - b.step_order)
        .map((s) => renderBox(s));
      return `
        <div class="wf-diagram-row">
          ${boxes.map((b, i) => (i === 0 ? b : `<span class="wf-diagram-arrow">→</span>${b}`)).join("")}
        </div>`;
    };

    const isHighlight = highlightId === wf.id;
    const openAttr = isHighlight ? " open" : "";
    const highlightStyle = isHighlight
      ? "border:2px solid var(--accent-primary);box-shadow:0 0 0 3px var(--accent-glow);"
      : "";
    const noStepsBanner = steps.length === 0
      ? `<div class="flash warning" style="margin:10px 0 0;">This workflow has no steps and will fail if selected. Add at least one Step below.</div>`
      : "";
    const createdNote = isHighlight
      ? `<p class="muted" style="margin:8px 0 0;color:var(--success-text);">This workflow was just created — add at least one Step to it now.</p>`
      : "";

    content += `
      <div class="wf-box" id="wf-${wf.id}" style="${highlightStyle}">
        ${noStepsBanner}
        ${createdNote}
        <div class="wf-box-header">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <span class="wf-box-command">${escHtml(command)}</span>
            <span class="badge info">${escHtml(wf.capability)}</span>
            ${wf.is_default ? '<span class="badge active">default</span>' : ""}
            ${!wf.is_default ? `
            <form method="POST" action="/admin/ava_brain/capabilities?tab=workflows" onsubmit="return confirm('Delete workflow &quot;${escHtml(wf.name)}&quot;? This cannot be undone.');" style="display:inline-flex;">
              <input type="hidden" name="action" value="delete_workflow">
              <input type="hidden" name="id" value="${wf.id}">
              <button type="submit" class="btn small danger">Delete Workflow</button>
            </form>` : ""}
          </div>
          <details style="min-width:0;"${openAttr}>
            <summary class="btn small secondary" style="display:inline-flex;">Manage</summary>
            <div class="wf-box-manage">
              <p class="muted" style="margin-bottom:8px;">${wf.description ? escHtml(wf.description) : ""}</p>
              ${keywords.length ? `<p class="muted" style="margin-bottom:8px;">Keywords: ${keywords.map((k) => `<code>${escHtml(k)}</code>`).join(" ")}</p>` : ""}
              <div class="wf-diagram">
                ${orderedGroups.map((g, gi) => `${gi > 0 ? '<div class="wf-diagram-arrow-down">↓</div>' : ""}${renderRow(groups[g])}`).join("")}
              </div>
              <form method="POST" action="/admin/ava_brain/capabilities?tab=workflows" style="margin-top:12px;display:flex;gap:8px;align-items:flex-end;border:1px solid var(--border-color);border-radius:8px;padding:10px;">
                <input type="hidden" name="action" value="test_workflow">
                <input type="hidden" name="id" value="${wf.id}">
                <div style="flex:1;min-width:200px;"><label>Test input (runs the real engine, no Telegram needed)</label><input type="text" name="test_input" value="${escHtml(wf.name)}" placeholder="e.g. sample request"></div>
                <button type="submit" class="small">▶ Test Run</button>
              </form>
              <form method="POST" action="/admin/ava_brain/capabilities?tab=workflows" style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;">
                ${stepFormFields({ workflow_id: wf.id, step_order: steps.length + 1, capability: "chat", provider_id: null, fallback_step_id: null, output_role: "intermediate", prompt_template: "" }, false)}
              </form>
            </div>
          </details>
        </div>
      </div>
    `;
  }

  content += `
    <script>
    (function () {
      function filter(capSel) {
        var form = capSel.closest("form");
        var provSel = form ? form.querySelector("select.step-provider") : null;
        if (!provSel) return;
        var cap = capSel.value;
        var opts = provSel.querySelectorAll("option");
        for (var i = 0; i < opts.length; i++) {
          var o = opts[i];
          if (!o.value) { o.style.display = ""; continue; }
          var caps = (o.getAttribute("data-caps") || "").split(",");
          o.style.display = caps.indexOf(cap) !== -1 ? "" : "none";
        }
      }
      var sels = document.querySelectorAll("select.step-cap");
      for (var i = 0; i < sels.length; i++) {
        (function (s) {
          s.addEventListener("change", function () { filter(s); });
          filter(s);
        })(sels[i]);
      }
    })();
    </script>
  `;

  return content;
}

export async function handleCapabilitiesPage(request, env, config) {
  const db = env.DB;
  const url = new URL(request.url);
  const tab = url.searchParams.get("tab") || "workflows";
  const cap = url.searchParams.get("cap") || "chat";
  const highlightRaw = url.searchParams.get("highlight");
  const highlightId = highlightRaw ? parseInt(highlightRaw, 10) : null;
  let flashMsg = "";

  if (request.method === "POST") {
    const formData = await request.formData();
    const action = formData.get("action");

    if (action === "judge_routing_toggle") {
      // Writes the global judge_routing_enabled setting only. The Telegram
      // /judge_on|/judge_off commands operate on per-chat overrides instead; the
      // message pipeline combines both. No session override is touched here.
      // The shared toggle renders a real checkbox, so checked == enabled.
      const enabled = formData.has("enabled");
      try {
        await db.prepare("UPDATE settings SET value = ?, updated_at = datetime('now') WHERE key = 'judge_routing_enabled'")
          .bind(enabled ? "true" : "false").run();
        await log(db, "info", "judge_routing_toggled", { enabled });
        flashMsg = `Judge Routing is now ${enabled ? "ON" : "OFF"}.`;
      } catch (toggleError) {
        flashMsg = "Failed to update Judge Routing state.";
      }
    } else if (action === "set_capabilities") {
      const providerId = parseInt(formData.get("provider_id"), 10);
      const selected = CAP_IDS.filter((id) => formData.get("cap_" + id));
      await setModelCapabilities(db, providerId, selected);
      await log(db, "info", "model_capabilities_updated", { providerId, capabilities: selected });
    } else if (action === "reorder_priority") {
      const capability = cap;
      const providerId = parseInt(formData.get("provider_id"), 10);
      const direction = formData.get("direction");
      if (capability && Number.isInteger(providerId)) {
        await reorderPriority(db, capability, providerId, direction);
        await log(db, "info", "capability_priority_reordered", { capability, providerId, direction });
      }
    } else if (action === "set_order") {
      const order = String(formData.get("order") || "").split(",").map((s) => parseInt(s, 10)).filter((n) => Number.isInteger(n));
      if (cap && order.length > 0) {
        await setOrderForCapability(db, cap, order);
        await log(db, "info", "capability_priority_order_set", { capability: cap, order });
      }
    } else if (action === "create_workflow") {
      const name = formData.get("name");
      const capability = formData.get("capability");
      const triggerKeywords = formData.get("trigger_keywords") || "";
      const description = formData.get("description") || "";
      const insertResult = await db.prepare(
        "INSERT INTO workflows (name, capability, trigger_keywords, description, is_default, enabled) VALUES (?, ?, ?, ?, 0, 1)"
      ).bind(name, capability, triggerKeywords, description).run();
      const newId = insertResult.meta?.last_row_id;
      await log(db, "info", "workflow_created", { name, capability });
      // Jump straight to the new workflow so the admin can add its first step.
      return new Response(null, {
        status: 302,
        headers: { Location: `/admin/ava_brain/capabilities?tab=workflows&highlight=${newId}#wf-${newId}` }
      });
    } else if (action === "delete_workflow") {
      const id = parseInt(formData.get("id"), 10);
      const wf = await db.prepare("SELECT * FROM workflows WHERE id = ?").bind(id).first();
      if (wf && !wf.is_default) {
        await db.prepare("DELETE FROM workflow_steps WHERE workflow_id = ?").bind(id).run();
        await db.prepare("DELETE FROM workflows WHERE id = ?").bind(id).run();
        await log(db, "info", "workflow_deleted", { id, name: wf.name });
        flashMsg = `Workflow "${wf.name}" deleted.`;
      } else if (wf && wf.is_default) {
        flashMsg = "Default workflows cannot be deleted, only disabled.";
      }
    } else if (action === "add_step") {
      const workflowId = parseInt(formData.get("workflow_id"), 10);
      const stepOrder = parseInt(formData.get("step_order") || "1", 10);
      const capability = formData.get("capability");
      const outputRole = formData.get("output_role") || "intermediate";
      const promptTemplate = formData.get("prompt_template") || "";
      const providerIdRaw = formData.get("provider_id") || "";
      const providerId = providerIdRaw === "" ? null : parseInt(providerIdRaw, 10);
      const fallbackRaw = formData.get("fallback_step_id") || "";
      const fallbackStepId = fallbackRaw === "" ? null : parseInt(fallbackRaw, 10);
      const dependsOn = formData.getAll("depends_on").map((v) => parseInt(v, 10)).filter((n) => Number.isInteger(n));
      const stepError = await validateStepInput(db, { workflowId, stepOrder, capability, providerId, fallbackStepId, dependsOn });
      if (stepError) {
        flashMsg = stepError;
      } else {
        const graphCheck = await withGraphCheck(db, workflowId, (steps) => {
          const nextId = Math.max(0, ...steps.map((s) => s.id)) + 1;
          return steps.concat([{ id: nextId, step_order: stepOrder, capability, provider_id: providerId, fallback_step_id: fallbackStepId, depends_on: JSON.stringify(dependsOn), output_role: outputRole }]);
        });
        if (!graphCheck.ok) {
          flashMsg = graphCheck.error;
        } else {
          await db.prepare(
            "INSERT INTO workflow_steps (workflow_id, step_order, capability, provider_id, input_source, output_role, prompt_template, fallback_step_id, depends_on) VALUES (?, ?, ?, ?, 'user_message', ?, ?, ?, ?)"
          ).bind(workflowId, stepOrder, capability, providerId, outputRole, promptTemplate, fallbackStepId, JSON.stringify(dependsOn)).run();
          await log(db, "info", "workflow_step_added", { workflowId, capability, providerId, dependsOn });
        }
      }
    } else if (action === "update_step") {
      const id = parseInt(formData.get("id"), 10);
      const stepOrder = parseInt(formData.get("step_order") || "1", 10);
      const capability = formData.get("capability");
      const outputRole = formData.get("output_role") || "intermediate";
      const promptTemplate = formData.get("prompt_template") || "";
      const providerIdRaw = formData.get("provider_id") || "";
      const providerId = providerIdRaw === "" ? null : parseInt(providerIdRaw, 10);
      const fallbackRaw = formData.get("fallback_step_id") || "";
      const fallbackStepId = fallbackRaw === "" ? null : parseInt(fallbackRaw, 10);
      const dependsOn = formData.getAll("depends_on").map((v) => parseInt(v, 10)).filter((n) => Number.isInteger(n));
      const currentStep = await db.prepare("SELECT workflow_id FROM workflow_steps WHERE id = ?").bind(id).first();
      const workflowId = currentStep?.workflow_id || 0;
      const stepError = await validateStepInput(db, { workflowId, stepOrder, capability, providerId, fallbackStepId, dependsOn, excludeStepId: id });
      if (stepError) {
        flashMsg = stepError;
      } else {
        const graphCheck = await withGraphCheck(db, workflowId, (steps) => steps.map((s) =>
          s.id === id ? { ...s, step_order: stepOrder, capability, provider_id: providerId, fallback_step_id: fallbackStepId, depends_on: JSON.stringify(dependsOn), output_role: outputRole } : s
        ));
        if (!graphCheck.ok) {
          flashMsg = graphCheck.error;
        } else {
          await db.prepare(
            "UPDATE workflow_steps SET step_order = ?, capability = ?, provider_id = ?, output_role = ?, prompt_template = ?, fallback_step_id = ?, depends_on = ? WHERE id = ?"
          ).bind(stepOrder, capability, providerId, outputRole, promptTemplate, fallbackStepId, JSON.stringify(dependsOn), id).run();
          await log(db, "info", "workflow_step_updated", { id, capability, providerId, dependsOn });
        }
      }
    } else if (action === "delete_step") {
      const id = parseInt(formData.get("id"), 10);
      const step = await db.prepare("SELECT * FROM workflow_steps WHERE id = ?").bind(id).first();
      if (step) {
        const graphCheck = await withGraphCheck(db, step.workflow_id, (steps) =>
          steps.filter((s) => s.id !== id).map((s) => ({
            ...s,
            depends_on: JSON.stringify(parseDependsOn(s).filter((d) => d !== id)),
            fallback_step_id: s.fallback_step_id === id ? null : s.fallback_step_id,
          }))
        );
        if (!graphCheck.ok) {
          flashMsg = graphCheck.error;
        } else {
          // Clear orphaned references first (no FK on depends_on/fallback), then delete.
          await db.prepare("UPDATE workflow_steps SET fallback_step_id = NULL WHERE fallback_step_id = ?").bind(id).run();
          const remaining = (await db.prepare("SELECT id, depends_on FROM workflow_steps WHERE workflow_id = ?").bind(step.workflow_id).all()).results || [];
          for (const s of remaining) {
            const deps = parseDependsOn(s);
            if (deps.includes(id)) {
              await db.prepare("UPDATE workflow_steps SET depends_on = ? WHERE id = ?").bind(JSON.stringify(deps.filter((d) => d !== id)), s.id).run();
            }
          }
          await db.prepare("DELETE FROM workflow_steps WHERE id = ?").bind(id).run();
          await log(db, "info", "workflow_step_deleted", { id, workflow_id: step.workflow_id });
          flashMsg = "Step deleted.";
        }
      }
    } else if (action === "test_workflow") {
      const id = parseInt(formData.get("id"), 10);
      const testInput = String(formData.get("test_input") || "").trim() || "Example request";
      const wf = await db.prepare("SELECT * FROM workflows WHERE id = ?").bind(id).first();
      if (!wf) {
        flashMsg = "Workflow not found.";
      } else {
        try {
          const aiManager = new AIProviderManager(config, { encrypt, decrypt }, { info: log.info, error: log.error, warn: log.warn }, db);
          await aiManager.initialize();
          const result = await runWorkflow(wf.capability, testInput, {
            workflowId: wf.id,
            topic: testInput,
            source: "admin_test",
            chatId: null,
            messageText: testInput,
            selectionSource: "admin_test",
          }, config, env, aiManager);
          const latest = await db.prepare("SELECT MAX(id) as m FROM workflow_runs WHERE workflow_id = ? AND source = 'admin_test'").bind(id).first();
          const runId = latest?.m;
          await log(db, "info", "workflow_test_run", { workflowId: id, status: "success", runId });
          if (runId) {
            return new Response(null, { status: 302, headers: { Location: `/admin/ava_brain/traces?id=${runId}` } });
          }
          flashMsg = "Test run succeeded but no trace was recorded.";
        } catch (testError) {
          await log(db, "warn", "workflow_test_run_failed", { workflowId: id, error: sanitizeError(testError.message) });
          flashMsg = `Test run failed: ${sanitizeError(testError.message)}`;
        }
      }
    }
  }

  const providers = (await db.prepare("SELECT * FROM api_providers ORDER BY priority ASC, id ASC").all()).results || [];
  const workflows = (await db.prepare("SELECT * FROM workflows ORDER BY capability, is_default DESC, id ASC").all()).results || [];
  const workflowSteps = (await db.prepare("SELECT * FROM workflow_steps ORDER BY workflow_id, step_order ASC").all()).results || [];

  // Read the REAL global Judge state (single source of truth) so the toggle always
  // reflects what the message pipeline actually uses.
  let judgeRoutingEnabled = false;
  try {
    const judgeSetting = await db.prepare("SELECT value FROM settings WHERE key = 'judge_routing_enabled'").first();
    judgeRoutingEnabled = judgeSetting?.value === "true";
  } catch (e) {}

  let content = renderTopTabs(tab, cap, judgeRoutingEnabled, flashMsg);

  if (tab === "models") {
    content += renderModelsPage(providers, buildUsedInMap(workflows, workflowSteps));
  } else if (tab === "capabilities") {
    const ordered = await getOrderedModelsForCapability(db, cap);
    content += renderCapabilityPage(cap, ordered);
  } else if (tab === "workflows") {
    content += renderWorkflowsPage(workflows, workflowSteps, providers, highlightId);
  }

  return new Response(layout({
    title: "Workflow",
    currentPage: "/admin/ava_brain/capabilities",
    content,
    session: true
  }), { headers: { "Content-Type": "text/html" } });
}
