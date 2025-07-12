// backend/server-fixed.js
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
    origin: ['https://ai-study-mate-seven.vercel.app', 'http://localhost:5173'],
    credentials: true
}));

// Import middleware
const { httpLogger, logger } = require('./middleware/logging');
const { errorHandler, notFoundHandler, multerErrorHandler } = require('./middleware/errorHandler');

app.use(httpLogger);
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Routes
app.get('/', (req, res) => {
    res.json({ message: 'Forest PDF Viewer API is running! 🌲' });
});

// Health check routes (public)
const healthRoutes = require('./routes/health');
app.use('/api/health', healthRoutes);

// Authentication routes (critical)
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

// Annotation routes
const annotationRoutes = require('./routes/annotations');
app.use('/api/annotations', annotationRoutes);

// File routes
const { authenticateToken } = require('./middleware/auth');

// Import models once at the top
const File = require('./models/mongodb/File');

// Configure multer for PDF uploads (using memory storage for MongoDB)
const upload = multer({
    storage: multer.memoryStorage(), // Store files in memory for MongoDB
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

// PDF Upload endpoint (requires authentication)
app.post('/api/upload', authenticateToken, upload.single('pdf'), async (req, res) => {
    console.log('📤 Upload request received');
    console.log('👤 User ID:', req.userId);
    console.log('📁 File info:', req.file ? {
        filename: req.file.filename,
        originalname: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype
    } : 'No file');

    try {
        if (!req.file) {
            console.log('❌ No file in request');
            return res.status(400).json({ 
                success: false,
                error: 'No PDF file uploaded',
                code: 'NO_FILE'
            });
        }

        console.log('💾 Creating file record and storing in MongoDB...');
        
        // Generate a unique filename for identification
        const uniqueFilename = `pdf-${Date.now()}-${Math.round(Math.random() * 1E9)}.pdf`;
        
        // Log file size for large file tracking
        const fileSizeMB = (req.file.size / 1024 / 1024).toFixed(2);
        console.log(`📊 File size: ${fileSizeMB} MB`);
        
        if (req.file.size > 10 * 1024 * 1024) { // Files over 10MB
            console.log('⚠️  Large file detected - this may take longer to process...');
        }
        
        // Create file record with binary data stored in MongoDB
        const fileRecord = new File({
            user_id: req.userId,
            filename: uniqueFilename,
            original_name: req.file.originalname,
            file_size: req.file.size,
            file_data: req.file.buffer, // Store binary data in MongoDB
            storage_type: 'mongodb',
            upload_source: 'server',
            processing_status: 'pending'
        });
        
        // Add timeout to database save operation (dynamic based on file size)
        const timeoutMs = Math.max(30000, req.file.size / 1024 / 1024 * 5000); // 5 seconds per MB, minimum 30 seconds
        console.log(`⏱️  Database save timeout set to ${Math.round(timeoutMs / 1000)} seconds`);
        
        const savePromise = fileRecord.save();
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Database save timeout')), timeoutMs);
        });
        
        await Promise.race([savePromise, timeoutPromise]);
        console.log('✅ File record and binary data saved to MongoDB');

        const fileInfo = {
            id: fileRecord._id,
            filename: uniqueFilename,
            originalName: req.file.originalname,
            size: req.file.size,
            storageType: 'mongodb',
            uploadTime: fileRecord.created_at
        };

        console.log('📤 Sending success response');
        res.json({
            success: true,
            message: 'File uploaded successfully',
            file: fileInfo
        });
    } catch (error) {
        console.error('❌ Upload error:', error.message);
        console.error('Stack:', error.stack);
        
        // Provide specific error messages for common issues
        let errorMessage = 'Upload failed';
        let errorCode = 'UPLOAD_ERROR';
        
        if (error.message.includes('timeout')) {
            errorMessage = 'File upload timed out - file may be too large';
            errorCode = 'UPLOAD_TIMEOUT';
        } else if (error.message.includes('Document too large')) {
            errorMessage = 'File is too large for database storage';
            errorCode = 'FILE_TOO_LARGE';
        } else if (error.message.includes('Authentication failed')) {
            errorMessage = 'Authentication failed - please log in again';
            errorCode = 'AUTH_ERROR';
        } else if (error.message.includes('E11000')) {
            errorMessage = 'File with this name already exists';
            errorCode = 'DUPLICATE_FILE';
        } else {
            errorMessage = error.message || 'Upload failed';
        }
        
        // Ensure we always send a response
        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                error: errorMessage,
                code: errorCode
            });
        }
    }
});

