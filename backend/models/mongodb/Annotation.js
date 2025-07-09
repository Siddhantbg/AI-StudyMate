const mongoose = require('mongoose');

const AnnotationSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  file_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'File',
    required: true,
    index: true
  },
  page_number: {
    type: Number,
    required: true,
    min: 1,
    index: true
  },
  annotation_type: {
    type: String,
    enum: ['highlight', 'underline', 'stickynote', 'drawing', 'comment'],
    required: true,
    index: true
  },
  coordinates: {
    type: mongoose.Schema.Types.Mixed,
    default: null
    // Structure: 
    // For text-based: [{ x, y, width, height }, ...]
    // For drawings: { path: [{ x, y }, ...] }
    // For points: { x, y }
  },
  content: {
    type: String, // Text content for comments/sticky notes
    default: null
  },
  selected_text: {
    type: String, // The actual text that was selected (for highlights/underlines)
    default: null
  },
  color: {
    type: String,
    default: '#ffff00', // Default yellow for highlights
    validate: {
      validator: function(v) {
        return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(v);
      },
      message: 'Color must be a valid hex color code'
    }
  },
  attachments: {
    type: [{
      id: { type: String, required: true },
      name: { type: String, required: true },
      type: { type: String, required: true },
      size: { type: Number, required: true },
      data: { type: String, required: true }, // Base64 or URL
      uploadedAt: { type: Date, default: Date.now }
    }],
    default: []
  },
  style_properties: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: () => new Map()
    // Additional styling: strokeWidth, opacity, font, etc.
  },
  ai_generated: {
    type: Boolean,
    default: false, // Whether this annotation was suggested by AI
    index: true
  },
  ai_metadata: {
    category: { type: String, default: null },
    reason: { type: String, default: null },
    importance: { type: Number, min: 0, max: 1, default: null },
    confidence: { type: Number, min: 0, max: 1, default: null }
  },
  is_text_selection: {
    type: Boolean,
    default: false // Whether this annotation is based on text selection
  },
  coordinate_version: {
    type: String,
    default: '2.0' // Version for coordinate system compatibility
  },
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: () => new Map()
    // Additional metadata: scale, rotation, textLength, etc.
  },
  is_deleted: {
    type: Boolean,
    default: false, // Soft delete for data integrity
    index: true
  },
  tags: {
    type: [String],
    default: [], // User-defined tags for annotation organization
    index: true
  }
}, {
  timestamps: { 
    createdAt: 'created_at', 
    updatedAt: 'updated_at' 
  }
});

// Compound indexes for performance
AnnotationSchema.index({ user_id: 1, file_id: 1 });
AnnotationSchema.index({ file_id: 1, page_number: 1 });
AnnotationSchema.index({ user_id: 1, file_id: 1, page_number: 1 });
AnnotationSchema.index({ user_id: 1, ai_generated: 1 });
AnnotationSchema.index({ file_id: 1, is_deleted: 1 });
AnnotationSchema.index({ annotation_type: 1, ai_generated: 1 });

// Text index for search functionality
AnnotationSchema.index({
  content: 'text',
  selected_text: 'text',
  tags: 'text'
});

// Instance methods
AnnotationSchema.methods.addAttachment = async function(attachment) {
  const newAttachment = {
    id: attachment.id || Date.now() + Math.random(),
    name: attachment.name,
    type: attachment.type,
    size: attachment.size,
    data: attachment.data,
    uploadedAt: new Date()
  };
  
  this.attachments.push(newAttachment);
  return await this.save();
};

AnnotationSchema.methods.removeAttachment = async function(attachmentId) {
  this.attachments = this.attachments.filter(att => att.id !== attachmentId);
  return await this.save();
};

AnnotationSchema.methods.updateContent = async function(newContent) {
  this.content = newContent;
  this.updated_at = new Date();
  return await this.save();
};

AnnotationSchema.methods.addTag = async function(tag) {
  if (!this.tags.includes(tag)) {
    this.tags.push(tag);
    return await this.save();
  }
  return this;
};

AnnotationSchema.methods.removeTag = async function(tag) {
  this.tags = this.tags.filter(t => t !== tag);
  return await this.save();
};

AnnotationSchema.methods.softDelete = async function() {
  this.is_deleted = true;
  return await this.save();
};

AnnotationSchema.methods.restore = async function() {
  this.is_deleted = false;
  return await this.save();
};

AnnotationSchema.methods.getPublicData = function() {
  return {
    id: this._id,
    page_number: this.page_number,
    annotation_type: this.annotation_type,
    coordinates: this.coordinates,
    content: this.content,
    selected_text: this.selected_text,
    color: this.color,
    attachments: this.attachments,
    style_properties: Object.fromEntries(this.style_properties),
    ai_generated: this.ai_generated,
    ai_metadata: this.ai_metadata,
    is_text_selection: this.is_text_selection,
    coordinate_version: this.coordinate_version,
    metadata: Object.fromEntries(this.metadata),
    tags: this.tags,
    created_at: this.created_at,
    updated_at: this.updated_at
  };
};

// Static methods
AnnotationSchema.statics.findByFilePage = function(fileId, pageNumber) {
  return this.find({
    file_id: fileId,
    page_number: pageNumber,
    is_deleted: false
  }).sort({ created_at: 1 });
};

AnnotationSchema.statics.findByFileAndUser = function(fileId, userId) {
  return this.find({
    file_id: fileId,
    user_id: userId,
    is_deleted: false
  }).sort({ page_number: 1, created_at: 1 });
};

AnnotationSchema.statics.findAIAnnotations = function(fileId, userId) {
  return this.find({
    file_id: fileId,
    user_id: userId,
    ai_generated: true,
    is_deleted: false
  }).sort({ page_number: 1, created_at: 1 });
};

AnnotationSchema.statics.searchAnnotations = function(userId, searchTerm, options = {}) {
  const query = {
    user_id: userId,
    is_deleted: false,
    $text: { $search: searchTerm }
  };
  
  if (options.file_id) {
    query.file_id = options.file_id;
  }
  
  if (options.annotation_type) {
    query.annotation_type = options.annotation_type;
  }
  
  return this.find(query, { score: { $meta: 'textScore' } })
    .sort({ score: { $meta: 'textScore' } })
    .populate('file_id', 'original_name display_name');
};

module.exports = mongoose.model('Annotation', AnnotationSchema);