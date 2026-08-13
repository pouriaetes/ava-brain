// src/lib/i18n.js — centralize user-facing fa/en strings so business logic never
// embeds `lang === "fa" ? "..." : "..."`. Technical/internal logs stay English.
// Usage: t(lang, "reminder_done") or t(lang, "ambiguous_matches", { lines }).

const MESSAGES = {
  // --- generic action outcomes (validator.js) ---
  ambiguous_matches: {
    fa: "چند مورد مشابه پیدا کردم:\n{lines}\nمنظورت کدومه؟",
    en: "I found a few matching items:\n{lines}\nWhich one do you mean?",
  },
  not_found_specific: {
    fa: "چنین موردی پیدا نکردم؛ لطفاً دقیق‌تر بگو.",
    en: "I couldn't find that. Please be more specific.",
  },
  specify_which: {
    fa: "لطفاً مشخص کن منظورت کدوم مورد است (مثلاً ساعت یا عنوان).",
    en: "Please tell me which one — e.g. by its time or title.",
  },
  project_what_change: {
    fa: "مشخص نکردی چه چیزی را تغییر بدهم.",
    en: "Tell me what to change about that project.",
  },
  project_updated: { fa: "پروژه به‌روزرسانی شد.", en: "Project updated." },
  project_completed: { fa: "پروژه کامل شد.", en: "Project marked complete." },
  project_deleted: { fa: "پروژه حذف شد.", en: "Project deleted." },
  deleted: { fa: "حذف شد.", en: "Deleted." },
  updated: { fa: "به‌روزرسانی شد.", en: "Updated." },
  what_change_generic: {
    fa: "مشخص نکردی چه چیزی را تغییر بدهم.",
    en: "Tell me what to change.",
  },
  time_not_understood: {
    fa: "زمان جدید را متوجه نشدم.",
    en: "I couldn't understand the new time.",
  },
  reminder_what_change: {
    fa: "مشخص نکردی چه چیزی را تغییر بدهم.",
    en: "Tell me what to change about that reminder.",
  },
  reminder_updated: { fa: "یادآوری به‌روزرسانی شد.", en: "Reminder updated." },
  reminder_deleted: { fa: "یادآوری حذف شد.", en: "Reminder deleted." },
  memory_what_correct: {
    fa: "مشخص نکردی چه چیزی را اصلاح کنم.",
    en: "Tell me what to correct about that memory.",
  },
  memory_updated: { fa: "حافظه به‌روزرسانی شد.", en: "Memory updated." },
  memory_deleted: { fa: "حافظه حذف شد.", en: "Memory deleted." },
  event_deleted: { fa: "رویداد حذف شد.", en: "Event deleted." },
  not_understood: { fa: "متوجه نشدم.", en: "I didn't catch that." },

  // --- reminder creation flow (telegram.js) ---
  reminder_ask_time: {
    fa: "باشه، فقط زمان دقیق را بگو؛ مثلاً «فردا ساعت ۸ صبح» یا «هر روز ساعت ۹».",
    en: "Sure, tell me the exact time; for example: tomorrow at 8 AM or every day at 9.",
  },
  reminder_could_not_register: {
    fa: "الان نتوانستم یادآوری را ثبت کنم؛ لطفاً دوباره بفرست.",
    en: "I could not register that reminder right now; please try again.",
  },
  reminder_time_past: {
    fa: "آن زمان گذشته است؛ یک زمان آینده بگو.",
    en: "That time is in the past; tell me a future time.",
  },
  reminder_not_saved: {
    fa: "ثبت یادآوری انجام نشد؛ دوباره تلاش کن.",
    en: "Reminder was not saved; please try again.",
  },
  reminder_done: {
    fa: "بله، ثبت کردم؛ به موقع یادت می‌اندازم.",
    en: "Done; I will remind you on time.",
  },
  reminder_create_failed: {
    fa: "ثبت یادآوری فعلاً مشکل داشت.",
    en: "Reminder creation failed.",
  },

  // --- entity queries (telegram.js) ---
  reminders_none: { fa: "یادآوری فعالی نداری.", en: "You have no reminders." },
  reminders_header: { fa: "📌 یادآوری‌ها:", en: "📌 Reminders:" },
  projects_none: { fa: "پروژه فعالی نداری.", en: "You have no active projects." },
  projects_header: { fa: "📁 پروژه‌ها:", en: "📁 Projects:" },
  events_none: { fa: "رویداد آینده‌ای نداری.", en: "You have no upcoming events." },
  events_header: { fa: "📅 رویدادها:", en: "📅 Events:" },
  facts_header: { fa: "🧠 حقایق:", en: "🧠 Facts:" },
  longterm_header: { fa: "📚 حافظه بلندمدت:", en: "📚 Long-term memory:" },
  nothing_stored: {
    fa: "چیز خاصی ذخیره نکرده‌ام.",
    en: "I haven't stored anything notable.",
  },
  entity_clarify: {
    fa: "مطمئن نیستم دقیقاً منظورتون را متوجه شدم؛ لطفاً دقیق‌تر بگو چی می‌خوای حذف/ویرایش کنی و کدوم رو، مثلاً با زمان یا عنوانش مشخص کن.",
    en: "I couldn't confidently identify what to change; please tell me more specifically what to delete or edit, and which one (e.g. by its time or title).",
  },

  // --- generic response failures ---
  ai_error_saved: {
    en: "AI model connection is currently having issues, I saved your message.",
  },
  workflow_generic_error: {
    en: "Something went wrong processing that request, please try again.",
  },
  image_gen_failed: {
    en: "Sorry, I couldn't generate that image right now.",
  },
  image_gen_error: {
    en: "Image generation is currently having issues, please try again later.",
  },
  search_none: { en: "I searched but couldn't find relevant results." },
  search_error: { en: "Web search is currently unavailable, please try again later." },
  url_no_link: { en: "I couldn't find a link in your message." },
  url_read_error: {
    en: "I couldn't read that link right now, please try again later.",
  },
  voice_not_understood: {
    en: "Sorry, I couldn't understand the voice message.",
  },
  voice_process_error: {
    en: "Sorry, I couldn't process that voice message right now.",
  },
};

export function t(lang, key, vars = {}) {
  const entry = MESSAGES[key];
  if (!entry) return key;
  const text = entry[lang === "fa" ? "fa" : "en"] ?? entry.en ?? entry.fa ?? key;
  if (!vars || Object.keys(vars).length === 0) return text;
  return text.replace(/\{(\w+)\}/g, (m, name) => (vars[name] !== undefined ? vars[name] : m));
}

// Quick inline fa/en selector for messages kept as small expressions.
export function pick(lang, fa, en) {
  return lang === "fa" ? fa : en;
}
