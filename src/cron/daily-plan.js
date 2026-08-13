// Daily Plan cron: morning questionnaire send (with night-delay rule), evening
// check-in nudge, unfinished-activity reminders, and retention cleanup.
// Runs inside the existing */5 cron. No AI is used here — links and reminders only.
import { sendTelegramMessage } from "../lib/telegram.js";
import { log } from "../lib/logger.js";
import { DailyPlanManager, localParts } from "../lib/daily-plan.js";
import { getOwnerName } from "../lib/repos.js";

function buildQuestionnaireLink(baseUrl, token) {
  return `${baseUrl.replace(/\/+$/, "")}/question/${token}`;
}

export async function handleDailyPlan(config, env, ctx) {
  const mgr = new DailyPlanManager(config, env, { info: log.info, error: log.error, warn: log.warn }, env.DB);
  try {
    if (!(await mgr.isEnabled())) return;
    const ownerId = String(config.OWNER_TELEGRAM_ID || "");
    if (!ownerId) return;

    const tz = await mgr.getTimezone();
    const now = new Date();
    const todayStr = localParts(tz, now).date;

    // Retention cleanup first.
    try {
      const deleted = await mgr.cleanupOldPlans();
      if (deleted > 0) await log(env.DB, "info", "daily_plan_retention_cleanup", { deleted });
    } catch (e) {
      await log(env.DB, "warn", "daily_plan_cleanup_failed", { error: e.message });
    }

    const baseUrl = await mgr.getAppBaseUrl("");
    if (!baseUrl) {
      // No app URL configured and none captured from a webhook yet — cannot send links.
      return;
    }

    let plan = await env.DB.prepare("SELECT * FROM daily_plans WHERE user_id = ? AND plan_date = ?").bind(ownerId, todayStr).first();

    // --- Morning questionnaire trigger ---
    const morningTarget = await mgr.getMorningTargetInstant(ownerId);
    const morningDue = now.getTime() >= morningTarget.getTime();
    if (morningDue && !plan) {
      plan = await mgr.ensureTodayPlan(ownerId);
    }
    if (morningDue && plan && plan.status === "questionnaire_pending" && !plan.questionnaire_sent_at) {
      const link = buildQuestionnaireLink(baseUrl, plan.access_token);
      const ownerName = await getOwnerName(env.DB);
      const greeting = ownerName ? `صبح بخیر ${ownerName} عزیز ❤️` : "صبح بخیر عزیز ❤️";
      const text = `${greeting}\nلطفا این لیستو برام پر کن تا برنامه امروزت رو بچینم:`;
      await sendTelegramMessage(config, ownerId, text, {
        reply_markup: { inline_keyboard: [[{ text: "📋 باز کردن پلن امروز", url: link }]] },
      });
      await env.DB.prepare("UPDATE daily_plans SET questionnaire_sent_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").bind(plan.id).run();
      await log(env.DB, "info", "daily_plan_questionnaire_sent", { planId: plan.id, date: todayStr });
    }

    // --- Evening check-in nudge (if questionnaire not completed) ---
    const checkinTime = await mgr.getCheckinTime();
    const checkinInstant = todayAtLocalSafe(tz, checkinTime);
    const checkinDue = checkinInstant ? now.getTime() >= checkinInstant.getTime() : false;
    // Recover a missing plan at check-in time (e.g. morning was skipped) so the
    // evening flow can run; ensureTodayPlan is idempotent so no duplicate is created.
    if (checkinDue && !plan) {
      plan = await mgr.ensureTodayPlan(ownerId);
    }
    if (checkinDue && plan && plan.status !== "plan_generated" && plan.status !== "no_plan_data" && plan.status !== "questionnaire_completed" && !plan.checkin_sent_at) {
      const link = buildQuestionnaireLink(baseUrl, plan.access_token);
      const ownerName = await getOwnerName(env.DB);
      const greeting = ownerName ? `چطوری ${ownerName} جونم ❤️` : "چطوری جونم ❤️";
      const text = `${greeting}\nلطفا این لیستو برام پر کن تا برنامتو بچینم:`;
      await sendTelegramMessage(config, ownerId, text, {
        reply_markup: { inline_keyboard: [[{ text: "📋 باز کردن پلن امروز", url: link }]] },
      });
      await env.DB.prepare("UPDATE daily_plans SET checkin_sent_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").bind(plan.id).run();
      await log(env.DB, "info", "daily_plan_checkin_sent", { planId: plan.id, date: todayStr });
    }

    // --- Unfinished-activity reminders ---
    if (plan && plan.status === "plan_generated") {
      const activities = await mgr.getActivities(plan.id);
      const pending = activities.filter((a) => a.status === "pending");
      if (pending.length > 0) {
        const intervalH = await mgr.getReminderIntervalHours();
        const lastAt = plan.last_reminder_at ? new Date(plan.last_reminder_at.replace(" ", "T") + "Z") : null;
        const due = !lastAt || (now.getTime() - lastAt.getTime()) >= intervalH * 60 * 60 * 1000;
        if (due) {
          const link = buildQuestionnaireLink(baseUrl, plan.access_token);
          const ownerName = await getOwnerName(env.DB);
          const greeting = ownerName ? `${ownerName} این کارارو نکردیااا 😄` : "این کارارو نکردیااا 😄";
          const list = pending.map((a, i) => `${i + 1}. ${a.title}`).join("\n");
          const text = `${greeting}\n\n${list}\n\nبرو انجامشون بده:`;
          await sendTelegramMessage(config, ownerId, text, {
            reply_markup: { inline_keyboard: [[{ text: "📋 باز کردن پلن امروز", url: link }]] },
          });
          await env.DB.prepare("UPDATE daily_plans SET last_reminder_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").bind(plan.id).run();
          await log(env.DB, "info", "daily_plan_unfinished_reminder", { planId: plan.id, pending: pending.length });
        }
      }
    }
  } catch (error) {
    await log(env.DB, "error", "daily_plan_cron", { error: error.message });
  }
}

function todayAtLocalSafe(tz, timeStr) {
  try {
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
  } catch {
    return null;
  }
}
