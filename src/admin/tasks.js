// Admin panel tasks page handler — manage routines
import { layout, escHtml } from "../lib/html.js";
import { log } from "../lib/logger.js";
import { RoutineManager } from "../lib/routines.js";

export async function handleTasksPage(request, env, config) {
  const db = env.DB;
  const routineManager = new RoutineManager(config, null, { info: log.info, error: log.error, warn: log.warn }, db);

  if (request.method === "GET") {
    return await renderTasksPage(db, routineManager, null, null);
  }

  if (request.method === "POST") {
    const formData = await request.formData();
    const action = formData.get("action");
    let message = null;
    let error = null;

    try {
      if (action === "create") {
        await createRoutine(db, routineManager, formData);
        message = "Routine created as draft.";
      } else if (action === "confirm") {
        await routineManager.confirmRoutine(parseInt(formData.get("id"), 10));
        message = "Routine confirmed and enabled.";
      } else if (action === "edit") {
        await editRoutine(db, routineManager, formData);
        message = "Routine updated.";
      } else if (action === "delete") {
        await routineManager.deleteRoutine(parseInt(formData.get("id"), 10));
        message = "Routine deleted.";
      } else if (action === "toggle") {
        await toggleRoutine(db, formData);
        message = "Routine toggled.";
      }
    } catch (e) {
      error = e.message;
    }

    return await renderTasksPage(db, routineManager, message, error);
  }

  return new Response("Method Not Allowed", { status: 405 });
}

async function renderTasksPage(db, routineManager, message, error) {
  const routines = await routineManager.getAllRoutines();

  const content = `
    ${message ? `<div class="flash success">${escHtml(message)}</div>` : ""}
    ${error ? `<div class="flash error">${escHtml(error)}</div>` : ""}

    <div class="card">
      <h2>Routines</h2>
      <p class="muted">Routines are created on request. Draft routines must be confirmed before enabling.</p>
    </div>

    ${(routines || []).map(routine => {
      const payload = JSON.parse(routine.payload || "{}");
      const isDraft = routine.draft === 1;
      const isEnabled = routine.enabled === 1;

      return `
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;">
            <div>
              <h3 style="margin:0 0 8px;">${escHtml(routine.name)}</h3>
              <span class="badge ${isEnabled ? "active" : isDraft ? "warning" : "inactive"}">${isEnabled ? "Enabled" : isDraft ? "Draft" : "Disabled"}</span>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <form method="POST" action="/admin/ava_brain/tasks" style="display:inline">
                <input type="hidden" name="action" value="toggle">
                <input type="hidden" name="id" value="${routine.id}">
                <button type="submit" class="small ${isEnabled ? "secondary" : "success"}">${isEnabled ? "Disable" : "Enable"}</button>
              </form>

              ${isDraft ? `
                <form method="POST" action="/admin/ava_brain/tasks" style="display:inline">
                  <input type="hidden" name="action" value="confirm">
                  <input type="hidden" name="id" value="${routine.id}">
                  <button type="submit" class="small">Confirm</button>
                </form>
              ` : ""}

              <form method="POST" action="/admin/ava_brain/tasks" style="display:inline">
                <input type="hidden" name="action" value="delete">
                <input type="hidden" name="id" value="${routine.id}">
                <button type="submit" class="small danger" onclick="return confirm('Delete this routine?')">Delete</button>
              </form>
            </div>
          </div>

          <p class="muted" style="margin-top:12px;">Type: ${routine.action_type} | Schedule: ${routine.schedule_type} | Next run: ${routine.next_run_utc || "Not scheduled"}</p>
          <p class="muted">Last run: ${routine.last_run_at || "Never"} | Local time: ${routine.local_time || "-"}</p>

          <form method="POST" action="/admin/ava_brain/tasks" style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border-color);">
            <input type="hidden" name="action" value="edit">
            <input type="hidden" name="id" value="${routine.id}">
            <div class="row cols-2">
              <div><label>Name</label><input type="text" name="name" value="${escHtml(routine.name)}"></div>
              <div><label>Action Type</label>
                <select name="action_type">
                  ${["news_ai", "custom_message", "project_followup", "checkin", "summary", "other"].map(t => `<option value="${t}" ${routine.action_type === t ? "selected" : ""}>${t}</option>`).join("")}
                </select>
              </div>
            </div>
            <label>Schedule Type</label>
            <select name="schedule_type">
              ${["daily", "interval", "weekly", "once", "cron"].map(s => `<option value="${s}" ${routine.schedule_type === s ? "selected" : ""}>${s}</option>`).join("")}
            </select>
            <label>Local Time / Schedule Value</label>
            <input type="text" name="local_time" value="${escHtml(routine.local_time || "")}" placeholder="09:00 or monday,09:00">
            <label>Interval Hours</label>
            <input type="number" name="interval_hours" value="${routine.interval_hours || ""}">
            <label>Cron Expression</label>
            <input type="text" name="cron_expression" value="${escHtml(routine.cron_expression || "")}">
            <label>Payload (JSON)</label>
            <textarea name="payload" rows="3">${escHtml(JSON.stringify(payload, null, 2))}</textarea>
            <button type="submit">Update Routine</button>
          </form>
        </div>
      `;
    }).join("")}

    <div class="card">
      <h3>Create New Routine</h3>
      <form method="POST" action="/admin/ava_brain/tasks">
        <input type="hidden" name="action" value="create">
        <label>Name</label><input type="text" name="name" required>
        <label>Action Type</label>
        <select name="action_type">
          <option value="news_ai">News AI</option>
          <option value="custom_message">Custom Message</option>
          <option value="project_followup">Project Follow-up</option>
          <option value="checkin">Check-in</option>
          <option value="summary">Summary</option>
          <option value="other">Other</option>
        </select>
        <label>Schedule Type</label>
        <select name="schedule_type">
          <option value="daily">Daily</option>
          <option value="interval">Interval</option>
          <option value="weekly">Weekly</option>
          <option value="once">Once</option>
          <option value="cron">Cron</option>
        </select>
        <label>Local Time / Schedule Value</label>
        <input type="text" name="local_time" placeholder="09:00 or monday,09:00">
        <label>Interval Hours</label>
        <input type="number" name="interval_hours" placeholder="24">
        <label>Cron Expression</label>
        <input type="text" name="cron_expression" placeholder="0 9 * * *">
        <label>Payload (JSON)</label>
        <textarea name="payload" rows="3">{"message": "Your routine message"}</textarea>
        <button type="submit">Create Draft</button>
      </form>
    </div>
  `;

  return new Response(layout({
    title: "Tasks",
    content,
    session: true,
  }), { headers: { "Content-Type": "text/html" } });
}

