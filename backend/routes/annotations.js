const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { Annotation, File } = require('../models');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Apply authentication to all annotation routes
router.use(authenticateToken);

// Validation rules
const createAnnotationValidation = [
  body('file_id')
    .isUUID()
    .withMessage('Valid file ID is required'),
  body('page_number')
    .isInt({ min: 1 })
    .withMessage('Page number must be a positive integer'),
  body('annotation_type')
    .isIn(['highlight', 'underline', 'stickynote', 'drawing', 'comment'])
    .withMessage('Invalid annotation type'),
  body('coordinates')
    .optional()
    .isObject()
    .withMessage('Coordinates must be an object'),
  body('content')
    .optional()
    .isString()
    .isLength({ max: 10000 })
    .withMessage('Content must be a string with max 10000 characters'),
  body('selected_text')
    .optional()
    .isString()
    .isLength({ max: 5000 })
    .withMessage('Selected text must be a string with max 5000 characters'),
  body('color')
    .optional()
    .matches(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
    .withMessage('Color must be a valid hex color'),
  body('attachments')
    .optional()
    .isArray()
    .withMessage('Attachments must be an array'),
  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array')
];

const updateAnnotationValidation = [
  param('annotationId')
    .isUUID()
    .withMessage('Valid annotation ID is required'),
  body('content')
    .optional()
    .isString()
    .isLength({ max: 10000 })
    .withMessage('Content must be a string with max 10000 characters'),
  body('color')
    .optional()
    .matches(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
    .withMessage('Color must be a valid hex color'),
  body('attachments')
    .optional()
    .isArray()
    .withMessage('Attachments must be an array'),
  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array')
];

/**
 * @route   GET /api/annotations/file/:fileId
 * @desc    Get all annotations for a specific file (user-specific)
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

    // Get all annotations for this file by this user
    const annotations = await Annotation.findByFileAndUser(fileId, req.userId);

    // Group annotations by page
    const annotationsByPage = {};
    annotations.forEach(annotation => {
      const pageKey = `page-${annotation.page_number}`;
      if (!annotationsByPage[pageKey]) {
        annotationsByPage[pageKey] = [];
      }
      annotationsByPage[pageKey].push(annotation.getPublicData());
    });

    res.json({
      success: true,
      data: {
        file_id: fileId,
        annotations: annotationsByPage,
        total_count: annotations.length
      }
    });

  } catch (error) {
    console.error('Get annotations error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get annotations',
      code: 'GET_ANNOTATIONS_ERROR'
    });
  }
});

/**
 * @route   GET /api/annotations/file/:fileId/page/:pageNumber
 * @desc    Get annotations for a specific page
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

    // Get annotations for this specific page
    const annotations = await Annotation.findAll({
      where: {
        file_id: fileId,
        user_id: req.userId,
        page_number: parseInt(pageNumber),
        is_deleted: false
      },
      order: [['created_at', 'ASC']]
    });

    res.json({
      success: true,
      data: {
        file_id: fileId,
        page_number: parseInt(pageNumber),
        annotations: annotations.map(annotation => annotation.getPublicData()),
        count: annotations.length
      }
    });

  } catch (error) {
    console.error('Get page annotations error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get page annotations',
      code: 'GET_PAGE_ANNOTATIONS_ERROR'
    });
  }
});

/**
 * @route   POST /api/annotations
 * @desc    Create a new annotation
 * @access  Private
 */
router.post('/', createAnnotationValidation, async (req, res) => {
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
      annotation_type,
      coordinates,
      content,
      selected_text,
      color,
      attachments,
      style_properties,
      ai_generated,
      ai_metadata,
      is_text_selection,
      coordinate_version,
      metadata,
      tags
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

    // Create annotation
    const annotation = await Annotation.create({
      user_id: req.userId,
      file_id,
      page_number,
      annotation_type,
      coordinates,
      content,
      selected_text,
      color: color || '#ffff00', // Default yellow
      attachments: attachments || [],
      style_properties: style_properties || {},
      ai_generated: ai_generated || false,
      ai_metadata,
      is_text_selection: is_text_selection || false,
      coordinate_version: coordinate_version || '2.0',
      metadata: metadata || {},
      tags: tags || []
    });

    res.status(201).json({
      success: true,
      message: 'Annotation created successfully',
      data: annotation.getPublicData()
    });

  } catch (error) {
    console.error('Create annotation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create annotation',
      code: 'CREATE_ANNOTATION_ERROR'
    });
  }
});

/**
 * @route   PUT /api/annotations/:annotationId
 * @desc    Update an annotation
 * @access  Private
 */
