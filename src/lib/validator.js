// Action validator: whitelist of allowed action types and parameter schemas
// No direct SQL from AI output — all actions validated and executed by code
import { log } from "./logger.js";
import { t } from "./i18n.js";

const ACTION_WHITELIST = {
  create_reminder: {
    requiredParams: ["title", "remind_at_utc"],
    optionalParams: ["description", "entity_id", "event_id", "project_id", "repeat_rule", "priority", "source_message_id"],
    handler: "ReminderManager.createReminder",
  },
  create_event: {
    requiredParams: ["type", "title", "calendar", "month", "day"],
    optionalParams: ["entity_id", "year", "remind_offsets_minutes", "notes", "importance"],
    handler: "ReminderManager.createEvent",
  },
  upsert_entity: {
    requiredParams: ["type", "name"],
    optionalParams: ["aliases", "metadata", "importance"],
    handler: "upsertEntity",
  },
  create_project: {
    requiredParams: ["name"],
    optionalParams: ["client", "deadline_utc", "importance", "notes", "metadata"],
    handler: "ProjectManager.createProject",
  },
  update_project: {
    requiredParams: [],
    optionalParams: ["id", "reference", "target_reference", "name", "client", "status", "deadline_utc", "progress_percent", "next_action", "importance", "notes", "metadata"],
    handler: "ProjectManager.updateProject",
  },
  complete_project: {
    requiredParams: [],
    optionalParams: ["id", "reference", "target_reference", "final_note"],
    handler: "ProjectManager.completeProject",
  },
  delete_project: {
    requiredParams: [],
    optionalParams: ["id", "reference", "target_reference"],
    handler: "ProjectManager.deleteProject",
  },
  delete_short_term_memory: {
    requiredParams: [],
    optionalParams: ["id", "reference", "target_reference", "source_message_id"],
    handler: "MemoryManager.deleteShortTermById",
  },
  update_short_term_memory: {
    requiredParams: [],
    optionalParams: ["id", "reference", "target_reference", "content", "importance", "type", "source_message_id"],
    handler: "MemoryManager.updateShortTerm",
  },
  update_reminder: {
    requiredParams: [],
    optionalParams: ["id", "reference", "target_reference", "source_message_id", "title", "description", "remind_at_utc", "new_local_time", "repeat_rule", "status", "priority"],
    handler: "ReminderManager.updateReminder",
  },
  delete_reminder: {
    requiredParams: [],
    optionalParams: ["id", "reference", "target_reference", "source_message_id"],
    handler: "ReminderManager.deleteReminder",
  },
  update_memory: {
    requiredParams: [],
    optionalParams: ["id", "reference", "target_reference", "source_message_id", "title", "content", "type", "tags", "importance", "fact_key", "fact_value", "category", "confidence"],
    handler: "MemoryManager.updateMemory",
  },
  delete_memory: {
    requiredParams: [],
    optionalParams: ["id", "reference", "target_reference", "source_message_id"],
    handler: "MemoryManager.deleteMemory",
  },
  delete_event: {
    requiredParams: [],
    optionalParams: ["id", "reference", "target_reference"],
    handler: "deleteEvent",
  },
  save_long_term_memory: {
    requiredParams: ["type", "title", "content"],
    optionalParams: ["tags", "importance", "source"],
    handler: "MemoryManager.saveLongTerm",
  },
};

