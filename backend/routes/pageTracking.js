const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { PageTracking, File, UserSession } = require('../models');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Apply authentication to all page tracking routes
router.use(authenticateToken);

// Validation rules
const trackPageValidation = [
  body('file_id')
    .isUUID()
    .withMessage('Valid file ID is required'),
  body('page_number')
    .isInt({ min: 1 })
    .withMessage('Page number must be a positive integer'),
  body('time_spent')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Time spent must be a non-negative integer'),
  body('reading_progress')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('Reading progress must be between 0 and 100'),
  body('scroll_depth')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('Scroll depth must be between 0 and 100'),
  body('zoom_level')
    .optional()
    .isFloat({ min: 0.1, max: 5 })
    .withMessage('Zoom level must be between 0.1 and 5'),
  body('interaction_events')
    .optional()
    .isObject()
    .withMessage('Interaction events must be an object')
];

/**
 * @route   POST /api/page-tracking/track
 * @desc    Track page reading activity
 * @access  Private
 */
router.post('/track', trackPageValidation, async (req, res) => {
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
      page_number,
      time_spent = 0,
      reading_progress,
      scroll_depth,
      zoom_level,
      interaction_events
    } = req.body;

    // Verify user owns this file
    const file = await File.findOne({
      where: {
        id: file_id,
        user_id: req.userId
      }
    });

    if (!file) {
      return res.status(404).json({
        success: false,
        error: 'File not found or access denied',
        code: 'FILE_NOT_FOUND'
      });
    }

    // Find or create page tracking record
    const pageTracking = await PageTracking.findOrCreateForPage(
      req.userId,
      file_id,
      page_number
    );

    // Update tracking data
    if (time_spent > 0) {
      await pageTracking.addReadingTime(time_spent, req.session?.id);
    }

    if (reading_progress !== undefined) {
      await pageTracking.updateReadingProgress(reading_progress);
    }

    if (scroll_depth !== undefined) {
      await pageTracking.updateScrollDepth(scroll_depth);
    }

    if (zoom_level !== undefined) {
      await pageTracking.addZoomLevel(zoom_level);
    }

    if (interaction_events) {
      for (const [eventType, count] of Object.entries(interaction_events)) {
        for (let i = 0; i < count; i++) {
          await pageTracking.updateInteractionEvent(eventType);
        }
      }
    }

    // Update file's last read page and total reading time
    if (page_number > file.last_read_page) {
      file.last_read_page = page_number;
    }
    file.total_read_time += time_spent;
    await file.save();

    res.json({
      success: true,
      message: 'Page tracking updated successfully',
      data: pageTracking.getPublicData()
    });

  } catch (error) {
    console.error('Track page error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to track page activity',
      code: 'TRACK_PAGE_ERROR'
    });
  }
});

/**
 * @route   POST /api/page-tracking/focus-session
 * @desc    Record a focus session for a page
 * @access  Private
 */
router.post('/focus-session', [
  body('file_id').isUUID().withMessage('Valid file ID is required'),
  body('page_number').isInt({ min: 1 }).withMessage('Page number must be a positive integer'),
  body('start_time').isISO8601().withMessage('Valid start time is required'),
  body('end_time').isISO8601().withMessage('Valid end time is required'),
  body('focus_score').optional().isFloat({ min: 0, max: 100 }).withMessage('Focus score must be between 0 and 100')
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

    const { file_id, page_number, start_time, end_time, focus_score } = req.body;

    // Verify user owns this file
    const file = await File.findOne({
      where: {
        id: file_id,
        user_id: req.userId
      }
    });

    if (!file) {
      return res.status(404).json({
        success: false,
        error: 'File not found or access denied',
        code: 'FILE_NOT_FOUND'
      });
    }

    // Find or create page tracking record
    const pageTracking = await PageTracking.findOrCreateForPage(
      req.userId,
      file_id,
      page_number
    );

    // Add focus session
    await pageTracking.addFocusSession(
      new Date(start_time),
      new Date(end_time),
      focus_score
    );

    res.json({
      success: true,
      message: 'Focus session recorded successfully',
      data: pageTracking.getPublicData()
    });

  } catch (error) {
    console.error('Record focus session error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to record focus session',
      code: 'RECORD_FOCUS_SESSION_ERROR'
    });
  }
});

