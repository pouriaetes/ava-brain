// Professional HTML helpers for server-rendered admin panel with clean, minimal UI
// Features: Clean theme, minimal animations, professional design, simple form elements

export function escHtml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const baseStyles = `
  :root {
    --bg-primary: #f5f5f5;
    --bg-secondary: #ffffff;
    --bg-card: #ffffff;
    --bg-input: #ffffff;
    --border-color: #e0e0e0;
    --text-primary: #212121;
    --text-secondary: #757575;
    --text-muted: #9e9e9e;
    --accent-primary: #1976d2;
    --accent-hover: #1565c0;
    --success-bg: #e8f5e9;
    --success-text: #2e7d32;
    --success-border: #4caf50;
    --error-bg: #ffebee;
    --error-text: #c62828;
    --error-border: #ef5350;
    --warning-bg: #fff3e0;
    --warning-text: #ef6c00;
    --warning-border: #ffa726;
    --shadow-sm: 0 1px 3px rgba(0,0,0,0.12);
    --shadow-md: 0 2px 6px rgba(0,0,0,0.15);
    --shadow-lg: 0 4px 12px rgba(0,0,0,0.15);
    --radius-sm: 4px;
    --radius-md: 4px;
    --radius-lg: 6px;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }
  
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, 'Helvetica Neue', sans-serif;
    background: var(--bg-primary);
    color: var(--text-primary);
    line-height: 1.6;
    min-height: 100vh;
    padding: 0;
  }

  /* Header & Logo */
  header {
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border-color);
    padding: 16px 0;
    position: sticky;
    top: 0;
    z-index: 100;
  }

  .header-content {
    max-width: 1400px;
    margin: 0 auto;
    padding: 0 24px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .logo {
    display: flex;
    align-items: center;
    gap: 12px;
    text-decoration: none;
  }

  .logo-icon {
    width: 36px;
    height: 36px;
    background: var(--accent-primary);
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
  }

  .logo-text {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  h1 {
    color: var(--text-primary);
    margin-bottom: 20px;
    font-size: 1.5rem;
    font-weight: 600;
  }

  h2 {
    color: var(--text-primary);
    margin: 20px 0 12px;
    font-size: 1.1rem;
    font-weight: 600;
    padding-bottom: 6px;
    border-bottom: 2px solid var(--border-color);
    display: inline-block;
  }

  h3 {
    color: var(--text-primary);
    margin: 14px 0 10px;
    font-size: 1rem;
    font-weight: 600;
  }

  /* Navigation */
  nav {
    margin-bottom: 24px;
    padding: 12px 20px;
    background: var(--bg-secondary);
    border-radius: var(--radius-md);
    border: 1px solid var(--border-color);
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    box-shadow: var(--shadow-sm);
  }

  nav a {
    color: var(--text-secondary);
    text-decoration: none;
    padding: 8px 14px;
    border-radius: var(--radius-sm);
    font-weight: 500;
    font-size: 0.875rem;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  nav a:hover {
    background: var(--bg-primary);
    color: var(--text-primary);
  }

  nav a.active {
    background: var(--accent-primary);
    color: #fff;
  }

  /* Main container */
  main {
    max-width: 1400px;
    margin: 0 auto;
    padding: 32px 24px;
  }

  /* Forms */
  form {
    margin: 16px 0;
  }

  label {
    display: block;
    margin: 10px 0 4px;
    color: var(--text-secondary);
    font-size: 0.85rem;
    font-weight: 500;
  }

  input[type="text"],
  input[type="password"],
  input[type="email"],
  input[type="number"],
  textarea,
  select {
    width: 100%;
    padding: 10px 12px;
    background: var(--bg-input);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    color: var(--text-primary);
    font-size: 0.9rem;
    font-family: inherit;
  }

  input:focus,
  textarea:focus,
  select:focus {
    outline: none;
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 2px rgba(25, 118, 210, 0.1);
  }

  input::placeholder,
  textarea::placeholder {
    color: var(--text-muted);
  }

  textarea {
    resize: vertical;
    min-height: 80px;
  }

  select {
    cursor: pointer;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23757575'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 10px center;
    background-size: 16px;
    padding-right: 36px;
  }

  input[type="checkbox"] {
    width: 16px;
    height: 16px;
    margin-right: 8px;
    accent-color: var(--accent-primary);
    cursor: pointer;
    vertical-align: middle;
  }

  label:has(input[type="checkbox"]) {
    display: inline-flex;
    align-items: center;
    cursor: pointer;
    margin: 10px 0;
    padding: 6px 10px;
    border-radius: var(--radius-sm);
  }

  label:has(input[type="checkbox"]):hover {
    background: var(--bg-primary);
  }

  /* Buttons */
  button, .btn {
    padding: 10px 20px;
    background: var(--accent-primary);
    color: #fff;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-size: 0.9rem;
    font-weight: 500;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    text-decoration: none;
    box-shadow: var(--shadow-sm);
  }

  button:hover, .btn:hover {
    background: var(--accent-hover);
  }

  button.danger, .btn.danger {
    background: #d32f2f;
  }

  button.danger:hover, .btn.danger:hover {
    background: #b71c1c;
  }

  button.success, .btn.success {
    background: #388e3c;
  }

  button.warning, .btn.warning {
    background: #f57c00;
  }

  button.small, .btn.small {
    padding: 6px 12px;
    font-size: 0.8rem;
  }

  button.secondary, .btn.secondary {
    background: #fff;
    border: 1px solid var(--border-color);
    color: var(--text-secondary);
  }

  button.secondary:hover, .btn.secondary:hover {
    background: var(--bg-primary);
    border-color: var(--text-muted);
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Cards */
  .card {
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    padding: 20px;
    margin: 16px 0;
    box-shadow: var(--shadow-sm);
  }

  /* Grid layouts */
  .row {
    display: grid;
    gap: 16px;
    margin: 0 -8px;
  }

  .row.cols-2 { grid-template-columns: repeat(2, 1fr); }
  .row.cols-3 { grid-template-columns: repeat(3, 1fr); }
  .row.cols-4 { grid-template-columns: repeat(4, 1fr); }

  @media (max-width: 768px) {
    .row, .row.cols-2, .row.cols-3, .row.cols-4 {
      grid-template-columns: 1fr;
    }
  }

  .col {
    padding: 0 8px;
  }

  /* Flash messages */
  .flash {
    padding: 12px 16px;
    border-radius: var(--radius-sm);
    margin: 16px 0;
    display: flex;
    align-items: center;
    gap: 10px;
    border-left: 3px solid;
  }

  .flash.success {
    background: var(--success-bg);
    color: var(--success-text);
    border-color: var(--success-border);
  }

  .flash.error {
    background: var(--error-bg);
    color: var(--error-text);
    border-color: var(--error-border);
  }

  .flash.warning {
    background: var(--warning-bg);
    color: var(--warning-text);
    border-color: var(--warning-border);
  }

  /* Badges */
  .badge {
    display: inline-flex;
    align-items: center;
    padding: 3px 10px;
    border-radius: 12px;
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
  }

  .badge.active {
    background: var(--success-bg);
    color: var(--success-text);
  }

  .badge.inactive {
    background: var(--error-bg);
    color: var(--error-text);
  }

  .badge.warning {
    background: var(--warning-bg);
    color: var(--warning-text);
  }

  .badge.info {
    background: #e3f2fd;
    color: var(--accent-primary);
  }

  /* Stats cards */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
    margin: 16px 0;
  }

  .stat-card {
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    padding: 20px;
    text-align: center;
    box-shadow: var(--shadow-sm);
  }

  .stat-value {
    font-size: 2rem;
    font-weight: 600;
    color: var(--accent-primary);
    margin-bottom: 6px;
  }

  .stat-label {
    color: var(--text-secondary);
    font-size: 0.85rem;
    font-weight: 500;
  }

  /* Tables */
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 14px 0;
    background: var(--bg-secondary);
  }

  th, td {
    padding: 12px;
    text-align: left;
    border-bottom: 1px solid var(--border-color);
  }

  th {
    background: var(--bg-primary);
    color: var(--text-secondary);
    font-weight: 600;
    font-size: 0.8rem;
    text-transform: uppercase;
  }

  tr:hover td {
    background: var(--bg-primary);
  }

  /* Pre/code blocks */
  pre {
    white-space: pre-wrap;
    word-break: break-all;
    background: var(--bg-primary);
    padding: 14px;
    border-radius: var(--radius-sm);
    font-size: 0.8rem;
    color: var(--text-secondary);
    border: 1px solid var(--border-color);
    overflow-x: auto;
    font-family: 'Consolas', 'Monaco', monospace;
  }

  code {
    background: var(--bg-primary);
    padding: 2px 5px;
    border-radius: 3px;
    font-size: 0.85em;
    font-family: 'Consolas', 'Monaco', monospace;
  }

  /* Muted text */
  .muted {
    color: var(--text-muted);
    font-size: 0.85rem;
  }

  /* Loading spinner */
  .spinner {
    width: 20px;
    height: 20px;
    border: 2px solid var(--border-color);
    border-top-color: var(--accent-primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Scrollbar */
  ::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }

  ::-webkit-scrollbar-track {
    background: var(--bg-primary);
  }

  ::-webkit-scrollbar-thumb {
    background: #bdbdbd;
    border-radius: 4px;
  }

  ::-webkit-scrollbar-thumb:hover {
    background: var(--text-muted);
  }

  /* Responsive */
  @media (max-width: 768px) {
    main {
      padding: 16px;
    }

    nav {
      flex-direction: column;
    }

    nav a {
      width: 100%;
      justify-content: center;
    }

    .header-content {
      flex-direction: column;
      gap: 12px;
      text-align: center;
    }

    h1 { font-size: 1.25rem; }
    h2 { font-size: 1rem; }
    
    .stats-grid {
      grid-template-columns: 1fr;
    }
  }
`;

