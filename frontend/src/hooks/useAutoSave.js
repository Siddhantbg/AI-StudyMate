import { useEffect, useRef, useCallback } from 'react';
import { useSession } from '../contexts/SessionContext';
import { useToast } from '../contexts/ToastContext';
import sessionAPI from '../utils/sessionAPI';

const useAutoSave = (interval = 30000) => { // Default 30 seconds
  const { currentSession, autoSaveEnabled, hasPendingChanges } = useSession();
  const { showToast } = useToast();
  const intervalRef = useRef(null);
  const lastSaveRef = useRef(Date.now());

  const performAutoSave = useCallback(async () => {
    if (!currentSession || !autoSaveEnabled || !hasPendingChanges()) {
      return;
    }

    try {
      // Don't auto-save too frequently
      const timeSinceLastSave = Date.now() - lastSaveRef.current;
      if (timeSinceLastSave < 10000) { // Minimum 10 seconds between auto-saves
        return;
      }

      // Collect current data for auto-save
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

      // Perform auto-save through session API
      await sessionAPI.performAutoSave();
      
      lastSaveRef.current = Date.now();
      
      // Show subtle notification
      showToast('Auto-saved', 'success', 1500);
      
    } catch (error) {
      console.error('Auto-save failed:', error);
      // Don't show error toast for auto-save failures to avoid spam
    }
  }, [currentSession, autoSaveEnabled, hasPendingChanges, showToast]);

  // Set up auto-save interval
  useEffect(() => {
    if (autoSaveEnabled && currentSession) {
      intervalRef.current = setInterval(performAutoSave, interval);
      
      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
      };
    }
  }, [autoSaveEnabled, currentSession, interval, performAutoSave]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    performAutoSave,
    isAutoSaveEnabled: autoSaveEnabled,
    lastSaveTime: lastSaveRef.current
  };
};

export default useAutoSave;