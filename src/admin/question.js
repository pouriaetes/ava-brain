// User-facing Daily Plan questionnaire + plan view.
// Accessed via a per-plan random access token (/question/<token>), NOT the admin
// session. A user can only reach their own plan (token is bound to one plan row).
//
// Security/lock guarantees (enforced server-side):
//   - After the questionnaire is completed and the plan is generated (or determined
//     to have no data), further answer submission is rejected (POST cannot modify).
//   - Every answer is validated server-side against its question type.
//   - Activity status changes are validated and plan-scoped.
//   - Saved answers are pre-filled when the questionnaire is still editable.
import { AIProviderManager } from "../lib/ai.js";
import { encrypt, decrypt } from "../lib/crypto.js";
import { log } from "../lib/logger.js";
import { DailyPlanManager, localParts, validateAnswer } from "../lib/daily-plan.js";

const PAGE_SIZE = 2;

const STYLES = `
  :root{
    --bg:#0b0c10; --bg-elev:#15171f; --bg-elev-2:#1c1f2a;
    --border:#282c3a; --border-soft:#1f222d;
    --text:#f4f5f7; --text-muted:#9198ac; --text-faint:#6b7286;
    --accent:#6366f1; --accent-hover:#5457e5;
    --success:#22c55e; --success-soft:rgba(34,197,94,.14);
    --warn:#f59e0b; --warn-soft:rgba(245,158,11,.14);
    --danger:#ef4444; --danger-soft:rgba(239,68,68,.14);
    --radius-sm:10px; --radius-lg:18px;
    --shadow:0 1px 2px rgba(0,0,0,.35), 0 12px 28px -16px rgba(0,0,0,.6);
  }
  *{box-sizing:border-box;}
  html,body{margin:0;padding:0;}
  body{
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    background:var(--bg); color:var(--text); min-height:100vh; line-height:1.5;
    -webkit-font-smoothing:antialiased; text-rendering:optimizeLegibility;
  }
  main{max-width:480px; margin:0 auto; padding:32px 18px 72px;}
  h1{font-size:1.4rem; font-weight:700; letter-spacing:-.01em; margin:0 0 4px;}
  .muted{color:var(--text-muted); font-size:.92rem; margin:0;}
  .eyebrow{font-size:.76rem; font-weight:700; color:var(--accent); text-transform:uppercase; letter-spacing:.05em; margin:0 0 8px;}
  .card{background:var(--bg-elev); border:1px solid var(--border-soft); border-radius:var(--radius-lg); padding:22px; margin-bottom:14px; box-shadow:var(--shadow);}
  .header-card{padding:22px 22px 20px;}

  .progress-wrap{margin-top:16px;}
  .progress-track{height:6px; background:var(--bg-elev-2); border-radius:99px; overflow:hidden;}
  .progress-fill{height:100%; background:var(--accent); border-radius:99px; transition:width .3s ease;}
  .progress-label{display:flex; justify-content:space-between; font-size:.76rem; color:var(--text-faint); margin-top:7px;}

  fieldset{border:none; margin:0 0 28px; padding:0;}
  fieldset:last-of-type{margin-bottom:4px;}
  legend{display:block; width:100%; font-size:1.05rem; font-weight:600; color:var(--text); padding:0; margin:0 0 12px;}
  .field{margin:0 0 28px;}
  .field:last-of-type{margin-bottom:4px;}
  .q-label{display:block; font-size:1.05rem; font-weight:600; color:var(--text); margin:0 0 12px;}
  .q-index{display:block; color:var(--text-faint); font-weight:600; font-size:.76rem; text-transform:uppercase; letter-spacing:.04em; margin-bottom:5px;}

  .choice-row{display:flex; gap:8px; flex-wrap:wrap;}
  .choice-btn{
    flex:1 1 auto; min-width:52px; min-height:48px; padding:12px 10px;
    border-radius:var(--radius-sm); border:1px solid var(--border);
    background:var(--bg-elev-2); color:var(--text); font-size:.95rem; font-weight:600;
    cursor:pointer; transition:background .15s ease, border-color .15s ease, transform .08s ease;
  }
  .choice-btn:active{transform:scale(.97);}
  .choice-btn.selected{background:var(--accent); border-color:var(--accent); color:#fff;}
  .choice-btn:focus-visible{outline:2px solid var(--accent); outline-offset:2px;}

  .yesno-row{display:flex; gap:10px;}
  .yesno-row .choice-btn{min-height:52px;}

  select, input[type=time], input[type=text]{
    width:100%; min-height:48px; padding:12px 14px; border-radius:var(--radius-sm);
    border:1px solid var(--border); background:var(--bg-elev-2); color:var(--text);
    font-size:1rem; font-family:inherit;
  }
  select{appearance:none; -webkit-appearance:none; background-repeat:no-repeat; background-position:right 14px center;
    background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%239198ac'/%3E%3C/svg%3E");
    padding-right:34px;}
  select:focus-visible, input:focus-visible{outline:2px solid var(--accent); outline-offset:1px;}

  .btn{width:100%; min-height:50px; padding:14px; border-radius:var(--radius-sm); border:none; background:var(--accent); color:#fff; font-size:1rem; font-weight:700; cursor:pointer; transition:background .15s ease;}
  .btn:hover{background:var(--accent-hover);}
  .btn:focus-visible{outline:2px solid var(--accent); outline-offset:2px;}
  .btn.secondary{background:var(--bg-elev-2); border:1px solid var(--border); color:var(--text); font-weight:600;}

  .plan-row{display:flex; align-items:flex-start; justify-content:space-between; gap:14px; padding:16px 0; border-bottom:1px solid var(--border-soft);}
  .plan-row:last-child{border-bottom:none;}
  .plan-title{font-weight:600; font-size:.98rem;}
  .plan-desc{color:var(--text-muted); font-size:.87rem; margin-top:3px;}
  .plan-meta{font-size:.78rem; color:var(--text-faint); margin-top:6px; display:flex; gap:8px; align-items:center; flex-wrap:wrap;}
  .plan-side{display:flex; flex-direction:column; align-items:flex-end; gap:8px; flex-shrink:0;}
  .plan-actions{display:flex; gap:6px;}
  .icon-btn{padding:8px 12px; min-height:36px; border-radius:8px; border:1px solid var(--border); background:var(--bg-elev-2); color:var(--text); font-size:.8rem; font-weight:600; cursor:pointer;}
  .icon-btn.done{background:var(--success-soft); border-color:rgba(34,197,94,.35); color:#4ade80;}
  .icon-btn.skip{background:var(--warn-soft); border-color:rgba(245,158,11,.35); color:#fbbf24;}
  .badge{font-size:.72rem; font-weight:700; padding:4px 9px; border-radius:99px; white-space:nowrap;}
  .badge.pending{background:var(--warn-soft); color:#fbbf24;}
  .badge.completed{background:var(--success-soft); color:#4ade80;}
  .badge.skipped{background:rgba(145,152,172,.16); color:var(--text-muted);}
  .tag{font-size:.7rem; padding:2px 8px; border-radius:99px; border:1px solid var(--border); color:var(--text-faint);}

  .flash{padding:12px 14px; border-radius:var(--radius-sm); margin-bottom:14px; font-size:.88rem; font-weight:500;}
  .flash.error{background:var(--danger-soft); color:#f87171; border:1px solid rgba(239,68,68,.3);}

  .empty-state{text-align:center; padding:26px 8px;}
  .empty-state .icon{font-size:1.9rem; margin-bottom:10px;}

  a{color:var(--accent);}

  @media (prefers-reduced-motion: reduce){
    .progress-fill, .choice-btn, .btn{transition:none;}
  }
`;

