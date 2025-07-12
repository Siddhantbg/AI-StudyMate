#!/usr/bin/env node

// File Migration Script: Uploads Folder → MongoDB
// This script migrates existing files from the filesystem to MongoDB

const fs = require('fs');
const path = require('path');
const readline = require('readline');
require('dotenv').config();

// Import models and database connection
const { connectToMongoDB } = require('./config/mongodb');
const File = require('./models/mongodb/File');

class FileMigration {
  constructor() {
    this.migrationStats = {
      totalFiles: 0,
      migrated: 0,
      skipped: 0,
      errors: 0,
      duplicates: 0
    };
    this.uploadsDir = path.join(__dirname, 'uploads');
  }

  async run() {
    console.log('🚀 Starting File Migration: Uploads Folder → MongoDB\n');
    
    try {
      // Connect to MongoDB
      await connectToMongoDB();
      console.log('✅ Connected to MongoDB\n');

      // Check uploads directory
      if (!fs.existsSync(this.uploadsDir)) {
        console.log('❌ Uploads directory does not exist!');
        return;
      }

      // Find files to migrate
      await this.scanForFiles();
      
      if (this.migrationStats.totalFiles === 0) {
        console.log('ℹ️  No files found to migrate.');
        return;
      }
      
      // Show migration plan
      this.showMigrationPlan();
      
      // Ask for confirmation
      const confirm = await this.askForConfirmation();
      
      if (confirm) {
        await this.performMigration();
        this.showResults();
      } else {
        console.log('❌ Migration cancelled.');
      }
      
    } catch (error) {
      console.error('❌ Migration failed:', error);
    } finally {
      process.exit(0);
    }
  }

  async scanForFiles() {
    console.log('🔍 Scanning uploads directory...');
    
    const files = fs.readdirSync(this.uploadsDir);
    const pdfFiles = files.filter(file => file.toLowerCase().endsWith('.pdf'));
    
    this.migrationStats.totalFiles = pdfFiles.length;
    console.log(`Found ${pdfFiles.length} PDF files in uploads directory`);
    
    // Check which files already exist in database
    for (const filename of pdfFiles) {
      const existingFile = await File.findOne({ filename: filename });
      if (existingFile) {
        this.migrationStats.duplicates++;
        console.log(`   📋 ${filename} - Already in database`);
      } else {
        console.log(`   📄 ${filename} - Ready for migration`);
      }
    }
    
    console.log(`\n📊 Scan complete:`);
    console.log(`   - ${this.migrationStats.totalFiles} total PDF files`);
    console.log(`   - ${this.migrationStats.duplicates} already in database`);
    console.log(`   - ${this.migrationStats.totalFiles - this.migrationStats.duplicates} ready for migration\n`);
  }

  showMigrationPlan() {
    console.log('📋 MIGRATION PLAN');
    console.log('==================\n');
    
    console.log('📦 What will happen:');
    console.log('   1. Read PDF files from uploads/ directory');
    console.log('   2. Store binary data in MongoDB documents');
    console.log('   3. Create file records with storage_type = "mongodb"');
    console.log('   4. Preserve original filenames and metadata');
    console.log('   5. Files will remain in uploads/ (not deleted)\n');
    
    console.log('⚠️  Important notes:');
    console.log('   - Files already in database will be skipped');
    console.log('   - Original files in uploads/ will NOT be deleted');
    console.log('   - Large files may take time to process');
    console.log('   - Database size will increase significantly\n');
    
    const filesToMigrate = this.migrationStats.totalFiles - this.migrationStats.duplicates;
    console.log(`🎯 Files to migrate: ${filesToMigrate}`);
    
    if (filesToMigrate > 0) {
      console.log('💾 Make sure your MongoDB has sufficient storage space.\n');
    }
  }

