// Minimal HTML helpers for server-rendered admin panel
// No framework — just template literals with proper escaping

export function escHtml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function layout({ title, content, session }) {
  const nav = session
    ? `
    <nav>
      <a href="/admin/ava_brain/settings">Settings</a> |
      <a href="/admin/ava_brain/apis">APIs</a> |
      <a href="/admin/ava_brain/memory">Memory</a> |
      <a href="/admin/ava_brain/tasks">Tasks</a> |
      <a href="/admin/ava_brain/logs">Logs</a> |
      <a href="/admin/ava_brain/logout">Logout</a>
    </nav>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escHtml(title)} - AVA_BRAIN</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; background: #0f0f0f; color: #e0e0e0; line-height: 1.6; padding: 20px; max-width: 900px; margin: 0 auto; }
    h1 { color: #fff; margin-bottom: 20px; font-size: 1.5rem; }
    h2 { color: #ccc; margin: 20px 0 10px; font-size: 1.2rem; }
    nav { margin-bottom: 24px; padding-bottom: 12px; border-bottom: 1px solid #333; }
    nav a { color: #7eb8ff; text-decoration: none; margin-right: 12px; }
    nav a:hover { text-decoration: underline; }
    form { margin: 16px 0; }
    label { display: block; margin: 8px 0 4px; color: #aaa; font-size: 0.85rem; }
    input, textarea, select { width: 100%; padding: 8px 12px; background: #1a1a1a; border: 1px solid #333; border-radius: 4px; color: #e0e0e0; font-size: 0.9rem; }
    input:focus, textarea:focus, select:focus { outline: none; border-color: #7eb8ff; }
    button, .btn { padding: 8px 16px; background: #7eb8ff; color: #0f0f0f; border: none; border-radius: 4px; cursor: pointer; font-size: 0.9rem; font-weight: 500; }
    button:hover { background: #9cc8ff; }
    button.danger { background: #e05555; }
    button.danger:hover { background: #f06666; }
    button.small { padding: 4px 10px; font-size: 0.8rem; }
    .card { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 6px; padding: 16px; margin: 12px 0; }
    .row { display: flex; gap: 16px; flex-wrap: wrap; }
    .col { flex: 1; min-width: 200px; }
    .flash { padding: 10px 16px; border-radius: 4px; margin: 12px 0; }
    .flash.success { background: #1a3a1a; color: #5f5; border: 1px solid #2a5a2a; }
    .flash.error { background: #3a1a1a; color: #f55; border: 1px solid #5a2a2a; }
    .muted { color: #888; font-size: 0.85rem; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 3px; font-size: 0.75rem; }
    .badge.active { background: #1a3a1a; color: #5f5; }
    .badge.inactive { background: #3a1a1a; color: #f55; }
    pre { white-space: pre-wrap; word-break: break-all; background:#111; padding:8px; border-radius:4px; font-size:0.8rem; }
  </style>
</head>
<body>
  <h1>Ava Brain</h1>
  ${nav}
  ${content}
</body>
</html>`;
}

export function loginForm(error) {
  return layout({
    title: "Login",
    content: `
      <div class="card" style="max-width:400px;margin:40px auto;">
        <h2>Login</h2>
        ${error ? `<div class="flash error">${escHtml(error)}</div>` : ""}
        <form method="POST" action="/admin/ava_brain/login">
          <label>Username</label>
          <input type="text" name="username" required autocomplete="username">
          <label>Password</label>
          <input type="password" name="password" required autocomplete="current-password">
          <button type="submit" style="margin-top:12px;width:100%;">Login</button>
        </form>
      </div>`,
  });
}

export function changePasswordForm(error) {
  return layout({
    title: "Change Password",
    content: `
      <div class="card" style="max-width:400px;margin:40px auto;">
        <h2>Change Password</h2>
        <p class="muted">First login — you must change your password.</p>
        ${error ? `<div class="flash error">${escHtml(error)}</div>` : ""}
        <form method="POST" action="/admin/ava_brain/login">
          <input type="hidden" name="action" value="change_password">
          <label>New Password (min 8 chars)</label>
          <input type="password" name="new_password" required minlength="8" autocomplete="new-password">
          <label>Confirm New Password</label>
          <input type="password" name="confirm_password" required minlength="8" autocomplete="new-password">
          <button type="submit" style="margin-top:12px;width:100%;">Set Password</button>
        </form>
      </div>`,
  });
}