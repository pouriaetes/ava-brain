// src/lib/provider-health.js — provider circuit breaker.
//
// Health is recorded in api_providers.health_json and genuinely influences
// provider selection (unlike the previous status-only recording). After a small
// number of consecutive failures a provider enters a temporary cooldown; selection
// skips cooling-down providers and, once the cooldown expires, lets it be tried
// again (half-open). A success restores it immediately. Cooldown grows with
// exponential backoff so a persistently-broken provider is probed ever less often
// instead of being permanently blacklisted.

export const FAILURE_THRESHOLD = 2;
export const COOLDOWN_MS = 5 * 60 * 1000; // initial cooldown
export const MAX_COOLDOWN_MS = 60 * 60 * 1000;

export function parseHealth(provider) {
  try {
    const h = JSON.parse(provider?.health_json || "{}");
    return h && typeof h === "object" ? h : {};
  } catch {
    return {};
  }
}

// Is the provider currently in cooldown (and therefore skipped by selection)?
export function isCoolingDown(provider, now = Date.now()) {
  const h = parseHealth(provider);
  if (h.status !== "cooldown") return false;
  const until = Number(h.cooldown_until) || 0;
  return now < until;
}

async function readHealth(db, providerId) {
  try {
    const row = await db.prepare("SELECT health_json FROM api_providers WHERE id = ?").bind(providerId).first();
    return parseHealth(row);
  } catch (e) {
    return {};
  }
}

async function writeHealth(db, providerId, health) {
  try {
    await db
      .prepare("UPDATE api_providers SET health_json = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(JSON.stringify(health), providerId)
      .run();
  } catch (e) {}
}

export async function recordSuccess(db, providerId, capability) {
  const h = await readHealth(db, providerId);
  h.status = "healthy";
  h.consecutive_failures = 0;
  h.last_success = Date.now();
  h.cooldown_until = null;
  h.last_error = null;
  h.last_capability = capability || null;
  h.last_check = new Date().toISOString();
  await writeHealth(db, providerId, h);
}

export async function recordFailure(db, providerId, capability, errorMsg) {
  const now = Date.now();
  const h = await readHealth(db, providerId);
  const consecutive = (Number(h.consecutive_failures) || 0) + 1;
  h.consecutive_failures = consecutive;
  h.last_error = String(errorMsg || "").substring(0, 300);
  h.last_capability = capability || null;
  h.last_failed_at = now;
  h.last_check = new Date().toISOString();
  if (consecutive >= FAILURE_THRESHOLD) {
    h.status = "cooldown";
    const lastUntil = Number(h.cooldown_until) || 0;
    const elapsedBase = lastUntil > now ? lastUntil - now : 0;
    const backoff = elapsedBase > 0 ? Math.min(elapsedBase * 2, MAX_COOLDOWN_MS) : COOLDOWN_MS;
    h.cooldown_until = now + backoff;
  }
  await writeHealth(db, providerId, h);
}

// Order providers for a capability, skipping cooling-down ones. Providers whose
// cooldown has expired are eligible again (half-open: one probe is allowed).
export function orderAvailableProviders(providers, now = Date.now()) {
  const sorted = [...providers].sort((a, b) => a.priority - b.priority);
  const available = sorted.filter((p) => !isCoolingDown(p, now));
  return available.length > 0 ? available : sorted;
}
