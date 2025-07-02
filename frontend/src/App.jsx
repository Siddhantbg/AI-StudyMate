import React, { useState, useEffect, useCallback } from 'react';
import { Upload, FileText, Brain, HelpCircle, Focus, TreePine, Clock } from 'lucide-react';
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
  const [pageTimer, setPageTimer] = useState(0);

  // Local storage helper functions for page timer (memoized to prevent re-creation)
  const getPageTimerKey = useCallback((filename, page) => {
    return `page-timer-${filename}-page-${page}`;
  }, []);

  const loadPageTimer = useCallback((filename, page) => {
    if (!filename || !page) return 0;
    const key = getPageTimerKey(filename, page);
    const saved = localStorage.getItem(key);
    return saved ? parseInt(saved, 10) : 0;
  }, [getPageTimerKey]);

  const savePageTimer = useCallback((filename, page, seconds) => {
    if (!filename || !page) return;
    const key = getPageTimerKey(filename, page);
    localStorage.setItem(key, seconds.toString());
  }, [getPageTimerKey]);

  // Calculate total time spent on entire PDF
  const calculateTotalPdfTime = useCallback((filename) => {
    if (!filename) return 0;
    let totalSeconds = 0;
    const prefix = `page-timer-${filename}-page-`;
    
    // Iterate through all localStorage keys to find timer entries for this PDF
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        const savedTime = localStorage.getItem(key);
        if (savedTime) {
          totalSeconds += parseInt(savedTime, 10) || 0;
        }
      }
    }
    return totalSeconds;
  }, []);

  // Format timer display (30s, 1m 30s, 5m, etc.)
  const formatTimer = useCallback((seconds) => {
    if (seconds < 60) {
      return `${seconds}s`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const remainingMinutes = Math.floor((seconds % 3600) / 60);
      return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
    }
  }, []);

  // Last page tracking functions
  const getLastPageKey = useCallback((filename) => {
    return `last-page-${filename}`;
  }, []);

  const loadLastPage = useCallback((filename) => {
    if (!filename) return 1;
    const key = getLastPageKey(filename);
    const saved = localStorage.getItem(key);
    return saved ? parseInt(saved, 10) : 1;
  }, [getLastPageKey]);

  const saveLastPage = useCallback((filename, page) => {
    if (!filename || !page) return;
    const key = getLastPageKey(filename);
    localStorage.setItem(key, page.toString());
  }, [getLastPageKey]);

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
      }, 60000); // 60 seconds of inactivity
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

  // Page timer management
  useEffect(() => {
    if (!pdfFile || !uploadedFileName || !currentPage) {
      setPageTimer(0);
      return;
    }

    // Load existing timer for this page
    const existingTime = loadPageTimer(uploadedFileName, currentPage);
    setPageTimer(existingTime);

    // Set up timer interval
    const timerInterval = setInterval(() => {
      setPageTimer(prevTimer => {
        const newTimer = prevTimer + 1;
        // Save to localStorage every 5 seconds to avoid too frequent writes
        if (newTimer % 5 === 0) {
          savePageTimer(uploadedFileName, currentPage, newTimer);
        }
        return newTimer;
      });
    }, 1000);

    // Cleanup function
    return () => {
      clearInterval(timerInterval);
      // Save final timer value when leaving page
      if (uploadedFileName && currentPage) {
        setPageTimer(currentTimer => {
          savePageTimer(uploadedFileName, currentPage, currentTimer);
          return currentTimer;
        });
      }
    };
  }, [pdfFile, uploadedFileName, currentPage, loadPageTimer, savePageTimer]); // Include memoized functions

  // Auto-save last page when page changes
  useEffect(() => {
    if (uploadedFileName && currentPage) {
      saveLastPage(uploadedFileName, currentPage);
    }
  }, [uploadedFileName, currentPage, saveLastPage]);

  // Save timer when component unmounts 
  useEffect(() => {
    return () => {
      if (uploadedFileName && currentPage && pageTimer > 0) {
        savePageTimer(uploadedFileName, currentPage, pageTimer);
      }
    };
  }, []); // Empty dependency array - only runs on mount/unmount

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
    
    // Load last page for this file (auto-resume functionality)
    const lastPage = loadLastPage(uploadedFileName);
    setCurrentPage(lastPage);
    setTotalPages(0);
    
    console.log(`Loaded saved file: ${metadata.fileName}, resuming at page ${lastPage}`);
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
            
            {pdfFile && (
              <div 
                className="page-timer" 
                title={`Current page: ${formatTimer(pageTimer)} | Total document: ${formatTimer(calculateTotalPdfTime(uploadedFileName) + pageTimer)}`}
              >
                <Clock size={18} />
                <span>{formatTimer(pageTimer)}</span>
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