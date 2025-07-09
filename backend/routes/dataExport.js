const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { User, File, Annotation, QuizResult, PageTracking } = require('../models');
const router = express.Router();

// Apply authentication to all export routes
router.use(authenticateToken);

/**
 * @route   GET /api/data-export/profile
 * @desc    Export user profile data
 * @access  Private
 */
router.get('/profile', async (req, res) => {
  try {
    const user = await User.findByPk(req.userId, {
      attributes: { exclude: ['password'] }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    const exportData = {
      export_info: {
        type: 'user_profile',
        exported_at: new Date().toISOString(),
        user_id: req.userId,
        format: 'json'
      },
      user_profile: user.getPublicProfile()
    };

    res.json({
      success: true,
      data: exportData
    });

  } catch (error) {
    console.error('Export profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export profile data',
      code: 'EXPORT_PROFILE_ERROR'
    });
  }
});

/**
 * @route   GET /api/data-export/files
 * @desc    Export user's file metadata
 * @access  Private
 */
router.get('/files', async (req, res) => {
  try {
    const files = await File.findAll({
      where: {
        user_id: req.userId
      },
      order: [['created_at', 'DESC']]
    });

    const exportData = {
      export_info: {
        type: 'file_metadata',
        exported_at: new Date().toISOString(),
        user_id: req.userId,
        format: 'json',
        total_files: files.length
      },
      files: files.map(file => file.getPublicData())
    };

    res.json({
      success: true,
      data: exportData
    });

  } catch (error) {
    console.error('Export files error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export file data',
      code: 'EXPORT_FILES_ERROR'
    });
  }
});

/**
 * @route   GET /api/data-export/annotations
 * @desc    Export user's annotations
 * @access  Private
 */
router.get('/annotations', async (req, res) => {
  try {
    const { file_id } = req.query;

    const whereConditions = {
      user_id: req.userId,
      is_deleted: false
    };

    if (file_id) {
      whereConditions.file_id = file_id;
    }

    const annotations = await Annotation.findAll({
      where: whereConditions,
      include: [{
        model: File,
        as: 'file',
        attributes: ['id', 'display_name', 'original_name']
      }],
      order: [['created_at', 'DESC']]
    });

    const exportData = {
      export_info: {
        type: 'annotations',
        exported_at: new Date().toISOString(),
        user_id: req.userId,
        format: 'json',
        total_annotations: annotations.length,
        file_filter: file_id || 'all_files'
      },
      annotations: annotations.map(annotation => ({
        ...annotation.getPublicData(),
        file: annotation.file
      }))
    };

    res.json({
      success: true,
      data: exportData
    });

  } catch (error) {
    console.error('Export annotations error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export annotations',
      code: 'EXPORT_ANNOTATIONS_ERROR'
    });
  }
});

/**
 * @route   GET /api/data-export/quiz-results
 * @desc    Export user's quiz results
 * @access  Private
 */
router.get('/quiz-results', async (req, res) => {
  try {
    const { file_id, include_detailed = false } = req.query;

    const whereConditions = {
      user_id: req.userId
    };

    if (file_id) {
      whereConditions.file_id = file_id;
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

    const exportData = {
      export_info: {
        type: 'quiz_results',
        exported_at: new Date().toISOString(),
        user_id: req.userId,
        format: 'json',
        total_quizzes: quizResults.length,
        include_detailed: include_detailed === 'true',
        file_filter: file_id || 'all_files'
      },
      quiz_results: quizResults.map(quiz => {
        const baseData = {
          ...quiz.getPublicData(),
          file: quiz.file
        };
        
        if (include_detailed === 'true') {
          return quiz.getDetailedResults();
        }
        
        return baseData;
      })
    };

    res.json({
      success: true,
      data: exportData
    });

  } catch (error) {
    console.error('Export quiz results error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export quiz results',
      code: 'EXPORT_QUIZ_RESULTS_ERROR'
    });
  }
});

/**
 * @route   GET /api/data-export/reading-analytics
 * @desc    Export user's reading analytics and page tracking
 * @access  Private
 */
