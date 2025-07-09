const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { File } = require('../models');
const { authenticateToken } = require('../middleware/auth');
// Try Redis-based queue first, fallback to simple queue
let jobQueueService;
try {
  jobQueueService = require('../services/jobQueue');
} catch (error) {
  console.log('⚠️  Redis not available in file processing routes, using simple job queue');
  jobQueueService = require('../services/simpleJobQueue');
}
const pdfProcessor = require('../services/pdfProcessor');
const winston = require('winston');

const router = express.Router();

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'file-processing-api' },
  transports: [
    new winston.transports.File({ 
      filename: 'logs/api-error.log', 
      level: 'error' 
    }),
    new winston.transports.File({ 
      filename: 'logs/api.log' 
    }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// Apply authentication to all routes
router.use(authenticateToken);

/**
 * @route   GET /api/file-processing/status/:fileId
 * @desc    Get processing status for a specific file
 * @access  Private
 */
router.get('/status/:fileId', [
  param('fileId').isUUID().withMessage('Valid file ID is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array(),
        code: 'VALIDATION_ERROR'
      });
    }

    const { fileId } = req.params;

    // Verify user owns this file
    const file = await File.findOne({
      where: {
        id: fileId,
        user_id: req.userId
      }
    });

    if (!file) {
      return res.status(404).json({
        success: false,
        error: 'File not found or access denied',
        code: 'FILE_NOT_FOUND'
      });
    }

    // Get basic file processing status
    const fileStatus = {
      file_id: fileId,
      processing_status: file.processing_status,
      num_pages: file.num_pages,
      has_extracted_text: !!file.extracted_text,
      metadata: file.metadata,
      created_at: file.created_at,
      updated_at: file.updated_at
    };

    // If file is processing, try to get job status
    let jobStatus = null;
    if (file.processing_status === 'processing' || file.processing_status === 'pending') {
      try {
        // Find active job for this file (this is a simplified approach)
        const queueStats = await jobQueueService.getQueueStats();
        jobStatus = {
          queue_position: queueStats.waiting + queueStats.active,
          estimated_wait_time: (queueStats.waiting * 30), // Rough estimate: 30 seconds per job
          queue_stats: queueStats
        };
      } catch (error) {
        logger.warn(`Could not get job status for file ${fileId}`, {
          error: error.message
        });
      }
    }

    res.json({
      success: true,
      data: {
        file: fileStatus,
        job: jobStatus
      }
    });

  } catch (error) {
    logger.error('Get file processing status error', {
      fileId: req.params.fileId,
      userId: req.userId,
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to get file processing status',
      code: 'GET_STATUS_ERROR'
    });
  }
});

/**
 * @route   POST /api/file-processing/trigger/:fileId
 * @desc    Manually trigger processing for a file
 * @access  Private
 */
router.post('/trigger/:fileId', [
  param('fileId').isUUID().withMessage('Valid file ID is required'),
  body('priority').optional().isIn(['low', 'normal', 'high', 'critical']).withMessage('Invalid priority level')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array(),
        code: 'VALIDATION_ERROR'
      });
    }

    const { fileId } = req.params;
    const { priority = 'normal' } = req.body;

    // Verify user owns this file
    const file = await File.findOne({
      where: {
        id: fileId,
        user_id: req.userId
      }
    });

    if (!file) {
      return res.status(404).json({
        success: false,
        error: 'File not found or access denied',
        code: 'FILE_NOT_FOUND'
      });
    }

    // Check if file can be processed
    if (file.processing_status === 'processing') {
      return res.status(409).json({
        success: false,
        error: 'File is already being processed',
        code: 'ALREADY_PROCESSING'
      });
    }

    // Reset status to pending if failed
    if (file.processing_status === 'failed') {
      await file.update({ processing_status: 'pending' });
    }

    // Add to processing queue
    const jobInfo = await jobQueueService.addPDFProcessingJob(fileId, priority);

    logger.info('Processing job triggered manually', {
      fileId,
      userId: req.userId,
      priority,
      jobId: jobInfo.jobId
    });

    res.json({
      success: true,
      message: 'File processing job added to queue',
      data: {
        file_id: fileId,
        job_id: jobInfo.jobId,
        priority,
        queue_status: 'queued',
        estimated_start_time: new Date(Date.now() + 10000).toISOString() // Rough estimate
      }
    });

  } catch (error) {
    logger.error('Trigger file processing error', {
      fileId: req.params.fileId,
      userId: req.userId,
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to trigger file processing',
      code: 'TRIGGER_PROCESSING_ERROR'
    });
  }
});

