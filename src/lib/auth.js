// Auth helpers: single-user enforcement, password verification, session management
import { hashPassword, generateSalt, createSession as cryptoCreateSession, verifySession } from "./crypto.js";

export async function checkSingleUser(db) {
  const { count } = await db.prepare("SELECT COUNT(*) as count FROM auth_users").first();
  if (count === 0) {
    await db
      .prepare("INSERT INTO auth_users (username, password_hash, salt, must_change_password) VALUES (?, 'initial_placeholder', '', 1)")
      .bind("papapouria")
      .run();
    return;
  }
  if (count > 1) {
    const first = await db.prepare("SELECT id FROM auth_users ORDER BY id ASC LIMIT 1").first();
    if (first) {
      await db.prepare("DELETE FROM auth_users WHERE id != ?").bind(first.id).run();
    }
  }
}

export async function verifyAndGetUser(db, username, password) {
  const user = await db.prepare("SELECT * FROM auth_users WHERE username = ?").bind(username).first();
  if (!user) return null;

  if (user.password_hash === "initial_placeholder" && password === "12345678") {
    return { ...user, must_change_password: 1 };
  }

  const hash = await hashPassword(password, user.salt);
  if (hash !== user.password_hash) return null;
  return user;
}

export async function changePassword(db, userId, newPassword) {
  const salt = generateSalt();
  const hash = await hashPassword(newPassword, salt);
  await db
    .prepare("UPDATE auth_users SET password_hash = ?, salt = ?, must_change_password = 0, updated_at = datetime('now') WHERE id = ?")
    .bind(hash, salt, userId)
    .run();
}

export async function ensureSeededPassword(db) {
  const user = await db.prepare("SELECT * FROM auth_users WHERE username = 'papapouria'").first();
  if (!user) return;
  if (user.password_hash === "initial_placeholder") {
    const salt = generateSalt();
    const hash = await hashPassword("12345678", salt);
    await db
      .prepare("UPDATE auth_users SET password_hash = ?, salt = ?, must_change_password = 1, updated_at = datetime('now') WHERE id = ?")
      .bind(hash, salt, user.id)
      .run();
  }
}

export async function getSession(kv, adminSessionSecret, request) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/ava_session=([^;]+)/);
  if (!match) return null;
  const [tokenB64, payloadB64] = match[1].split(".");
  if (!tokenB64 || !payloadB64) return null;
  try {
    const token = atob(tokenB64);
    const payload = atob(payloadB64);
    const valid = await verifySession(token, payload, adminSessionSecret);
    if (!valid) return null;
    const session = JSON.parse(payload);
    const kvSession = await kv.get(`admin_session:${session.userId}`, "json");
    if (!kvSession || kvSession.token !== token) return null;
    return session;
  } catch {
    return null;
  }
}

export async function createSession(kv, secret, user) {
  const { token, payload } = await cryptoCreateSession(user.id, user.username, secret, user.must_change_password);
  const session = JSON.parse(payload);
  await kv.put(
    `admin_session:${session.userId}`,
    JSON.stringify({ token, username: user.username, must_change_password: user.must_change_password || 0 }),
    { expirationTtl: 86400 }
  );
  const cookieValue = `${btoa(token)}.${btoa(payload)}`;
  return {
    cookie: `ava_session=${cookieValue}; HttpOnly; Secure; SameSite=Lax; Path=/`,
    session,
  };
}

export async function logoutSession(kv, session) {
  if (session?.userId) {
    await kv.delete(`admin_session:${session.userId}`);
  }
}

export async function checkRateLimit(kv, key, maxAttempts = 5, windowSec = 300) {
  const attempts = (await kv.get(`ratelimit:${key}`, "json")) || { count: 0, first: Date.now() };
  if (Date.now() - attempts.first > windowSec * 1000) {
    attempts.count = 0;
    attempts.first = Date.now();
  }
  if (attempts.count >= maxAttempts) return false;
  attempts.count += 1;
  await kv.put(`ratelimit:${key}`, JSON.stringify(attempts), { expirationTtl: windowSec });
  return true;
}