router.get('/reading-analytics', async (req, res) => {
  try {
    const { file_id, start_date, end_date } = req.query;

    const whereConditions = {
      user_id: req.userId
    };

    if (file_id) {
      whereConditions.file_id = file_id;
    }

    if (start_date) {
      whereConditions.last_visit = {
        ...whereConditions.last_visit,
        $gte: new Date(start_date)
      };
    }

    if (end_date) {
      whereConditions.last_visit = {
        ...whereConditions.last_visit,
        $lte: new Date(end_date)
      };
    }

    const pageTracking = await PageTracking.findAll({
      where: whereConditions,
      include: [{
        model: File,
        as: 'file',
        attributes: ['id', 'display_name', 'original_name']
      }],
      order: [['last_visit', 'DESC']]
    });

    // Calculate summary statistics
    const totalTimeSpent = pageTracking.reduce((sum, page) => sum + page.time_spent, 0);
    const totalPages = pageTracking.length;
    const uniqueFiles = [...new Set(pageTracking.map(page => page.file_id))].length;
    const bookmarkedPages = pageTracking.filter(page => page.bookmarked).length;

    const exportData = {
      export_info: {
        type: 'reading_analytics',
        exported_at: new Date().toISOString(),
        user_id: req.userId,
        format: 'json',
        period: {
          start_date: start_date,
          end_date: end_date
        },
        file_filter: file_id || 'all_files'
      },
      summary: {
        total_time_spent: totalTimeSpent,
        total_pages_read: totalPages,
        unique_files_accessed: uniqueFiles,
        bookmarked_pages: bookmarkedPages,
        average_time_per_page: totalPages > 0 ? Math.round(totalTimeSpent / totalPages) : 0
      },
      page_tracking: pageTracking.map(page => ({
        ...page.getPublicData(),
        file: page.file
      }))
    };

    res.json({
      success: true,
      data: exportData
    });

  } catch (error) {
    console.error('Export reading analytics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export reading analytics',
      code: 'EXPORT_READING_ANALYTICS_ERROR'
    });
  }
});

/**
 * @route   GET /api/data-export/complete
 * @desc    Export all user data in a comprehensive format
 * @access  Private
 */
router.get('/complete', async (req, res) => {
  try {
    const { include_file_content = false } = req.query;

    // Get all user data
    const [user, files, annotations, quizResults, pageTracking] = await Promise.all([
      User.findByPk(req.userId, {
        attributes: { exclude: ['password'] }
      }),
      File.findAll({
        where: { user_id: req.userId },
        order: [['created_at', 'DESC']]
      }),
      Annotation.findAll({
        where: { user_id: req.userId, is_deleted: false },
        include: [{ model: File, as: 'file', attributes: ['id', 'display_name', 'original_name'] }],
        order: [['created_at', 'DESC']]
      }),
      QuizResult.findAll({
        where: { user_id: req.userId },
        include: [{ model: File, as: 'file', attributes: ['id', 'display_name', 'original_name'] }],
        order: [['created_at', 'DESC']]
      }),
      PageTracking.findAll({
        where: { user_id: req.userId },
        include: [{ model: File, as: 'file', attributes: ['id', 'display_name', 'original_name'] }],
        order: [['last_visit', 'DESC']]
      })
    ]);

    // Calculate summary statistics
    const totalReadingTime = pageTracking.reduce((sum, page) => sum + page.time_spent, 0);
    const totalQuizzes = quizResults.length;
    const averageQuizScore = totalQuizzes > 0 
      ? (quizResults.reduce((sum, quiz) => sum + parseFloat(quiz.percentage_score), 0) / totalQuizzes).toFixed(2)
      : 0;

    const exportData = {
      export_info: {
        type: 'complete_user_data',
        exported_at: new Date().toISOString(),
        user_id: req.userId,
        format: 'json',
        include_file_content: include_file_content === 'true',
        data_version: '1.0'
      },
      user_profile: user.getPublicProfile(),
      summary_statistics: {
        total_files: files.length,
        total_annotations: annotations.length,
        total_quiz_results: totalQuizzes,
        total_reading_time: totalReadingTime,
        total_pages_tracked: pageTracking.length,
        average_quiz_score: parseFloat(averageQuizScore)
      },
      files: files.map(file => file.getPublicData()),
      annotations: annotations.map(annotation => ({
        ...annotation.getPublicData(),
        file: annotation.file
      })),
      quiz_results: quizResults.map(quiz => ({
        ...quiz.getPublicData(),
        file: quiz.file
      })),
      reading_analytics: pageTracking.map(page => ({
        ...page.getPublicData(),
        file: page.file
      }))
    };

    // Set appropriate headers for download
    res.setHeader('Content-Disposition', `attachment; filename="forest-pdf-viewer-data-${req.userId}-${new Date().toISOString().split('T')[0]}.json"`);
    res.setHeader('Content-Type', 'application/json');

    res.json({
      success: true,
      data: exportData
    });

  } catch (error) {
    console.error('Complete export error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export complete user data',
      code: 'EXPORT_COMPLETE_ERROR'
    });
  }
});

