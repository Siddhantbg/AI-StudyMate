const mongoose = require('mongoose');

const UserSessionSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  session_token: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  refresh_token: {
    type: String,
    default: null,
    index: true
  },
  device_info: {
    user_agent: { type: String, default: null },
    ip_address: { type: String, default: null },
    device_type: { type: String, default: 'unknown' }, // mobile, desktop, tablet
    browser: { type: String, default: null },
    os: { type: String, default: null },
    device_fingerprint: { type: String, default: null }
  },
  location_info: {
    country: { type: String, default: null },
    city: { type: String, default: null },
    timezone: { type: String, default: null },
    coordinates: {
      latitude: { type: Number, default: null },
      longitude: { type: Number, default: null }
    }
  },
  login_time: {
    type: Date,
    default: Date.now,
    index: true
  },
  last_activity: {
    type: Date,
    default: Date.now,
    index: true
  },
  logout_time: {
    type: Date,
    default: null
  },
  expires_at: {
    type: Date,
    required: true
  },
  is_active: {
    type: Boolean,
    default: true,
    index: true
  },
  session_duration: {
    type: Number,
    default: 0 // in seconds
  },
  activity_count: {
    type: Number,
    default: 0 // number of requests in this session
  },
  security_flags: {
    is_suspicious: { type: Boolean, default: false },
    failed_attempts: { type: Number, default: 0 },
    lockout_until: { type: Date, default: null },
    requires_verification: { type: Boolean, default: false }
  },
  permissions: {
    type: [String],
    default: ['read', 'write'] // Basic permissions for the session
  },
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: () => new Map()
    // Additional session metadata
  }
}, {
  timestamps: { 
    createdAt: 'created_at', 
    updatedAt: 'updated_at' 
  }
});

// Indexes for performance (removed duplicates)
UserSessionSchema.index({ user_id: 1, is_active: 1 });
UserSessionSchema.index({ user_id: 1, login_time: -1 });
UserSessionSchema.index({ 'security_flags.is_suspicious': 1 });
UserSessionSchema.index({ 'device_info.ip_address': 1 });

// TTL index to automatically remove expired sessions
UserSessionSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

// Pre-save middleware
UserSessionSchema.pre('save', function(next) {
  // Update session duration if logout_time is set
  if (this.logout_time && this.login_time) {
    this.session_duration = Math.floor((this.logout_time - this.login_time) / 1000);
  }
  
  // Update last_activity on any save
  if (!this.logout_time) {
    this.last_activity = new Date();
  }
  
  next();
});

// Instance methods
UserSessionSchema.methods.updateActivity = async function() {
  this.last_activity = new Date();
  this.activity_count += 1;
  return await this.save();
};

UserSessionSchema.methods.logout = async function() {
  this.logout_time = new Date();
  this.is_active = false;
  this.session_duration = Math.floor((this.logout_time - this.login_time) / 1000);
  return await this.save();
};

UserSessionSchema.methods.deactivate = async function(reason = 'manual') {
  this.logout_time = new Date();
  this.is_active = false;
  this.session_duration = Math.floor((this.logout_time - this.login_time) / 1000);
  
  // Store deactivation reason in metadata
  const metadata = this.metadata || new Map();
  metadata.set('deactivation_reason', reason);
  metadata.set('deactivated_at', new Date());
  this.metadata = metadata;
  
  return await this.save();
};

UserSessionSchema.methods.extendSession = async function(additionalTime = 24 * 60 * 60 * 1000) {
  this.expires_at = new Date(Date.now() + additionalTime);
  this.last_activity = new Date();
  return await this.save();
};

UserSessionSchema.methods.flagAsSuspicious = async function(reason = null) {
  this.security_flags.is_suspicious = true;
  this.security_flags.failed_attempts += 1;
  
  if (reason) {
    const metadata = this.metadata || new Map();
    metadata.set('suspicious_reason', reason);
    metadata.set('flagged_at', new Date());
    this.metadata = metadata;
  }
  
  return await this.save();
};

