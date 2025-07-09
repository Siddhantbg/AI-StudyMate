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

// File routes
const { authenticateToken } = require('./middleware/auth');

// Configure multer for PDF uploads
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

// PDF Upload endpoint (requires authentication)
app.post('/api/upload', authenticateToken, upload.single('pdf'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ 
                success: false,
                error: 'No PDF file uploaded',
                code: 'NO_FILE'
            });
        }

        const File = require('./models/mongodb/File');
        
        // Create file record in database
        const fileRecord = new File({
            user_id: req.userId,
            filename: req.file.filename,
            original_name: req.file.originalname,
            file_size: req.file.size,
            file_path: req.file.path,
            upload_source: 'server',
            processing_status: 'pending'
        });
        await fileRecord.save();

        const fileInfo = {
            id: fileRecord._id,
            filename: req.file.filename,
            originalName: req.file.originalname,
            size: req.file.size,
            path: req.file.path,
            uploadTime: fileRecord.created_at
        };

        res.json({
            success: true,
            message: 'File uploaded successfully',
            data: fileInfo
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({
            success: false,
            error: 'Upload failed',
            code: 'UPLOAD_ERROR'
        });
    }
});

// List uploaded files endpoint (user-specific)
app.get('/api/files', authenticateToken, async (req, res) => {
    try {
        const mongoose = require('mongoose');
        const File = require('./models/mongodb/File');
        
        // Get files from database for the authenticated user
        const userFiles = await File.find({
            user_id: req.userId,
            is_archived: false
        }).sort({ created_at: -1 }); // Sort by newest first
        
        const formattedFiles = userFiles.map(file => ({
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

// Serve uploaded PDF files (requires authentication)
app.get('/api/files/:filename', authenticateToken, async (req, res) => {
    try {
        const { filename } = req.params;
        const File = require('./models/mongodb/File');
        
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
        // Initialize database connection
        const mongoose = require('mongoose');
        
        if (mongoose.connection.readyState === 0) {
            console.log('🔗 Connecting to MongoDB...');
            await mongoose.connect(process.env.MONGODB_URI);
            console.log('✅ Connected to MongoDB successfully');
        }
        
        // Start server
        app.listen(PORT, () => {
            console.log(`🌲 Forest PDF Viewer server running on port ${PORT}`);
            console.log(`🔐 Authentication endpoints available at /api/auth/`);
            console.log(`📚 Ready to process PDFs and generate insights!`);
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error.message);
        process.exit(1);
    }
};

// Start the server
startServer();

module.exports = app;