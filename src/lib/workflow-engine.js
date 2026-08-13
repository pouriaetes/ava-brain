// src/lib/workflow-engine.js — workflow execution over an explicit dependency
// graph (DAG). Steps reference their prerequisites via depends_on (a JSON array of
// step ids); execution order is derived by topological sort, not by manual numeric
// ordering. Steps whose prerequisites are satisfied run in parallel. Per-step
// fallback_step_id chains are preserved, and every step's outcome is recorded for
// the Decision Trace.
//
// Legacy group_id / step_order columns are no longer used to drive execution;
// depends_on is authoritative. step_order survives only as a stable display label
// and the {{step:N}} prompt variable.

import { AIProviderManager } from "./ai.js";
import { encrypt, decrypt } from "./crypto.js";
import { sanitizeError } from "./repos.js";
import { recordWorkflowRun } from "./trace.js";
import { WORKFLOW_STEP_CAPABILITIES } from "../capabilities.js";

const noopLogger = { info: async () => {}, error: async () => {}, warn: async () => {} };

export function parseDependsOn(step) {
  const raw = step?.depends_on ?? "[]";
  if (Array.isArray(raw)) return raw.map(Number).filter(Number.isInteger);
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.map(Number).filter(Number.isInteger) : [];
  } catch {
    return [];
  }
}

// --- graph validation --------------------------------------------------------

export function validateWorkflowGraph(steps) {
  const errors = [];
  if (!steps || steps.length === 0) {
    return { valid: false, errors: ["Workflow has no steps"] };
  }
  const ids = new Set(steps.map((s) => s.id));
  for (const s of steps) {
    for (const depId of parseDependsOn(s)) {
      if (!ids.has(depId)) {
        errors.push(`Step ${s.step_order} depends on step ${depId} which does not exist in this workflow`);
      }
    }
    if (s.fallback_step_id && !ids.has(s.fallback_step_id)) {
      errors.push(`Step ${s.step_order} falls back to step ${s.fallback_step_id} which does not exist in this workflow`);
    }
    if (s.capability && !WORKFLOW_STEP_CAPABILITIES.some((c) => c.id === s.capability)) {
      errors.push(`Step ${s.step_order} uses unknown capability "${s.capability}"`);
    }
  }
  const { cycle } = topoSort(steps);
  if (cycle) {
    errors.push("Workflow contains a dependency cycle");
  }
  return { valid: errors.length === 0, errors };
}

// Kahn's algorithm. Returns { layers, cycle } where layers is an array of arrays of
// steps (each layer may run in parallel), or cycle=true when the graph is cyclic.
function topoSort(steps) {
  const deps = new Map();
  const dependents = new Map();
  for (const s of steps) {
    deps.set(s.id, parseDependsOn(s));
    dependents.set(s.id, []);
  }
  for (const s of steps) {
    for (const d of deps.get(s.id)) {
      if (dependents.has(d)) dependents.get(d).push(s);
    }
  }
  const inDegree = new Map();
  for (const s of steps) inDegree.set(s.id, deps.get(s.id).length);

  const ready = steps.filter((s) => inDegree.get(s.id) === 0).sort((a, b) => a.step_order - b.step_order);
  const layers = [];
  let remaining = steps.length;
  while (ready.length > 0) {
    const layer = ready.splice(0);
    layers.push(layer);
    for (const s of layer) {
      remaining--;
      for (const t of dependents.get(s.id)) {
        inDegree.set(t.id, inDegree.get(t.id) - 1);
        if (inDegree.get(t.id) === 0) ready.push(t);
      }
    }
    ready.sort((a, b) => a.step_order - b.step_order);
  }
  return { layers, cycle: remaining > 0 };
}

// --- workflow lookup ---------------------------------------------------------

export async function findWorkflowById(db, id) {
  if (!id) return null;
  return await db.prepare("SELECT * FROM workflows WHERE id = ?").bind(id).first();
}

