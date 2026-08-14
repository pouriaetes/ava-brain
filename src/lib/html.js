// Professional HTML helpers for server-rendered admin panel
// Redesigned with Instagram-inspired minimalism: Less clutter, more clarity

export function escHtml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ---- Design Tokens ----
// Single source of truth for all visual values

const tokens = {
  // Colors
  colors: {
    bg: {
      primary: "#FAFAFA",
      secondary: "#FFFFFF",
      tertiary: "#F5F5F5",
    },
    text: {
      primary: "#1A1A1A",
      secondary: "#6B7280",
      muted: "#9CA3AF",
    },
    border: {
      default: "#E5E7EB",
      hover: "#D1D5DB",
    },
    accent: {
      primary: "#000000",
      hover: "#333333",
      subtle: "rgba(0, 0, 0, 0.04)",
    },
    status: {
      success: { bg: "#DCFCE7", text: "#166534", border: "#86EFAC" },
      error: { bg: "#FEE2E2", text: "#991B1B", border: "#FCA5A5" },
      warning: { bg: "#FEF3C7", text: "#92400E", border: "#FCD34D" },
      info: { bg: "#DBEAFE", text: "#1E40AF", border: "#93C5FD" },
    },
  },
  
  // Spacing scale (based on 4px unit)
  spacing: [0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64],
  
  // Typography
  type: {
    xs: { size: "0.75rem", line: "1rem", weight: 500 },
    sm: { size: "0.875rem", line: "1.25rem", weight: 400 },
    base: { size: "0.9375rem", line: "1.5rem", weight: 400 },
    lg: { size: "1.125rem", line: "1.75rem", weight: 600 },
    xl: { size: "1.25rem", line: "1.75rem", weight: 600 },
    "2xl": { size: "1.5rem", line: "2rem", weight: 700 },
  },
  
  // Radius
  radius: {
    sm: "6px",
    md: "8px",
    lg: "12px",
    full: "9999px",
  },
  
  // Shadows
  shadow: {
    sm: "0 1px 2px rgba(0,0,0,0.05)",
    md: "0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)",
    lg: "0 4px 6px rgba(0,0,0,0.07), 0 2px 4px rgba(0,0,0,0.06)",
  },
  
  // Transitions
  transition: {
    fast: "150ms ease",
    normal: "200ms ease",
  },
};

// ---- Base Styles ----

