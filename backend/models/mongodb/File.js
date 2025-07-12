const mongoose = require('mongoose');

const FileSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  filename: {
    type: String,
    required: true,
    unique: true // Server-generated filename
  },
  original_name: {
    type: String,
    required: true // User's original filename
  },
  display_name: {
    type: String,
    default: null // User can customize display name
  },
  file_size: {
    type: Number,
    required: true,
    min: 0
  },
  file_path: {
    type: String,
    required: false // Legacy field - will be deprecated when using MongoDB storage
  },
  file_data: {
    type: Buffer, // Binary data stored in MongoDB
    required: false // Will be required when migrating away from file system
  },
  storage_type: {
    type: String,
    enum: ['filesystem', 'mongodb'],
    default: 'mongodb' // New files will be stored in MongoDB by default
  },
  mime_type: {
    type: String,
    default: 'application/pdf'
  },
  file_hash: {
    type: String
    // MD5 or SHA hash for duplicate detection
  },
  num_pages: {
    type: Number,
    min: 1 // Total number of pages in PDF
  },
  last_read_page: {
    type: Number,
    default: 1,
    min: 1 // Last page the user was reading
  },
  total_read_time: {
    type: Number,
    default: 0,
    min: 0 // Total time spent reading (in seconds)
  },
  upload_source: {
    type: String,
    enum: ['local', 'server', 'url'],
    default: 'server'
  },
  processing_status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending'
  },
  extracted_text: {
    type: String, // Full text content extracted from PDF
    default: null
  },
  metadata: {
    author: { type: String, default: null },
    title: { type: String, default: null },
    subject: { type: String, default: null },
    keywords: { type: String, default: null },
    creation_date: { type: Date, default: null },
    modification_date: { type: Date, default: null },
    pdf_version: { type: String, default: null }
  },
  ai_summary: {
    type: String, // AI-generated summary of the document
    default: null
  },
  tags: {
    type: [String],
    default: [], // User-defined tags for organization
    index: true
  },
  is_favorite: {
    type: Boolean,
    default: false,
    index: true
  },
  is_archived: {
    type: Boolean,
    default: false,
    index: true
  },
  visibility: {
    type: String,
    enum: ['private', 'shared', 'public'],
    default: 'private'
  }
}, {
  timestamps: { 
    createdAt: 'created_at', 
    updatedAt: 'updated_at' 
  }
});

// Compound indexes for performance (removed duplicates)
FileSchema.index({ user_id: 1, created_at: -1 });
FileSchema.index({ user_id: 1, is_archived: 1 });
FileSchema.index({ user_id: 1, is_favorite: 1 });
FileSchema.index({ user_id: 1, processing_status: 1 });
FileSchema.index({ upload_source: 1 });

// Text index for search functionality
FileSchema.index({
  original_name: 'text',
  display_name: 'text',
  extracted_text: 'text',
  'metadata.title': 'text',
  'metadata.author': 'text',
  tags: 'text'
});

// Instance methods
FileSchema.methods.updateReadingProgress = async function(pageNumber, timeSpent = 0) {
  this.last_read_page = pageNumber;
  this.total_read_time += timeSpent;
  return await this.save();
};

FileSchema.methods.addReadingTime = async function(additionalTime) {
  this.total_read_time += additionalTime;
  return await this.save();
};

FileSchema.methods.getReadingStats = function() {
  return {
    total_pages: this.num_pages,
    last_read_page: this.last_read_page,
    total_read_time: this.total_read_time,
    completion_percentage: this.num_pages ? ((this.last_read_page / this.num_pages) * 100).toFixed(2) : 0,
    average_time_per_page: this.last_read_page > 0 ? (this.total_read_time / this.last_read_page).toFixed(2) : 0
  };
};

FileSchema.methods.addTag = async function(tag) {
  if (!this.tags.includes(tag)) {
    this.tags.push(tag);
    return await this.save();
  }
  return this;
};

FileSchema.methods.removeTag = async function(tag) {
  this.tags = this.tags.filter(t => t !== tag);
  return await this.save();
};

FileSchema.methods.toggleFavorite = async function() {
  this.is_favorite = !this.is_favorite;
  return await this.save();
};

FileSchema.methods.updateProcessingStatus = async function(status, extractedText = null) {
  this.processing_status = status;
  if (extractedText) {
    this.extracted_text = extractedText;
  }
  return await this.save();
};

// MongoDB storage methods
FileSchema.methods.storeFileData = async function(buffer) {
  this.file_data = buffer;
  this.storage_type = 'mongodb';
  this.file_path = null; // Clear legacy file path
  return await this.save();
};

FileSchema.methods.getFileData = function() {
  if (this.storage_type === 'mongodb' && this.file_data) {
    return this.file_data;
  }
  return null;
};

FileSchema.methods.hasFileData = function() {
  return this.storage_type === 'mongodb' && this.file_data && this.file_data.length > 0;
};

FileSchema.methods.getFileSize = function() {
  if (this.storage_type === 'mongodb' && this.file_data) {
    return this.file_data.length;
  }
  return this.file_size;
};

FileSchema.methods.getPublicData = function() {
  return {
    id: this._id,
    display_name: this.display_name || this.original_name,
    original_name: this.original_name,
    file_size: this.file_size,
    num_pages: this.num_pages,
    last_read_page: this.last_read_page,
    reading_stats: this.getReadingStats(),
    tags: this.tags,
    is_favorite: this.is_favorite,
    metadata: this.metadata,
    processing_status: this.processing_status,
    created_at: this.created_at,
    updated_at: this.updated_at
  };
};

// Static methods
FileSchema.statics.findByUser = function(userId, options = {}) {
  const query = { user_id: userId };
  
  if (options.archived !== undefined) {
    query.is_archived = options.archived;
  }
  
  if (options.favorite !== undefined) {
    query.is_favorite = options.favorite;
  }
  
  if (options.processing_status) {
    query.processing_status = options.processing_status;
  }
  
  return this.find(query).sort({ created_at: -1 });
};

FileSchema.statics.searchFiles = function(userId, searchTerm, options = {}) {
  const query = {
    user_id: userId,
    $text: { $search: searchTerm }
  };
  
  if (options.archived !== undefined) {
    query.is_archived = options.archived;
  }
  
  return this.find(query, { score: { $meta: 'textScore' } })
    .sort({ score: { $meta: 'textScore' } });
};

module.exports = mongoose.model('File', FileSchema);