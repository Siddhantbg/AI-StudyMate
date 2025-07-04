#!/usr/bin/env node

/**
 * Database Initialization Script
 * 
 * This script initializes the PostgreSQL database for the Forest PDF Viewer application.
 * It creates all necessary tables and sets up the database schema.
 * 
 * Usage:
 *   node scripts/initDatabase.js [--force] [--env=development|test|production]
 * 
 * Options:
 *   --force: Drop all existing tables and recreate them (WARNING: This will delete all data!)
 *   --env: Specify the environment (default: development)
 * 
 * Examples:
 *   node scripts/initDatabase.js                    # Initialize development database
 *   node scripts/initDatabase.js --force           # Recreate development database (deletes data)
 *   node scripts/initDatabase.js --env=production  # Initialize production database
 */

const { testConnection, initializeDatabase } = require('../config/database');
const { syncDatabase } = require('../models');

// Parse command line arguments
const args = process.argv.slice(2);
const force = args.includes('--force');
const envArg = args.find(arg => arg.startsWith('--env='));
const environment = envArg ? envArg.split('=')[1] : process.env.NODE_ENV || 'development';

// Set environment
process.env.NODE_ENV = environment;

async function initDatabase() {
  console.log('🌲 Forest PDF Viewer - Database Initialization');
  console.log('================================================');
  console.log(`Environment: ${environment}`);
  console.log(`Force mode: ${force ? 'YES (will delete existing data!)' : 'NO'}`);
  console.log('');

  try {
    // Step 1: Test database connection
    console.log('🔗 Testing database connection...');
    const connectionSuccess = await testConnection();
    
    if (!connectionSuccess) {
      console.error('❌ Cannot proceed without database connection.');
      console.error('💡 Please check your database configuration in .env file:');
      console.error('   - DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD');
      console.error('   - Make sure PostgreSQL is running and accessible');
      process.exit(1);
    }

    // Step 2: Show warning for force mode
    if (force) {
      console.log('');
      console.log('⚠️  WARNING: Force mode is enabled!');
      console.log('⚠️  This will DELETE ALL EXISTING DATA in the database!');
      console.log('');
      
      // In production, require explicit confirmation
      if (environment === 'production') {
        console.log('❌ Force mode is not allowed in production environment.');
        console.log('💡 To reset production database, please do it manually with proper backups.');
        process.exit(1);
      }
      
      // Wait for 3 seconds to give user a chance to cancel
      console.log('⏳ Starting in 3 seconds... (Press Ctrl+C to cancel)');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    // Step 3: Sync database models
    console.log('📊 Synchronizing database models...');
    await syncDatabase(force);

    // Step 4: Create default data (if needed)
    if (force || environment === 'development') {
      console.log('🌱 Creating default data...');
      await createDefaultData();
    }

    // Step 5: Success message
    console.log('');
    console.log('✅ Database initialization completed successfully!');
    console.log('');
    console.log('📋 Summary:');
    console.log(`   Environment: ${environment}`);
    console.log(`   Database: ${process.env.DB_NAME || 'forest_pdf_viewer_dev'}`);
    console.log(`   Host: ${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 5432}`);
    console.log('');
    console.log('🚀 Your database is ready for the Forest PDF Viewer application!');

  } catch (error) {
    console.error('');
    console.error('❌ Database initialization failed:');
    console.error(error.message);
    console.error('');
    console.error('🔧 Troubleshooting tips:');
    console.error('   1. Make sure PostgreSQL is running');
    console.error('   2. Check your database credentials in .env file');
    console.error('   3. Ensure the database user has necessary permissions');
    console.error('   4. Verify the database name exists (or can be created)');
    console.error('');
    process.exit(1);
  }
}

async function createDefaultData() {
  try {
    const { User } = require('../models');
    
    // Check if admin user already exists
    const adminUser = await User.findByEmail('admin@forestpdf.com');
    
    if (!adminUser) {
      // Create default admin user
      await User.create({
        email: 'admin@forestpdf.com',
        password: 'admin123456', // This will be hashed automatically
        first_name: 'Admin',
        last_name: 'User',
        email_verified: true,
        preferences: {
          theme: 'forest',
          default_zoom: 1.0,
          auto_save_annotations: true,
          ai_suggestions_enabled: true,
          notification_settings: {
            email_notifications: true,
            quiz_reminders: true
          }
        }
      });
      
      console.log('👤 Created default admin user: admin@forestpdf.com (password: admin123456)');
      console.log('⚠️  Please change the default password after first login!');
    }

    // Create test user in development environment
    if (environment === 'development') {
      const testUser = await User.findByEmail('test@forestpdf.com');
      
      if (!testUser) {
        await User.create({
          email: 'test@forestpdf.com',
          password: 'test123456',
          first_name: 'Test',
          last_name: 'User',
          email_verified: true
        });
        
        console.log('👤 Created test user: test@forestpdf.com (password: test123456)');
      }
    }

  } catch (error) {
    console.warn('⚠️  Could not create default data:', error.message);
    // Don't fail the entire process for this
  }
}

// Handle process termination gracefully
process.on('SIGINT', () => {
  console.log('\n\n🛑 Process interrupted by user. Exiting...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n🛑 Process terminated. Exiting...');
  process.exit(0);
});

// Run the initialization
initDatabase();