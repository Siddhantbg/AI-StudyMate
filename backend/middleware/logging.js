const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// Define log levels
const logLevels = {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    debug: 4
};

// Define log colors
const logColors = {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    http: 'magenta',
    debug: 'white'
};

winston.addColors(logColors);

// Create logger instance
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    levels: logLevels,
    format: winston.format.combine(
        winston.format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss'
        }),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    defaultMeta: { service: 'forest-pdf-viewer' },
    transports: [
        // Error log file
        new winston.transports.File({
            filename: path.join(logsDir, 'error.log'),
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 5,
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json()
            )
        }),
        
        // Combined log file
        new winston.transports.File({
            filename: path.join(logsDir, 'combined.log'),
            maxsize: 5242880, // 5MB
            maxFiles: 5,
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json()
            )
        }),
        
        // HTTP access log
        new winston.transports.File({
            filename: path.join(logsDir, 'access.log'),
            level: 'http',
            maxsize: 5242880, // 5MB
            maxFiles: 5,
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json()
            )
        })
    ]
});

// Console logging for development
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize({ all: true }),
            winston.format.timestamp({
                format: 'YYYY-MM-DD HH:mm:ss'
            }),
            winston.format.printf(
                (info) => `${info.timestamp} ${info.level}: ${info.message}`
            )
        )
    }));
}

// Express middleware for HTTP request logging
const httpLogger = (req, res, next) => {
    const startTime = Date.now();
    
    // Log request
    logger.http('Incoming request', {
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        userId: req.userId || null,
        timestamp: new Date().toISOString()
    });

    // Override res.end to log response
    const originalEnd = res.end;
    res.end = function(...args) {
        const duration = Date.now() - startTime;
        
        logger.http('Response sent', {
            method: req.method,
            url: req.url,
            statusCode: res.statusCode,
            duration: `${duration}ms`,
            userId: req.userId || null,
            timestamp: new Date().toISOString()
        });

        originalEnd.apply(this, args);
    };

    next();
};

// Error logging middleware
const errorLogger = (error, req, res, next) => {
    logger.error('Application error', {
        error: {
            message: error.message,
            stack: error.stack,
            name: error.name
        },
        request: {
            method: req.method,
            url: req.url,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            userId: req.userId || null,
            body: req.method === 'POST' || req.method === 'PUT' ? req.body : undefined
        },
        timestamp: new Date().toISOString()
    });

    next(error);
};

// Security event logger
const securityLogger = (event, details, req = null) => {
    logger.warn('Security event', {
        event,
        details,
        request: req ? {
            method: req.method,
            url: req.url,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            userId: req.userId || null
        } : null,
        timestamp: new Date().toISOString()
    });
};

// Database operation logger
const dbLogger = (operation, table, details = {}) => {
    logger.info('Database operation', {
        operation,
        table,
        details,
        timestamp: new Date().toISOString()
    });
};

// Authentication event logger
const authLogger = (event, userId, details = {}, req = null) => {
    logger.info('Authentication event', {
        event,
        userId,
        details,
        request: req ? {
            ip: req.ip,
            userAgent: req.get('User-Agent')
        } : null,
        timestamp: new Date().toISOString()
    });
};

// Performance logger
const performanceLogger = (operation, duration, details = {}) => {
    const level = duration > 5000 ? 'warn' : 'info'; // Warn if operation takes more than 5 seconds
    
    logger.log(level, 'Performance metric', {
        operation,
        duration: `${duration}ms`,
        details,
        timestamp: new Date().toISOString()
    });
};

// AI operation logger
const aiLogger = (operation, model, tokens, success, details = {}) => {
    logger.info('AI operation', {
        operation,
        model,
        tokens,
        success,
        details,
        timestamp: new Date().toISOString()
    });
};

// File operation logger
const fileLogger = (operation, filename, userId, details = {}) => {
    logger.info('File operation', {
        operation,
        filename,
        userId,
        details,
        timestamp: new Date().toISOString()
    });
};

// Quiz operation logger
const quizLogger = (operation, userId, quizData = {}) => {
    logger.info('Quiz operation', {
        operation,
        userId,
        quizData,
        timestamp: new Date().toISOString()
    });
};

// Annotation operation logger
const annotationLogger = (operation, annotationType, userId, details = {}) => {
    logger.info('Annotation operation', {
        operation,
        annotationType,
        userId,
        details,
        timestamp: new Date().toISOString()
    });
};

// System health logger
const healthLogger = (component, status, metrics = {}) => {
    const level = status === 'healthy' ? 'info' : 'warn';
    
    logger.log(level, 'System health check', {
        component,
        status,
        metrics,
        timestamp: new Date().toISOString()
    });
};

// Log cleanup function (run periodically)
const cleanupLogs = () => {
    const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
    const cutoffDate = new Date(Date.now() - maxAge);
    
    logger.info('Log cleanup started', {
        cutoffDate: cutoffDate.toISOString(),
        timestamp: new Date().toISOString()
    });
};

module.exports = {
    logger,
    httpLogger,
    errorLogger,
    securityLogger,
    dbLogger,
    authLogger,
    performanceLogger,
    aiLogger,
    fileLogger,
    quizLogger,
    annotationLogger,
    healthLogger,
    cleanupLogs
};