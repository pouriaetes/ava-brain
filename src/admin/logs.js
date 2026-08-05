// Admin panel logs page handler
import { layout, escHtml } from "../lib/html.js";

export async function handleLogsPage(request, env, config) {
  const db = env.DB;
  const url = new URL(request.url);
  const level = url.searchParams.get("level") || "";
  const limit = parseInt(url.searchParams.get("limit") || "100", 10);
  const event = url.searchParams.get("event") || "";

  const logs = await queryLogs(db, { level, event, limit });
  const levels = ["debug", "info", "warn", "error"];

  const content = `
    <div class="card">
      <h2>Logs</h2>
      <form method="GET" action="/admin/ava_brain/logs">
        <div class="row">
          <div class="col">
            <label>Level</label>
            <select name="level">
              <option value="">All</option>
              ${levels.map(l => `<option value="${l}" ${level === l ? "selected" : ""}>${l}</option>`).join("")}
            </select>
          </div>
          <div class="col">
            <label>Event</label>
            <input type="text" name="event" value="${escHtml(event)}" placeholder="e.g., telegram_message">
          </div>
          <div class="col">
            <label>Limit</label>
            <input type="number" name="limit" value="${limit}">
          </div>
        </div>
        <button type="submit">Filter</button>
      </form>
    </div>

    <div class="card">
      ${logs.map(log => `
        <div style="margin-top:12px;padding-top:12px;border-top:1px solid #333;">
          <p><strong>${escHtml(log.created_at)}</strong> <span class="badge ${log.level === 'error' ? 'inactive' : 'active'}">${escHtml(log.level)}</span> ${escHtml(log.event)}</p>
          <pre>${escHtml(log.metadata || "{}")}</pre>
        </div>
      `).join("")}
    </div>
  `;

  return layout({
    title: "Logs",
    content,
    session: true,
  });
}

async function queryLogs(db, { level, event, limit }) {
  let query = "SELECT * FROM logs WHERE 1=1";
  const params = [];

  if (level) {
    query += " AND level = ?";
    params.push(level);
  }

  if (event) {
    query += " AND event LIKE ?";
    params.push(`%${event}%`);
  }

  query += " ORDER BY created_at DESC LIMIT ?";
  params.push(limit);

  try {
    const results = params.length > 0 ? await db.prepare(query).bind(...params).all() : await db.prepare(query).all();
    return results.results || [];
  } catch (error) {
    console.error("Logs query error:", error);
    return [];
  }
}