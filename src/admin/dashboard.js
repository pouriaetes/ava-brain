// Admin dashboard page handler
import { layout, escHtml } from "../lib/html.js";

export async function handleDashboardPage(env, config, user = null) {
  const db = env.DB;
  const stats = await getDashboardStats(db);

  return layout({
    title: "Dashboard",
    content: `
      <h2>Dashboard</h2>

      <div class="row">
        <div class="col">
          <div class="card">
            <h3>Memory</h3>
            <p>Short-term entries: <strong>${stats.shortTermCount}</strong></p>
            <p>Long-term entries: <strong>${stats.longTermCount}</strong></p>
            <p>Profile facts: <strong>${stats.profileFactsCount}</strong></p>
          </div>
        </div>
        <div class="col">
          <div class="card">
            <h3>Projects</h3>
            <p>Active projects: <strong>${stats.activeProjectsCount}</strong></p>
            <p>Completed: <strong>${stats.completedProjectsCount}</strong></p>
          </div>
        </div>
        <div class="col">
          <div class="card">
            <h3>System</h3>
            <p>Active providers: <strong>${stats.activeProvidersCount}</strong></p>
            <p>Enabled routines: <strong>${stats.enabledRoutinesCount}</strong></p>
            <p>Pending reminders: <strong>${stats.pendingRemindersCount}</strong></p>
          </div>
        </div>
      </div>

      <div class="card">
        <h3>Recent Logs</h3>
        ${stats.recentLogs.length === 0 ? "<p class=\"muted\">No logs yet</p>" : stats.recentLogs.map(log => `
          <p><strong>${escHtml(log.created_at)}</strong> <span class="badge ${log.level === 'error' ? 'inactive' : 'active'}">${escHtml(log.level)}</span> ${escHtml(log.event)}</p>
          <pre>${escHtml(log.metadata || "{}")}</pre>
        `).join("")}
      </div>
    `,
    session: user,
  });
}

async function getDashboardStats(db) {
  try {
    const stats = {};
    stats.shortTermCount = (await db.prepare("SELECT COUNT(*) as count FROM memory_short_term").first()).count || 0;
    stats.longTermCount = (await db.prepare("SELECT COUNT(*) as count FROM memory_long_term").first()).count || 0;
    stats.profileFactsCount = (await db.prepare("SELECT COUNT(*) as count FROM profile_facts").first()).count || 0;
    stats.activeProjectsCount = (await db.prepare("SELECT COUNT(*) as count FROM projects WHERE status = 'active'").first()).count || 0;
    stats.completedProjectsCount = (await db.prepare("SELECT COUNT(*) as count FROM projects WHERE status = 'completed'").first()).count || 0;
    stats.activeProvidersCount = (await db.prepare("SELECT COUNT(*) as count FROM api_providers WHERE enabled = 1").first()).count || 0;
    stats.enabledRoutinesCount = (await db.prepare("SELECT COUNT(*) as count FROM routines WHERE enabled = 1 AND draft = 0").first()).count || 0;
    stats.pendingRemindersCount = (await db.prepare("SELECT COUNT(*) as count FROM reminders WHERE status = 'pending'").first()).count || 0;
    stats.recentLogs = (await db.prepare("SELECT * FROM logs ORDER BY created_at DESC LIMIT 5").all()).results || [];
    return stats;
  } catch (e) {
    return {
      shortTermCount: 0,
      longTermCount: 0,
      profileFactsCount: 0,
      activeProjectsCount: 0,
      completedProjectsCount: 0,
      activeProvidersCount: 0,
      enabledRoutinesCount: 0,
      pendingRemindersCount: 0,
      recentLogs: [],
    };
  }
}