const baseStyles = `
  :root {
    /* Background */
    --bg-primary: ${tokens.colors.bg.primary};
    --bg-secondary: ${tokens.colors.bg.secondary};
    --bg-tertiary: ${tokens.colors.bg.tertiary};
    
    /* Text */
    --text-primary: ${tokens.colors.text.primary};
    --text-secondary: ${tokens.colors.text.secondary};
    --text-muted: ${tokens.colors.text.muted};
    
    /* Border */
    --border-default: ${tokens.colors.border.default};
    --border-hover: ${tokens.colors.border.hover};
    
    /* Accent */
    --accent-primary: ${tokens.colors.accent.primary};
    --accent-hover: ${tokens.colors.accent.hover};
    --accent-subtle: ${tokens.colors.accent.subtle};
    
    /* Status */
    --success-bg: ${tokens.colors.status.success.bg};
    --success-text: ${tokens.colors.status.success.text};
    --success-border: ${tokens.colors.status.success.border};
    
    --error-bg: ${tokens.colors.status.error.bg};
    --error-text: ${tokens.colors.status.error.text};
    --error-border: ${tokens.colors.status.error.border};
    
    --warning-bg: ${tokens.colors.status.warning.bg};
    --warning-text: ${tokens.colors.status.warning.text};
    --warning-border: ${tokens.colors.status.warning.border};
    
    --info-bg: ${tokens.colors.status.info.bg};
    --info-text: ${tokens.colors.status.info.text};
    --info-border: ${tokens.colors.status.info.border};
    
    /* Spacing */
    --space-1: ${tokens.spacing[1]}px;
    --space-2: ${tokens.spacing[2]}px;
    --space-3: ${tokens.spacing[3]}px;
    --space-4: ${tokens.spacing[4]}px;
    --space-5: ${tokens.spacing[5]}px;
    --space-6: ${tokens.spacing[6]}px;
    --space-8: ${tokens.spacing[8]}px;
    --space-10: ${tokens.spacing[10]}px;
    --space-12: ${tokens.spacing[12]}px;
    --space-16: ${tokens.spacing[16]}px;
    
    /* Radius */
    --radius-sm: ${tokens.radius.sm};
    --radius-md: ${tokens.radius.md};
    --radius-lg: ${tokens.radius.lg};
    --radius-full: ${tokens.radius.full};
    
    /* Shadow */
    --shadow-sm: ${tokens.shadow.sm};
    --shadow-md: ${tokens.shadow.md};
    --shadow-lg: ${tokens.shadow.lg};
    
    /* Transition */
    --transition-fast: ${tokens.transition.fast};
    --transition-normal: ${tokens.transition.normal};
  }
  
  /* Dark Mode */
  body.dark-mode {
    --bg-primary: ${tokens.darkColors.bg.primary};
    --bg-secondary: ${tokens.darkColors.bg.secondary};
    --bg-tertiary: ${tokens.darkColors.bg.tertiary};
    
    --text-primary: ${tokens.darkColors.text.primary};
    --text-secondary: ${tokens.darkColors.text.secondary};
    --text-muted: ${tokens.darkColors.text.muted};
    
    --border-default: ${tokens.darkColors.border.default};
    --border-hover: ${tokens.darkColors.border.hover};
    
    --accent-primary: ${tokens.darkColors.accent.primary};
    --accent-hover: ${tokens.darkColors.accent.hover};
    --accent-subtle: ${tokens.darkColors.accent.subtle};
    
    --success-bg: ${tokens.darkColors.status.success.bg};
    --success-text: ${tokens.darkColors.status.success.text};
    --success-border: ${tokens.darkColors.status.success.border};
    
    --error-bg: ${tokens.darkColors.status.error.bg};
    --error-text: ${tokens.darkColors.status.error.text};
    --error-border: ${tokens.darkColors.status.error.border};
    
    --warning-bg: ${tokens.darkColors.status.warning.bg};
    --warning-text: ${tokens.darkColors.status.warning.text};
    --warning-border: ${tokens.darkColors.status.warning.border};
    
    --info-bg: ${tokens.darkColors.status.info.bg};
    --info-text: ${tokens.darkColors.status.info.text};
    --info-border: ${tokens.darkColors.status.info.border};
  }

  /* Reset & Base */
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  
  html {
    font-size: 16px;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: optimizeLegibility;
    transition: background-color var(--transition-normal), color var(--transition-normal);
  }
  
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    background: var(--bg-primary);
    color: var(--text-primary);
    line-height: 1.5;
    min-height: 100vh;
    transition: background-color var(--transition-normal), color var(--transition-normal);
  }

  /* Focus */
  :focus-visible {
    outline: 2px solid var(--accent-primary);
    outline-offset: 2px;
  }

  /* Links */
  a {
    color: var(--accent-primary);
    text-decoration: none;
    transition: color var(--transition-fast);
  }
  a:hover { color: var(--accent-hover); }

  /* Selection */
  ::selection {
    background: var(--accent-primary);
    color: #fff;
  }

  /* Scrollbar */
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: var(--bg-primary); }
  ::-webkit-scrollbar-thumb { background: var(--border-hover); border-radius: var(--radius-full); }
  ::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }

  /* Header */
  header {
    position: sticky;
    top: 0;
    z-index: 100;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border-default);
    backdrop-filter: saturate(180%) blur(8px);
  }

  .header-content {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 var(--space-6);
    height: 56px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
  }

  .logo {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    text-decoration: none;
    color: var(--text-primary);
  }

  .logo-icon {
    width: 32px;
    height: 32px;
    background: var(--accent-primary);
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    flex-shrink: 0;
  }

  .logo-text {
    font-size: ${tokens.type.lg.size};
    font-weight: 700;
    letter-spacing: -0.02em;
  }

  .logo-version {
    font-size: ${tokens.type.xs.size};
    font-weight: 600;
    color: var(--text-muted);
    padding: 2px 8px;
    background: var(--bg-tertiary);
    border-radius: var(--radius-sm);
  }

  .header-user {
    display: flex;
    align-items: center;
    gap: var(--space-4);
  }

  .header-username {
    font-size: ${tokens.type.sm.size};
    font-weight: 500;
    color: var(--text-secondary);
  }
  
  /* Dark Mode Toggle Button */
  .theme-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all var(--transition-fast);
    color: var(--text-secondary);
    padding: 0;
  }
  
  .theme-toggle:hover {
    background: var(--border-default);
    color: var(--text-primary);
  }
  
  .theme-toggle svg {
    width: 18px;
    height: 18px;
    flex-shrink: 0;
  }
  
  .theme-toggle .sun-icon { display: none; }
  .theme-toggle .moon-icon { display: block; }
  
  body.dark-mode .theme-toggle .sun-icon { display: block; }
  body.dark-mode .theme-toggle .moon-icon { display: none; }

  /* Navigation */
  nav {
    max-width: 1200px;
    margin: 0 auto;
    padding: var(--space-3) var(--space-6);
    display: flex;
    gap: var(--space-2);
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    border-bottom: 1px solid var(--border-default);
    background: var(--bg-secondary);
  }

  nav::-webkit-scrollbar { display: none; }

  nav a {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-4);
    color: var(--text-secondary);
    font-size: ${tokens.type.sm.size};
    font-weight: 500;
    border-radius: var(--radius-md);
    transition: all var(--transition-fast);
    white-space: nowrap;
  }

  nav a svg {
    width: 16px;
    height: 16px;
    opacity: 0.7;
    flex-shrink: 0;
  }

  nav a:hover {
    color: var(--text-primary);
    background: var(--bg-tertiary);
  }

  nav a:hover svg { opacity: 1; }

  nav a.active {
    background: var(--accent-primary);
    color: #fff;
  }

  nav a.active svg { opacity: 1; }

  nav a.logout-link {
    margin-left: auto;
    color: var(--error-text);
  }

  nav a.logout-link:hover {
    background: var(--error-bg);
  }

  /* Main */
  main {
    max-width: 1200px;
    margin: 0 auto;
    padding: var(--space-8) var(--space-6);
  }

  /* Typography */
  h1 {
    font-size: ${tokens.type["2xl"].size};
    font-weight: ${tokens.type["2xl"].weight};
    line-height: ${tokens.type["2xl"].line};
    letter-spacing: -0.02em;
    color: var(--text-primary);
  }

  h2 {
    font-size: ${tokens.type.xl.size};
    font-weight: ${tokens.type.xl.weight};
    line-height: ${tokens.type.xl.line};
    letter-spacing: -0.01em;
    color: var(--text-primary);
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  h2 svg {
    width: 20px;
    height: 20px;
    color: var(--accent-primary);
  }

  h3 {
    font-size: ${tokens.type.lg.size};
    font-weight: ${tokens.type.lg.weight};
    line-height: ${tokens.type.lg.line};
    color: var(--text-primary);
  }

  p {
    font-size: ${tokens.type.base.size};
    line-height: ${tokens.type.base.line};
    color: var(--text-primary);
  }

  .muted {
    color: var(--text-muted);
    font-size: ${tokens.type.sm.size};
  }

  /* Page Header */
  .page-header {
    margin-bottom: var(--space-8);
  }

  .page-header-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-4);
    flex-wrap: wrap;
  }

  .page-header h1 {
    margin: 0;
  }

  .page-header-controls {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    flex-wrap: wrap;
  }

  .page-header-desc {
    color: var(--text-secondary);
    font-size: ${tokens.type.sm.size};
    margin-top: var(--space-2);
    max-width: 640px;
  }

  /* Tabs */
  .tabs {
    display: flex;
    gap: var(--space-1);
    flex-wrap: wrap;
    margin-bottom: var(--space-6);
    padding: var(--space-1);
    background: var(--bg-tertiary);
    border-radius: var(--radius-md);
    width: fit-content;
  }

  .tab {
    padding: var(--space-2) var(--space-4);
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
    font-size: ${tokens.type.sm.size};
    font-weight: 500;
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    text-decoration: none;
    transition: all var(--transition-fast);
  }

  .tab:hover {
    color: var(--text-primary);
    background: var(--bg-secondary);
  }

  .tab.active {
    background: var(--bg-secondary);
    color: var(--text-primary);
    box-shadow: var(--shadow-sm);
  }

  /* Cards */
  .card {
    background: var(--bg-secondary);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-lg);
    padding: var(--space-6);
    margin-bottom: var(--space-6);
  }

  .card > h3:first-child {
    margin-bottom: var(--space-4);
  }

  /* Stats Grid */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: var(--space-4);
    margin-bottom: var(--space-8);
  }

  .stat-card {
    background: var(--bg-secondary);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-lg);
    padding: var(--space-5);
    text-align: center;
    transition: all var(--transition-fast);
  }

  .stat-card:hover {
    border-color: var(--border-hover);
    box-shadow: var(--shadow-md);
  }

  .stat-value {
    font-size: 2rem;
    font-weight: 700;
    letter-spacing: -0.03em;
    color: var(--text-primary);
    line-height: 1;
    margin-bottom: var(--space-2);
  }

  .stat-label {
    color: var(--text-muted);
    font-size: ${tokens.type.xs.size};
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  /* Forms */
  form {
    margin: var(--space-4) 0;
  }

  label {
    display: block;
    margin-bottom: var(--space-2);
    color: var(--text-primary);
    font-size: ${tokens.type.sm.size};
    font-weight: 500;
  }

  input[type="text"],
  input[type="password"],
  input[type="email"],
  input[type="number"],
  input[type="time"],
  textarea,
  select {
    width: 100%;
    padding: var(--space-3) var(--space-4);
    background: var(--bg-primary);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    color: var(--text-primary);
    font-size: ${tokens.type.base.size};
    font-family: inherit;
    transition: all var(--transition-fast);
  }

  input:hover, textarea:hover, select:hover {
    border-color: var(--border-hover);
  }

  input:focus, textarea:focus, select:focus {
    outline: none;
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 3px var(--accent-subtle);
  }

  input::placeholder, textarea::placeholder {
    color: var(--text-muted);
  }

  textarea {
    resize: vertical;
    min-height: 100px;
  }

  select {
    cursor: pointer;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%239CA3AF'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 12px center;
    background-size: 16px;
    padding-right: 40px;
  }

  input[type="checkbox"] {
    width: 18px;
    height: 18px;
    margin-right: var(--space-3);
    accent-color: var(--accent-primary);
    cursor: pointer;
    vertical-align: middle;
  }

  label:has(input[type="checkbox"]) {
    display: inline-flex;
    align-items: center;
    cursor: pointer;
    margin: var(--space-2) 0;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    transition: background var(--transition-fast);
  }

  label:has(input[type="checkbox"]):hover {
    background: var(--bg-tertiary);
  }

  small {
    display: block;
    margin-top: var(--space-2);
    color: var(--text-muted);
    font-size: ${tokens.type.xs.size};
  }

  /* Buttons */
  button, .btn {
    padding: var(--space-3) var(--space-5);
    background: var(--accent-primary);
    color: #fff;
    border: none;
    border-radius: var(--radius-md);
    cursor: pointer;
    font-size: ${tokens.type.sm.size};
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    text-decoration: none;
    transition: all var(--transition-fast);
    white-space: nowrap;
  }

  button:hover, .btn:hover {
    background: var(--accent-hover);
    transform: translateY(-1px);
  }

  button:active, .btn:active {
    transform: translateY(0);
  }

  button.danger, .btn.danger {
    background: var(--error-text);
  }

  button.danger:hover, .btn.danger:hover {
    background: #DC2626;
  }

  button.success, .btn.success {
    background: var(--success-text);
  }

  button.success:hover, .btn.success:hover {
    background: #15803D;
  }

  button.warning, .btn.warning {
    background: var(--warning-text);
  }

  button.small, .btn.small {
    padding: var(--space-2) var(--space-3);
    font-size: ${tokens.type.xs.size};
  }

  button.secondary, .btn.secondary {
    background: var(--bg-primary);
    border: 1px solid var(--border-default);
    color: var(--text-primary);
  }

  button.secondary:hover, .btn.secondary:hover {
    background: var(--bg-tertiary);
    border-color: var(--border-hover);
    transform: none;
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none !important;
  }

  /* Flash Messages */
  .flash {
    padding: var(--space-4);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-6);
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
    font-size: ${tokens.type.sm.size};
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

  .flash.info {
    background: var(--info-bg);
    color: var(--info-text);
    border: 1px solid var(--info-border);
  }

  /* Badges */
  .badge {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    border-radius: var(--radius-full);
    font-size: ${tokens.type.xs.size};
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .badge.active, .badge.healthy, .badge.success {
    background: var(--success-bg);
    color: var(--success-text);
    border: 1px solid var(--success-border);
  }

  .badge.inactive, .badge.unhealthy, .badge.error {
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

  .badge.neutral {
    background: var(--bg-tertiary);
    color: var(--text-secondary);
    border: 1px solid var(--border-default);
  }

  /* Tables */
  .table-wrap {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    border-radius: var(--radius-md);
    border: 1px solid var(--border-default);
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: ${tokens.type.sm.size};
  }

  th, td {
    padding: var(--space-3) var(--space-4);
    text-align: left;
    border-bottom: 1px solid var(--border-default);
  }

  th {
    background: var(--bg-tertiary);
    color: var(--text-muted);
    font-weight: 600;
    font-size: ${tokens.type.xs.size};
    text-transform: uppercase;
    letter-spacing: 0.05em;
    white-space: nowrap;
  }

  tr:last-child td {
    border-bottom: none;
  }

  tr:hover td {
    background: var(--bg-primary);
  }

  /* Pre/Code */
  pre {
    white-space: pre-wrap;
    word-break: break-all;
    background: var(--bg-primary);
    padding: var(--space-4);
    border-radius: var(--radius-md);
    font-size: ${tokens.type.xs.size};
    color: var(--text-secondary);
    border: 1px solid var(--border-default);
    overflow-x: auto;
    font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
    line-height: 1.6;
  }

  code {
    background: var(--bg-primary);
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 0.9em;
    font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
    color: var(--text-secondary);
    border: 1px solid var(--border-default);
  }

  /* Grid */
  .row {
    display: grid;
    gap: var(--space-5);
  }

  .row.cols-2 { grid-template-columns: repeat(2, 1fr); }
  .row.cols-3 { grid-template-columns: repeat(3, 1fr); }
  .row.cols-4 { grid-template-columns: repeat(4, 1fr); }

  /* Toggle */
  .toggle {
    display: inline-flex;
    align-items: center;
    gap: var(--space-3);
    cursor: pointer;
    user-select: none;
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    background: var(--bg-secondary);
    transition: all var(--transition-fast);
  }

  .toggle:hover {
    border-color: var(--border-hover);
  }

  .toggle-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .toggle-label {
    font-size: ${tokens.type.sm.size};
    font-weight: 600;
    color: var(--text-primary);
  }

  .toggle-hint {
    font-size: ${tokens.type.xs.size};
    color: var(--text-muted);
    max-width: 320px;
  }

  .toggle-control {
    position: relative;
    display: inline-flex;
  }

  .toggle-input {
    position: absolute;
    opacity: 0;
    width: 1px;
    height: 1px;
    margin: 0;
  }

  .toggle-track {
    width: 40px;
    height: 22px;
    border-radius: 11px;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-default);
    position: relative;
    transition: all var(--transition-normal);
  }

  .toggle-thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--text-muted);
    transition: all var(--transition-normal);
  }

  .toggle-input:checked + .toggle-track {
    background: var(--accent-primary);
    border-color: var(--accent-primary);
  }

  .toggle-input:checked + .toggle-track .toggle-thumb {
    transform: translateX(18px);
    background: #fff;
  }

  .toggle-input:focus-visible + .toggle-track {
    box-shadow: 0 0 0 3px var(--accent-subtle);
  }

  .toggle-state {
    font-size: ${tokens.type.xs.size};
    font-weight: 700;
    letter-spacing: 0.05em;
    color: var(--text-muted);
    min-width: 28px;
    text-align: right;
  }

  .toggle.is-on .toggle-state {
    color: var(--accent-primary);
  }

  .toggle-form {
    display: inline-flex;
    margin: 0;
  }

  /* Provider Card */
  .provider-card {
    border-left: 3px solid var(--border-default);
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
    gap: var(--space-4);
    flex-wrap: wrap;
  }

  .provider-info {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    flex: 1;
    min-width: 200px;
  }

  .provider-header {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    flex-wrap: wrap;
  }

  .provider-name {
    font-size: ${tokens.type.lg.size};
    font-weight: 600;
    color: var(--text-primary);
  }

  .provider-meta {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
    font-size: ${tokens.type.xs.size};
    color: var(--text-muted);
  }

  .provider-meta-separator {
    color: var(--border-default);
  }

  .provider-actions {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
    align-items: center;
  }

  .provider-edit-form {
    margin-top: var(--space-5);
    padding-top: var(--space-5);
    border-top: 1px solid var(--border-default);
  }

  /* Responsive */
  @media (max-width: 768px) {
    .header-content {
      padding: 0 var(--space-4);
    }

    nav {
      padding: var(--space-3) var(--space-4);
    }

    nav a {
      padding: var(--space-2) var(--space-3);
      font-size: ${tokens.type.xs.size};
    }

    main {
      padding: var(--space-6) var(--space-4);
    }

    h1 { font-size: ${tokens.type.xl.size}; }
    h2 { font-size: ${tokens.type.lg.size}; }

    .stats-grid {
      grid-template-columns: repeat(2, 1fr);
    }

    .stat-value {
      font-size: 1.5rem;
    }

    .row, .row.cols-2, .row.cols-3, .row.cols-4 {
      grid-template-columns: 1fr;
    }

    .page-header-row {
      flex-direction: column;
      gap: var(--space-3);
    }

    .page-header-controls {
      width: 100%;
    }

    .tabs {
      width: 100%;
    }

    .tab {
      flex: 1;
      justify-content: center;
    }
  }

  @media (max-width: 480px) {
    .stats-grid {
      grid-template-columns: 1fr;
    }

    .logo-version {
      display: none;
    }

    .header-username {
      display: none;
    }
  }
`;

