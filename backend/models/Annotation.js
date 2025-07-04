module.exports = (sequelize, DataTypes) => {
  const Annotation = sequelize.define('Annotation', {
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
    file_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'files',
        key: 'id'
      }
    },
    page_number: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 1
      }
    },
    annotation_type: {
      type: DataTypes.ENUM('highlight', 'underline', 'stickynote', 'drawing', 'comment'),
      allowNull: false
    },
    coordinates: {
      type: DataTypes.JSONB,
      allowNull: true,
      // Structure: 
      // For text-based: [{ x, y, width, height }, ...]
      // For drawings: { path: [{ x, y }, ...] }
      // For points: { x, y }
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: true // Text content for comments/sticky notes
    },
    selected_text: {
      type: DataTypes.TEXT,
      allowNull: true // The actual text that was selected (for highlights/underlines)
    },
    color: {
      type: DataTypes.STRING,
      defaultValue: '#ffff00', // Default yellow for highlights
      validate: {
        is: /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/ // Hex color validation
      }
    },
    attachments: {
      type: DataTypes.JSONB,
      defaultValue: [],
      // Structure: [{ id, name, type, size, data, uploadedAt }, ...]
    },
    style_properties: {
      type: DataTypes.JSONB,
      defaultValue: {},
      // Additional styling: strokeWidth, opacity, font, etc.
    },
    ai_generated: {
      type: DataTypes.BOOLEAN,
      defaultValue: false // Whether this annotation was suggested by AI
    },
    ai_metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      // For AI annotations: { category, reason, importance, confidence }
    },
    is_text_selection: {
      type: DataTypes.BOOLEAN,
      defaultValue: false // Whether this annotation is based on text selection
    },
    coordinate_version: {
      type: DataTypes.STRING,
      defaultValue: '2.0' // Version for coordinate system compatibility
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {},
      // Additional metadata: scale, rotation, textLength, etc.
    },
    is_deleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false // Soft delete for data integrity
    },
    tags: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: [] // User-defined tags for annotation organization
    }
  }, {
    tableName: 'annotations',
    indexes: [
      {
        fields: ['user_id']
      },
      {
        fields: ['file_id']
      },
      {
        fields: ['page_number']
      },
      {
        fields: ['annotation_type']
      },
      {
        fields: ['ai_generated']
      },
      {
        fields: ['is_deleted']
      },
      {
        fields: ['file_id', 'page_number'] // Composite index for file page queries
      },
      {
        fields: ['user_id', 'file_id'] // Composite index for user file annotations
      },
      {
        fields: ['tags'],
        using: 'gin' // GIN index for array fields
      }
    ]
  });

  // Instance methods
  Annotation.prototype.addAttachment = async function(attachment) {
    this.attachments = [...this.attachments, {
      id: attachment.id || Date.now() + Math.random(),
      name: attachment.name,
      type: attachment.type,
      size: attachment.size,
      data: attachment.data,
      uploadedAt: new Date().toISOString()
    }];
    await this.save();
  };

  Annotation.prototype.removeAttachment = async function(attachmentId) {
    this.attachments = this.attachments.filter(att => att.id !== attachmentId);
    await this.save();
  };

  Annotation.prototype.updateContent = async function(newContent) {
    this.content = newContent;
    this.updated_at = new Date();
    await this.save();
  };

  Annotation.prototype.addTag = async function(tag) {
    if (!this.tags.includes(tag)) {
      this.tags = [...this.tags, tag];
      await this.save();
    }
  };

  Annotation.prototype.removeTag = async function(tag) {
    this.tags = this.tags.filter(t => t !== tag);
    await this.save();
  };

  Annotation.prototype.softDelete = async function() {
    this.is_deleted = true;
    await this.save();
  };

  Annotation.prototype.restore = async function() {
    this.is_deleted = false;
    await this.save();
  };

  Annotation.prototype.getPublicData = function() {
    return {
      id: this.id,
      page_number: this.page_number,
      annotation_type: this.annotation_type,
      coordinates: this.coordinates,
      content: this.content,
      selected_text: this.selected_text,
      color: this.color,
      attachments: this.attachments,
      style_properties: this.style_properties,
      ai_generated: this.ai_generated,
      ai_metadata: this.ai_metadata,
      is_text_selection: this.is_text_selection,
      coordinate_version: this.coordinate_version,
      metadata: this.metadata,
      tags: this.tags,
      created_at: this.created_at,
      updated_at: this.updated_at
    };
  };

  // Class methods
  Annotation.findByFilePage = async function(fileId, pageNumber) {
    return await this.findAll({
      where: {
        file_id: fileId,
        page_number: pageNumber,
        is_deleted: false
      },
      order: [['created_at', 'ASC']]
    });
  };

  Annotation.findByFileAndUser = async function(fileId, userId) {
    return await this.findAll({
      where: {
        file_id: fileId,
        user_id: userId,
        is_deleted: false
      },
      order: [['page_number', 'ASC'], ['created_at', 'ASC']]
    });
  };

  Annotation.findAIAnnotations = async function(fileId, userId) {
    return await this.findAll({
      where: {
        file_id: fileId,
        user_id: userId,
        ai_generated: true,
        is_deleted: false
      },
      order: [['page_number', 'ASC'], ['created_at', 'ASC']]
    });
  };

  return Annotation;
};