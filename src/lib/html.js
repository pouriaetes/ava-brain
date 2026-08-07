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

// Professional SVG icon system
const icons = {
  dashboard: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>`,
  settings: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`,
  api: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>`,
  memory: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>`,
  tasks: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"></path><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>`,
  logs: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`,
  logout: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>`,
  brain: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a6 6 0 0 0-6 6c0 2.22 1.21 4.15 3 5.19V15a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-1.81c1.79-1.04 3-2.97 3-5.19a6 6 0 0 0-6-6z"></path><path d="M10 15v2a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2v-2"></path><line x1="12" y1="7" x2="12" y2="10"></line></svg>`,
  lock: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`,
  check: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
  warning: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`,
  error: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`,
  plus: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`,
  edit: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`,
  trash: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`,
  test: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`,
  enable: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`,
  disable: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>`,
};

const baseStyles = `
  :root {
    /* Dark Theme Color Palette - Professional */
    --bg-primary: #0f1117;
    --bg-secondary: #161822;
    --bg-card: #1c1f2e;
    --bg-input: #12141d;
    --bg-hover: #232738;

    --border-color: #2a2e3f;
    --border-light: #3a3f54;

    --text-primary: #f0f2f5;
    --text-secondary: #a0a6b8;
    --text-muted: #6b7280;

    --accent-primary: #6366f1;
    --accent-hover: #5558e6;
    --accent-glow: rgba(99, 102, 241, 0.15);

    --success-bg: rgba(34, 197, 94, 0.12);
    --success-text: #4ade80;
    --success-border: rgba(34, 197, 94, 0.3);

    --error-bg: rgba(239, 68, 68, 0.12);
    --error-text: #f87171;
    --error-border: rgba(239, 68, 68, 0.3);

    --warning-bg: rgba(245, 158, 11, 0.12);
    --warning-text: #fbbf24;
    --warning-border: rgba(245, 158, 11, 0.3);

    --info-bg: rgba(59, 130, 246, 0.12);
    --info-text: #60a5fa;
    --info-border: rgba(59, 130, 246, 0.3);

    --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.3);
    --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.4);
    --shadow-lg: 0 12px 24px rgba(0, 0, 0, 0.5);
    --shadow-glow: 0 0 24px rgba(99, 102, 241, 0.2);

    --radius-sm: 6px;
    --radius-md: 8px;
    --radius-lg: 12px;
    --radius-xl: 16px;

    --transition-fast: 0.15s ease;
    --transition-normal: 0.2s ease;
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

  html {
    scroll-behavior: smooth;
  }

  /* Header */
  header {
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border-color);
    padding: 16px 0;
    position: sticky;
    top: 0;
    z-index: 100;
    box-shadow: var(--shadow-sm);
  }

  .header-content {
    max-width: 1400px;
    margin: 0 auto;
    padding: 0 32px;
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
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
  }

  .logo-text {
    font-size: 1.15rem;
    font-weight: 700;
    color: var(--text-primary);
    letter-spacing: -0.3px;
  }

  .logo-version {
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--text-muted);
    letter-spacing: 0.5px;
    padding: 3px 8px;
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    margin-left: 8px;
  }

  .header-user {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .header-username {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-secondary);
  }

  /* Navigation */
  nav {
    margin-bottom: 32px;
    padding: 6px;
    background: var(--bg-secondary);
    border-radius: var(--radius-lg);
    border: 1px solid var(--border-color);
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
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
    background: transparent;
  }

  nav a svg {
    opacity: 0.7;
    transition: opacity var(--transition-fast);
  }

  nav a:hover {
    color: var(--text-primary);
    background: var(--bg-hover);
  }

  nav a:hover svg {
    opacity: 1;
  }

  nav a.active {
    background: var(--accent-primary);
    color: #fff;
    box-shadow: 0 2px 8px var(--accent-glow);
  }

  nav a.active svg {
    opacity: 1;
  }

  nav a.logout-link {
    margin-left: auto;
    color: var(--error-text);
  }

  nav a.logout-link:hover {
    background: var(--error-bg);
  }

  /* Main container */
  main {
    max-width: 1400px;
    margin: 0 auto;
    padding: 40px 32px;
  }

  /* Headings */
  h1 {
    color: var(--text-primary);
    margin-bottom: 24px;
    font-size: 1.75rem;
    font-weight: 700;
    letter-spacing: -0.5px;
  }

  h2 {
    color: var(--text-primary);
    margin: 0 0 20px;
    font-size: 1.25rem;
    font-weight: 600;
    letter-spacing: -0.3px;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  h2 svg {
    color: var(--accent-primary);
  }

  h3 {
    color: var(--text-primary);
    margin: 0 0 16px;
    font-size: 1rem;
    font-weight: 600;
    letter-spacing: -0.2px;
  }

  /* Forms */
  form {
    margin: 16px 0;
  }

  label {
    display: block;
    margin: 16px 0 8px;
    color: var(--text-secondary);
    font-size: 0.875rem;
    font-weight: 500;
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
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236b7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E");
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
    padding: 10px 20px;
    background: var(--accent-primary);
    color: #fff;
    border: none;
    border-radius: var(--radius-md);
    cursor: pointer;
    font-size: 0.875rem;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    text-decoration: none;
    transition: all var(--transition-fast);
    letter-spacing: 0.2px;
  }

  button:hover, .btn:hover {
    background: var(--accent-hover);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px var(--accent-glow);
  }

  button:active, .btn:active {
    transform: translateY(0);
  }

  button.danger, .btn.danger {
    background: var(--error-text);
  }

  button.danger:hover, .btn.danger:hover {
    background: #ef4444;
    box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
  }

  button.success, .btn.success {
    background: var(--success-text);
    color: #000;
  }

  button.success:hover, .btn.success:hover {
    background: #22c55e;
    box-shadow: 0 4px 12px rgba(34, 197, 94, 0.3);
  }

  button.warning, .btn.warning {
    background: var(--warning-text);
    color: #000;
  }

  button.small, .btn.small {
    padding: 8px 14px;
    font-size: 0.8125rem;
  }

  button.secondary, .btn.secondary {
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    color: var(--text-secondary);
  }

  button.secondary:hover, .btn.secondary:hover {
    background: var(--bg-hover);
    border-color: var(--border-light);
    color: var(--text-primary);
    box-shadow: none;
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none !important;
  }

  /* Cards */
  .card {
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    padding: 24px;
    margin-bottom: 20px;
  }

  /* Grid layouts */
  .row {
    display: grid;
    gap: 20px;
  }

  .row.cols-2 { grid-template-columns: repeat(2, 1fr); }
  .row.cols-3 { grid-template-columns: repeat(3, 1fr); }
  .row.cols-4 { grid-template-columns: repeat(4, 1fr); }

  @media (max-width: 768px) {
    .row, .row.cols-2, .row.cols-3, .row.cols-4 {
      grid-template-columns: 1fr;
    }
  }

  /* Flash messages */
  .flash {
    padding: 14px 18px;
    border-radius: var(--radius-md);
    margin-bottom: 20px;
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 0.875rem;
    font-weight: 500;
  }

  .flash.success {
    background: var(--success-bg);
    color: var(--success-text);
    border: 1px solid var(--success-border);
  }

  .flash.error {
    background: var(--error-bg);
    color: var(--error-text);
    border: 1px solid var(--error-border);
  }

  .flash.warning {
    background: var(--warning-bg);
    color: var(--warning-text);
    border: 1px solid var(--warning-border);
  }

  /* Badges */
  .badge {
    display: inline-flex;
    align-items: center;
    padding: 4px 10px;
    border-radius: var(--radius-sm);
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .badge.active, .badge.healthy {
    background: var(--success-bg);
    color: var(--success-text);
    border: 1px solid var(--success-border);
  }

  .badge.inactive, .badge.unhealthy {
    background: var(--error-bg);
    color: var(--error-text);
    border: 1px solid var(--error-border);
  }

  .badge.warning, .badge.unknown {
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
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 20px;
    margin-bottom: 32px;
  }

  .stat-card {
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    padding: 20px;
    text-align: center;
  }

  .stat-value {
    font-size: 2rem;
    font-weight: 700;
    color: var(--text-primary);
    margin-bottom: 4px;
    letter-spacing: -0.5px;
  }

  .stat-label {
    color: var(--text-muted);
    font-size: 0.8125rem;
    font-weight: 500;
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
    padding: 12px 16px;
    text-align: left;
    border-bottom: 1px solid var(--border-color);
  }

  th {
    background: var(--bg-card);
    color: var(--text-muted);
    font-weight: 600;
    font-size: 0.75rem;
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
    padding: 14px;
    border-radius: var(--radius-md);
    font-size: 0.8125rem;
    color: var(--text-secondary);
    border: 1px solid var(--border-color);
    overflow-x: auto;
    font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
    line-height: 1.5;
  }

  code {
    background: var(--bg-input);
    padding: 2px 6px;
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

  /* Scrollbar */
  ::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }

  ::-webkit-scrollbar-track {
    background: var(--bg-primary);
  }

  ::-webkit-scrollbar-thumb {
    background: var(--border-light);
    border-radius: 4px;
  }

  ::-webkit-scrollbar-thumb:hover {
    background: var(--text-muted);
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

  /* Responsive */
  @media (max-width: 768px) {
    main {
      padding: 24px 16px;
    }

    .header-content {
      flex-direction: column;
      gap: 12px;
    }

    nav {
      flex-direction: column;
    }

    nav a {
      width: 100%;
      justify-content: center;
    }

    nav a.logout-link {
      margin-left: 0;
    }

    h1 { font-size: 1.5rem; }
    h2 { font-size: 1.125rem; }

    .stats-grid {
      grid-template-columns: 1fr;
    }

    .stat-value {
      font-size: 1.75rem;
    }
  }

  /* Capability groups */
  .capability-group {
    margin-bottom: 16px;
    padding: 16px;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
  }

  .capability-group-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 12px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .capability-group-items {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
  }

  .capability-group-future {
    opacity: 0.5;
  }

  .disabled-capability {
    cursor: not-allowed;
  }

  /* Provider cards */
  .provider-card {
    border-left: 3px solid var(--border-color);
    transition: border-color var(--transition-fast);
  }

  .provider-card.enabled {
    border-left-color: var(--success-text);
  }

  .provider-card.disabled {
    border-left-color: var(--text-muted);
  }

  .provider-summary {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
    flex-wrap: wrap;
  }

  .provider-info {
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex: 1;
    min-width: 200px;
  }

  .provider-header {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }

  .provider-name {
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .provider-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    font-size: 0.8125rem;
    color: var(--text-muted);
  }

  .provider-meta-item {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .provider-meta-separator {
    color: var(--border-light);
  }

  .provider-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    align-items: center;
  }

  .provider-edit-form {
    margin-top: 20px;
    padding-top: 20px;
    border-top: 1px solid var(--border-color);
  }
`;

export function layout({ title, content, session, currentPage = "" }) {
  const navItems = [
    { href: "/admin/ava_brain/dashboard", label: "Dashboard", icon: icons.dashboard },
    { href: "/admin/ava_brain/settings", label: "Settings", icon: icons.settings },
    { href: "/admin/ava_brain/apis", label: "APIs", icon: icons.api },
    { href: "/admin/ava_brain/memory", label: "Memory", icon: icons.memory },
    { href: "/admin/ava_brain/tasks", label: "Tasks", icon: icons.tasks },
    { href: "/admin/ava_brain/logs", label: "Logs", icon: icons.logs },
  ];

  const nav = session
    ? `
    <nav>
      ${navItems.map(item => `
        <a href="${item.href}" class="${currentPage === item.href ? "active" : ""}">
          ${item.icon} ${item.label}
        </a>
      `).join("")}
      <a href="/admin/ava_brain/logout" class="logout-link">
        ${icons.logout} Logout
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
        <div class="logo-icon">${icons.brain}</div>
        <span class="logo-text">AVA Brain</span>
        <span class="logo-version">v2.1.5</span>
      </a>
      ${session ? `
        <div class="header-user">
          <span class="header-username">Welcome, ${escHtml(session.username)}</span>
        </div>
      ` : ""}
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
      <div class="card" style="max-width:420px;margin:80px auto;padding:40px;">
        <div style="text-align:center;margin-bottom:32px;">
          <div style="width:64px;height:64px;background:var(--accent-primary);border-radius:var(--radius-lg);display:flex;align-items:center;justify-content:center;margin:0 auto 20px;color:white;">
            ${icons.lock}
          </div>
          <h2 style="margin:0;font-size:1.5rem;font-weight:700;">Admin Login</h2>
          <p class="muted" style="margin-top:8px;">Enter your credentials to access the panel</p>
        </div>

        ${error ? `<div class="flash error">${icons.error} ${escHtml(error)}</div>` : ""}
        ${success ? `<div class="flash success">${icons.check} ${escHtml(success)}</div>` : ""}

        <form method="POST" action="/admin/ava_brain/login">
          <label for="username">Username</label>
          <input type="text" id="username" name="username" required autocomplete="username"
                 placeholder="Enter your username">

          <label for="password">Password</label>
          <input type="password" id="password" name="password" required autocomplete="current-password"
                 placeholder="Enter your password">

          <button type="submit" style="width:100%;margin-top:24px;">
            Sign In
          </button>
        </form>

        <p class="muted" style="text-align:center;margin-top:24px;font-size:0.8rem;">
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
      <div class="card" style="max-width:420px;margin:80px auto;padding:40px;">
        <div style="text-align:center;margin-bottom:32px;">
          <div style="width:64px;height:64px;background:var(--success-text);border-radius:var(--radius-lg);display:flex;align-items:center;justify-content:center;margin:0 auto 20px;color:#000;">
            ${icons.check}
          </div>
          <h2 style="margin:0;font-size:1.5rem;font-weight:700;">Set New Password</h2>
          <p class="muted" style="margin-top:8px;">First login — please set a strong password</p>
        </div>

        ${error ? `<div class="flash error">${icons.error} ${escHtml(error)}</div>` : ""}
        ${success ? `<div class="flash success">${icons.check} ${escHtml(success)}</div>` : ""}

        <form method="POST" action="/admin/ava_brain/login">
          <input type="hidden" name="action" value="change_password">

          <label for="new_password">New Password</label>
          <input type="password" id="new_password" name="new_password" required minlength="8" autocomplete="new-password"
                 placeholder="Minimum 8 characters">

          <label for="confirm_password">Confirm Password</label>
          <input type="password" id="confirm_password" name="confirm_password" required minlength="8" autocomplete="new-password"
                 placeholder="Re-enter your password">

          <button type="submit" style="width:100%;margin-top:24px;background:var(--success-text);color:#000;">
            Set Password
          </button>
        </form>

        <div class="card" style="background:var(--bg-input);margin-top:24px;padding:18px;border:1px solid var(--border-color);">
          <p style="font-size:0.8125rem;color:var(--text-secondary);font-weight:600;margin-bottom:10px;">Password Requirements:</p>
          <ul style="font-size:0.8125rem;color:var(--text-muted);margin:0;padding-left:20px;line-height:1.8;">
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
