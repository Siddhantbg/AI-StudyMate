// backend/routes/pdf.js
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

// Extract text from uploaded PDF
router.post('/extract-text', async (req, res) => {
    try {
        const { filename, pages } = req.body;
        
        if (!filename) {
            return res.status(400).json({ error: 'Filename is required' });
        }

        const filePath = path.join(__dirname, '..', 'uploads', filename);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'PDF file not found' });
        }

        const dataBuffer = fs.readFileSync(filePath);
        const pdfData = await pdfParse(dataBuffer);

        // If specific pages requested
        if (pages && Array.isArray(pages)) {
            // Note: pdf-parse doesn't support page-specific extraction easily
            // For production, consider using pdf2pic + OCR or other libraries
            // This is a simplified version
            res.json({
                success: true,
                text: pdfData.text,
                totalPages: pdfData.numpages,
                requestedPages: pages,
                info: pdfData.info,
                extractedAt: new Date().toISOString()
            });
        } else {
            res.json({
                success: true,
                text: pdfData.text,
                totalPages: pdfData.numpages,
                info: pdfData.info,
                extractedAt: new Date().toISOString()
            });
        }
    } catch (error) {
        console.error('PDF text extraction error:', error);
        res.status(500).json({ 
            error: 'Failed to extract text from PDF',
            details: error.message 
        });
    }
});

// Get PDF information
router.post('/info', async (req, res) => {
    try {
        const { filename } = req.body;
        
        if (!filename) {
            return res.status(400).json({ error: 'Filename is required' });
        }

        const filePath = path.join(__dirname, '..', 'uploads', filename);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'PDF file not found' });
        }

        const dataBuffer = fs.readFileSync(filePath);
        const pdfData = await pdfParse(dataBuffer);

        const fileStats = fs.statSync(filePath);

        res.json({
            success: true,
            info: {
                filename: filename,
                totalPages: pdfData.numpages,
                fileSize: fileStats.size,
                fileSizeHuman: formatFileSize(fileStats.size),
                createdAt: fileStats.birthtime,
                modifiedAt: fileStats.mtime,
                pdfInfo: pdfData.info,
                hasText: pdfData.text.length > 0,
                textLength: pdfData.text.length
            }
        });
    } catch (error) {
        console.error('PDF info error:', error);
        res.status(500).json({ 
            error: 'Failed to get PDF information',
            details: error.message 
        });
    }
});

// Extract text from specific page range
router.post('/extract-range', async (req, res) => {
    try {
        const { filename, fromPage, toPage } = req.body;
        
        if (!filename) {
            return res.status(400).json({ error: 'Filename is required' });
        }

        if (!fromPage || !toPage) {
            return res.status(400).json({ error: 'Page range (fromPage, toPage) is required' });
        }

        const filePath = path.join(__dirname, '..', 'uploads', filename);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'PDF file not found' });
        }

        const dataBuffer = fs.readFileSync(filePath);
        const pdfData = await pdfParse(dataBuffer);

        if (fromPage > pdfData.numpages || toPage > pdfData.numpages) {
            return res.status(400).json({ 
                error: 'Page range exceeds document length',
                totalPages: pdfData.numpages 
            });
        }

        // For this implementation, we'll return the full text
        // In production, you'd want to implement proper page-range extraction
        res.json({
            success: true,
            text: pdfData.text,
            fromPage: fromPage,
            toPage: toPage,
            totalPages: pdfData.numpages,
            note: 'Full document text returned. Page-specific extraction requires additional PDF processing.',
            extractedAt: new Date().toISOString()
        });
    } catch (error) {
        console.error('PDF range extraction error:', error);
        res.status(500).json({ 
            error: 'Failed to extract text from page range',
            details: error.message 
        });
    }
});

// Delete uploaded PDF
router.delete('/delete/:filename', (req, res) => {
    try {
        const { filename } = req.params;
        const filePath = path.join(__dirname, '..', 'uploads', filename);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'PDF file not found' });
        }

        fs.unlinkSync(filePath);
        
        res.json({
            success: true,
            message: 'PDF file deleted successfully',
            filename: filename,
            deletedAt: new Date().toISOString()
        });
    } catch (error) {
        console.error('PDF deletion error:', error);
        res.status(500).json({ 
            error: 'Failed to delete PDF file',
            details: error.message 
        });
    }
});

// List uploaded PDFs
router.get('/list', (req, res) => {
    try {
        const uploadsDir = path.join(__dirname, '..', 'uploads');
        
        if (!fs.existsSync(uploadsDir)) {
            return res.json({ success: true, files: [] });
        }

        const files = fs.readdirSync(uploadsDir)
            .filter(file => file.endsWith('.pdf'))
            .map(file => {
                const filePath = path.join(uploadsDir, file);
                const stats = fs.statSync(filePath);
                return {
                    filename: file,
                    size: stats.size,
                    sizeHuman: formatFileSize(stats.size),
                    createdAt: stats.birthtime,
                    modifiedAt: stats.mtime
                };
            });

        res.json({
            success: true,
            files: files,
            count: files.length
        });
    } catch (error) {
        console.error('PDF list error:', error);
        res.status(500).json({ 
            error: 'Failed to list PDF files',
            details: error.message 
        });
    }
});

// Helper function to format file size
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

module.exports = router;