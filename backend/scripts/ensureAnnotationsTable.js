// Script to ensure annotations table exists with correct structure
const { sequelize } = require('../config/database');
const { Annotation } = require('../models');

async function ensureAnnotationsTable() {
  try {
    console.log('🔧 Ensuring annotations table structure...');
    
    // Sync the Annotation model to create/update the table
    await Annotation.sync({ alter: true });
    
    console.log('✅ Annotations table structure verified/created successfully');
    
    // Test the table by creating a simple query
    const count = await Annotation.count();
    console.log(`📊 Current annotations count: ${count}`);
    
    return true;
  } catch (error) {
    console.error('❌ Failed to ensure annotations table:', error.message);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  ensureAnnotationsTable()
    .then(() => {
      console.log('✅ Annotations table setup completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Failed to setup annotations table:', error);
      process.exit(1);
    });
}

module.exports = { ensureAnnotationsTable };