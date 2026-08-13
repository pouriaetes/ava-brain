// src/lib/decide.js — the single decision system.
//
// Every incoming message goes through exactly one decision path that resolves to a
// concrete capability (from the registry) and, when applicable, a specific
// workflow identity. Commands, explicit session state, custom-workflow keywords and
// the Judge classifier all feed the same decision model — there is no separate
// "custom workflow brain" and no parallel routing universe. Entity-management
// action extraction also lives here (one decision entry point).
//
// Decision shape:
//   { capabilityId, capability, workflowId, workflow, source, judgeResult,
//     action, query, needsClarification, language, messageText, deleteMessageIds }

import { chatJson } from "./json-ai.js";
import { classifyMessage, hasExplicitReminderCommand } from "./judge.js";
import {
  getBuiltinCapability,
  matchForcedCommand,
} from "../capabilities.js";
import { findWorkflowByCommand, matchWorkflowByKeywords } from "./workflow-engine.js";
import { getManualFallback, clearManualFallback, getPendingIntent, parseState } from "./state.js";
import { ACTION_WHITELIST } from "./validator.js";
import { log } from "./logger.js";
import { sanitizeError } from "./repos.js";

// Deterministic safety net for edit/delete/query of existing items. Mirrors the
// legacy telegram.js guard; keeps the tight bounds so normal chat and create
// requests are never hijacked.
const ENTITY_MANAGEMENT_ENTITY = /(reminder|reminders|memory|project|task|event|یادآوری|پروژه|تسک)/i;
const ENTITY_MANAGEMENT_VERB = /(delete|remove|cancel|edit|update|change|rename|reschedule|forget|حذف|پاک|ویرایش|اصلاح|تغییر|عوض|ببر)/i;
const ENTITY_QUERY_PATTERN = /(یادآوری|reminder|پروژه|project|memory|event|تسک|task)[^.!?\n]{0,30}?(بگو|ببینم|نشون\s*بده|لیست|show|list)/i;

export function isEntityManagementRequest(text, hasReply) {
  const t = String(text || "");
  if (!t) return false;
  if (ENTITY_MANAGEMENT_ENTITY.test(t) && ENTITY_MANAGEMENT_VERB.test(t)) return true;
  if (ENTITY_QUERY_PATTERN.test(t)) return true;
  if (hasReply && /(این|آن|اون|اینو|اونو|this|that)/i.test(t) && ENTITY_MANAGEMENT_VERB.test(t)) return true;
  return false;
}

// Custom-workflow command: /wf:name, /wf name, /workflow name.
function matchWorkflowCommand(text) {
  const trimmed = String(text || "").trim();
  const m = trimmed.match(/^\/wf:?\s*(.*)$/i) || trimmed.match(/^\/workflow:?\s*(.*)$/i);
  if (!m) return null;
  const rest = (m[1] || "").trim();
  const sp = rest.indexOf(" ");
  const token = (sp === -1 ? rest : rest.slice(0, sp)).trim();
  const rawQuery = sp === -1 ? "" : rest.slice(sp + 1).trim();
  if (!token) return null;
  return { token, rawQuery };
}

// A follow-up that plausibly completes a pending reminder (fills the missing time).
function wouldCompletePendingTime(text) {
  const t = String(text || "").trim();
  if (!t || t.startsWith("/")) return false;
  return /(ساعت|صبح|بعد\s*از\s*ظهر|عصر|شب|ظهر|امروز|فردا|پس\s*فردا|هر\s*روز|هر\s*هفته|هر\s*شب|هر\s*ماه|یادآوری|یادم\s*بنداز|یادت\s*باشه|\d{1,2}:\d{2}|[۰-۹]{1,2}[:：][۰-۹]{2})/i.test(t);
}

// --- entity action extraction ------------------------------------------------

const ENTITY_SCHEMA = {
  type: "object",
  required: ["mode"],
  properties: {
    mode: { type: "string" },            // action | query | none
    action_type: { type: "string" },     // validator action name for mode=action
    entity: { type: "string" },          // reminder | memory | project | event | task
    target_reference: { type: "string" },
    params: { type: "object" },
  },
};

