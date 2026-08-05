// Action executor — validates and executes all actions
// Every action must be whitelisted and validated; no direct SQL from AI output
import { validateAction, executeAction as execAction, ACTION_WHITELIST } from "./validator.js";

export async function execute(message, routing, config, env, managers) {
  const { intent, actions = [], tables_to_read = [] } = routing;
  const results = [];

  for (const actionName of actions) {
    const params = {
      ...routing,
      message,
      // Extract fields from message/memory for parameter construction
      title: routing.response_hint?.split(".")[0] || message.text?.substring(0, 200),
      content: message.text || "",
      type: intent === "event_create" ? "meeting" : "note",
      calendar: "gregorian",
      month: new Date().getUTCMonth() + 1,
      day: new Date().getUTCDate(),
    };

    const result = await execAction(actionName, params, managers, config);
    results.push(result);
  }

  return results;
}

export { ACTION_WHITELIST };