// Default workflow for a capability (falls back to keyword-matched custom one).
export async function findWorkflowForCapability(db, capability, topicText) {
  const text = String(topicText || "").toLowerCase();
  if (text) {
    const customWorkflows = (await db.prepare(
      "SELECT * FROM workflows WHERE capability = ? AND enabled = 1 AND is_default = 0 AND trigger_keywords != ''"
    ).bind(capability).all()).results || [];
    for (const wf of customWorkflows) {
      const keywords = (wf.trigger_keywords || "").split(",").map((k) => k.trim().toLowerCase()).filter((k) => k.length > 0);
      if (keywords.some((kw) => text.includes(kw))) return wf;
    }
  }
  const defaultWorkflow = await db.prepare(
    "SELECT * FROM workflows WHERE capability = ? AND enabled = 1 AND is_default = 1 ORDER BY id ASC LIMIT 1"
  ).bind(capability).first();
  return defaultWorkflow || null;
}

// Match a message against the trigger keywords of every ENABLED CUSTOM workflow
// across all capabilities (used by the decision system before Judge).
export async function matchWorkflowByKeywords(db, text) {
  if (!text) return null;
  const t = String(text).toLowerCase();
  const wfs = (await db.prepare(
    "SELECT * FROM workflows WHERE is_default = 0 AND enabled = 1 AND trigger_keywords != '' AND capability != 'normal_chat'"
  ).all()).results || [];
  for (const wf of wfs) {
    const keywords = (wf.trigger_keywords || "").split(",").map((k) => k.trim().toLowerCase()).filter((k) => k.length > 0);
    if (keywords.some((kw) => t.includes(kw))) return wf;
  }
  return null;
}

// Resolve a custom workflow from a /wf:<token> command. Numeric tokens match by id;
// anything else matches by name (exact, then partial).
export async function findWorkflowByCommand(db, token) {
  const t = String(token || "").trim();
  if (!t) return null;
  if (/^\d+$/.test(t)) {
    return await db.prepare("SELECT * FROM workflows WHERE id = ? AND is_default = 0").bind(parseInt(t, 10)).first() || null;
  }
  const lower = t.toLowerCase();
  const wfs = (await db.prepare("SELECT * FROM workflows WHERE is_default = 0 AND enabled = 1 AND capability != 'normal_chat'").all()).results || [];
  return wfs.find((w) => String(w.name || "").toLowerCase() === lower)
    || wfs.find((w) => String(w.name || "").toLowerCase().includes(lower))
    || null;
}

// --- step execution ----------------------------------------------------------

// Fill a step's prompt template. Variables:
//   {{user_message}}        original user message
//   {{previous_output}} / {{previous_step}}  the step's computed input
//   {{step:N}}              output of the step whose step_order is N
function buildStepPrompt(step, ctx) {
  const tpl = step.prompt_template || "";
  if (!tpl) return ctx.inputText || ctx.userText || "";
  let out = tpl;
  out = out.split("{{user_message}}").join(ctx.userText || "");
  out = out.split("{{previous_output}}").join(ctx.inputText || "");
  out = out.split("{{previous_step}}").join(ctx.inputText || "");
  out = out.replace(/\{\{step:(\d+)\}\}/g, (m, n) => {
    const v = ctx.outputsByOrder.get(Number(n));
    return v != null ? String(v) : "";
  });
  return out;
}

function computeStepInput(step, userText, outputsByStepId, outputsByOrder, allOutputsSoFar) {
  const depIds = parseDependsOn(step);
  if (depIds.length > 0) {
    const depOutputs = depIds.map((id) => outputsByStepId.get(id)).filter((v) => v != null && typeof v === "string");
    return depOutputs.length > 0 ? depOutputs.join("\n\n") : userText;
  }
  const prev = allOutputsSoFar.filter((o) => typeof o === "string");
  if (step.input_source === "all_previous_steps" && prev.length > 0) {
    return prev.join("\n\n");
  }
  if (step.input_source === "previous_step" && prev.length > 0) {
    return prev[prev.length - 1];
  }
  return userText;
}

