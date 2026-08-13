// Admin panel Daily Plan page — configuration + plan list.
// Replaces the obsolete Routines admin page.
import { layout, escHtml, pageHeader, toggle, flash } from "../lib/html.js";
import { log } from "../lib/logger.js";
import { getAllSettings } from "../lib/settings.js";
import {
  DailyPlanManager,
  MIN_RETENTION_DAYS,
  MAX_RETENTION_DAYS,
  DEFAULT_RETENTION_DAYS,
  DEFAULT_MORNING_TIME,
  DEFAULT_CHECKIN_TIME,
  DEFAULT_NIGHT_DELAY_HOURS,
  DEFAULT_REMINDER_INTERVAL_HOURS,
  DEFAULT_AI_QUESTION_COUNT,
} from "../lib/daily-plan.js";

const CONFIG_KEYS = [
  "daily_plan_enabled",
  "daily_plan_retention_days",
  "daily_plan_morning_time",
  "daily_plan_checkin_time",
  "daily_plan_night_delay_hours",
  "daily_plan_reminder_interval_hours",
  "daily_plan_ai_question_count",
  "daily_plan_app_url",
];

function parseBool(v) { return v === "on" || v === "true"; }

export async function handleDailyPlanPage(request, env, config) {
  const db = env.DB;
  const mgr = new DailyPlanManager(config, env, { info: log.info, error: log.error, warn: log.warn }, db);
  let flashMsg = "";
  let error = "";

  if (request.method === "POST") {
    const formData = await request.formData();
    const action = formData.get("action");

    try {
      if (action === "save_config") {
        const updates = {};
        // daily_plan_enabled is now owned by the header toggle (toggle_enabled
        // action); saving the other config fields must not overwrite it.

        const retention = parseInt(formData.get("daily_plan_retention_days") || "", 10);
        if (!Number.isInteger(retention) || retention < MIN_RETENTION_DAYS || retention > MAX_RETENTION_DAYS) {
          throw new Error(`Retention must be between ${MIN_RETENTION_DAYS} and ${MAX_RETENTION_DAYS} days.`);
        }
        updates.daily_plan_retention_days = String(retention);

        const morning = String(formData.get("daily_plan_morning_time") || "").trim();
        if (!/^\d{1,2}:\d{2}$/.test(morning)) throw new Error("Morning time must be HH:MM.");
        updates.daily_plan_morning_time = normalizeTime(morning);

        const checkin = String(formData.get("daily_plan_checkin_time") || "").trim();
        if (!/^\d{1,2}:\d{2}$/.test(checkin)) throw new Error("Check-in time must be HH:MM.");
        updates.daily_plan_checkin_time = normalizeTime(checkin);

        const delay = parseInt(formData.get("daily_plan_night_delay_hours") || "", 10);
        if (!Number.isInteger(delay) || delay < 0 || delay > 24) throw new Error("Night delay must be 0–24 hours.");
        updates.daily_plan_night_delay_hours = String(delay);

        const interval = parseInt(formData.get("daily_plan_reminder_interval_hours") || "", 10);
        if (!Number.isInteger(interval) || interval < 1 || interval > 72) throw new Error("Reminder interval must be 1–72 hours.");
        updates.daily_plan_reminder_interval_hours = String(interval);

        const aiCount = parseInt(formData.get("daily_plan_ai_question_count") || "", 10);
        if (!Number.isInteger(aiCount) || aiCount < 0 || aiCount > 5) throw new Error("AI question count must be 0–5.");
        updates.daily_plan_ai_question_count = String(aiCount);

        updates.daily_plan_app_url = String(formData.get("daily_plan_app_url") || "").trim();

        for (const [key, value] of Object.entries(updates)) {
          await db.prepare("UPDATE settings SET value = ?, updated_at = datetime('now') WHERE key = ?").bind(value, key).run();
        }
        await log(db, "info", "daily_plan_config_saved", { keys: Object.keys(updates) });
        flashMsg = "Daily Plan settings saved.";
      } else if (action === "delete_plan") {
        const id = parseInt(formData.get("id"), 10);
        await db.prepare("DELETE FROM daily_plans WHERE id = ?").bind(id).run();
        await log(db, "info", "daily_plan_deleted", { id });
        flashMsg = "Daily Plan deleted.";
      } else if (action === "toggle_enabled") {
        // Header toggle writes the same daily_plan_enabled setting the save form
        // uses — just a more direct UI path, identical state semantics.
        const enabled = formData.has("daily_plan_enabled");
        await db.prepare("UPDATE settings SET value = ?, updated_at = datetime('now') WHERE key = 'daily_plan_enabled'")
          .bind(enabled ? "true" : "false").run();
        await log(db, "info", "daily_plan_toggled", { enabled });
        flashMsg = `Daily Plan is now ${enabled ? "ON" : "OFF"}.`;
      }
    } catch (e) {
      error = e.message;
      try { await log(db, "error", "daily_plan_admin_error", { error: e.message }); } catch {}
    }
  }

  const settings = await getAllSettings(db);
  const plans = await mgr.listPlans(30);
  const content = renderDailyPlanPage(settings, plans, flashMsg, error);
  return new Response(layout({
    title: "Daily Plan",
    currentPage: "/admin/ava_brain/daily_plan",
    content,
    session: true,
  }), { headers: { "Content-Type": "text/html" } });
}

