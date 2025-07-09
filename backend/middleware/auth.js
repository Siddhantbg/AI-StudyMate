const jwt = require('jsonwebtoken');
const User = require('../models/mongodb/User');
const UserSession = require('../models/mongodb/UserSession');

/**
 * Authentication Middleware
 * 
 * This middleware handles JWT-based authentication for the Forest PDF Viewer API.
 * It validates tokens, manages sessions, and provides user context to protected routes.
 */

/**
 * Generate JWT Access Token
 */
const generateAccessToken = (userId) => {
  return jwt.sign(
    { userId: userId.toString(), type: 'access' },
    process.env.JWT_SECRET,
    { 
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
      issuer: 'forest-pdf-viewer',
      subject: userId.toString()
    }
  );
};

/**
 * Generate JWT Refresh Token
 */
const generateRefreshToken = (userId) => {
  return jwt.sign(
    { userId: userId.toString(), type: 'refresh' },
    process.env.JWT_REFRESH_SECRET,
    { 
      expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
      issuer: 'forest-pdf-viewer',
      subject: userId.toString()
    }
  );
};

/**
 * Extract token from request headers
 */
const extractToken = (req) => {
  const authHeader = req.headers.authorization;
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  
  // Also check for token in cookies (for web app)
  if (req.cookies && req.cookies.token) {
    return req.cookies.token;
  }
  
  return null;
};

/**
 * Main authentication middleware
 */
const authenticateToken = async (req, res, next) => {
  try {
    const token = extractToken(req);
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Access token required',
        code: 'TOKEN_MISSING'
      });
    }

    // Verify the token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtError) {
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          error: 'Token expired',
          code: 'TOKEN_EXPIRED'
        });
      } else if (jwtError.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false,
          error: 'Invalid token',
          code: 'TOKEN_INVALID'
        });
      } else {
        throw jwtError;
      }
    }

    // Validate token type
    if (decoded.type !== 'access') {
      return res.status(401).json({
        success: false,
        error: 'Invalid token type',
        code: 'TOKEN_INVALID_TYPE'
      });
    }

    // Find the user
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    // Check if user is active
    if (!user.is_active) {
      return res.status(401).json({
        success: false,
        error: 'User account is disabled',
        code: 'USER_DISABLED'
      });
    }

    // Find and validate session
    const session = await UserSession.findByToken(token);
    if (!session) {
      return res.status(401).json({
        success: false,
        error: 'Session not found or expired',
        code: 'SESSION_INVALID'
      });
    }

    // Check if session is expired
    if (session.isExpired()) {
      await session.logout();
      return res.status(401).json({
        success: false,
        error: 'Session expired',
        code: 'SESSION_EXPIRED'
      });
    }

    // Update session activity
    await session.updateActivity();

    // Attach user and session to request
    req.user = user;
    req.session = session;
    req.userId = user._id;

    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(500).json({
      success: false,
      error: 'Authentication failed',
      code: 'AUTH_ERROR'
    });
  }
};

/**
 * Optional authentication middleware (doesn't fail if no token)
 */
const optionalAuth = async (req, res, next) => {
  try {
    const token = extractToken(req);
    
    if (!token) {
      // No token provided, continue without user context
      req.user = null;
      req.userId = null;
      req.session = null;
      return next();
    }

    // Try to authenticate, but don't fail if it doesn't work
    await authenticateToken(req, res, (err) => {
      if (err) {
        // Reset user context and continue
        req.user = null;
        req.userId = null;
        req.session = null;
      }
      next();
    });
  } catch (error) {
    // Reset user context and continue
    req.user = null;
    req.userId = null;
    req.session = null;
    next();
  }
};

/**
 * Create user session (used during login)
 */
