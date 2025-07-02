import React, { useState, useEffect } from 'react';
import { Upload, FileText, Brain, HelpCircle, Focus, TreePine } from 'lucide-react';
import PDFViewer from './components/PDFViewer';
import Sidebar from './components/Sidebar';
import FocusMode from './components/FocusMode';
import FileManager from './components/FileManager';
import { saveFile } from './utils/fileStorage';
import './styles/forest-theme.css';
import './styles/pdf-setup.css';

function App() {
  const [pdfFile, setPdfFile] = useState(null);
  const [uploadedFileName, setUploadedFileName] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [userInactive, setUserInactive] = useState(false);
  const [lastActivity, setLastActivity] = useState(Date.now());

  // Focus mode activity tracking
  useEffect(() => {
    if (!focusMode) return;

    let inactivityTimer;
    
    const resetInactivityTimer = () => {
      setLastActivity(Date.now());
      setUserInactive(false);
      clearTimeout(inactivityTimer);
      
      inactivityTimer = setTimeout(() => {
        setUserInactive(true);
      }, 30000); // 30 seconds of inactivity
    };

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    events.forEach(event => {
      document.addEventListener(event, resetInactivityTimer, true);
    });

    resetInactivityTimer();

    return () => {
      clearTimeout(inactivityTimer);
      events.forEach(event => {
        document.removeEventListener(event, resetInactivityTimer, true);
      });
    };
  }, [focusMode]);

const handleFileUpload = async (file) => {
  if (!file || file.type !== 'application/pdf') {
    alert('Please upload a valid PDF file');
    return;
  }

  if (file.size > 100 * 1024 * 1024) { // 100MB limit
    alert('File size must be less than 100MB');
    return;
  }

  setIsUploading(true);
  
  try {
    const formData = new FormData();
    formData.append('pdf', file);

    console.log('Uploading file:', file.name, 'Size:', file.size);

    const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/upload`, {
      method: 'POST',
      body: formData,
    });

    const result = await response.json();
    console.log('Upload response:', result);

    if (result.success) {
      // CRITICAL FIX: Use the original File object, not URL
      setPdfFile(file); // Use original file object for react-pdf
      setUploadedFileName(result.file.filename);
      setCurrentPage(1);
      
      // Save file to IndexedDB for future access
      try {
        await saveFile(file, result.file.filename);
        console.log('File saved to local storage for future access');
      } catch (storageError) {
        console.warn('Failed to save file to local storage:', storageError);
        // Don't fail the upload if storage fails
      }
      
      console.log('File set for PDF viewer:', file);
    } else {
      throw new Error(result.error || 'Upload failed');
    }
  } catch (error) {
    console.error('Upload error:', error);
    alert('Failed to upload PDF: ' + error.message);
  } finally {
    setIsUploading(false);
  }
};

// Handle loading a previously saved file
const handleFileLoad = (file, uploadedFileName, metadata) => {
  try {
    setPdfFile(file);
    setUploadedFileName(uploadedFileName);
    setCurrentPage(1);
    setTotalPages(0);
    console.log('Loaded saved file:', metadata.fileName);
  } catch (error) {
    console.error('Error loading saved file:', error);
    alert('Error loading file: ' + error.message);
  }
};

  const handleDrop = (e) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileUpload(files[0]);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const dismissInactivity = () => {
    setUserInactive(false);
    setLastActivity(Date.now());
  };

  return (
    <div className="app-container forest-theme">
      {/* Header */}
      <header className="app-header">
        <div className="header-content">
          <div className="logo-section">
            <TreePine className="logo-icon" size={32} />
            <h1 className="app-title">Forest PDF Viewer</h1>
          </div>
          
          <div className="header-actions">
            <button
              className={`focus-toggle ${focusMode ? 'active' : ''}`}
              onClick={() => setFocusMode(!focusMode)}
              title="Toggle Focus Mode"
            >
              <Focus size={20} />
              {focusMode ? 'Exit Focus' : 'Focus Mode'}
            </button>
            
            {pdfFile && (
              <div className="page-info">
                Page {currentPage} of {totalPages}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="main-content">
        {!pdfFile ? (
          /* Upload Section with File Manager */
          <div className="upload-section">
            <FileManager onFileLoad={handleFileLoad} />
            
            <div
              className="upload-area"
              onDrop={handleDrop}
              onDragOver={handleDragOver}
            >
            <div className="upload-content">
              <div className="upload-icon-container">
                <Upload size={64} className="upload-icon" />
                <FileText size={32} className="pdf-icon" />
              </div>
              
              <h2>Upload Your PDF</h2>
              <p>Drag and drop your PDF file here, or click to browse</p>
              <p className="upload-limit">Maximum file size: 100MB • Up to 500 pages</p>
              
              <input
                type="file"
                accept=".pdf"
                onChange={(e) => e.target.files[0] && handleFileUpload(e.target.files[0])}
                className="file-input"
                id="pdf-upload"
                disabled={isUploading}
              />
              
              <label 
                htmlFor="pdf-upload" 
                className={`upload-button ${isUploading ? 'uploading' : ''}`}
              >
                {isUploading ? 'Uploading...' : 'Choose PDF File'}
              </label>
            </div>
          </div>
          </div>
        ) : (
          /* PDF Viewer Layout */
          <div className="viewer-layout">
            <div className="pdf-container">
              <PDFViewer
                file={pdfFile}
                currentPage={currentPage}
                onPageChange={setCurrentPage}
                onLoadSuccess={(pdf) => setTotalPages(pdf.numPages)}
                uploadedFileName={uploadedFileName}
              />
            </div>
            
            <Sidebar
              uploadedFileName={uploadedFileName}
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
            />
          </div>
        )}
      </div>

      {/* Focus Mode Overlay */}
      {focusMode && userInactive && (
        <FocusMode onDismiss={dismissInactivity} />
      )}

      {/* Loading Overlay */}
      {isUploading && (
        <div className="loading-overlay">
          <div className="loading-content">
            <div className="loading-spinner"></div>
            <p>Uploading your PDF...</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;