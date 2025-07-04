import React, { useState, useEffect } from 'react';
import { X, FileText, Save } from 'lucide-react';

const RenameModal = ({ isOpen, onClose, currentName, onRename }) => {
  const [newName, setNewName] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen && currentName) {
      // Remove .pdf extension for editing
      const nameWithoutExtension = currentName.replace(/\.pdf$/i, '');
      setNewName(nameWithoutExtension);
      setError(''); // Clear any previous errors
    }
  }, [isOpen, currentName]);

  const [error, setError] = useState('');

  const validateFileName = (name) => {
    if (!name.trim()) {
      return 'File name cannot be empty';
    }
    
    if (name.trim().length < 1) {
      return 'File name must be at least 1 character';
    }
    
    if (name.trim().length > 100) {
      return 'File name must be less than 100 characters';
    }
    
    // Check for invalid characters
    const invalidChars = /[<>:"/\\|?*]/;
    if (invalidChars.test(name)) {
      return 'File name contains invalid characters: < > : " / \\ | ? *';
    }
    
    return '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const trimmedName = newName.trim();
    const validationError = validateFileName(trimmedName);
    
    if (validationError) {
      setError(validationError);
      return;
    }

    // Add .pdf extension if not present
    const finalName = trimmedName.toLowerCase().endsWith('.pdf') 
      ? trimmedName 
      : trimmedName + '.pdf';

    setIsLoading(true);
    setError('');
    
    try {
      await onRename(finalName);
      onClose();
    } catch (error) {
      console.error('Rename error:', error);
      setError(error.message || 'Failed to rename file');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="rename-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <FileText size={20} />
            <h3>Rename PDF</h3>
          </div>
          <button 
            className="modal-close"
            onClick={onClose}
            aria-label="Close modal"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-group">
            <label htmlFor="fileName">File Name</label>
            <input
              id="fileName"
              type="text"
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value);
                if (error) setError(''); // Clear error when user types
              }}
              onKeyDown={handleKeyDown}
              placeholder="Enter new file name"
              disabled={isLoading}
              autoFocus
              maxLength={100}
              className={error ? 'error' : ''}
            />
            {error && (
              <div className="form-error" style={{
                color: '#dc2626',
                fontSize: '0.8rem',
                marginTop: '0.25rem'
              }}>
                {error}
              </div>
            )}
            <small className="form-hint">
              .pdf extension will be added automatically
            </small>
          </div>

          <div className="modal-actions">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isLoading || !newName.trim()}
            >
              {isLoading ? (
                <>
                  <div className="loading-spinner-small"></div>
                  Renaming...
                </>
              ) : (
                <>
                  <Save size={16} />
                  Rename
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RenameModal;