async function callStepCapability(aiManager, step, ctx) {
  const cap = step.capability;
  const prompt = buildStepPrompt(step, ctx);
  const preferred = step.provider_id || null;
  if (cap === "web_search") {
    const result = await aiManager.webSearch(prompt || ctx.userText, { capabilities: ["web_search"], preferredProviderId: preferred });
    const results = result.results || [];
    return {
      output: results.map((r, i) => `[${i + 1}] ${r.title} - ${r.url}\n${r.content}`).join("\n\n"),
      provider: result.provider || null,
      model: result.model || null,
    };
  }
  if (cap === "image_gen") {
    const result = await aiManager.generateImage(prompt, { capabilities: ["image_gen"], preferredProviderId: preferred });
    return { output: { __type: "image", image_base64: result.image_base64 }, provider: result.provider || null, model: result.model || null };
  }
  if (cap === "tts") {
    const result = await aiManager.textToSpeech(prompt, { capabilities: ["tts"], preferredProviderId: preferred });
    return { output: { __type: "audio", audio_base64: result.audio_base64 }, provider: result.provider || null, model: result.model || null };
  }
  if (cap === "stt") {
    const result = await aiManager.transcribeAudio(ctx.audioBuffer, { capabilities: ["stt"], preferredProviderId: preferred });
    return { output: result.text || "", provider: result.provider || null, model: result.model || null };
  }
  // 'chat' and 'smart_ai' (and any other text capability) go through chat().
  const messages = [{ role: "user", content: prompt }];
  const result = await aiManager.chat(messages, {
    capabilities: [cap],
    systemPrompt: ctx.systemPrompt || undefined,
    preferredProviderId: preferred
  });
  return { output: result.content || "", provider: result.provider || null, model: result.model || null };
}

// --- main entry --------------------------------------------------------------

