#!/usr/bin/env node

// Cleanup Orphaned File Records Script
// This script removes database records for files that don't exist on disk

const fs = require('fs');
const path = require('path');
const readline = require('readline');
require('dotenv').config();

// Import models and database connection
const { connectToMongoDB } = require('./config/mongodb');
const File = require('./models/mongodb/File');

class OrphanedFileCleanup {
  constructor() {
    this.orphanedRecords = [];
    this.pathMismatches = [];
  }

  async run() {
    console.log('🧹 Starting Orphaned File Cleanup...\n');
    
    try {
      // Connect to MongoDB
      await connectToMongoDB();
      console.log('✅ Connected to MongoDB\n');

      // Find orphaned records
      await this.findOrphanedRecords();
      
      if (this.orphanedRecords.length === 0 && this.pathMismatches.length === 0) {
        console.log('✨ No orphaned records found! Database is clean.');
        return;
      }
      
      // Show what will be cleaned up
      this.showCleanupPlan();
      
      // Ask for confirmation
      const confirm = await this.askForConfirmation();
      
      if (confirm) {
        await this.performCleanup();
      } else {
        console.log('❌ Cleanup cancelled.');
      }
      
    } catch (error) {
      console.error('❌ Cleanup failed:', error);
    } finally {
      process.exit(0);
    }
  }

  async findOrphanedRecords() {
    console.log('🔍 Scanning for orphaned file records...');
    
    const files = await File.find({});
    console.log(`Found ${files.length} file records in database`);
    
    for (const file of files) {
      const filePath = path.join(__dirname, file.file_path);
      const exists = fs.existsSync(filePath);
      
      if (!exists) {
        this.orphanedRecords.push(file);
      } else if (file.file_path.includes('\\')) {
        // Check for Windows-style path separators that need fixing
        this.pathMismatches.push(file);
      }
    }
    
    console.log(`\n📋 Scan complete:`);
    console.log(`   - ${this.orphanedRecords.length} orphaned records (files missing on disk)`);
    console.log(`   - ${this.pathMismatches.length} path mismatches (Windows paths need fixing)`);
  }

  showCleanupPlan() {
    console.log('\n📋 CLEANUP PLAN');
    console.log('================\n');
    
    if (this.orphanedRecords.length > 0) {
      console.log('🗑️  The following orphaned records will be DELETED:');
      this.orphanedRecords.forEach((record, index) => {
        console.log(`   ${index + 1}. ${record.filename} (${record.original_name})`);
        console.log(`      User: ${record.user_id}`);
        console.log(`      Created: ${record.created_at}`);
        console.log(`      Path: ${record.file_path}`);
        console.log('');
      });
    }

    if (this.pathMismatches.length > 0) {
      console.log('🔧 The following path mismatches will be FIXED:');
      this.pathMismatches.forEach((record, index) => {
        const newPath = record.file_path.replace(/\\/g, '/');
        console.log(`   ${index + 1}. ${record.filename}`);
        console.log(`      Old path: ${record.file_path}`);
        console.log(`      New path: ${newPath}`);
        console.log('');
      });
    }
    
    console.log('⚠️  WARNING: This action cannot be undone!');
    console.log('💾 Make sure you have a database backup before proceeding.\n');
  }

  async askForConfirmation() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve) => {
      rl.question('Do you want to proceed with the cleanup? (type "yes" to confirm): ', (answer) => {
        rl.close();
        resolve(answer.toLowerCase().trim() === 'yes');
      });
    });
  }

  async performCleanup() {
    console.log('\n🧹 Starting cleanup...\n');
    
    let deletedCount = 0;
    let fixedCount = 0;
    
    // Delete orphaned records
    if (this.orphanedRecords.length > 0) {
      console.log('🗑️  Deleting orphaned records...');
      
      for (const record of this.orphanedRecords) {
        try {
          await File.deleteOne({ _id: record._id });
          console.log(`   ✅ Deleted: ${record.filename}`);
          deletedCount++;
        } catch (error) {
          console.log(`   ❌ Failed to delete ${record.filename}: ${error.message}`);
        }
      }
    }
    
    // Fix path mismatches
    if (this.pathMismatches.length > 0) {
      console.log('\n🔧 Fixing path mismatches...');
      
      for (const record of this.pathMismatches) {
        try {
          const newPath = record.file_path.replace(/\\/g, '/');
          await File.updateOne(
            { _id: record._id },
            { file_path: newPath }
          );
          console.log(`   ✅ Fixed path: ${record.filename}`);
          fixedCount++;
        } catch (error) {
          console.log(`   ❌ Failed to fix ${record.filename}: ${error.message}`);
        }
      }
    }
    
    console.log('\n🎉 Cleanup completed!');
    console.log(`   - ${deletedCount} orphaned records deleted`);
    console.log(`   - ${fixedCount} path mismatches fixed`);
    console.log('\n💡 The infinite loading issue should now be resolved.');
    console.log('🔄 Restart your server to see the changes.');
  }
}

// Show usage information
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
File Cleanup Utility

This script helps clean up orphaned file records that cause infinite loading issues.

Usage:
  node cleanup-orphaned-files.js

What it does:
  1. Scans database for file records that don't have corresponding files on disk
  2. Identifies path mismatches (Windows vs Unix paths)
  3. Shows a detailed cleanup plan
  4. Asks for confirmation before making changes
  5. Removes orphaned records and fixes path issues

Safety:
  - Always shows what will be changed before proceeding
  - Requires explicit "yes" confirmation
  - Recommended to backup database before running
  `);
  process.exit(0);
}

// Run the cleanup
const cleanup = new OrphanedFileCleanup();
cleanup.run();