/**
 * @route   POST /api/file-processing/retry/:fileId
 * @desc    Retry processing for a failed file
 * @access  Private
 */
router.post('/retry/:fileId', [
  param('fileId').isUUID().withMessage('Valid file ID is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array(),
        code: 'VALIDATION_ERROR'
      });
    }

    const { fileId } = req.params;

    // Verify user owns this file
    const file = await File.findOne({
      where: {
        id: fileId,
        user_id: req.userId
      }
    });

    if (!file) {
      return res.status(404).json({
        success: false,
        error: 'File not found or access denied',
        code: 'FILE_NOT_FOUND'
      });
    }

    // Check if file is in failed state
    if (file.processing_status !== 'failed') {
      return res.status(400).json({
        success: false,
        error: 'File is not in failed state',
        code: 'NOT_FAILED_STATUS'
      });
    }

    // Add retry job to queue
    const jobInfo = await jobQueueService.addRetryJob(fileId);

    logger.info('Retry job triggered', {
      fileId,
      userId: req.userId,
      jobId: jobInfo.jobId
    });

    res.json({
      success: true,
      message: 'File retry job added to queue',
      data: {
        file_id: fileId,
        job_id: jobInfo.jobId,
        queue_status: 'queued',
        type: 'retry'
      }
    });

  } catch (error) {
    logger.error('Retry file processing error', {
      fileId: req.params.fileId,
      userId: req.userId,
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to retry file processing',
      code: 'RETRY_PROCESSING_ERROR'
    });
  }
});

/**
 * @route   GET /api/file-processing/queue/stats
 * @desc    Get processing queue statistics
 * @access  Private
 */
router.get('/queue/stats', async (req, res) => {
  try {
    // Get queue statistics
    const queueStats = await jobQueueService.getQueueStats();
    
    // Get processing statistics from database
    const processingStats = await pdfProcessor.getProcessingStats();

    res.json({
      success: true,
      data: {
        queue: queueStats,
        processing: processingStats,
        generated_at: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Get queue stats error', {
      userId: req.userId,
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to get queue statistics',
      code: 'GET_QUEUE_STATS_ERROR'
    });
  }
});

/**
 * @route   GET /api/file-processing/user/files
 * @desc    Get user's files with processing status
 * @access  Private
 */
router.get('/user/files', async (req, res) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;

    const whereClause = {
      user_id: req.userId,
      is_archived: false
    };

    if (status && ['pending', 'processing', 'completed', 'failed'].includes(status)) {
      whereClause.processing_status = status;
    }

    const files = await File.findAndCountAll({
      where: whereClause,
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset),
      attributes: [
        'id', 'filename', 'original_name', 'display_name', 
        'file_size', 'processing_status', 'num_pages',
        'created_at', 'updated_at', 'metadata'
      ]
    });

    const formattedFiles = files.rows.map(file => ({
      id: file.id,
      filename: file.filename,
      original_name: file.original_name,
      display_name: file.display_name || file.original_name,
      file_size: file.file_size,
      processing_status: file.processing_status,
      num_pages: file.num_pages,
      has_extracted_text: !!file.extracted_text,
      created_at: file.created_at,
      updated_at: file.updated_at,
      error_message: file.metadata?.error_message || null
    }));

    res.json({
      success: true,
      data: {
        files: formattedFiles,
        pagination: {
          total: files.count,
          limit: parseInt(limit),
          offset: parseInt(offset),
          has_more: files.count > (parseInt(offset) + parseInt(limit))
        }
      }
    });

  } catch (error) {
    logger.error('Get user files with processing status error', {
      userId: req.userId,
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to get user files',
      code: 'GET_USER_FILES_ERROR'
    });
  }
});

/**
 * @route   DELETE /api/file-processing/queue/clean
 * @desc    Clean old jobs from the queue (admin function)
 * @access  Private
 */
router.delete('/queue/clean', async (req, res) => {
  try {
    const { grace = 86400000 } = req.body; // 24 hours default

    const cleanedCount = await jobQueueService.cleanQueue(parseInt(grace));

    logger.info('Queue cleaning requested', {
      userId: req.userId,
      grace,
      cleanedCount
    });

    res.json({
      success: true,
      message: `Cleaned ${cleanedCount} old jobs from queue`,
      data: {
        cleaned_jobs: cleanedCount,
        grace_period_ms: parseInt(grace)
      }
    });

  } catch (error) {
    logger.error('Clean queue error', {
      userId: req.userId,
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to clean queue',
      code: 'CLEAN_QUEUE_ERROR'
    });
  }
});

module.exports = router;