/**
 * @route   GET /api/page-tracking/file/:fileId
 * @desc    Get reading progress for a file
 * @access  Private
 */
router.get('/file/:fileId', [
  param('fileId').isUUID().withMessage('Valid file ID is required')
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

    const { fileId } = req.params;

    // Verify user owns this file
    const file = await File.findOne({
      where: {
        id: fileId,
        user_id: req.userId
      }
    });

    if (!file) {
      return res.status(404).json({
        success: false,
        error: 'File not found or access denied',
        code: 'FILE_NOT_FOUND'
      });
    }

    // Get file progress
    const progress = await PageTracking.getFileProgress(req.userId, fileId);

    res.json({
      success: true,
      data: {
        file_id: fileId,
        file_info: file.getPublicData(),
        progress
      }
    });

  } catch (error) {
    console.error('Get file progress error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get file progress',
      code: 'GET_FILE_PROGRESS_ERROR'
    });
  }
});

/**
 * @route   GET /api/page-tracking/file/:fileId/page/:pageNumber
 * @desc    Get detailed tracking data for a specific page
 * @access  Private
 */
router.get('/file/:fileId/page/:pageNumber', [
  param('fileId').isUUID().withMessage('Valid file ID is required'),
  param('pageNumber').isInt({ min: 1 }).withMessage('Valid page number is required')
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

    const { fileId, pageNumber } = req.params;

    // Verify user owns this file
    const file = await File.findOne({
      where: {
        id: fileId,
        user_id: req.userId
      }
    });

    if (!file) {
      return res.status(404).json({
        success: false,
        error: 'File not found or access denied',
        code: 'FILE_NOT_FOUND'
      });
    }

    // Find page tracking record
    const pageTracking = await PageTracking.findOne({
      where: {
        user_id: req.userId,
        file_id: fileId,
        page_number: parseInt(pageNumber)
      }
    });

    if (!pageTracking) {
      return res.status(404).json({
        success: false,
        error: 'No tracking data found for this page',
        code: 'PAGE_TRACKING_NOT_FOUND'
      });
    }

    res.json({
      success: true,
      data: pageTracking.getPublicData()
    });

  } catch (error) {
    console.error('Get page tracking error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get page tracking data',
      code: 'GET_PAGE_TRACKING_ERROR'
    });
  }
});

/**
 * @route   PUT /api/page-tracking/bookmark
 * @desc    Toggle bookmark for a page
 * @access  Private
 */
router.put('/bookmark', [
  body('file_id').isUUID().withMessage('Valid file ID is required'),
  body('page_number').isInt({ min: 1 }).withMessage('Page number must be a positive integer')
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

    const { file_id, page_number } = req.body;

    // Verify user owns this file
    const file = await File.findOne({
      where: {
        id: file_id,
        user_id: req.userId
      }
    });

    if (!file) {
      return res.status(404).json({
        success: false,
        error: 'File not found or access denied',
        code: 'FILE_NOT_FOUND'
      });
    }

    // Find or create page tracking record
    const pageTracking = await PageTracking.findOrCreateForPage(
      req.userId,
      file_id,
      page_number
    );

    // Toggle bookmark
    await pageTracking.toggleBookmark();

    res.json({
      success: true,
      message: `Page ${pageTracking.bookmarked ? 'bookmarked' : 'unbookmarked'} successfully`,
      data: {
        page_number,
        bookmarked: pageTracking.bookmarked
      }
    });

  } catch (error) {
    console.error('Toggle bookmark error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to toggle bookmark',
      code: 'TOGGLE_BOOKMARK_ERROR'
    });
  }
});

/**
 * @route   PUT /api/page-tracking/notes
 * @desc    Update notes for a page
 * @access  Private
 */