async function createRoutine(db, routineManager, formData) {
  const payload = parsePayload(formData.get("payload"));
  await routineManager.createRoutine({
    name: formData.get("name"),
    actionType: formData.get("action_type"),
    scheduleType: formData.get("schedule_type"),
    localTime: formData.get("local_time") || "",
    intervalHours: formData.get("interval_hours") ? parseInt(formData.get("interval_hours"), 10) : null,
    cronExpression: formData.get("cron_expression") || "",
    payload,
  });
}

async function editRoutine(db, routineManager, formData) {
  const payload = parsePayload(formData.get("payload"));
  await routineManager.updateRoutine(parseInt(formData.get("id"), 10), {
    name: formData.get("name"),
    action_type: formData.get("action_type"),
    schedule_type: formData.get("schedule_type"),
    local_time: formData.get("local_time") || "",
    interval_hours: formData.get("interval_hours") ? parseInt(formData.get("interval_hours"), 10) : null,
    cron_expression: formData.get("cron_expression") || "",
    payload,
  });
}

async function toggleRoutine(db, formData) {
  const id = parseInt(formData.get("id"), 10);
  const routine = await db.prepare("SELECT * FROM routines WHERE id = ?").bind(id).first();
  if (!routine) return;

  const newEnabled = routine.enabled ? 0 : 1;
  await db
    .prepare("UPDATE routines SET enabled = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(newEnabled, id)
    .run();
  await log(db, "info", "routine_toggled", { id, enabled: newEnabled });
}

function parsePayload(payloadString) {
  try {
    return JSON.parse(payloadString || "{}");
  } catch (e) {
    return {};
  }
}
