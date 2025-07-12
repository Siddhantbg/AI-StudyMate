const mongoose = require('mongoose');

const PageTrackingSchema = new mongoose.Schema({
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
  page_number: {
    type: Number,
    required: true,
    min: 1,
    index: true
  },
  session_id: {
    type: String,
    required: true
    // Links to reading session
  },
  time_spent: {
    type: Number,
    required: true,
    min: 0, // Time spent on page in seconds
    default: 0
  },
  reading_progress: {
    type: Number,
    min: 0,
    max: 100,
    default: 0 // Percentage of page read (0-100)
  },
  scroll_progress: {
    type: Number,
    min: 0,
    max: 100,
    default: 0 // How far user scrolled on the page (0-100)
  },
  interaction_data: {
    mouse_clicks: { type: Number, default: 0 },
    key_presses: { type: Number, default: 0 },
    scroll_events: { type: Number, default: 0 },
    zoom_events: { type: Number, default: 0 },
    selection_events: { type: Number, default: 0 }
  },
  engagement_metrics: {
    focus_time: { type: Number, default: 0 }, // Time page was in focus (seconds)
    idle_time: { type: Number, default: 0 }, // Time user was idle (seconds)
    active_time: { type: Number, default: 0 }, // Time user was actively interacting
    revisit_count: { type: Number, default: 1 } // How many times user visited this page
  },
  reading_patterns: {
    reading_speed: { type: Number, default: null }, // Words per minute
    pause_points: [{ 
      position: { type: Number }, // Y coordinate where user paused
      duration: { type: Number } // How long they paused (seconds)
    }],
    backtrack_count: { type: Number, default: 0 }, // How many times user went back
    skip_ahead_count: { type: Number, default: 0 } // How many times user skipped ahead
  },
  comprehension_indicators: {
    annotation_count: { type: Number, default: 0 },
    highlight_count: { type: Number, default: 0 },
    note_count: { type: Number, default: 0 },
    search_queries: [{ 
      query: { type: String },
      timestamp: { type: Date, default: Date.now }
    }]
  },
  viewport_data: {
    initial_zoom: { type: Number, default: 1.0 },
    final_zoom: { type: Number, default: 1.0 },
    zoom_changes: { type: Number, default: 0 },
    viewport_width: { type: Number, default: null },
    viewport_height: { type: Number, default: null }
  },
  entry_method: {
    type: String,
    enum: ['sequential', 'jump', 'search', 'bookmark', 'annotation'],
    default: 'sequential'
  },
  exit_method: {
    type: String,
    enum: ['next_page', 'prev_page', 'jump', 'close', 'idle_timeout'],
    default: null
  },
  performance_metrics: {
    load_time: { type: Number, default: null }, // Page load time in ms
    render_time: { type: Number, default: null }, // Page render time in ms
    interaction_delay: { type: Number, default: null } // Delay before first interaction
  },
  quality_score: {
    type: Number,
    min: 0,
    max: 100,
    default: null // Calculated reading quality score
  },
  tags: {
    type: [String],
    default: [] // User-defined tags for this reading session
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
PageTrackingSchema.index({ user_id: 1, file_id: 1 });
PageTrackingSchema.index({ user_id: 1, file_id: 1, page_number: 1 });
PageTrackingSchema.index({ user_id: 1, session_id: 1 });
PageTrackingSchema.index({ file_id: 1, page_number: 1 });
PageTrackingSchema.index({ session_id: 1, created_at: 1 });
PageTrackingSchema.index({ user_id: 1, created_at: -1 });

// Pre-save middleware to calculate quality score
PageTrackingSchema.pre('save', function(next) {
  // Calculate reading quality score based on various factors
  let score = 0;
  
  // Time spent factor (more time = higher quality, up to a point)
  if (this.time_spent > 0) {
    const timeScore = Math.min((this.time_spent / 60) * 20, 30); // Max 30 points for time
    score += timeScore;
  }
  
  // Reading progress factor
  score += (this.reading_progress / 100) * 25; // Max 25 points for progress
  
  // Engagement factor
  const totalInteractions = this.interaction_data.mouse_clicks + 
                           this.interaction_data.key_presses + 
                           this.interaction_data.scroll_events;
  const engagementScore = Math.min(totalInteractions * 2, 20); // Max 20 points for engagement
  score += engagementScore;
  
  // Comprehension indicators factor
  const comprehensionScore = (this.comprehension_indicators.annotation_count * 5) +
                            (this.comprehension_indicators.highlight_count * 3) +
                            (this.comprehension_indicators.note_count * 4);
  score += Math.min(comprehensionScore, 25); // Max 25 points for comprehension
  
  this.quality_score = Math.min(Math.round(score), 100);
  
  next();
});

// Instance methods
PageTrackingSchema.methods.updateReadingTime = async function(additionalTime) {
  this.time_spent += additionalTime;
  this.engagement_metrics.active_time += additionalTime;
  return await this.save();
};

PageTrackingSchema.methods.updateProgress = async function(progress) {
  this.reading_progress = Math.max(this.reading_progress, progress);
  return await this.save();
};

PageTrackingSchema.methods.addInteraction = async function(interactionType) {
  if (this.interaction_data[interactionType] !== undefined) {
    this.interaction_data[interactionType] += 1;
  }
  return await this.save();
};

PageTrackingSchema.methods.addPausePoint = async function(position, duration) {
  this.reading_patterns.pause_points.push({ position, duration });
  return await this.save();
};

PageTrackingSchema.methods.addSearchQuery = async function(query) {
  this.comprehension_indicators.search_queries.push({
    query,
    timestamp: new Date()
  });
  return await this.save();
};

PageTrackingSchema.methods.incrementAnnotationCount = async function() {
  this.comprehension_indicators.annotation_count += 1;
  return await this.save();
};

PageTrackingSchema.methods.incrementHighlightCount = async function() {
  this.comprehension_indicators.highlight_count += 1;
  return await this.save();
};

PageTrackingSchema.methods.getReadingStats = function() {
  return {
    time_spent: this.time_spent,
    reading_progress: this.reading_progress,
    quality_score: this.quality_score,
    engagement_metrics: this.engagement_metrics,
    interaction_count: Object.values(this.interaction_data).reduce((a, b) => a + b, 0),
    comprehension_score: this.comprehension_indicators.annotation_count + 
                        this.comprehension_indicators.highlight_count + 
                        this.comprehension_indicators.note_count
  };
};

// Static methods
PageTrackingSchema.statics.getFileReadingStats = async function(fileId, userId) {
  const stats = await this.aggregate([
    {
      $match: {
        file_id: mongoose.Types.ObjectId(fileId),
        user_id: mongoose.Types.ObjectId(userId)
      }
    },
    {
      $group: {
        _id: null,
        total_time: { $sum: '$time_spent' },
        total_pages: { $sum: 1 },
        avg_time_per_page: { $avg: '$time_spent' },
        avg_reading_progress: { $avg: '$reading_progress' },
        avg_quality_score: { $avg: '$quality_score' },
        total_interactions: {
          $sum: {
            $add: [
              '$interaction_data.mouse_clicks',
              '$interaction_data.key_presses',
              '$interaction_data.scroll_events'
            ]
          }
        },
        total_annotations: { $sum: '$comprehension_indicators.annotation_count' },
        pages_fully_read: {
          $sum: {
            $cond: [{ $gte: ['$reading_progress', 90] }, 1, 0]
          }
        }
      }
    }
  ]);
  
  return stats.length > 0 ? stats[0] : null;
};

PageTrackingSchema.statics.getUserReadingPatterns = async function(userId, days = 30) {
  const startDate = new Date(Date.now() - (days * 24 * 60 * 60 * 1000));
  
  return await this.aggregate([
    {
      $match: {
        user_id: mongoose.Types.ObjectId(userId),
        created_at: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$created_at' } },
        daily_reading_time: { $sum: '$time_spent' },
        pages_read: { $sum: 1 },
        avg_quality: { $avg: '$quality_score' },
        total_interactions: {
          $sum: {
            $add: [
              '$interaction_data.mouse_clicks',
              '$interaction_data.key_presses',
              '$interaction_data.scroll_events'
            ]
          }
        }
      }
    },
    { $sort: { _id: 1 } }
  ]);
};

PageTrackingSchema.statics.getPageHeatmap = async function(fileId) {
  return await this.aggregate([
    {
      $match: { file_id: mongoose.Types.ObjectId(fileId) }
    },
    {
      $group: {
        _id: '$page_number',
        total_time: { $sum: '$time_spent' },
        unique_readers: { $addToSet: '$user_id' },
        avg_quality: { $avg: '$quality_score' },
        total_interactions: {
          $sum: {
            $add: [
              '$interaction_data.mouse_clicks',
              '$interaction_data.key_presses',
              '$interaction_data.scroll_events'
            ]
          }
        }
      }
    },
    {
      $project: {
        page_number: '$_id',
        total_time: 1,
        reader_count: { $size: '$unique_readers' },
        avg_quality: 1,
        total_interactions: 1
      }
    },
    { $sort: { page_number: 1 } }
  ]);
};

module.exports = mongoose.model('PageTracking', PageTrackingSchema);