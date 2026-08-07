// Admin panel route handler
import { layout, loginForm, changePasswordForm, escHtml } from "../lib/html.js";
import { getSession, verifyAndGetUser, changePassword, ensureSeededPassword, checkSingleUser, checkRateLimit } from "../lib/auth.js";
import { createSession, logoutSession } from "../lib/auth.js";
import { log } from "../lib/logger.js";
import { handleDashboardPage } from "../admin/dashboard.js";
import { handleSettingsPage } from "../admin/settings.js";
import { handleApisPage } from "../admin/apis.js";
import { handleMemoryPage } from "../admin/memory.js";
import { handleRemindersPage } from "../admin/reminders.js";
import { handleTasksPage } from "../admin/tasks.js";
import { handleLogsPage } from "../admin/logs.js";

export async function handleAdmin(request, env, config) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // Public routes
  if (pathname === "/admin/ava_brain/login") {
    return await handleLogin(request, env, config);
  }

  if (pathname === "/admin/ava_brain/logout") {
    return await handleLogout(request, env, config);
  }

  // Protected routes
  const session = await getSession(env.KV, config.ADMIN_SESSION_SECRET, request);
  if (!session) {
    return redirectToLogin();
  }

  // Force password change on first login
  if (session.mustChangePassword) {
    return await handlePasswordChange(request, env, config);
  }

  switch (pathname) {
    case "/admin/ava_brain/":
    case "/admin/ava_brain/dashboard":
      return await handleDashboardPage(env, config, session);
    case "/admin/ava_brain/settings":
      return await handleSettingsPage(request, env, config);
    case "/admin/ava_brain/apis":
      return await handleApisPage(request, env, config);
    case "/admin/ava_brain/memory":
      return await handleMemoryPage(request, env, config);
    case "/admin/ava_brain/reminders":
      return await handleRemindersPage(request, env, config);
    case "/admin/ava_brain/tasks":
      return await handleTasksPage(request, env, config);
    case "/admin/ava_brain/logs":
      return await handleLogsPage(request, env, config);
    default:
      return new Response("Not Found", { status: 404 });
  }
}

async function handleLogin(request, env, config) {
  if (request.method === "GET") {
    return new Response(loginForm(null), { headers: { "Content-Type": "text/html" } });
  }

  if (request.method === "POST") {
    const formData = await request.formData();
    const username = formData.get("username");
    const password = formData.get("password");
    const clientIP = request.headers.get("CF-Connecting-IP") || "unknown";

    const allowed = await checkRateLimit(env.KV, `login:${clientIP}`, 5, 300);
    if (!allowed) {
      return new Response(loginForm("Too many attempts. Try again later."), { headers: { "Content-Type": "text/html" } });
    }

    const db = env.DB;
    await ensureSeededPassword(db);
    await checkSingleUser(db);

    const user = await verifyAndGetUser(db, username, password);
    if (!user) {
      return new Response(loginForm("Invalid credentials"), { headers: { "Content-Type": "text/html" } });
    }

    const { cookie, session } = await createSession(env.KV, config.ADMIN_SESSION_SECRET, user);

    const response = user.must_change_password
      ? new Response(changePasswordForm(null), { headers: { "Content-Type": "text/html" } })
      : await handleDashboardPage(env, config, session);

    response.headers.set("Set-Cookie", cookie);
    return response;
  }

  return new Response("Method Not Allowed", { status: 405 });
}

async function handleLogout(request, env, config) {
  const session = await getSession(env.KV, config.ADMIN_SESSION_SECRET, request);
  await logoutSession(env.KV, session);

  const response = redirectToLogin();
  response.headers.set("Set-Cookie", "ava_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0");
  return response;
}

async function handlePasswordChange(request, env, config) {
  if (request.method === "GET") {
    return new Response(changePasswordForm(null), { headers: { "Content-Type": "text/html" } });
  }

  if (request.method === "POST") {
    const formData = await request.formData();
    const newPassword = formData.get("new_password");
    const confirmPassword = formData.get("confirm_password");

    if (newPassword !== confirmPassword) {
      return new Response(changePasswordForm("Passwords do not match"), { headers: { "Content-Type": "text/html" } });
    }

    if (newPassword.length < 8) {
      return new Response(changePasswordForm("Password must be at least 8 characters"), { headers: { "Content-Type": "text/html" } });
    }

    const session = await getSession(env.KV, config.ADMIN_SESSION_SECRET, request);
    if (!session) {
      return redirectToLogin();
    }

    await changePassword(env.DB, session.userId, newPassword);
    await log(env.DB, "info", "password_changed", { userId: session.userId });

    const response = await handleDashboardPage(env, config, { userId: session.userId, username: session.username, mustChangePassword: false });
    const { cookie } = await createSession(env.KV, config.ADMIN_SESSION_SECRET, {
      id: session.userId,
      username: session.username,
      must_change_password: 0,
    });
    response.headers.set("Set-Cookie", cookie);
    return response;
  }

  return new Response("Method Not Allowed", { status: 405 });
}

function redirectToLogin() {
  return new Response("Redirecting", {
    status: 302,
    headers: { Location: "/admin/ava_brain/login" },
  });
}