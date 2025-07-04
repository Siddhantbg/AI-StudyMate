// FileManager.jsx - Component for managing saved PDF files
import React, { useState, useEffect } from 'react';
import { FileText, Trash2, Download, Calendar, HardDrive } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { 
  getSavedFiles, 
  loadFile, 
  deleteFile, 
  getAllFiles,
  loadServerFile,
  formatFileSize, 
  formatUploadDate 
} from '../utils/fileStorage';

const FileManager = ({ onFileLoad }) => {
  const [savedFiles, setSavedFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedFileId, setSelectedFileId] = useState(null);
  const { makeAuthenticatedRequest } = useAuth();
  const { showToast } = useToast();

  // Load saved files on component mount
  useEffect(() => {
    loadSavedFiles();
  }, []);

  const loadSavedFiles = async () => {
    try {
      setLoading(true);
      
      // Get files from database
      const response = await makeAuthenticatedRequest(`${import.meta.env.VITE_API_BASE_URL}/api/files`);
      
      if (response.ok) {
        const result = await response.json();
        const dbFiles = result.files || [];
        
        // Get local files as backup
        const localFiles = await getSavedFiles();
        
        // Combine and deduplicate files (prefer database version)
        const fileMap = new Map();
        
        // Add local files first
        localFiles.forEach(file => {
          fileMap.set(file.fileName, { ...file, source: 'local' });
        });
        
        // Add database files (overwriting local duplicates)
        dbFiles.forEach(file => {
          fileMap.set(file.fileName, {
            id: file.id,
            fileName: file.fileName,
            originalName: file.originalName,
            uploadedFileName: file.uploadedFileName,
            fileSize: file.fileSize,
            uploadDate: file.uploadDate,
            source: 'database',
            lastReadPage: file.lastReadPage,
            totalReadTime: file.totalReadTime,
            tags: file.tags,
            isFavorite: file.isFavorite
          });
        });
        
        const combinedFiles = Array.from(fileMap.values());
        setSavedFiles(combinedFiles);
        console.log('Loaded files:', combinedFiles.length, 'total files');
      } else {
        // Fallback to local files if database fails
        const localFiles = await getSavedFiles();
        setSavedFiles(localFiles.map(file => ({ ...file, source: 'local' })));
        showToast('Using local files - database unavailable', 'warning');
      }
    } catch (error) {
      console.error('Error loading saved files:', error);
      // Fallback to local files
      try {
        const localFiles = await getSavedFiles();
        setSavedFiles(localFiles.map(file => ({ ...file, source: 'local' })));
        showToast('Using local files only', 'warning');
      } catch (localError) {
        console.error('Error loading local files:', localError);
        showToast('Failed to load files', 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleFileLoad = async (fileId) => {
    try {
      setLoading(true);
      setSelectedFileId(fileId);
      
      // Find the file in our list to determine if it's local or database
      const fileInfo = savedFiles.find(f => f.id === fileId);
      
      let result;
      if (fileInfo && fileInfo.source === 'database') {
        // Load from server via authenticated request
        const response = await makeAuthenticatedRequest(
          `${import.meta.env.VITE_API_BASE_URL}/api/files/${fileInfo.uploadedFileName}`
        );
        
        if (response.ok) {
          const blob = await response.blob();
          const file = new File([blob], fileInfo.fileName, { type: 'application/pdf' });
          
          result = {
            file,
            uploadedFileName: fileInfo.uploadedFileName,
            metadata: {
              fileName: fileInfo.fileName,
              fileSize: fileInfo.fileSize,
              uploadDate: fileInfo.uploadDate,
              source: 'database'
            }
          };
        } else {
          throw new Error('Failed to load file from server');
        }
      } else {
        // Load from local storage
        result = await loadFile(fileId);
      }
      
      const { file, uploadedFileName, metadata } = result;
      
      // Call the callback to load the file in the main app
      if (onFileLoad) {
        onFileLoad(file, uploadedFileName, metadata);
      }
      
      console.log('File loaded successfully:', metadata.fileName);
      showToast(`Loaded ${metadata.fileName}`, 'success');
    } catch (error) {
      console.error('Error loading file:', error);
      showToast('Error loading file. Please try again.', 'error');
    } finally {
      setLoading(false);
      setSelectedFileId(null);
    }
  };

  const handleFileDelete = async (fileId, fileName) => {
    const fileInfo = savedFiles.find(f => f.id === fileId);
    
    if (fileInfo && fileInfo.source === 'server') {
      alert('Server files cannot be deleted from the client. Please delete them directly from the server uploads folder.');
      return;
    }
    
    if (window.confirm(`Are you sure you want to delete "${fileName}"?`)) {
      try {
        await deleteFile(fileId);
        await loadSavedFiles(); // Refresh the list
        console.log('File deleted successfully:', fileName);
      } catch (error) {
        console.error('Error deleting file:', error);
        alert('Error deleting file. Please try again.');
      }
    }
  };

  if (loading && savedFiles.length === 0) {
    return (
      <div className="file-manager-loading">
        <div className="loading-spinner"></div>
        <p>Loading saved files...</p>
      </div>
    );
  }

  if (savedFiles.length === 0) {
    return (
      <div className="file-manager-empty">
        <HardDrive size={48} className="empty-icon" />
        <h3>No saved files</h3>
        <p>Upload a PDF to see it appear here for quick access later.</p>
      </div>
    );
  }

  return (
    <div className="file-manager">
      <div className="file-manager-header">
        <h3>
          <HardDrive size={20} />
          Recent Files ({savedFiles.length})
        </h3>
        <button 
          onClick={loadSavedFiles}
          className="refresh-btn"
          title="Refresh file list"
        >
          ↻
        </button>
      </div>
      
      <div className="file-list">
        {savedFiles.map(file => (
          <div 
            key={file.id} 
            className={`file-item ${selectedFileId === file.id ? 'loading' : ''}`}
            onClick={() => handleFileLoad(file.id)}
            style={{ cursor: 'pointer' }}
            title="Click to open this PDF"
          >
            <div className="file-icon">
              <FileText size={24} />
            </div>
            
            <div className="file-info">
              <div className="file-name" title={file.fileName}>
                {file.fileName}
              </div>
              <div className="file-meta">
                <span className="file-size">{formatFileSize(file.fileSize)}</span>
                <span className="file-date">
                  <Calendar size={12} />
                  {formatUploadDate(file.uploadDate)}
                </span>
                {file.source === 'database' && (
                  <span className="file-source server" title="Stored in database">
                    🗄️ Database
                  </span>
                )}
                {file.source === 'local' && (
                  <span className="file-source local" title="Stored locally">
                    💾 Local
                  </span>
                )}
              </div>
            </div>
            
            <div className="file-actions">
              <button
                onClick={(e) => {
                  e.stopPropagation(); // Prevent file item click
                  handleFileLoad(file.id);
                }}
                className="load-btn"
                title="Load this file"
                disabled={loading}
              >
                {selectedFileId === file.id ? (
                  <div className="mini-spinner"></div>
                ) : (
                  <Download size={16} />
                )}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation(); // Prevent file item click
                  handleFileDelete(file.id, file.fileName);
                }}
                className="delete-btn"
                title="Delete this file"
                disabled={loading}
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default FileManager;