const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Annotation = require('../models/mongodb/Annotation');
const File = require('../models/mongodb/File');
const { authenticateToken } = require('../middleware/auth');

// Apply authentication middleware to all annotation routes
router.use(authenticateToken);

// Get annotations for a specific file and page
router.get('/file/:fileId/page/:pageNumber', async (req, res) => {
  try {
    const { fileId, pageNumber } = req.params;
    const userId = req.userId;

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(fileId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid file ID format'
      });
    }

    // Validate page number
    const page = parseInt(pageNumber);
    if (isNaN(page) || page < 1) {
      return res.status(400).json({
        success: false,
        error: 'Invalid page number'
      });
    }

    // Check if user has access to this file
    const file = await File.findOne({
      _id: fileId,
      user_id: userId
    });

    if (!file) {
      return res.status(404).json({
        success: false,
        error: 'File not found or access denied'
      });
    }

    // Get annotations for this file and page
    const annotations = await Annotation.findByFilePage(fileId, page);

    res.json({
      success: true,
      data: annotations.map(annotation => annotation.getPublicData())
    });

  } catch (error) {
    console.error('Get annotations error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get annotations'
    });
  }
});

// Get all annotations for a file
router.get('/file/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    const userId = req.userId;

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(fileId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid file ID format'
      });
    }

    // Check if user has access to this file
    const file = await File.findOne({
      _id: fileId,
      user_id: userId
    });

    if (!file) {
      return res.status(404).json({
        success: false,
        error: 'File not found or access denied'
      });
    }

    // Get all annotations for this file
    const annotations = await Annotation.findByFileAndUser(fileId, userId);

    res.json({
      success: true,
      data: annotations.map(annotation => annotation.getPublicData())
    });

  } catch (error) {
    console.error('Get file annotations error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get file annotations'
    });
  }
});

// Create a new annotation
router.post('/', async (req, res) => {
  try {
    const userId = req.userId;
    const annotationData = req.body;

    // Validate required fields
    if (!annotationData.file_id || !annotationData.page_number || !annotationData.annotation_type) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: file_id, page_number, annotation_type'
      });
    }

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(annotationData.file_id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid file ID format'
      });
    }

    // Check if user has access to this file
    const file = await File.findOne({
      _id: annotationData.file_id,
      user_id: userId
    });

    if (!file) {
      return res.status(404).json({
        success: false,
        error: 'File not found or access denied'
      });
    }

    // Create annotation
    const annotation = new Annotation({
      user_id: userId,
      file_id: annotationData.file_id,
      page_number: annotationData.page_number,
      annotation_type: annotationData.annotation_type,
      coordinates: annotationData.coordinates,
      content: annotationData.content,
      selected_text: annotationData.selected_text,
      color: annotationData.color,
      style_properties: annotationData.style_properties,
      ai_generated: annotationData.ai_generated || false,
      ai_metadata: annotationData.ai_metadata,
      is_text_selection: annotationData.is_text_selection || false,
      coordinate_version: annotationData.coordinate_version || '2.0',
      metadata: annotationData.metadata,
      tags: annotationData.tags || []
    });

    const savedAnnotation = await annotation.save();

    res.json({
      success: true,
      data: savedAnnotation.getPublicData()
    });

  } catch (error) {
    console.error('Create annotation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create annotation'
    });
  }
});

// Update an annotation
router.put('/:annotationId', async (req, res) => {
  try {
    const { annotationId } = req.params;
    const userId = req.userId;
    const updateData = req.body;

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(annotationId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid annotation ID format'
      });
    }

    // Find annotation and check ownership
    const annotation = await Annotation.findOne({
      _id: annotationId,
      user_id: userId,
      is_deleted: false
    });

    if (!annotation) {
      return res.status(404).json({
        success: false,
        error: 'Annotation not found or access denied'
      });
    }

    // Update allowed fields
    const allowedFields = [
      'coordinates', 'content', 'selected_text', 'color', 
      'style_properties', 'metadata', 'tags'
    ];

    allowedFields.forEach(field => {
      if (updateData[field] !== undefined) {
        annotation[field] = updateData[field];
      }
    });

    const updatedAnnotation = await annotation.save();

    res.json({
      success: true,
      data: updatedAnnotation.getPublicData()
    });

  } catch (error) {
    console.error('Update annotation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update annotation'
    });
  }
});

// Delete an annotation
router.delete('/:annotationId', async (req, res) => {
  try {
    const { annotationId } = req.params;
    const userId = req.userId;

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(annotationId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid annotation ID format'
      });
    }

    // Find annotation and check ownership
    const annotation = await Annotation.findOne({
      _id: annotationId,
      user_id: userId,
      is_deleted: false
    });

    if (!annotation) {
      return res.status(404).json({
        success: false,
        error: 'Annotation not found or access denied'
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
      error: 'Failed to delete annotation'
    });
  }
});

// Create bulk annotations
router.post('/bulk', async (req, res) => {
  try {
    const userId = req.userId;
    const { file_id, annotations } = req.body;

    // Validate input
    if (!file_id || !annotations || !Array.isArray(annotations)) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: file_id, annotations array'
      });
    }

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(file_id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid file ID format'
      });
    }

    // Check if user has access to this file
    const file = await File.findOne({
      _id: file_id,
      user_id: userId
    });

    if (!file) {
      return res.status(404).json({
        success: false,
        error: 'File not found or access denied'
      });
    }

    // Create all annotations
    const createdAnnotations = [];
    for (const annotationData of annotations) {
      const annotation = new Annotation({
        user_id: userId,
        file_id: file_id,
        page_number: annotationData.page_number,
        annotation_type: annotationData.annotation_type,
        coordinates: annotationData.coordinates,
        content: annotationData.content,
        selected_text: annotationData.selected_text,
        color: annotationData.color,
        style_properties: annotationData.style_properties,
        ai_generated: annotationData.ai_generated || false,
        ai_metadata: annotationData.ai_metadata,
        is_text_selection: annotationData.is_text_selection || false,
        coordinate_version: annotationData.coordinate_version || '2.0',
        metadata: annotationData.metadata,
        tags: annotationData.tags || []
      });

      const savedAnnotation = await annotation.save();
      createdAnnotations.push(savedAnnotation.getPublicData());
    }

    res.json({
      success: true,
      data: createdAnnotations
    });

  } catch (error) {
    console.error('Create bulk annotations error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create bulk annotations'
    });
  }
});

// Search annotations
router.get('/search', async (req, res) => {
  try {
    const userId = req.userId;
    const { q: searchTerm, file_id, annotation_type } = req.query;

    if (!searchTerm) {
      return res.status(400).json({
        success: false,
        error: 'Search term is required'
      });
    }

    const options = {};
    if (file_id) {
      if (!mongoose.Types.ObjectId.isValid(file_id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid file ID format'
        });
      }
      options.file_id = file_id;
    }

    if (annotation_type) {
      options.annotation_type = annotation_type;
    }

    const annotations = await Annotation.searchAnnotations(userId, searchTerm, options);

    res.json({
      success: true,
      data: annotations.map(annotation => annotation.getPublicData())
    });

  } catch (error) {
    console.error('Search annotations error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search annotations'
    });
  }
});

module.exports = router;