import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Upload, FileText, Brain, HelpCircle, Focus, TreePine, Clock, Edit } from 'lucide-react';
import PDFViewer from './components/PDFViewer';
import Sidebar from './components/Sidebar';
import FocusMode from './components/FocusMode';
import FileManager from './components/FileManager';
import ThemeToggle from './components/ThemeToggle';
import RenameModal from './components/RenameModal';
import ToastContainer from './components/Toast';
import UserMenu from './components/UserMenu';
import AuthPage from './components/Auth/AuthPage';
import { ThemeProvider } from './contexts/ThemeContext';
import { ToastProvider, useToast } from './contexts/ToastContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SessionProvider } from './contexts/SessionContext';
import { saveFile } from './utils/fileStorage';
// import { usePageTrackingAPI } from './utils/pageTrackingAPI'; // Disabled - endpoints removed
import { useHybridAPI } from './utils/hybridAPI';
import './styles/main-themes.css';
import './styles/pdf-setup.css';
import './styles/auth.css';
import './styles/user-menu.css';
import './styles/dashboard.css';
import './styles/connection-status.css';

function AppContent() {
  const { showToast } = useToast();
  const { isAuthenticated, loading, makeAuthenticatedRequest, user } = useAuth();
  // const pageTrackingAPI = usePageTrackingAPI(); // Disabled - endpoints removed
  const hybridAPI = useHybridAPI();
  const [pdfFile, setPdfFile] = useState(null);
  const [uploadedFileName, setUploadedFileName] = useState(null);
  const [fileId, setFileId] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [userInactive, setUserInactive] = useState(false);
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [pageTimer, setPageTimer] = useState(0);
  const [totalDocumentTime, setTotalDocumentTime] = useState(0);
  const [focusSessionStart, setFocusSessionStart] = useState(null);
  const [isRestoringSession, setIsRestoringSession] = useState(false);
  
  // Use refs to prevent multiple timer intervals
  const timerIntervalRef = useRef(null);
  const saveTimeoutRef = useRef(null);

  // Enhanced page timer functions with hybrid API and localStorage fallback
  const loadPageTimer = useCallback(async (fileId, page, fileName = null) => {
    if (!page) return 0;
    
    // Try localStorage first for immediate response (user-specific key)
    let savedTime = 0;
    if (fileName && user?.id) {
      try {
        const timerKey = `pageTimer_${user.id}_${fileName}_${page}`;
        const storedTime = parseInt(localStorage.getItem(timerKey) || '0', 10);
        savedTime = storedTime;
      } catch (error) {
        console.warn('Failed to load timer from localStorage:', error);
      }
    }
    
    // Try database if fileId is available
    if (fileId) {
      try {
        // const trackingData = await hybridAPI.getPageTrackingData(fileId, page); // Disabled - endpoint removed
        // const dbTime = trackingData?.total_time_spent || 0;
        // savedTime = Math.max(savedTime, dbTime);
      } catch (error) {
        console.warn('Failed to load page timer from database:', error);
      }
    }
    
    return savedTime;
  }, []); // Removed hybridAPI dependency to prevent infinite re-renders

  const savePageTimer = useCallback(async (fileId, page, seconds, fileName = null) => {
    if (!page || seconds <= 0) return;
    
    // Always save to localStorage first for immediate persistence (user-specific key)
    if (fileName && user?.id) {
      try {
        const timerKey = `pageTimer_${user.id}_${fileName}_${page}`;
        const currentSaved = parseInt(localStorage.getItem(timerKey) || '0', 10);
        const newTotal = currentSaved + seconds;
        localStorage.setItem(timerKey, newTotal.toString());
      } catch (error) {
        console.warn('Failed to save timer to localStorage:', error);
      }
    }
    
    // Database page tracking temporarily disabled (endpoints removed)
    // TODO: Re-implement page tracking endpoints if needed
    // if (fileId) {
    //   try {
    //     await hybridAPI.trackTimeSpent(fileId, page, seconds);
    //   } catch (error) {
    //     console.error('Failed to save page timer to database:', error);
    //   }
    // }
  }, []); // Removed hybridAPI dependency to prevent infinite re-renders

  // Calculate total time spent on entire PDF
  const calculateTotalPdfTime = useCallback(async (fileId) => {
    if (!fileId) return 0;
    try {
      // const fileProgress = await hybridAPI.getFileProgress(fileId); // Disabled - endpoint removed
      return 0; // Disabled - endpoint removed
    } catch (error) {
      console.warn('Failed to calculate total PDF time:', error);
      return 0;
    }
  }, []); // Removed hybridAPI dependency to prevent infinite re-renders

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

  // Enhanced last page tracking functions with hybrid API
  const loadLastPage = useCallback(async (fileId) => {
    if (!fileId) return 1;
    try {
      // const fileProgress = await hybridAPI.getFileProgress(fileId); // Disabled - endpoint removed
      return 1; // Disabled - endpoint removed
    } catch (error) {
      console.warn('Failed to load last page:', error);
      return 1;
    }
  }, []); // Removed hybridAPI dependency to prevent infinite re-renders

  const saveLastPage = useCallback(async (fileId, page) => {
    if (!fileId || !page) return;
    try {
      // Track the page visit (this updates last_read_page automatically)
      // await hybridAPI.trackPage(fileId, page, { reading_progress: 100 }); // Disabled - endpoint removed
    } catch (error) {
      console.error('Failed to save last page:', error);
      // Don't show toast to avoid spam
    }
  }, []); // Removed hybridAPI dependency to prevent infinite re-renders

  // Focus mode activity tracking
  useEffect(() => {
    if (!focusMode) {
      // End focus session if it was active
      if (focusSessionStart && fileId && currentPage) {
        const endTime = new Date().toISOString();
        // pageTrackingAPI.recordFocusSession(fileId, currentPage, focusSessionStart, endTime) // Disabled - endpoint removed
        //   .catch(error => console.error('Failed to record focus session:', error));
        setFocusSessionStart(null);
      }
      return;
    }

    // Start focus session
    const startTime = new Date().toISOString();
    setFocusSessionStart(startTime);

    let inactivityTimer;
    
    const resetInactivityTimer = () => {
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
  }, [focusMode, fileId, currentPage, focusSessionStart]); // Removed pageTrackingAPI

  // Page timer management with improved persistence and interval control
  useEffect(() => {
    // Clear any existing timer
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    if (!pdfFile || !currentPage) {
      setPageTimer(0);
      return;
    }

    // Load existing timer for this page
    loadPageTimer(fileId, currentPage, uploadedFileName).then(existingTime => {
      setPageTimer(existingTime);
      
      // Only start timer after loading existing time
      timerIntervalRef.current = setInterval(() => {
        setPageTimer(prevTimer => {
          const newTimer = prevTimer + 1;
          
          // Save to database/localStorage every 10 seconds for better persistence
          if (newTimer % 10 === 0) {
            // Use timeout to avoid blocking the timer
            if (saveTimeoutRef.current) {
              clearTimeout(saveTimeoutRef.current);
            }
            saveTimeoutRef.current = setTimeout(() => {
              savePageTimer(fileId, currentPage, 10, uploadedFileName);
            }, 0);
          }
          
          return newTimer;
        });
      }, 1000);
    });

    // Cleanup function
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      
      // Save final timer value when leaving page
      if (currentPage && pageTimer > 0) {
        const remainingTime = pageTimer % 10;
        if (remainingTime > 0) {
          savePageTimer(fileId, currentPage, remainingTime, uploadedFileName);
        }
      }
    };
  }, [pdfFile, fileId, currentPage, uploadedFileName]); // Removed loadPageTimer and savePageTimer from deps to prevent recreation

  // Auto-save last page when page changes
  useEffect(() => {
    if (currentPage && uploadedFileName && user?.id) {
      // Save to localStorage immediately for fast access (user-specific key)
      try {
        const savedPageKey = `lastPage_${user.id}_${uploadedFileName}`;
        localStorage.setItem(savedPageKey, currentPage.toString());
      } catch (error) {
        console.warn('Failed to save current page to localStorage:', error);
      }
      
      // Also save to database if available
      if (fileId) {
        saveLastPage(fileId, currentPage);
      }
    }
  }, [fileId, currentPage, uploadedFileName, user?.id, saveLastPage]);

  // Update total document time periodically
  useEffect(() => {
    if (!fileId) {
      setTotalDocumentTime(0);
      return;
    }

    const updateTotalTime = async () => {
      try {
        const totalTime = await calculateTotalPdfTime(fileId);
        setTotalDocumentTime(totalTime);
      } catch (error) {
        console.warn('Failed to update total document time:', error);
      }
    };

    updateTotalTime();
    
    // Update every 30 seconds
    const interval = setInterval(updateTotalTime, 30000);
    
    return () => clearInterval(interval);
  }, [fileId, calculateTotalPdfTime]);

  // Save timer when component unmounts or before page unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (uploadedFileName && currentPage && pageTimer > 0 && user?.id) {
        // Use synchronous localStorage save for page unload (user-specific key)
        try {
          const timerKey = `pageTimer_${user.id}_${uploadedFileName}_${currentPage}`;
          const currentSaved = parseInt(localStorage.getItem(timerKey) || '0', 10);
          const newTotal = currentSaved + (pageTimer % 10); // Save any remaining time
          localStorage.setItem(timerKey, newTotal.toString());
        } catch (error) {
          console.warn('Failed to save timer on page unload:', error);
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      // Also save on component unmount
      if (uploadedFileName && currentPage && pageTimer > 0) {
        savePageTimer(fileId, currentPage, pageTimer % 5, uploadedFileName);
      }
    };
  }, [fileId, uploadedFileName, currentPage, pageTimer, user?.id, savePageTimer]);