function renderShell(title, inner) {
  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>${STYLES}</style>
</head>
<body>
  <main>${inner}</main>
</body>
</html>`;
}

function esc(s) {
  if (s == null) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function timeGreeting(hours) {
  if (hours < 12) return "Good morning";
  if (hours < 18) return "Good afternoon";
  return "Good evening";
}

// Render one question as an accessible, mobile-friendly field.
// Field name/value contract is unchanged: `${namePrefix}_${q.id}`.
function renderQuestionField(q, namePrefix, position, total) {
  const key = `${namePrefix}_${q.id}`;
  const saved = String(q.answer || "");
  const qid = `field_${q.id}`;
  const indexLabel = `<span class="q-index">Question ${position} of ${total}</span>`;

  if (q.answer_type === "score") {
    const opts = (() => { try { return JSON.parse(q.options || "[]"); } catch { return ["1", "2", "3", "4", "5"]; } })();
    return `<fieldset>
      <legend>${indexLabel}${esc(q.question)}</legend>
      <div class="choice-row" role="radiogroup" aria-label="${esc(q.question)}">${opts.map((o) =>
        `<button type="button" class="choice-btn${String(o) === saved ? " selected" : ""}" role="radio" aria-checked="${String(o) === saved}" data-name="${key}" data-value="${esc(o)}" onclick="pick(this)">${esc(o)}</button>`
      ).join("")}</div>
      <input type="hidden" name="${key}" value="${esc(saved)}">
    </fieldset>`;
  }
  if (q.answer_type === "yes_no") {
    return `<fieldset>
      <legend>${indexLabel}${esc(q.question)}</legend>
      <div class="yesno-row" role="radiogroup" aria-label="${esc(q.question)}">
        <button type="button" class="choice-btn${saved === "yes" ? " selected" : ""}" role="radio" aria-checked="${saved === "yes"}" data-name="${key}" data-value="yes" onclick="pick(this)">Yes</button>
        <button type="button" class="choice-btn${saved === "no" ? " selected" : ""}" role="radio" aria-checked="${saved === "no"}" data-name="${key}" data-value="no" onclick="pick(this)">No</button>
      </div>
      <input type="hidden" name="${key}" value="${esc(saved)}">
    </fieldset>`;
  }
  if (q.answer_type === "time") {
    return `<div class="field">
      <label class="q-label" for="${qid}">${indexLabel}${esc(q.question)}</label>
      <input type="time" id="${qid}" name="${key}" value="${esc(saved)}">
    </div>`;
  }
  if (q.answer_type === "select") {
    const opts = (() => { try { return JSON.parse(q.options || "[]"); } catch { return []; } })();
    return `<div class="field">
      <label class="q-label" for="${qid}">${indexLabel}${esc(q.question)}</label>
      <select id="${qid}" name="${key}">
        <option value="">Choose...</option>
        ${opts.map((o) => `<option value="${esc(o)}"${o === saved ? " selected" : ""}>${esc(o)}</option>`).join("")}
      </select>
    </div>`;
  }
  return `<div class="field">
    <label class="q-label" for="${qid}">${indexLabel}${esc(q.question)}</label>
    <input type="text" id="${qid}" name="${key}" value="${esc(saved)}" placeholder="Your answer...">
  </div>`;
}

function renderPlanActivities(plan, activities, basePath) {
  if (activities.length === 0) {
    return `<div class="empty-state">
      <div class="icon">🌤️</div>
      <p class="muted">Your plan isn't ready yet.</p>
    </div>`;
  }
  return activities.map((a) => {
    const badge = a.status === "completed" ? '<span class="badge completed">Done</span>'
      : a.status === "skipped" ? '<span class="badge skipped">Skipped</span>'
      : '<span class="badge pending">Pending</span>';
    const srcLabel = a.source === "reminder" ? "Reminder" : a.source === "history" ? "Carried over" : "";
    const time = a.scheduled_time ? `<span>${esc(a.scheduled_time)}</span>` : "";
    const meta = (time || srcLabel) ? `<div class="plan-meta">${time}${srcLabel ? `<span class="tag">${srcLabel}</span>` : ""}</div>` : "";
    return `<div class="plan-row">
      <div>
        <div class="plan-title">${esc(a.title)}</div>
        ${a.description ? `<div class="plan-desc">${esc(a.description)}</div>` : ""}
        ${meta}
      </div>
      <div class="plan-side">
        ${badge}
        ${plan.status === "plan_generated" ? `<div class="plan-actions">
          <form method="POST" action="${basePath}" style="display:inline">
            <input type="hidden" name="action" value="set_status">
            <input type="hidden" name="activity_id" value="${a.id}">
            <input type="hidden" name="status" value="completed">
            <button type="submit" class="icon-btn done">Mark done</button>
          </form>
          <form method="POST" action="${basePath}" style="display:inline">
            <input type="hidden" name="action" value="set_status">
            <input type="hidden" name="activity_id" value="${a.id}">
            <input type="hidden" name="status" value="skipped">
            <button type="submit" class="icon-btn skip">Skip</button>
          </form>
        </div>` : ""}
      </div>
    </div>`;
  }).join("");
}

async function getAiManager(config, env) {
  const mgr = new AIProviderManager(config, { encrypt, decrypt }, { info: log.info, error: log.error, warn: log.warn }, env.DB);
  await mgr.initialize();
  return mgr;
}

export async function handleQuestionPage(request, env, config, token) {
  const db = env.DB;
  const mgr = new DailyPlanManager(config, env, { info: log.info, error: log.error, warn: log.warn }, db);
  const plan = await mgr.getPlanByToken(token);
  if (!plan) {
    return new Response(renderShell("Not found", '<div class="card"><h1>Invalid link</h1><p class="muted">This link isn\u2019t available anymore.</p></div>'), {
      headers: { "Content-Type": "text/html" },
    });
  }

  const basePath = `/question/${encodeURIComponent(token)}`;
  const url = new URL(request.url);
  const step = parseInt(url.searchParams.get("step") || "1", 10);
  const redirect = (path) => new Response(null, { status: 302, headers: { Location: path } });

  // ---- POST handling (server-enforced) ----
  if (request.method === "POST") {
    const formData = await request.formData();
    const action = formData.get("action");

    // Re-fetch the plan so a stale in-memory snapshot cannot bypass the lock.
    const livePlan = (await mgr.getPlanById(plan.id)) || plan;

    if (action === "set_status") {
      // Only a plan_generated plan can have its activities updated.
      if (livePlan.status !== "plan_generated") {
        return redirect(basePath);
      }
      const activityId = parseInt(formData.get("activity_id"), 10);
      const status = formData.get("status");
      await mgr.setActivityStatus(livePlan.id, activityId, status);
      return redirect(basePath);
    }

    if (action === "submit_answers") {
      // REAL lock: reject answer submission once the questionnaire is closed.
      if (["plan_generated", "no_plan_data", "questionnaire_completed"].includes(livePlan.status)) {
        await log(db, "warn", "daily_plan_locked_submission_rejected", { planId: livePlan.id, status: livePlan.status });
        return redirect(`${basePath}?locked=1`);
      }
      const questions = await mgr.getQuestions(livePlan.id);
      // Validate every provided answer server-side; reject invalid submissions.
      let invalid = null;
      for (const q of questions) {
        const val = formData.get(`a_${q.id}`);
        if (val === null) continue;
        const res = validateAnswer(q, val);
        if (!res.valid) { invalid = { qid: q.id, type: q.answer_type }; break; }
      }
      if (invalid) {
        await log(db, "warn", "daily_plan_invalid_answer_rejected", { planId: livePlan.id, qid: invalid.qid, type: invalid.type });
        return redirect(`${basePath}?step=${step}&err=invalid`);
      }
      // Store only valid answers.
      for (const q of questions) {
        const val = formData.get(`a_${q.id}`);
        if (val === null) continue;
        const res = validateAnswer(q, val);
        if (res.valid) {
          await db.prepare("UPDATE daily_plan_questions SET answer = ?, updated_at = datetime('now') WHERE id = ?").bind(res.value, q.id).run();
        }
      }
      const totalPages = Math.ceil(questions.length / PAGE_SIZE);
      if (step < totalPages) {
        return redirect(`${basePath}?step=${step + 1}`);
      }
      // Final page — mark completed then generate the plan.
      await db.prepare("UPDATE daily_plans SET status = 'questionnaire_completed', updated_at = datetime('now') WHERE id = ?").bind(livePlan.id).run();
      let planError = false;
      try {
        const aiManager = await getAiManager(config, env);
        const updatedQuestions = await mgr.getQuestions(livePlan.id);
        await mgr.generatePlan(livePlan, updatedQuestions, aiManager);
      } catch (e) {
        planError = true;
        await log(db, "warn", "daily_plan_generation_failed", { error: e.message, planId: livePlan.id });
      }
      return redirect(`${basePath}${planError ? "?err=1" : ""}`);
    }
  }

  // ---- GET ----
  const freshPlan = (await mgr.getPlanById(plan.id)) || plan;
  const locked = url.searchParams.get("locked") === "1";
  const errInvalid = url.searchParams.get("err") === "invalid";

  const tz = await mgr.getTimezone();
  const { date: today, hours: nowHours } = localParts(tz);
  const ownerName = (await db.prepare("SELECT value FROM settings WHERE key = 'owner_name'").first())?.value || "";
  const greetName = ownerName ? `${timeGreeting(nowHours)}, ${ownerName}` : timeGreeting(nowHours);

  // No actionable data → explicit state, friendly message, questionnaire closed.
  if (freshPlan.status === "no_plan_data") {
    const inner = `
      <div class="card header-card">
        <p class="eyebrow">${esc(today)}</p>
        <h1>${esc(greetName)}</h1>
        <p class="muted">Nothing on the schedule today.</p>
      </div>
      <div class="card">
        <div class="empty-state">
          <div class="icon">✨</div>
          <p class="muted">No tasks or reminders for today. If you need anything, just let me know!</p>
        </div>
      </div>`;
    return new Response(renderShell("Today's Plan", inner), { headers: { "Content-Type": "text/html" } });
  }

  // Plan view (locked after generation). No editable controls.
  if (freshPlan.status === "plan_generated" || freshPlan.status === "questionnaire_completed") {
    const activities = await mgr.getActivities(freshPlan.id);
    const total = activities.length;
    const completedCount = activities.filter((a) => a.status === "completed").length;
    const pct = total ? Math.round((completedCount / total) * 100) : 0;
    const progress = total ? `<div class="progress-wrap">
        <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
        <div class="progress-label"><span>${completedCount} of ${total} done</span><span>${pct}%</span></div>
      </div>` : "";
    const inner = `
      <div class="card header-card">
        <p class="eyebrow">${esc(today)}</p>
        <h1>Today's Plan</h1>
        <p class="muted">${esc(greetName)}</p>
        ${progress}
      </div>
      <div class="card">
        ${renderPlanActivities(freshPlan, activities, basePath)}
      </div>`;
    return new Response(renderShell("Today's Plan", inner), { headers: { "Content-Type": "text/html" } });
  }

  // ---- Questionnaire (editable) ----
  let questions = await mgr.getQuestions(freshPlan.id);
  try {
    questions = await mgr.ensureAiQuestions(freshPlan, await getAiManager(config, env));
  } catch (e) {
    await log(db, "warn", "daily_plan_ai_question_load_failed", { error: e.message });
  }
  const totalPages = Math.max(1, Math.ceil(questions.length / PAGE_SIZE));
  const safeStep = Math.min(Math.max(step, 1), totalPages);
  const pageQuestions = questions.slice((safeStep - 1) * PAGE_SIZE, safeStep * PAGE_SIZE);
  const totalQuestions = questions.length;

  const lockedMsg = locked ? '<div class="flash error">This check-in was already submitted and is locked.</div>' : "";
  const errMsg = errInvalid ? '<div class="flash error">That answer didn\u2019t look right \u2014 please try again.</div>' : "";
  const subtitle = safeStep >= totalPages ? "Last step \u2014 let\u2019s build today\u2019s plan." : "How\u2019s today shaping up?";
  const percent = Math.round((safeStep / totalPages) * 100);

  const qHtml = pageQuestions.map((q, i) => {
    const position = (safeStep - 1) * PAGE_SIZE + i + 1;
    return renderQuestionField(q, "a", position, totalQuestions);
  }).join("");

  const btnLabel = safeStep >= totalPages ? "Finish & build my plan" : "Continue";

  const inner = `
    <div class="card header-card">
      <p class="eyebrow">Daily check-in</p>
      <h1>${esc(greetName)}</h1>
      <p class="muted">${subtitle}</p>
      <div class="progress-wrap">
        <div class="progress-track"><div class="progress-fill" style="width:${percent}%"></div></div>
        <div class="progress-label"><span>Step ${safeStep} of ${totalPages}</span><span>${percent}%</span></div>
      </div>
    </div>
    ${lockedMsg}${errMsg}
    <div class="card">
      <form method="POST" action="${basePath}?step=${safeStep}">
        <input type="hidden" name="action" value="submit_answers">
        ${qHtml}
        <button type="submit" class="btn">${btnLabel}</button>
      </form>
    </div>
    <script>
    function pick(btn) {
      var name = btn.getAttribute('data-name');
      var value = btn.getAttribute('data-value');
      document.querySelector('input[name="' + name + '"]').value = value;
      var group = btn.closest('[role="radiogroup"]') || btn.parentNode;
      group.querySelectorAll('button').forEach(function(b){
        b.classList.remove('selected');
        b.setAttribute('aria-checked', 'false');
      });
      btn.classList.add('selected');
      btn.setAttribute('aria-checked', 'true');
    }
    </script>
  `;

  return new Response(renderShell("Daily Check-in", inner), { headers: { "Content-Type": "text/html" } });
}