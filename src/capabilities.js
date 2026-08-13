// src/capabilities.js — the single authoritative capability / intent registry.
//
// Everything that needs to know what Ava can do derives from this module:
//   * the Judge classifier's capability list and descriptions
//   * forced-route /slash command aliases and the manual-fallback command menu
//   * which capabilities run a workflow (and their default workflow capability)
//   * which step capabilities a workflow step or an AI call may request
//   * admin dropdowns for workflow creation and model-capability assignment
//
// There are two deliberately distinct vocabularies, each defined once:
//   1. BUILTIN_CAPABILITIES — route-level intents the decision system selects
//      (what the user wants). Judge returns one of these ids.
//   2. STEP_CAPABILITIES — provider-level capabilities (what a model can do).
//      Workflow steps and AI calls request these; provider selection matches them.
// A custom workflow is an instance of a builtin capability with its own steps, so
// it participates in the same decision model as every builtin workflow.

export const BUILTIN_CAPABILITIES = [
  {
    id: "normal_chat",
    kind: "builtin",
    handler: "chat",
    requiresWorkflow: false,
    allowCustomWorkflows: false,
    commandAliases: ["/chat", "/normal_chat"],
    commandDefaultText: "Hi",
    labels: { en: "Normal Chat", fa: "گفتگوی عادی" },
    help: { en: "normal chat", fa: "گفتگوی عادی" },
    judge: {
      description:
        "Ordinary conversation, a direct question Ava can answer, or continuing a topic. No scheduling, no future action, no daily plan request.",
    },
  },
  {
    id: "task_or_reminder",
    kind: "builtin",
    handler: "reminder_create",
    requiresWorkflow: false,
    allowCustomWorkflows: false,
    commandAliases: ["/remind", "/reminder", "/task"],
    commandDefaultText: "Remind me",
    labels: { en: "Reminder", fa: "یادآوری" },
    help: { en: "create a reminder", fa: "ساخت یادآوری" },
    judge: {
      description:
        "The user wants Ava to REMIND them, MESSAGE them, or notify them at a specific time/date, or set up a scheduled/recurring action. This includes anything where a future time is mentioned together with an action (remind, message, notify, wake up, call, tell someone X at time Y).",
      requiredFields: ["time", "date", "description", "title"],
    },
  },
  {
    id: "daily_plan",
    kind: "builtin",
    handler: "daily_plan",
    requiresWorkflow: false,
    allowCustomWorkflows: false,
    commandAliases: ["/daily_plan", "/plan"],
    commandDefaultText: "",
    labels: { en: "Daily Plan", fa: "برنامه روزانه" },
    help: { en: "today's plan", fa: "برنامه امروز" },
    judge: {
      description:
        "The user asks for today's daily plan, wants to start/build their plan for the day, or mentions their check-in / daily plan questionnaire. Examples: \"برنامه امروز\", \"برنامه امروزم چیه\", \"daily plan\", \"what's my plan today\", \"check-in\". This does NOT include asking to be reminded of a specific thing at a time (that is task_or_reminder).",
    },
  },
  {
    id: "entity_manage",
    kind: "builtin",
    handler: "entity_manage",
    requiresWorkflow: false,
    allowCustomWorkflows: false,
    commandAliases: [],
    labels: { en: "Manage Items", fa: "مدیریت آیتم‌ها" },
    help: { en: "edit/delete/query an existing item", fa: "ویرایش/حذف/جستجوی آیتم موجود" },
    judge: {
      description:
        "The user wants to EDIT, DELETE, or QUERY an EXISTING item: an existing reminder, memory, project, task, or event. This includes deictic references like \"this\", \"that\", \"the previous one\", and references by time/title (e.g. \"the reminder at 8\"). Examples: \"این reminder رو حذف کن\", \"یادآوری ساعت ۸ رو پاک کن\", \"delete this reminder\", \"change that task\", \"show my reminders\". This does NOT include creating something new.",
    },
  },
  {
    id: "search",
    kind: "builtin",
    handler: "workflow",
    workflowCapability: "search",
    requiresWorkflow: true,
    allowCustomWorkflows: true,
    commandAliases: ["/web_search", "/search", "/websearch"],
    commandDefaultText: "Search the web",
    labels: { en: "Web Search", fa: "جستجوی وب" },
    help: { en: "search the web", fa: "جستجو در وب" },
    judge: {
      description: "Asks to search the web for current/live information.",
    },
  },
  {
    id: "smart_ai",
    kind: "builtin",
    handler: "workflow",
    workflowCapability: "smart_ai",
    requiresWorkflow: true,
    allowCustomWorkflows: true,
    commandAliases: ["/smart_ai", "/ai", "/deep"],
    commandDefaultText: "Help me think this through",
    labels: { en: "Smart AI", fa: "هوش مصنوعی پیشرفته" },
    help: { en: "deep reasoning", fa: "تحلیل عمیق" },
    judge: {
      description: "Needs deep reasoning: coding, math, multi-step analysis.",
    },
  },
  {
    id: "image_generation",
    kind: "builtin",
    handler: "workflow",
    workflowCapability: "image_generation",
    requiresWorkflow: true,
    allowCustomWorkflows: true,
    commandAliases: ["/image_generation", "/image", "/img"],
    commandDefaultText: "A colorful scene",
    labels: { en: "Image Generation", fa: "ساخت تصویر" },
    help: { en: "generate an image", fa: "ساخت تصویر" },
    judge: {
      description: "Asks to generate/create/draw an image.",
    },
  },
  {
    id: "tts",
    kind: "builtin",
    handler: "workflow",
    workflowCapability: "tts",
    requiresWorkflow: true,
    allowCustomWorkflows: true,
    commandAliases: ["/tts", "/voice", "/speak"],
    commandDefaultText: "Say hello",
    labels: { en: "Voice Reply", fa: "پاسخ صوتی" },
    help: { en: "voice reply", fa: "پاسخ صوتی" },
    judge: {
      description: "Asks for the reply as spoken audio/voice.",
    },
  },
  {
    id: "stt",
    kind: "builtin",
    handler: "workflow",
    workflowCapability: "stt",
    requiresWorkflow: true,
    allowCustomWorkflows: true,
    commandAliases: [],
    labels: { en: "Speech-to-Text", fa: "تبدیل گفتار به متن" },
    help: { en: "transcribe audio", fa: "تبدیل گفتار به متن" },
    judge: {
      description: "Asks Ava to transcribe audio.",
    },
  },
];

