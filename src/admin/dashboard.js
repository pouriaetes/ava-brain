// Admin dashboard page handler
import { layout, escHtml } from "../lib/html.js";

export async function handleDashboardPage(env, config, user = null) {
  const db = env.DB;
  const stats = await getDashboardStats(db);

  return new Response(layout({
    title: "Dashboard",
    currentPage: "/admin/ava_brain/dashboard",
    content: `
      <h2>📊 Dashboard Overview</h2>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">${stats.shortTermCount + stats.longTermCount}</div>
          <div class="stat-label">Total Memory Entries</div>
          <p class="muted" style="margin-top:8px;font-size:0.8rem;">
            <span style="color:var(--success-text);">${stats.shortTermCount}</span> short-term • 
            <span style="color:var(--accent-hover);">${stats.longTermCount}</span> long-term
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
          <p class="muted" style="margin-top:8px;font-size:0.8rem;">${stats.enabledRoutinesCount} routines enabled</p>
        </div>
        <div class="stat-card">
          <div class="stat-value">${stats.pendingRemindersCount}</div>
          <div class="stat-label">Pending Reminders</div>
          <p class="muted" style="margin-top:8px;font-size:0.8rem;">Awaiting delivery</p>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="font-size:1.5rem;">${stats.systemHealth}</div>
          <div class="stat-label">System Health</div>
          <p class="muted" style="margin-top:8px;font-size:0.8rem;">All systems operational</p>
        </div>
      </div>

      <div class="card">
        <h3>📝 Recent Activity Logs</h3>
        ${stats.recentLogs.length === 0 ? "<p class=\"muted\">No recent logs available</p>" : `
          <div style="margin-top:16px;">
            ${stats.recentLogs.map(log => `
              <div style="padding:12px;border-bottom:1px solid var(--border-color);display:flex;align-items:flex-start;gap:12px;">
                <span class="badge ${log.level === 'error' ? 'inactive' : log.level === 'warn' ? 'warning' : 'active'}" style="min-width:60px;text-align:center;">${escHtml(log.level)}</span>
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
          <a href="/admin/ava_brain/logs" class="btn secondary small">View All Logs →</a>
        </div>
      </div>

      <div class="row cols-2" style="margin-top:20px;">
        <div class="col">
          <div class="card">
            <h3>⚡ Quick Actions</h3>
            <div style="display:flex;flex-direction:column;gap:8px;margin-top:16px;">
              <a href="/admin/ava_brain/tasks" class="btn small secondary">➕ Create New Routine</a>
              <a href="/admin/ava_brain/memory" class="btn small secondary">🧠 Add Profile Fact</a>
              <a href="/admin/ava_brain/apis" class="btn small secondary">🔌 Test AI Providers</a>
              <a href="/admin/ava_brain/settings" class="btn small secondary">⚙️ Configure Settings</a>
            </div>
          </div>
        </div>
        <div class="col">
          <div class="card">
            <h3>ℹ️ System Info</h3>
            <div style="margin-top:16px;">
              <p class="muted" style="font-size:0.85rem;margin-bottom:8px;"><strong>Version:</strong> 1.0.0</p>
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
    stats.systemHealth = "✓ OK";
    stats.lastCronRun = (await db.prepare("SELECT value FROM settings WHERE key = 'last_cron_run'").first())?.value || 'N/A';
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
      enabledRoutinesCount: 0,
      pendingRemindersCount: 0,
      recentLogs: [],
      systemHealth: "! Error",
      lastCronRun: 'N/A',
    };
  }
}