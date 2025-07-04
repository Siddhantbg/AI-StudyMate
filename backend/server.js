// backend/server.js
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cookieParser = require('cookie-parser');
require('dotenv').config();

// Initialize database connection
const { testConnection, initializeDatabase } = require('./config/database');

// Import middleware
const { httpLogger, logger } = require('./middleware/logging');
const { errorHandler, notFoundHandler, multerErrorHandler } = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
    origin: ['https://ai-study-mate-seven.vercel.app', 'http://localhost:5173'],
    credentials: true
}));

// Logging middleware (before routes)
app.use(httpLogger);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer configuration for PDF uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + '.pdf');
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 100 * 1024 * 1024, // 100MB limit
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed'));
        }
    }
});

// Routes
app.get('/', (req, res) => {
    res.json({ message: 'Forest PDF Viewer API is running! 🌲' });
});

// PDF Upload endpoint (now requires authentication)
const { authenticateToken, optionalAuth } = require('./middleware/auth');
const { File } = require('./models');

app.post('/api/upload', authenticateToken, upload.single('pdf'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No PDF file uploaded' });
        }

        // Create file record in database
        const fileRecord = await File.create({
            user_id: req.userId,
            filename: req.file.filename,
            original_name: req.file.originalname,
            file_size: req.file.size,
            file_path: req.file.path,
            upload_source: 'server',
            processing_status: 'pending'
        });

        const fileInfo = {
            id: fileRecord.id,
            filename: req.file.filename,
            originalName: req.file.originalname,
            size: req.file.size,
            path: req.file.path,
            uploadTime: fileRecord.created_at
        };

        res.json({
            success: true,
            message: 'PDF uploaded successfully',
            file: fileInfo
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Failed to upload PDF' });
    }
});

// Serve uploaded PDF files (with user authorization)
app.get('/api/files/:filename', authenticateToken, async (req, res) => {
    try {
        const filename = req.params.filename;
        
        // Check if user owns this file
        const fileRecord = await File.findOne({
            where: {
                filename: filename,
                user_id: req.userId
            }
        });
        
        if (!fileRecord) {
            return res.status(404).json({ 
                success: false,
                error: 'File not found or access denied',
                code: 'FILE_NOT_FOUND'
            });
        }
        
        const filePath = path.join(__dirname, 'uploads', filename);
        
        console.log(`Serving file: ${filename} for user: ${req.userId}`);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ 
                success: false,
                error: 'File not found on disk',
                code: 'FILE_NOT_ON_DISK'
            });
        }
        
        // Set proper headers for PDF
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
        res.setHeader('Content-Disposition', `inline; filename="${fileRecord.original_name}"`);
        
        // Stream the file
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);
        
    } catch (error) {
        console.error('File serving error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to serve file',
            code: 'FILE_SERVE_ERROR'
        });
    }
});

// List uploaded files endpoint (user-specific)
app.get('/api/files/list', authenticateToken, async (req, res) => {
    try {
        // Get files from database for the authenticated user
        const userFiles = await File.findAll({
            where: {
                user_id: req.userId,
                is_archived: false
            },
            order: [['created_at', 'DESC']] // Sort by newest first
        });
        
        const formattedFiles = userFiles.map(file => ({
            id: file.id,
            fileName: file.display_name || file.original_name,
            originalName: file.original_name,
            filename: file.filename, // For compatibility with existing frontend
            fileSize: file.file_size,
            fileType: file.mime_type,
            uploadDate: file.created_at,
            source: 'database', // Mark as database-stored file
            numPages: file.num_pages,
            lastReadPage: file.last_read_page,
            totalReadTime: file.total_read_time,
            tags: file.tags,
            isFavorite: file.is_favorite,
            processingStatus: file.processing_status
        }));
        
        res.json({ 
            success: true, 
            files: formattedFiles,
            count: formattedFiles.length 
        });
        
    } catch (error) {
        console.error('Error listing files:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to list uploaded files',
            code: 'FILE_LIST_ERROR'
        });
    }
});