// The action vocabulary is derived from the validator's ACTION_WHITELIST so the
// prompt, validation, and execution share one source.
const MANAGED_ACTION_TYPES = Object.keys(ACTION_WHITELIST)
  .filter((a) => /^(update_|delete_|complete_)/.test(a))
  .sort();

function buildEntitySystemPrompt() {
  return `You are the item-management module of "Ava". Your ONLY job is to translate an edit/delete/query request about an EXISTING item (reminder, memory, project, event, task) into one concrete operation. Never create anything.

Available operations (mode=action): ${MANAGED_ACTION_TYPES.join(", ")}
For listing/showing existing items use mode=query with entity one of: reminder, memory, project, event.

RULES:
- The user wants to EDIT, DELETE, or QUERY an EXISTING item. Never create a new one.
- target_reference: describe the item in the user's own words (e.g. "ساعت ۸", "گیتار", "پروژه کتاب", "فردا"). NEVER invent a database id.
- If the user replied to a message, "this/that/این/اون" in the current message refers to that replied message → set target_reference = "the replied message".
- For updates, put the changed fields in params (e.g. for update_reminder: {"new_local_time":"10:00"}, for update_memory: {"fact_value":"..."}).
- If you cannot tell what the user wants changed/deleted/listed, mode=none.
- Output EXACTLY one valid JSON object and nothing else:
  {"mode":"action","action_type":"delete_reminder","entity":"reminder","target_reference":"ساعت ۸","params":{}}
  {"mode":"query","entity":"reminder","target_reference":"","params":{}}
  {"mode":"none","target_reference":"","params":{}}`;
}

async function extractEntityAction(aiManager, message, replyLine, systemPrompt) {
  const userPrompt = `Current user message: "${message.text || ""}"
${replyLine}Decide the item-management operation and return ONLY the JSON object described in your instructions.`;
  const callOpts = { schema: ENTITY_SCHEMA, systemPrompt, temperature: 0.1 };
  try {
    return await chatJson(aiManager, [{ role: "user", content: userPrompt }], { ...callOpts, capabilities: ["routing"] });
  } catch (e) {
    // No provider has the routing capability assigned — fall back to chat.
    return await chatJson(aiManager, [{ role: "user", content: userPrompt }], { ...callOpts, capabilities: ["chat"] });
  }
}

// --- decision -----------------------------------------------------------------

