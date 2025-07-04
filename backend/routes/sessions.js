const express = require('express');
const router = express.Router();
const { PDFSession, Annotation, PageTracking, File } = require('../models');
const { authenticateToken } = require('../middleware/auth');

// GET /api/sessions - Get all user sessions
router.get('/', authenticateToken, async (req, res) => {
  try {
    const sessions = await PDFSession.getUserSessions(req.user.id);
    res.json({
      success: true,
      data: {
        sessions: sessions.map(session => session.getSessionSummary())
      }
    });
  } catch (error) {
    console.error('Error fetching sessions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch sessions'
    });
  }
});

// GET /api/sessions/file/:fileId - Get or create session for a specific file
router.get('/file/:fileId', authenticateToken, async (req, res) => {
  try {
    const { fileId } = req.params;
    const deviceInfo = {
      user_agent: req.headers['user-agent'],
      ip_address: req.ip,
      device_type: req.headers['sec-ch-ua-mobile'] === '?1' ? 'mobile' : 'desktop'
    };

    const session = await PDFSession.findOrCreateSession(req.user.id, fileId, deviceInfo);
    
    res.json({
      success: true,
      data: {
        session: session.getFullSessionData()
      }
    });
  } catch (error) {
    console.error('Error fetching/creating session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch session'
    });
  }
});

// POST /api/sessions/:sessionId/save - Manual save session
router.post('/:sessionId/save', authenticateToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const {
      current_page,
      zoom_level,
      scroll_position,
      view_mode,
      reading_progress,
      page_time_tracking,
      bookmarked_pages,
      session_notes,
      annotations,
      session_duration
    } = req.body;

    const session = await PDFSession.findOne({
      where: {
        id: sessionId,
        user_id: req.user.id
      }
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    // Update session data
    await session.update({
      current_page: current_page || session.current_page,
      zoom_level: zoom_level || session.zoom_level,
      scroll_position: scroll_position || session.scroll_position,
      view_mode: view_mode || session.view_mode,
      reading_progress: reading_progress || session.reading_progress,
      page_time_tracking: page_time_tracking || session.page_time_tracking,
      bookmarked_pages: bookmarked_pages || session.bookmarked_pages,
      session_notes: session_notes !== undefined ? session_notes : session.session_notes,
      session_duration: session_duration || session.session_duration
    });

    // Update annotation summary if annotations provided
    if (annotations && Array.isArray(annotations)) {
      await session.updateAnnotationSummary(annotations);
    }

    // Perform manual save
    await session.performManualSave();

    res.json({
      success: true,
      data: {
        session: session.getFullSessionData(),
        saved_at: session.last_manual_save
      }
    });
  } catch (error) {
    console.error('Error saving session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save session'
    });
  }
});

// POST /api/sessions/:sessionId/autosave - Auto save session
router.post('/:sessionId/autosave', authenticateToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const {
      current_page,
      zoom_level,
      scroll_position,
      page_time_tracking,
      reading_progress,
      session_duration
    } = req.body;

    const session = await PDFSession.findOne({
      where: {
        id: sessionId,
        user_id: req.user.id
      }
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    // Only auto-save if enabled
    if (!session.auto_save_enabled) {
      return res.json({
        success: true,
        data: {
          message: 'Auto-save is disabled for this session'
        }
      });
    }

    // Update session data
    await session.update({
      current_page: current_page || session.current_page,
      zoom_level: zoom_level || session.zoom_level,
      scroll_position: scroll_position || session.scroll_position,
      page_time_tracking: page_time_tracking || session.page_time_tracking,
      reading_progress: reading_progress || session.reading_progress,
      session_duration: session_duration || session.session_duration
    });

    // Perform auto save
    await session.performAutoSave();

    res.json({
      success: true,
      data: {
        session: session.getSessionSummary(),
        auto_saved_at: session.last_auto_save
      }
    });
  } catch (error) {
    console.error('Error auto-saving session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to auto-save session'
    });
  }
});

// PUT /api/sessions/:sessionId/page - Update current page
router.put('/:sessionId/page', authenticateToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { page_number, time_spent = 0 } = req.body;

    const session = await PDFSession.findOne({
      where: {
        id: sessionId,
        user_id: req.user.id
      }
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    // Update current page
    await session.updateCurrentPage(page_number);

    // Add time spent on previous page if provided
    if (time_spent > 0) {
      await session.addPageTime(session.current_page, time_spent);
    }

    res.json({
      success: true,
      data: {
        current_page: session.current_page,
        page_time_tracking: session.page_time_tracking
      }
    });
  } catch (error) {
    console.error('Error updating page:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update page'
    });
  }
});

