const { logger } = require('./logging');

/**
 * Enhanced Error Handler Middleware
 * 
 * Provides comprehensive error handling for the Forest PDF Viewer application
 */

// Error types and their corresponding HTTP status codes
const ERROR_TYPES = {
  VALIDATION_ERROR: 400,
  AUTHENTICATION_ERROR: 401,
  AUTHORIZATION_ERROR: 403,
  NOT_FOUND_ERROR: 404,
  CONFLICT_ERROR: 409,
  RATE_LIMIT_ERROR: 429,
  DATABASE_ERROR: 500,
  FILE_ERROR: 500,
  AI_SERVICE_ERROR: 503,
  INTERNAL_ERROR: 500
};

// User-friendly error messages
const ERROR_MESSAGES = {
  VALIDATION_ERROR: 'The provided data is invalid',
  AUTHENTICATION_ERROR: 'Authentication required',
  AUTHORIZATION_ERROR: 'Access denied',
  NOT_FOUND_ERROR: 'Resource not found',
  CONFLICT_ERROR: 'Resource conflict',
  RATE_LIMIT_ERROR: 'Too many requests',
  DATABASE_ERROR: 'Database operation failed',
  FILE_ERROR: 'File operation failed',
  AI_SERVICE_ERROR: 'AI service temporarily unavailable',
  INTERNAL_ERROR: 'An unexpected error occurred'
};

/**
 * Create a standardized error object
 */
function createError(type, message, details = null, code = null) {
  const error = new Error(message || ERROR_MESSAGES[type]);
  error.type = type;
  error.statusCode = ERROR_TYPES[type] || 500;
  error.details = details;
  error.code = code;
  error.timestamp = new Date().toISOString();
  return error;
}

/**
 * Validation Error Handler
 */
function handleValidationError(error) {
  return createError(
    'VALIDATION_ERROR',
    'Validation failed',
    error.details || error.errors,
    'VALIDATION_ERROR'
  );
}

/**
 * Database Error Handler
 */
function handleDatabaseError(error) {
  let message = 'Database operation failed';
  let code = 'DATABASE_ERROR';

  // Sequelize specific errors
  if (error.name === 'SequelizeValidationError') {
    message = 'Data validation failed';
    code = 'VALIDATION_ERROR';
    return createError('VALIDATION_ERROR', message, error.errors, code);
  }
  
  if (error.name === 'SequelizeUniqueConstraintError') {
    message = 'Resource already exists';
    code = 'CONFLICT_ERROR';
    return createError('CONFLICT_ERROR', message, error.errors, code);
  }
  
  if (error.name === 'SequelizeForeignKeyConstraintError') {
    message = 'Invalid reference to related resource';
    code = 'VALIDATION_ERROR';
    return createError('VALIDATION_ERROR', message, null, code);
  }

  if (error.name === 'SequelizeConnectionError') {
    message = 'Database connection failed';
    code = 'DATABASE_CONNECTION_ERROR';
  }

  return createError('DATABASE_ERROR', message, null, code);
}

/**
 * File Operation Error Handler
 */
function handleFileError(error) {
  let message = 'File operation failed';
  let code = 'FILE_ERROR';

  if (error.code === 'ENOENT') {
    message = 'File not found';
    code = 'FILE_NOT_FOUND';
    return createError('NOT_FOUND_ERROR', message, null, code);
  }
  
  if (error.code === 'EACCES') {
    message = 'File access denied';
    code = 'FILE_ACCESS_DENIED';
  }
  
  if (error.code === 'EMFILE' || error.code === 'ENFILE') {
    message = 'Too many open files';
    code = 'FILE_LIMIT_EXCEEDED';
  }

  return createError('FILE_ERROR', message, null, code);
}

/**
 * AI Service Error Handler
 */
function handleAIError(error) {
  let message = 'AI service error';
  let code = 'AI_SERVICE_ERROR';

  if (error.message?.includes('overloaded') || error.message?.includes('503')) {
    message = 'AI service temporarily overloaded';
    code = 'AI_SERVICE_OVERLOADED';
  }
  
  if (error.message?.includes('rate limit') || error.message?.includes('429')) {
    message = 'AI service rate limit exceeded';
    code = 'AI_RATE_LIMIT';
    return createError('RATE_LIMIT_ERROR', message, null, code);
  }
  
  if (error.message?.includes('quota') || error.message?.includes('billing')) {
    message = 'AI service quota exceeded';
    code = 'AI_QUOTA_EXCEEDED';
  }

  return createError('AI_SERVICE_ERROR', message, null, code);
}

/**
 * Authentication Error Handler
 */
function handleAuthError(error) {
  let message = 'Authentication failed';
  let code = 'AUTHENTICATION_ERROR';

  if (error.name === 'TokenExpiredError') {
    message = 'Authentication token expired';
    code = 'TOKEN_EXPIRED';
  }
  
  if (error.name === 'JsonWebTokenError') {
    message = 'Invalid authentication token';
    code = 'TOKEN_INVALID';
  }
  
  if (error.message?.includes('password')) {
    message = 'Invalid credentials';
    code = 'INVALID_CREDENTIALS';
  }

  return createError('AUTHENTICATION_ERROR', message, null, code);
}

