const { Sequelize } = require('sequelize');
require('dotenv').config();

// Database configuration
const databaseConfig = {
  development: {
    database: process.env.DB_NAME || 'forest_pdf_viewer_dev',
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
    logging: console.log, // Enable SQL logging in development
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  },
  test: {
    database: process.env.DB_NAME_TEST || 'forest_pdf_viewer_test',
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
    logging: false, // Disable logging in test
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  },
  production: {
    database: process.env.DB_NAME,
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
    logging: false, // Disable logging in production
    pool: {
      max: 20,
      min: 5,
      acquire: 60000,
      idle: 10000
    },
    dialectOptions: {
      ssl: process.env.DB_SSL === 'true' ? {
        require: true,
        rejectUnauthorized: false
      } : false
    }
  }
};

const env = process.env.NODE_ENV || 'development';
const config = databaseConfig[env];

// Create Sequelize instance
const sequelize = new Sequelize(
  config.database,
  config.username,
  config.password,
  {
    host: config.host,
    port: config.port,
    dialect: config.dialect,
    logging: config.logging,
    pool: config.pool,
    dialectOptions: config.dialectOptions || {},
    // Define global model options
    define: {
      timestamps: true,
      underscored: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    }
  }
);

// Test database connection
const testConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log(` Database connection established successfully (${env})`);
    return true;
  } catch (error) {
    console.error('L Unable to connect to the database:', error.message);
    return false;
  }
};

// Initialize database (create if not exists)
const initializeDatabase = async () => {
  try {
    await sequelize.sync({ 
      // Use alter to update existing tables without data loss
      alter: env === 'development'
    });
    console.log('=� Database tables synchronized successfully');
  } catch (error) {
    console.error('L Failed to synchronize database:', error.message);
    throw error;
  }
};

module.exports = {
  sequelize,
  testConnection,
  initializeDatabase,
  databaseConfig
};