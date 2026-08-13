// Admin dashboard page handler
import { layout, escHtml, pageHeader, badge } from "../lib/html.js";
import { getWorkflowCapabilities } from "../capabilities.js";

export async function handleDashboardPage(env, config, user = null) {
  const db = env.DB;
  const stats = await getDashboardStats(db);
  const missingDefaults = await getMissingDefaultWorkflows(db);

  // Warning banner: if any generative capability lost its active default workflow
  // (disabled or stripped of steps), the Judge would select a route that then
  // fails with "No workflow configured". Surface that here instead of silently.
  const defaultsWarning = missingDefaults.length > 0
    ? `<div class="flash error">The following capabilities have no active default workflow and will fail if the Judge selects them: <strong>${escHtml(missingDefaults.join(", "))}</strong>. <a href="/admin/ava_brain/capabilities?tab=workflows" style="color:inherit;text-decoration:underline;">Open Workflows</a></div>`
    : "";

  return new Response(layout({
    title: "Dashboard",
    currentPage: "/admin/ava_brain/dashboard",
    content: `
      ${defaultsWarning}
      ${pageHeader("Dashboard", {
        description: "Overview of memory, projects, providers, reminders, and recent activity.",
      })}

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">${stats.shortTermCount + stats.longTermCount}</div>
          <div class="stat-label">Total Memory Entries</div>
          <p class="muted" style="margin-top:8px;font-size:0.8rem;">
            <span style="color:var(--success-text);">${stats.shortTermCount}</span> short-term
            <span style="color:var(--text-muted);margin:0 4px;">·</span>
            <span style="color:var(--accent-primary);">${stats.longTermCount}</span> long-term
          </p>
        </div>
        <div class="stat-card">
          <div class="stat-value">${stats.profileFactsCount}</div>
          <div class="stat-label">Profile Facts</div>
          <p class="muted" style="margin-top:8px;font-size:0.8rem;">Personal preferences & data</p>
        </div>
        <div class="stat-card">
          <div class="stat-value">${stats.activeProjectsCount}</div>
          <div class="stat-label">Active Projects</div>
          <p class="muted" style="margin-top:8px;font-size:0.8rem;">
            <span style="color:var(--text-muted);">${stats.completedProjectsCount} completed</span>
          </p>
        </div>
        <div class="stat-card">
          <div class="stat-value">${stats.activeProvidersCount}</div>
          <div class="stat-label">AI Providers</div>
          <p class="muted" style="margin-top:8px;font-size:0.8rem;">${stats.todayPlansCount} daily plans today</p>
        </div>
        <div class="stat-card">
          <div class="stat-value">${stats.pendingRemindersCount}</div>
          <div class="stat-label">Pending Reminders</div>
          <p class="muted" style="margin-top:8px;font-size:0.8rem;">Awaiting delivery</p>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="font-size:1.5rem;color:var(--success-text);">${stats.systemHealth}</div>
          <div class="stat-label">System Health</div>
          <p class="muted" style="margin-top:8px;font-size:0.8rem;">All systems operational</p>
        </div>
      </div>

      <div class="card">
        <h3>Recent Activity Logs</h3>
        ${stats.recentLogs.length === 0 ? "<p class=\"muted\">No recent logs available</p>" : `
          <div style="margin-top:16px;">
            ${stats.recentLogs.map(log => `
              <div style="padding:12px;border-bottom:1px solid var(--border-color);display:flex;align-items:flex-start;gap:12px;">
                <span style="min-width:60px;text-align:center;">${badge(log.level === 'error' ? 'error' : log.level === 'warn' ? 'warning' : log.level === 'info' ? 'info' : 'neutral', log.level)}</span>
                <div style="flex:1;">
                  <p style="margin:0;"><strong>${escHtml(log.event)}</strong></p>
                  <p class="muted" style="margin:4px 0 0;font-size:0.8rem;">${escHtml(log.created_at)}</p>
                  ${log.metadata && log.metadata !== '{}' ? `<pre style="margin-top:8px;background:var(--bg-primary);font-size:0.75rem;">${escHtml(log.metadata)}</pre>` : ""}
                </div>
              </div>
            `).join("")}
          </div>
        `}
        <div style="margin-top:16px;text-align:right;">
          <a href="/admin/ava_brain/logs" class="btn secondary small">View All Logs</a>
        </div>
      </div>

      <div class="row cols-2" style="margin-top:20px;">
        <div>
          <div class="card">
            <h3>Quick Actions</h3>
            <div style="display:flex;flex-direction:column;gap:8px;margin-top:16px;">
              <a href="/admin/ava_brain/daily_plan" class="btn small secondary">Daily Plan Settings</a>
              <a href="/admin/ava_brain/memory" class="btn small secondary">Add Profile Fact</a>
              <a href="/admin/ava_brain/apis" class="btn small secondary">Test AI Providers</a>
              <a href="/admin/ava_brain/settings" class="btn small secondary">Configure Settings</a>
            </div>
          </div>
        </div>
        <div>
          <div class="card">
            <h3>System Info</h3>
            <div style="margin-top:16px;">
              <p class="muted" style="font-size:0.85rem;margin-bottom:8px;"><strong>Version:</strong> 3.0.0</p>
              <p class="muted" style="font-size:0.85rem;margin-bottom:8px;"><strong>Timezone:</strong> ${config.TIMEZONE || 'UTC'}</p>
              <p class="muted" style="font-size:0.85rem;margin-bottom:8px;"><strong>Last Cron:</strong> ${stats.lastCronRun || 'N/A'}</p>
              <p class="muted" style="font-size:0.85rem;"><strong>Environment:</strong> Cloudflare Workers</p>
            </div>
          </div>
        </div>
      </div>
    `,
    session: user,
  }), { headers: { "Content-Type": "text/html" } });
}

