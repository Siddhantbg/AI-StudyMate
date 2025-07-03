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
    }
  }, [isOpen, currentName]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!newName.trim()) {
      return;
    }

    // Add .pdf extension if not present
    const finalName = newName.trim().toLowerCase().endsWith('.pdf') 
      ? newName.trim() 
      : newName.trim() + '.pdf';

    setIsLoading(true);
    try {
      await onRename(finalName);
      onClose();
    } catch (error) {
      console.error('Rename error:', error);
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
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter new file name"
              disabled={isLoading}
              autoFocus
              maxLength={100}
            />
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