router.put('/:annotationId', updateAnnotationValidation, async (req, res) => {
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

    const { annotationId } = req.params;
    const updates = req.body;

    // Find annotation owned by user
    const annotation = await Annotation.findOne({
      where: {
        id: annotationId,
        user_id: req.userId,
        is_deleted: false
      }
    });

    if (!annotation) {
      return res.status(404).json({
        success: false,
        error: 'Annotation not found or access denied',
        code: 'ANNOTATION_NOT_FOUND'
      });
    }

    // Update allowed fields
    const allowedUpdates = ['content', 'color', 'attachments', 'tags', 'style_properties'];
    for (const field of allowedUpdates) {
      if (updates[field] !== undefined) {
        annotation[field] = updates[field];
      }
    }

    await annotation.save();

    res.json({
      success: true,
      message: 'Annotation updated successfully',
      data: annotation.getPublicData()
    });

  } catch (error) {
    console.error('Update annotation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update annotation',
      code: 'UPDATE_ANNOTATION_ERROR'
    });
  }
});

/**
 * @route   DELETE /api/annotations/:annotationId
 * @desc    Delete an annotation (soft delete)
 * @access  Private
 */
router.delete('/:annotationId', [
  param('annotationId').isUUID().withMessage('Valid annotation ID is required')
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

    const { annotationId } = req.params;

    // Find annotation owned by user
    const annotation = await Annotation.findOne({
      where: {
        id: annotationId,
        user_id: req.userId,
        is_deleted: false
      }
    });

    if (!annotation) {
      return res.status(404).json({
        success: false,
        error: 'Annotation not found or access denied',
        code: 'ANNOTATION_NOT_FOUND'
      });
    }

    // Soft delete the annotation
    await annotation.softDelete();

    res.json({
      success: true,
      message: 'Annotation deleted successfully'
    });

  } catch (error) {
    console.error('Delete annotation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete annotation',
      code: 'DELETE_ANNOTATION_ERROR'
    });
  }
});

/**
 * @route   POST /api/annotations/bulk
 * @desc    Create multiple annotations at once
 * @access  Private
 */
router.post('/bulk', [
  body('file_id').isUUID().withMessage('Valid file ID is required'),
  body('annotations').isArray({ min: 1 }).withMessage('Annotations array is required with at least one item')
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

    const { file_id, annotations } = req.body;

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

    // Validate and prepare annotations for bulk creation
    const annotationsToCreate = annotations.map(annotation => ({
      user_id: req.userId,
      file_id,
      page_number: annotation.page_number,
      annotation_type: annotation.annotation_type,
      coordinates: annotation.coordinates,
      content: annotation.content,
      selected_text: annotation.selected_text,
      color: annotation.color || '#ffff00',
      attachments: annotation.attachments || [],
      style_properties: annotation.style_properties || {},
      ai_generated: annotation.ai_generated || false,
      ai_metadata: annotation.ai_metadata,
      is_text_selection: annotation.is_text_selection || false,
      coordinate_version: annotation.coordinate_version || '2.0',
      metadata: annotation.metadata || {},
      tags: annotation.tags || []
    }));

    // Create annotations in bulk
    const createdAnnotations = await Annotation.bulkCreate(annotationsToCreate);

    res.status(201).json({
      success: true,
      message: `${createdAnnotations.length} annotations created successfully`,
      data: {
        created_count: createdAnnotations.length,
        annotations: createdAnnotations.map(annotation => annotation.getPublicData())
      }
    });

  } catch (error) {
    console.error('Bulk create annotations error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create annotations',
      code: 'BULK_CREATE_ANNOTATIONS_ERROR'
    });
  }
});

/**
 * @route   GET /api/annotations/search
 * @desc    Search annotations by content or tags
 * @access  Private
 */
router.get('/search', async (req, res) => {
  try {
    const { q, file_id, type, page_number, limit = 50, offset = 0 } = req.query;

    if (!q) {
      return res.status(400).json({
        success: false,
        error: 'Search query is required',
        code: 'SEARCH_QUERY_REQUIRED'
      });
    }

    // Build search conditions
    const whereConditions = {
      user_id: req.userId,
      is_deleted: false
    };

    if (file_id) whereConditions.file_id = file_id;
    if (type) whereConditions.annotation_type = type;
    if (page_number) whereConditions.page_number = parseInt(page_number);

    // Search in content, selected_text, and tags
    const { Op } = require('sequelize');
    whereConditions[Op.or] = [
      { content: { [Op.iLike]: `%${q}%` } },
      { selected_text: { [Op.iLike]: `%${q}%` } },
      { tags: { [Op.contains]: [q] } }
    ];

    const annotations = await Annotation.findAndCountAll({
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
        annotations: annotations.rows.map(annotation => ({
          ...annotation.getPublicData(),
          file: annotation.file
        })),
        total_count: annotations.count,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });

  } catch (error) {
    console.error('Search annotations error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search annotations',
      code: 'SEARCH_ANNOTATIONS_ERROR'
    });
  }
});

module.exports = router;