#!/usr/bin/env node

/**
 * Database Creation Script
 * 
 * This script creates the required databases for the Forest PDF Viewer application.
 */

const { Client } = require('pg');
require('dotenv').config();

async function createDatabases() {
  console.log('🔗 Creating databases for Forest PDF Viewer...');
  console.log('==============================================');

  // Connect to PostgreSQL default database (postgres) to create our databases
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    database: 'postgres' // Connect to default postgres database
  });

  try {
    // Connect to PostgreSQL
    console.log('🔗 Connecting to PostgreSQL...');
    await client.connect();
    console.log('✅ Connected to PostgreSQL successfully');

    // Create development database
    const devDbName = process.env.DB_NAME || 'forest_pdf_viewer_dev';
    console.log(`📊 Creating database: ${devDbName}`);
    
    try {
      await client.query(`CREATE DATABASE "${devDbName}"`);
      console.log(`✅ Database "${devDbName}" created successfully`);
    } catch (error) {
      if (error.code === '42P04') {
        console.log(`ℹ️  Database "${devDbName}" already exists`);
      } else {
        throw error;
      }
    }

    // Create test database
    const testDbName = process.env.DB_NAME_TEST || 'forest_pdf_viewer_test';
    console.log(`📊 Creating database: ${testDbName}`);
    
    try {
      await client.query(`CREATE DATABASE "${testDbName}"`);
      console.log(`✅ Database "${testDbName}" created successfully`);
    } catch (error) {
      if (error.code === '42P04') {
        console.log(`ℹ️  Database "${testDbName}" already exists`);
      } else {
        throw error;
      }
    }

    console.log('');
    console.log('🎉 Database creation completed successfully!');
    console.log('');
    console.log('📋 Created databases:');
    console.log(`   • ${devDbName} (development)`);
    console.log(`   • ${testDbName} (testing)`);
    console.log('');
    console.log('🚀 You can now run: node scripts/initDatabase.js');

  } catch (error) {
    console.error('');
    console.error('❌ Error creating databases:');
    console.error(error.message);
    console.error('');
    console.error('🔧 Troubleshooting tips:');
    console.error('   1. Make sure PostgreSQL is running');
    console.error('   2. Verify your password in .env file is correct');
    console.error('   3. Ensure the postgres user has database creation privileges');
    console.error('');
    process.exit(1);
  } finally {
    await client.end();
  }
}

// Handle process termination gracefully
process.on('SIGINT', () => {
  console.log('\n\n🛑 Process interrupted by user. Exiting...');
  process.exit(0);
});

// Run the database creation
createDatabases();