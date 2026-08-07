// Structured logger to D1 logs table + console
// Also exports a logger object with info/error/warn/debug methods

export async function logToDb(db, level, event, metadata = {}) {
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
    try {
      await db
        .prepare("INSERT INTO logs (level, event, metadata) VALUES (?, ?, ?)")
        .bind(level, event, meta)
        .run();
    } catch {
      // fail silently
    }
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
function log3(db, level, event, meta) {
  return logToDb(db, level, event, meta);
}
log3.info = (db, component, event, meta) => logToDb(db, "info", `${component}:${event}`, meta);
log3.error = (db, component, event, meta) => logToDb(db, "error", `${component}:${event}`, meta);
log3.warn = (db, component, event, meta) => logToDb(db, "warn", `${component}:${event}`, meta);
log3.debug = (db, component, event, meta) => logToDb(db, "debug", `${component}:${event}`, meta);

// log3 is the primary export (callable function + methods)
// log is the alias used by all other files importing { log }
export { log3, log3 as log };