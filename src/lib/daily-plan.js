// Daily Plan system: the user's structured plan for a specific day, built from the
// user's REAL existing data (active Reminders, previous Daily Plans, questionnaire
// answers). The AI is the planner/optimizer — it must NOT invent the user's work.
// The plan is a planning layer over existing obligations; it never deletes or
// duplicates Reminders (Reminders remain the scheduling/notification source).
//
// Invariants:
//   - one user + one local date = one plan (UNIQUE(user_id, plan_date) + idempotent ensureTodayPlan)
//   - if actionable source data exists, plan_generated implies activities.length > 0
//   - if no actionable source data exists, status = no_plan_data (never an empty success)
//
// All time handling uses the configured timezone (settings.timezone).

import { log } from "./logger.js";
import { parseRepeatRule } from "./reminders.js";

const FIXED_QUESTIONS = [
  { question: "کیفیت خوابت رو نمره بده", answer_type: "score", options: ["1", "2", "3", "4", "5"], is_fixed: 1, source: "fixed" },
  { question: "دیشب چه ساعتی خوابیدی؟", answer_type: "time", options: "", is_fixed: 1, source: "fixed" },
  { question: "سطح انرژی الان چطوره؟", answer_type: "score", options: ["1", "2", "3", "4", "5"], is_fixed: 1, source: "fixed" },
  { question: "حالت امروز چطوره؟", answer_type: "select", options: ["عالی", "خوب", "معمولی", "بد"], is_fixed: 1, source: "fixed" },
  { question: "آماده‌ای امروز برنامه رو شروع کنی؟", answer_type: "yes_no", options: "", is_fixed: 1, source: "fixed" },
];

// Deterministic fallback AI questions used only if the AI question step fails or
// returns nothing usable. Structured, no free-text.
const FALLBACK_AI_QUESTIONS = [
  { question: "امروز برنامه مشخصی برای انجام دادن داری؟", answer_type: "yes_no", options: [] },
  { question: "چقدر امروز مشغول خواهی بود؟", answer_type: "select", options: ["کم", "متوسط", "زیاد"] },
];

// Structured answer types the AI may propose for personalized questions.
const ALLOWED_AI_QUESTION_TYPES = ["yes_no", "score", "select", "time"];

const DEFAULT_RETENTION_DAYS = 7;
const MIN_RETENTION_DAYS = 3;
const MAX_RETENTION_DAYS = 20;
const DEFAULT_MORNING_TIME = "07:00";
const DEFAULT_CHECKIN_TIME = "18:00";
const DEFAULT_NIGHT_DELAY_HOURS = 7;
const DEFAULT_REMINDER_INTERVAL_HOURS = 3;
const DEFAULT_AI_QUESTION_COUNT = 2;

const VALID_ACTIVITY_STATUSES = ["pending", "completed", "skipped"];
const VALID_PLAN_GENERATED_STATUSES = ["plan_generated", "no_plan_data"];

// Local date/time pieces in the configured timezone. date = "YYYY-MM-DD".
function localParts(tz, now = new Date()) {
  const dateStr = now.toLocaleString("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  const [y, m, d] = dateStr.split("-").map(Number);
  const timeStr = now.toLocaleString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false });
  const [hh, mm] = timeStr.split(":").map(Number);
  return { date: dateStr, year: y, month: m, day: d, hours: hh, minutes: mm };
}

// The instant (Date) at which the local wall-clock time "HH:MM" occurs TODAY in tz.
function todayAtLocal(tz, timeStr) {
  const p = localParts(tz);
  const [hh, mm] = timeStr.split(":").map(Number);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  let guess = new Date(Date.UTC(p.year, p.month - 1, p.day, hh, mm, 0, 0));
  for (let i = 0; i < 3; i++) {
    const gTime = guess.toLocaleString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false });
    const [gh, gmin] = gTime.split(":").map(Number);
    const diffMin = (hh * 60 + mm) - (gh * 60 + gmin);
    if (diffMin === 0) break;
    guess = new Date(guess.getTime() + diffMin * 60 * 1000);
  }
  return guess;
}

function pad2(n) { return String(n).padStart(2, "0"); }

