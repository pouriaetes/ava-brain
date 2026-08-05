// Memory layer for Ava Brain
// Manages three-layer memory: short-term, long-term, and profile facts
// Provides retrieval, storage, and cleanup functionality

import { log } from "./logger.js";

export class MemoryManager {
  constructor(config, crypto, logger, db) {
    this.config = config;
    this.crypto = crypto;
    this.logger = logger;
    this.db = db;
    this.tehranTime = null;
  }

  async initialize() {
    try {
      await this.updateTehranTime();
      await this.cleanupExpiredShortTerm();
      await this.cleanupExpiredMemory();
    } catch (error) {
      await this.logger.error(this.db, "memory", "initialization_error", {
        error: error.message,
      });
    }
  }

  async updateTehranTime() {
    const tehranOffset = 3.5 * 60 * 60 * 1000; // Tehran UTC+3.5
    this.tehranTime = new Date(Date.now() + tehranOffset);
  }

  // Short-term memory (7-day expiry)
  async saveShortTerm(chatId, type, content, importance = 1, metadata = {}) {
    const sessionId = chatId; // Simplified - using chat_id as session_id for now
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    try {
      await this.db
        .prepare(
          "INSERT INTO memory_short_term (session_id, type, content, importance, metadata, expires_at) VALUES (?, ?, ?, ?, ?, ?)"
        )
        .bind(sessionId, type, content, importance, JSON.stringify(metadata), expiresAt)
        .run();

      await this.logger.info(this.db, "memory", "short_term_saved", {
        chatId,
        type,
        content: content.substring(0, 100),
      });

      return { success: true };
    } catch (error) {
      await this.logger.error(this.db, "memory", "short_term_save_error", {
        error: error.message,
        chatId,
      });
      throw error;
    }
  }

  async getShortTerm(chatId, limit = 10) {
    try {
      const stmt = this.db
        .prepare(
          "SELECT * FROM memory_short_term WHERE session_id = ? AND expires_at > datetime('now') ORDER BY importance DESC, created_at DESC LIMIT ?"
        )
        .bind(chatId, limit);

      const results = await stmt.all();
      return results.results || [];
    } catch (error) {
      await this.logger.error(this.db, "memory", "short_term_retrieve_error", {
        error: error.message,
        chatId,
      });
      return [];
    }
  }

  async clearShortTerm(chatId) {
    try {
      await this.db
        .prepare("DELETE FROM memory_short_term WHERE session_id = ?")
        .bind(chatId)
        .run();

      await this.logger.info(this.db, "memory", "short_term_cleared", { chatId });
      return { success: true };
    } catch (error) {
      await this.logger.error(this.db, "memory", "short_term_clear_error", {
        error: error.message,
        chatId,
      });
      throw error;
    }
  }