// Provider-level capabilities a model can be assigned (admin Models page, provider
// capabilities column, capability_priorities, workflow-step capability options).
export const STEP_CAPABILITIES = [
  { id: "chat", label: "Chat" },
  { id: "judge", label: "Judge" },
  { id: "smart_ai", label: "Smart AI" },
  { id: "image_gen", label: "Image Maker" },
  { id: "tts", label: "TTS" },
  { id: "stt", label: "STT" },
  { id: "web_search", label: "Web Search" },
  { id: "routing", label: "Routing" },
  { id: "memory_analysis", label: "Memory Analysis" },
  { id: "personality_optimization", label: "Personality Optimization" },
  { id: "extract", label: "Extraction" },
  { id: "news", label: "News" },
  { id: "summary", label: "Summarization" },
  { id: "followup", label: "Follow-up" },
];

// Step capabilities a workflow step may request (a strict subset of the provider
// vocabulary: the ones the workflow engine can dispatch).
export const WORKFLOW_STEP_CAPABILITIES = [
  { id: "chat", label: "Chat" },
  { id: "smart_ai", label: "Smart AI" },
  { id: "web_search", label: "Web Search" },
  { id: "image_gen", label: "Image Maker" },
  { id: "tts", label: "TTS" },
  { id: "stt", label: "STT" },
];

const CAPABILITY_MAP = Object.fromEntries(BUILTIN_CAPABILITIES.map((c) => [c.id, c]));
const STEP_CAP_MAP = Object.fromEntries(STEP_CAPABILITIES.map((c) => [c.id, c]));

export function getBuiltinCapability(id) {
  return CAPABILITY_MAP[id] || null;
}

export function getStepCapability(id) {
  return STEP_CAP_MAP[id] || null;
}

export function getStepCapabilityLabel(id) {
  const c = STEP_CAP_MAP[id];
  return c ? c.label : id;
}

// Builtin capabilities that run through a workflow and accept custom instances.
export function getWorkflowCapabilities() {
  return BUILTIN_CAPABILITIES.filter((c) => c.handler === "workflow" && c.allowCustomWorkflows);
}

// Capability list section for the Judge prompt (builtins + active custom workflows).
export function buildJudgeCapabilitySections(activeCustomWorkflows = []) {
  const lines = BUILTIN_CAPABILITIES.map((c, i) => {
    const desc = c.judge?.description || "";
    const req = c.judge?.requiredFields?.length
      ? ` For task_or_reminder, set required_fields to any of [${c.judge.requiredFields.join(", ")}] that are missing.`
      : "";
    return `${i + 1}. "${c.id}" — ${desc}${req}`;
  });
  const workflowsSection = activeCustomWorkflows.length
    ? `\nAVAILABLE CUSTOM WORKFLOWS (choose one by id in "workflow_id" if the user's request clearly matches one; otherwise leave "workflow_id" null and just pick a capability above):\n` +
      activeCustomWorkflows
        .map((w) => `- id=${w.id}, name="${w.name}", underlying capability="${w.capability}": ${w.description || "(no description provided)"}`)
        .join("\n") +
      `\nIf a custom workflow matches, set "capability_id" to its underlying capability and "workflow_id" to its id. If none of the custom workflows fit but the request still needs one of the capabilities above, set "workflow_id" to null.`
    : "";
  return { lines, workflowsSection };
}

// --- /slash command routing ---------------------------------------------------
// Map a forced-route command prefix to its capability (built from the registry so
// the command set can never drift from the capabilities).
export function matchForcedCommand(text) {
  const trimmed = String(text || "").trim();
  const firstSpace = trimmed.indexOf(" ");
  const command = (firstSpace === -1 ? trimmed : trimmed.slice(0, firstSpace)).toLowerCase();
  for (const cap of BUILTIN_CAPABILITIES) {
    if (cap.commandAliases.includes(command)) {
      const rawQuery = firstSpace === -1 ? "" : trimmed.slice(firstSpace + 1).trim();
      return { capabilityId: cap.id, rawQuery };
    }
  }
  return null;
}

// Command lines for /help and the manual-fallback menu. Plain text (no angle
// brackets) so it is safe under Telegram HTML parsing.
export function buildCommandHelp(activeCustomWorkflows = []) {
  const base = BUILTIN_CAPABILITIES.filter((c) => c.commandAliases.length > 0)
    .map((c) => `${c.commandAliases[0]} — ${c.help.en}`)
    .join("\n");
  const custom = (activeCustomWorkflows || [])
    .filter((w) => w.capability !== "normal_chat")
    .map((w) => `/wf:${w.name} — ${w.name} (${w.capability})`)
    .join("\n");
  return base + (custom ? `\n${custom}` : "");
}
