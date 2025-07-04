module.exports = (sequelize, DataTypes) => {
  const PDFSession = sequelize.define('PDFSession', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    file_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'files',
        key: 'id'
      }
    },
    session_name: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null // Optional session name for user organization
    },
    current_page: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      validate: {
        min: 1
      }
    },
    zoom_level: {
      type: DataTypes.DECIMAL(5, 2),
      defaultValue: 1.0,
      validate: {
        min: 0.1,
        max: 10.0
      }
    },
    scroll_position: {
      type: DataTypes.JSONB,
      defaultValue: { x: 0, y: 0 },
      // Structure: { x: number, y: number }
    },
    view_mode: {
      type: DataTypes.ENUM('single', 'continuous', 'fit-width', 'fit-height'),
      defaultValue: 'single'
    },
    total_pages: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1
    },
    reading_progress: {
      type: DataTypes.DECIMAL(5, 2),
      defaultValue: 0.0,
      validate: {
        min: 0,
        max: 100
      }
      // Overall reading progress as percentage
    },
    session_duration: {
      type: DataTypes.INTEGER,
      defaultValue: 0, // Total time spent in seconds
      validate: {
        min: 0
      }
    },
    last_accessed: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    auto_save_enabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    last_auto_save: {
      type: DataTypes.DATE,
      allowNull: true
    },
    last_manual_save: {
      type: DataTypes.DATE,
      allowNull: true
    },
    annotation_summary: {
      type: DataTypes.JSONB,
      defaultValue: {
        highlights: 0,
        underlines: 0,
        drawings: 0,
        sticky_notes: 0,
        ai_highlights: 0,
        total: 0
      }
      // Quick summary of annotations for this session
    },
    page_time_tracking: {
      type: DataTypes.JSONB,
      defaultValue: {},
      // Structure: { "1": 120, "2": 180, "3": 95, ... } - time in seconds per page
    },
    bookmarked_pages: {
      type: DataTypes.ARRAY(DataTypes.INTEGER),
      defaultValue: [] // Array of page numbers that are bookmarked
    },
    session_notes: {
      type: DataTypes.TEXT,
      allowNull: true // General notes about the reading session
    },
    reading_goals: {
      type: DataTypes.JSONB,
      defaultValue: {},
      // Structure: { target_pages: 10, target_time: 3600, completion_date: "2024-01-01", completed: false }
    },
    focus_metrics: {
      type: DataTypes.JSONB,
      defaultValue: {
        total_focus_time: 0,
        distraction_count: 0,
        average_focus_duration: 0,
        focus_sessions: []
      }
      // Focus tracking metrics
    },
    ai_interaction_history: {
      type: DataTypes.JSONB,
      defaultValue: {
        summaries_generated: 0,
        explanations_requested: 0,
        quizzes_taken: 0,
        last_ai_request: null
      }
      // Track AI feature usage
    },
    device_info: {
      type: DataTypes.JSONB,
      defaultValue: {},
      // Structure: { device_type: "desktop", screen_size: "1920x1080", browser: "Chrome", os: "Windows" }
    },
    sync_status: {
      type: DataTypes.ENUM('synced', 'pending', 'conflict', 'offline'),
      defaultValue: 'synced'
    },
    last_sync: {
      type: DataTypes.DATE,
      allowNull: true
    },
    version: {
      type: DataTypes.INTEGER,
      defaultValue: 1 // For conflict resolution
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    session_metadata: {
      type: DataTypes.JSONB,
      defaultValue: {},
      // Additional session data: theme, preferences, temporary settings
    }
  }, {
    tableName: 'pdf_sessions',
    indexes: [
      {
        fields: ['user_id']
      },
      {
        fields: ['file_id']
      },
      {
        fields: ['user_id', 'file_id'], // Composite index for user file sessions
        unique: true // One active session per user per file
      },
      {
        fields: ['last_accessed']
      },
      {
        fields: ['sync_status']
      },
      {
        fields: ['is_active']
      },
      {
        fields: ['auto_save_enabled']
      },
      {
        fields: ['bookmarked_pages'],
        using: 'gin' // GIN index for array fields
      }
    ]
  });

  // Instance methods
  PDFSession.prototype.updateCurrentPage = async function(pageNumber) {
    this.current_page = pageNumber;
    this.last_accessed = new Date();
    await this.save();
  };

  PDFSession.prototype.updateZoomLevel = async function(zoomLevel) {
    this.zoom_level = zoomLevel;
    await this.save();
  };

  PDFSession.prototype.updateScrollPosition = async function(x, y) {
    this.scroll_position = { x, y };
    await this.save();
  };

  PDFSession.prototype.addPageTime = async function(pageNumber, timeSpent) {
    this.page_time_tracking = {
      ...this.page_time_tracking,
      [pageNumber]: (this.page_time_tracking[pageNumber] || 0) + timeSpent
    };
    this.session_duration += timeSpent;
    this.last_accessed = new Date();
    await this.save();
  };

  PDFSession.prototype.updateAnnotationSummary = async function(annotations) {
    const summary = {
      highlights: 0,
      underlines: 0,
      drawings: 0,
      sticky_notes: 0,
      ai_highlights: 0,
      total: annotations.length
    };

    annotations.forEach(annotation => {
      if (annotation.ai_generated) {
        summary.ai_highlights++;
      } else {
        summary[annotation.annotation_type + 's'] = (summary[annotation.annotation_type + 's'] || 0) + 1;
      }
    });

    this.annotation_summary = summary;
    await this.save();
  };

  PDFSession.prototype.toggleBookmark = async function(pageNumber) {
    const bookmarks = [...this.bookmarked_pages];
    const index = bookmarks.indexOf(pageNumber);
    
    if (index === -1) {
      bookmarks.push(pageNumber);
    } else {
      bookmarks.splice(index, 1);
    }
    
    this.bookmarked_pages = bookmarks;
    await this.save();
  };

  PDFSession.prototype.updateReadingProgress = async function(progress) {
    if (progress > this.reading_progress) {
      this.reading_progress = progress;
      await this.save();
    }
  };

  PDFSession.prototype.recordFocusSession = async function(startTime, endTime, distractionCount = 0) {
    const duration = Math.floor((endTime - startTime) / 1000);
    
    this.focus_metrics = {
      ...this.focus_metrics,
      total_focus_time: this.focus_metrics.total_focus_time + duration,
      distraction_count: this.focus_metrics.distraction_count + distractionCount,
      focus_sessions: [
        ...this.focus_metrics.focus_sessions,
        { start_time: startTime, end_time: endTime, duration, distractions: distractionCount }
      ]
    };
    
    // Calculate average focus duration
    const sessions = this.focus_metrics.focus_sessions;
    this.focus_metrics.average_focus_duration = sessions.length > 0 
      ? sessions.reduce((sum, session) => sum + session.duration, 0) / sessions.length 
      : 0;

    await this.save();
  };

  PDFSession.prototype.recordAIInteraction = async function(interactionType) {
    this.ai_interaction_history = {
      ...this.ai_interaction_history,
      [interactionType]: (this.ai_interaction_history[interactionType] || 0) + 1,
      last_ai_request: new Date()
    };
    await this.save();
  };

  PDFSession.prototype.performManualSave = async function() {
    this.last_manual_save = new Date();
    this.sync_status = 'synced';
    this.last_sync = new Date();
    await this.save();
  };

  PDFSession.prototype.performAutoSave = async function() {
    if (this.auto_save_enabled) {
      this.last_auto_save = new Date();
      this.sync_status = 'synced';
      this.last_sync = new Date();
      await this.save();
    }
  };

  PDFSession.prototype.markAsConflicted = async function() {
    this.sync_status = 'conflict';
    this.version += 1;
    await this.save();
  };

  PDFSession.prototype.resolveConflict = async function() {
    this.sync_status = 'synced';
    this.last_sync = new Date();
    await this.save();
  };

  PDFSession.prototype.getSessionSummary = function() {
    const totalPageTime = Object.values(this.page_time_tracking).reduce((sum, time) => sum + time, 0);
    const averagePageTime = Object.keys(this.page_time_tracking).length > 0 
      ? totalPageTime / Object.keys(this.page_time_tracking).length 
      : 0;

    return {
      id: this.id,
      current_page: this.current_page,
      total_pages: this.total_pages,
      reading_progress: this.reading_progress,
      session_duration: this.session_duration,
      total_page_time: totalPageTime,
      average_page_time: Math.round(averagePageTime),
      pages_visited: Object.keys(this.page_time_tracking).length,
      bookmarked_pages: this.bookmarked_pages.length,
      annotation_summary: this.annotation_summary,
      focus_metrics: this.focus_metrics,
      ai_interaction_history: this.ai_interaction_history,
      last_accessed: this.last_accessed,
      sync_status: this.sync_status,
      auto_save_enabled: this.auto_save_enabled
    };
  };

  PDFSession.prototype.getFullSessionData = function() {
    return {
      id: this.id,
      current_page: this.current_page,
      zoom_level: this.zoom_level,
      scroll_position: this.scroll_position,
      view_mode: this.view_mode,
      total_pages: this.total_pages,
      reading_progress: this.reading_progress,
      session_duration: this.session_duration,
      page_time_tracking: this.page_time_tracking,
      bookmarked_pages: this.bookmarked_pages,
      session_notes: this.session_notes,
      reading_goals: this.reading_goals,
      focus_metrics: this.focus_metrics,
      ai_interaction_history: this.ai_interaction_history,
      annotation_summary: this.annotation_summary,
      device_info: this.device_info,
      sync_status: this.sync_status,
      last_sync: this.last_sync,
      auto_save_enabled: this.auto_save_enabled,
      last_auto_save: this.last_auto_save,
      last_manual_save: this.last_manual_save,
      last_accessed: this.last_accessed,
      created_at: this.created_at,
      updated_at: this.updated_at
    };
  };

  // Class methods
  PDFSession.findOrCreateSession = async function(userId, fileId, deviceInfo = {}) {
    const [session, created] = await this.findOrCreate({
      where: {
        user_id: userId,
        file_id: fileId,
        is_active: true
      },
      defaults: {
        user_id: userId,
        file_id: fileId,
        device_info: deviceInfo,
        last_accessed: new Date()
      }
    });

    if (!created) {
      // Update last accessed time
      session.last_accessed = new Date();
      await session.save();
    }

    return session;
  };

  PDFSession.getUserSessions = async function(userId, includeInactive = false) {
    const whereClause = { user_id: userId };
    if (!includeInactive) {
      whereClause.is_active = true;
    }

    return await this.findAll({
      where: whereClause,
      include: [{
        model: sequelize.models.File,
        as: 'file',
        attributes: ['id', 'display_name', 'original_name', 'file_size', 'created_at']
      }],
      order: [['last_accessed', 'DESC']]
    });
  };

  PDFSession.getSessionsNeedingSync = async function(userId = null) {
    const whereClause = {
      sync_status: ['pending', 'conflict']
    };
    
    if (userId) {
      whereClause.user_id = userId;
    }

    return await this.findAll({
      where: whereClause,
      order: [['last_accessed', 'DESC']]
    });
  };

  PDFSession.cleanupOldSessions = async function(daysOld = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    return await this.update(
      { is_active: false },
      {
        where: {
          last_accessed: {
            [sequelize.Sequelize.Op.lt]: cutoffDate
          },
          is_active: true
        }
      }
    );
  };

  return PDFSession;
};