  async askForConfirmation() {
    const filesToMigrate = this.migrationStats.totalFiles - this.migrationStats.duplicates;
    
    if (filesToMigrate === 0) {
      console.log('✨ All files are already migrated. Nothing to do!');
      return false;
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve) => {
      rl.question('Do you want to proceed with the migration? (type "yes" to confirm): ', (answer) => {
        rl.close();
        resolve(answer.toLowerCase().trim() === 'yes');
      });
    });
  }

  async performMigration() {
    console.log('\n🚀 Starting migration...\n');
    
    const files = fs.readdirSync(this.uploadsDir);
    const pdfFiles = files.filter(file => file.toLowerCase().endsWith('.pdf'));
    
    for (const filename of pdfFiles) {
      try {
        // Check if file already exists in database
        const existingFile = await File.findOne({ filename: filename });
        if (existingFile) {
          console.log(`   ⏭️  Skipped: ${filename} (already in database)`);
          this.migrationStats.skipped++;
          continue;
        }
        
        // Read file from filesystem
        const filePath = path.join(this.uploadsDir, filename);
        const fileStats = fs.statSync(filePath);
        const fileBuffer = fs.readFileSync(filePath);
        
        console.log(`   📤 Migrating: ${filename} (${(fileStats.size / 1024 / 1024).toFixed(2)} MB)`);
        
        // Create file record in MongoDB
        const fileRecord = new File({
          user_id: null, // Will need to be set manually or through user mapping
          filename: filename,
          original_name: filename.replace(/^pdf-\d+-\d+-/, '').replace('.pdf', '.pdf'), // Try to extract original name
          file_size: fileStats.size,
          file_data: fileBuffer,
          storage_type: 'mongodb',
          upload_source: 'migration',
          processing_status: 'pending',
          created_at: fileStats.birthtime,
          updated_at: fileStats.mtime
        });
        
        await fileRecord.save();
        
        console.log(`   ✅ Migrated: ${filename}`);
        this.migrationStats.migrated++;
        
      } catch (error) {
        console.log(`   ❌ Failed: ${filename} - ${error.message}`);
        this.migrationStats.errors++;
      }
    }
  }

  showResults() {
    console.log('\n🎉 MIGRATION COMPLETED!');
    console.log('=======================\n');
    
    console.log('📊 Migration Results:');
    console.log(`   - Total files processed: ${this.migrationStats.totalFiles}`);
    console.log(`   - Successfully migrated: ${this.migrationStats.migrated}`);
    console.log(`   - Skipped (duplicates): ${this.migrationStats.skipped}`);
    console.log(`   - Errors: ${this.migrationStats.errors}\n`);
    
    if (this.migrationStats.migrated > 0) {
      console.log('✅ Files are now stored in MongoDB!');
      console.log('💡 Next steps:');
      console.log('   1. Test file uploads and downloads');
      console.log('   2. Verify files are served correctly');
      console.log('   3. Consider removing uploads/ directory after testing');
      console.log('   4. Update user associations if needed\n');
    }
    
    if (this.migrationStats.errors > 0) {
      console.log('⚠️  Some files failed to migrate. Check the logs above.');
    }
    
    console.log('🔄 Restart your server to use the new MongoDB storage system.');
  }
}

// Show usage information
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
File Migration Utility: Uploads Folder → MongoDB

This script migrates existing PDF files from the uploads/ directory to MongoDB.

Usage:
  node migrate-files-to-mongodb.js

What it does:
  1. Scans uploads/ directory for PDF files
  2. Checks which files are already in MongoDB
  3. Shows a detailed migration plan
  4. Asks for confirmation before proceeding
  5. Reads files from disk and stores binary data in MongoDB
  6. Creates file records with storage_type = "mongodb"

Safety:
  - Always shows what will be migrated before proceeding
  - Skips files already in database
  - Original files remain in uploads/ directory
  - Requires explicit "yes" confirmation

Note:
  - Migrated files will not have user associations
  - You may need to manually assign files to users
  - Large files will increase database size significantly
  `);
  process.exit(0);
}

// Run the migration
const migration = new FileMigration();
migration.run();