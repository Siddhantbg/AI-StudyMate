// backend/routes/quiz.js
const express = require('express');
const router = express.Router();
const geminiClient = require('../utils/geminiClient');
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

// Generate quiz from specific pages
router.post('/generate', async (req, res) => {
    try {
        const { filename, pages, questionCount = 5, difficulty = 'medium' } = req.body;
        
        if (!filename) {
            return res.status(400).json({ error: 'PDF filename is required' });
        }

        if (!pages || !Array.isArray(pages) || pages.length === 0) {
            return res.status(400).json({ error: 'Pages array is required' });
        }

        const filePath = path.join(__dirname, '..', 'uploads', filename);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'PDF file not found' });
        }

        // Extract text from PDF
        const dataBuffer = fs.readFileSync(filePath);
        const pdfData = await pdfParse(dataBuffer);

        if (Math.max(...pages) > pdfData.numpages) {
            return res.status(400).json({ 
                error: 'Requested pages exceed document length',
                totalPages: pdfData.numpages 
            });
        }

        // For this implementation, use full text (in production, extract specific pages)
        const pagesText = pdfData.text;
        const pagesRange = `${Math.min(...pages)}-${Math.max(...pages)}`;

        const quiz = await geminiClient.generateQuiz(pagesText, pagesRange, questionCount);
        
        res.json({
            success: true,
            quiz: quiz,
            metadata: {
                filename: filename,
                pages: pages,
                questionCount: questionCount,
                difficulty: difficulty,
                totalPages: pdfData.numpages,
                generatedAt: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('Quiz generation error:', error);
        res.status(500).json({ 
            error: 'Failed to generate quiz',
            details: error.message 
        });
    }
});

// Generate quiz from text input
router.post('/generate-from-text', async (req, res) => {
    try {
        const { text, topic, questionCount = 5, difficulty = 'medium' } = req.body;
        
        if (!text) {
            return res.status(400).json({ error: 'Text content is required' });
        }

        const quiz = await geminiClient.generateQuiz(text, topic || 'Custom Text', questionCount);
        
        res.json({
            success: true,
            quiz: quiz,
            metadata: {
                source: 'text_input',
                topic: topic || 'Custom Text',
                questionCount: questionCount,
                difficulty: difficulty,
                textLength: text.length,
                generatedAt: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('Quiz from text generation error:', error);
        res.status(500).json({ 
            error: 'Failed to generate quiz from text',
            details: error.message 
        });
    }
});

// Get quiz history (stored in memory for this implementation)
let quizHistory = [];

router.get('/history', (req, res) => {
    try {
        res.json({
            success: true,
            history: quizHistory.slice(-10), // Last 10 quizzes
            total: quizHistory.length
        });
    } catch (error) {
        console.error('Quiz history error:', error);
        res.status(500).json({ 
            error: 'Failed to get quiz history',
            details: error.message 
        });
    }
});

// Save quiz results
router.post('/save-results', (req, res) => {
    try {
        const { quizId, answers, score, totalQuestions, timeTaken } = req.body;
        
        const results = {
            id: quizId || Date.now().toString(),
            answers: answers,
            score: score,
            totalQuestions: totalQuestions,
            percentage: Math.round((score / totalQuestions) * 100),
            timeTaken: timeTaken,
            completedAt: new Date().toISOString()
        };

        // Store in memory (in production, use a database)
        quizHistory.push(results);
        
        res.json({
            success: true,
            results: results,
            message: 'Quiz results saved successfully'
        });
    } catch (error) {
        console.error('Quiz results save error:', error);
        res.status(500).json({ 
            error: 'Failed to save quiz results',
            details: error.message 
        });
    }
});

// Get quiz statistics
router.get('/stats', (req, res) => {
    try {
        if (quizHistory.length === 0) {
            return res.json({
                success: true,
                stats: {
                    totalQuizzes: 0,
                    averageScore: 0,
                    bestScore: 0,
                    recentActivity: []
                }
            });
        }

        const totalQuizzes = quizHistory.length;
        const scores = quizHistory.map(q => q.percentage);
        const averageScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
        const bestScore = Math.max(...scores);
        const recentActivity = quizHistory.slice(-5).reverse();

        res.json({
            success: true,
            stats: {
                totalQuizzes: totalQuizzes,
                averageScore: averageScore,
                bestScore: bestScore,
                recentActivity: recentActivity,
                improvementTrend: calculateTrend(scores)
            }
        });
    } catch (error) {
        console.error('Quiz stats error:', error);
        res.status(500).json({ 
            error: 'Failed to get quiz statistics',
            details: error.message 
        });
    }
});

// Helper function to calculate improvement trend
function calculateTrend(scores) {
    if (scores.length < 2) return 'neutral';
    
    const recent = scores.slice(-3);
    const earlier = scores.slice(-6, -3);
    
    if (recent.length === 0 || earlier.length === 0) return 'neutral';
    
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const earlierAvg = earlier.reduce((a, b) => a + b, 0) / earlier.length;
    
    if (recentAvg > earlierAvg + 5) return 'improving';
    if (recentAvg < earlierAvg - 5) return 'declining';
    return 'stable';
}

module.exports = router;