// Check that each generative capability still has at least one ENABLED default
// workflow with at least one step. normal_chat is intentionally excluded (it is a
// direct system path, not a workflow).
async function getMissingDefaultWorkflows(db) {
  const generativeCapabilities = getWorkflowCapabilities().map((c) => c.id);
  const missing = [];
  try {
    for (const cap of generativeCapabilities) {
      const wf = await db.prepare(
        "SELECT w.id FROM workflows w WHERE w.capability = ? AND w.is_default = 1 AND w.enabled = 1 AND EXISTS (SELECT 1 FROM workflow_steps s WHERE s.workflow_id = w.id)"
      ).bind(cap).first();
      if (!wf) missing.push(cap);
    }
  } catch (e) {
    console.error("Dashboard workflow-defaults check error:", e);
  }
  return missing;
}

async function getDashboardStats(db) {
  try {
    // OPT-008: fire the independent count/summary queries concurrently instead of
    // awaiting them one after another.
    const [
      shortTermCount,
      longTermCount,
      profileFactsCount,
      activeProjectsCount,
      completedProjectsCount,
      activeProvidersCount,
      todayPlansCount,
      pendingRemindersCount,
      recentLogs,
      lastCronRun,
    ] = await Promise.all([
      db.prepare("SELECT COUNT(*) as count FROM memory_short_term").first(),
      db.prepare("SELECT COUNT(*) as count FROM memory_long_term").first(),
      db.prepare("SELECT COUNT(*) as count FROM profile_facts").first(),
      db.prepare("SELECT COUNT(*) as count FROM projects WHERE status = 'active'").first(),
      db.prepare("SELECT COUNT(*) as count FROM projects WHERE status = 'completed'").first(),
      db.prepare("SELECT COUNT(*) as count FROM api_providers WHERE enabled = 1").first(),
      db.prepare("SELECT COUNT(*) as count FROM daily_plans").first(),
      db.prepare("SELECT COUNT(*) as count FROM reminders WHERE status = 'pending'").first(),
      db.prepare("SELECT * FROM logs ORDER BY created_at DESC LIMIT 5").all(),
      db.prepare("SELECT value FROM settings WHERE key = 'last_cron_run'").first(),
    ]);
    const stats = {};
    stats.shortTermCount = shortTermCount?.count || 0;
    stats.longTermCount = longTermCount?.count || 0;
    stats.profileFactsCount = profileFactsCount?.count || 0;
    stats.activeProjectsCount = activeProjectsCount?.count || 0;
    stats.completedProjectsCount = completedProjectsCount?.count || 0;
    stats.activeProvidersCount = activeProvidersCount?.count || 0;
    stats.todayPlansCount = todayPlansCount?.count || 0;
    stats.pendingRemindersCount = pendingRemindersCount?.count || 0;
    stats.recentLogs = recentLogs.results || [];
    stats.systemHealth = "OK";
    stats.lastCronRun = lastCronRun?.value || 'N/A';
    return stats;
  } catch (e) {
    console.error("Dashboard stats error:", e);
    return {
      shortTermCount: 0,
      longTermCount: 0,
      profileFactsCount: 0,
      activeProjectsCount: 0,
      completedProjectsCount: 0,
      activeProvidersCount: 0,
      todayPlansCount: 0,
      pendingRemindersCount: 0,
      recentLogs: [],
      systemHealth: "Error",
      lastCronRun: 'N/A',
    };
  }
}