// PUT /api/sessions/:sessionId/bookmark - Toggle bookmark for page
router.put('/:sessionId/bookmark', authenticateToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { page_number } = req.body;

    const session = await PDFSession.findOne({
      where: {
        id: sessionId,
        user_id: req.user.id
      }
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    await session.toggleBookmark(page_number);

    res.json({
      success: true,
      data: {
        bookmarked_pages: session.bookmarked_pages
      }
    });
  } catch (error) {
    console.error('Error toggling bookmark:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to toggle bookmark'
    });
  }
});

// PUT /api/sessions/:sessionId/focus - Record focus session
router.put('/:sessionId/focus', authenticateToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { start_time, end_time, distraction_count = 0 } = req.body;

    const session = await PDFSession.findOne({
      where: {
        id: sessionId,
        user_id: req.user.id
      }
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    await session.recordFocusSession(new Date(start_time), new Date(end_time), distraction_count);

    res.json({
      success: true,
      data: {
        focus_metrics: session.focus_metrics
      }
    });
  } catch (error) {
    console.error('Error recording focus session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to record focus session'
    });
  }
});

// PUT /api/sessions/:sessionId/ai-interaction - Record AI interaction
router.put('/:sessionId/ai-interaction', authenticateToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { interaction_type } = req.body;

    const validInteractions = ['summaries_generated', 'explanations_requested', 'quizzes_taken'];
    if (!validInteractions.includes(interaction_type)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid interaction type'
      });
    }

    const session = await PDFSession.findOne({
      where: {
        id: sessionId,
        user_id: req.user.id
      }
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    await session.recordAIInteraction(interaction_type);

    res.json({
      success: true,
      data: {
        ai_interaction_history: session.ai_interaction_history
      }
    });
  } catch (error) {
    console.error('Error recording AI interaction:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to record AI interaction'
    });
  }
});

// PUT /api/sessions/:sessionId/settings - Update session settings
router.put('/:sessionId/settings', authenticateToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { auto_save_enabled, session_name } = req.body;

    const session = await PDFSession.findOne({
      where: {
        id: sessionId,
        user_id: req.user.id
      }
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const updates = {};
    if (auto_save_enabled !== undefined) {
      updates.auto_save_enabled = auto_save_enabled;
    }
    if (session_name !== undefined) {
      updates.session_name = session_name;
    }

    await session.update(updates);

    res.json({
      success: true,
      data: {
        auto_save_enabled: session.auto_save_enabled,
        session_name: session.session_name
      }
    });
  } catch (error) {
    console.error('Error updating session settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update session settings'
    });
  }
});

// GET /api/sessions/:sessionId/complete - Get complete session data with annotations
router.get('/:sessionId/complete', authenticateToken, async (req, res) => {
  try {
    const { sessionId } = req.params;

    const session = await PDFSession.findOne({
      where: {
        id: sessionId,
        user_id: req.user.id
      }
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    // Get all annotations for this file
    const annotations = await Annotation.findByFileAndUser(session.file_id, req.user.id);

    // Get page tracking data
    const pageTracking = await PageTracking.findAll({
      where: {
        user_id: req.user.id,
        file_id: session.file_id
      }
    });

    res.json({
      success: true,
      data: {
        session: session.getFullSessionData(),
        annotations: annotations.map(ann => ann.getPublicData()),
        page_tracking: pageTracking.map(pt => pt.getPublicData())
      }
    });
  } catch (error) {
    console.error('Error fetching complete session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch complete session'
    });
  }
});

// DELETE /api/sessions/:sessionId - Delete session
router.delete('/:sessionId', authenticateToken, async (req, res) => {
  try {
    const { sessionId } = req.params;

    const session = await PDFSession.findOne({
      where: {
        id: sessionId,
        user_id: req.user.id
      }
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    await session.update({ is_active: false });

    res.json({
      success: true,
      data: {
        message: 'Session deleted successfully'
      }
    });
  } catch (error) {
    console.error('Error deleting session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete session'
    });
  }
});

module.exports = router;