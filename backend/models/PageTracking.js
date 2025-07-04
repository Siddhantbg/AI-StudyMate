module.exports = (sequelize, DataTypes) => {
  const PageTracking = sequelize.define('PageTracking', {
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
    page_number: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 1
      }
    },
    time_spent: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0, // Time spent on page in seconds
      validate: {
        min: 0
      }
    },
    visit_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1, // Number of times this page was visited
      validate: {
        min: 1
      }
    },
    session_id: {
      type: DataTypes.UUID,
      allowNull: true, // Link to user session if needed
      references: {
        model: 'user_sessions',
        key: 'id'
      }
    },
    first_visit: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    last_visit: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    reading_progress: {
      type: DataTypes.DECIMAL(5, 2),
      defaultValue: 0.0,
      validate: {
        min: 0,
        max: 100
      }
      // Percentage of page that was "read" (scrolled through, time spent, etc.)
    },
    scroll_depth: {
      type: DataTypes.DECIMAL(5, 2),
      defaultValue: 0.0,
      validate: {
        min: 0,
        max: 100
      }
      // Maximum scroll depth reached on this page (percentage)
    },
    zoom_levels_used: {
      type: DataTypes.ARRAY(DataTypes.DECIMAL),
      defaultValue: [], // Track different zoom levels used on this page
    },
    annotations_created: {
      type: DataTypes.INTEGER,
      defaultValue: 0 // Number of annotations created on this page
    },
    focus_sessions: {
      type: DataTypes.JSONB,
      defaultValue: [],
      // Structure: [{ start_time, end_time, duration, focus_score }, ...]
    },
    reading_speed: {
      type: DataTypes.DECIMAL(8, 2),
      allowNull: true // Words per minute (if text content is available)
    },
    interaction_events: {
      type: DataTypes.JSONB,
      defaultValue: {},
      // Structure: { clicks: 0, highlights: 0, comments: 0, drawings: 0, etc. }
    },
    comprehension_score: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true, // Score from quizzes related to this page content
      validate: {
        min: 0,
        max: 100
      }
    },
    difficulty_rating: {
      type: DataTypes.INTEGER,
      allowNull: true, // User's subjective difficulty rating (1-5)
      validate: {
        min: 1,
        max: 5
      }
    },
    bookmarked: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true // User's notes about this specific page
    },
    tags: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: [] // User-defined tags for this page
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {},
      // Additional tracking data: device_type, screen_size, etc.
    }
  }, {
    tableName: 'page_tracking',
    indexes: [
      {
        fields: ['user_id']
      },
      {
        fields: ['file_id']
      },
      {
        fields: ['page_number']
      },
      {
        fields: ['session_id']
      },
      {
        fields: ['user_id', 'file_id'] // Composite index for user file tracking
      },
      {
        fields: ['user_id', 'file_id', 'page_number'], // Unique constraint alternative
        unique: true
      },
      {
        fields: ['time_spent']
      },
      {
        fields: ['reading_progress']
      },
      {
        fields: ['bookmarked']
      },
      {
        fields: ['tags'],
        using: 'gin' // GIN index for array fields
      }
    ]
  });

  // Instance methods
  PageTracking.prototype.addReadingTime = async function(additionalTime, sessionId = null) {
    this.time_spent += additionalTime;
    this.last_visit = new Date();
    this.visit_count += 1;
    
    if (sessionId) {
      this.session_id = sessionId;
    }
    
    await this.save();
  };

  PageTracking.prototype.updateScrollDepth = async function(depth) {
    if (depth > this.scroll_depth) {
      this.scroll_depth = depth;
      await this.save();
    }
  };

  PageTracking.prototype.updateReadingProgress = async function(progress) {
    if (progress > this.reading_progress) {
      this.reading_progress = progress;
      await this.save();
    }
  };

  PageTracking.prototype.addZoomLevel = async function(zoomLevel) {
    if (!this.zoom_levels_used.includes(zoomLevel)) {
      this.zoom_levels_used = [...this.zoom_levels_used, zoomLevel];
      await this.save();
    }
  };

  PageTracking.prototype.incrementAnnotations = async function() {
    this.annotations_created += 1;
    await this.save();
  };

  PageTracking.prototype.addFocusSession = async function(startTime, endTime, focusScore = null) {
    const duration = Math.floor((endTime - startTime) / 1000); // Duration in seconds
    
    const focusSession = {
      start_time: startTime,
      end_time: endTime,
      duration: duration,
      focus_score: focusScore
    };
    
    this.focus_sessions = [...this.focus_sessions, focusSession];
    await this.save();
  };

  PageTracking.prototype.updateInteractionEvent = async function(eventType) {
    this.interaction_events = {
      ...this.interaction_events,
      [eventType]: (this.interaction_events[eventType] || 0) + 1
    };
    await this.save();
  };

  PageTracking.prototype.setComprehensionScore = async function(score) {
    this.comprehension_score = score;
    await this.save();
  };

  PageTracking.prototype.setDifficultyRating = async function(rating) {
    this.difficulty_rating = rating;
    await this.save();
  };

  PageTracking.prototype.toggleBookmark = async function() {
    this.bookmarked = !this.bookmarked;
    await this.save();
  };

  PageTracking.prototype.updateNotes = async function(notes) {
    this.notes = notes;
    await this.save();
  };

  PageTracking.prototype.addTag = async function(tag) {
    if (!this.tags.includes(tag)) {
      this.tags = [...this.tags, tag];
      await this.save();
    }
  };

  PageTracking.prototype.removeTag = async function(tag) {
    this.tags = this.tags.filter(t => t !== tag);
    await this.save();
  };

  PageTracking.prototype.getReadingStats = function() {
    const totalFocusTime = this.focus_sessions.reduce((total, session) => total + session.duration, 0);
    const averageFocusScore = this.focus_sessions.length > 0 
      ? this.focus_sessions.reduce((sum, session) => sum + (session.focus_score || 0), 0) / this.focus_sessions.length 
      : null;

    return {
      page_number: this.page_number,
      time_spent: this.time_spent,
      visit_count: this.visit_count,
      reading_progress: this.reading_progress,
      scroll_depth: this.scroll_depth,
      annotations_created: this.annotations_created,
      total_focus_time: totalFocusTime,
      average_focus_score: averageFocusScore,
      comprehension_score: this.comprehension_score,
      difficulty_rating: this.difficulty_rating,
      interaction_events: this.interaction_events,
      first_visit: this.first_visit,
      last_visit: this.last_visit
    };
  };

  PageTracking.prototype.getPublicData = function() {
    return {
      id: this.id,
      page_number: this.page_number,
      reading_stats: this.getReadingStats(),
      bookmarked: this.bookmarked,
      notes: this.notes,
      tags: this.tags,
      created_at: this.created_at,
      updated_at: this.updated_at
    };
  };

  // Class methods
  PageTracking.findOrCreateForPage = async function(userId, fileId, pageNumber) {
    const [pageTracking, created] = await this.findOrCreate({
      where: {
        user_id: userId,
        file_id: fileId,
        page_number: pageNumber
      },
      defaults: {
        user_id: userId,
        file_id: fileId,
        page_number: pageNumber,
        time_spent: 0,
        visit_count: 1,
        first_visit: new Date(),
        last_visit: new Date()
      }
    });

    if (!created) {
      // Update visit count and last visit time
      pageTracking.visit_count += 1;
      pageTracking.last_visit = new Date();
      await pageTracking.save();
    }

    return pageTracking;
  };

  PageTracking.getFileProgress = async function(userId, fileId) {
    const pageStats = await this.findAll({
      where: {
        user_id: userId,
        file_id: fileId
      },
      order: [['page_number', 'ASC']]
    });

    const totalTime = pageStats.reduce((sum, page) => sum + page.time_spent, 0);
    const totalPages = pageStats.length;
    const completedPages = pageStats.filter(page => page.reading_progress >= 80).length; // 80% considered "completed"
    const lastReadPage = pageStats.length > 0 ? Math.max(...pageStats.map(page => page.page_number)) : 0;

    return {
      total_pages_visited: totalPages,
      completed_pages: completedPages,
      completion_rate: totalPages > 0 ? (completedPages / totalPages * 100).toFixed(2) : 0,
      total_reading_time: totalTime,
      average_time_per_page: totalPages > 0 ? (totalTime / totalPages).toFixed(2) : 0,
      last_read_page: lastReadPage,
      page_details: pageStats.map(page => page.getReadingStats())
    };
  };

  PageTracking.getUserReadingStats = async function(userId, startDate = null, endDate = null) {
    const whereClause = { user_id: userId };
    
    if (startDate) {
      whereClause.last_visit = { [sequelize.Sequelize.Op.gte]: startDate };
    }
    
    if (endDate) {
      whereClause.last_visit = {
        ...whereClause.last_visit,
        [sequelize.Sequelize.Op.lte]: endDate
      };
    }

    const pageStats = await this.findAll({
      where: whereClause,
      include: [{
        model: sequelize.models.File,
        as: 'file',
        attributes: ['id', 'display_name', 'original_name']
      }]
    });

    const totalTime = pageStats.reduce((sum, page) => sum + page.time_spent, 0);
    const totalPages = pageStats.length;
    const uniqueFiles = [...new Set(pageStats.map(page => page.file_id))].length;
    const averageReadingSpeed = pageStats.filter(p => p.reading_speed).length > 0 
      ? pageStats.filter(p => p.reading_speed).reduce((sum, p) => sum + p.reading_speed, 0) / pageStats.filter(p => p.reading_speed).length
      : null;

    return {
      total_reading_time: totalTime,
      total_pages_read: totalPages,
      unique_files_read: uniqueFiles,
      average_reading_speed: averageReadingSpeed,
      reading_sessions: pageStats.length
    };
  };

  return PageTracking;
};