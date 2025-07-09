const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    validate: {
      validator: function(v) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
      },
      message: 'Please enter a valid email address'
    }
  },
  password: {
    type: String,
    required: true,
    minlength: [8, 'Password must be at least 8 characters long'],
    maxlength: [100, 'Password cannot exceed 100 characters']
  },
  first_name: {
    type: String,
    trim: true,
    maxlength: [50, 'First name cannot exceed 50 characters']
  },
  last_name: {
    type: String,
    trim: true,
    maxlength: [50, 'Last name cannot exceed 50 characters']
  },
  profile_picture: {
    type: String, // Base64 encoded image or URL
    default: null
  },
  email_verified: {
    type: Boolean,
    default: false
  },
  last_login: {
    type: Date,
    default: null
  },
  preferences: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: () => new Map([
      ['theme', 'forest'],
      ['default_zoom', 1.0],
      ['auto_save_annotations', true],
      ['ai_suggestions_enabled', true],
      ['notification_settings', {
        email_notifications: true,
        quiz_reminders: true
      }]
    ])
  },
  is_active: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: { 
    createdAt: 'created_at', 
    updatedAt: 'updated_at' 
  },
  toJSON: {
    transform: function(doc, ret) {
      delete ret.password; // Never include password in JSON output
      return ret;
    }
  }
});

// Indexes for performance (removed duplicates since email is already unique in schema)
UserSchema.index({ is_active: 1 });
UserSchema.index({ last_login: 1 });
UserSchema.index({ created_at: 1 });

// Hash password before saving
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const saltRounds = 12;
    this.password = await bcrypt.hash(this.password, saltRounds);
    next();
  } catch (error) {
    next(error);
  }
});

// Instance methods
UserSchema.methods.validatePassword = async function(password) {
  return await bcrypt.compare(password, this.password);
};

UserSchema.methods.getPublicProfile = function() {
  return {
    id: this._id,
    email: this.email,
    username: `${this.first_name || ''} ${this.last_name || ''}`.trim() || this.email.split('@')[0],
    first_name: this.first_name,
    last_name: this.last_name,
    profile_picture: this.profile_picture,
    email_verified: this.email_verified,
    last_login: this.last_login,
    preferences: Object.fromEntries(this.preferences),
    created_at: this.created_at,
    updated_at: this.updated_at
  };
};

UserSchema.methods.updateLastLogin = async function() {
  this.last_login = new Date();
  return await this.save();
};

// Static methods
UserSchema.statics.findByEmail = async function(email) {
  return await this.findOne({ email: email.toLowerCase() });
};

// Virtual for username
UserSchema.virtual('username').get(function() {
  return `${this.first_name || ''} ${this.last_name || ''}`.trim() || this.email.split('@')[0];
});

module.exports = mongoose.model('User', UserSchema);