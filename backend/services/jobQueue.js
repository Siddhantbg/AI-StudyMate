const Bull = require('bull');
const Redis = require('ioredis');
const winston = require('winston');
const pdfProcessor = require('./pdfProcessor');

// Configure logger for job queue
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'job-queue' },
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

class JobQueueService {
  constructor() {
    this.redis = null;
    this.pdfProcessingQueue = null;
    this.isInitialized = false;
    
    // Queue configuration
    this.queueConfig = {
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD || null,
        db: process.env.REDIS_DB || 0,
        retryDelayOnFailover: 100,
        enableReadyCheck: true,
        maxRetriesPerRequest: 3,
      },
      defaultJobOptions: {
        removeOnComplete: 50, // Keep last 50 completed jobs
        removeOnFail: 100,    // Keep last 100 failed jobs
        attempts: 3,          // Retry failed jobs 3 times
        backoff: {
          type: 'exponential',
          delay: 2000,        // Start with 2 second delay
        },
        delay: 1000,          // Initial delay of 1 second
      },
      settings: {
        stalledInterval: 30 * 1000,    // Check for stalled jobs every 30 seconds
        maxStalledCount: 1,            // Max number of times a job can be stalled
      }
    };
  }

  /**
   * Initialize the job queue system
   */
  async initialize() {
    if (this.isInitialized) {
      logger.warn('Job queue already initialized');
      return;
    }

    try {
      // Initialize Redis connection
      this.redis = new Redis(this.queueConfig.redis);
      
      // Test Redis connection
      await this.redis.ping();
      logger.info('Redis connection established successfully');

      // Initialize PDF processing queue
      this.pdfProcessingQueue = new Bull('pdf-processing', {
        redis: this.queueConfig.redis,
        defaultJobOptions: this.queueConfig.defaultJobOptions,
        settings: this.queueConfig.settings
      });

      // Set up job processors
      this.setupJobProcessors();
      
      // Set up event listeners
      this.setupEventListeners();

      this.isInitialized = true;
      logger.info('Job queue system initialized successfully');

    } catch (error) {
      logger.error('Failed to initialize job queue system', {
        error: error.message,
        stack: error.stack
      });
      throw new Error(`Job queue initialization failed: ${error.message}`);
    }
  }

  /**
   * Set up job processors
   */
  setupJobProcessors() {
    // PDF processing job processor
    this.pdfProcessingQueue.process('process-pdf', 5, async (job) => {
      const { fileId, priority = 'normal' } = job.data;
      
      logger.info(`Starting PDF processing job`, {
        jobId: job.id,
        fileId,
        priority,
        attempt: job.attemptsMade + 1
      });

      try {
        // Update job progress
        await job.progress(10);

        // Process the PDF file
        const result = await pdfProcessor.processFile(fileId);
        
        // Update job progress
        await job.progress(100);

        logger.info(`PDF processing job completed`, {
          jobId: job.id,
          fileId,
          processingTime: result.processingTime
        });

        return result;

      } catch (error) {
        logger.error(`PDF processing job failed`, {
          jobId: job.id,
          fileId,
          attempt: job.attemptsMade + 1,
          error: error.message
        });
        throw error;
      }
    });

    // Retry failed files processor
    this.pdfProcessingQueue.process('retry-failed', 2, async (job) => {
      const { fileId } = job.data;
      
      logger.info(`Starting retry job for failed file`, {
        jobId: job.id,
        fileId
      });

      try {
        const result = await pdfProcessor.reprocessFile(fileId);
        
        logger.info(`Retry job completed`, {
          jobId: job.id,
          fileId
        });

        return result;

      } catch (error) {
        logger.error(`Retry job failed`, {
          jobId: job.id,
          fileId,
          error: error.message
        });
        throw error;
      }
    });

    logger.info('Job processors configured successfully');
  }

  /**
   * Set up event listeners for job monitoring
   */
  setupEventListeners() {
    // Job completed
    this.pdfProcessingQueue.on('completed', (job, result) => {
      logger.info(`Job completed`, {
        jobId: job.id,
        type: job.name,
        data: job.data,
        duration: Date.now() - new Date(job.timestamp).getTime()
      });
    });

    // Job failed
    this.pdfProcessingQueue.on('failed', (job, error) => {
      logger.error(`Job failed`, {
        jobId: job.id,
        type: job.name,
        data: job.data,
        attempt: job.attemptsMade,
        error: error.message,
        stack: error.stack
      });
    });

    // Job stalled
    this.pdfProcessingQueue.on('stalled', (job) => {
      logger.warn(`Job stalled`, {
        jobId: job.id,
        type: job.name,
        data: job.data
      });
    });

    // Job active
    this.pdfProcessingQueue.on('active', (job) => {
      logger.info(`Job started`, {
        jobId: job.id,
        type: job.name,
        data: job.data
      });
    });

    // Queue error
    this.pdfProcessingQueue.on('error', (error) => {
      logger.error('Queue error', {
        error: error.message,
        stack: error.stack
      });
    });

    logger.info('Event listeners configured successfully');
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
      throw new Error('Job queue not initialized');
    }

    try {
      const jobOptions = {
        ...this.queueConfig.defaultJobOptions,
        priority: this.getPriorityValue(priority),
        ...options
      };

      const job = await this.pdfProcessingQueue.add('process-pdf', 
        { fileId, priority },
        jobOptions
      );

      logger.info(`PDF processing job added to queue`, {
        jobId: job.id,
        fileId,
        priority
      });

      return {
        jobId: job.id,
        fileId,
        priority,
        status: 'queued',
        createdAt: new Date().toISOString()
      };

    } catch (error) {
      logger.error(`Failed to add PDF processing job`, {
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
      throw new Error('Job queue not initialized');
    }

    try {
      const job = await this.pdfProcessingQueue.add('retry-failed', 
        { fileId },
        {
          ...this.queueConfig.defaultJobOptions,
          priority: this.getPriorityValue('high'),
          attempts: 1 // Only try once for retry jobs
        }
      );

      logger.info(`Retry job added to queue`, {
        jobId: job.id,
        fileId
      });

      return {
        jobId: job.id,
        fileId,
        status: 'queued',
        type: 'retry',
        createdAt: new Date().toISOString()
      };

    } catch (error) {
      logger.error(`Failed to add retry job`, {
        fileId,
        error: error.message
      });
      throw new Error(`Failed to queue retry job: ${error.message}`);
    }
  }

  /**
   * Get job status by job ID
   * @param {string} jobId - Bull job ID
   * @returns {Promise<Object>} Job status information
   */
  async getJobStatus(jobId) {
    if (!this.isInitialized) {
      throw new Error('Job queue not initialized');
    }

    try {
      const job = await this.pdfProcessingQueue.getJob(jobId);
      
      if (!job) {
        return { status: 'not_found' };
      }

      const state = await job.getState();
      const progress = job.progress();

      return {
        jobId: job.id,
        status: state,
        progress,
        data: job.data,
        createdAt: new Date(job.timestamp).toISOString(),
        processedOn: job.processedOn ? new Date(job.processedOn).toISOString() : null,
        finishedOn: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
        failedReason: job.failedReason || null,
        attemptsMade: job.attemptsMade || 0
      };

    } catch (error) {
      logger.error(`Failed to get job status`, {
        jobId,
        error: error.message
      });
      throw new Error(`Failed to get job status: ${error.message}`);
    }
  }

  /**
   * Get queue statistics
   * @returns {Promise<Object>} Queue statistics
   */
  async getQueueStats() {
    if (!this.isInitialized) {
      throw new Error('Job queue not initialized');
    }

    try {
      const [
        waiting,
        active,
        completed,
        failed,
        delayed,
        paused
      ] = await Promise.all([
        this.pdfProcessingQueue.getWaiting(),
        this.pdfProcessingQueue.getActive(),
        this.pdfProcessingQueue.getCompleted(),
        this.pdfProcessingQueue.getFailed(),
        this.pdfProcessingQueue.getDelayed(),
        this.pdfProcessingQueue.getPaused()
      ]);

      return {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        delayed: delayed.length,
        paused: paused.length,
        total: waiting.length + active.length + completed.length + failed.length + delayed.length + paused.length,
        generatedAt: new Date().toISOString()
      };

    } catch (error) {
      logger.error('Failed to get queue statistics', {
        error: error.message
      });
      throw new Error(`Failed to get queue statistics: ${error.message}`);
    }
  }

  /**
   * Clean old jobs from the queue
   * @param {number} grace - Grace period in milliseconds
   */
  async cleanQueue(grace = 24 * 60 * 60 * 1000) { // 24 hours default
    if (!this.isInitialized) {
      throw new Error('Job queue not initialized');
    }

    try {
      const cleaned = await this.pdfProcessingQueue.clean(grace);
      logger.info(`Queue cleaned`, { jobsCleaned: cleaned.length });
      return cleaned.length;
    } catch (error) {
      logger.error('Failed to clean queue', { error: error.message });
      throw error;
    }
  }

  /**
   * Convert priority string to numeric value
   * @param {string} priority - Priority string
   * @returns {number} Priority value
   */
  getPriorityValue(priority) {
    const priorityMap = {
      'low': 1,
      'normal': 5,
      'high': 10,
      'critical': 15
    };
    return priorityMap[priority] || priorityMap['normal'];
  }

  /**
   * Gracefully shutdown the job queue
   */
  async shutdown() {
    if (!this.isInitialized) {
      return;
    }

    try {
      logger.info('Shutting down job queue system...');
      
      if (this.pdfProcessingQueue) {
        await this.pdfProcessingQueue.close();
      }
      
      if (this.redis) {
        await this.redis.disconnect();
      }

      this.isInitialized = false;
      logger.info('Job queue system shutdown completed');

    } catch (error) {
      logger.error('Error during job queue shutdown', {
        error: error.message
      });
      throw error;
    }
  }
}

// Create singleton instance
const jobQueueService = new JobQueueService();

module.exports = jobQueueService;