UserSessionSchema.methods.lockoutSession = async function(lockoutMinutes = 30) {
  this.security_flags.lockout_until = new Date(Date.now() + (lockoutMinutes * 60 * 1000));
  this.is_active = false;
  return await this.save();
};

UserSessionSchema.methods.isExpired = function() {
  return new Date() > this.expires_at;
};

UserSessionSchema.methods.isLocked = function() {
  return this.security_flags.lockout_until && new Date() < this.security_flags.lockout_until;
};

UserSessionSchema.methods.getSessionInfo = function() {
  return {
    id: this._id,
    session_token: this.session_token,
    device_info: this.device_info,
    location_info: this.location_info,
    login_time: this.login_time,
    last_activity: this.last_activity,
    logout_time: this.logout_time,
    expires_at: this.expires_at,
    is_active: this.is_active,
    session_duration: this.session_duration,
    activity_count: this.activity_count,
    permissions: this.permissions,
    created_at: this.created_at
  };
};

UserSessionSchema.methods.getPublicData = function() {
  return {
    id: this._id,
    device_info: {
      device_type: this.device_info.device_type,
      browser: this.device_info.browser,
      os: this.device_info.os
    },
    location_info: {
      country: this.location_info.country,
      city: this.location_info.city,
      timezone: this.location_info.timezone
    },
    login_time: this.login_time,
    last_activity: this.last_activity,
    is_active: this.is_active,
    session_duration: this.session_duration
  };
};

// Static methods
UserSessionSchema.statics.findActiveByUser = function(userId) {
  return this.find({
    user_id: userId,
    is_active: true,
    expires_at: { $gt: new Date() }
  }).sort({ last_activity: -1 });
};

UserSessionSchema.statics.findByToken = function(sessionToken) {
  return this.findOne({
    session_token: sessionToken,
    is_active: true,
    expires_at: { $gt: new Date() }
  });
};

UserSessionSchema.statics.findByRefreshToken = function(refreshToken) {
  return this.findOne({
    refresh_token: refreshToken,
    is_active: true,
    expires_at: { $gt: new Date() }
  });
};

UserSessionSchema.statics.cleanupExpiredSessions = async function() {
  const result = await this.deleteMany({
    $or: [
      { expires_at: { $lt: new Date() } },
      { is_active: false, logout_time: { $lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }
    ]
  });
  
  console.log(`🧹 Cleaned up ${result.deletedCount} expired sessions`);
  return result.deletedCount;
};

UserSessionSchema.statics.getUserActiveSessions = function(userId) {
  return this.find({
    user_id: userId,
    is_active: true,
    expires_at: { $gt: new Date() }
  }).sort({ last_activity: -1 });
};

UserSessionSchema.statics.getSessionStats = async function(userId, days = 30) {
  const startDate = new Date(Date.now() - (days * 24 * 60 * 60 * 1000));
  
  const stats = await this.aggregate([
    {
      $match: {
        user_id: mongoose.Types.ObjectId(userId),
        login_time: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: null,
        total_sessions: { $sum: 1 },
        active_sessions: {
          $sum: {
            $cond: [{ $eq: ['$is_active', true] }, 1, 0]
          }
        },
        avg_session_duration: { $avg: '$session_duration' },
        total_activity: { $sum: '$activity_count' },
        unique_devices: { $addToSet: '$device_info.device_type' },
        unique_locations: { $addToSet: '$location_info.country' }
      }
    }
  ]);
  
  return stats.length > 0 ? {
    ...stats[0],
    unique_devices: stats[0].unique_devices.length,
    unique_locations: stats[0].unique_locations.length,
    avg_session_duration: Math.round(stats[0].avg_session_duration || 0)
  } : {
    total_sessions: 0,
    active_sessions: 0,
    avg_session_duration: 0,
    total_activity: 0,
    unique_devices: 0,
    unique_locations: 0
  };
};

module.exports = mongoose.model('UserSession', UserSessionSchema);