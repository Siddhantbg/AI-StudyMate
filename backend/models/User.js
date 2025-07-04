const bcrypt = require('bcryptjs');

module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define('User', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true
      }
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        len: [8, 100] // Password should be at least 8 characters
      }
    },
    first_name: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        len: [1, 50]
      }
    },
    last_name: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        len: [1, 50]
      }
    },
    profile_picture: {
      type: DataTypes.TEXT, // Base64 encoded image or URL
      allowNull: true
    },
    email_verified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    last_login: {
      type: DataTypes.DATE,
      allowNull: true
    },
    preferences: {
      type: DataTypes.JSONB,
      defaultValue: {
        theme: 'forest',
        default_zoom: 1.0,
        auto_save_annotations: true,
        ai_suggestions_enabled: true,
        notification_settings: {
          email_notifications: true,
          quiz_reminders: true
        }
      }
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    }
  }, {
    tableName: 'users',
    hooks: {
      // Hash password before creating user
      beforeCreate: async (user) => {
        if (user.password) {
          const saltRounds = 12;
          user.password = await bcrypt.hash(user.password, saltRounds);
        }
      },
      // Hash password before updating user (if password is being updated)
      beforeUpdate: async (user) => {
        if (user.changed('password')) {
          const saltRounds = 12;
          user.password = await bcrypt.hash(user.password, saltRounds);
        }
      }
    }
  });

  // Instance methods
  User.prototype.validatePassword = async function(password) {
    return await bcrypt.compare(password, this.password);
  };

  User.prototype.getPublicProfile = function() {
    return {
      id: this.id,
      email: this.email,
      username: `${this.first_name || ''} ${this.last_name || ''}`.trim() || this.email.split('@')[0],
      first_name: this.first_name,
      last_name: this.last_name,
      profile_picture: this.profile_picture,
      email_verified: this.email_verified,
      last_login: this.last_login,
      preferences: this.preferences,
      created_at: this.created_at,
      updated_at: this.updated_at
    };
  };

  User.prototype.updateLastLogin = async function() {
    this.last_login = new Date();
    await this.save();
  };

  // Class methods
  User.findByEmail = async function(email) {
    return await this.findOne({
      where: { email: email.toLowerCase() }
    });
  };

  User.prototype.toJSON = function() {
    const values = { ...this.get() };
    delete values.password; // Never include password in JSON output
    return values;
  };

  return User;
};