function normalizeTime(t) {
  const [h, m] = t.split(":").map(Number);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function renderDailyPlanPage(settings, plans, flashMsg, error) {
  const enabled = settings.daily_plan_enabled === "true";
  const retention = settings.daily_plan_retention_days || String(DEFAULT_RETENTION_DAYS);
  const morning = settings.daily_plan_morning_time || DEFAULT_MORNING_TIME;
  const checkin = settings.daily_plan_checkin_time || DEFAULT_CHECKIN_TIME;
  const delay = settings.daily_plan_night_delay_hours || String(DEFAULT_NIGHT_DELAY_HOURS);
  const interval = settings.daily_plan_reminder_interval_hours || String(DEFAULT_REMINDER_INTERVAL_HOURS);
  const aiCount = settings.daily_plan_ai_question_count || String(DEFAULT_AI_QUESTION_COUNT);
  const appUrl = settings.daily_plan_app_url || "";

  const statusLabel = (s) => ({
    questionnaire_pending: "Not sent",
    questionnaire_open: "In progress",
    questionnaire_completed: "Completed",
    plan_generated: "Plan ready",
    no_plan_data: "No plan data",
  }[s] || s);

  const planRows = plans.length === 0
    ? '<tr><td colspan="4" class="muted">No Daily Plans yet.</td></tr>'
    : plans.map((p) => `
        <tr>
          <td>${escHtml(p.plan_date)}</td>
          <td>${escHtml(statusLabel(p.status))}</td>
          <td class="muted">${escHtml((p.created_at || "").substring(0, 16))}</td>
          <td>
            <form method="POST" action="/admin/ava_brain/daily_plan" style="display:inline">
              <input type="hidden" name="action" value="delete_plan">
              <input type="hidden" name="id" value="${p.id}">
              <button type="submit" class="small danger" onclick="return confirm('Delete this Daily Plan?')">Delete</button>
            </form>
          </td>
        </tr>
      `).join("");

  return `
    ${flashMsg ? flash("success", flashMsg) : ""}
    ${error ? flash("error", error) : ""}

    ${pageHeader("Daily Plan", {
      controls: `
        <form method="POST" action="/admin/ava_brain/daily_plan" class="toggle-form">
          <input type="hidden" name="action" value="toggle_enabled">
          ${toggle({
            name: "daily_plan_enabled",
            checked: enabled,
            label: "Daily Plan enabled",
            dataSubmit: true,
          })}
        </form>`,
      description: "The Daily Plan is the user's structured plan for each day, built from a short daily questionnaire plus AI-personalized questions. It replaces the old Routines system and is distinct from Reminders.",
    })}

    <div class="card">
      <form method="POST" action="/admin/ava_brain/daily_plan">
        <input type="hidden" name="action" value="save_config">

        <div class="row cols-2" style="margin-top:8px;">
          <div>
            <label>Retention (days, ${MIN_RETENTION_DAYS}–${MAX_RETENTION_DAYS})</label>
            <input type="number" min="${MIN_RETENTION_DAYS}" max="${MAX_RETENTION_DAYS}" name="daily_plan_retention_days" value="${escHtml(retention)}">
            <small>Oldest Daily Plans are removed first when exceeded.</small>
          </div>
          <div>
            <label>Public app URL (for questionnaire links)</label>
            <input type="text" name="daily_plan_app_url" value="${escHtml(appUrl)}" placeholder="https://your-worker.workers.dev">
            <small>Auto-captured from the first webhook if left empty.</small>
          </div>
        </div>

        <div class="row cols-2" style="margin-top:8px;">
          <div>
            <label>Morning question time</label>
            <input type="text" name="daily_plan_morning_time" value="${escHtml(morning)}" placeholder="07:00">
            <small>Questionnaire is sent at this time, unless delayed by night activity.</small>
          </div>
          <div>
            <label>Evening check-in / daily check time</label>
            <input type="text" name="daily_plan_checkin_time" value="${escHtml(checkin)}" placeholder="18:00">
            <small>Evening nudge if the questionnaire is still incomplete.</small>
          </div>
        </div>

        <div class="row cols-3" style="margin-top:8px;">
          <div>
            <label>Night inactivity delay (hours)</label>
            <input type="number" min="0" max="24" name="daily_plan_night_delay_hours" value="${escHtml(delay)}">
            <small>If the user was active at night, morning moves to last message + this delay.</small>
          </div>
          <div>
            <label>Unfinished-activity reminder interval (hours)</label>
            <input type="number" min="1" max="72" name="daily_plan_reminder_interval_hours" value="${escHtml(interval)}">
          </div>
          <div>
            <label>AI personalized questions (per day)</label>
            <input type="number" min="0" max="5" name="daily_plan_ai_question_count" value="${escHtml(aiCount)}">
          </div>
        </div>

        <button type="submit" style="margin-top:16px;">Save Settings</button>
      </form>
    </div>

    <div class="card">
      <h3>Recent Daily Plans</h3>
      <div class="table-wrap">
        <table>
          <tr><th>Date</th><th>Status</th><th>Created</th><th></th></tr>
          ${planRows}
        </table>
      </div>
    </div>
  `;
}
