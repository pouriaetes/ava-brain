// Admin panel memory page handler
import { layout, escHtml } from "../lib/html.js";
import { log } from "../lib/logger.js";

export async function handleMemoryPage(request, env, config) {
  const db = env.DB;

  if (request.method === "GET") {
    return await renderMemoryPage(db, null, null);
  }

  if (request.method === "POST") {
    const formData = await request.formData();
    const action = formData.get("action");
    let message = null;
    let error = null;

    try {
      if (action === "add_fact") {
        await addProfileFact(db, formData);
        message = "Profile fact added.";
      } else if (action === "edit_fact") {
        await editProfileFact(db, formData);
        message = "Profile fact updated.";
      } else if (action === "delete_fact") {
        await deleteProfileFact(db, formData);
        message = "Profile fact deleted.";
      } else if (action === "delete_long_term") {
        await deleteLongTerm(db, formData);
        message = "Long-term memory deleted.";
      } else if (action === "clear_short_term") {
        await clearShortTerm(db);
        message = "Short-term memory cleared.";
      }
    } catch (e) {
      error = e.message;
    }

    return await renderMemoryPage(db, message, error);
  }

  return new Response("Method Not Allowed", { status: 405 });
}

async function renderMemoryPage(db, message, error) {
  const profileFacts = await db.prepare("SELECT * FROM profile_facts ORDER BY updated_at DESC").all();
  const longTerm = await db.prepare("SELECT * FROM memory_long_term ORDER BY last_accessed_at DESC LIMIT 100").all();
  const shortTermCount = await db.prepare("SELECT COUNT(*) as count FROM memory_short_term").first();

  const content = `
    ${message ? `<div class="flash success">${escHtml(message)}</div>` : ""}
    ${error ? `<div class="flash error">${escHtml(error)}</div>` : ""}

    <div class="card">
      <h2>Short-term Memory</h2>
      <p>Entries: <strong>${shortTermCount.count || 0}</strong></p>
      <form method="POST" action="/admin/ava_brain/memory">
        <input type="hidden" name="action" value="clear_short_term">
        <button type="submit" class="danger" onclick="return confirm('Clear all short-term memory?')">Clear All</button>
      </form>
    </div>

    <div class="card">
      <h2>Profile Facts</h2>
      <p class="muted" style="margin-bottom:12px;">These facts are normally learned and saved automatically by Ava during conversations. Manually adding or editing a fact here should only be needed occasionally, for corrections or facts you want to set directly.</p>
      <details>
        <summary style="cursor:pointer;">+ Add Fact Manually</summary>
        <form method="POST" action="/admin/ava_brain/memory" style="margin-top:12px;">
          <input type="hidden" name="action" value="add_fact">
          <div class="row">
            <div class="col"><label>Category</label><input type="text" name="category" required placeholder="e.g., preference"></div>
            <div class="col"><label>Key</label><input type="text" name="fact_key" required placeholder="e.g., favorite_coffee"></div>
          </div>
          <label>Value</label><input type="text" name="fact_value" required placeholder="e.g., Espresso">
          <div class="row">
            <div class="col"><label>Confidence (0-1)</label><input type="number" step="0.1" min="0" max="1" name="confidence" value="0.8"></div>
            <div class="col"><label>Source</label><input type="text" name="source" placeholder="e.g., conversation"></div>
          </div>
          <label><input type="checkbox" name="is_permanent" checked> Permanent</label>
          <button type="submit">Add Fact</button>
        </form>
      </details>

      <div style="margin-top:16px;">
        ${(profileFacts.results || []).map(fact => `
          <details style="margin-top:8px;padding:8px;border:1px solid #333;border-radius:6px;">
            <summary style="cursor:pointer;"><strong>${escHtml(fact.fact_key)}</strong> <span class="muted">(${escHtml(fact.category)}): ${escHtml(fact.fact_value)}</span></summary>
            <form method="POST" action="/admin/ava_brain/memory" style="margin-top:8px;padding-top:8px;border-top:1px solid #333;">
              <input type="hidden" name="action" value="edit_fact">
              <input type="hidden" name="id" value="${fact.id}">
              <div class="row">
                <div class="col"><input type="text" name="category" value="${escHtml(fact.category)}"></div>
                <div class="col"><input type="text" name="fact_key" value="${escHtml(fact.fact_key)}"></div>
              </div>
              <input type="text" name="fact_value" value="${escHtml(fact.fact_value)}">
              <div class="row">
                <div class="col"><input type="number" step="0.1" min="0" max="1" name="confidence" value="${fact.confidence}"></div>
                <div class="col"><input type="text" name="source" value="${escHtml(fact.source || "")}"></div>
              </div>
              <label><input type="checkbox" name="is_permanent" ${fact.is_permanent ? "checked" : ""}> Permanent</label>
              <button type="submit">Update</button>
              <button type="submit" name="action" value="delete_fact" class="danger small" onclick="return confirm('Delete this fact?')">Delete</button>
            </form>
          </details>
        `).join("")}
      </div>
    </div>

    <div class="card">
      <details>
        <summary style="cursor:pointer;"><h2 style="display:inline;">Long-term Memory (${(longTerm.results || []).length})</h2></summary>
        <div style="margin-top:12px;">
          ${(longTerm.results || []).map(item => `
            <details style="margin-top:8px;padding:8px;border:1px solid #333;border-radius:6px;">
              <summary style="cursor:pointer;">
                <strong>${escHtml(item.title)}</strong> <span class="muted">(${escHtml(item.type)})</span>
              </summary>
              <div style="margin-top:8px;padding-top:8px;border-top:1px solid #333;">
                <p>${escHtml(item.content)}</p>
                <p class="muted">Tags: ${escHtml(item.tags || "[]")} | Accessed: ${item.access_count} times</p>
                <form method="POST" action="/admin/ava_brain/memory" style="display:inline">
                  <input type="hidden" name="action" value="delete_long_term">
                  <input type="hidden" name="id" value="${item.id}">
                  <button type="submit" class="small danger" onclick="return confirm('Delete this memory?')">Delete</button>
                </form>
              </div>
            </details>
          `).join("")}
        </div>
      </details>
    </div>
  `;

  return new Response(layout({
    title: "Memory",
    content,
    session: true,
  }), { headers: { "Content-Type": "text/html" } });
}

