// Session management for tracking conversations with state management
// Change 3: Enhanced session state management
// Change 11: Session expiry mechanism
import { log } from "./logger.js";

const TASK_SESSION_TIMEOUT_MINUTES = 30; // Change 1 & 11: Configurable timeout

export class SessionManager {
  constructor(config, crypto, logger, db) {
    this.config = config;
    this.crypto = crypto;
    this.logger = logger;
    this.db = db;
  }
  
  async getOrCreateSession(chatId) {
    try {
      // Change 12: Optimized query with index
      const active = await this.db
        .prepare("SELECT * FROM sessions WHERE chat_id = ? AND status = 'active' ORDER BY last_active_at DESC LIMIT 1")
        .bind(chatId)
        .first();

      if (active) {
        // Change 11: Check session expiry
        const now = new Date();
        const lastMessageAt = active.last_message_at ? new Date(active.last_message_at) : new Date(active.last_active_at);
        const minutesSinceLastMessage = (now - lastMessageAt) / 60000;
        
        // If in task mode and expired, reset to chat mode
        if (active.mode === 'task' && minutesSinceLastMessage > TASK_SESSION_TIMEOUT_MINUTES) {
          await this.updateSessionMode(active.id, 'chat');
          await this.updateSessionState(active.id, { expired: true, reason: 'timeout' });
        }
        
        await this.db
          .prepare("UPDATE sessions SET last_active_at = datetime('now'), last_message_at = datetime('now') WHERE id = ?")
          .bind(active.id)
          .run();

        return active;
      }

      // Create new session
      const sessionId = this.generateSessionId();
      await this.db
        .prepare("INSERT INTO sessions (id, chat_id, started_at, last_active_at, last_message_at, summary, status, mode, state_json) VALUES (?, ?, datetime('now'), datetime('now'), datetime('now'), ?, 'active', 'chat', '{}')")
        .bind(sessionId, chatId, "")
        .run();

      return {
        id: sessionId,
        chat_id: chatId,
        started_at: new Date().toISOString(),
        last_active_at: new Date().toISOString(),
        last_message_at: new Date().toISOString(),
        summary: "",
        status: "active",
        mode: "chat",
        state_json: '{}',
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
        .prepare("UPDATE sessions SET mode = ?, last_active_at = datetime('now') WHERE id = ?")
        .bind(mode, sessionId)
        .run();

      await this.logger.info(this.db, "sessions", "mode_updated", { sessionId, mode });
    } catch (error) {
      await this.logger.error(this.db, "sessions", "mode_update_error", { sessionId, error: error.message });
    }
  }

  // Change 3: New method for updating session state
  async updateSessionState(sessionId, state) {
    try {
      const existing = await this.db
        .prepare("SELECT state_json FROM sessions WHERE id = ?")
        .bind(sessionId)
        .first();
      
      const currentState = existing?.state_json ? JSON.parse(existing.state_json) : {};
      const newState = { ...currentState, ...state, updated_at: new Date().toISOString() };
      
      await this.db
        .prepare("UPDATE sessions SET state_json = ? WHERE id = ?")
        .bind(JSON.stringify(newState), sessionId)
        .run();

      await this.logger.info(this.db, "sessions", "state_updated", { sessionId, state });
    } catch (error) {
      await this.logger.error(this.db, "sessions", "state_update_error", { sessionId, error: error.message });
    }
  }

  // Change 3: Get session state
  async getSessionState(sessionId) {
    try {
      const session = await this.db
        .prepare("SELECT state_json FROM sessions WHERE id = ?")
        .bind(sessionId)
        .first();
      
      return session?.state_json ? JSON.parse(session.state_json) : {};
    } catch (error) {
      await this.logger.error(this.db, "sessions", "state_retrieve_error", { sessionId, error: error.message });
      return {};
    }
  }

  // Change 7: Get separate task context - uses state_json instead of missing task_context column
  async getTaskContext(sessionId) {
    try {
      const session = await this.db
        .prepare("SELECT state_json FROM sessions WHERE id = ?")
        .bind(sessionId)
        .first();
      
      const state = session?.state_json ? JSON.parse(session.state_json) : {};
      return state.task_context || "";
    } catch (error) {
      await this.logger.error(this.db, "sessions", "task_context_error", { sessionId, error: error.message });
      return "";
    }
  }

  // Change 7: Update task context separately from chat - stores in state_json
  async updateTaskContext(sessionId, context) {
    try {
      const existing = await this.db
        .prepare("SELECT state_json FROM sessions WHERE id = ?")
        .bind(sessionId)
        .first();
      
      const currentState = existing?.state_json ? JSON.parse(existing.state_json) : {};
      const newState = { ...currentState, task_context: context, updated_at: new Date().toISOString() };
      
      await this.db
        .prepare("UPDATE sessions SET state_json = ? WHERE id = ?")
        .bind(JSON.stringify(newState), sessionId)
        .run();

      await this.logger.info(this.db, "sessions", "task_context_updated", { sessionId });
    } catch (error) {
      await this.logger.error(this.db, "sessions", "task_context_update_error", { sessionId, error: error.message });
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
