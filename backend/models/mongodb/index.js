const mongoose = require('mongoose');

// Import all models
const User = require('./User');
const File = require('./File');
const Annotation = require('./Annotation');
const QuizResult = require('./QuizResult');
const UserSession = require('./UserSession');
const PageTracking = require('./PageTracking');
const PDFSession = require('./PDFSession');

// Cleanup function for expired sessions
const cleanupExpiredSessions = async () => {
  try {
    const expiredSessions = await UserSession.cleanupExpiredSessions();
    console.log(`🧹 Cleaned up ${expiredSessions} expired user sessions`);
  } catch (error) {
    console.error('❌ Error cleaning up expired sessions:', error);
  }
};

// Setup periodic cleanup (run every hour)
setInterval(cleanupExpiredSessions, 60 * 60 * 1000);

// Helper function to create database indexes
const createIndexes = async () => {
  try {
    console.log('🔧 Creating database indexes...');
    
    // Ensure all models are compiled and indexes are created
    await Promise.all([
      User.createIndexes(),
      File.createIndexes(),
      Annotation.createIndexes(),
      QuizResult.createIndexes(),
      UserSession.createIndexes(),
      PageTracking.createIndexes(),
      PDFSession.createIndexes()
    ]);
    
    console.log('✅ Database indexes created successfully');
  } catch (error) {
    console.error('❌ Error creating indexes:', error);
    throw error;
  }
};

// Utility functions for common operations
const utils = {
  // Find user with all related data
  findUserWithData: async (userId) => {
    return await User.findById(userId)
      .select('-password'); // Exclude password
  },

  // Get user's recent activity
  getUserActivity: async (userId, limit = 20) => {
    const [files, sessions, annotations, quizzes] = await Promise.all([
      File.find({ user_id: userId }).sort({ created_at: -1 }).limit(5),
      PDFSession.find({ user_id: userId }).sort({ start_time: -1 }).limit(5),
      Annotation.find({ user_id: userId }).sort({ created_at: -1 }).limit(5),
      QuizResult.find({ user_id: userId }).sort({ created_at: -1 }).limit(5)
    ]);

    return {
      recent_files: files,
      recent_sessions: sessions,
      recent_annotations: annotations,
      recent_quizzes: quizzes
    };
  },

  // Get comprehensive file data
  getFileWithData: async (fileId, userId) => {
    const [file, annotations, quizzes, sessions, pageTracking] = await Promise.all([
      File.findOne({ _id: fileId, user_id: userId }),
      Annotation.find({ file_id: fileId, user_id: userId, is_deleted: false }),
      QuizResult.find({ file_id: fileId, user_id: userId }),
      PDFSession.find({ file_id: fileId, user_id: userId }).sort({ start_time: -1 }),
      PageTracking.find({ file_id: fileId, user_id: userId })
    ]);

    if (!file) return null;

    return {
      file: file.getPublicData(),
      annotations: annotations.map(a => a.getPublicData()),
      quizzes: quizzes.map(q => q.getPublicData()),
      sessions: sessions.map(s => s.getSessionSummary()),
      reading_stats: await PageTracking.getFileReadingStats(fileId, userId)
    };
  },

  // Search across all user content
  searchUserContent: async (userId, searchTerm, options = {}) => {
    const [files, annotations] = await Promise.all([
      File.searchFiles(userId, searchTerm, options),
      Annotation.searchAnnotations(userId, searchTerm, options)
    ]);

    return {
      files: files.map(f => f.getPublicData()),
      annotations: annotations.map(a => a.getPublicData())
    };
  },

  // Get user dashboard data
  getUserDashboard: async (userId) => {
    const [userStats, recentActivity, readingPatterns] = await Promise.all([
      PDFSession.getUserReadingStats(userId),
      utils.getUserActivity(userId),
      PageTracking.getUserReadingPatterns(userId)
    ]);

    return {
      user_stats: userStats,
      recent_activity: recentActivity,
      reading_patterns: readingPatterns
    };
  },

  // Validate ObjectId
  isValidObjectId: (id) => {
    return mongoose.Types.ObjectId.isValid(id);
  },

  // Convert string to ObjectId
  toObjectId: (id) => {
    return new mongoose.Types.ObjectId(id);
  }
};

// Export models and utilities
module.exports = {
  // Models
  User,
  File,
  Annotation,
  QuizResult,
  UserSession,
  PageTracking,
  PDFSession,
  
  // Utilities
  utils,
  createIndexes,
  cleanupExpiredSessions,
  
  // Mongoose instance
  mongoose,
  
  // Connection state
  isConnected: () => mongoose.connection.readyState === 1
};