const handleFileUpload = async (file) => {
  console.log('🚀 Starting file upload process...');
  
  if (!file || file.type !== 'application/pdf') {
    showToast('Please upload a valid PDF file', 'error');
    return;
  }

  if (file.size > 100 * 1024 * 1024) { // 100MB limit
    showToast('File size must be less than 100MB', 'error');
    return;
  }

  // Check authentication
  if (!user) {
    showToast('Please log in to upload files', 'error');
    return;
  }

  setIsUploading(true);
  console.log('📤 Upload started for:', file.name, 'Size:', file.size);
  
  try {
    const formData = new FormData();
    formData.append('pdf', file);

    console.log('📡 Making upload request...');
    console.log('🌐 API URL:', `${import.meta.env.VITE_API_BASE_URL}/api/upload`);
    console.log('👤 User authenticated:', !!user);

    const response = await makeAuthenticatedRequest(`${import.meta.env.VITE_API_BASE_URL}/api/upload`, {
      method: 'POST',
      body: formData,
    });

    console.log('📨 Response received, status:', response.status);
    console.log('📄 Response ok:', response.ok);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Server response not ok:', errorText);
      throw new Error(`Server error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log('✅ Upload response parsed:', result);

    if (result.success) {
      console.log('🎉 Upload successful!');
      
      // CRITICAL FIX: Use the original File object, not URL
      setPdfFile(file); // Use original file object for react-pdf
      setUploadedFileName(result.file.filename);
      setFileId(result.file.id); // Store file ID for database operations
      setCurrentPage(1);
      
      // Save file to IndexedDB for future access
      try {
        console.log('💾 Saving to local storage...');
        await saveFile(file, result.file.filename);
        console.log('✅ File saved to local storage');
        
        // Initialize current page in localStorage (user-specific key)
        if (user?.id) {
          const savedPageKey = `lastPage_${user.id}_${result.file.filename}`;
          localStorage.setItem(savedPageKey, '1');
        }
        
        showToast('PDF uploaded and saved successfully!', 'success');
      } catch (storageError) {
        console.warn('⚠️ Failed to save file to local storage:', storageError);
        showToast('PDF uploaded but failed to save locally', 'warning');
      }
      
      console.log('🎯 File set for PDF viewer');
    } else {
      console.error('❌ Upload failed:', result.error);
      throw new Error(result.error || 'Upload failed');
    }
  } catch (error) {
    console.error('💥 Upload error:', error.message);
    console.error('Stack trace:', error.stack);
    
    let errorMessage = 'Failed to upload PDF';
    if (error.message.includes('timeout')) {
      errorMessage += ' - Request timed out. Please try again.';
    } else if (error.message.includes('Authentication failed')) {
      errorMessage += ' - Please log in again.';
    } else {
      errorMessage += ': ' + error.message;
    }
    
    showToast(errorMessage, 'error');
  } finally {
    console.log('🏁 Upload process finished');
    setIsUploading(false);
  }
};

// Handle loading a previously saved file
const handleFileLoad = async (file, uploadedFileName, metadata, fileId = null) => {
  try {
    setPdfFile(file);
    setUploadedFileName(uploadedFileName);
    
    // Try to load last page from localStorage first (user-specific key)
    let lastPage = 1;
    try {
      const userId = user?.id;
      if (userId) {
        const savedPageKey = `lastPage_${userId}_${uploadedFileName}`;
        const savedPage = parseInt(localStorage.getItem(savedPageKey), 10);
        if (savedPage && savedPage > 0) {
          lastPage = savedPage;
        }
      }
    } catch (error) {
      console.warn('Failed to load last page from localStorage:', error);
    }
    
    // Use provided fileId or get it from database
    if (fileId) {
      setFileId(fileId);
        
      // Load last page for this file (auto-resume functionality)
      // Try database first, then fallback to localStorage value
      try {
        const dbLastPage = await loadLastPage(fileId);
        if (dbLastPage && dbLastPage > 0) {
          lastPage = dbLastPage;
        }
      } catch (error) {
        console.warn('Failed to load last page from database, using localStorage:', error);
      }
      
      setCurrentPage(lastPage);
      setTotalPages(0);
      
      console.log(`Loaded saved file: ${metadata.fileName}, resuming at page ${lastPage}`);
      showToast(`Loaded ${metadata.fileName} - resumed at page ${lastPage}`, 'success');
    } else {
      // Fallback: get file ID from database (this should be rare now)
      const response = await makeAuthenticatedRequest(`${import.meta.env.VITE_API_BASE_URL}/api/files/list`);
      const result = await response.json();
      
      if (result.success) {
        const fileRecord = result.files.find(f => f.filename === uploadedFileName);
        if (fileRecord) {
          setFileId(fileRecord.id);
          
          // Load last page for this file (auto-resume functionality)
          try {
            const dbLastPage = await loadLastPage(fileRecord.id);
            if (dbLastPage && dbLastPage > 0) {
              lastPage = dbLastPage;
            }
          } catch (error) {
            console.warn('Failed to load last page from database, using localStorage:', error);
          }
          
          setCurrentPage(lastPage);
          setTotalPages(0);
          
          console.log(`Loaded saved file: ${metadata.fileName}, resuming at page ${lastPage}`);
          showToast(`Loaded ${metadata.fileName} - resumed at page ${lastPage}`, 'success');
        } else {
          throw new Error('File not found in database');
        }
      } else {
        throw new Error('Failed to get file list');
      }
    }
  } catch (error) {
    console.error('Error loading saved file:', error);
    showToast('Error loading file: ' + error.message, 'error');
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
  };

  // Handle logo click navigation back to upload
  const handleLogoClick = () => {
    if (pdfFile) {
      // Save current state before navigating away
      if (fileId && currentPage) {
        saveLastPage(fileId, currentPage);
        if (pageTimer > 0) {
          savePageTimer(fileId, currentPage, pageTimer % 10, uploadedFileName); // Save remaining time
        }
      }
      
      // End focus session if active
      if (focusSessionStart && fileId && currentPage) {
        const endTime = new Date().toISOString();
        // pageTrackingAPI.recordFocusSession(fileId, currentPage, focusSessionStart, endTime) // Disabled - endpoint removed
        //   .catch(error => console.error('Failed to record focus session:', error));
        setFocusSessionStart(null);
      }
      
      // Clear PDF state to return to upload
      setPdfFile(null);
      setUploadedFileName('');
      setFileId(null);
      setCurrentPage(1);
      setTotalPages(0);
      setPageTimer(0);
      setFocusMode(false);
      
      showToast('Returned to upload page', 'info', 2000);
    }
  };

  // Handle PDF rename
  const handleRename = async (newName) => {
    if (!fileId || !newName) {
      console.error('File ID and new name are required for rename');
      showToast('File ID and new name are required', 'error');
      return;
    }

    try {
      const response = await makeAuthenticatedRequest(`${import.meta.env.VITE_API_BASE_URL}/api/files/rename`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileId: fileId,
          newName: newName
        }),
      });

      const result = await response.json();

      if (result.success) {
        setUploadedFileName(newName);
        
        // File rename is handled by the database, no localStorage updates needed

        showToast(`PDF renamed to "${newName}"`, 'success');
      } else {
        throw new Error(result.error || 'Rename failed');
      }
    } catch (error) {
      console.error('Rename error:', error);
      showToast('Failed to rename PDF: ' + error.message, 'error');
      throw error; // Re-throw to handle in modal
    }
  };

  // Restore session on app startup
  useEffect(() => {
    const restoreSession = async () => {
      if (!isAuthenticated) return;
      
      try {
        setIsRestoringSession(true);
        
        // Check if there was a previous session
        const lastSession = localStorage.getItem('lastSession');
        if (lastSession) {
          const sessionData = JSON.parse(lastSession);
          console.log('Restoring previous session:', sessionData);
          
          // If we have session data, try to restore it
          if (sessionData.fileName && sessionData.page) {
            showToast(`Restoring session: ${sessionData.fileName} (page ${sessionData.page})`, 'info', 3000);
          }
        }
      } catch (error) {
        console.warn('Failed to restore session:', error);
      } finally {
        setIsRestoringSession(false);
      }
    };
    
    restoreSession();
  }, [isAuthenticated, showToast]);
  
  // Save session data when state changes
  useEffect(() => {
    if (uploadedFileName && currentPage) {
      try {
        const sessionData = {
          fileName: uploadedFileName,
          page: currentPage,
          fileId: fileId,
          timestamp: new Date().toISOString()
        };
        localStorage.setItem('lastSession', JSON.stringify(sessionData));
      } catch (error) {
        console.warn('Failed to save session data:', error);
      }
    }
  }, [uploadedFileName, currentPage, fileId]);

  // Show loading screen while checking authentication
  if (loading || isRestoringSession) {
    return (
      <ThemeProvider>
        <div className="loading-screen">
          <div className="loading-content">
            <TreePine size={48} className="logo-icon" />
            <div className="loading-spinner"></div>
            <p>{isRestoringSession ? 'Restoring your session...' : 'Loading Forest PDF Viewer...'}</p>
          </div>
        </div>
      </ThemeProvider>
    );
  }

  // Show authentication page if not logged in
  if (!isAuthenticated) {
    return (
      <ThemeProvider>
        <AuthPage />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <div className="app-container">
        {/* Header */}
        <header className="app-header">
          <div className="header-content">
            <div className="logo-section" onClick={handleLogoClick} style={{ cursor: pdfFile ? 'pointer' : 'default' }}>
              <TreePine className="logo-icon" size={32} />
              <h1 className="app-title">Forest PDF Viewer</h1>
            </div>
            
            <div className="header-actions">
              <ThemeToggle />
              
              {pdfFile && (
                <button
                  className="rename-button"
                  onClick={() => setIsRenameModalOpen(true)}
                  title="Rename PDF"
                >
                  <Edit size={20} />
                  Rename
                </button>
              )}
              
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
                title={`Current page: ${formatTimer(pageTimer)} | Total document: ${formatTimer(totalDocumentTime + pageTimer)}`}
              >
                <Clock size={18} />
                <span>{formatTimer(pageTimer)}</span>
              </div>
            )}

            <UserMenu />
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
                  fileId={fileId}
                />
              </div>
              
              <Sidebar
                uploadedFileName={uploadedFileName}
                fileId={fileId}
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
              />
            </div>
          )}
        </div>

        {/* Rename Modal */}
        <RenameModal
          isOpen={isRenameModalOpen}
          onClose={() => setIsRenameModalOpen(false)}
          currentName={uploadedFileName}
          onRename={handleRename}
        />

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
    </ThemeProvider>
  );
}

function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <SessionProvider>
          <AppContent />
          <ToastContainer />
        </SessionProvider>
      </AuthProvider>
    </ToastProvider>
  );
}

export default App;