export function layout({ title, content, session, currentPage = "" }) {
  const navItems = [
    { href: "/admin/ava_brain/dashboard", label: "Dashboard", icon: "📊" },
    { href: "/admin/ava_brain/settings", label: "Settings", icon: "⚙️" },
    { href: "/admin/ava_brain/apis", label: "APIs", icon: "🔌" },
    { href: "/admin/ava_brain/memory", label: "Memory", icon: "🧠" },
    { href: "/admin/ava_brain/tasks", label: "Tasks", icon: "✅" },
    { href: "/admin/ava_brain/logs", label: "Logs", icon: "📋" },
  ];

  const nav = session
    ? `
    <nav>
      ${navItems.map(item => `
        <a href="${item.href}" class="${currentPage === item.href ? "active" : ""}">
          ${item.icon} ${item.label}
        </a>
      `).join("")}
      <a href="/admin/ava_brain/logout" style="margin-left: auto; color: var(--error-text);">
        🚪 Logout
      </a>
    </nav>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escHtml(title)} - AVA Brain</title>
  <style>${baseStyles}</style>
</head>
<body>
  <header>
    <div class="header-content">
      <a href="/admin/ava_brain/dashboard" class="logo">
        <div class="logo-icon">🧠</div>
        <span class="logo-text">AVA Brain</span>
      </a>
      ${session ? `<span class="muted">Welcome, ${escHtml(session.username)}</span>` : ""}
    </div>
  </header>
  <main>
    ${nav}
    ${content}
  </main>
</body>
</html>`;
}