  // Long-term memory
  async saveLongTerm(type, title, content, tags = [], importance = 1, source = "") {
    const expiresAt = null; // No expiration unless specified

    try {
      await this.db
        .prepare(
          "INSERT INTO memory_long_term (type, title, content, tags, importance, source, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(type, title, content, JSON.stringify(tags), importance, source, expiresAt)
        .run();

      await this.logger.info(this.db, "memory", "long_term_saved", {
        type,
        title: title.substring(0, 100),
      });

      return { success: true };
    } catch (error) {
      await this.logger.error(this.db, "memory", "long_term_save_error", {
        error: error.message,
        type,
      });
      throw error;
    }
  }

  async getLongTerm(filters = {}) {
    let query = "SELECT * FROM memory_long_term WHERE 1=1";
    const params = [];

    if (filters.type) {
      query += " AND type = ?";
      params.push(filters.type);
    }

    if (filters.tags) {
      query += " AND tags LIKE ?";
      params.push(`%${filters.tags}%`);
    }

    if (filters.search) {
      query += " AND (title LIKE ? OR content LIKE ?)";
      const searchTerm = `%${filters.search}%`;
      params.push(searchTerm, searchTerm);
    }

    query += " ORDER BY importance DESC, last_accessed_at DESC LIMIT 50";

    try {
      const stmt = this.db.prepare(query);
      const results = params.length > 0 ? await stmt.bind(...params).all() : await stmt.all();
      return results.results || [];
    } catch (error) {
      await this.logger.error(this.db, "memory", "long_term_retrieve_error", {
        error: error.message,
        filters,
      });
      return [];
    }
  }

  async updateLongTermAccess(id) {
    try {
      await this.db
        .prepare(
          "UPDATE memory_long_term SET last_accessed_at = datetime('now'), access_count = access_count + 1 WHERE id = ?"
        )
        .bind(id)
        .run();
    } catch (error) {
      await this.logger.error(this.db, "memory", "long_term_access_update_error", {
        error: error.message,
        id,
      });
    }
  }

  // Profile facts
  async upsertProfileFact(category, factKey, factValue, confidence = 0.5, source = "", isPermanent = true) {
    const existing = await this.db
      .prepare("SELECT id FROM profile_facts WHERE category = ? AND fact_key = ?")
      .bind(category, factKey)
      .first();

    const now = new Date().toISOString();

    if (existing) {
      // Update existing
      await this.db
        .prepare(
          "UPDATE profile_facts SET fact_value = ?, confidence = ?, source = ?, is_permanent = ?, updated_at = ? WHERE id = ?"
        )
        .bind(factValue, confidence, source, isPermanent ? 1 : 0, now, existing.id)
        .run();

      await this.logger.info(this.db, "memory", "profile_fact_updated", {
        category,
        factKey,
      });
    } else {
      // Insert new
      await this.db
        .prepare(
          "INSERT INTO profile_facts (category, fact_key, fact_value, confidence, source, is_permanent, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(category, factKey, factValue, confidence, source, isPermanent ? 1 : 0, now, now)
        .run();

      await this.logger.info(this.db, "memory", "profile_fact_created", {
        category,
        factKey,
      });
    }

    return { success: true };
  }

  async getProfileFacts(filters = {}) {
    let query = "SELECT * FROM profile_facts WHERE 1=1";
    const params = [];

    if (filters.category) {
      query += " AND category = ?";
      params.push(filters.category);
    }

    if (filters.isPermanent !== undefined) {
      query += " AND is_permanent = ?";
      params.push(filters.isPermanent ? 1 : 0);
    }

    query += " ORDER BY confidence DESC, updated_at DESC";

    try {
      const stmt = this.db.prepare(query);
      const results = params.length > 0 ? await stmt.bind(...params).all() : await stmt.all();
      return results.results || [];
    } catch (error) {
      await this.logger.error(this.db, "memory", "profile_facts_retrieve_error", {
        error: error.message,
        filters,
      });
      return [];
    }
  }

  // Cleanup
  async cleanupExpiredShortTerm() {
    try {
      const result = await this.db.prepare("DELETE FROM memory_short_term WHERE expires_at <= datetime('now')").run();
      await this.logger.info(this.db, "memory", "short_term_cleanup", {
        deleted: result.changes || 0,
      });
    } catch (error) {
      await this.logger.error(this.db, "memory", "short_term_cleanup_error", {
        error: error.message,
      });
    }
  }

  async cleanupExpiredMemory() {
    try {
      const result = await this.db.prepare("DELETE FROM memory_long_term WHERE expires_at <= datetime('now') AND expires_at IS NOT NULL").run();
      await this.logger.info(this.db, "memory", "long_term_cleanup", {
        deleted: result.changes || 0,
      });
    } catch (error) {
      await this.logger.error(this.db, "memory", "long_term_cleanup_error", {
        error: error.message,
      });
    }
  }

  async cleanupOldLogs() {
    try {
      // Keep only last 30 days of logs
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const result = await this.db.prepare("DELETE FROM logs WHERE created_at < ?").bind(cutoff).run();
      await this.logger.info(this.db, "memory", "logs_cleanup", {
        deleted: result.changes || 0,
      });
    } catch (error) {
      await this.logger.error(this.db, "memory", "logs_cleanup_error", {
        error: error.message,
      });
    }
  }

  // Memory retrieval for context
  async getRelevantMemory(chatId, messageText = "") {
    const contextParts = [];

    // Get short-term memory
    const shortTerm = await this.getShortTerm(chatId, 5);
    if (shortTerm.length > 0) {
      contextParts.push("Recent context (short-term):");
      for (const item of shortTerm) {
        contextParts.push(`- ${item.type}: ${item.content}`);
      }
    }

    // Get profile facts for personalization
    const profileFacts = await this.getProfileFacts({ isPermanent: 1 });
    if (profileFacts.length > 0) {
      contextParts.push("Profile information:");
      for (const fact of profileFacts.slice(0, 5)) {
        contextParts.push(`- ${fact.category}: ${fact.fact_key} = ${fact.fact_value}`);
      }
    }

    // Get recent projects for context
    const recentProjects = await this.db
      .prepare("SELECT * FROM projects WHERE status = 'active' AND metadata LIKE '%temporary%' ORDER BY updated_at DESC LIMIT 3")
      .all();

    if (recentProjects.results && recentProjects.results.length > 0) {
      contextParts.push("Active temporary projects:");
      for (const project of recentProjects.results) {
        const metadata = JSON.parse(project.metadata || "{}");
        contextParts.push(`- ${metadata.topic || project.name}: ${project.next_action}`);
      }
    }

    return contextParts.join("\n\n");
  }
}