// List uploaded files endpoint (user-specific)
app.get('/api/files', authenticateToken, async (req, res) => {
    try {
        const mongoose = require('mongoose');
        
        // Get files from database for the authenticated user
        const userFiles = await File.find({
            user_id: req.userId,
            is_archived: false
        }).sort({ created_at: -1 }); // Sort by newest first
        
        // Filter out files that don't exist to prevent infinite loading
        const validFiles = [];
        const orphanedFiles = [];
        
        for (const file of userFiles) {
            // Check if file is valid based on storage type
            if (file.storage_type === 'mongodb') {
                // For MongoDB storage, check if file data exists
                if (file.hasFileData()) {
                    validFiles.push(file);
                } else {
                    orphanedFiles.push(file);
                    console.warn(`⚠️  Orphaned MongoDB file record: ${file.filename} (${file.original_name}) - no binary data`);
                }
            } else {
                // For filesystem storage, check if file exists on disk
                const filePath = path.join(__dirname, file.file_path);
                if (fs.existsSync(filePath)) {
                    validFiles.push(file);
                } else {
                    orphanedFiles.push(file);
                    console.warn(`⚠️  Orphaned filesystem file record: ${file.filename} (${file.original_name}) - file missing on disk`);
                }
            }
        }
        
        // Log orphaned files for cleanup
        if (orphanedFiles.length > 0) {
            console.log(`🧹 Found ${orphanedFiles.length} orphaned file records for user ${req.userId}`);
        }
        
        const formattedFiles = validFiles.map(file => ({
            id: file._id,
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
            readingStats: file.getReadingStats()
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

// Alternative endpoint for file listing (for compatibility with frontend)
app.get('/api/files/list', authenticateToken, async (req, res) => {
    try {
        const mongoose = require('mongoose');
        
        // Get files from database for the authenticated user
        const userFiles = await File.find({
            user_id: req.userId,
            is_archived: false
        }).sort({ created_at: -1 }); // Sort by newest first
        
        // Filter out files that don't exist to prevent infinite loading
        const validFiles = [];
        const orphanedFiles = [];
        
        for (const file of userFiles) {
            // Check if file is valid based on storage type
            if (file.storage_type === 'mongodb') {
                // For MongoDB storage, check if file data exists
                if (file.hasFileData()) {
                    validFiles.push(file);
                } else {
                    orphanedFiles.push(file);
                    console.warn(`⚠️  Orphaned MongoDB file record: ${file.filename} (${file.original_name}) - no binary data`);
                }
            } else {
                // For filesystem storage, check if file exists on disk
                const filePath = path.join(__dirname, file.file_path);
                if (fs.existsSync(filePath)) {
                    validFiles.push(file);
                } else {
                    orphanedFiles.push(file);
                    console.warn(`⚠️  Orphaned filesystem file record: ${file.filename} (${file.original_name}) - file missing on disk`);
                }
            }
        }
        
        // Log orphaned files for cleanup
        if (orphanedFiles.length > 0) {
            console.log(`🧹 Found ${orphanedFiles.length} orphaned file records for user ${req.userId}`);
        }
        
        const formattedFiles = validFiles.map(file => ({
            id: file._id,
            fileName: file.display_name || file.original_name,
            originalName: file.original_name,
            filename: file.filename, // Frontend expects 'filename' property
            fileSize: file.file_size,
            fileType: file.mime_type,
            uploadDate: file.created_at,
            source: 'database',
            numPages: file.num_pages,
            lastReadPage: file.last_read_page,
            totalReadTime: file.total_read_time,
            tags: file.tags,
            isFavorite: file.is_favorite,
            processingStatus: file.processing_status,
            readingStats: file.getReadingStats()
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

// Serve uploaded PDF files (requires authentication)
app.get('/api/files/:filename', authenticateToken, async (req, res) => {
    try {
        const { filename } = req.params;
        
        // Find the file record for this user
        const fileRecord = await File.findOne({
            filename: filename,
            user_id: req.userId
        });
        
        if (!fileRecord) {
            return res.status(404).json({ 
                success: false, 
                error: 'File not found or access denied',
                code: 'FILE_NOT_FOUND'
            });
        }
        
        // Handle both MongoDB and filesystem storage
        if (fileRecord.storage_type === 'mongodb') {
            // Serve file from MongoDB
            if (!fileRecord.hasFileData()) {
                return res.status(404).json({ 
                    success: false, 
                    error: 'File data not found in database',
                    code: 'FILE_DATA_NOT_FOUND'
                });
            }
            
            // Set appropriate headers
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `inline; filename="${fileRecord.original_name}"`);
            res.setHeader('Content-Length', fileRecord.file_data.length);
            
            // Send binary data directly
            res.send(fileRecord.file_data);
            
        } else {
            // Legacy: serve file from filesystem
            const filePath = path.join(__dirname, fileRecord.file_path);
            
            // Check if file exists on disk
            if (!fs.existsSync(filePath)) {
                return res.status(404).json({ 
                    success: false, 
                    error: 'File not found on disk',
                    code: 'FILE_NOT_FOUND_ON_DISK'
                });
            }
            
            // Set appropriate headers
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `inline; filename="${fileRecord.original_name}"`);
            
            // Stream the file
            const fileStream = fs.createReadStream(filePath);
            fileStream.pipe(res);
        }
        
    } catch (error) {
        console.error('File serve error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to serve file',
            code: 'FILE_SERVE_ERROR'
        });
    }
});

// Error handling middleware
app.use(multerErrorHandler);
app.use(errorHandler);
app.use(notFoundHandler);

// Initialize database and start server
const startServer = async () => {
    try {
        // Initialize database connection using proper config
        const { connectToMongoDB } = require('./config/mongodb');
        
        await connectToMongoDB();
        
        // Start server
        app.listen(PORT, () => {
            console.log(`🌲 Forest PDF Viewer server running on port ${PORT}`);
            console.log(`🔐 Authentication endpoints available at /api/auth/`);
            console.log(`📚 Ready to process PDFs and generate insights!`);
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error.message);
        
        // Provide helpful error messages
        if (error.message.includes('ECONNREFUSED')) {
            console.error('💡 MongoDB connection failed - check your database configuration');
            console.error('💡 Make sure MongoDB Atlas cluster is running and accessible');
        }
        
        process.exit(1);
    }
};

// Start the server
startServer();

module.exports = app;