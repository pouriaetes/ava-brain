// Project management: create, update, complete, follow-ups, archive to long-term memory
import { log } from "./logger.js";

export class ProjectManager {
  constructor(config, crypto, logger, db) {
    this.config = config;
    this.crypto = crypto;
    this.logger = logger;
    this.db = db;
  }

  // Create a new project
  async createProject({ name, client = "", deadlineUtc = null, importance = 1, notes = "", metadata = {} }) {
    try {
      const metaJson = JSON.stringify(metadata);
      const result = await this.db
        .prepare(
          "INSERT INTO projects (name, client, deadline_utc, importance, notes, metadata) VALUES (?, ?, ?, ?, ?, ?)"
        )
        .bind(name, client, deadlineUtc, importance, notes, metaJson)
        .run();

      const projectId = result.meta?.last_row_id || null;

      await this.logger.info(this.db, "projects", "created", {
        projectId,
        name,
        temporary: metadata.temporary || false,
      });

      return { id: projectId, success: true };
    } catch (error) {
      await this.logger.error(this.db, "projects", "create_error", { error: error.message, name });
      throw error;
    }
  }

  // Get active projects
  async getActiveProjects(limit = 20) {
    try {
      const results = await this.db
        .prepare("SELECT * FROM projects WHERE status = 'active' ORDER BY updated_at DESC LIMIT ?")
        .bind(limit)
        .all();

      return results.results || [];
    } catch (error) {
      await this.logger.error(this.db, "projects", "active_error", { error: error.message });
      return [];
    }
  }

  // Get temporary projects with follow-up enabled
  async getFollowUpProjects() {
    try {
      const results = await this.db
        .prepare("SELECT * FROM projects WHERE status = 'active' AND metadata LIKE '%follow_up_enabled%true%'")
        .all();

      return results.results || [];
    } catch (error) {
      await this.logger.error(this.db, "projects", "followup_error", { error: error.message });
      return [];
    }
  }

