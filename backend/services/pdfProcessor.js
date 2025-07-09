const fs = require('fs').promises;
const path = require('path');
const pdfParse = require('pdf-parse');
const { File } = require('../models');
const winston = require('winston');

// Configure logger for PDF processing
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'pdf-processor' },
  transports: [
    new winston.transports.File({ 
      filename: 'logs/pdf-processing-error.log', 
      level: 'error' 
    }),
    new winston.transports.File({ 
      filename: 'logs/pdf-processing.log' 
    }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

class PDFProcessorService {
  constructor() {
    this.maxFileSize = 100 * 1024 * 1024; // 100MB limit
    this.maxProcessingTime = 5 * 60 * 1000; // 5 minutes timeout
    this.supportedMimeTypes = ['application/pdf'];
  }

  /**
   * Main PDF processing function
   * @param {string} fileId - UUID of the file to process
   * @returns {Promise<Object>} Processing result
   */
  async processFile(fileId) {
    const startTime = Date.now();
    logger.info(`Starting PDF processing for file: ${fileId}`);

    try {
      // Find the file record
      const fileRecord = await File.findByPk(fileId);
      if (!fileRecord) {
        throw new Error(`File not found: ${fileId}`);
      }

      // Update status to processing
      await this.updateFileStatus(fileRecord, 'processing');

      // Validate file
      await this.validateFile(fileRecord);

      // Process the PDF
      const processingResult = await this.extractPDFData(fileRecord);

      // Update file record with extracted data
      await this.updateFileWithResults(fileRecord, processingResult);

      // Update status to completed
      await this.updateFileStatus(fileRecord, 'completed');

      const processingTime = Date.now() - startTime;
      logger.info(`PDF processing completed for file: ${fileId} in ${processingTime}ms`);

      return {
        success: true,
        fileId,
        processingTime,
        extractedData: processingResult
      };

    } catch (error) {
      logger.error(`PDF processing failed for file: ${fileId}`, {
        error: error.message,
        stack: error.stack,
        processingTime: Date.now() - startTime
      });

      // Update status to failed
      try {
        const fileRecord = await File.findByPk(fileId);
        if (fileRecord) {
          await this.updateFileStatus(fileRecord, 'failed', error.message);
        }
      } catch (updateError) {
        logger.error(`Failed to update file status to failed: ${updateError.message}`);
      }

      throw error;
    }
  }

  /**
   * Validate file before processing
   * @param {Object} fileRecord - Sequelize file model instance
   */
  async validateFile(fileRecord) {
    const filePath = path.join(process.cwd(), fileRecord.file_path);

    // Check if file exists
    try {
      await fs.access(filePath);
    } catch (error) {
      throw new Error(`File not found at path: ${filePath}`);
    }

    // Check file size
    const stats = await fs.stat(filePath);
    if (stats.size > this.maxFileSize) {
      throw new Error(`File size (${stats.size}) exceeds maximum allowed size (${this.maxFileSize})`);
    }

    // Verify file size matches database record
    if (stats.size !== parseInt(fileRecord.file_size)) {
      logger.warn(`File size mismatch for ${fileRecord.id}: DB=${fileRecord.file_size}, Actual=${stats.size}`);
    }

    // Check MIME type
    if (!this.supportedMimeTypes.includes(fileRecord.mime_type)) {
      throw new Error(`Unsupported MIME type: ${fileRecord.mime_type}`);
    }

    logger.info(`File validation passed for: ${fileRecord.id}`);
  }

  /**
   * Extract data from PDF file
   * @param {Object} fileRecord - Sequelize file model instance
   * @returns {Promise<Object>} Extracted data
   */
  async extractPDFData(fileRecord) {
    const filePath = path.join(process.cwd(), fileRecord.file_path);
    
    logger.info(`Starting PDF data extraction for: ${fileRecord.id}`);

    try {
      // Read the PDF file
      const pdfBuffer = await fs.readFile(filePath);

      // Set up processing timeout
      const processingPromise = this.processPDFBuffer(pdfBuffer);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('PDF processing timeout')), this.maxProcessingTime);
      });

      // Race between processing and timeout
      const pdfData = await Promise.race([processingPromise, timeoutPromise]);

      logger.info(`PDF data extraction completed for: ${fileRecord.id}`, {
        pageCount: pdfData.numpages,
        textLength: pdfData.text?.length || 0,
        hasMetadata: !!pdfData.info
      });

      return {
        numPages: pdfData.numpages || 0,
        extractedText: pdfData.text || '',
        metadata: this.extractMetadata(pdfData.info || {}),
        processingInfo: {
          version: pdfData.version || 'unknown',
          renderingTime: pdfData.renderingTime || 0
        }
      };

    } catch (error) {
      logger.error(`PDF data extraction failed for: ${fileRecord.id}`, {
        error: error.message,
        stack: error.stack
      });
      throw new Error(`PDF extraction failed: ${error.message}`);
    }
  }

  /**
   * Process PDF buffer with pdf-parse
   * @param {Buffer} pdfBuffer - PDF file buffer
   * @returns {Promise<Object>} Parsed PDF data
   */
  async processPDFBuffer(pdfBuffer) {
    const options = {
      // Optimization options
      max: 0, // Parse all pages (0 = no limit)
      version: 'v1.10.100', // pdf-parse version to use
      
      // Custom render function for better text extraction
      render_page: (pageData) => {
        // Return text content or null to use default
        return pageData.getTextContent().then((textContent) => {
          let lastY = null;
          let text = '';
          
          for (let item of textContent.items) {
            if (lastY !== null && item.transform[5] !== lastY) {
              text += '\n';
            }
            text += item.str;
            lastY = item.transform[5];
          }
          
          return text;
        });
      }
    };

    return await pdfParse(pdfBuffer, options);
  }

  /**
   * Extract and format metadata from PDF info
   * @param {Object} pdfInfo - PDF info object from pdf-parse
   * @returns {Object} Formatted metadata
   */
  extractMetadata(pdfInfo) {
    return {
      title: pdfInfo.Title || null,
      author: pdfInfo.Author || null,
      subject: pdfInfo.Subject || null,
      keywords: pdfInfo.Keywords || null,
      creator: pdfInfo.Creator || null,
      producer: pdfInfo.Producer || null,
      creation_date: pdfInfo.CreationDate ? new Date(pdfInfo.CreationDate) : null,
      modification_date: pdfInfo.ModDate ? new Date(pdfInfo.ModDate) : null,
      pdf_version: pdfInfo.PDFFormatVersion || null,
      is_encrypted: pdfInfo.IsEncrypted || false,
      is_linearized: pdfInfo.IsLinearized || false,
      page_layout: pdfInfo.PageLayout || null,
      page_mode: pdfInfo.PageMode || null
    };
  }

  /**
   * Update file record with processing results
   * @param {Object} fileRecord - Sequelize file model instance
   * @param {Object} processingResult - Results from PDF processing
   */
  async updateFileWithResults(fileRecord, processingResult) {
    try {
      await fileRecord.update({
        num_pages: processingResult.numPages,
        extracted_text: processingResult.extractedText,
        metadata: {
          ...fileRecord.metadata,
          ...processingResult.metadata,
          processing_info: processingResult.processingInfo,
          processed_at: new Date().toISOString()
        }
      });

      logger.info(`File record updated with processing results: ${fileRecord.id}`);
    } catch (error) {
      logger.error(`Failed to update file record: ${fileRecord.id}`, {
        error: error.message
      });
      throw new Error(`Database update failed: ${error.message}`);
    }
  }

  /**
   * Update file processing status
   * @param {Object} fileRecord - Sequelize file model instance
   * @param {string} status - New processing status
   * @param {string} errorMessage - Optional error message for failed status
   */
  async updateFileStatus(fileRecord, status, errorMessage = null) {
    try {
      const updateData = { processing_status: status };
      
      if (status === 'failed' && errorMessage) {
        updateData.metadata = {
          ...fileRecord.metadata,
          error_message: errorMessage,
          failed_at: new Date().toISOString()
        };
      }

      await fileRecord.update(updateData);
      
      logger.info(`File status updated to ${status}: ${fileRecord.id}`, {
        previousStatus: fileRecord.processing_status,
        errorMessage
      });
    } catch (error) {
      logger.error(`Failed to update file status: ${fileRecord.id}`, {
        targetStatus: status,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Reprocess a failed file
   * @param {string} fileId - UUID of the file to reprocess
   */
  async reprocessFile(fileId) {
    logger.info(`Reprocessing file: ${fileId}`);
    
    const fileRecord = await File.findByPk(fileId);
    if (!fileRecord) {
      throw new Error(`File not found: ${fileId}`);
    }

    // Reset status to pending before reprocessing
    await this.updateFileStatus(fileRecord, 'pending');
    
    // Process the file again
    return await this.processFile(fileId);
  }

  /**
   * Get processing statistics
   * @returns {Promise<Object>} Processing statistics
   */
  async getProcessingStats() {
    try {
      const stats = await File.findAll({
        attributes: [
          'processing_status',
          [File.sequelize.fn('COUNT', '*'), 'count']
        ],
        group: ['processing_status'],
        raw: true
      });

      const totalFiles = await File.count();
      
      return {
        total_files: totalFiles,
        status_breakdown: stats.reduce((acc, stat) => {
          acc[stat.processing_status] = parseInt(stat.count);
          return acc;
        }, {}),
        generated_at: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Failed to get processing statistics', { error: error.message });
      throw error;
    }
  }
}

module.exports = new PDFProcessorService();