// options: { workflowId, topic, systemPrompt, audioBuffer }
export async function runWorkflow(capability, userText, options, config, env, aiManager = null) {
  const db = env.DB;
  const startedAt = Date.now();

  let workflow = options && options.workflowId ? await findWorkflowById(db, options.workflowId) : null;
  if (!workflow) workflow = await findWorkflowForCapability(db, capability, (options && options.topic) || userText);
  if (!workflow) {
    throw new Error(`No workflow configured for capability "${capability}"`);
  }
  const steps = (await db.prepare(
    "SELECT * FROM workflow_steps WHERE workflow_id = ? ORDER BY step_order ASC"
  ).bind(workflow.id).all()).results || [];
  if (steps.length === 0) {
    throw new Error(`Workflow "${workflow.name}" has no steps configured`);
  }
  const validation = validateWorkflowGraph(steps);
  if (!validation.valid) {
    throw new Error(`Workflow "${workflow.name}" is invalid: ${validation.errors.join("; ")}`);
  }
  if (!aiManager) {
    aiManager = new AIProviderManager(config, { encrypt, decrypt }, noopLogger, db);
    await aiManager.initialize();
  }

  const { layers, cycle } = topoSort(steps);
  if (cycle) {
    throw new Error(`Workflow "${workflow.name}" contains a dependency cycle`);
  }

  const stepById = new Map(steps.map((s) => [s.id, s]));
  const outputsByStepId = new Map();
  const outputsByOrder = new Map();
  let allOutputsSoFar = [];
  const stepRecords = [];

  const baseCtx = {
    userText: userText || "",
    systemPrompt: (options && options.systemPrompt) || undefined,
    audioBuffer: (options && options.audioBuffer) || null,
    outputsByStepId,
    outputsByOrder,
    allOutputsSoFar,
  };

  // Run one step; on failure (throw or empty output) hop to its fallback_step_id.
  // Guards against loops.
  async function executeStepWithFallback(originalStep, ctx) {
    const attempted = new Set();
    let current = originalStep;
    let usedFallback = false;
    while (current) {
      if (attempted.has(current.id)) {
        throw new Error("Workflow step fallback loop detected");
      }
      attempted.add(current.id);
      const rec = {
        step_id: current.id,
        step_order: current.step_order,
        capability: current.capability,
        provider_id: current.provider_id,
        provider_name: null,
        status: "success",
        duration_ms: 0,
        output_preview: null,
        error: null,
        fallback_step_id: current.fallback_step_id,
        used_fallback: usedFallback,
      };
      const stepStart = Date.now();
      let result = null;
      let failed = false;
      let failError = null;
      try {
        const inputText = computeStepInput(current, ctx.userText, outputsByStepId, outputsByOrder, allOutputsSoFar);
        result = await callStepCapability(aiManager, current, { ...ctx, inputText });
      } catch (err) {
        failed = true;
        failError = sanitizeError(err.message);
      }
      if (!failed) {
        const isEmptyOutput = (typeof result.output === "string" && result.output.trim() === "")
          || (result.output && typeof result.output === "object" && result.output.__type === "image" && !result.output.image_base64)
          || (result.output && typeof result.output === "object" && result.output.__type === "audio" && !result.output.audio_base64);
        if (isEmptyOutput) {
          failed = true;
          failError = "empty output";
        }
      }
      rec.duration_ms = Date.now() - stepStart;
      if (failed) {
        rec.status = "failed";
        rec.error = failError;
        stepRecords.push(rec);
        if (current.fallback_step_id && stepById.has(current.fallback_step_id) && !attempted.has(current.fallback_step_id)) {
          usedFallback = true;
          current = stepById.get(current.fallback_step_id);
          continue;
        }
        throw new Error(failError);
      }
      rec.provider_name = result.provider || null;
      rec.output_preview = typeof result.output === "string" ? result.output.substring(0, 300) : null;
      stepRecords.push(rec);
      return { output: result.output, usedStep: current };
    }
    throw new Error("step execution failed");
  }

  for (const layer of layers) {
    const layerResults = await Promise.all(layer.map(async (step) => {
      try {
        return { step, ...(await executeStepWithFallback(step, baseCtx)) };
      } catch (err) {
        return { step, error: sanitizeError(err.message) };
      }
    }));
    for (const r of layerResults) {
      if (r.error) throw new Error(r.error);
      const { step, output, usedStep } = r;
      // The fallback step's output also satisfies references to the original step.
      outputsByStepId.set(step.id, output);
      outputsByStepId.set(usedStep.id, output);
      outputsByOrder.set(step.step_order, output);
      outputsByOrder.set(usedStep.step_order, output);
      allOutputsSoFar.push(output);
    }
  }

  let finalOutput = null;
  const orderedSteps = layers.flat();
  for (const s of orderedSteps) {
    if (s.output_role === "final" && outputsByStepId.has(s.id)) {
      finalOutput = outputsByStepId.get(s.id);
    }
  }
  if (finalOutput === null) {
    const produced = allOutputsSoFar.filter((o) => o != null);
    finalOutput = produced[produced.length - 1] ?? "";
  }

  const totalDurationMs = Date.now() - startedAt;
  const trace = {
    workflowId: workflow.id,
    workflowName: workflow.name,
    selectionSource: (options && options.selectionSource) || null,
    judgeResult: (options && options.judgeResult) || null,
    steps: stepRecords,
    totalDurationMs,
  };

  if (finalOutput && typeof finalOutput === "object" && finalOutput.__type === "image") {
    await recordWorkflowRun(db, buildRunRecord({ ...options, chatId: options.chatId, messageText: userText }, capability, workflow, trace, { text: "", image_base64: finalOutput.image_base64 }, null));
    return { text: "", image_base64: finalOutput.image_base64, workflowUsed: workflow.name, trace };
  }
  if (finalOutput && typeof finalOutput === "object" && finalOutput.__type === "audio") {
    await recordWorkflowRun(db, buildRunRecord({ ...options, chatId: options.chatId, messageText: userText }, capability, workflow, trace, { text: "", audio_base64: finalOutput.audio_base64 }, null));
    return { text: "", audio_base64: finalOutput.audio_base64, workflowUsed: workflow.name, trace };
  }
  const finalText = typeof finalOutput === "string" ? finalOutput : String(finalOutput || "");
  await recordWorkflowRun(db, buildRunRecord({ ...options, chatId: options.chatId, messageText: userText }, capability, workflow, trace, { text: finalText }, null));
  return { text: finalText, workflowUsed: workflow.name, trace };
}

function buildRunRecord(options, capability, workflow, trace, output, error) {
  return {
    source: options.source || "message",
    chatId: options.chatId || null,
    messageText: options.messageText || null,
    capability,
    workflowId: workflow.id,
    workflowName: workflow.name,
    selectionSource: trace.selectionSource,
    judgeResult: trace.judgeResult,
    status: error ? "failed" : "success",
    finalText: output && (output.text || output.image_base64 || output.audio_base64) ? output.text || "(media)" : "",
    error: error ? sanitizeError(error) : null,
    totalDurationMs: trace.totalDurationMs,
    steps: trace.steps,
  };
}

export { WORKFLOW_STEP_CAPABILITIES };