// Convert an ISO UTC instant to a local "HH:MM" in tz ("" if unparseable).
function toLocalTime(iso, tz) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  try {
    return d.toLocaleString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false });
  } catch {
    return "";
  }
}

function normalizeTime(t) {
  if (typeof t !== "string") return "";
  const m = t.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return "";
  const h = Number(m[1]), min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return "";
  return `${pad2(h)}:${pad2(min)}`;
}

// Validate a questionnaire answer server-side against its question type.
// Returns { valid: boolean, value: string|null }.
function validateAnswer(question, rawValue) {
  const value = String(rawValue == null ? "" : rawValue).trim();
  if (value === "") return { valid: false, value: null };
  switch (question.answer_type) {
    case "yes_no":
      return value === "yes" || value === "no" ? { valid: true, value } : { valid: false, value: null };
    case "score": {
      const opts = (() => { try { return JSON.parse(question.options || "[]"); } catch { return []; } })();
      const min = 1;
      const max = opts.length > 0 ? opts.map(Number).filter((n) => Number.isFinite(n)).reduce((a, b) => Math.max(a, b), opts.length) : 5;
      const n = Number(value);
      if (!Number.isInteger(n) || n < min || n > max) return { valid: false, value: null };
      return { valid: true, value: String(n) };
    }
    case "time": {
      const norm = normalizeTime(value);
      return norm ? { valid: true, value: norm } : { valid: false, value: null };
    }
    case "select": {
      const opts = (() => { try { return JSON.parse(question.options || "[]"); } catch { return []; } })();
      return opts.includes(value) ? { valid: true, value } : { valid: false, value: null };
    }
    case "text": {
      if (value.length > 500) return { valid: false, value: null };
      return { valid: true, value };
    }
    default:
      return { valid: false, value: null };
  }
}

// Robust JSON-array extraction from an AI response.
function parseJsonArray(raw) {
  if (!raw) return [];
  let t = String(raw).trim();
  try {
    const p = JSON.parse(t);
    if (Array.isArray(p)) return p;
  } catch {}
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  try {
    const p = JSON.parse(t);
    if (Array.isArray(p)) return p;
  } catch {}
  const start = t.indexOf("[");
  const end = t.lastIndexOf("]");
  if (start !== -1 && end > start) {
    try {
      const p = JSON.parse(t.substring(start, end + 1));
      if (Array.isArray(p)) return p;
    } catch {}
  }
  return [];
}

