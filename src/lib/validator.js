// Action validator: whitelist of allowed action types and parameter schemas
// No direct SQL from AI output — all actions validated and executed by code
import { log } from "./logger.js";

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
    requiredParams: ["id"],
    optionalParams: ["name", "client", "status", "deadline_utc", "progress_percent", "next_action", "importance", "notes", "metadata"],
    handler: "ProjectManager.updateProject",
  },
  complete_project: {
    requiredParams: ["id"],
    optionalParams: ["final_note"],
    handler: "ProjectManager.completeProject",
  },
  create_routine: {
    requiredParams: ["name", "action_type", "schedule_type"],
    optionalParams: ["local_time", "interval_hours", "cron_expression", "payload"],
    handler: "RoutineManager.createRoutine",
  },
  update_routine: {
    requiredParams: ["id"],
    optionalParams: ["name", "action_type", "schedule_type", "local_time", "interval_hours", "cron_expression", "payload", "enabled"],
    handler: "RoutineManager.updateRoutine",
  },
  delete_short_term_memory: {
    requiredParams: ["id"],
    optionalParams: [],
    handler: "deleteShortTermMemory",
  },
  save_long_term_memory: {
    requiredParams: ["type", "title", "content"],
    optionalParams: ["tags", "importance", "source"],
    handler: "MemoryManager.saveLongTerm",
  },
};

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

  const { MemoryManager, ReminderManager, ProjectManager, RoutineManager } = managers;

  try {
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
      case "update_project":
        return await ProjectManager.updateProject(params.id, params);
      case "complete_project":
        return await ProjectManager.completeProject(params.id, params.final_note || "");
      case "create_routine":
        return await RoutineManager.createRoutine({
          name: params.name,
          actionType: params.action_type,
          scheduleType: params.schedule_type,
          localTime: params.local_time,
          intervalHours: params.interval_hours,
          cronExpression: params.cron_expression,
          payload: params.payload
        });
      case "update_routine":
        return await RoutineManager.updateRoutine(params.id, params);
      case "delete_short_term_memory":
        return await deleteShortTermMemory(config.DB, params);
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

async function deleteShortTermMemory(db, params) {
  if (params.id) {
    await db.prepare("DELETE FROM memory_short_term WHERE id = ?").bind(params.id).run();
  }
  return { success: true };
}

export { ACTION_WHITELIST };