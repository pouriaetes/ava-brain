// Admin panel Reminders page — redesigned for large lists.
// Groups reminders into Active / Done / Cancelled, provides search + status + type
// filters, and uses compact rows with expandable edit details. Only touches the
// reminders table; no schema change. Backend actions (delete/edit) are unchanged.
import { layout, escHtml, pageHeader, badge, flash } from "../lib/html.js";
import { log } from "../lib/logger.js";
import { parseRepeatRule } from "../lib/reminders.js";

const ALLOWED_STATUSES = ["pending", "notified", "failed", "cancelled"];
const ALLOWED_PRIORITIES = ["low", "medium", "high", "urgent"];

// OPT-011: shared parseRepeatRule is the single schedule-type parser; this wrapper
// adds the admin-only human-readable `summary` label. It re-checks JSON
// parseability only to preserve the historical "One-time" label for corrupt JSON.
function parseRepeatRuleWithSummary(raw) {
  const p = parseRepeatRule(raw);
  const s = raw ? String(raw).trim() : "";
  if (s.startsWith("{")) {
    let parsedJson = null;
    try { parsedJson = JSON.parse(s); } catch (e) {}
    if (parsedJson === null) {
      return { ...p, summary: "One-time" };
    }
    return { ...p, summary: formatSchedule(p.schedule_type, p.local_time, p.interval_hours) };
  }
  return { ...p, summary: s || "One-time" };
}

function formatSchedule(type, localTime, intervalHours) {
  switch (type) {
    case "daily": return localTime ? `Daily at ${localTime}` : "Daily";
    case "weekly": return localTime ? `Weekly (${localTime})` : "Weekly";
    case "monthly": return "Monthly";
    case "hourly": return "Hourly";
    case "interval": return intervalHours ? `Every ${intervalHours}h` : "Every N hours";
    case "once": return "One-time";
    default: return type;
  }
}

function isOverdue(reminder, nowIso) {
  if (reminder.status !== "pending") return false;
  const at = reminder.remind_at_utc;
  if (!at) return false;
  const t = Date.parse(at);
  return Number.isFinite(t) && t < Date.parse(nowIso);
}

function classifyStatus(reminder, nowIso) {
  const st = reminder.status || "pending";
  if (st === "pending") return isOverdue(reminder, nowIso) ? "overdue" : "active";
  if (st === "notified") return "done";
  if (st === "failed") return "failed";
  return "cancelled";
}

function renderEmptyState() {
  return `
    <div class="card">
      <h3>No Reminders</h3>
      <p class="muted" style="margin-top:8px;">A reminder is a scheduled notification that Ava sends to you at a specific time (one-time or repeating).</p>
      <p class="muted" style="margin-top:8px;">Reminders can be created by telling Ava in Telegram, e.g. <em>"یادم بنداز ساعت ۱۱ قرصمو بخورم"</em> or <em>"remind me at 9pm to call mom"</em> — or created by the Router/action system when a scheduled action is detected.</p>
    </div>
  `;
}

function renderSummaryBar(reminders, filters) {
  const nowIso = new Date().toISOString();
  const counts = {
    active: reminders.filter((r) => classifyStatus(r, nowIso) === "active").length,
    overdue: reminders.filter((r) => classifyStatus(r, nowIso) === "overdue").length,
    done: reminders.filter((r) => classifyStatus(r, nowIso) === "done").length,
    failed: reminders.filter((r) => classifyStatus(r, nowIso) === "failed").length,
    cancelled: reminders.filter((r) => classifyStatus(r, nowIso) === "cancelled").length,
  };
  const typeCounts = {
    recurring: reminders.filter((r) => parseRepeatRuleWithSummary(r.repeat_rule).recurring).length,
    once: reminders.filter((r) => !parseRepeatRuleWithSummary(r.repeat_rule).recurring).length,
  };

  const pill = (id, label, count, active) => `
    <a href="/admin/ava_brain/reminders?filter=${id}" class="btn small ${active ? "" : "secondary"}">${escHtml(label)} (${count})</a>`;

  return `
    <div class="card">
      <p class="muted" style="margin-top:4px;">Scheduled notifications Ava sends you. Total: ${reminders.length}</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">
        ${pill("", "All", reminders.length, filters.filter === "")}
        ${pill("active", "Active", counts.active, filters.filter === "active")}
        ${pill("overdue", "Overdue", counts.overdue, filters.filter === "overdue")}
        ${pill("done", "Done", counts.done, filters.filter === "done")}
        ${pill("failed", "Failed", counts.failed, filters.filter === "failed")}
        ${pill("cancelled", "Cancelled", counts.cancelled, filters.filter === "cancelled")}
      </div>
      <form method="GET" action="/admin/ava_brain/reminders" style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;">
        <div style="flex:1;min-width:180px;"><label>Search title / description</label><input type="text" name="q" value="${escHtml(filters.q || "")}" placeholder="Search reminders..."></div>
        <div><label>Type</label>
          <select name="type">
            <option value="" ${filters.type === "" ? "selected" : ""}>All types</option>
            <option value="recurring" ${filters.type === "recurring" ? "selected" : ""}>Recurring</option>
            <option value="once" ${filters.type === "once" ? "selected" : ""}>One-time</option>
          </select>
        </div>
        <input type="hidden" name="filter" value="${escHtml(filters.filter)}">
        <div><label>Sort</label>
          <select name="sort">
            <option value="time" ${filters.sort === "time" ? "selected" : ""}>Next execution time</option>
            <option value="created" ${filters.sort === "created" ? "selected" : ""}>Created time</option>
          </select>
        </div>
        <button type="submit" class="small">Filter</button>
        <a href="/admin/ava_brain/reminders" class="btn small secondary">Reset</a>
      </form>
    </div>
  `;
}