// List uploaded files endpoint (user-specific) - alternative route
app.get('/api/files', authenticateToken, async (req, res) => {
    try {
        // Get files from database for the authenticated user
        const userFiles = await File.findAll({
            where: {
                user_id: req.userId,
                is_archived: false
            },
            order: [['created_at', 'DESC']] // Sort by newest first
        });
        
        const formattedFiles = userFiles.map(file => ({
            id: file.id,
            fileName: file.display_name || file.original_name,
            originalName: file.original_name,
            uploadedFileName: file.filename, // For compatibility with existing frontend
            fileSize: file.file_size,
            fileType: file.mime_type,
            uploadDate: file.created_at,
            source: 'database', // Mark as database-stored file
            numPages: file.num_pages,
            lastReadPage: file.last_read_page,
            totalReadTime: file.total_read_time,
            tags: file.tags,
            isFavorite: file.is_favorite,
            processingStatus: file.processing_status,
            // readingStats: file.getReadingStats() // Comment out if method doesn't exist
        }));
        
        res.json({ 
            success: true, 
            files: formattedFiles,
            count: formattedFiles.length 
        });
        
    } catch (error) {
        console.error('Error listing files:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to list uploaded files',
            code: 'FILE_LIST_ERROR'
        });
    }
});

// Rename uploaded file endpoint (user-specific)
app.post('/api/files/rename', authenticateToken, async (req, res) => {
    try {
        const { fileId, newName } = req.body;
        
        if (!fileId || !newName) {
            return res.status(400).json({ 
                success: false, 
                error: 'File ID and new name are required',
                code: 'MISSING_PARAMS'
            });
        }

        // Check for invalid characters in display name
        const invalidChars = /[<>:"/\\|?*]/;
        if (invalidChars.test(newName)) {
            return res.status(400).json({ 
                success: false, 
                error: 'File name contains invalid characters',
                code: 'INVALID_CHARACTERS'
            });
        }

        // Find the file record for this user
        const fileRecord = await File.findOne({
            where: {
                id: fileId,
                user_id: req.userId
            }
        });
        
        if (!fileRecord) {
            return res.status(404).json({ 
                success: false, 
                error: 'File not found or access denied',
                code: 'FILE_NOT_FOUND'
            });
        }
        
        // Update the display name in database
        fileRecord.display_name = newName;
        await fileRecord.save();
        
        res.json({
            success: true,
            message: 'File renamed successfully',
            data: {
                fileId: fileRecord.id,
                oldName: fileRecord.original_name,
                newName: newName,
                displayName: fileRecord.display_name
            }
        });
        
    } catch (error) {
        console.error('Rename error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to rename file: ' + error.message,
            code: 'RENAME_ERROR'
        });
    }
});

// Authentication routes
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

// Annotation routes
const annotationRoutes = require('./routes/annotations');
app.use('/api/annotations', annotationRoutes);

// Page tracking routes
const pageTrackingRoutes = require('./routes/pageTracking');
app.use('/api/page-tracking', pageTrackingRoutes);

// Data export routes
const dataExportRoutes = require('./routes/dataExport');
app.use('/api/data-export', dataExportRoutes);

// Gemini API routes
const geminiRoutes = require('./routes/gemini');
app.use('/api/gemini', geminiRoutes);

// PDF processing routes
const pdfRoutes = require('./routes/pdf');
app.use('/api/pdf', pdfRoutes);

// Quiz generation routes
const quizRoutes = require('./routes/quiz');
app.use('/api/quiz', quizRoutes);

// Session persistence routes
const sessionRoutes = require('./routes/sessions');
app.use('/api/sessions', sessionRoutes);

// Health check routes (public)
const healthRoutes = require('./routes/health');
app.use('/api/health', healthRoutes);

// Error handling middleware
app.use(multerErrorHandler); // Handle multer-specific errors first
app.use(errorHandler); // Main error handler
app.use(notFoundHandler); // 404 handler (should be last)

// Initialize database and start server
const startServer = async () => {
    try {
        // Test database connection
        console.log('🔗 Connecting to database...');
        const connectionSuccess = await testConnection();
        
        if (connectionSuccess) {
            // Initialize database models
            await initializeDatabase();
            logger.info('Database initialized successfully');
            
            // Start server
            app.listen(PORT, () => {
                logger.info(`Forest PDF Viewer server started`, {
                    port: PORT,
                    environment: process.env.NODE_ENV || 'development',
                    timestamp: new Date().toISOString()
                });
                console.log(`🌲 Forest PDF Viewer server running on port ${PORT}`);
                console.log(`📚 Ready to process PDFs and generate insights!`);
                console.log(`🔐 Authentication endpoints available at /api/auth/`);
                console.log(`📊 Comprehensive logging and error handling enabled`);
            });
        } else {
            logger.error('Failed to connect to database. Server startup aborted.');
            console.error('❌ Failed to connect to database. Server will not start.');
            process.exit(1);
        }
    } catch (error) {
        console.error('❌ Failed to start server:', error.message);
        process.exit(1);
    }
};

// Start the server
startServer();

module.exports = app;