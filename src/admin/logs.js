// Admin panel logs page handler
import { layout, escHtml, pageHeader, badge } from "../lib/html.js";

export async function handleLogsPage(request, env, config) {
  const db = env.DB;
  const url = new URL(request.url);
  const level = url.searchParams.get("level") || "";
  const limit = parseInt(url.searchParams.get("limit") || "100", 10);
  const event = url.searchParams.get("event") || "";

  const logs = await queryLogs(db, { level, event, limit });
  const levels = ["debug", "info", "warn", "error"];

  const content = `
    ${pageHeader("Logs", {
      description: "System and routing events written by the worker. Filter by level, event name, or row limit.",
    })}
    <div class="card">
      <form method="GET" action="/admin/ava_brain/logs">
        <div class="row cols-3">
          <div>
            <label>Level</label>
            <select name="level">
              <option value="">All</option>
              ${levels.map(l => `<option value="${l}" ${level === l ? "selected" : ""}>${l}</option>`).join("")}
            </select>
          </div>
          <div>
            <label>Event</label>
            <input type="text" name="event" value="${escHtml(event)}" placeholder="e.g., telegram_message">
          </div>
          <div>
            <label>Limit</label>
            <input type="number" name="limit" value="${limit}">
          </div>
        </div>
        <button type="submit">Filter</button>
      </form>
    </div>

    <div class="card">
      ${logs.length === 0 ? '<p class="muted">No logs found matching the criteria.</p>' : ''}
      ${logs.map(log => `
        <div style="padding:12px 0;border-bottom:1px solid var(--border-color);display:flex;align-items:flex-start;gap:12px;">
          <span style="min-width:60px;text-align:center;">${badge(log.level === "error" ? "error" : log.level === "warn" ? "warning" : log.level === "info" ? "info" : "neutral", log.level)}</span>
          <div style="flex:1;">
            <p style="margin:0;"><strong>${escHtml(log.event)}</strong></p>
            <p class="muted" style="margin:4px 0 0;font-size:0.8rem;">${escHtml(log.created_at)}</p>
            ${log.metadata && log.metadata !== '{}' ? `<pre style="margin-top:8px;font-size:0.75rem;">${escHtml(log.metadata)}</pre>` : ""}
          </div>
        </div>
      `).join("")}
    </div>
  `;

  return new Response(layout({
    title: "Logs",
    currentPage: "/admin/ava_brain/logs",
    content,
    session: true,
  }), { headers: { "Content-Type": "text/html" } });
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
