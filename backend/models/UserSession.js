module.exports = (sequelize, DataTypes) => {
  const UserSession = sequelize.define('UserSession', {
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
    session_token: {
      type: DataTypes.TEXT,
      allowNull: false,
      unique: true // JWT token or session identifier
    },
    refresh_token: {
      type: DataTypes.TEXT,
      allowNull: true,
      unique: true // Refresh token for token renewal
    },
    device_info: {
      type: DataTypes.JSONB,
      defaultValue: {},
      // Structure: { user_agent, ip_address, device_type, browser, os }
    },
    login_time: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    last_activity: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: false
    },
    refresh_expires_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    logout_time: {
      type: DataTypes.DATE,
      allowNull: true
    },
    logout_reason: {
      type: DataTypes.ENUM('manual', 'expired', 'forced', 'security'),
      allowNull: true
    },
    ip_address: {
      type: DataTypes.INET,
      allowNull: true
    },
    user_agent: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    location_info: {
      type: DataTypes.JSONB,
      defaultValue: {},
      // Structure: { country, city, timezone, coordinates }
    },
    session_metadata: {
      type: DataTypes.JSONB,
      defaultValue: {},
      // Additional session data: preferences, temporary settings, etc.
    }
  }, {
    tableName: 'user_sessions',
    indexes: [
      {
        fields: ['user_id']
      },
      {
        fields: ['session_token']
      },
      {
        fields: ['refresh_token']
      },
      {
        fields: ['is_active']
      },
      {
        fields: ['expires_at']
      },
      {
        fields: ['last_activity']
      },
      {
        fields: ['ip_address']
      }
    ]
  });

  // Instance methods
  UserSession.prototype.updateActivity = async function() {
    this.last_activity = new Date();
    await this.save();
  };

  UserSession.prototype.isExpired = function() {
    return new Date() > this.expires_at;
  };

  UserSession.prototype.isRefreshExpired = function() {
    return this.refresh_expires_at ? new Date() > this.refresh_expires_at : true;
  };

  UserSession.prototype.deactivate = async function(reason = 'manual') {
    this.is_active = false;
    this.logout_time = new Date();
    this.logout_reason = reason;
    await this.save();
  };

  UserSession.prototype.refreshSession = async function(newToken, newRefreshToken, expiresAt, refreshExpiresAt) {
    this.session_token = newToken;
    this.refresh_token = newRefreshToken;
    this.expires_at = expiresAt;
    this.refresh_expires_at = refreshExpiresAt;
    this.last_activity = new Date();
    await this.save();
  };

  UserSession.prototype.updateDeviceInfo = async function(deviceInfo) {
    this.device_info = { ...this.device_info, ...deviceInfo };
    await this.save();
  };

  UserSession.prototype.updateLocation = async function(locationInfo) {
    this.location_info = { ...this.location_info, ...locationInfo };
    await this.save();
  };

  UserSession.prototype.getSessionDuration = function() {
    const start = this.login_time;
    const end = this.logout_time || this.last_activity;
    return Math.floor((end - start) / 1000); // Duration in seconds
  };

  UserSession.prototype.getPublicData = function() {
    return {
      id: this.id,
      device_info: this.device_info,
      login_time: this.login_time,
      last_activity: this.last_activity,
      is_active: this.is_active,
      logout_time: this.logout_time,
      location_info: this.location_info,
      session_duration: this.getSessionDuration(),
      created_at: this.created_at
    };
  };

  // Class methods
  UserSession.findByToken = async function(token) {
    return await this.findOne({
      where: {
        session_token: token,
        is_active: true
      }
    });
  };

  UserSession.findByRefreshToken = async function(refreshToken) {
    return await this.findOne({
      where: {
        refresh_token: refreshToken,
        is_active: true
      }
    });
  };

  UserSession.deactivateAllUserSessions = async function(userId, reason = 'forced') {
    return await this.update(
      {
        is_active: false,
        logout_time: new Date(),
        logout_reason: reason
      },
      {
        where: {
          user_id: userId,
          is_active: true
        }
      }
    );
  };

  UserSession.cleanupExpiredSessions = async function() {
    const now = new Date();
    return await this.update(
      {
        is_active: false,
        logout_time: now,
        logout_reason: 'expired'
      },
      {
        where: {
          expires_at: {
            [sequelize.Sequelize.Op.lt]: now
          },
          is_active: true
        }
      }
    );
  };

  UserSession.getUserActiveSessions = async function(userId) {
    return await this.findAll({
      where: {
        user_id: userId,
        is_active: true
      },
      order: [['last_activity', 'DESC']]
    });
  };

  UserSession.getSessionStats = async function(userId, startDate = null, endDate = null) {
    const whereClause = { user_id: userId };
    
    if (startDate) {
      whereClause.login_time = { [sequelize.Sequelize.Op.gte]: startDate };
    }
    
    if (endDate) {
      whereClause.login_time = {
        ...whereClause.login_time,
        [sequelize.Sequelize.Op.lte]: endDate
      };
    }

    const sessions = await this.findAll({
      where: whereClause,
      order: [['login_time', 'DESC']]
    });

    const totalSessions = sessions.length;
    const activeSessions = sessions.filter(s => s.is_active).length;
    const totalDuration = sessions.reduce((sum, session) => sum + session.getSessionDuration(), 0);
    const averageDuration = totalSessions > 0 ? Math.floor(totalDuration / totalSessions) : 0;

    return {
      total_sessions: totalSessions,
      active_sessions: activeSessions,
      total_duration: totalDuration,
      average_duration: averageDuration,
      sessions: sessions.map(s => s.getPublicData())
    };
  };

  return UserSession;
};