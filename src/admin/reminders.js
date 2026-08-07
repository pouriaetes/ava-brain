import { layout, escHtml } from "../lib/html.js";
import { log } from "../lib/logger.js";

export async function handleRemindersPage(request, env, config) {
  const db = env.DB;
  let flash = "";
  let error = "";

  if (request.method === "POST") {
    const formData = await request.formData();
    const action = formData.get("action");

    try {
      if (action === "delete") {
        const id = parseInt(formData.get("id"), 10);
        if (!id) throw new Error("Invalid reminder id");

        await db.prepare("DELETE FROM reminders WHERE id = ?").bind(id).run();
        await log.info(db, "admin", "reminder_deleted", { id });
        flash = "Reminder deleted.";
      } else if (action === "edit") {
        const id = parseInt(formData.get("id"), 10);
        if (!id) throw new Error("Invalid reminder id");

        const title = String(formData.get("title") || "").trim();
        const description = String(formData.get("description") || "").trim();
        const remindAtUtc = String(formData.get("remind_at_utc") || "").trim();
        const repeatRule = String(formData.get("repeat_rule") || "").trim();

        let status = String(formData.get("status") || "pending").trim();
        let priority = String(formData.get("priority") || "medium").trim();

        const allowedStatuses = ["pending", "processing", "notified", "done"];
        const allowedPriorities = ["low", "medium", "high"];

        if (!allowedStatuses.includes(status)) status = "pending";
        if (!allowedPriorities.includes(priority)) priority = "medium";

        if (!title) throw new Error("Title is required");
        if (!remindAtUtc) throw new Error("Remind At UTC is required");

        await db.prepare(
          "UPDATE reminders SET title = ?, description = ?, remind_at_utc = ?, repeat_rule = ?, status = ?, priority = ?, updated_at = datetime('now') WHERE id = ?"
        ).bind(title, description, remindAtUtc, repeatRule, status, priority, id).run();

        await log.info(db, "admin", "reminder_updated", { id });
        flash = "Reminder updated.";
      }
    } catch (e) {
      error = e.message;
      try {
        await log.error(db, "admin", "reminders_page_error", { error: e.message });
      } catch {}
    }
  }

  const reminders = await db.prepare(
    "SELECT * FROM reminders ORDER BY COALESCE(remind_at_utc, '9999-12-31') ASC, id DESC LIMIT 200"
  ).all();

  const content = `
    <h2>Reminders</h2>
    <p class="muted">Review, edit, or delete reminders created by Ava. Total shown: ${(reminders.results || []).length}</p>

    ${flash ? `<div class="flash success">${escHtml(flash)}</div>` : ""}
    ${error ? `<div class="flash error">${escHtml(error)}</div>` : ""}

    ${renderRemindersList(reminders.results || [])}
  `;

  return new Response(layout({
    title: "Reminders",
    currentPage: "/admin/ava_brain/reminders",
    content,
    session: true
  }), {
    headers: { "Content-Type": "text/html" }
  });
}

function renderRemindersList(reminders) {
  if (!reminders.length) {
    return '<div class="card"><p class="muted">No reminders found.</p></div>';
  }

  return reminders.map((reminder) => {
    const status = reminder.status || "pending";
    const priority = reminder.priority || "medium";
    const statusClass = status === "pending" ? "active" : status === "done" ? "inactive" : "warning";

    return `
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">
          <div>
            <h3 style="margin:0 0 8px;">${escHtml(reminder.title || "(no title)")}</h3>
            <span class="badge ${statusClass}">${escHtml(status)}</span>
            <span class="badge">${escHtml(priority)}</span>
          </div>

          <form method="POST" action="/admin/ava_brain/reminders" style="display:inline;">
            <input type="hidden" name="action" value="delete">
            <input type="hidden" name="id" value="${reminder.id}">
            <button type="submit" class="small danger" onclick="return confirm('Delete this reminder?')">Delete</button>
          </form>
        </div>

        <p class="muted" style="margin-top:12px;">
          Remind at UTC: ${escHtml(reminder.remind_at_utc || "-")} |
          Repeat rule: ${escHtml(reminder.repeat_rule || "-")} |
          Notified at: ${escHtml(reminder.notified_at || "Never")} |
          Created at: ${escHtml(reminder.created_at || "-")}
        </p>

        ${reminder.description ? `<p style="margin-top:8px;">${escHtml(reminder.description)}</p>` : ""}

        <form method="POST" action="/admin/ava_brain/reminders" style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border-color);">
          <input type="hidden" name="action" value="edit">
          <input type="hidden" name="id" value="${reminder.id}">

          <label>Title</label>
          <input type="text" name="title" value="${escHtml(reminder.title || "")}" required>

          <label>Description</label>
          <textarea name="description" rows="3">${escHtml(reminder.description || "")}</textarea>

          <div class="row cols-2">
            <div>
              <label>Remind At UTC</label>
              <input type="text" name="remind_at_utc" value="${escHtml(reminder.remind_at_utc || "")}" required>
            </div>

            <div>
              <label>Status</label>
              <select name="status">
                <option value="pending" ${status === "pending" ? "selected" : ""}>pending</option>
                <option value="processing" ${status === "processing" ? "selected" : ""}>processing</option>
                <option value="notified" ${status === "notified" ? "selected" : ""}>notified</option>
                <option value="done" ${status === "done" ? "selected" : ""}>done</option>
              </select>
            </div>
          </div>

          <label>Repeat Rule / Schedule JSON</label>
          <textarea name="repeat_rule" rows="4">${escHtml(reminder.repeat_rule || "")}</textarea>

          <label>Priority</label>
          <select name="priority">
            <option value="low" ${priority === "low" ? "selected" : ""}>low</option>
            <option value="medium" ${priority === "medium" ? "selected" : ""}>medium</option>
            <option value="high" ${priority === "high" ? "selected" : ""}>high</option>
          </select>

          <div style="margin-top:16px;">
            <button type="submit">Save Changes</button>
          </div>
        </form>
      </div>
    `;
  }).join("");
}