const createUserSession = async (user, deviceInfo = {}, req = null) => {
  try {
    const accessToken = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);
    
    // Calculate expiration dates
    const accessExpiresAt = new Date(Date.now() + (7 * 24 * 60 * 60 * 1000)); // 7 days
    const refreshExpiresAt = new Date(Date.now() + (30 * 24 * 60 * 60 * 1000)); // 30 days

    // Extract device and location info
    const sessionDeviceInfo = {
      user_agent: req?.headers['user-agent'],
      ip_address: req?.ip || req?.connection?.remoteAddress,
      ...deviceInfo
    };

    // Create session record
    const session = new UserSession({
      user_id: user._id,
      session_token: accessToken,
      refresh_token: refreshToken,
      device_info: sessionDeviceInfo,
      expires_at: accessExpiresAt
    });
    await session.save();

    // Update user's last login
    await user.updateLastLogin();

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: accessExpiresAt,
      refresh_expires_at: refreshExpiresAt,
      session_id: session._id,
      user: user.getPublicProfile()
    };
  } catch (error) {
    console.error('Error creating user session:', error);
    throw new Error('Failed to create session');
  }
};

/**
 * Refresh access token using refresh token
 */
const refreshAccessToken = async (refreshToken) => {
  try {
    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    
    if (decoded.type !== 'refresh') {
      throw new Error('Invalid refresh token type');
    }

    // Find session by refresh token
    const session = await UserSession.findByRefreshToken(refreshToken);
    if (!session || session.isExpired()) {
      throw new Error('Refresh token expired or invalid');
    }

    // Find user
    const user = await User.findById(decoded.userId);
    if (!user || !user.is_active) {
      throw new Error('User not found or disabled');
    }

    // Generate new tokens
    const newAccessToken = generateAccessToken(user._id);
    const newRefreshToken = generateRefreshToken(user._id);
    
    const newAccessExpiresAt = new Date(Date.now() + (7 * 24 * 60 * 60 * 1000));
    const newRefreshExpiresAt = new Date(Date.now() + (30 * 24 * 60 * 60 * 1000));

    // Update session
    session.session_token = newAccessToken;
    session.refresh_token = newRefreshToken;
    session.expires_at = newAccessExpiresAt;
    await session.save();

    return {
      access_token: newAccessToken,
      refresh_token: newRefreshToken,
      expires_at: newAccessExpiresAt,
      refresh_expires_at: newRefreshExpiresAt,
      user: user.getPublicProfile()
    };
  } catch (error) {
    console.error('Error refreshing access token:', error);
    throw new Error('Failed to refresh token');
  }
};

/**
 * Logout user (deactivate session)
 */
const logoutUser = async (req) => {
  try {
    if (req.session) {
      await req.session.logout();
    }
    return true;
  } catch (error) {
    console.error('Error during logout:', error);
    return false;
  }
};

/**
 * Logout user from all sessions
 */
const logoutUserFromAllSessions = async (userId) => {
  try {
    await UserSession.updateMany(
      { user_id: userId, is_active: true },
      { is_active: false, logout_time: new Date() }
    );
    return true;
  } catch (error) {
    console.error('Error during logout from all sessions:', error);
    return false;
  }
};

/**
 * Cleanup expired sessions (should be run periodically)
 */
const cleanupExpiredSessions = async () => {
  try {
    const result = await UserSession.cleanupExpiredSessions();
    console.log(`Cleaned up ${result} expired sessions`);
    return result;
  } catch (error) {
    console.error('Error cleaning up expired sessions:', error);
    return 0;
  }
};

/**
 * Check if user has permission for resource
 */
const checkResourcePermission = (resource = 'own') => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }

      // For now, users can only access their own resources
      // This can be extended for role-based permissions later
      if (resource === 'own') {
        // The actual resource ownership check will be done in the route handlers
        return next();
      }

      // Add more permission checks here as needed
      next();
    } catch (error) {
      console.error('Permission check error:', error);
      return res.status(500).json({
        success: false,
        error: 'Permission check failed',
        code: 'PERMISSION_ERROR'
      });
    }
  };
};

module.exports = {
  authenticateToken,
  optionalAuth,
  generateAccessToken,
  generateRefreshToken,
  createUserSession,
  refreshAccessToken,
  logoutUser,
  logoutUserFromAllSessions,
  cleanupExpiredSessions,
  checkResourcePermission,
  extractToken
};