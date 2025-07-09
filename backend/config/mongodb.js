const mongoose = require('mongoose');
require('dotenv').config();

// MongoDB configuration
const mongoConfig = {
  development: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/forest_pdf_viewer_dev',
    options: {
      maxPoolSize: 10, // Maintain up to 10 socket connections
      serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
      socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
    }
  },
  test: {
    uri: process.env.MONGODB_URI_TEST || 'mongodb://localhost:27017/forest_pdf_viewer_test',
    options: {
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    }
  },
  production: {
    uri: process.env.MONGODB_URI,
    options: {
      maxPoolSize: 20,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      ssl: process.env.MONGODB_SSL === 'true',
      authSource: process.env.MONGODB_AUTH_SOURCE || 'admin',
    }
  }
};

const env = process.env.NODE_ENV || 'development';
const config = mongoConfig[env];

// Connection state management
let isConnected = false;

// Connect to MongoDB
const connectToMongoDB = async () => {
  if (isConnected) {
    console.log('📊 Already connected to MongoDB');
    return mongoose.connection;
  }

  try {
    console.log('🔗 Connecting to MongoDB...');
    console.log(`📍 Environment: ${env}`);
    console.log(`🌐 URI: ${config.uri.replace(/\/\/.*@/, '//***:***@')}`); // Hide credentials in logs
    
    await mongoose.connect(config.uri, config.options);
    
    isConnected = true;
    console.log('✅ Connected to MongoDB successfully');
    return mongoose.connection;
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    throw error;
  }
};

// Test MongoDB connection
const testConnection = async () => {
  try {
    if (!isConnected) {
      await connectToMongoDB();
    }
    
    // Test the connection with a ping
    await mongoose.connection.db.admin().ping();
    console.log('🏓 MongoDB connection test successful');
    return true;
  } catch (error) {
    console.error('❌ MongoDB connection test failed:', error.message);
    return false;
  }
};

// Close MongoDB connection
const closeConnection = async () => {
  if (isConnected) {
    await mongoose.connection.close();
    isConnected = false;
    console.log('🔌 MongoDB connection closed');
  }
};

// Connection event handlers
mongoose.connection.on('connected', () => {
  console.log('📡 Mongoose connected to MongoDB');
  isConnected = true;
});

mongoose.connection.on('error', (err) => {
  console.error('❌ Mongoose connection error:', err);
  isConnected = false;
});

mongoose.connection.on('disconnected', () => {
  console.log('📴 Mongoose disconnected from MongoDB');
  isConnected = false;
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await closeConnection();
  process.exit(0);
});

// Initialize database indexes and collections
const initializeDatabase = async () => {
  try {
    if (!isConnected) {
      await connectToMongoDB();
    }
    
    console.log('🔧 Initializing MongoDB collections and indexes...');
    
    // Import models to register schemas and create indexes
    require('../models/mongodb');
    
    console.log('✅ MongoDB database initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize MongoDB database:', error.message);
    throw error;
  }
};

module.exports = {
  mongoose,
  connectToMongoDB,
  testConnection,
  closeConnection,
  initializeDatabase,
  isConnected: () => isConnected,
  config: mongoConfig
};