/**
 * Main Error Handler Middleware
 */
const errorHandler = (error, req, res, next) => {
  let processedError = error;

  // Log the original error
  logger.error('Error occurred', {
    error: {
      message: error.message,
      stack: error.stack,
      name: error.name,
      type: error.type
    },
    request: {
      method: req.method,
      url: req.url,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: req.userId || null
    },
    timestamp: new Date().toISOString()
  });

  // Process different types of errors
  if (error.name?.startsWith('Sequelize')) {
    processedError = handleDatabaseError(error);
  } else if (error.code?.startsWith('E') || error.syscall) {
    processedError = handleFileError(error);
  } else if (error.name === 'ValidationError' || error.name === 'CastError') {
    processedError = handleValidationError(error);
  } else if (error.name?.includes('Token') || error.message?.includes('auth')) {
    processedError = handleAuthError(error);
  } else if (error.message?.includes('gemini') || error.message?.includes('AI')) {
    processedError = handleAIError(error);
  } else if (!error.statusCode) {
    // Generic error without status code
    processedError = createError('INTERNAL_ERROR', error.message);
  }

  // Ensure error has required properties
  const statusCode = processedError.statusCode || 500;
  const message = processedError.message || 'An unexpected error occurred';
  const code = processedError.code || 'INTERNAL_ERROR';

  // Security: Don't expose sensitive information in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  const errorResponse = {
    success: false,
    error: message,
    code: code,
    timestamp: processedError.timestamp || new Date().toISOString()
  };

  // Add additional details in development
  if (isDevelopment) {
    errorResponse.details = processedError.details;
    errorResponse.stack = processedError.stack;
  }

  // Add helpful suggestions for common errors
  if (statusCode === 401) {
    errorResponse.suggestion = 'Please log in to access this resource';
  } else if (statusCode === 403) {
    errorResponse.suggestion = 'You do not have permission to access this resource';
  } else if (statusCode === 404) {
    errorResponse.suggestion = 'Please check the URL or resource identifier';
  } else if (statusCode === 429) {
    errorResponse.suggestion = 'Please wait before making another request';
    errorResponse.retryAfter = processedError.retryAfter || 60;
  } else if (statusCode === 503) {
    errorResponse.suggestion = 'The service is temporarily unavailable. Please try again later';
    errorResponse.retryAfter = processedError.retryAfter || 30;
  }

  res.status(statusCode).json(errorResponse);
};

/**
 * 404 Not Found Handler
 */
const notFoundHandler = (req, res) => {
  const error = createError(
    'NOT_FOUND_ERROR',
    `Route not found: ${req.method} ${req.url}`,
    null,
    'ROUTE_NOT_FOUND'
  );

  logger.warn('Route not found', {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.userId || null,
    timestamp: new Date().toISOString()
  });

  res.status(404).json({
    success: false,
    error: error.message,
    code: error.code,
    timestamp: error.timestamp,
    suggestion: 'Please check the API documentation for available endpoints'
  });
};

/**
 * Async Error Wrapper
 * Wraps async route handlers to catch and forward errors
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Rate Limit Error Handler
 */
const rateLimitHandler = (req, res) => {
  const error = createError(
    'RATE_LIMIT_ERROR',
    'Too many requests from this IP',
    null,
    'RATE_LIMIT_EXCEEDED'
  );

  logger.warn('Rate limit exceeded', {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.userId || null,
    timestamp: new Date().toISOString()
  });

  res.status(429).json({
    success: false,
    error: error.message,
    code: error.code,
    timestamp: error.timestamp,
    retryAfter: 60,
    suggestion: 'Please wait before making another request'
  });
};

/**
 * Multer Error Handler (for file uploads)
 */
const multerErrorHandler = (error, req, res, next) => {
  if (error.code === 'LIMIT_FILE_SIZE') {
    const processedError = createError(
      'VALIDATION_ERROR',
      'File size too large',
      { maxSize: '100MB' },
      'FILE_SIZE_EXCEEDED'
    );
    return errorHandler(processedError, req, res, next);
  }
  
  if (error.code === 'LIMIT_FILE_COUNT') {
    const processedError = createError(
      'VALIDATION_ERROR',
      'Too many files',
      null,
      'FILE_COUNT_EXCEEDED'
    );
    return errorHandler(processedError, req, res, next);
  }
  
  if (error.code === 'LIMIT_UNEXPECTED_FILE') {
    const processedError = createError(
      'VALIDATION_ERROR',
      'Unexpected file field',
      null,
      'UNEXPECTED_FILE_FIELD'
    );
    return errorHandler(processedError, req, res, next);
  }

  // If it's not a multer error, pass it to the general error handler
  next(error);
};

module.exports = {
  errorHandler,
  notFoundHandler,
  asyncHandler,
  rateLimitHandler,
  multerErrorHandler,
  createError,
  ERROR_TYPES,
  ERROR_MESSAGES
};