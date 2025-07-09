const winston = require('winston');
const pdfProcessor = require('./pdfProcessor');

// Configure logger for simple job queue
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'simple-job-queue' },
  transports: [
    new winston.transports.File({ 
      filename: 'logs/job-queue-error.log', 
      level: 'error' 
    }),
    new winston.transports.File({ 
      filename: 'logs/job-queue.log' 
    }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

class SimpleJobQueueService {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.isInitialized = false;
    this.stats = {
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      total: 0
    };
  }

  /**
   * Initialize the simple job queue system
   */
  async initialize() {
    if (this.isInitialized) {
      logger.warn('Simple job queue already initialized');
      return;
    }

    try {
      this.isInitialized = true;
      this.startProcessing();
      logger.info('Simple job queue system initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize simple job queue system', {
        error: error.message,
        stack: error.stack
      });
      throw new Error(`Simple job queue initialization failed: ${error.message}`);
    }
  }

  /**
   * Add a PDF processing job to the queue
   * @param {string} fileId - UUID of the file to process
   * @param {string} priority - Job priority (low, normal, high, critical)
   * @param {Object} options - Additional job options
   * @returns {Promise<Object>} Job information
   */
  async addPDFProcessingJob(fileId, priority = 'normal', options = {}) {
    if (!this.isInitialized) {
      throw new Error('Simple job queue not initialized');
    }

    try {
      const job = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        type: 'process-pdf',
        fileId,
        priority,
        status: 'waiting',
        createdAt: new Date().toISOString(),
        attemptsMade: 0,
        maxAttempts: 3
      };

      this.queue.push(job);
      this.stats.waiting++;
      this.stats.total++;

      logger.info(`PDF processing job added to simple queue`, {
        jobId: job.id,
        fileId,
        priority,
        queueLength: this.queue.length
      });

      return {
        jobId: job.id,
        fileId,
        priority,
        status: 'queued',
        createdAt: job.createdAt
      };

    } catch (error) {
      logger.error(`Failed to add PDF processing job to simple queue`, {
        fileId,
        priority,
        error: error.message
      });
      throw new Error(`Failed to queue PDF processing job: ${error.message}`);
    }
  }

  /**
   * Add a retry job for a failed file
   * @param {string} fileId - UUID of the file to retry
   * @returns {Promise<Object>} Job information
   */
  async addRetryJob(fileId) {
    if (!this.isInitialized) {
      throw new Error('Simple job queue not initialized');
    }

    try {
      const job = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        type: 'retry-failed',
        fileId,
        priority: 'high',
        status: 'waiting',
        createdAt: new Date().toISOString(),
        attemptsMade: 0,
        maxAttempts: 1
      };

      this.queue.unshift(job); // Add to front for higher priority
      this.stats.waiting++;
      this.stats.total++;

      logger.info(`Retry job added to simple queue`, {
        jobId: job.id,
        fileId,
        queueLength: this.queue.length
      });

      return {
        jobId: job.id,
        fileId,
        status: 'queued',
        type: 'retry',
        createdAt: job.createdAt
      };

    } catch (error) {
      logger.error(`Failed to add retry job to simple queue`, {
        fileId,
        error: error.message
      });
      throw new Error(`Failed to queue retry job: ${error.message}`);
    }
  }

  /**
   * Start processing jobs from the queue
   */
  async startProcessing() {
    if (this.processing) {
      return;
    }

    this.processing = true;
    logger.info('Started simple job queue processing');

    while (this.isInitialized) {
      try {
        if (this.queue.length === 0) {
          // Wait for 1 second before checking again
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }

        const job = this.queue.shift();
        this.stats.waiting--;
        this.stats.active++;

        await this.processJob(job);

      } catch (error) {
        logger.error('Error in job processing loop', { error: error.message });
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds on error
      }
    }

    this.processing = false;
    logger.info('Stopped simple job queue processing');
  }

  /**
   * Process a single job
   * @param {Object} job - Job to process
   */
  async processJob(job) {
    const startTime = Date.now();
    
    try {
      logger.info(`Processing job`, {
        jobId: job.id,
        type: job.type,
        fileId: job.fileId,
        attempt: job.attemptsMade + 1
      });

      job.status = 'processing';
      job.startedAt = new Date().toISOString();
      job.attemptsMade++;

      let result;
      if (job.type === 'process-pdf') {
        result = await pdfProcessor.processFile(job.fileId);
      } else if (job.type === 'retry-failed') {
        result = await pdfProcessor.reprocessFile(job.fileId);
      } else {
        throw new Error(`Unknown job type: ${job.type}`);
      }

      // Job completed successfully
      job.status = 'completed';
      job.completedAt = new Date().toISOString();
      job.result = result;
      
      this.stats.active--;
      this.stats.completed++;

      logger.info(`Job completed successfully`, {
        jobId: job.id,
        type: job.type,
        fileId: job.fileId,
        duration: Date.now() - startTime
      });

    } catch (error) {
      this.stats.active--;
      
      logger.error(`Job failed`, {
        jobId: job.id,
        type: job.type,
        fileId: job.fileId,
        attempt: job.attemptsMade,
        error: error.message
      });

      // Retry logic
      if (job.attemptsMade < job.maxAttempts) {
        job.status = 'waiting';
        this.queue.push(job); // Add back to queue for retry
        this.stats.waiting++;
        
        logger.info(`Job queued for retry`, {
          jobId: job.id,
          attempt: job.attemptsMade + 1,
          maxAttempts: job.maxAttempts
        });
      } else {
        job.status = 'failed';
        job.failedAt = new Date().toISOString();
        job.error = error.message;
        this.stats.failed++;
        
        logger.error(`Job failed permanently`, {
          jobId: job.id,
          type: job.type,
          fileId: job.fileId,
          attempts: job.attemptsMade
        });
      }
    }
  }

  /**
   * Get queue statistics
   * @returns {Promise<Object>} Queue statistics
   */
  async getQueueStats() {
    if (!this.isInitialized) {
      throw new Error('Simple job queue not initialized');
    }

    return {
      waiting: this.stats.waiting,
      active: this.stats.active,
      completed: this.stats.completed,
      failed: this.stats.failed,
      delayed: 0,
      paused: 0,
      total: this.stats.total,
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * Get job status by job ID
   * @param {string} jobId - Job ID
   * @returns {Promise<Object>} Job status information
   */
  async getJobStatus(jobId) {
    if (!this.isInitialized) {
      throw new Error('Simple job queue not initialized');
    }

    // This is a simplified implementation - in production you'd want to store job history
    return { status: 'not_implemented' };
  }

  /**
   * Clean old jobs from the queue (no-op for simple queue)
   * @param {number} grace - Grace period in milliseconds
   */
  async cleanQueue(grace = 24 * 60 * 60 * 1000) {
    logger.info('Clean queue called (no-op for simple queue)');
    return 0;
  }

  /**
   * Gracefully shutdown the simple job queue
   */
  async shutdown() {
    if (!this.isInitialized) {
      return;
    }

    logger.info('Shutting down simple job queue system...');
    this.isInitialized = false;
    
    // Wait for current processing to finish
    while (this.processing) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    logger.info('Simple job queue system shutdown completed');
  }
}

// Create singleton instance
const simpleJobQueueService = new SimpleJobQueueService();

module.exports = simpleJobQueueService;