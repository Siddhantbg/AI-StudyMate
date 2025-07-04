const { sequelize } = require('../config/database');
const { DataTypes } = require('sequelize');

// Import all models
const User = require('./User')(sequelize, DataTypes);
const File = require('./File')(sequelize, DataTypes);
const Annotation = require('./Annotation')(sequelize, DataTypes);
const QuizResult = require('./QuizResult')(sequelize, DataTypes);
const UserSession = require('./UserSession')(sequelize, DataTypes);
const PageTracking = require('./PageTracking')(sequelize, DataTypes);
const PDFSession = require('./PDFSession')(sequelize, DataTypes);

// Define associations
const defineAssociations = () => {
  // User associations
  User.hasMany(File, { 
    foreignKey: 'user_id', 
    as: 'files',
    onDelete: 'CASCADE'
  });
  
  User.hasMany(Annotation, { 
    foreignKey: 'user_id', 
    as: 'annotations',
    onDelete: 'CASCADE'
  });
  
  User.hasMany(QuizResult, { 
    foreignKey: 'user_id', 
    as: 'quiz_results',
    onDelete: 'CASCADE'
  });
  
  User.hasMany(UserSession, { 
    foreignKey: 'user_id', 
    as: 'sessions',
    onDelete: 'CASCADE'
  });
  
  User.hasMany(PageTracking, { 
    foreignKey: 'user_id', 
    as: 'page_tracking',
    onDelete: 'CASCADE'
  });
  
  User.hasMany(PDFSession, { 
    foreignKey: 'user_id', 
    as: 'pdf_sessions',
    onDelete: 'CASCADE'
  });

  // File associations
  File.belongsTo(User, { 
    foreignKey: 'user_id', 
    as: 'user'
  });
  
  File.hasMany(Annotation, { 
    foreignKey: 'file_id', 
    as: 'annotations',
    onDelete: 'CASCADE'
  });
  
  File.hasMany(QuizResult, { 
    foreignKey: 'file_id', 
    as: 'quiz_results',
    onDelete: 'CASCADE'
  });
  
  File.hasMany(PageTracking, { 
    foreignKey: 'file_id', 
    as: 'page_tracking',
    onDelete: 'CASCADE'
  });
  
  File.hasMany(PDFSession, { 
    foreignKey: 'file_id', 
    as: 'pdf_sessions',
    onDelete: 'CASCADE'
  });

  // Annotation associations
  Annotation.belongsTo(User, { 
    foreignKey: 'user_id', 
    as: 'user'
  });
  
  Annotation.belongsTo(File, { 
    foreignKey: 'file_id', 
    as: 'file'
  });

  // QuizResult associations
  QuizResult.belongsTo(User, { 
    foreignKey: 'user_id', 
    as: 'user'
  });
  
  QuizResult.belongsTo(File, { 
    foreignKey: 'file_id', 
    as: 'file'
  });

  // UserSession associations
  UserSession.belongsTo(User, { 
    foreignKey: 'user_id', 
    as: 'user'
  });

  // PageTracking associations
  PageTracking.belongsTo(User, { 
    foreignKey: 'user_id', 
    as: 'user'
  });
  
  PageTracking.belongsTo(File, { 
    foreignKey: 'file_id', 
    as: 'file'
  });

  // PDFSession associations
  PDFSession.belongsTo(User, { 
    foreignKey: 'user_id', 
    as: 'user'
  });
  
  PDFSession.belongsTo(File, { 
    foreignKey: 'file_id', 
    as: 'file'
  });
};

// Initialize associations
defineAssociations();

module.exports = {
  sequelize,
  User,
  File,
  Annotation,
  QuizResult,
  UserSession,
  PageTracking,
  PDFSession,
  
  // Helper function to sync all models
  syncDatabase: async (force = false) => {
    try {
      await sequelize.sync({ force });
      console.log('📊 All database models synchronized successfully');
    } catch (error) {
      console.error('❌ Failed to sync database models:', error);
      throw error;
    }
  }
};