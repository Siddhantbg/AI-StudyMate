// backend/routes/gemini.js
const express = require('express');
const router = express.Router();
const geminiClient = require('../utils/geminiClient');

// Summarize current page
router.post('/summarize-page', async (req, res) => {
    try {
        const { text, pageNumber } = req.body;
        
        if (!text) {
            return res.status(400).json({ error: 'Text content is required' });
        }

        const summary = await geminiClient.summarizePage(text, pageNumber);
        
        res.json({
            success: true,
            summary: summary,
            pageNumber: pageNumber,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Page summarization error:', error);
        res.status(500).json({ 
            error: 'Failed to summarize page',
            details: error.message 
        });
    }
});

// Summarize page range
router.post('/summarize-range', async (req, res) => {
    try {
        const { texts, fromPage, toPage } = req.body;
        
        if (!texts || !Array.isArray(texts) || texts.length === 0) {
            return res.status(400).json({ error: 'Text array is required' });
        }

        if (!fromPage || !toPage) {
            return res.status(400).json({ error: 'Page range (fromPage, toPage) is required' });
        }

        const summary = await geminiClient.summarizePageRange(texts, fromPage, toPage);
        
        res.json({
            success: true,
            summary: summary,
            pageRange: { from: fromPage, to: toPage },
            pagesCount: texts.length,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Page range summarization error:', error);
        res.status(500).json({ 
            error: 'Failed to summarize page range',
            details: error.message 
        });
    }
});

// Explain text
router.post('/explain', async (req, res) => {
    try {
        const { text, context } = req.body;
        
        if (!text) {
            return res.status(400).json({ error: 'Text to explain is required' });
        }

        const explanation = await geminiClient.explainText(text, context);
        
        res.json({
            success: true,
            explanation: explanation,
            originalText: text,
            hasContext: !!context,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Text explanation error:', error);
        res.status(500).json({ 
            error: 'Failed to explain text',
            details: error.message 
        });
    }
});

// Generate study tips
router.post('/study-tips', async (req, res) => {
    try {
        const { text, subject } = req.body;
        
        if (!text) {
            return res.status(400).json({ error: 'Text content is required' });
        }

        const studyTips = await geminiClient.generateStudyTips(text, subject);
        
        res.json({
            success: true,
            studyTips: studyTips,
            subject: subject || 'General',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Study tips generation error:', error);
        res.status(500).json({ 
            error: 'Failed to generate study tips',
            details: error.message 
        });
    }
});

// Health check for Gemini API
router.get('/health', async (req, res) => {
    try {
        // Simple test to check if Gemini API is working
        const testResponse = await geminiClient.explainText('Hello world', '');
        
        res.json({
            success: true,
            status: 'Gemini API is healthy',
            timestamp: new Date().toISOString(),
            testResponse: testResponse ? 'API responding' : 'API not responding'
        });
    } catch (error) {
        console.error('Gemini health check error:', error);
        res.status(500).json({ 
            success: false,
            status: 'Gemini API is not healthy',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

module.exports = router;