function renderReminderRow(reminder, nowIso) {
  const statusClass = classifyStatus(reminder, nowIso);
  const statusLabel = statusClass === "overdue" ? "Overdue"
    : statusClass === "failed" ? "Failed"
    : statusClass === "done" ? "Done"
    : statusClass === "cancelled" ? "Cancelled"
    : "Active";
  const statusBadgeKind = statusClass === "active" ? "success"
    : statusClass === "overdue" ? "warning"
    : statusClass === "failed" ? "error"
    : "neutral";
  const rr = parseRepeatRuleWithSummary(reminder.repeat_rule);
  const at = reminder.remind_at_utc || "";

  return `
    <div class="card" style="padding:14px 16px;margin-bottom:8px;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
        <div style="flex:1;min-width:220px;">
          <strong>${escHtml(reminder.title || "(no title)")}</strong>
          <div class="muted" style="font-size:0.8rem;margin-top:2px;">
            ${escHtml(reminder.description || "")}
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          ${badge(statusBadgeKind, statusLabel)}
          <span class="badge neutral">${rr.recurring ? "Recurring" : "One-time"}</span>
          <span class="muted" style="font-size:0.8rem;">${escHtml(at ? localTime(at) : "No time")}</span>
          <div style="display:flex;gap:6px;">
            <button type="button" class="small secondary" onclick="document.getElementById('edit-${reminder.id}').style.display = document.getElementById('edit-${reminder.id}').style.display === 'none' ? 'block' : 'none';">Edit</button>
            <form method="POST" action="/admin/ava_brain/reminders" style="display:inline">
              <input type="hidden" name="action" value="delete">
              <input type="hidden" name="id" value="${reminder.id}">
              <button type="submit" class="small danger" onclick="return confirm('Delete this reminder?')">Delete</button>
            </form>
          </div>
        </div>
      </div>

      <div class="muted" style="font-size:0.78rem;margin-top:6px;">
        ${escHtml(rr.summary)} · Created ${escHtml(reminder.created_at || "-")}${reminder.notified_at ? ` · Notified ${escHtml(reminder.notified_at)}` : ""}
      </div>

      <div id="edit-${reminder.id}" style="display:none;margin-top:14px;padding-top:14px;border-top:1px solid var(--border-color);">
        <form method="POST" action="/admin/ava_brain/reminders">
          <input type="hidden" name="action" value="edit">
          <input type="hidden" name="id" value="${reminder.id}">

          <div class="row cols-2">
            <div><label>Title</label><input type="text" name="title" value="${escHtml(reminder.title || "")}" required></div>
            <div><label>Remind At (UTC ISO)</label><input type="text" name="remind_at_utc" value="${escHtml(at)}" required></div>
          </div>

          <label>Description</label>
          <textarea name="description" rows="2">${escHtml(reminder.description || "")}</textarea>

          <div class="row cols-2">
            <div>
              <label>Status</label>
              <select name="status">
                ${ALLOWED_STATUSES.map((s) => `<option value="${s}" ${(reminder.status || "pending") === s ? "selected" : ""}>${s}</option>`).join("")}
              </select>
            </div>
            <div>
              <label>Priority</label>
              <select name="priority">
                ${ALLOWED_PRIORITIES.map((p) => `<option value="${p}" ${(reminder.priority || "medium") === p ? "selected" : ""}>${p}</option>`).join("")}
              </select>
            </div>
          </div>

          <label>Repeat Rule / Schedule JSON</label>
          <textarea name="repeat_rule" rows="3">${escHtml(reminder.repeat_rule || "")}</textarea>
          <small class="muted">e.g. <code>{"schedule_type":"daily","local_time":"09:00"}</code> for daily, or empty / <code>once</code> for one-time.</small>

          <div style="margin-top:12px;display:flex;gap:8px;">
            <button type="submit">Save Changes</button>
            <button type="button" class="secondary" onclick="document.getElementById('edit-${reminder.id}').style.display='none';">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

// Convert a UTC ISO string to a compact local (Asia/Tehran) display when possible.
function localTime(utcIso) {
  const d = new Date(utcIso);
  if (isNaN(d.getTime())) return utcIso;
  try {
    return d.toLocaleString("en-GB", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
  } catch {
    return d.toISOString();
  }
}

export async function handleRemindersPage(request, env, config) {
  const db = env.DB;
  let flashMsg = "";
  let error = "";
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim().toLowerCase();
  const filter = url.searchParams.get("filter") || "";
  const type = url.searchParams.get("type") || "";
  const sort = url.searchParams.get("sort") || "time";

  if (request.method === "POST") {
    const formData = await request.formData();
    const action = formData.get("action");

    try {
      if (action === "delete") {
        const id = parseInt(formData.get("id"), 10);
        if (!id) throw new Error("Invalid reminder id");
        await db.prepare("DELETE FROM reminders WHERE id = ?").bind(id).run();
        await log.info(db, "admin", "reminder_deleted", { id });
        flashMsg = "Reminder deleted.";
      } else if (action === "edit") {
        const id = parseInt(formData.get("id"), 10);
        if (!id) throw new Error("Invalid reminder id");

        const title = String(formData.get("title") || "").trim();
        const description = String(formData.get("description") || "").trim();
        const remindAtUtc = String(formData.get("remind_at_utc") || "").trim();
        const repeatRule = String(formData.get("repeat_rule") || "").trim();
        let status = String(formData.get("status") || "pending").trim();
        let priority = String(formData.get("priority") || "medium").trim();

        if (!ALLOWED_STATUSES.includes(status)) status = "pending";
        if (!ALLOWED_PRIORITIES.includes(priority)) priority = "medium";
        if (!title) throw new Error("Title is required");
        if (!remindAtUtc) throw new Error("Remind At UTC is required");

        await db.prepare(
          "UPDATE reminders SET title = ?, description = ?, remind_at_utc = ?, repeat_rule = ?, status = ?, priority = ?, updated_at = datetime('now') WHERE id = ?"
        ).bind(title, description, remindAtUtc, repeatRule, status, priority, id).run();

        await log.info(db, "admin", "reminder_updated", { id });
        flashMsg = "Reminder updated.";
      }
    } catch (e) {
      error = e.message;
      try {
        await log.error(db, "admin", "reminders_page_error", { error: e.message });
      } catch {}
    }
  }

  let allReminders = (await db.prepare("SELECT * FROM reminders").all()).results || [];
  const nowIso = new Date().toISOString();

  // Apply filters
  let filtered = allReminders;
  if (filter === "active") filtered = filtered.filter((r) => classifyStatus(r, nowIso) === "active");
  else if (filter === "overdue") filtered = filtered.filter((r) => classifyStatus(r, nowIso) === "overdue");
  else if (filter === "done") filtered = filtered.filter((r) => classifyStatus(r, nowIso) === "done");
  else if (filter === "failed") filtered = filtered.filter((r) => classifyStatus(r, nowIso) === "failed");
  else if (filter === "cancelled") filtered = filtered.filter((r) => classifyStatus(r, nowIso) === "cancelled");

  if (type === "recurring") filtered = filtered.filter((r) => parseRepeatRuleWithSummary(r.repeat_rule).recurring);
  else if (type === "once") filtered = filtered.filter((r) => !parseRepeatRuleWithSummary(r.repeat_rule).recurring);

  if (q) {
    filtered = filtered.filter((r) =>
      ((r.title || "") + " " + (r.description || "")).toLowerCase().includes(q)
    );
  }

  if (sort === "created") {
    filtered.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  } else {
    filtered.sort((a, b) => String(a.remind_at_utc || "9999-12-31").localeCompare(String(b.remind_at_utc || "9999-12-31")));
  }

  const content = `
    ${flashMsg ? flash("success", flashMsg) : ""}
    ${error ? flash("error", error) : ""}

    ${pageHeader("Reminders", {
      description: "Scheduled notifications Ava sends you at a specific time. Create them in Telegram or here; a failed reminder is retried a limited number of times before being marked Failed.",
    })}

    ${allReminders.length === 0 ? renderEmptyState() : renderSummaryBar(allReminders, { filter, q, type, sort })}

    ${allReminders.length === 0 ? "" : (
      filtered.length === 0
        ? `<div class="card"><p class="muted">No reminders match the current filter.</p></div>`
        : filtered.map((r) => renderReminderRow(r, nowIso)).join("")
    )}
  `;

  return new Response(layout({
    title: "Reminders",
    currentPage: "/admin/ava_brain/reminders",
    content,
    session: true
  }), { headers: { "Content-Type": "text/html" } });
}
