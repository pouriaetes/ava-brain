// Structured logger to D1 logs table + console
// Also exports a logger object with info/error/warn/debug methods

// OPT-005: cache the verbose_logging setting (read once per window, not per log
// call) so the logging hot path never issues a settings query per event.
let verboseLoggingCache = null;
let verboseLoggingCacheAt = 0;
const VERBOSE_LOGGING_CACHE_TTL_MS = 30000;

async function isVerboseLoggingEnabled(db) {
  const now = Date.now();
  if (verboseLoggingCache !== null && now - verboseLoggingCacheAt < VERBOSE_LOGGING_CACHE_TTL_MS) {
    return verboseLoggingCache;
  }
  let enabled = false;
  try {
    if (db && typeof db.prepare === "function") {
      const row = await db.prepare("SELECT value FROM settings WHERE key = 'verbose_logging'").first();
      enabled = row?.value === "true";
    }
  } catch (e) {}
  verboseLoggingCache = enabled;
  verboseLoggingCacheAt = now;
  return enabled;
}

export async function logToDb(db, level, event, metadata = {}, ctx = null) {
  try {
    const sanitized = { ...metadata };
    delete sanitized.api_key;
    delete sanitized.api_key_enc;
    delete sanitized.password;
    delete sanitized.token;
    delete sanitized.masterKey;
    let meta;
    try {
      meta = JSON.stringify(sanitized);
    } catch {
      meta = "{}";
    }
    const logFn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
    logFn(`[${level.toUpperCase()}] ${event}`, meta);
    if (!db || typeof db.prepare !== "function") return;

    // OPT-005: only persist debug/info to D1 when verbose logging is enabled.
    // console.log above is unconditional (live tailing); warn/error always persist.
    if (level === "debug" || level === "info") {
      if (!(await isVerboseLoggingEnabled(db))) return;
    }

    const insert = db
      .prepare("INSERT INTO logs (level, event, metadata) VALUES (?, ?, ?)")
      .bind(level, event, meta)
      .run();

    if (ctx && typeof ctx.waitUntil === "function") {
      // OPT-006: defer non-critical log writes off the response path; the Worker
      // flushes waitUntil promises before shutting down.
      ctx.waitUntil(insert.then(() => {}, () => {}));
      return;
    }
    await insert;
  } catch (loggerError) {
    console.error("logToDb itself failed:", loggerError);
  }
}

// The log3 object provides both:
//   - A callable function for use cases expecting log3(db, level, event, meta)
//   - Methods (info, error, warn, debug) for use cases expecting log3.info(db, event, meta)
//
// This ensures compatibility with all existing patterns in the codebase while
// following the pattern: log3.info calls logToDb with level="info"
function log3(db, level, event, meta, ctx) {
  return logToDb(db, level, event, meta, ctx);
}
log3.info = (db, component, event, meta, ctx) => logToDb(db, "info", `${component}:${event}`, meta, ctx);
log3.error = (db, component, event, meta, ctx) => logToDb(db, "error", `${component}:${event}`, meta, ctx);
log3.warn = (db, component, event, meta, ctx) => logToDb(db, "warn", `${component}:${event}`, meta, ctx);
log3.debug = (db, component, event, meta, ctx) => logToDb(db, "debug", `${component}:${event}`, meta, ctx);

// log3 is the primary export (callable function + methods)
// log is the alias used by all other files importing { log }
export { log3, log3 as log };