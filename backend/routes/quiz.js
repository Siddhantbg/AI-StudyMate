// backend/routes/quiz.js - Enhanced error handling with database integration
const express = require('express');
const { body, validationResult } = require('express-validator');
const router = express.Router();
const geminiClient = require('../utils/geminiClient');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const { QuizResult, File } = require('../models');
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

// Generate quiz from specific pages (requires authentication)
router.post('/generate', authenticateToken, async (req, res) => {
    try {
        const { file_id, filename, pages, questionCount = 5, difficulty = 'medium' } = req.body;
        
        if (!file_id && !filename) {
            return res.status(400).json({ 
                success: false,
                error: 'File ID or filename is required',
                code: 'MISSING_FILE_IDENTIFIER'
            });
        }

        if (!pages || !Array.isArray(pages) || pages.length === 0) {
            return res.status(400).json({ 
                success: false,
                error: 'Pages array is required',
                code: 'MISSING_PAGES'
            });
        }

        // Validate question count
        const validQuestionCount = Math.min(Math.max(parseInt(questionCount) || 5, 1), 10);

        // Find file record (prefer file_id over filename)
        let fileRecord = null;
        if (file_id) {
            fileRecord = await File.findOne({
                where: {
                    id: file_id,
                    user_id: req.userId
                }
            });
        } else if (filename) {
            fileRecord = await File.findOne({
                where: {
                    filename: filename,
                    user_id: req.userId
                }
            });
        }

        if (!fileRecord) {
            return res.status(404).json({ 
                success: false,
                error: 'PDF file not found or access denied',
                code: 'FILE_NOT_FOUND'
            });
        }

        const filePath = path.join(__dirname, '..', 'uploads', fileRecord.filename);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ 
                success: false,
                error: 'PDF file not found on disk',
                code: 'FILE_NOT_ON_DISK'
            });
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

        console.log(`🎯 Generating quiz: ${validQuestionCount} questions from pages ${pagesRange}`);

        // Try to generate quiz with enhanced error handling
        let quiz;
        try {
            quiz = await geminiClient.generateQuiz(pagesText, pagesRange, validQuestionCount);
        } catch (geminiError) {
            console.error('Gemini quiz generation failed:', geminiError.message);
            
            // Return user-friendly error based on the specific issue
            if (geminiError.message.includes('overloaded')) {
                return res.status(503).json({ 
                    error: 'AI service is temporarily busy. Please try again in a moment.',
                    details: 'The AI service is experiencing high demand. Try again in 30-60 seconds.',
                    retryAfter: 30
                });
            } else if (geminiError.message.includes('Too many requests')) {
                return res.status(429).json({ 
                    error: 'Too many requests. Please wait before trying again.',
                    details: 'You\'ve made too many requests recently. Please wait a moment.',
                    retryAfter: 60
                });
            } else {
                return res.status(500).json({ 
                    error: 'Failed to generate quiz',
                    details: 'The AI service encountered an error. Please try again.',
                    fallback: 'Try reducing the number of questions or selecting fewer pages.'
                });
            }
        }
        
        res.json({
            success: true,
            quiz: quiz,
            metadata: {
                file_id: fileRecord.id,
                filename: fileRecord.filename,
                display_name: fileRecord.display_name || fileRecord.original_name,
                pages: pages,
                questionCount: validQuestionCount,
                difficulty: difficulty,
                totalPages: pdfData.numpages,
                generatedAt: new Date().toISOString(),
                model: 'gemini-1.5-flash',
                user_id: req.userId
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

        const validQuestionCount = Math.min(Math.max(parseInt(questionCount) || 5, 1), 8);

        console.log(`🎯 Generating quiz from text: ${validQuestionCount} questions`);

        let quiz;
        try {
            quiz = await geminiClient.generateQuiz(text, topic || 'Custom Text', validQuestionCount);
        } catch (geminiError) {
            console.error('Gemini quiz generation from text failed:', geminiError.message);
            
            if (geminiError.message.includes('overloaded')) {
                return res.status(503).json({ 
                    error: 'AI service is temporarily busy. Please try again in a moment.',
                    retryAfter: 30
                });
            } else {
                return res.status(500).json({ 
                    error: 'Failed to generate quiz from text',
                    details: 'Please try again with shorter text or fewer questions.'
                });
            }
        }
        
        res.json({
            success: true,
            quiz: quiz,
            metadata: {
                source: 'text_input',
                topic: topic || 'Custom Text',
                questionCount: validQuestionCount,
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

// Get quiz history (database-backed)
router.get('/history', authenticateToken, async (req, res) => {
    try {
        const { file_id, limit = 10, offset = 0 } = req.query;

        const whereConditions = {
            user_id: req.userId
        };

        if (file_id) {
            whereConditions.file_id = file_id;
        }

        const { count, rows: quizHistory } = await QuizResult.findAndCountAll({
            where: whereConditions,
            include: [{
                model: File,
                as: 'file',
                attributes: ['id', 'display_name', 'original_name']
            }],
            order: [['created_at', 'DESC']],
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

        res.json({
            success: true,
            data: {
                history: quizHistory.map(quiz => quiz.getPublicData()),
                total: count,
                limit: parseInt(limit),
                offset: parseInt(offset)
            }
        });
    } catch (error) {
        console.error('Quiz history error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to get quiz history',
            code: 'GET_QUIZ_HISTORY_ERROR'
        });
    }
});

// Save quiz results (database-backed)
router.post('/save-results', authenticateToken, [
    body('file_id').isUUID().withMessage('Valid file ID is required'),
    body('questions').isArray().withMessage('Questions array is required'),
    body('user_answers').isArray().withMessage('User answers array is required'),
    body('score').isInt({ min: 0 }).withMessage('Score must be a non-negative integer'),
    body('total_questions').isInt({ min: 1 }).withMessage('Total questions must be a positive integer'),
    body('time_taken').optional().isInt({ min: 0 }).withMessage('Time taken must be non-negative'),
    body('quiz_type').optional().isIn(['comprehension', 'multiple_choice', 'true_false', 'short_answer', 'mixed']),
    body('difficulty_level').optional().isIn(['easy', 'medium', 'hard', 'mixed'])
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors.array(),
                code: 'VALIDATION_ERROR'
            });
        }

        const {
            file_id,
            questions,
            user_answers,
            score,
            total_questions,
            time_taken = 0,
            quiz_type = 'mixed',
            difficulty_level = 'medium',
            page_range,
            quiz_settings = {}
        } = req.body;

        // Verify user owns this file
        const fileRecord = await File.findOne({
            where: {
                id: file_id,
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

        // Create quiz result
        const quizResult = await QuizResult.create({
            user_id: req.userId,
            file_id: file_id,
            quiz_type: quiz_type,
            questions: questions,
            user_answers: user_answers,
            score: score,
            total_questions: total_questions,
            time_taken: time_taken,
            difficulty_level: difficulty_level,
            page_range: page_range,
            quiz_settings: quiz_settings
        });

        res.json({
            success: true,
            message: 'Quiz results saved successfully',
            data: quizResult.getPublicData()
        });
    } catch (error) {
        console.error('Quiz results save error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to save quiz results',
            code: 'SAVE_QUIZ_RESULTS_ERROR'
        });
    }
});

// Get quiz statistics (database-backed)
router.get('/stats', authenticateToken, async (req, res) => {
    try {
        const { file_id, start_date, end_date } = req.query;

        const whereConditions = {
            user_id: req.userId,
            is_completed: true
        };

        if (file_id) {
            whereConditions.file_id = file_id;
        }

        if (start_date) {
            whereConditions.created_at = {
                ...whereConditions.created_at,
                [require('sequelize').Op.gte]: new Date(start_date)
            };
        }

        if (end_date) {
            whereConditions.created_at = {
                ...whereConditions.created_at,
                [require('sequelize').Op.lte]: new Date(end_date)
            };
        }

        const quizResults = await QuizResult.findAll({
            where: whereConditions,
            include: [{
                model: File,
                as: 'file',
                attributes: ['id', 'display_name', 'original_name']
            }],
            order: [['created_at', 'DESC']]
        });

        if (quizResults.length === 0) {
            return res.json({
                success: true,
                data: {
                    stats: {
                        total_quizzes: 0,
                        average_score: 0,
                        best_score: 0,
                        recent_activity: [],
                        improvement_trend: 'neutral',
                        total_time_spent: 0,
                        completion_rate: 0
                    }
                }
            });
        }

        const totalQuizzes = quizResults.length;
        const scores = quizResults.map(q => parseFloat(q.percentage_score));
        const averageScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
        const bestScore = Math.max(...scores);
        const totalTimeSpent = quizResults.reduce((sum, q) => sum + q.time_taken, 0);
        const recentActivity = quizResults.slice(0, 5).map(q => q.getPublicData());

        // Calculate improvement trend
        const improvementTrend = calculateTrend(scores);

        // Calculate completion rate
        const allQuizzes = await QuizResult.count({
            where: { user_id: req.userId }
        });
        const completionRate = allQuizzes > 0 ? (totalQuizzes / allQuizzes * 100).toFixed(2) : 100;

        res.json({
            success: true,
            data: {
                stats: {
                    total_quizzes: totalQuizzes,
                    average_score: averageScore,
                    best_score: bestScore,
                    recent_activity: recentActivity,
                    improvement_trend: improvementTrend,
                    total_time_spent: totalTimeSpent,
                    completion_rate: parseFloat(completionRate),
                    period: {
                        start_date: start_date,
                        end_date: end_date
                    }
                }
            }
        });
    } catch (error) {
        console.error('Quiz stats error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to get quiz statistics',
            code: 'GET_QUIZ_STATS_ERROR'
        });
    }
});

// Get detailed quiz results
router.get('/results/:quizId', authenticateToken, async (req, res) => {
    try {
        const { quizId } = req.params;

        const quizResult = await QuizResult.findOne({
            where: {
                id: quizId,
                user_id: req.userId
            },
            include: [{
                model: File,
                as: 'file',
                attributes: ['id', 'display_name', 'original_name']
            }]
        });

        if (!quizResult) {
            return res.status(404).json({
                success: false,
                error: 'Quiz result not found or access denied',
                code: 'QUIZ_RESULT_NOT_FOUND'
            });
        }

        res.json({
            success: true,
            data: quizResult.getDetailedResults()
        });
    } catch (error) {
        console.error('Get quiz result error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get quiz result',
            code: 'GET_QUIZ_RESULT_ERROR'
        });
    }
});

// Update quiz feedback (AI-generated or manual)
router.put('/results/:quizId/feedback', authenticateToken, [
    body('feedback').optional().isString().withMessage('Feedback must be a string'),
    body('areas_for_improvement').optional().isArray().withMessage('Areas for improvement must be an array'),
    body('strengths').optional().isArray().withMessage('Strengths must be an array')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors.array(),
                code: 'VALIDATION_ERROR'
            });
        }

        const { quizId } = req.params;
        const { feedback, areas_for_improvement, strengths } = req.body;

        const quizResult = await QuizResult.findOne({
            where: {
                id: quizId,
                user_id: req.userId
            }
        });

        if (!quizResult) {
            return res.status(404).json({
                success: false,
                error: 'Quiz result not found or access denied',
                code: 'QUIZ_RESULT_NOT_FOUND'
            });
        }

        await quizResult.updateFeedback(
            feedback,
            areas_for_improvement || [],
            strengths || []
        );

        res.json({
            success: true,
            message: 'Quiz feedback updated successfully',
            data: quizResult.getPublicData()
        });
    } catch (error) {
        console.error('Update quiz feedback error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update quiz feedback',
            code: 'UPDATE_QUIZ_FEEDBACK_ERROR'
        });
    }
});

// Delete quiz result
router.delete('/results/:quizId', authenticateToken, async (req, res) => {
    try {
        const { quizId } = req.params;

        const quizResult = await QuizResult.findOne({
            where: {
                id: quizId,
                user_id: req.userId
            }
        });

        if (!quizResult) {
            return res.status(404).json({
                success: false,
                error: 'Quiz result not found or access denied',
                code: 'QUIZ_RESULT_NOT_FOUND'
            });
        }

        await quizResult.destroy();

        res.json({
            success: true,
            message: 'Quiz result deleted successfully'
        });
    } catch (error) {
        console.error('Delete quiz result error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete quiz result',
            code: 'DELETE_QUIZ_RESULT_ERROR'
        });
    }
});

// Health check for quiz service
router.get('/health', async (req, res) => {
    try {
        const isHealthy = await geminiClient.checkServiceHealth();
        
        res.json({
            success: true,
            status: isHealthy ? 'healthy' : 'degraded',
            timestamp: new Date().toISOString(),
            service: 'Quiz Generation',
            ai_model: 'gemini-1.5-flash'
        });
    } catch (error) {
        console.error('Quiz health check error:', error);
        res.status(500).json({ 
            success: false,
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString()
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