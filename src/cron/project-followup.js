// Daily project follow-up: at most one message per day, combined for multiple projects
import { sendTelegramMessage } from "../lib/telegram.js";
import { log } from "../lib/logger.js";
import { ProjectManager } from "../lib/projects.js";

export async function handleProjectFollowups(config, env, ctx) {
  const projectManager = new ProjectManager(config, null, { info: log.info, error: log.error, warn: log.warn }, env.DB);

  try {
    const projects = await projectManager.getFollowUpProjects();
    const dueForFollowup = [];

    for (const project of projects) {
      const shouldFollowUp = await projectManager.shouldSendFollowUp(project.id);
      if (shouldFollowUp) {
        dueForFollowup.push(project);
        await projectManager.recordFollowUpSent(project.id);
      }
    }

    if (dueForFollowup.length === 0) return;

    // Build combined message
    let message = "<b>🚀 Project follow-up</b>\n\n";
    const lines = dueForFollowup.map(project => {
      const metadata = JSON.parse(project.metadata || "{}");
      const topic = metadata.topic || project.name;
      return `How is <b>${topic}</b> going?`;
    });

    message += lines.join("\n\n");

    await sendTelegramMessage(config, config.OWNER_TELEGRAM_ID, message, { parse_mode: "HTML" });

    await log(env.DB, "info", "project_followups_sent", { count: dueForFollowup.length });
  } catch (error) {
    await log(env.DB, "error", "project_followups_cron", { error: error.message });
  }
}