module.exports = (sequelize, DataTypes) => {
  const File = sequelize.define('File', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    filename: {
      type: DataTypes.STRING,
      allowNull: false, // Server-generated filename
      unique: true
    },
    original_name: {
      type: DataTypes.STRING,
      allowNull: false // User's original filename
    },
    display_name: {
      type: DataTypes.STRING,
      allowNull: true // User can customize display name
    },
    file_size: {
      type: DataTypes.BIGINT,
      allowNull: false
    },
    file_path: {
      type: DataTypes.STRING,
      allowNull: false // Relative path from uploads directory
    },
    mime_type: {
      type: DataTypes.STRING,
      defaultValue: 'application/pdf'
    },
    file_hash: {
      type: DataTypes.STRING,
      allowNull: true // MD5 or SHA hash for duplicate detection
    },
    num_pages: {
      type: DataTypes.INTEGER,
      allowNull: true // Total number of pages in PDF
    },
    last_read_page: {
      type: DataTypes.INTEGER,
      defaultValue: 1 // Last page the user was reading
    },
    total_read_time: {
      type: DataTypes.INTEGER,
      defaultValue: 0 // Total time spent reading (in seconds)
    },
    upload_source: {
      type: DataTypes.ENUM('local', 'server', 'url'),
      defaultValue: 'server'
    },
    processing_status: {
      type: DataTypes.ENUM('pending', 'processing', 'completed', 'failed'),
      defaultValue: 'pending'
    },
    extracted_text: {
      type: DataTypes.TEXT,
      allowNull: true // Full text content extracted from PDF
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {
        author: null,
        title: null,
        subject: null,
        keywords: null,
        creation_date: null,
        modification_date: null,
        pdf_version: null
      }
    },
    ai_summary: {
      type: DataTypes.TEXT,
      allowNull: true // AI-generated summary of the document
    },
    tags: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: [] // User-defined tags for organization
    },
    is_favorite: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    is_archived: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    visibility: {
      type: DataTypes.ENUM('private', 'shared', 'public'),
      defaultValue: 'private'
    }
  }, {
    tableName: 'files',
    indexes: [
      {
        fields: ['user_id']
      },
      {
        fields: ['filename']
      },
      {
        fields: ['file_hash']
      },
      {
        fields: ['upload_source']
      },
      {
        fields: ['processing_status']
      },
      {
        fields: ['tags'],
        using: 'gin' // GIN index for array fields
      }
    ]
  });

  // Instance methods
  File.prototype.updateReadingProgress = async function(pageNumber, timeSpent = 0) {
    this.last_read_page = pageNumber;
    this.total_read_time += timeSpent;
    await this.save();
  };

  File.prototype.addReadingTime = async function(additionalTime) {
    this.total_read_time += additionalTime;
    await this.save();
  };

  File.prototype.getReadingStats = function() {
    return {
      total_pages: this.num_pages,
      last_read_page: this.last_read_page,
      total_read_time: this.total_read_time,
      completion_percentage: this.num_pages ? (this.last_read_page / this.num_pages * 100).toFixed(2) : 0,
      average_time_per_page: this.last_read_page > 0 ? (this.total_read_time / this.last_read_page).toFixed(2) : 0
    };
  };

  File.prototype.addTag = async function(tag) {
    if (!this.tags.includes(tag)) {
      this.tags = [...this.tags, tag];
      await this.save();
    }
  };

  File.prototype.removeTag = async function(tag) {
    this.tags = this.tags.filter(t => t !== tag);
    await this.save();
  };

  File.prototype.toggleFavorite = async function() {
    this.is_favorite = !this.is_favorite;
    await this.save();
  };

  File.prototype.updateProcessingStatus = async function(status, extractedText = null) {
    this.processing_status = status;
    if (extractedText) {
      this.extracted_text = extractedText;
    }
    await this.save();
  };

  File.prototype.getPublicData = function() {
    return {
      id: this.id,
      display_name: this.display_name || this.original_name,
      original_name: this.original_name,
      file_size: this.file_size,
      num_pages: this.num_pages,
      last_read_page: this.last_read_page,
      reading_stats: this.getReadingStats(),
      tags: this.tags,
      is_favorite: this.is_favorite,
      metadata: this.metadata,
      created_at: this.created_at,
      updated_at: this.updated_at
    };
  };

  return File;
};