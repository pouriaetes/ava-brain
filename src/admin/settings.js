// Admin panel settings page handler
import { layout, escHtml } from "../lib/html.js";
import { log } from "../lib/logger.js";

export async function handleSettingsPage(request, env, config) {
  const db = env.DB;

  if (request.method === "GET") {
    const settings = await getAllSettings(db);
    return new Response(layout({
      title: "Settings",
      content: renderSettingsForm(settings),
      session: true,
    }), { headers: { "Content-Type": "text/html" } });
  }

  if (request.method === "POST") {
    const formData = await request.formData();

    const updates = {
      bot_name: formData.get("bot_name"),
      owner_name: formData.get("owner_name"),
      persona: formData.get("persona"),
      response_style: formData.get("response_style"),
      timezone: formData.get("timezone"),
      checkin_enabled: formData.get("checkin_enabled") === "on" ? "true" : "false",
      nightly_summary_enabled: formData.get("nightly_summary_enabled") === "on" ? "true" : "false",
    };

    for (const [key, value] of Object.entries(updates)) {
      if (value !== null) {
        await db
          .prepare("UPDATE settings SET value = ?, updated_at = datetime('now') WHERE key = ?")
          .bind(value, key)
          .run();
      }
    }

    await log(db, "info", "settings_updated", { keys: Object.keys(updates) });

    const settings = await getAllSettings(db);
    return new Response(layout({
      title: "Settings",
      content: `<div class="flash success">Settings saved.</div>${renderSettingsForm(settings)}`,
      session: true,
    }), { headers: { "Content-Type": "text/html" } });
  }

  return new Response("Method Not Allowed", { status: 405 });
}

async function getAllSettings(db) {
  const results = await db.prepare("SELECT * FROM settings").all();
  const map = {};
  for (const row of results.results || []) {
    map[row.key] = row.value;
  }
  return map;
}

function renderSettingsForm(settings) {
  return `
    <div class="card">
      <h2>Bot Settings</h2>
      <form method="POST" action="/admin/ava_brain/settings">
        <label>Bot Name</label>
        <input type="text" name="bot_name" value="${escHtml(settings.bot_name || "Ava")}">

        <label>Owner Name</label>
        <input type="text" name="owner_name" value="${escHtml(settings.owner_name || "Pouria")}">

        <label>Timezone</label>
        <input type="text" name="timezone" value="${escHtml(settings.timezone || "Asia/Tehran")}">

        <label>Persona</label>
        <textarea name="persona" rows="6">${escHtml(settings.persona || "")}</textarea>

        <label>Response Style</label>
        <input type="text" name="response_style" value="${escHtml(settings.response_style || "")}">

        <label>
          <input type="checkbox" name="checkin_enabled" ${settings.checkin_enabled === "true" ? "checked" : ""}>
          Enable daily check-in
        </label>

        <label>
          <input type="checkbox" name="nightly_summary_enabled" ${settings.nightly_summary_enabled === "true" ? "checked" : ""}>
          Enable nightly summary
        </label>

        <button type="submit">Save Settings</button>
      </form>
    </div>
  `;
}
