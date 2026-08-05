// Modern HTML helpers for server-rendered admin panel with professional UI/UX
// Features: Dark theme, smooth animations, responsive design, modern form elements

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
    --bg-primary: #0a0e1a;
    --bg-secondary: #111827;
    --bg-card: #1f2937;
    --bg-input: #374151;
    --border-color: #374151;
    --text-primary: #f9fafb;
    --text-secondary: #9ca3af;
    --text-muted: #6b7280;
    --accent-primary: #6366f1;
    --accent-hover: #818cf8;
    --accent-glow: rgba(99, 102, 241, 0.3);
    --success-bg: #064e3b;
    --success-text: #34d399;
    --success-border: #059669;
    --error-bg: #7f1d1d;
    --error-text: #f87171;
    --error-border: #dc2626;
    --warning-bg: #78350f;
    --warning-text: #fbbf24;
    --warning-border: #d97706;
    --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
    --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
    --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
    --shadow-glow: 0 0 20px var(--accent-glow);
    --radius-sm: 6px;
    --radius-md: 8px;
    --radius-lg: 12px;
    --transition-fast: 150ms ease;
    --transition-normal: 250ms ease;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }
  
  html { scroll-behavior: smooth; }
  
  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
    background: linear-gradient(135deg, var(--bg-primary) 0%, #0f172a 100%);
    color: var(--text-primary);
    line-height: 1.6;
    min-height: 100vh;
    padding: 0;
  }

  /* Animated background */
  body::before {
    content: '';
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: 
      radial-gradient(circle at 20% 80%, rgba(99, 102, 241, 0.08) 0%, transparent 50%),
      radial-gradient(circle at 80% 20%, rgba(139, 92, 246, 0.08) 0%, transparent 50%);
    pointer-events: none;
    z-index: -1;
  }

  /* Header & Logo */
  header {
    background: rgba(17, 24, 39, 0.8);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid var(--border-color);
    padding: 20px 0;
    position: sticky;
    top: 0;
    z-index: 100;
  }

  .header-content {
    max-width: 1400px;
    margin: 0 auto;
    padding: 0 20px;
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
    width: 40px;
    height: 40px;
    background: linear-gradient(135deg, var(--accent-primary), #8b5cf6);
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    box-shadow: var(--shadow-glow);
    animation: pulse 2s infinite;
  }

  @keyframes pulse {
    0%, 100% { box-shadow: 0 0 20px var(--accent-glow); }
    50% { box-shadow: 0 0 30px var(--accent-glow), 0 0 10px rgba(139, 92, 246, 0.3); }
  }

  .logo-text {
    font-size: 1.5rem;
    font-weight: 700;
    background: linear-gradient(135deg, #fff, #a5b4fc);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  h1 {
    color: var(--text-primary);
    margin-bottom: 24px;
    font-size: 1.75rem;
    font-weight: 700;
    letter-spacing: -0.025em;
  }

  h2 {
    color: var(--text-primary);
    margin: 24px 0 16px;
    font-size: 1.25rem;
    font-weight: 600;
    padding-bottom: 8px;
    border-bottom: 2px solid var(--accent-primary);
    display: inline-block;
  }

  h3 {
    color: var(--text-primary);
    margin: 16px 0 12px;
    font-size: 1.1rem;
    font-weight: 600;
  }

  /* Navigation */
  nav {
    margin-bottom: 32px;
    padding: 16px 20px;
    background: var(--bg-secondary);
    border-radius: var(--radius-lg);
    border: 1px solid var(--border-color);
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    box-shadow: var(--shadow-md);
  }

  nav a {
    color: var(--text-secondary);
    text-decoration: none;
    padding: 10px 18px;
    border-radius: var(--radius-md);
    transition: all var(--transition-fast);
    font-weight: 500;
    font-size: 0.9rem;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  nav a:hover {
    background: var(--accent-primary);
    color: #fff;
    transform: translateY(-2px);
    box-shadow: var(--shadow-glow);
  }

  nav a.active {
    background: var(--accent-primary);
    color: #fff;
    box-shadow: var(--shadow-glow);
  }

  /* Main container */
  main {
    max-width: 1400px;
    margin: 0 auto;
    padding: 40px 20px;
  }

  /* Forms */
  form {
    margin: 20px 0;
  }

  label {
    display: block;
    margin: 12px 0 6px;
    color: var(--text-secondary);
    font-size: 0.875rem;
    font-weight: 500;
    transition: color var(--transition-fast);
  }

  label:hover {
    color: var(--text-primary);
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
    border: 2px solid var(--border-color);
    border-radius: var(--radius-md);
    color: var(--text-primary);
    font-size: 0.95rem;
    transition: all var(--transition-fast);
    font-family: inherit;
  }

  input:focus,
  textarea:focus,
  select:focus {
    outline: none;
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 3px var(--accent-glow);
    background: var(--bg-card);
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
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%239ca3af'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 12px center;
    background-size: 18px;
    padding-right: 44px;
  }

  input[type="checkbox"] {
    width: 18px;
    height: 18px;
    margin-right: 8px;
    accent-color: var(--accent-primary);
    cursor: pointer;
    vertical-align: middle;
  }

  label:has(input[type="checkbox"]) {
    display: inline-flex;
    align-items: center;
    cursor: pointer;
    margin: 12px 0;
    padding: 8px 12px;
    border-radius: var(--radius-sm);
    transition: background var(--transition-fast);
  }

  label:has(input[type="checkbox"]):hover {
    background: var(--bg-card);
  }

  /* Buttons */
  button, .btn {
    padding: 12px 24px;
    background: linear-gradient(135deg, var(--accent-primary), #8b5cf6);
    color: #fff;
    border: none;
    border-radius: var(--radius-md);
    cursor: pointer;
    font-size: 0.95rem;
    font-weight: 600;
    transition: all var(--transition-fast);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    text-decoration: none;
    box-shadow: var(--shadow-md);
  }

  button:hover, .btn:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-lg), var(--shadow-glow);
    filter: brightness(1.1);
  }

  button:active, .btn:active {
    transform: translateY(0);
  }

  button.danger, .btn.danger {
    background: linear-gradient(135deg, #dc2626, #ef4444);
  }

  button.danger:hover, .btn.danger:hover {
    box-shadow: var(--shadow-lg), 0 0 20px rgba(220, 38, 38, 0.3);
  }

  button.success, .btn.success {
    background: linear-gradient(135deg, #059669, #10b981);
  }

  button.warning, .btn.warning {
    background: linear-gradient(135deg, #d97706, #f59e0b);
  }

  button.small, .btn.small {
    padding: 8px 16px;
    font-size: 0.85rem;
  }

  button.secondary, .btn.secondary {
    background: var(--bg-card);
    border: 2px solid var(--border-color);
  }

  button.secondary:hover, .btn.secondary:hover {
    background: var(--bg-input);
    border-color: var(--accent-primary);
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }

  /* Cards */
  .card {
    background: linear-gradient(135deg, var(--bg-card), var(--bg-secondary));
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    padding: 24px;
    margin: 20px 0;
    box-shadow: var(--shadow-md);
    transition: all var(--transition-normal);
    position: relative;
    overflow: hidden;
  }

  .card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: linear-gradient(90deg, var(--accent-primary), #8b5cf6);
    opacity: 0;
    transition: opacity var(--transition-normal);
  }

  .card:hover {
    transform: translateY(-4px);
    box-shadow: var(--shadow-lg);
    border-color: var(--accent-primary);
  }

  .card:hover::before {
    opacity: 1;
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
    animation: slideIn 0.3s ease;
    border-left: 4px solid;
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
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
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
    background: rgba(99, 102, 241, 0.2);
    color: var(--accent-hover);
  }

  /* Stats cards */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 20px;
    margin: 20px 0;
  }

  .stat-card {
    background: linear-gradient(135deg, var(--bg-card), var(--bg-secondary));
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    padding: 24px;
    text-align: center;
    transition: all var(--transition-normal);
  }

  .stat-card:hover {
    transform: translateY(-4px);
    border-color: var(--accent-primary);
    box-shadow: var(--shadow-lg);
  }

  .stat-value {
    font-size: 2.5rem;
    font-weight: 700;
    background: linear-gradient(135deg, var(--accent-primary), #8b5cf6);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    margin-bottom: 8px;
  }

  .stat-label {
    color: var(--text-secondary);
    font-size: 0.9rem;
    font-weight: 500;
  }

  /* Tables */
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 16px 0;
  }

  th, td {
    padding: 14px 16px;
    text-align: left;
    border-bottom: 1px solid var(--border-color);
  }

  th {
    background: var(--bg-secondary);
    color: var(--text-secondary);
    font-weight: 600;
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  tr:hover td {
    background: var(--bg-card);
  }

  /* Pre/code blocks */
  pre {
    white-space: pre-wrap;
    word-break: break-all;
    background: var(--bg-primary);
    padding: 16px;
    border-radius: var(--radius-md);
    font-size: 0.85rem;
    color: var(--text-secondary);
    border: 1px solid var(--border-color);
    overflow-x: auto;
    font-family: 'Fira Code', 'Consolas', monospace;
  }

  code {
    background: var(--bg-input);
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 0.85em;
    font-family: 'Fira Code', 'Consolas', monospace;
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

  /* Scrollbar */
  ::-webkit-scrollbar {
    width: 10px;
    height: 10px;
  }

  ::-webkit-scrollbar-track {
    background: var(--bg-secondary);
  }

  ::-webkit-scrollbar-thumb {
    background: var(--bg-input);
    border-radius: 5px;
  }

  ::-webkit-scrollbar-thumb:hover {
    background: var(--accent-primary);
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
    h2 { font-size: 1.1rem; }
    
    .stats-grid {
      grid-template-columns: 1fr;
    }
  }

  /* Animations */
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .fade-in {
    animation: fadeIn 0.4s ease;
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
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Fira+Code:wght@400;500&display=swap" rel="stylesheet">
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
  <main class="fade-in">
    ${nav}
    ${content}
  </main>
  <script>
    // Add smooth transitions and interactions
    document.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('mouseenter', function() {
        this.style.transform = 'translateY(-2px)';
      });
      btn.addEventListener('mouseleave', function() {
        this.style.transform = 'translateY(0)';
      });
    });
  </script>
</body>
</html>`;
}

export function loginForm(error, success = null) {
  return layout({
    title: "Login",
    content: `
      <div class="card" style="max-width:420px;margin:60px auto;padding:40px;">
        <div style="text-align:center;margin-bottom:32px;">
          <div style="width:80px;height:80px;background:linear-gradient(135deg, var(--accent-primary), #8b5cf6);border-radius:20px;display:flex;align-items:center;justify-content:center;font-size:40px;margin:0 auto 20px;box-shadow:var(--shadow-glow);animation:pulse 2s infinite;">
            🔐
          </div>
          <h2 style="border:none;margin:0;font-size:1.5rem;">Admin Login</h2>
          <p class="muted" style="margin-top:8px;">Enter your credentials to access the panel</p>
        </div>
        
        ${error ? `<div class="flash error">⚠️ ${escHtml(error)}</div>` : ""}
        ${success ? `<div class="flash success">✓ ${escHtml(success)}</div>` : ""}
        
        <form method="POST" action="/admin/ava_brain/login" style="margin-top:24px;">
          <label for="username">Username</label>
          <div style="position:relative;">
            <input type="text" id="username" name="username" required autocomplete="username" 
                   placeholder="Enter your username" 
                   style="padding-left:44px;">
            <span style="position:absolute;left:14px;top:50%;transform:translateY(-50%);color:var(--text-muted);">👤</span>
          </div>
          
          <label for="password" style="margin-top:16px;">Password</label>
          <div style="position:relative;">
            <input type="password" id="password" name="password" required autocomplete="current-password" 
                   placeholder="Enter your password"
                   style="padding-left:44px;">
            <span style="position:absolute;left:14px;top:50%;transform:translateY(-50%);color:var(--text-muted);">🔒</span>
          </div>
          
          <button type="submit" style="width:100%;margin-top:24px;padding:14px;font-size:1rem;">
            Sign In →
          </button>
        </form>
        
        <p class="muted" style="text-align:center;margin-top:24px;font-size:0.85rem;">
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
      <div class="card" style="max-width:420px;margin:60px auto;padding:40px;">
        <div style="text-align:center;margin-bottom:32px;">
          <div style="width:80px;height:80px;background:linear-gradient(135deg, #059669, #10b981);border-radius:20px;display:flex;align-items:center;justify-content:center;font-size:40px;margin:0 auto 20px;box-shadow:0 0 20px rgba(5, 150, 105, 0.3);animation:pulse 2s infinite;">
            ✨
          </div>
          <h2 style="border:none;margin:0;font-size:1.5rem;">Set New Password</h2>
          <p class="muted" style="margin-top:8px;">First login — please set a strong password</p>
        </div>
        
        ${error ? `<div class="flash error">⚠️ ${escHtml(error)}</div>` : ""}
        ${success ? `<div class="flash success">✓ ${escHtml(success)}</div>` : ""}
        
        <form method="POST" action="/admin/ava_brain/login" style="margin-top:24px;">
          <input type="hidden" name="action" value="change_password">
          
          <label for="new_password">New Password</label>
          <div style="position:relative;">
            <input type="password" id="new_password" name="new_password" required minlength="8" autocomplete="new-password" 
                   placeholder="Minimum 8 characters"
                   style="padding-left:44px;">
            <span style="position:absolute;left:14px;top:50%;transform:translateY(-50%);color:var(--text-muted);">🔑</span>
          </div>
          
          <label for="confirm_password" style="margin-top:16px;">Confirm Password</label>
          <div style="position:relative;">
            <input type="password" id="confirm_password" name="confirm_password" required minlength="8" autocomplete="new-password" 
                   placeholder="Re-enter your password"
                   style="padding-left:44px;">
            <span style="position:absolute;left:14px;top:50%;transform:translateY(-50%);color:var(--text-muted);">✓</span>
          </div>
          
          <button type="submit" style="width:100%;margin-top:24px;padding:14px;font-size:1rem;background:linear-gradient(135deg, #059669, #10b981);">
            Set Password →
          </button>
        </form>
        
        <div class="card" style="background:var(--bg-primary);margin-top:24px;padding:16px;">
          <p style="font-size:0.85rem;color:var(--text-secondary);"><strong>Password Requirements:</strong></p>
          <ul style="font-size:0.85rem;color:var(--text-muted);margin-top:8px;padding-left:20px;">
            <li>Minimum 8 characters</li>
            <li>Use a mix of letters, numbers, and symbols</li>
            <li>Avoid common passwords</li>
          </ul>
        </div>
      </div>`,
    session: null,
  });
}