// ---- Helper Functions ----

// Page header: Title + optional global controls (e.g. a feature toggle) on one
// row, with an optional description below. Consistent across all admin pages.
export function pageHeader(title, { controls = "", description = "" } = {}) {
  return `
    <div class="page-header">
      <div class="page-header-row">
        <h1>${escHtml(title)}</h1>
        ${controls ? `<div class="page-header-controls">${controls}</div>` : ""}
      </div>
      ${description ? `<p class="page-header-desc">${escHtml(description)}</p>` : ""}
    </div>`;
}

// Tab bar: one shared tab/pill language for all sub-navigation.
// items: [{ href, label, active }]
export function tabs(items) {
  return `
    <div class="tabs">
      ${items.map((i) => `<a class="tab ${i.active ? "active" : ""}" href="${i.href}">${escHtml(i.label)}</a>`).join("")}
    </div>`;
}

// Feature toggle switch: the single ON/OFF control for every global
// feature toggle. Renders a real checkbox so each feature's existing form/POST
// semantics are preserved. `dataSubmit` makes the enclosing form submit on
// change (used by header toggles that save immediately).
export function toggle({ name, checked, label, hint = "", dataSubmit = false }) {
  return `
    <label class="toggle">
      <span class="toggle-text">
        <span class="toggle-label">${escHtml(label)}</span>
        ${hint ? `<span class="toggle-hint">${escHtml(hint)}</span>` : ""}
      </span>
      <span class="toggle-control">
        <input type="checkbox" name="${escHtml(name)}" class="toggle-input" ${checked ? "checked" : ""} ${dataSubmit ? 'data-submit="1"' : ""}>
        <span class="toggle-track"><span class="toggle-thumb"></span></span>
      </span>
      <span class="toggle-state">${checked ? "ON" : "OFF"}</span>
    </label>`;
}