function dedupeByText(items, seen) {
  const out = [];
  const norm = (s) => String(s || "").trim().replace(/\s+/g, " ").toLowerCase();
  for (const it of items) {
    const key = norm(it.question || it.title || "");
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

export class DailyPlanManager {
  constructor(config, env, logger, db) {
    this.config = config;
    this.env = env;
    this.logger = logger;
    this.db = db;
  }

  async getTimezone() {
    const row = await this.db.prepare("SELECT value FROM settings WHERE key = 'timezone'").first();
    return row?.value || "Asia/Tehran";
  }

  async getSetting(key, fallback) {
    try {
      const row = await this.db.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first();
      if (row && row.value !== null && row.value !== undefined && String(row.value).trim() !== "") {
        return row.value;
      }
    } catch (e) {}
    return fallback;
  }

  async isEnabled() {
    return (await this.getSetting("daily_plan_enabled", "false")) === "true";
  }

  async getRetentionDays() {
    const v = parseInt(await this.getSetting("daily_plan_retention_days", String(DEFAULT_RETENTION_DAYS)), 10);
    if (Number.isNaN(v)) return DEFAULT_RETENTION_DAYS;
    return Math.min(MAX_RETENTION_DAYS, Math.max(MIN_RETENTION_DAYS, v));
  }

  async getMorningTime() {
    return await this.getSetting("daily_plan_morning_time", DEFAULT_MORNING_TIME);
  }

  async getCheckinTime() {
    return await this.getSetting("daily_plan_checkin_time", DEFAULT_CHECKIN_TIME);
  }

  async getNightDelayHours() {
    const v = parseInt(await this.getSetting("daily_plan_night_delay_hours", String(DEFAULT_NIGHT_DELAY_HOURS)), 10);
    return Number.isNaN(v) || v < 0 ? DEFAULT_NIGHT_DELAY_HOURS : v;
  }

  async getReminderIntervalHours() {
    const v = parseInt(await this.getSetting("daily_plan_reminder_interval_hours", String(DEFAULT_REMINDER_INTERVAL_HOURS)), 10);
    return Number.isNaN(v) || v <= 0 ? DEFAULT_REMINDER_INTERVAL_HOURS : v;
  }

  async getAiQuestionCount() {
    const v = parseInt(await this.getSetting("daily_plan_ai_question_count", String(DEFAULT_AI_QUESTION_COUNT)), 10);
    return Number.isNaN(v) || v < 0 ? DEFAULT_AI_QUESTION_COUNT : Math.min(5, v);
  }

  // Public base URL for links. Auto-captured from a webhook request origin when
  // available; otherwise the admin-configured value is used.
  async getAppBaseUrl(origin) {
    const stored = await this.getSetting("daily_plan_app_url", "");
    if (origin && (!stored || stored.trim() === "")) {
      // Only persist a well-formed https origin as the permanent app URL; a
      // malformed or non-https value must not silently become the link base. On
      // rejection, behave as if origin were absent (return the stored value).
      let parsedOrigin = null;
      try {
        parsedOrigin = new URL(origin);
      } catch (e) {}
      if (!parsedOrigin || parsedOrigin.protocol !== "https:") {
        try {
          await log(this.db, "warn", "daily_plan_app_url_rejected", { origin });
        } catch (e) {}
        return stored;
      }
      try {
        await this.db.prepare("UPDATE settings SET value = ?, updated_at = datetime('now') WHERE key = 'daily_plan_app_url'").bind(origin).run();
      } catch (e) {}
      return origin;
    }
    return stored;
  }

  generateToken() {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }

  today(tz) {
    return localParts(tz).date;
  }

  // Find or create today's plan (idempotent per user/date — prevents duplicates).
  async ensureTodayPlan(userId) {
    const tz = await this.getTimezone();
    const dateStr = this.today(tz);
    let plan = await this.db.prepare("SELECT * FROM daily_plans WHERE user_id = ? AND plan_date = ?").bind(userId, dateStr).first();
    if (plan) return plan;
    const token = this.generateToken();
    const insert = await this.db.prepare(
      "INSERT INTO daily_plans (user_id, plan_date, status, access_token) VALUES (?, ?, 'questionnaire_pending', ?)"
    ).bind(userId, dateStr, token).run();
    const id = insert.meta?.last_row_id;
    for (const q of FIXED_QUESTIONS) {
      await this.db.prepare(
        "INSERT INTO daily_plan_questions (plan_id, question, answer_type, options, is_fixed, source) VALUES (?, ?, ?, ?, ?, ?)"
      ).bind(id, q.question, q.answer_type, JSON.stringify(q.options), q.is_fixed, q.source).run();
    }
    plan = await this.db.prepare("SELECT * FROM daily_plans WHERE id = ?").bind(id).first();
    return plan;
  }

  async getPlanByToken(token) {
    if (!token) return null;
    return await this.db.prepare("SELECT * FROM daily_plans WHERE access_token = ?").bind(token).first();
  }

  async getPlanById(id) {
    return await this.db.prepare("SELECT * FROM daily_plans WHERE id = ?").bind(id).first();
  }

  async getQuestions(planId) {
    const res = await this.db.prepare("SELECT * FROM daily_plan_questions WHERE plan_id = ? ORDER BY id ASC").bind(planId).all();
    return res.results || [];
  }

  async getActivities(planId) {
    const res = await this.db.prepare("SELECT * FROM daily_plan_activities WHERE plan_id = ? ORDER BY id ASC").bind(planId).all();
    return res.results || [];
  }

  // ---------------------------------------------------------------- Data collection
  // Gather the user's REAL existing data for the planner: active reminders, recent
  // Daily Plan history (all valid states), and questionnaire answers.
  async collectUserData(plan) {
    const tz = await this.getTimezone();
    const now = new Date();

    // 1) Active (non-cancelled) reminders. Recurring reminders are included and
    //    marked; overdue pending reminders are surfaced. Reminder stays the source.
    const reminders = (await this.db.prepare(
      "SELECT id, title, description, remind_at_utc, priority, repeat_rule, status FROM reminders WHERE status != 'cancelled' ORDER BY remind_at_utc ASC"
    ).all()).results || [];
    const reminderItems = [];
    for (const r of reminders) {
      const parsedRule = parseRepeatRule(r.repeat_rule);
      const scheduleType = parsedRule.schedule_type || "once";
      const recurring = scheduleType !== "once" && scheduleType !== "";
      const at = r.remind_at_utc ? new Date(r.remind_at_utc) : null;
      const overdue = at ? at.getTime() < now.getTime() : false;
      reminderItems.push({
        id: r.id,
        title: r.title || "",
        description: r.description || "",
        time: toLocalTime(r.remind_at_utc, tz),
        priority: r.priority || "medium",
        recurring,
        schedule_type: scheduleType,
        overdue,
        status: r.status || "pending",
      });
    }

    // 2) History across all valid states, excluding incomplete-questionnaire days
    //    (shared with the AI question generator so the two cannot drift).
    const history = await this.getRecentPlanHistory(plan.user_id, plan.plan_date, 7);

    // 3) This plan's current answers (may be partial).
    const currentAnswers = await this.getQuestions(plan.id);

    return { tz, now, reminders: reminderItems, history, currentAnswers };
  }

  // Is there any actionable source data from which a plan can be built?
  hasActionableData(data) {
    if (data.reminders.length > 0) return true;
    for (const h of data.history) {
      const pending = (h.activities || []).some((a) => a.status === "pending");
      if (pending) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- AI questions
  async ensureAiQuestions(plan, aiManager) {
    const existing = await this.getQuestions(plan.id);
    if (existing.some((q) => q.source === "ai")) return existing;
    const count = await this.getAiQuestionCount();
    let aiQuestions = [];
    if (count > 0) {
      aiQuestions = await this.generateAiQuestions(plan, existing, count, aiManager);
      // Deterministic fallback if the AI returned nothing usable.
      if (aiQuestions.length === 0) {
        await log(this.db, "warn", "daily_plan_ai_questions_empty_fallback", { planId: plan.id });
        aiQuestions = FALLBACK_AI_QUESTIONS.slice(0, count);
      }
      for (const q of aiQuestions) {
        await this.db.prepare(
          "INSERT INTO daily_plan_questions (plan_id, question, answer_type, options, is_fixed, source) VALUES (?, ?, ?, ?, 0, 'ai')"
        ).bind(plan.id, q.question, q.answer_type, JSON.stringify(q.options || [])).run();
      }
    }
    if (plan.status === "questionnaire_pending") {
      await this.db.prepare("UPDATE daily_plans SET status = 'questionnaire_open', updated_at = datetime('now') WHERE id = ?").bind(plan.id).run();
    }
    return await this.getQuestions(plan.id);
  }

  async generateAiQuestions(plan, existingQuestions, count, aiManager) {
    const history = await this.getRecentPlanHistory(plan.user_id, plan.plan_date, 5);
    const previousAnswers = history.map((h) => {
      const answers = (h.answers || []).map((q) => `${q.question} → ${q.answer || "-"}`).join(" | ");
      return `Day ${h.plan_date} (${h.status}): ${answers}`;
    }).join("\n");

    const prompt = `You are generating ${count} short, personalized questions for the user's daily check-in questionnaire (Persian speaker).
Questions must be simple, structured, and answerable with a single choice. Use ONLY these answer types: yes_no, score, select, time. Never use free-text.
Base them on the user's recent check-in history where useful (e.g. an unfinished activity, a pattern). Do NOT invent facts.

Recent history:
${previousAnswers || "(none)"}

Return ONLY a valid JSON array, no extra text:
[{"question":"...","answer_type":"yes_no","options":[]}]
answer_type must be one of: yes_no, score, select, time. options is an array of strings (empty for yes_no/time).`;
    let parsed = [];
    try {
      const result = await aiManager.chat([{ role: "user", content: prompt }], {
        capabilities: ["chat"],
        systemPrompt: "You only output the JSON array described in the user message. No explanations.",
      });
      parsed = parseJsonArray(result.content);
    } catch (e) {
      await log(this.db, "warn", "daily_plan_ai_questions_error", { error: e.message, planId: plan.id });
      return [];
    }

    const seen = new Set((existingQuestions || []).map((q) => String(q.question || "").trim().replace(/\s+/g, " ").toLowerCase()));
    const valid = [];
    for (const q of parsed) {
      const question = String(q.question || "").trim();
      const type = ALLOWED_AI_QUESTION_TYPES.includes(q.answer_type) ? q.answer_type : null;
      if (!question || !type) continue;
      valid.push({
        question,
        answer_type: type,
        options: Array.isArray(q.options) ? q.options.filter((o) => typeof o === "string" && o.trim() !== "") : [],
      });
    }
    const deduped = dedupeByText(valid, seen).slice(0, count);
    if (deduped.length === 0) {
      await log(this.db, "warn", "daily_plan_ai_questions_invalid_or_empty", { planId: plan.id });
    }
    return deduped;
  }

  // ---------------------------------------------------------------- Plan generation
  async generatePlan(plan, questions, aiManager) {
    const data = await this.collectUserData(plan);
    const tz = data.tz;

    if (!this.hasActionableData(data)) {
      // Explicit no-data state — never a "successful" empty plan.
      await this.db.prepare("UPDATE daily_plans SET status = 'no_plan_data', updated_at = datetime('now') WHERE id = ?").bind(plan.id).run();
      await log(this.db, "info", "daily_plan_no_actionable_data", { planId: plan.id, date: plan.plan_date });
      return { generated: false, reason: "no_data", activities: [] };
    }

    // Build the prompt from real data only.
    const answersText = (questions || []).map((q) => `${q.question} → ${q.answer || "-"}`).join("\n");
    const remindersText = data.reminders.map((r) => {
      const t = r.time ? ` at ${r.time}` : "";
      const rec = r.recurring ? ` [recurring:${r.schedule_type}]` : "";
      const ov = r.overdue ? " [overdue]" : "";
      return `- ${r.title}${t} (${r.priority})${rec}${ov}${r.description ? " — " + r.description : ""}`;
    }).join("\n");
    const historyText = data.history.map((h) => {
      const acts = (h.activities || []).map((a) => `${a.title} (${a.status})${a.scheduled_time ? " @ " + a.scheduled_time : ""}`).join(", ") || "(no activities)";
      return `Day ${h.plan_date} [${h.status}]: ${acts}`;
    }).join("\n");
    const unfinishedHistory = [];
    for (const h of data.history) {
      for (const a of (h.activities || [])) {
        if (a.status === "pending") unfinishedHistory.push(a.title);
      }
    }

    const prompt = `You are the user's daily planner. Build today's Daily Plan ONLY from the real data below. Do NOT invent obligations, meetings, or tasks that are not present in this data. Optimize ordering, prioritization, and scheduling of the real items (respect reminder times, consider reported energy/mood).

Today's check-in answers:
${answersText || "(none)"}

Active reminders (these are scheduled; include them in the plan, do not create duplicates — reference them):
${remindersText || "(none)"}

Recent daily plans:
${historyText || "(none)"}

Previously unfinished activities:
${unfinishedHistory.length ? unfinishedHistory.join("\n") : "(none)"}

Return ONLY a valid JSON array, no extra text, no markdown:
[{"title":"Activity title","description":"short description or ''","time":"HH:MM or ''","priority":"medium","source":"reminder or history or ai"}]
- title: short, concrete, from the real data.
- source must be exactly one of: reminder (carried from an active reminder), history (carried from a previously unfinished activity), ai (a scheduling/prioritization suggestion derived from the data, e.g. spacing or grouping — never an invented obligation).
- At most one entry per real reminder. Do not duplicate the same obligation.
- Include at least one activity whenever the source data has any.`;
    let activities = [];
    let aiFailed = false;
    try {
      const result = await aiManager.chat([{ role: "user", content: prompt }], {
        capabilities: ["chat"],
        systemPrompt: "You only output the JSON array described in the user message. No explanations.",
      });
      activities = this.parseActivities(result.content, data);
      if (activities.length === 0) {
        await log(this.db, "warn", "daily_plan_ai_output_empty", { planId: plan.id });
        aiFailed = true;
      }
    } catch (e) {
      await log(this.db, "warn", "daily_plan_ai_error", { error: e.message, planId: plan.id });
      aiFailed = true;
    }

    // If the AI produced nothing usable, retry once through provider fallback is
    // already handled by AIProviderManager; then fall back to a deterministic plan.
    if (aiFailed || activities.length === 0) {
      activities = await this.deterministicPlan(data);
    }

    if (activities.length === 0) {
      // Genuinely nothing to schedule even from source data.
      await this.db.prepare("UPDATE daily_plans SET status = 'no_plan_data', updated_at = datetime('now') WHERE id = ?").bind(plan.id).run();
      await log(this.db, "info", "daily_plan_no_plan_after_fallback", { planId: plan.id });
      return { generated: false, reason: "no_data", activities: [] };
    }

    for (const a of activities) {
      await this.db.prepare(
        "INSERT INTO daily_plan_activities (plan_id, title, description, status, source, scheduled_time, priority, reminder_id) VALUES (?, ?, ?, 'pending', ?, ?, ?, ?)"
      ).bind(plan.id, a.title, a.description || "", a.source || "ai", a.time || "", a.priority || "medium", a.reminderId || null).run();
    }
    // Plan became active now — initialize the reminder timer so the FIRST unfinished
    // reminder respects the configured interval (never immediately after creation).
    await this.db.prepare(
      "UPDATE daily_plans SET status = 'plan_generated', last_reminder_at = datetime('now'), updated_at = datetime('now') WHERE id = ?"
    ).bind(plan.id).run();
    await log(this.db, "info", "daily_plan_generated", { planId: plan.id, activities: activities.length, via: aiFailed ? "deterministic" : "ai" });
    return { generated: true, reason: aiFailed ? "deterministic" : "ai", activities };
  }

  // Validate/normalize AI activity output. Requires >=1 valid item.
  parseActivities(raw, data) {
    const parsed = parseJsonArray(raw) || [];
    const out = [];
    const seenReminders = new Set();
    for (const item of parsed) {
      const title = String(item.title || "").trim();
      if (!title) continue;
      const source = ["reminder", "history", "ai"].includes(item.source) ? item.source : "ai";
      const time = normalizeTime(item.time || "");
      const priority = ["low", "medium", "high"].includes(item.priority) ? item.priority : "medium";
      const reminderId = Number.isInteger(item.reminder_id) ? item.reminder_id : null;
      if (source === "reminder") {
        // Ensure at most one entry per real reminder and never a fabricated one.
        const match = data.reminders.find((r) => r.id === reminderId || (reminderId == null && r.title === title));
        if (match && !seenReminders.has(match.id)) {
          seenReminders.add(match.id);
          out.push({
            title: match.title,
            description: match.description || item.description || "",
            time: match.time || time,
            priority: match.priority || priority,
            source: "reminder",
            reminderId: match.id,
          });
        }
        continue;
      }
      out.push({ title, description: String(item.description || "").trim(), time, priority, source, reminderId: null });
    }
    return out;
  }

  // Deterministic fallback plan built purely from real source data.
  async deterministicPlan(data) {
    const out = [];
    const seenReminders = new Set();
    for (const r of data.reminders) {
      if (seenReminders.has(r.id)) continue;
      seenReminders.add(r.id);
      out.push({
        title: r.title,
        description: r.description || "",
        time: r.time,
        priority: r.priority,
        source: "reminder",
        reminderId: r.id,
      });
    }
    for (const h of data.history) {
      for (const a of (h.activities || [])) {
        if (a.status === "pending") {
          out.push({ title: a.title, description: a.description || "", time: a.scheduled_time || "", priority: a.priority || "medium", source: "history", reminderId: null });
        }
      }
    }
    return out;
  }

  async setActivityStatus(planId, activityId, status) {
    if (!VALID_ACTIVITY_STATUSES.includes(status)) return { success: false, error: "Invalid status" };
    const act = await this.db.prepare("SELECT id FROM daily_plan_activities WHERE id = ? AND plan_id = ?").bind(activityId, planId).first();
    if (!act) return { success: false, error: "Activity not found" };
    await this.db.prepare("UPDATE daily_plan_activities SET status = ?, updated_at = datetime('now') WHERE id = ? AND plan_id = ?")
      .bind(status, activityId, planId).run();
    return { success: true };
  }

  // History across all valid states; each entry carries its state and raw data so the
  // AI can learn from completed/skipped/unfinished without treating failures as success.
  async getRecentPlanHistory(userId, excludeDate, limit = 5) {
    const res = await this.db.prepare(
      "SELECT * FROM daily_plans WHERE user_id = ? AND plan_date != ? AND status != 'questionnaire_pending' AND status != 'questionnaire_open' ORDER BY plan_date DESC LIMIT ?"
    ).bind(userId, excludeDate, limit).all();
    const plans = res.results || [];
    const out = [];
    for (const p of plans) {
      const qs = await this.getQuestions(p.id);
      const acts = await this.getActivities(p.id);
      out.push({ plan_date: p.plan_date, status: p.status, answers: qs, activities: acts });
    }
    return out;
  }

  // Morning trigger target: configured morning time, OR last-night message + delay.
  async getMorningTargetInstant(userId) {
    const tz = await this.getTimezone();
    const morning = await this.getMorningInstant();
    const delayH = await this.getNightDelayHours();
    const lastRow = await this.db.prepare("SELECT value FROM settings WHERE key = 'last_interaction_at'").first();
    const lastIso = lastRow?.value;
    if (!lastIso) return morning;
    const last = new Date(lastIso);
    if (isNaN(last.getTime())) return morning;
    const lastLocal = last.toLocaleString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false });
    const [lh] = lastLocal.split(":").map(Number);
    const isNight = lh >= 21 || lh < 6;
    if (!isNight) return morning;
    const candidate = new Date(last.getTime() + delayH * 60 * 60 * 1000);
    // Never send before the configured morning time ("do not send too early").
    return candidate.getTime() > morning.getTime() ? candidate : morning;
  }

  async getMorningInstant() {
    const tz = await this.getTimezone();
    const row = await this.db.prepare("SELECT value FROM settings WHERE key = 'daily_plan_morning_time'").first();
    const timeStr = row?.value || DEFAULT_MORNING_TIME;
    return todayAtLocal(tz, timeStr);
  }

  async getLastMessageInstant() {
    const row = await this.db.prepare("SELECT value FROM settings WHERE key = 'last_interaction_at'").first();
    const iso = row?.value;
    if (!iso) return null;
    const d = new Date(iso);
    return isNaN(d.getTime()) ? null : d;
  }

  // Retention cleanup: delete plans older than the configured retention window.
  async cleanupOldPlans() {
    const retention = await this.getRetentionDays();
    const tz = await this.getTimezone();
    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - retention);
    const cutoffDate = localParts(tz, cutoff).date;
    const res = await this.db.prepare("DELETE FROM daily_plans WHERE plan_date < ?").bind(cutoffDate).run();
    return res.meta?.changes || 0;
  }

  async listPlans(limit = 30) {
    const res = await this.db.prepare("SELECT * FROM daily_plans ORDER BY plan_date DESC, id DESC LIMIT ?").bind(limit).all();
    return res.results || [];
  }
}

export {
  FIXED_QUESTIONS,
  FALLBACK_AI_QUESTIONS,
  ALLOWED_AI_QUESTION_TYPES,
  DEFAULT_RETENTION_DAYS,
  MIN_RETENTION_DAYS,
  MAX_RETENTION_DAYS,
  DEFAULT_MORNING_TIME,
  DEFAULT_CHECKIN_TIME,
  DEFAULT_NIGHT_DELAY_HOURS,
  DEFAULT_REMINDER_INTERVAL_HOURS,
  DEFAULT_AI_QUESTION_COUNT,
  localParts,
  validateAnswer,
  normalizeTime,
  parseJsonArray,
};