/**
 * @route   GET /api/data-export/csv/quiz-results
 * @desc    Export quiz results in CSV format
 * @access  Private
 */
router.get('/csv/quiz-results', async (req, res) => {
  try {
    const { file_id } = req.query;

    const whereConditions = {
      user_id: req.userId
    };

    if (file_id) {
      whereConditions.file_id = file_id;
    }

    const quizResults = await QuizResult.findAll({
      where: whereConditions,
      include: [{
        model: File,
        as: 'file',
        attributes: ['display_name', 'original_name']
      }],
      order: [['created_at', 'DESC']]
    });

    // Generate CSV content
    const csvHeaders = [
      'Quiz ID',
      'File Name',
      'Quiz Type',
      'Score',
      'Total Questions',
      'Percentage',
      'Time Taken (seconds)',
      'Difficulty',
      'Completed At'
    ];

    const csvRows = quizResults.map(quiz => [
      quiz.id,
      quiz.file?.display_name || quiz.file?.original_name || 'Unknown',
      quiz.quiz_type,
      quiz.score,
      quiz.total_questions,
      quiz.percentage_score,
      quiz.time_taken,
      quiz.difficulty_level,
      quiz.created_at.toISOString()
    ]);

    const csvContent = [
      csvHeaders.join(','),
      ...csvRows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="quiz-results-${new Date().toISOString().split('T')[0]}.csv"`);
    
    res.send(csvContent);

  } catch (error) {
    console.error('Export CSV quiz results error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export quiz results as CSV',
      code: 'EXPORT_CSV_QUIZ_ERROR'
    });
  }
});

/**
 * @route   DELETE /api/data-export/delete-account
 * @desc    Delete user account and all associated data
 * @access  Private
 */
router.delete('/delete-account', async (req, res) => {
  try {
    const { confirm_deletion } = req.body;

    if (confirm_deletion !== 'DELETE_MY_ACCOUNT') {
      return res.status(400).json({
        success: false,
        error: 'Account deletion confirmation required',
        code: 'DELETION_NOT_CONFIRMED'
      });
    }

    // Get data counts before deletion
    const [fileCount, annotationCount, quizCount, pageTrackingCount] = await Promise.all([
      File.count({ where: { user_id: req.userId } }),
      Annotation.count({ where: { user_id: req.userId } }),
      QuizResult.count({ where: { user_id: req.userId } }),
      PageTracking.count({ where: { user_id: req.userId } })
    ]);

    // Delete all associated data (cascade delete should handle this, but being explicit)
    await Promise.all([
      File.destroy({ where: { user_id: req.userId } }),
      Annotation.destroy({ where: { user_id: req.userId } }),
      QuizResult.destroy({ where: { user_id: req.userId } }),
      PageTracking.destroy({ where: { user_id: req.userId } })
    ]);

    // Delete user account
    await User.destroy({ where: { id: req.userId } });

    res.json({
      success: true,
      message: 'Account deleted successfully',
      deleted_data: {
        files: fileCount,
        annotations: annotationCount,
        quiz_results: quizCount,
        page_tracking_records: pageTrackingCount
      }
    });

  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete account',
      code: 'DELETE_ACCOUNT_ERROR'
    });
  }
});

module.exports = router;