const mongoose = require('mongoose');

const PDFSessionSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  file_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'File',
    required: true,
    index: true
  },
  session_id: {
    type: String,
    required: true
  },
  session_name: {
    type: String,
    default: null // User-defined session name
  },
  start_time: {
    type: Date,
    default: Date.now,
    index: true
  },
  end_time: {
    type: Date,
    default: null
  },
  is_active: {
    type: Boolean,
    default: true,
    index: true
  },
  current_page: {
    type: Number,
    default: 1,
    min: 1
  },
  total_pages_visited: {
    type: Number,
    default: 0
  },
  session_duration: {
    type: Number,
    default: 0 // Total session time in seconds
  },
  reading_state: {
    zoom_level: { type: Number, default: 1.0 },
    scroll_position: { type: Number, default: 0 },
    view_mode: { 
      type: String, 
      enum: ['single', 'continuous', 'facing'], 
      default: 'single' 
    },
    sidebar_open: { type: Boolean, default: true },
    theme: { type: String, default: 'forest' },
    annotations_visible: { type: Boolean, default: true },
    toolbar_visible: { type: Boolean, default: true }
  },
  navigation_history: [{
    page_number: { type: Number, required: true },
    timestamp: { type: Date, default: Date.now },
    method: { 
      type: String, 
      enum: ['click', 'keyboard', 'search', 'bookmark', 'auto'],
      default: 'click'
    },
    time_spent: { type: Number, default: 0 } // seconds on previous page
  }],
  bookmarks: [{
    page_number: { type: Number, required: true },
    title: { type: String, default: null },
    note: { type: String, default: null },
    created_at: { type: Date, default: Date.now }
  }],
  session_notes: {
    type: String,
    default: null // General notes for this reading session
  },
  goals: {
    target_pages: { type: Number, default: null },
    target_time: { type: Number, default: null }, // in minutes
    completion_target: { type: Number, default: 100 }, // percentage
    custom_goals: [{ 
      description: { type: String },
      completed: { type: Boolean, default: false },
      created_at: { type: Date, default: Date.now }
    }]
  },
  achievements: [{
    type: { 
      type: String,
      enum: ['pages_read', 'time_spent', 'annotations_made', 'consecutive_days', 'completion'],
      required: true
    },
    value: { type: Number, required: true },
    earned_at: { type: Date, default: Date.now },
    description: { type: String }
  }],
  performance_metrics: {
    reading_speed: { type: Number, default: null }, // pages per hour
    focus_score: { type: Number, min: 0, max: 100, default: null },
    comprehension_score: { type: Number, min: 0, max: 100, default: null },
    engagement_score: { type: Number, min: 0, max: 100, default: null },
    efficiency_score: { type: Number, min: 0, max: 100, default: null }
  },
  interruptions: [{
    start_time: { type: Date, required: true },
    end_time: { type: Date, default: null },
    reason: { 
      type: String,
      enum: ['user_action', 'idle_timeout', 'browser_blur', 'system'],
      default: 'user_action'
    },
    duration: { type: Number, default: 0 } // in seconds
  }],
  device_info: {
    screen_resolution: { type: String, default: null },
    device_type: { type: String, default: 'desktop' },
    browser: { type: String, default: null },
    platform: { type: String, default: null }
  },
  sync_status: {
    last_sync: { type: Date, default: Date.now },
    is_synced: { type: Boolean, default: true },
    sync_version: { type: Number, default: 1 },
    conflicts: [{ 
      field: { type: String },
      local_value: { type: mongoose.Schema.Types.Mixed },
      remote_value: { type: mongoose.Schema.Types.Mixed },
      timestamp: { type: Date, default: Date.now }
    }]
  },
  privacy_settings: {
    track_reading_patterns: { type: Boolean, default: true },
    share_analytics: { type: Boolean, default: false },
    save_history: { type: Boolean, default: true }
  },
  tags: {
    type: [String],
    default: []
  },
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: () => new Map()
  }
}, {
  timestamps: { 
    createdAt: 'created_at', 
    updatedAt: 'updated_at' 
  }
});

// Compound indexes for performance
PDFSessionSchema.index({ user_id: 1, file_id: 1 });
PDFSessionSchema.index({ user_id: 1, is_active: 1 });
PDFSessionSchema.index({ user_id: 1, start_time: -1 });
PDFSessionSchema.index({ file_id: 1, is_active: 1 });
PDFSessionSchema.index({ session_id: 1 }, { unique: true });

// Pre-save middleware
PDFSessionSchema.pre('save', function(next) {
  // Calculate session duration if end_time is set
  if (this.end_time && this.start_time) {
    this.session_duration = Math.floor((this.end_time - this.start_time) / 1000);
  }
  
  // Update sync status
  this.sync_status.last_sync = new Date();
  
  next();
});

// Instance methods
PDFSessionSchema.methods.endSession = async function() {
  this.end_time = new Date();
  this.is_active = false;
  this.session_duration = Math.floor((this.end_time - this.start_time) / 1000);
  return await this.save();
};