export async function decideMessage({ message, session, settings = {}, config, env, aiManager, activeCustomWorkflows = [] }) {
  const db = env.DB;
  const text = String(message.text || "");
  const language = /[؀-ۿ]/.test(text) ? "fa" : "en";
  const sessionId = session?.id || null;
  const replyLine = message.reply_to_text
    ? `User replied to this message: "${message.reply_to_text}" (references to "this/that/این/اون" in the current message mean this replied message)\n`
    : "";
  const make = (d) => ({
    capabilityId: null,
    workflowId: null,
    workflow: null,
    source: "off",
    judgeResult: null,
    action: null,
    query: null,
    needsClarification: false,
    messageText: text,
    deleteMessageIds: [],
    ...d,
    capability: d.capabilityId ? getBuiltinCapability(d.capabilityId) : null,
  });

  // --- 1. Commands (forced-route + custom workflow) ---
  if (text.startsWith("/")) {
    const forced = matchForcedCommand(text);
    if (forced) {
      const cap = getBuiltinCapability(forced.capabilityId);
      const manual = sessionId ? await getManualFallback(db, sessionId) : null;
      const deleteMessageIds = [];
      let messageText = forced.rawQuery;
      if (!messageText && manual && manual.originalText) {
        messageText = manual.originalText;
        deleteMessageIds.push(message.message_id, manual.messageId);
        await clearManualFallback(db, sessionId);
      } else if (manual) {
        await clearManualFallback(db, sessionId);
      }
      if (!messageText) messageText = cap?.commandDefaultText || "";
      return make({ capabilityId: forced.capabilityId, source: "command", messageText, deleteMessageIds: deleteMessageIds.filter(Boolean) });
    }
    const wfCmd = matchWorkflowCommand(text);
    if (wfCmd) {
      const wf = await findWorkflowByCommand(db, wfCmd.token);
      if (wf) {
        const manual = sessionId ? await getManualFallback(db, sessionId) : null;
        const deleteMessageIds = [];
        let messageText = wfCmd.rawQuery;
        if (!messageText && manual && manual.originalText) {
          messageText = manual.originalText;
          deleteMessageIds.push(message.message_id, manual.messageId);
          await clearManualFallback(db, sessionId);
        } else if (manual) {
          await clearManualFallback(db, sessionId);
        }
        if (!messageText) messageText = wf.name || "";
        return make({ capabilityId: wf.capability, workflowId: wf.id, workflow: wf, source: "command", messageText, deleteMessageIds: deleteMessageIds.filter(Boolean) });
      }
    }
  }

  // --- 2. Explicit pending session state (multi-step continuation) ---
  if (sessionId && text && !text.startsWith("/")) {
    const pending = await getPendingIntent(db, sessionId);
    if (pending && pending.intent === "task_or_reminder" && text.length < 100 && wouldCompletePendingTime(text)) {
      return make({ capabilityId: "task_or_reminder", source: "session_state", pending });
    }
  }

  // --- 3. Custom workflow keyword pre-match (before Judge) ---
  if (text && !text.startsWith("/")) {
    const matched = await matchWorkflowByKeywords(db, text);
    if (matched) {
      return make({ capabilityId: matched.capability, workflowId: matched.id, workflow: matched, source: "keyword" });
    }
  }

  // --- 4. Judge (or deterministic default when Judge is disabled) ---
  const state = parseState(session);
  const globalJudgeEnabled = settings["judge_routing_enabled"] === "true";
  const chatJudgeDisabled = state.judge_disabled === true;
  const judgeEnabled = globalJudgeEnabled && !chatJudgeDisabled;

  if (!judgeEnabled) {
    // Explicit reminder commands still work without the classifier.
    if (hasExplicitReminderCommand(text)) {
      return make({ capabilityId: "task_or_reminder", source: "off" });
    }
    return make({ capabilityId: "normal_chat", source: "off" });
  }

  const judgeProviderId = settings["judge_provider_id"] ? parseInt(settings["judge_provider_id"], 10) : null;
  let judgeResult;
  try {
    judgeResult = await classifyMessage(message, session?.summary || "", config, env, aiManager, judgeProviderId, activeCustomWorkflows);
  } catch (e) {
    await log(env.DB, "warn", "decide_judge_failed", { error: sanitizeError(e.message) });
    judgeResult = null;
  }

  let capabilityId = judgeResult?.capability_id || "normal_chat";
  let workflowId = judgeResult?.workflow_id || null;
  let workflow = workflowId ? activeCustomWorkflows.find((w) => w.id === workflowId) || null : null;

  // Daily Plan gating: feature disabled → fall back to normal chat.
  if (capabilityId === "daily_plan" && settings["daily_plan_enabled"] !== "true") {
    capabilityId = "normal_chat";
    workflowId = null;
    workflow = null;
  }

  // Entity management: Judge pick OR the deterministic guard routes here. The
  // concrete operation is extracted by the decision system itself.
  const entityManagement = capabilityId === "entity_manage" || isEntityManagementRequest(text, !!message.reply_to_text);
  let action = null;
  let query = null;
  let needsClarification = false;
  if (entityManagement) {
    capabilityId = "entity_manage";
    workflowId = null;
    workflow = null;
    try {
      const extraction = await extractEntityAction(aiManager, message, replyLine, buildEntitySystemPrompt());
      const parsed = extraction.parsed || {};
      if (parsed.mode === "action" && ACTION_WHITELIST[parsed.action_type]) {
        action = {
          type: parsed.action_type,
          params: {
            ...(parsed.params && typeof parsed.params === "object" ? parsed.params : {}),
            target_reference: parsed.target_reference || undefined,
          },
        };
      } else if (parsed.mode === "query") {
        const entity = ["reminder", "memory", "project", "event"].includes(parsed.entity) ? parsed.entity : "reminder";
        query = { entity };
      } else {
        needsClarification = true;
      }
    } catch (e) {
      await log(env.DB, "warn", "decide_entity_extraction_failed", { error: sanitizeError(e.message) });
      needsClarification = true;
    }
  }

  return make({
    capabilityId,
    workflowId,
    workflow,
    source: "judge",
    judgeResult,
    action,
    query,
    needsClarification,
  });
}
