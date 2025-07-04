const express = require('express');
const { sequelize } = require('../models');

const router = express.Router();

/**
 * @route   GET /api/health
 * @desc    Check server and database health
 * @access  Public
 */
router.get('/', async (req, res) => {
  const healthStatus = {
    server: 'running',
    database: 'disconnected',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    environment: process.env.NODE_ENV || 'development'
  };

  try {
    // Test database connection
    await sequelize.authenticate();
    healthStatus.database = 'connected';
    
    // Get database info
    const dbVersion = await sequelize.query('SELECT version()');
    healthStatus.databaseVersion = dbVersion[0][0]?.version || 'unknown';
    
    res.status(200).json({
      success: true,
      status: 'healthy',
      ...healthStatus
    });
  } catch (error) {
    healthStatus.database = 'error';
    healthStatus.databaseError = error.message;
    
    // Still return 200 for server health, but indicate DB issues
    res.status(200).json({
      success: false,
      status: 'degraded',
      ...healthStatus
    });
  }
});

/**
 * @route   GET /api/health/detailed
 * @desc    Detailed health check with component status
 * @access  Public
 */
router.get('/detailed', async (req, res) => {
  const components = {
    server: { status: 'healthy', timestamp: new Date().toISOString() },
    database: { status: 'unknown', timestamp: new Date().toISOString() },
    storage: { status: 'unknown', timestamp: new Date().toISOString() },
    gemini: { status: 'unknown', timestamp: new Date().toISOString() }
  };

  // Check database
  try {
    await sequelize.authenticate();
    components.database.status = 'healthy';
    
    // Test a simple query
    const result = await sequelize.query('SELECT 1 as test');
    components.database.testQuery = result[0][0]?.test === 1;
  } catch (error) {
    components.database.status = 'error';
    components.database.error = error.message;
  }

  // Check file storage
  try {
    const fs = require('fs').promises;
    const path = require('path');
    const uploadDir = path.join(__dirname, '../uploads');
    
    await fs.access(uploadDir);
    components.storage.status = 'healthy';
    components.storage.path = uploadDir;
  } catch (error) {
    components.storage.status = 'error';
    components.storage.error = error.message;
  }

  // Check Gemini API (basic check)
  try {
    const geminiApiKey = process.env.GEMINI_API_KEY;
    components.gemini.status = geminiApiKey ? 'configured' : 'not_configured';
    components.gemini.hasApiKey = !!geminiApiKey;
  } catch (error) {
    components.gemini.status = 'error';
    components.gemini.error = error.message;
  }

  const overallHealthy = Object.values(components).every(
    comp => comp.status === 'healthy' || comp.status === 'configured'
  );

  res.status(200).json({
    success: overallHealthy,
    status: overallHealthy ? 'healthy' : 'degraded',
    components,
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

module.exports = router;