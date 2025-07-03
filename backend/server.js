// backend/server.js
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

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

// PDF Upload endpoint
app.post('/api/upload', upload.single('pdf'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No PDF file uploaded' });
        }

        const fileInfo = {
            filename: req.file.filename,
            originalName: req.file.originalname,
            size: req.file.size,
            path: req.file.path,
            uploadTime: new Date().toISOString()
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

// Serve uploaded PDF files
app.get('/api/files/:filename', (req, res) => {
    try {
        const filename = req.params.filename;
        const filePath = path.join(__dirname, 'uploads', filename);
        
        // Check if file exists
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'File not found' });
        }
        
        // Set proper headers for PDF
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
        
        // Stream the file
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);
        
    } catch (error) {
        console.error('File serving error:', error);
        res.status(500).json({ error: 'Failed to serve file' });
    }
});

// List uploaded files endpoint
app.get('/api/files', (req, res) => {
    try {
        const uploadsDir = path.join(__dirname, 'uploads');
        
        // Check if uploads directory exists
        if (!fs.existsSync(uploadsDir)) {
            return res.json({ files: [] });
        }
        
        // Read all files in uploads directory
        const files = fs.readdirSync(uploadsDir);
        
        // Filter for PDF files and get file stats
        const pdfFiles = files
            .filter(file => file.toLowerCase().endsWith('.pdf'))
            .map(filename => {
                const filePath = path.join(uploadsDir, filename);
                const stats = fs.statSync(filePath);
                
                // Extract original filename if it follows the pattern: fieldname-timestamp-random.pdf
                let originalName = filename;
                if (filename.startsWith('pdf-') && filename.includes('-')) {
                    // Try to extract original name from upload pattern
                    originalName = filename; // Keep as is, or you could implement original name extraction
                }
                
                return {
                    id: filename, // Use filename as ID for server files
                    fileName: originalName,
                    uploadedFileName: filename,
                    fileSize: stats.size,
                    fileType: 'application/pdf',
                    uploadDate: stats.mtime.toISOString(),
                    source: 'server' // Mark as server-stored file
                };
            })
            .sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate)); // Sort by newest first
        
        res.json({ 
            success: true, 
            files: pdfFiles,
            count: pdfFiles.length 
        });
        
    } catch (error) {
        console.error('Error listing files:', error);
        res.status(500).json({ error: 'Failed to list uploaded files' });
    }
});

// Rename uploaded file endpoint
app.post('/api/files/rename', (req, res) => {
    try {
        const { oldName, newName } = req.body;
        
        if (!oldName || !newName) {
            return res.status(400).json({ 
                success: false, 
                error: 'Both oldName and newName are required' 
            });
        }

        // Validate new name
        if (!newName.toLowerCase().endsWith('.pdf')) {
            return res.status(400).json({ 
                success: false, 
                error: 'New name must end with .pdf extension' 
            });
        }

        // Check for invalid characters
        const invalidChars = /[<>:"/\\|?*]/;
        if (invalidChars.test(newName)) {
            return res.status(400).json({ 
                success: false, 
                error: 'File name contains invalid characters' 
            });
        }

        const uploadsDir = path.join(__dirname, 'uploads');
        const oldPath = path.join(uploadsDir, oldName);
        const newPath = path.join(uploadsDir, newName);
        
        // Check if old file exists
        if (!fs.existsSync(oldPath)) {
            return res.status(404).json({ 
                success: false, 
                error: 'Original file not found' 
            });
        }
        
        // Check if new name already exists
        if (fs.existsSync(newPath)) {
            return res.status(409).json({ 
                success: false, 
                error: 'A file with that name already exists' 
            });
        }
        
        // Rename the file
        fs.renameSync(oldPath, newPath);
        
        res.json({
            success: true,
            message: 'File renamed successfully',
            oldName: oldName,
            newName: newName
        });
        
    } catch (error) {
        console.error('Rename error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to rename file: ' + error.message 
        });
    }
});

// Gemini API routes
const geminiRoutes = require('./routes/gemini');
app.use('/api/gemini', geminiRoutes);

// PDF processing routes
const pdfRoutes = require('./routes/pdf');
app.use('/api/pdf', pdfRoutes);

// Quiz generation routes
const quizRoutes = require('./routes/quiz');
app.use('/api/quiz', quizRoutes);

// Error handling middleware
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'File too large. Maximum size is 100MB.' });
        }
    }
    
    console.error('Server error:', error);
    res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

app.listen(PORT, () => {
    console.log(`🌲 Forest PDF Viewer server running on port ${PORT}`);
    console.log(`📚 Ready to process PDFs and generate insights!`);
});

module.exports = app;