// Compact Asia/Tehran wall-clock display of an ISO instant.
function formatLocalTime(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso || "";
  try {
    return d.toLocaleString("en-GB", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
  } catch {
    return iso;
  }
}

// Pick a meaningful reply from action results: clarification first, then not-found,
// then a success message, then a generic failure — never a false success.
export function summarizeActionResults(results) {
  const clarification = (results || []).find((r) => r && r.needsClarification);
  if (clarification) return clarification.message || "I found several matches — which one do you mean?";
  const notFound = (results || []).find((r) => r && r.notFound);
  if (notFound) return notFound.message || "I couldn't find that.";
  const success = (results || []).find((r) => r && r.success);
  if (success) return success.message || "Done.";
  const failed = (results || []).find((r) => r && r.error);
  if (failed) return "That didn't work. Please try again.";
  return "Got it.";
}

// Rebuild a reminder's remind_at_utc so its Asia/Tehran wall-clock becomes the given
// local "HH:MM" on the SAME local date. Mirrors the timezone math used by daily-plan.js.
function applyLocalTime(currentIso, newLocalTime) {
  const s = String(newLocalTime || "").trim();
  const m = s.match(/(\d{1,2})[:：]?(\d{2})?/);
  if (!m) return null;
  let hour = parseInt(m[1], 10);
  let minute = m[2] ? parseInt(m[2], 10) : 0;
  const low = s.toLowerCase();
  if (/(بعد\s*از\s*ظهر|عصر|شب|pm)/.test(low) && hour < 12) hour += 12;
  if (/(صبح|am)/.test(low) && hour === 12) hour = 0;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  const current = new Date(currentIso);
  if (isNaN(current.getTime())) return null;
  const localDate = current.toLocaleString("en-CA", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" });
  const [y, mo, d] = localDate.split("-").map(Number);
  let guess = new Date(Date.UTC(y, mo - 1, d, hour, minute, 0, 0));
  for (let i = 0; i < 3; i++) {
    const t = guess.toLocaleString("en-GB", { timeZone: "Asia/Tehran", hour: "2-digit", minute: "2-digit", hour12: false });
    const [gh, gm] = t.split(":").map(Number);
    const diff = (hour * 60 + minute) - (gh * 60 + gm);
    if (diff === 0) break;
    guess = new Date(guess.getTime() + diff * 60000);
  }
  return guess.toISOString();
}

// Deterministically resolve an action's target from (in priority order): the
// replied-to message identity, an explicit verified id, or a natural-language
// reference. The AI never supplies a bare id we trust blindly — every id is
// re-verified against the database (and, for short-term memory, the session owner).
async function resolveTargetId(managers, entity, params) {
  const chatId = params.chat_id || params.chatId || params.session_id || "";
  const sourceMessageId = params.source_message_id || (params.message && params.message.replied_to_message_id) || null;
  const reference = params.target_reference || params.reference || null;

  // 1. Reply-to-message identity (deterministic; highest priority).
  if (sourceMessageId) {
    if (entity === "reminder") {
      const rows = await managers.ReminderManager.findReminders({ sourceMessageId });
      if (rows.length === 1) return { status: "ok", id: rows[0].id, target: rows[0] };
      if (rows.length > 1) return { status: "ambiguous", candidates: rows };
    }
    if (entity === "memory_short_term") {
      const rows = await managers.MemoryManager.findShortTermBySourceMessageId(chatId, sourceMessageId);
      if (rows.length === 1) return { status: "ok", id: rows[0].id, target: rows[0] };
      if (rows.length > 1) return { status: "ambiguous", candidates: rows };
    }
  }

  // 2. Explicit numeric id — verify existence (and ownership for short-term memory).
  if (params.id != null && /^\d+$/.test(String(params.id))) {
    const id = Number(params.id);
    let target = null;
    if (entity === "reminder") target = await managers.ReminderManager.getReminderById(id);
    else if (entity === "event") target = await managers.ReminderManager.getEventById(id);
    else if (entity === "memory") target = await managers.MemoryManager.getLongTermById(id);
    else if (entity === "memory_short_term") target = await managers.MemoryManager.getShortTermById(id, chatId);
    else if (entity === "project") target = await managers.ProjectManager.getProjectById(id);
    if (target) return { status: "ok", id, target };
    return { status: "not_found" };
  }

  // 3. Natural-language reference.
  if (reference) {
    let rows = [];
    if (entity === "reminder") rows = await managers.ReminderManager.findReminders({ reference });
    else if (entity === "event") rows = await managers.ReminderManager.findEvents(reference);
    else if (entity === "memory") rows = await managers.MemoryManager.findMemory(reference);
    else if (entity === "memory_short_term") rows = await managers.MemoryManager.findShortTerm(chatId, reference);
    else if (entity === "project") rows = await managers.ProjectManager.findProjects(reference);
    if (rows.length === 1) return { status: "ok", id: rows[0].id, target: rows[0] };
    if (rows.length > 1) return { status: "ambiguous", candidates: rows };
    return { status: "not_found" };
  }

  return { status: "missing" };
}

function buildTargetFailure(res, lang) {
  if (res.status === "ambiguous") {
    const lines = (res.candidates || []).slice(0, 5).map((c, i) => {
      const label = c.title || c.name || c.fact_key || c.fact_value || "item";
      return `${i + 1}. ${label}${c.remind_at_utc ? " — " + formatLocalTime(c.remind_at_utc) : ""}`;
    }).join("\n");
    return {
      success: false,
      needsClarification: true,
      candidates: res.candidates,
      message: t(lang, "ambiguous_matches", { lines }),
    };
  }
  if (res.status === "not_found") {
    return {
      success: false,
      notFound: true,
      message: t(lang, "not_found_specific"),
    };
  }
  return {
    success: false,
    message: t(lang, "specify_which"),
  };
}

export function validateAction(actionName, params) {
  const schema = ACTION_WHITELIST[actionName];
  if (!schema) {
    return { valid: false, error: `Unknown action: ${actionName}` };
  }

  // Check required params
  const missing = schema.requiredParams.filter(p => !(p in params));
  if (missing.length > 0) {
    return { valid: false, error: `Missing required params: ${missing.join(", ")}`, missing };
  }

  return { valid: true, schema };
}

export async function executeAction(actionName, params, managers, config) {
  const validation = validateAction(actionName, params);
  if (!validation.valid) {
    await log(config.DB, "error", "action_validation_failed", {
      action: actionName,
      error: validation.error,
    });
    return { success: false, error: validation.error };
  }

  const { MemoryManager, ReminderManager, ProjectManager } = managers;

  try {
    const lang = params.lang || (params.message && params.message.language) || "en";
    switch (actionName) {
      case "create_reminder":
        return await ReminderManager.createReminder({
          title: params.title,
          description: params.description,
          entityId: params.entity_id,
          eventId: params.event_id,
          projectId: params.project_id,
          remindAtUtc: params.remind_at_utc,
          repeatRule: params.repeat_rule,
          priority: params.priority,
          sourceMessageId: params.source_message_id
        });
      case "create_event":
        return await ReminderManager.createEvent({
          entityId: params.entity_id,
          type: params.type,
          title: params.title,
          calendar: params.calendar,
          year: params.year,
          month: params.month,
          day: params.day,
          remindOffsetsMinutes: params.remind_offsets_minutes,
          notes: params.notes,
          importance: params.importance
        });
      case "upsert_entity":
        return await upsertEntity(config.DB, params);
      case "create_project":
        return await ProjectManager.createProject({
          name: params.name,
          client: params.client,
          deadlineUtc: params.deadline_utc,
          importance: params.importance,
          notes: params.notes,
          metadata: params.metadata
        });
      case "update_project": {
        const res = await resolveTargetId(managers, "project", params);
        if (res.status !== "ok") return buildTargetFailure(res, lang);
        const updates = {};
        for (const k of ["name", "client", "status", "deadline_utc", "progress_percent", "next_action", "importance", "notes", "metadata"]) {
          if (params[k] !== undefined && params[k] !== null && params[k] !== "") updates[k] = params[k];
        }
        if (Object.keys(updates).length === 0) {
          return { success: false, message: t(lang, "project_what_change") };
        }
        const upd = await ProjectManager.updateProject(res.id, updates);
        if (!upd.success) return upd;
        return { success: true, message: t(lang, "project_updated") };
      }
      case "complete_project": {
        const res = await resolveTargetId(managers, "project", params);
        if (res.status !== "ok") return buildTargetFailure(res, lang);
        const done = await ProjectManager.completeProject(res.id, params.final_note || "");
        if (!done.success) return done;
        return { success: true, message: t(lang, "project_completed") };
      }
      case "delete_project": {
        const res = await resolveTargetId(managers, "project", params);
        if (res.status !== "ok") return buildTargetFailure(res, lang);
        const result = await ProjectManager.deleteProject(res.id);
        if (!result.success) return result;
        return { success: true, message: t(lang, "project_deleted") };
      }
      case "delete_short_term_memory": {
        const res = await resolveTargetId(managers, "memory_short_term", params);
        if (res.status !== "ok") return buildTargetFailure(res, lang);
        const chatId = params.chat_id || params.chatId || params.session_id || "";
        const result = await MemoryManager.deleteShortTermById(res.id, chatId);
        if (!result.success) return result;
        return { success: true, message: t(lang, "deleted") };
      }
      case "update_short_term_memory": {
        const res = await resolveTargetId(managers, "memory_short_term", params);
        if (res.status !== "ok") return buildTargetFailure(res, lang);
        const chatId = params.chat_id || params.chatId || params.session_id || "";
        const updates = {};
        for (const k of ["content", "importance", "type"]) {
          if (params[k] !== undefined && params[k] !== null && params[k] !== "") updates[k] = params[k];
        }
        if (Object.keys(updates).length === 0) {
          return { success: false, message: t(lang, "what_change_generic") };
        }
        const upd = await MemoryManager.updateShortTerm(res.id, chatId, updates);
        if (!upd.success) return upd;
        return { success: true, message: t(lang, "updated") };
      }
      case "update_reminder": {
        const res = await resolveTargetId(managers, "reminder", params);
        if (res.status !== "ok") return buildTargetFailure(res, lang);
        const updates = {};
        for (const k of ["title", "description", "repeat_rule", "status", "priority"]) {
          if (params[k] !== undefined && params[k] !== null && params[k] !== "") updates[k] = params[k];
        }
        if (params.remind_at_utc) {
          updates.remind_at_utc = params.remind_at_utc;
        } else if (params.new_local_time) {
          const iso = applyLocalTime(res.target.remind_at_utc, params.new_local_time);
          if (!iso) return { success: false, message: t(lang, "time_not_understood") };
          updates.remind_at_utc = iso;
        }
        if (Object.keys(updates).length === 0) {
          return { success: false, message: t(lang, "reminder_what_change") };
        }
        const upd = await ReminderManager.updateReminder(res.id, updates);
        if (!upd.success) return upd;
        return { success: true, message: t(lang, "reminder_updated") };
      }
      case "delete_reminder": {
        const res = await resolveTargetId(managers, "reminder", params);
        if (res.status !== "ok") return buildTargetFailure(res, lang);
        const result = await ReminderManager.deleteReminder(res.id);
        if (!result.success) return result;
        return { success: true, message: t(lang, "reminder_deleted") };
      }
      case "update_memory": {
        const res = await resolveTargetId(managers, "memory", params);
        if (res.status !== "ok") return buildTargetFailure(res, lang);
        const source = res.target._memorySource || "long_term";
        const updates = {};
        if (source === "profile_fact") {
          for (const k of ["fact_key", "fact_value", "category", "confidence"]) {
            if (params[k] !== undefined && params[k] !== null && params[k] !== "") updates[k] = params[k];
          }
          if (params.content && !updates.fact_value) updates.fact_value = params.content;
        } else {
          for (const k of ["type", "title", "content", "tags", "importance"]) {
            if (params[k] !== undefined && params[k] !== null && params[k] !== "") updates[k] = params[k];
          }
        }
        if (Object.keys(updates).length === 0) {
          return { success: false, message: t(lang, "memory_what_correct") };
        }
        const upd = await MemoryManager.updateMemory(res.id, source, updates);
        if (!upd.success) return upd;
        return { success: true, message: t(lang, "memory_updated") };
      }
      case "delete_memory": {
        const res = await resolveTargetId(managers, "memory", params);
        if (res.status !== "ok") return buildTargetFailure(res, lang);
        const source = res.target._memorySource || "long_term";
        const result = await MemoryManager.deleteMemory(res.id, source);
        if (!result.success) return result;
        return { success: true, message: t(lang, "memory_deleted") };
      }
      case "delete_event": {
        const res = await resolveTargetId(managers, "event", params);
        if (res.status !== "ok") return buildTargetFailure(res, lang);
        await config.DB.prepare("DELETE FROM reminders WHERE event_id = ?").bind(res.id).run();
        const result = await config.DB.prepare("DELETE FROM events WHERE id = ?").bind(res.id).run();
        const changes = result.meta?.changes || 0;
        if (changes === 0) return { success: false, notFound: true, error: "Event not found" };
        await log(config.DB, "info", "event_deleted", { id: res.id });
        return { success: true, message: t(lang, "event_deleted") };
      }
      case "save_long_term_memory":
        return await MemoryManager.saveLongTerm(params.type, params.title, params.content, params.tags || [], params.importance || 1, params.source || "");
      default:
        return { success: false, error: `Action not implemented: ${actionName}` };
    }
  } catch (error) {
    await log(config.DB, "error", "action_execution_failed", {
      action: actionName,
      error: error.message,
    });
    return { success: false, error: error.message };
  }
}

async function upsertEntity(db, params) {
  const existing = await db
    .prepare("SELECT id FROM entities WHERE type = ? AND name = ?")
    .bind(params.type, params.name)
    .first();

  if (existing) {
    await db
      .prepare(
        "UPDATE entities SET aliases = ?, metadata = ?, importance = ?, updated_at = datetime('now') WHERE id = ?"
      )
      .bind(
        JSON.stringify(params.aliases || []),
        JSON.stringify(params.metadata || {}),
        params.importance || 1,
        existing.id
      )
      .run();
    return { id: existing.id, success: true, created: false };
  } else {
    const result = await db
      .prepare(
        "INSERT INTO entities (type, name, aliases, metadata, importance) VALUES (?, ?, ?, ?, ?)"
      )
      .bind(params.type, params.name, JSON.stringify(params.aliases || []), JSON.stringify(params.metadata || {}), params.importance || 1)
      .run();
    return { id: result.meta?.last_row_id, success: true, created: true };
  }
}

export { ACTION_WHITELIST };