router.put('/notes', [
  body('file_id').isUUID().withMessage('Valid file ID is required'),
  body('page_number').isInt({ min: 1 }).withMessage('Page number must be a positive integer'),
  body('notes').isString().isLength({ max: 10000 }).withMessage('Notes must be a string with max 10000 characters')
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

    const { file_id, page_number, notes } = req.body;

    // Verify user owns this file
    const file = await File.findOne({
      where: {
        id: file_id,
        user_id: req.userId
      }
    });

    if (!file) {
      return res.status(404).json({
        success: false,
        error: 'File not found or access denied',
        code: 'FILE_NOT_FOUND'
      });
    }

    // Find or create page tracking record
    const pageTracking = await PageTracking.findOrCreateForPage(
      req.userId,
      file_id,
      page_number
    );

    // Update notes
    await pageTracking.updateNotes(notes);

    res.json({
      success: true,
      message: 'Page notes updated successfully',
      data: {
        page_number,
        notes: pageTracking.notes
      }
    });

  } catch (error) {
    console.error('Update page notes error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update page notes',
      code: 'UPDATE_PAGE_NOTES_ERROR'
    });
  }
});

/**
 * @route   PUT /api/page-tracking/difficulty
 * @desc    Set difficulty rating for a page
 * @access  Private
 */
router.put('/difficulty', [
  body('file_id').isUUID().withMessage('Valid file ID is required'),
  body('page_number').isInt({ min: 1 }).withMessage('Page number must be a positive integer'),
  body('difficulty_rating').isInt({ min: 1, max: 5 }).withMessage('Difficulty rating must be between 1 and 5')
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

    const { file_id, page_number, difficulty_rating } = req.body;

    // Verify user owns this file
    const file = await File.findOne({
      where: {
        id: file_id,
        user_id: req.userId
      }
    });

    if (!file) {
      return res.status(404).json({
        success: false,
        error: 'File not found or access denied',
        code: 'FILE_NOT_FOUND'
      });
    }

    // Find or create page tracking record
    const pageTracking = await PageTracking.findOrCreateForPage(
      req.userId,
      file_id,
      page_number
    );

    // Set difficulty rating
    await pageTracking.setDifficultyRating(difficulty_rating);

    res.json({
      success: true,
      message: 'Difficulty rating set successfully',
      data: {
        page_number,
        difficulty_rating: pageTracking.difficulty_rating
      }
    });

  } catch (error) {
    console.error('Set difficulty rating error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to set difficulty rating',
      code: 'SET_DIFFICULTY_RATING_ERROR'
    });
  }
});

/**
 * @route   GET /api/page-tracking/stats
 * @desc    Get user's overall reading statistics
 * @access  Private
 */
router.get('/stats', async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    const startDate = start_date ? new Date(start_date) : null;
    const endDate = end_date ? new Date(end_date) : null;

    // Get user reading statistics
    const stats = await PageTracking.getUserReadingStats(req.userId, startDate, endDate);

    res.json({
      success: true,
      data: {
        period: {
          start_date: startDate,
          end_date: endDate
        },
        statistics: stats
      }
    });

  } catch (error) {
    console.error('Get reading stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get reading statistics',
      code: 'GET_READING_STATS_ERROR'
    });
  }
});

/**
 * @route   GET /api/page-tracking/bookmarks
 * @desc    Get all bookmarked pages for the user
 * @access  Private
 */
router.get('/bookmarks', async (req, res) => {
  try {
    const { file_id } = req.query;

    const whereConditions = {
      user_id: req.userId,
      bookmarked: true
    };

    if (file_id) {
      whereConditions.file_id = file_id;
    }

    const bookmarks = await PageTracking.findAll({
      where: whereConditions,
      include: [{
        model: File,
        as: 'file',
        attributes: ['id', 'display_name', 'original_name'],
        where: {
          user_id: req.userId
        }
      }],
      order: [['updated_at', 'DESC']]
    });

    res.json({
      success: true,
      data: {
        bookmarks: bookmarks.map(bookmark => ({
          ...bookmark.getPublicData(),
          file: bookmark.file
        })),
        count: bookmarks.length
      }
    });

  } catch (error) {
    console.error('Get bookmarks error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get bookmarks',
      code: 'GET_BOOKMARKS_ERROR'
    });
  }
});

module.exports = router;