async function addProfileFact(db, formData) {
  await db
    .prepare(
      "INSERT INTO profile_facts (category, fact_key, fact_value, confidence, source, is_permanent) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .bind(
      formData.get("category"),
      formData.get("fact_key"),
      formData.get("fact_value"),
      parseFloat(formData.get("confidence") || "0.8"),
      formData.get("source") || "",
      formData.get("is_permanent") === "on" ? 1 : 0
    )
    .run();
  await log(db, "info", "profile_fact_added", { key: formData.get("fact_key") });
}

async function editProfileFact(db, formData) {
  await db
    .prepare(
      "UPDATE profile_facts SET category = ?, fact_key = ?, fact_value = ?, confidence = ?, source = ?, is_permanent = ?, updated_at = datetime('now') WHERE id = ?"
    )
    .bind(
      formData.get("category"),
      formData.get("fact_key"),
      formData.get("fact_value"),
      parseFloat(formData.get("confidence") || "0.8"),
      formData.get("source") || "",
      formData.get("is_permanent") === "on" ? 1 : 0,
      parseInt(formData.get("id"), 10)
    )
    .run();
  await log(db, "info", "profile_fact_edited", { id: formData.get("id") });
}

async function deleteProfileFact(db, formData) {
  await db.prepare("DELETE FROM profile_facts WHERE id = ?").bind(parseInt(formData.get("id"), 10)).run();
  await log(db, "info", "profile_fact_deleted", { id: formData.get("id") });
}

async function deleteLongTerm(db, formData) {
  await db.prepare("DELETE FROM memory_long_term WHERE id = ?").bind(parseInt(formData.get("id"), 10)).run();
  await log(db, "info", "long_term_deleted", { id: formData.get("id") });
}

async function clearShortTerm(db) {
  await db.prepare("DELETE FROM memory_short_term").run();
  await log(db, "info", "short_term_cleared", {});
}