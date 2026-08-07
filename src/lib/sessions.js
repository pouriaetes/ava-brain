// Session management for tracking conversations
import { log } from "./logger.js";

export class SessionManager {
  constructor(config, crypto, logger, db) {
    this.config = config;
    this.crypto = crypto;
    this.logger = logger;
    this.db = db;
  }

  async getOrCreateSession(chatId) {
    try {
      // Find active session
      const active = await this.db
        .prepare("SELECT * FROM sessions WHERE chat_id = ? AND status = 'active' ORDER BY last_active_at DESC LIMIT 1")
        .bind(chatId)
        .first();

      if (active) {
        await this.db
          .prepare("UPDATE sessions SET last_active_at = datetime('now') WHERE id = ?")
          .bind(active.id)
          .run();

        return active;
      }

      // Create new session
      const sessionId = this.generateSessionId();
      await this.db
        .prepare("INSERT INTO sessions (id, chat_id, started_at, last_active_at, summary, status, mode) VALUES (?, ?, datetime('now'), datetime('now'), ?, 'active', 'chat')")
        .bind(sessionId, chatId, "")
        .run();

      return {
        id: sessionId,
        chat_id: chatId,
        started_at: new Date().toISOString(),
        last_active_at: new Date().toISOString(),
        summary: "",
        status: "active",
        mode: "chat",
      };
    } catch (error) {
      await this.logger.error(this.db, "sessions", "session_error", { chatId, error: error.message });
      return null;
    }
  }

  async updateSessionSummary(sessionId, summary) {
    try {
      await this.db
        .prepare("UPDATE sessions SET summary = ? WHERE id = ?")
        .bind(summary, sessionId)
        .run();

      await this.logger.info(this.db, "sessions", "summary_updated", { sessionId });
    } catch (error) {
      await this.logger.error(this.db, "sessions", "summary_update_error", { sessionId, error: error.message });
    }
  }

  async updateSessionMode(sessionId, mode) {
    try {
      await this.db
        .prepare("UPDATE sessions SET mode = ? WHERE id = ?")
        .bind(mode, sessionId)
        .run();

      await this.logger.info(this.db, "sessions", "mode_updated", { sessionId, mode });
    } catch (error) {
      await this.logger.error(this.db, "sessions", "mode_update_error", { sessionId, error: error.message });
    }
  }

  async closeSession(sessionId) {
    try {
      await this.db
        .prepare("UPDATE sessions SET status = 'closed' WHERE id = ?")
        .bind(sessionId)
        .run();
    } catch (error) {
      await this.logger.error(this.db, "sessions", "close_error", { sessionId, error: error.message });
    }
  }

  async getSessionSummary(sessionId) {
    try {
      const session = await this.db
        .prepare("SELECT * FROM sessions WHERE id = ?")
        .bind(sessionId)
        .first();

      return session?.summary || "";
    } catch (error) {
      await this.logger.error(this.db, "sessions", "retrieve_error", { sessionId, error: error.message });
      return "";
    }
  }

  generateSessionId() {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < 16; i++) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }
    return `session_${result}_${Date.now().toString(36)}`;
  }
}