// Semantic badge: kind is success|error|warning|info|neutral (or the existing
// active|inactive aliases). One badge language across every admin page.
const BADGE_KIND_TO_CLASS = {
  success: "active",
  error: "inactive",
  danger: "inactive",
  warning: "warning",
  info: "info",
  neutral: "neutral",
  active: "active",
  inactive: "inactive",
  on: "active",
  off: "inactive",
  pending: "warning",
};
export function badge(kind, label) {
  const cls = BADGE_KIND_TO_CLASS[kind] || "neutral";
  return `<span class="badge ${cls}">${escHtml(label)}</span>`;
}

// Flash message: one consistent alert design for success/error/warning/info.
export function flash(kind, message) {
  const cls = { success: "success", error: "error", warning: "warning", info: "info" }[kind] || "info";
  return `<div class="flash ${cls}">${escHtml(message)}</div>`;
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
  calendar: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>`,
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

export function layout({ title, content, session, currentPage = "" }) {
  const navItems = [
    { href: "/admin/ava_brain/dashboard", label: "Dashboard", icon: icons.dashboard },
    { href: "/admin/ava_brain/settings", label: "Settings", icon: icons.settings },
    { href: "/admin/ava_brain/apis", label: "APIs", icon: icons.api },
    { href: "/admin/ava_brain/capabilities", label: "Workflow", icon: icons.brain },
    { href: "/admin/ava_brain/memory", label: "Memory", icon: icons.memory },
    { href: "/admin/ava_brain/reminders", label: "Reminders", icon: icons.tasks },
    { href: "/admin/ava_brain/daily_plan", label: "Daily Plan", icon: icons.calendar },
    { href: "/admin/ava_brain/traces", label: "Traces", icon: icons.logs },
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
          <button type="button" class="theme-toggle" id="themeToggle" aria-label="Toggle dark mode">
            <svg class="sun-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"></path>
            </svg>
            <svg class="moon-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path>
            </svg>
          </button>
          <span class="header-username">Welcome, ${escHtml(session.username)}</span>
        </div>
      ` : ""}
    </div>
  </header>
  <main>
    ${nav}
    ${content}
  </main>
  <script>
  // Dark Mode Toggle
  (function() {
    var themeToggle = document.getElementById('themeToggle');
    var body = document.body;
    
    // Check for saved theme preference or default to light mode
    var savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
      body.classList.add('dark-mode');
    }
    
    if (themeToggle) {
      themeToggle.addEventListener('click', function() {
        body.classList.toggle('dark-mode');
        
        // Save preference
        if (body.classList.contains('dark-mode')) {
          localStorage.setItem('theme', 'dark');
        } else {
          localStorage.setItem('theme', 'light');
        }
      });
    }
  })();
  
  // Shared Admin toggle behavior: every .toggle-input live-updates its
  // ON/OFF state text, and toggles marked data-submit save their form on change.
  (function () {
    var toggles = document.querySelectorAll(".toggle-input");
    for (var i = 0; i < toggles.length; i++) {
      (function (input) {
        var label = input.closest(".toggle");
        function sync() {
          if (!label) return;
          var state = label.querySelector(".toggle-state");
          if (state) state.textContent = input.checked ? "ON" : "OFF";
          label.classList.toggle("is-on", input.checked);
        }
        input.addEventListener("change", function () {
          sync();
          if (input.hasAttribute("data-submit")) {
            var form = input.closest("form");
            if (form) form.submit();
          }
        });
        sync();
      })(toggles[i]);
    }
  })();
  </script>
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

        <div class="card" style="background:var(--bg-primary);margin-top:24px;padding:18px;border:1px solid var(--border-default);">
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
