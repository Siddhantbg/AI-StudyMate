import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import sessionAPI from '../utils/sessionAPI';

const SessionContext = createContext();

export const useSession = () => {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
};

export const SessionProvider = ({ children }) => {
  const [currentSession, setCurrentSession] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);
  const [pageTimer, setPageTimer] = useState(null);
  const [currentPageStartTime, setCurrentPageStartTime] = useState(null);
  const [focusStartTime, setFocusStartTime] = useState(null);
  const [distractionCount, setDistractionCount] = useState(0);
  
  const { user, token } = useAuth();
  const { showToast } = useToast();

  // Initialize session API with auth token
  useEffect(() => {
    if (token) {
      sessionAPI.setAuthToken(token);
    }
  }, [token]);

  // Load auto-save preference
  useEffect(() => {
    const saved = sessionAPI.getAutoSaveEnabled();
    setAutoSaveEnabled(saved);
  }, []);

  // Start or resume session for a file
  const startSession = useCallback(async (fileId) => {
    if (!user || !fileId) return null;

    setIsLoading(true);
    try {
      const session = await sessionAPI.getOrCreateSession(fileId);
      setCurrentSession(session);
      
      // Start page timer
      startPageTimer(session.current_page);
      
      return session;
    } catch (error) {
      console.error('Error starting session:', error);
      showToast('Failed to start session', 'error');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [user, showToast]);

  // Update current page
  const updateCurrentPage = useCallback(async (pageNumber) => {
    if (!currentSession) return;

    // Record time spent on previous page
    if (currentPageStartTime && pageTimer) {
      const timeSpent = Math.floor((Date.now() - currentPageStartTime) / 1000);
      sessionAPI.addPageTime(currentSession.current_page, timeSpent);
    }

    // Update page in session
    sessionAPI.updateCurrentPage(pageNumber);
    
    // Start timer for new page
    startPageTimer(pageNumber);
    
    // Update local session state
    setCurrentSession(prev => prev ? { ...prev, current_page: pageNumber } : null);
  }, [currentSession, currentPageStartTime, pageTimer]);

  // Start page timer
  const startPageTimer = useCallback((pageNumber) => {
    setCurrentPageStartTime(Date.now());
    
    // Clear existing timer
    if (pageTimer) {
      clearInterval(pageTimer);
    }
    
    // Start new timer that updates every 10 seconds
    const timer = setInterval(() => {
      if (currentPageStartTime) {
        const timeSpent = Math.floor((Date.now() - currentPageStartTime) / 1000);
        if (timeSpent >= 10) { // Only log significant time
          sessionAPI.addPageTime(pageNumber, 10);
          setCurrentPageStartTime(Date.now()); // Reset timer
        }
      }
    }, 10000); // Update every 10 seconds
    
    setPageTimer(timer);
  }, [pageTimer, currentPageStartTime]);

  // Update zoom level
  const updateZoomLevel = useCallback((zoomLevel) => {
    if (!currentSession) return;
    
    sessionAPI.updateZoomLevel(zoomLevel);
    setCurrentSession(prev => prev ? { ...prev, zoom_level: zoomLevel } : null);
  }, [currentSession]);

  // Update scroll position
  const updateScrollPosition = useCallback((x, y) => {
    if (!currentSession) return;
    
    sessionAPI.updateScrollPosition(x, y);
    setCurrentSession(prev => prev ? { ...prev, scroll_position: { x, y } } : null);
  }, [currentSession]);

  // Update reading progress
  const updateReadingProgress = useCallback((progress) => {
    if (!currentSession) return;
    
    sessionAPI.updateReadingProgress(progress);
    setCurrentSession(prev => prev ? { ...prev, reading_progress: progress } : null);
  }, [currentSession]);

  // Toggle bookmark
  const toggleBookmark = useCallback(async (pageNumber) => {
    if (!currentSession) return;
    
    try {
      const bookmarks = await sessionAPI.toggleBookmark(pageNumber);
      setCurrentSession(prev => prev ? { ...prev, bookmarked_pages: bookmarks } : null);
      return bookmarks;
    } catch (error) {
      console.error('Error toggling bookmark:', error);
      showToast('Failed to toggle bookmark', 'error');
    }
  }, [currentSession, showToast]);

  // Start focus session
  const startFocusSession = useCallback(() => {
    setFocusStartTime(Date.now());
    setDistractionCount(0);
  }, []);

  // End focus session
  const endFocusSession = useCallback(async () => {
    if (!focusStartTime || !currentSession) return;
    
    try {
      const endTime = new Date();
      await sessionAPI.recordFocusSession(new Date(focusStartTime), endTime, distractionCount);
      
      setFocusStartTime(null);
      setDistractionCount(0);
    } catch (error) {
      console.error('Error recording focus session:', error);
    }
  }, [focusStartTime, currentSession, distractionCount]);

  // Record distraction
  const recordDistraction = useCallback(() => {
    setDistractionCount(prev => prev + 1);
  }, []);

  // Record AI interaction
  const recordAIInteraction = useCallback(async (type) => {
    if (!currentSession) return;
    
    try {
      await sessionAPI.recordAIInteraction(type);
    } catch (error) {
      console.error('Error recording AI interaction:', error);
    }
  }, [currentSession]);

  // Update annotations
  const updateAnnotations = useCallback((annotations) => {
    if (!currentSession) return;
    
    sessionAPI.updateAnnotationSummary(annotations);
  }, [currentSession]);

  // Manual save
  const manualSave = useCallback(async (additionalData = {}) => {
    if (!currentSession) {
      throw new Error('No active session');
    }
    
    try {
      // Collect current annotations from localStorage
      const annotations = [];
      const files = JSON.parse(localStorage.getItem('pdfFiles') || '{}');
      
      Object.keys(files).forEach(fileKey => {
        Object.keys(files[fileKey]).forEach(pageKey => {
          if (pageKey.startsWith('page-')) {
            const pageAnnotations = files[fileKey][pageKey] || [];
            annotations.push(...pageAnnotations);
          }
        });
      });

      const result = await sessionAPI.performManualSave({ 
        annotations, 
        ...additionalData 
      });
      
      setCurrentSession(result.session);
      showToast('Session saved successfully', 'success');
      
      return result;
    } catch (error) {
      console.error('Manual save error:', error);
      if (error.message.includes('offline')) {
        showToast('Session queued for save when online', 'info');
      } else {
        showToast('Failed to save session', 'error');
      }
      throw error;
    }
  }, [currentSession, showToast]);

  // Set auto-save enabled
  const setAutoSave = useCallback(async (enabled) => {
    setAutoSaveEnabled(enabled);
    sessionAPI.setAutoSaveEnabled(enabled);
    
    if (currentSession) {
      try {
        await sessionAPI.updateSessionSettings({ auto_save_enabled: enabled });
      } catch (error) {
        console.error('Error updating auto-save setting:', error);
      }
    }
  }, [currentSession]);

  // End session
  const endSession = useCallback(() => {
    // Clear timers
    if (pageTimer) {
      clearInterval(pageTimer);
      setPageTimer(null);
    }
    
    // Record final page time
    if (currentPageStartTime && currentSession) {
      const timeSpent = Math.floor((Date.now() - currentPageStartTime) / 1000);
      sessionAPI.addPageTime(currentSession.current_page, timeSpent);
    }
    
    // End focus session if active
    if (focusStartTime) {
      endFocusSession();
    }
    
    // Clean up session API
    sessionAPI.cleanup();
    
    // Clear state
    setCurrentSession(null);
    setCurrentPageStartTime(null);
    setFocusStartTime(null);
    setDistractionCount(0);
  }, [pageTimer, currentPageStartTime, currentSession, focusStartTime, endFocusSession]);

  // Listen for page visibility changes to handle distractions
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && focusStartTime) {
        recordDistraction();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [focusStartTime, recordDistraction]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (pageTimer) {
        clearInterval(pageTimer);
      }
      sessionAPI.cleanup();
    };
  }, [pageTimer]);

  const value = {
    currentSession,
    isLoading,
    autoSaveEnabled,
    focusStartTime,
    distractionCount,
    
    // Actions
    startSession,
    endSession,
    updateCurrentPage,
    updateZoomLevel,
    updateScrollPosition,
    updateReadingProgress,
    toggleBookmark,
    updateAnnotations,
    manualSave,
    setAutoSave,
    
    // Focus tracking
    startFocusSession,
    endFocusSession,
    recordDistraction,
    
    // AI tracking
    recordAIInteraction,
    
    // Utilities
    hasPendingChanges: () => sessionAPI.hasPendingChanges(),
    getCompleteSessionData: () => sessionAPI.getCompleteSessionData()
  };

  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  );
};

export default SessionContext;