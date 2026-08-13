// Admin panel Traces page — workflow observability and Decision Trace.
// Reconstructs, from persisted workflow_runs, the full path a message took:
// message → decision (capability, confidence, workflow) → every step (provider,
// duration, status, error, fallback) → final result. Nothing is fabricated after
// the fact; everything is read from the recorded execution.
import { layout, escHtml, pageHeader, badge, flash } from "../lib/html.js";
import { listWorkflowRuns, getWorkflowRunById } from "../lib/trace.js";

export async function handleTracesPage(request, env, config) {
  const db = env.DB;
  const url = new URL(request.url);
  const idRaw = url.searchParams.get("id") || url.searchParams.get("highlight") || "";
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "25", 10), 100);

  if (idRaw) {
    const run = await getWorkflowRunById(db, parseInt(idRaw, 10));
    if (!run) {
      return new Response(layout({
        title: "Traces",
        currentPage: "/admin/ava_brain/traces",
        content: `<div class="card"><p class="muted">Run not found.</p></div>`,
        session: true,
      }), { headers: { "Content-Type": "text/html" } });
    }
    return new Response(layout({
      title: "Trace Detail",
      currentPage: "/admin/ava_brain/traces",
      content: renderTraceDetail(run),
      session: true,
    }), { headers: { "Content-Type": "text/html" } });
  }

  const runs = await listWorkflowRuns(db, { limit });
  const content = `
    ${pageHeader("Traces", {
      description: "Recorded workflow executions and their decisions. Each row reconstructs message → decision → workflow → steps → providers → fallbacks → result.",
    })}
    <div class="card">
      ${runs.length === 0 ? '<p class="muted">No workflow executions recorded yet. They appear here whenever a workflow-capable message or an admin Test Run executes.</p>' : `
      <div class="table-wrap">
        <table>
          <tr>
            <th>ID</th><th>Time</th><th>Source</th><th>Capability</th><th>Workflow</th><th>Decision</th><th>Status</th><th>Duration</th><th></th>
          </tr>
          ${runs.map((r) => renderRunRow(r)).join("")}
        </table>
      </div>`}
    </div>
  `;
  return new Response(layout({
    title: "Traces",
    currentPage: "/admin/ava_brain/traces",
    content,
    session: true,
  }), { headers: { "Content-Type": "text/html" } });
}

function renderRunRow(r) {
  let decision = null;
  try { decision = JSON.parse(r.decision_json || "{}"); } catch {}
  const sourceLabel = r.source === "admin_test" ? "Admin Test" : "Message";
  return `
    <tr>
      <td>${r.id}</td>
      <td class="muted">${escHtml((r.created_at || "").substring(0, 19))}</td>
      <td>${badge(r.source === "admin_test" ? "info" : "neutral", sourceLabel)}</td>
      <td>${escHtml(r.capability || "—")}</td>
      <td>${escHtml(r.workflow_name || "—")}</td>
      <td class="muted">${escHtml(decision.selection_source || "—")}${decision.judge_confidence ? ` · ${Math.round(decision.judge_confidence * 100)}%` : ""}</td>
      <td>${r.status === "success" ? badge("success", "success") : badge("error", "failed")}</td>
      <td class="muted">${r.total_duration_ms ? `${r.total_duration_ms}ms` : "—"}</td>
      <td><a class="btn small secondary" href="/admin/ava_brain/traces?id=${r.id}">View</a></td>
    </tr>`;
}

function renderTraceDetail(run) {
  let decision = {};
  let steps = [];
  try { decision = JSON.parse(run.decision_json || "{}"); } catch {}
  try { steps = JSON.parse(run.steps_json || "[]"); } catch {}

  const decisionLines = [
    ["Capability", run.capability || "—"],
    ["Workflow", run.workflow_name || "—"],
    ["Selection", decision.selection_source || "—"],
    ["Judge route", decision.judge_route || "—"],
    ["Judge confidence", decision.judge_confidence != null ? Math.round(decision.judge_confidence * 100) + "%" : "—"],
    ["Judge provider", decision.judge_provider_id || "—"],
    ["Judge error", decision.judge_error || "—"],
    ["Status", run.status],
    ["Duration", run.total_duration_ms ? `${run.total_duration_ms}ms` : "—"],
    ["Source", run.source === "admin_test" ? "Admin Test" : "Message"],
    ["Message", run.message_text || "—"],
  ].map(([k, v]) => `<tr><td style="width:180px;color:var(--text-muted);">${escHtml(k)}</td><td>${escHtml(String(v))}</td></tr>`).join("");

  const stepRows = steps.length === 0
    ? '<tr><td colspan="7" class="muted">No step records.</td></tr>'
    : steps.map((s) => `
        <tr>
          <td>${escHtml(s.step_order != null ? `step ${s.step_order}` : "—")}</td>
          <td>${escHtml(s.capability || "—")}</td>
          <td>${escHtml(s.provider_name || (s.provider_id ? `#${s.provider_id}` : "default"))}</td>
          <td>${s.status === "success" ? badge("success", "ok") : badge("error", "failed")}${s.used_fallback ? " " + badge("warning", "fallback") : ""}</td>
          <td class="muted">${s.duration_ms ? `${s.duration_ms}ms` : "—"}</td>
          <td class="muted">${s.error ? escHtml(s.error) : (s.output_preview ? escHtml(s.output_preview) : "—")}</td>
          <td class="muted">${s.fallback_step_id ? `→ step ${s.fallback_step_id}` : "—"}</td>
        </tr>`).join("");

  return `
    <a class="btn small secondary" href="/admin/ava_brain/traces" style="margin-bottom:14px;">← Back to Traces</a>
    ${pageHeader(`Run #${run.id}`, { description: `Execution ${run.status === "success" ? "succeeded" : "failed"} · ${run.created_at}` })}
    <div class="card">
      <h3>Decision</h3>
      <div class="table-wrap"><table>${decisionLines}</table></div>
    </div>
    <div class="card">
      <h3>Steps (${steps.length})</h3>
      <div class="table-wrap">
        <table>
          <tr><th>Step</th><th>Capability</th><th>Provider</th><th>Status</th><th>Duration</th><th>Output / Error</th><th>Fallback</th></tr>
          ${stepRows}
        </table>
      </div>
    </div>
    ${run.error ? `<div class="card"><h3>Error</h3><pre style="background:var(--bg-primary);padding:12px;border-radius:8px;font-size:0.8rem;">${escHtml(run.error)}</pre></div>` : ""}
  `;
}