PDFSessionSchema.methods.updateCurrentPage = async function(pageNumber, method = 'click') {
  // Add to navigation history
  if (this.current_page !== pageNumber) {
    const timeSpent = this.navigation_history.length > 0 ? 
      Math.floor((Date.now() - this.navigation_history[this.navigation_history.length - 1].timestamp) / 1000) : 0;
    
    this.navigation_history.push({
      page_number: this.current_page,
      timestamp: new Date(),
      method: method,
      time_spent: timeSpent
    });
    
    this.current_page = pageNumber;
    this.total_pages_visited += 1;
  }
  
  return await this.save();
};

PDFSessionSchema.methods.addBookmark = async function(pageNumber, title = null, note = null) {
  const existingBookmark = this.bookmarks.find(b => b.page_number === pageNumber);
  
  if (!existingBookmark) {
    this.bookmarks.push({
      page_number: pageNumber,
      title: title || `Page ${pageNumber}`,
      note: note,
      created_at: new Date()
    });
    return await this.save();
  }
  
  return this;
};

PDFSessionSchema.methods.removeBookmark = async function(pageNumber) {
  this.bookmarks = this.bookmarks.filter(b => b.page_number !== pageNumber);
  return await this.save();
};

PDFSessionSchema.methods.updateReadingState = async function(state) {
  Object.assign(this.reading_state, state);
  return await this.save();
};

PDFSessionSchema.methods.addInterruption = async function(reason = 'user_action') {
  this.interruptions.push({
    start_time: new Date(),
    reason: reason
  });
  return await this.save();
};

PDFSessionSchema.methods.endInterruption = async function() {
  const lastInterruption = this.interruptions[this.interruptions.length - 1];
  if (lastInterruption && !lastInterruption.end_time) {
    lastInterruption.end_time = new Date();
    lastInterruption.duration = Math.floor((lastInterruption.end_time - lastInterruption.start_time) / 1000);
  }
  return await this.save();
};

PDFSessionSchema.methods.addGoal = async function(description) {
  this.goals.custom_goals.push({
    description: description,
    completed: false,
    created_at: new Date()
  });
  return await this.save();
};

PDFSessionSchema.methods.completeGoal = async function(goalIndex) {
  if (this.goals.custom_goals[goalIndex]) {
    this.goals.custom_goals[goalIndex].completed = true;
  }
  return await this.save();
};

PDFSessionSchema.methods.addAchievement = async function(type, value, description = null) {
  this.achievements.push({
    type: type,
    value: value,
    earned_at: new Date(),
    description: description
  });
  return await this.save();
};

PDFSessionSchema.methods.calculatePerformanceMetrics = async function() {
  // Calculate reading speed (pages per hour)
  if (this.session_duration > 0 && this.total_pages_visited > 0) {
    this.performance_metrics.reading_speed = (this.total_pages_visited / (this.session_duration / 3600)).toFixed(2);
  }
  
  // Calculate focus score based on interruptions
  const totalInterruptionTime = this.interruptions.reduce((total, int) => total + (int.duration || 0), 0);
  const focusTime = Math.max(0, this.session_duration - totalInterruptionTime);
  this.performance_metrics.focus_score = this.session_duration > 0 ? 
    Math.round((focusTime / this.session_duration) * 100) : 100;
  
  return await this.save();
};

PDFSessionSchema.methods.getSessionSummary = function() {
  return {
    id: this._id,
    session_id: this.session_id,
    session_name: this.session_name,
    start_time: this.start_time,
    end_time: this.end_time,
    is_active: this.is_active,
    current_page: this.current_page,
    total_pages_visited: this.total_pages_visited,
    session_duration: this.session_duration,
    reading_state: this.reading_state,
    bookmarks_count: this.bookmarks.length,
    goals: this.goals,
    achievements_count: this.achievements.length,
    performance_metrics: this.performance_metrics,
    interruptions_count: this.interruptions.length
  };
};

// Static methods
PDFSessionSchema.statics.findActiveByUser = function(userId) {
  return this.find({
    user_id: userId,
    is_active: true
  }).sort({ start_time: -1 });
};

PDFSessionSchema.statics.findByUserAndFile = function(userId, fileId) {
  return this.find({
    user_id: userId,
    file_id: fileId
  }).sort({ start_time: -1 });
};

PDFSessionSchema.statics.getRecentSessions = function(userId, limit = 10) {
  return this.find({
    user_id: userId
  })
  .populate('file_id', 'original_name display_name')
  .sort({ start_time: -1 })
  .limit(limit);
};

PDFSessionSchema.statics.getUserReadingStats = async function(userId, days = 30) {
  const startDate = new Date(Date.now() - (days * 24 * 60 * 60 * 1000));
  
  const stats = await this.aggregate([
    {
      $match: {
        user_id: mongoose.Types.ObjectId(userId),
        start_time: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: null,
        total_sessions: { $sum: 1 },
        total_reading_time: { $sum: '$session_duration' },
        avg_session_duration: { $avg: '$session_duration' },
        total_pages_read: { $sum: '$total_pages_visited' },
        avg_focus_score: { $avg: '$performance_metrics.focus_score' },
        unique_files: { $addToSet: '$file_id' }
      }
    }
  ]);
  
  return stats.length > 0 ? {
    ...stats[0],
    unique_files_count: stats[0].unique_files.length,
    avg_reading_speed: stats[0].total_reading_time > 0 ? 
      (stats[0].total_pages_read / (stats[0].total_reading_time / 3600)).toFixed(2) : 0
  } : null;
};

module.exports = mongoose.model('PDFSession', PDFSessionSchema);