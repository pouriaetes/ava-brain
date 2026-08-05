// Professional HTML helpers for server-rendered admin panel with modern dark theme
// Features: Dark mode, professional UI/UX, smooth animations, modern design system

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
    /* Dark Theme Color Palette - Professional */
    --bg-primary: #0f1419;
    --bg-secondary: #1a2029;
    --bg-card: #1e2733;
    --bg-input: #161b22;
    --bg-hover: #252f3d;
    
    --border-color: #2d3748;
    --border-light: #3d4a5c;
    
    --text-primary: #f1f5f9;
    --text-secondary: #94a3b8;
    --text-muted: #64748b;
    
    --accent-primary: #3b82f6;
    --accent-hover: #2563eb;
    --accent-glow: rgba(59, 130, 246, 0.15);
    
    --success-bg: rgba(34, 197, 94, 0.1);
    --success-text: #4ade80;
    --success-border: #22c55e;
    
    --error-bg: rgba(239, 68, 68, 0.1);
    --error-text: #f87171;
    --error-border: #ef4444;
    
    --warning-bg: rgba(245, 158, 11, 0.1);
    --warning-text: #fbbf24;
    --warning-border: #f59e0b;
    
    --info-bg: rgba(59, 130, 246, 0.1);
    --info-text: #60a5fa;
    --info-border: #3b82f6;
    
    --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
    --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.4);
    --shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.5);
    --shadow-glow: 0 0 20px rgba(59, 130, 246, 0.3);
    
    --radius-sm: 6px;
    --radius-md: 8px;
    --radius-lg: 12px;
    --radius-xl: 16px;
    
    --transition-fast: 0.15s ease;
    --transition-normal: 0.25s ease;
    --transition-slow: 0.35s ease;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }
  
  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
    background: var(--bg-primary);
    color: var(--text-primary);
    line-height: 1.6;
    min-height: 100vh;
    padding: 0;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  /* Smooth scrolling */
  html {
    scroll-behavior: smooth;
  }

  /* Header & Logo */
  header {
    background: linear-gradient(180deg, var(--bg-secondary) 0%, var(--bg-primary) 100%);
    border-bottom: 1px solid var(--border-color);
    padding: 20px 0;
    position: sticky;
    top: 0;
    z-index: 100;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    box-shadow: var(--shadow-md);
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
    gap: 14px;
    text-decoration: none;
    transition: transform var(--transition-fast);
  }

  .logo:hover {
    transform: translateX(4px);
  }

  .logo-icon {
    width: 42px;
    height: 42px;
    background: linear-gradient(135deg, var(--accent-primary) 0%, #1d4ed8 100%);
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    box-shadow: 0 4px 12px var(--accent-glow);
    transition: all var(--transition-fast);
  }

  .logo:hover .logo-icon {
    box-shadow: 0 6px 20px var(--accent-glow);
    transform: scale(1.05);
  }

  .logo-text {
    font-size: 1.35rem;
    font-weight: 700;
    color: var(--text-primary);
    letter-spacing: -0.5px;
    background: linear-gradient(135deg, var(--text-primary) 0%, var(--text-secondary) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  h1 {
    color: var(--text-primary);
    margin-bottom: 24px;
    font-size: 1.75rem;
    font-weight: 700;
    letter-spacing: -0.5px;
  }

  h2 {
    color: var(--text-primary);
    margin: 24px 0 16px;
    font-size: 1.25rem;
    font-weight: 600;
    padding-bottom: 10px;
    border-bottom: 2px solid var(--border-color);
    display: inline-block;
    letter-spacing: -0.3px;
  }

  h3 {
    color: var(--text-primary);
    margin: 18px 0 12px;
    font-size: 1.1rem;
    font-weight: 600;
    letter-spacing: -0.2px;
  }

  /* Navigation */
  nav {
    margin-bottom: 28px;
    padding: 8px;
    background: var(--bg-secondary);
    border-radius: var(--radius-lg);
    border: 1px solid var(--border-color);
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    box-shadow: var(--shadow-sm);
  }

  nav a {
    color: var(--text-secondary);
    text-decoration: none;
    padding: 10px 16px;
    border-radius: var(--radius-md);
    font-weight: 500;
    font-size: 0.875rem;
    display: flex;
    align-items: center;
    gap: 8px;
    transition: all var(--transition-fast);
    position: relative;
    overflow: hidden;
  }

  nav a::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: var(--bg-hover);
    opacity: 0;
    transition: opacity var(--transition-fast);
    border-radius: var(--radius-md);
  }

  nav a:hover {
    color: var(--text-primary);
  }

  nav a:hover::before {
    opacity: 1;
  }

  nav a.active {
    background: linear-gradient(135deg, var(--accent-primary) 0%, #1d4ed8 100%);
    color: #fff;
    box-shadow: 0 4px 12px var(--accent-glow);
  }

  nav a.active::before {
    opacity: 0;
  }

  /* Main container */
  main {
    max-width: 1400px;
    margin: 0 auto;
    padding: 40px 24px;
  }

  /* Forms */
  form {
    margin: 16px 0;
  }

  label {
    display: block;
    margin: 12px 0 6px;
    color: var(--text-secondary);
    font-size: 0.875rem;
    font-weight: 600;
    letter-spacing: 0.2px;
  }

  input[type="text"],
  input[type="password"],
  input[type="email"],
  input[type="number"],
  textarea,
  select {
    width: 100%;
    padding: 12px 16px;
    background: var(--bg-input);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    color: var(--text-primary);
    font-size: 0.925rem;
    font-family: inherit;
    transition: all var(--transition-fast);
  }

  input:hover,
  textarea:hover,
  select:hover {
    border-color: var(--border-light);
  }

  input:focus,
  textarea:focus,
  select:focus {
    outline: none;
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 3px var(--accent-glow);
    background: var(--bg-input);
  }

  input::placeholder,
  textarea::placeholder {
    color: var(--text-muted);
  }

  textarea {
    resize: vertical;
    min-height: 100px;
  }

  select {
    cursor: pointer;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2394a3b8'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 12px center;
    background-size: 18px;
    padding-right: 40px;
  }

  input[type="checkbox"] {
    width: 18px;
    height: 18px;
    margin-right: 10px;
    accent-color: var(--accent-primary);
    cursor: pointer;
    vertical-align: middle;
    border-radius: 4px;
  }

  label:has(input[type="checkbox"]) {
    display: inline-flex;
    align-items: center;
    cursor: pointer;
    margin: 10px 0;
    padding: 8px 12px;
    border-radius: var(--radius-sm);
    transition: background var(--transition-fast);
  }

  label:has(input[type="checkbox"]):hover {
    background: var(--bg-hover);
  }

  /* Buttons */
  button, .btn {
    padding: 12px 24px;
    background: linear-gradient(135deg, var(--accent-primary) 0%, #1d4ed8 100%);
    color: #fff;
    border: none;
    border-radius: var(--radius-md);
    cursor: pointer;
    font-size: 0.925rem;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    text-decoration: none;
    box-shadow: 0 4px 12px var(--accent-glow);
    transition: all var(--transition-fast);
    position: relative;
    overflow: hidden;
    letter-spacing: 0.2px;
  }

  button::before, .btn::before {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent);
    transition: left 0.5s;
  }

  button:hover::before, .btn:hover::before {
    left: 100%;
  }

  button:hover, .btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px var(--accent-glow);
  }

  button:active, .btn:active {
    transform: translateY(0);
  }

  button.danger, .btn.danger {
    background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
    box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
  }

  button.danger:hover, .btn.danger:hover {
    box-shadow: 0 6px 20px rgba(239, 68, 68, 0.4);
  }

  button.success, .btn.success {
    background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
    box-shadow: 0 4px 12px rgba(34, 197, 94, 0.3);
  }

  button.warning, .btn.warning {
    background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
    box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3);
  }

  button.small, .btn.small {
    padding: 8px 16px;
    font-size: 0.825rem;
  }

  button.secondary, .btn.secondary {
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    color: var(--text-secondary);
    box-shadow: none;
  }

  button.secondary:hover, .btn.secondary:hover {
    background: var(--bg-hover);
    border-color: var(--border-light);
    color: var(--text-primary);
    transform: translateY(-2px);
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none !important;
  }

  /* Cards */
  .card {
    background: linear-gradient(135deg, var(--bg-card) 0%, var(--bg-secondary) 100%);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    padding: 24px;
    margin: 20px 0;
    box-shadow: var(--shadow-md);
    transition: all var(--transition-normal);
  }

  .card:hover {
    border-color: var(--border-light);
    box-shadow: var(--shadow-lg);
  }

  /* Grid layouts */
  .row {
    display: grid;
    gap: 20px;
    margin: 0 -10px;
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
    padding: 0 10px;
  }

  /* Flash messages */
  .flash {
    padding: 16px 20px;
    border-radius: var(--radius-md);
    margin: 20px 0;
    display: flex;
    align-items: center;
    gap: 12px;
    border-left: 4px solid;
    animation: slideIn 0.3s ease;
  }

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
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
    padding: 4px 12px;
    border-radius: 20px;
    font-size: 0.725rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .badge.active {
    background: var(--success-bg);
    color: var(--success-text);
    border: 1px solid var(--success-border);
  }

  .badge.inactive {
    background: var(--error-bg);
    color: var(--error-text);
    border: 1px solid var(--error-border);
  }

  .badge.warning {
    background: var(--warning-bg);
    color: var(--warning-text);
    border: 1px solid var(--warning-border);
  }

  .badge.info {
    background: var(--info-bg);
    color: var(--info-text);
    border: 1px solid var(--info-border);
  }

  /* Stats cards */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 20px;
    margin: 20px 0;
  }

  .stat-card {
    background: linear-gradient(135deg, var(--bg-card) 0%, var(--bg-secondary) 100%);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    padding: 24px;
    text-align: center;
    box-shadow: var(--shadow-md);
    transition: all var(--transition-normal);
    position: relative;
    overflow: hidden;
  }

  .stat-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: linear-gradient(90deg, var(--accent-primary), var(--success-text), var(--warning-text));
    opacity: 0;
    transition: opacity var(--transition-normal);
  }

  .stat-card:hover {
    transform: translateY(-4px);
    box-shadow: var(--shadow-lg);
    border-color: var(--border-light);
  }

  .stat-card:hover::before {
    opacity: 1;
  }

  .stat-value {
    font-size: 2.25rem;
    font-weight: 700;
    background: linear-gradient(135deg, var(--accent-primary) 0%, var(--success-text) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    margin-bottom: 8px;
    letter-spacing: -1px;
  }

  .stat-label {
    color: var(--text-secondary);
    font-size: 0.875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  /* Tables */
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 16px 0;
    background: var(--bg-secondary);
    border-radius: var(--radius-md);
    overflow: hidden;
  }

  th, td {
    padding: 14px 16px;
    text-align: left;
    border-bottom: 1px solid var(--border-color);
  }

  th {
    background: var(--bg-card);
    color: var(--text-secondary);
    font-weight: 600;
    font-size: 0.775rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  tr:last-child td {
    border-bottom: none;
  }

  tr:hover td {
    background: var(--bg-hover);
  }

  /* Pre/code blocks */
  pre {
    white-space: pre-wrap;
    word-break: break-all;
    background: var(--bg-input);
    padding: 16px;
    border-radius: var(--radius-md);
    font-size: 0.825rem;
    color: var(--text-secondary);
    border: 1px solid var(--border-color);
    overflow-x: auto;
    font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
    line-height: 1.5;
  }

  code {
    background: var(--bg-input);
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 0.85em;
    font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
    color: var(--text-secondary);
    border: 1px solid var(--border-color);
  }

  /* Muted text */
  .muted {
    color: var(--text-muted);
    font-size: 0.875rem;
  }

  /* Loading spinner */
  .spinner {
    width: 24px;
    height: 24px;
    border: 3px solid var(--border-color);
    border-top-color: var(--accent-primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Scrollbar - Modern Dark */
  ::-webkit-scrollbar {
    width: 10px;
    height: 10px;
  }

  ::-webkit-scrollbar-track {
    background: var(--bg-primary);
  }

  ::-webkit-scrollbar-thumb {
    background: var(--border-light);
    border-radius: 5px;
    border: 2px solid var(--bg-primary);
  }

  ::-webkit-scrollbar-thumb:hover {
    background: var(--text-muted);
  }

  /* Animations */
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .fade-in {
    animation: fadeIn 0.3s ease;
  }

  /* Responsive */
  @media (max-width: 768px) {
    main {
      padding: 20px 16px;
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
      gap: 16px;
      text-align: center;
    }

    h1 { font-size: 1.5rem; }
    h2 { font-size: 1.15rem; }
    
    .stats-grid {
      grid-template-columns: 1fr;
    }

    .stat-value {
      font-size: 2rem;
    }
  }

  /* Selection */
  ::selection {
    background: var(--accent-primary);
    color: #fff;
  }

  /* Links */
  a {
    color: var(--accent-primary);
    text-decoration: none;
    transition: color var(--transition-fast);
  }

  a:hover {
    color: var(--accent-hover);
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
      <div class="card" style="max-width:460px;margin:80px auto;padding:40px;">
        <div style="text-align:center;margin-bottom:32px;">
          <div style="width:72px;height:72px;background:linear-gradient(135deg, var(--accent-primary) 0%, #1d4ed8 100%);border-radius:16px;display:flex;align-items:center;justify-content:center;font-size:36px;margin:0 auto 20px;box-shadow:0 8px 24px var(--accent-glow);">
            🔐
          </div>
          <h2 style="border:none;margin:0;font-size:1.6rem;font-weight:700;">Admin Login</h2>
          <p class="muted" style="margin-top:8px;font-size:0.925rem;">Enter your credentials to access the panel</p>
        </div>
        
        ${error ? `<div class="flash error">⚠️ ${escHtml(error)}</div>` : ""}
        ${success ? `<div class="flash success">✓ ${escHtml(success)}</div>` : ""}
        
        <form method="POST" action="/admin/ava_brain/login" style="margin-top:24px;">
          <label for="username">Username</label>
          <input type="text" id="username" name="username" required autocomplete="username" 
                 placeholder="Enter your username" style="padding:14px 16px;">
          
          <label for="password" style="margin-top:16px;">Password</label>
          <input type="password" id="password" name="password" required autocomplete="current-password" 
                 placeholder="Enter your password" style="padding:14px 16px;">
          
          <button type="submit" style="width:100%;margin-top:24px;padding:14px;font-size:1rem;font-weight:600;">
            Sign In →
          </button>
        </form>
        
        <p class="muted" style="text-align:center;margin-top:24px;font-size:0.8rem;">
          🔒 Protected by AVA Brain Security System
        </p>
      </div>`,
    session: null,
  });
}

export function changePasswordForm(error, success = null) {
  return layout({
    title: "Change Password",
    content: `
      <div class="card" style="max-width:460px;margin:80px auto;padding:40px;">
        <div style="text-align:center;margin-bottom:32px;">
          <div style="width:72px;height:72px;background:linear-gradient(135deg, #22c55e 0%, #16a34a 100%);border-radius:16px;display:flex;align-items:center;justify-content:center;font-size:36px;margin:0 auto 20px;box-shadow:0 8px 24px rgba(34, 197, 94, 0.3);">
            ✨
          </div>
          <h2 style="border:none;margin:0;font-size:1.6rem;font-weight:700;">Set New Password</h2>
          <p class="muted" style="margin-top:8px;font-size:0.925rem;">First login — please set a strong password</p>
        </div>
        
        ${error ? `<div class="flash error">⚠️ ${escHtml(error)}</div>` : ""}
        ${success ? `<div class="flash success">✓ ${escHtml(success)}</div>` : ""}
        
        <form method="POST" action="/admin/ava_brain/login" style="margin-top:24px;">
          <input type="hidden" name="action" value="change_password">
          
          <label for="new_password">New Password</label>
          <input type="password" id="new_password" name="new_password" required minlength="8" autocomplete="new-password" 
                 placeholder="Minimum 8 characters" style="padding:14px 16px;">
          
          <label for="confirm_password" style="margin-top:16px;">Confirm Password</label>
          <input type="password" id="confirm_password" name="confirm_password" required minlength="8" autocomplete="new-password" 
                 placeholder="Re-enter your password" style="padding:14px 16px;">
          
          <button type="submit" style="width:100%;margin-top:24px;padding:14px;font-size:1rem;font-weight:600;background:linear-gradient(135deg, #22c55e 0%, #16a34a 100%);box-shadow:0 4px 12px rgba(34, 197, 94, 0.3);">
            Set Password →
          </button>
        </form>
        
        <div class="card" style="background:var(--bg-input);margin-top:24px;padding:18px;border:1px solid var(--border-color);">
          <p style="font-size:0.825rem;color:var(--text-secondary);font-weight:600;margin-bottom:10px;"><strong>🛡️ Password Requirements:</strong></p>
          <ul style="font-size:0.825rem;color:var(--text-muted);margin:0;padding-left:20px;line-height:1.8;">
            <li>Minimum 8 characters</li>
            <li>Use a mix of letters, numbers, and symbols</li>
            <li>Avoid common passwords</li>
            <li>Make it unique and memorable</li>
          </ul>
        </div>
      </div>`,
    session: null,
  });
}