// src/lib/trace.js — persist structured workflow execution records (workflow_runs).
//
// Each execution is one row: the message that triggered it, the decision that
// selected it, every step (provider, duration, status, error, fallback), and the
// final result. This is the basis for workflow observability and the admin
// Decision Trace. Errors are sanitized before storage so no secrets reach the
// database. Never used to drive business logic.

export async function recordWorkflowRun(db, run) {
  const decision = {
    capability: run.capability || null,
    workflow_id: run.workflowId || null,
    workflow_name: run.workflowName || null,
    selection_source: run.selectionSource || null,
    judge_route: run.judgeResult?.capability_id ?? run.judgeResult?.route ?? null,
    judge_confidence: run.judgeResult?.confidence_score ?? null,
    judge_provider_id: run.judgeResult?.provider_id ?? null,
    judge_error: run.judgeResult?._debugError ?? null,
  };
  const steps = (run.steps || []).map((s) => ({
    step_id: s.step_id,
    step_order: s.step_order,
    capability: s.capability,
    provider_id: s.provider_id,
    provider_name: s.provider_name,
    status: s.status,
    duration_ms: s.duration_ms,
    output_preview: s.output_preview,
    error: s.error,
    fallback_step_id: s.fallback_step_id,
    used_fallback: s.used_fallback ? 1 : 0,
  }));

  try {
    await db.prepare(
      `INSERT INTO workflow_runs
        (chat_id, source, message_text, capability, workflow_id, workflow_name,
         selection_source, judge_route, judge_confidence, judge_provider_id, judge_error,
         status, final_text, total_duration_ms, error, steps_json, decision_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      run.chatId || null,
      run.source || "message",
      String(run.messageText || "").substring(0, 1000),
      run.capability || null,
      run.workflowId || null,
      String(run.workflowName || "").substring(0, 200) || null,
      run.selectionSource || null,
      decision.judge_route,
      decision.judge_confidence,
      decision.judge_provider_id,
      decision.judge_error,
      run.status || "success",
      String(run.finalText || "").substring(0, 3000),
      run.totalDurationMs || 0,
      String(run.error || "").substring(0, 500) || null,
      JSON.stringify(steps),
      JSON.stringify(decision)
    ).run();
  } catch (e) {
    // Recording must never break message processing.
    try { console.warn("recordWorkflowRun failed:", e.message); } catch {}
  }
}

export async function listWorkflowRuns(db, { limit = 25, workflowId = null, status = "" } = {}) {
  let query = "SELECT * FROM workflow_runs WHERE 1=1";
  const params = [];
  if (workflowId) {
    query += " AND workflow_id = ?";
    params.push(workflowId);
  }
  if (status) {
    query += " AND status = ?";
    params.push(status);
  }
  query += " ORDER BY id DESC LIMIT ?";
  params.push(limit);
  try {
    const res = await db.prepare(query).bind(...params).all();
    return res.results || [];
  } catch (e) {
    return [];
  }
}

export async function getWorkflowRunById(db, id) {
  try {
    return await db.prepare("SELECT * FROM workflow_runs WHERE id = ?").bind(id).first();
  } catch (e) {
    return null;
  }
}