export function loginForm(error, success = null) {
  return layout({
    title: "Login",
    content: `
      <div class="card" style="max-width:420px;margin:60px auto;padding:32px;">
        <div style="text-align:center;margin-bottom:28px;">
          <div style="width:64px;height:64px;background:var(--accent-primary);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:32px;margin:0 auto 16px;">
            🔐
          </div>
          <h2 style="border:none;margin:0;font-size:1.4rem;">Admin Login</h2>
          <p class="muted" style="margin-top:6px;">Enter your credentials to access the panel</p>
        </div>
        
        ${error ? `<div class="flash error">⚠️ ${escHtml(error)}</div>` : ""}
        ${success ? `<div class="flash success">✓ ${escHtml(success)}</div>` : ""}
        
        <form method="POST" action="/admin/ava_brain/login" style="margin-top:20px;">
          <label for="username">Username</label>
          <input type="text" id="username" name="username" required autocomplete="username" 
                 placeholder="Enter your username">
          
          <label for="password" style="margin-top:14px;">Password</label>
          <input type="password" id="password" name="password" required autocomplete="current-password" 
                 placeholder="Enter your password">
          
          <button type="submit" style="width:100%;margin-top:20px;padding:12px;font-size:0.95rem;">
            Sign In
          </button>
        </form>
        
        <p class="muted" style="text-align:center;margin-top:20px;font-size:0.8rem;">
          Protected by AVA Brain Security System
        </p>
      </div>`,
    session: null,
  });
}

export function changePasswordForm(error, success = null) {
  return layout({
    title: "Change Password",
    content: `
      <div class="card" style="max-width:420px;margin:60px auto;padding:32px;">
        <div style="text-align:center;margin-bottom:28px;">
          <div style="width:64px;height:64px;background:#388e3c;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:32px;margin:0 auto 16px;">
            ✨
          </div>
          <h2 style="border:none;margin:0;font-size:1.4rem;">Set New Password</h2>
          <p class="muted" style="margin-top:6px;">First login — please set a strong password</p>
        </div>
        
        ${error ? `<div class="flash error">⚠️ ${escHtml(error)}</div>` : ""}
        ${success ? `<div class="flash success">✓ ${escHtml(success)}</div>` : ""}
        
        <form method="POST" action="/admin/ava_brain/login" style="margin-top:20px;">
          <input type="hidden" name="action" value="change_password">
          
          <label for="new_password">New Password</label>
          <input type="password" id="new_password" name="new_password" required minlength="8" autocomplete="new-password" 
                 placeholder="Minimum 8 characters">
          
          <label for="confirm_password" style="margin-top:14px;">Confirm Password</label>
          <input type="password" id="confirm_password" name="confirm_password" required minlength="8" autocomplete="new-password" 
                 placeholder="Re-enter your password">
          
          <button type="submit" style="width:100%;margin-top:20px;padding:12px;font-size:0.95rem;background:#388e3c;">
            Set Password
          </button>
        </form>
        
        <div class="card" style="background:var(--bg-primary);margin-top:20px;padding:14px;">
          <p style="font-size:0.8rem;color:var(--text-secondary);"><strong>Password Requirements:</strong></p>
          <ul style="font-size:0.8rem;color:var(--text-muted);margin-top:6px;padding-left:18px;">
            <li>Minimum 8 characters</li>
            <li>Use a mix of letters, numbers, and symbols</li>
            <li>Avoid common passwords</li>
          </ul>
        </div>
      </div>`,
    session: null,
  });
}