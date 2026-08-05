// Daily cleanup: expired short-term memory, old logs, expired pending actions, stale sessions
import { log } from "../lib/logger.js";

export async function handleCleanup(config, env, ctx) {
  try {
    // Cleanup expired short-term memory
    const shortTerm = await env.DB.prepare("DELETE FROM memory_short_term WHERE expires_at <= datetime('now')").run();

    // Cleanup expired long-term memory (rare, only if expires_at is set)
    const longTerm = await env.DB.prepare("DELETE FROM memory_long_term WHERE expires_at <= datetime('now') AND expires_at IS NOT NULL").run();

    // Cleanup old logs (keep 30 days)
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const logs = await env.DB.prepare("DELETE FROM logs WHERE created_at < ?").bind(cutoff).run();

    // Cleanup expired pending actions
    const pendingActions = await env.DB.prepare("DELETE FROM pending_actions WHERE expires_at <= datetime('now')").run();

    // Cleanup old sessions (keep 7 days of closed sessions)
    const sessionCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const sessions = await env.DB.prepare("DELETE FROM sessions WHERE status = 'closed' AND last_active_at < ?").bind(sessionCutoff).run();

    // Update last cleanup timestamp
    await env.DB
      .prepare("UPDATE settings SET value = ?, updated_at = datetime('now') WHERE key = 'cleanup_last_run_at'")
      .bind(new Date().toISOString())
      .run();

    await log(env.DB, "info", "cleanup_completed", {
      shortTermDeleted: shortTerm.changes || 0,
      longTermDeleted: longTerm.changes || 0,
      logsDeleted: logs.changes || 0,
      pendingActionsDeleted: pendingActions.changes || 0,
      sessionsDeleted: sessions.changes || 0,
    });
  } catch (error) {
    await log(env.DB, "error", "cleanup_cron", { error: error.message });
  }
}