  // Update project
  async updateProject(projectId, updates) {
    try {
      const allowedFields = ["name", "client", "status", "deadline_utc", "progress_percent", "next_action", "importance", "notes", "metadata"];
      const fields = [];
      const values = [];

      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key)) {
          fields.push(`${key} = ?`);
          values.push(key === "metadata" ? JSON.stringify(value) : value);
        }
      }

      if (fields.length === 0) return { success: false, error: "No valid fields to update" };

      values.push(projectId);
      const query = `UPDATE projects SET ${fields.join(", ")}, updated_at = datetime('now') WHERE id = ?`;
      await this.db.prepare(query).bind(...values).run();

      await this.logger.info(this.db, "projects", "updated", { projectId, updates: Object.keys(updates) });
      return { success: true };
    } catch (error) {
      await this.logger.error(this.db, "projects", "update_error", { error: error.message, projectId });
      throw error;
    }
  }

  // Mark project complete and archive to long-term memory
  async completeProject(projectId, finalNote = "") {
    try {
      const project = await this.db.prepare("SELECT * FROM projects WHERE id = ?").bind(projectId).first();
      if (!project) return { success: false, error: "Project not found" };

      const metadata = JSON.parse(project.metadata || "{}");
      const duration = this.calculateDuration(project.created_at, new Date().toISOString());
      const topic = metadata.topic || project.name;

      // Update project status
      await this.db
        .prepare(
          "UPDATE projects SET status = 'completed', progress_percent = 100, metadata = ?, updated_at = datetime('now') WHERE id = ?"
        )
        .bind(JSON.stringify({ ...metadata, follow_up_enabled: false, completed_at: new Date().toISOString(), actual_duration_text: duration }), projectId)
        .run();

      // Add final update note
      if (finalNote) {
        await this.db
          .prepare("INSERT INTO project_updates (project_id, note, progress_percent) VALUES (?, ?, 100)")
          .bind(projectId, finalNote)
          .run();
      }

      // Clear related short-term memory
      await this.db
        .prepare("DELETE FROM memory_short_term WHERE metadata LIKE ?")
        .bind(`%"project_id":${projectId}%`)
        .run();

      // Archive to long-term memory
      await this.db
        .prepare(
          "INSERT INTO memory_long_term (type, title, content, tags, importance, source) VALUES (?, ?, ?, ?, ?, ?)"
        )
        .bind(
          "project_completed",
          `Completed project: ${project.name}`,
          `Topic: ${topic}\nDuration: ${duration}\nResult: ${finalNote || "Completed"}\nNotes: ${project.notes || ""}`,
          JSON.stringify(["project", "completed", topic.toLowerCase().replace(/\s+/g, "_")]),
          project.importance,
          "project_completion"
        )
        .run();

      await this.logger.info(this.db, "projects", "completed", { projectId, project: project.name });
      return { success: true };
    } catch (error) {
      await this.logger.error(this.db, "projects", "complete_error", { error: error.message, projectId });
      throw error;
    }
  }

  // Create project update
  async addProjectUpdate(projectId, note, progressPercent = null) {
    try {
      if (progressPercent !== null) {
        await this.db
          .prepare("UPDATE projects SET progress_percent = ?, updated_at = datetime('now') WHERE id = ?")
          .bind(progressPercent, projectId)
          .run();
      }

      await this.db
        .prepare("INSERT INTO project_updates (project_id, note, progress_percent) VALUES (?, ?, ?)")
        .bind(projectId, note, progressPercent || 0)
        .run();

      await this.logger.info(this.db, "projects", "update_added", { projectId, progressPercent });
      return { success: true };
    } catch (error) {
      await this.logger.error(this.db, "projects", "update_add_error", { error: error.message, projectId });
      throw error;
    }
  }

  // Check if deadline passed and not completed
  async getOverdueProjects() {
    try {
      const results = await this.db
        .prepare("SELECT * FROM projects WHERE status = 'active' AND deadline_utc < datetime('now') ORDER BY deadline_utc ASC")
        .all();

      return results.results || [];
    } catch (error) {
      await this.logger.error(this.db, "projects", "overdue_error", { error: error.message });
      return [];
    }
  }

  // Update follow-up status to avoid multiple daily follow-ups
  async recordFollowUpSent(projectId) {
    try {
      const metadata = JSON.parse((await this.db.prepare("SELECT metadata FROM projects WHERE id = ?").bind(projectId).first())?.metadata || "{}");
      metadata.last_follow_up_at = new Date().toISOString();

      await this.db
        .prepare("UPDATE projects SET metadata = ?, updated_at = datetime('now') WHERE id = ?")
        .bind(JSON.stringify(metadata), projectId)
        .run();
    } catch (error) {
      await this.logger.error(this.db, "projects", "followup_record_error", { error: error.message, projectId });
    }
  }

  // Determine if a follow-up should be sent today
  async shouldSendFollowUp(projectId) {
    try {
      const project = await this.db.prepare("SELECT * FROM projects WHERE id = ?").bind(projectId).first();
      if (!project) return false;

      const metadata = JSON.parse(project.metadata || "{}");
      if (!metadata.follow_up_enabled) return false;

      const lastFollowUp = metadata.last_follow_up_at;
      if (!lastFollowUp) return true;

      const lastDate = new Date(lastFollowUp).toDateString();
      const today = new Date().toDateString();
      return lastDate !== today;
    } catch (error) {
      await this.logger.error(this.db, "projects", "followup_check_error", { error: error.message, projectId });
      return false;
    }
  }

  // Helper to calculate duration text
  calculateDuration(startIso, endIso) {
    const start = new Date(startIso);
    const end = new Date(endIso);
    const diffMs = end - start;
    const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
    const diffHours = Math.floor((diffMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));

    if (diffDays > 0) {
      return `${diffDays} day${diffDays !== 1 ? "s" : ""}${diffHours > 0 ? ` and ${diffHours} hour${diffHours !== 1 ? "s" : ""}` : ""}`;
    }
    if (diffHours > 0) {
      return `${diffHours} hour${diffHours !== 1 ? "s" : ""}`;
    }
    return "less than an hour";
  }
}