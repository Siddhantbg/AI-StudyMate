// React hook for file processing status management

import { useState, useEffect, useRef, useCallback } from 'react';
import fileProcessingAPI from '../utils/fileProcessingAPI';
import { useToast } from '../contexts/ToastContext';

/**
 * Custom hook for managing file processing status and polling
 * @param {string} fileId - UUID of the file to monitor
 * @param {Object} options - Hook options
 * @returns {Object} Processing state and control functions
 */
export const useFileProcessing = (fileId, options = {}) => {
  const {
    autoStart = false,          // Automatically start polling
    pollInterval = 2000,        // Polling interval in ms
    maxPollDuration = 300000,   // Max polling duration in ms
    showToasts = true,          // Show toast notifications
    onComplete = null,          // Callback when processing completes
    onFailed = null,            // Callback when processing fails
    onStatusChange = null       // Callback for any status change
  } = options;

  const { showToast } = useToast();
  
  // State
  const [processingStatus, setProcessingStatus] = useState(null);
  const [isPolling, setIsPolling] = useState(false);
  const [processingData, setProcessingData] = useState(null);
  const [error, setError] = useState(null);
  const [pollCount, setPollCount] = useState(0);
  const [queuePosition, setQueuePosition] = useState(null);

  // Refs
  const pollingIdRef = useRef(null);
  const fileIdRef = useRef(fileId);

  // Update fileId ref when prop changes
  useEffect(() => {
    fileIdRef.current = fileId;
  }, [fileId]);

  /**
   * Get current processing status
   */
  const getStatus = useCallback(async () => {
    if (!fileId) return null;

    try {
      setError(null);
      const statusData = await fileProcessingAPI.getFileProcessingStatus(fileId);
      
      const status = statusData.file.processing_status;
      const oldStatus = processingStatus;
      
      setProcessingStatus(status);
      setProcessingData(statusData);
      
      if (statusData.job) {
        setQueuePosition(statusData.job.queue_position);
      }

      // Call status change callback
      if (onStatusChange && status !== oldStatus) {
        onStatusChange(status, statusData);
      }

      return statusData;

    } catch (err) {
      console.error('Failed to get processing status:', err);
      setError(err.message);
      
      if (showToasts) {
        showToast('Failed to check processing status', 'error');
      }
      
      return null;
    }
  }, [fileId, processingStatus, onStatusChange, showToasts, showToast]);

  /**
   * Start polling for processing status
   */
  const startPolling = useCallback(() => {
    if (!fileId || isPolling) return;

    console.log(`Starting processing status polling for file: ${fileId}`);
    setIsPolling(true);
    setPollCount(0);
    setError(null);

    const pollingId = fileProcessingAPI.startPolling(
      fileId,
      // onStatusUpdate callback
      (statusData, pollCountValue) => {
        const status = statusData.file.processing_status;
        
        setProcessingStatus(status);
        setProcessingData(statusData);
        setPollCount(pollCountValue);
        
        if (statusData.job) {
          setQueuePosition(statusData.job.queue_position);
        }

        // Call status change callback
        if (onStatusChange) {
          onStatusChange(status, statusData);
        }

        // Show status updates via toast (less frequent)
        if (showToasts && pollCountValue % 5 === 0) { // Every 5th poll
          const statusInfo = fileProcessingAPI.formatProcessingStatus(status);
          showToast(`${statusInfo.icon} File ${statusInfo.label.toLowerCase()}`, 'info', 2000);
        }
      },
      {
        interval: pollInterval,
        maxDuration: maxPollDuration,
        
        // onError callback
        onError: (err) => {
          console.error('Polling error:', err);
          setError(err.message);
          setIsPolling(false);
          
          if (showToasts) {
            showToast('Processing status check failed', 'error');
          }
        },
        
        // onComplete callback
        onComplete: (statusData) => {
          console.log('File processing completed:', fileId);
          setIsPolling(false);
          
          if (showToasts) {
            showToast('✅ File processing completed!', 'success', 5000);
          }
          
          if (onComplete) {
            onComplete(statusData);
          }
        },
        
        // onFailed callback
        onFailed: (statusData) => {
          console.error('File processing failed:', fileId);
          setIsPolling(false);
          
          const errorMessage = statusData.file.error_message || 'Unknown error';
          
          if (showToasts) {
            showToast(`❌ File processing failed: ${errorMessage}`, 'error', 8000);
          }
          
          if (onFailed) {
            onFailed(statusData, errorMessage);
          }
        }
      }
    );

    pollingIdRef.current = pollingId;
  }, [fileId, isPolling, pollInterval, maxPollDuration, showToasts, showToast, onStatusChange, onComplete, onFailed]);

  /**
   * Stop polling for processing status
   */
  const stopPolling = useCallback(() => {
    if (pollingIdRef.current) {
      fileProcessingAPI.stopPolling(pollingIdRef.current);
      pollingIdRef.current = null;
    }
    setIsPolling(false);
    setPollCount(0);
  }, []);

  /**
   * Trigger manual processing
   */
  const triggerProcessing = useCallback(async (priority = 'normal') => {
    if (!fileId) return null;

    try {
      setError(null);
      
      if (showToasts) {
        showToast('🚀 Triggering file processing...', 'info');
      }

      const jobData = await fileProcessingAPI.triggerFileProcessing(fileId, priority);
      
      // Start polling after triggering
      setTimeout(() => {
        if (!isPolling) {
          startPolling();
        }
      }, 1000);

      if (showToasts) {
        showToast('✅ Processing job queued successfully', 'success');
      }

      return jobData;

    } catch (err) {
      console.error('Failed to trigger processing:', err);
      setError(err.message);
      
      if (showToasts) {
        showToast(`Failed to trigger processing: ${err.message}`, 'error');
      }
      
      return null;
    }
  }, [fileId, showToasts, showToast, isPolling, startPolling]);

  /**
   * Retry failed processing
   */
  const retryProcessing = useCallback(async () => {
    if (!fileId) return null;

    try {
      setError(null);
      
      if (showToasts) {
        showToast('🔄 Retrying file processing...', 'info');
      }

      const jobData = await fileProcessingAPI.retryFileProcessing(fileId);
      
      // Start polling after retrying
      setTimeout(() => {
        if (!isPolling) {
          startPolling();
        }
      }, 1000);

      if (showToasts) {
        showToast('✅ Retry job queued successfully', 'success');
      }

      return jobData;

    } catch (err) {
      console.error('Failed to retry processing:', err);
      setError(err.message);
      
      if (showToasts) {
        showToast(`Failed to retry processing: ${err.message}`, 'error');
      }
      
      return null;
    }
  }, [fileId, showToasts, showToast, isPolling, startPolling]);

  /**
   * Format status for display
   */
  const getFormattedStatus = useCallback(() => {
    if (!processingStatus) return null;
    return fileProcessingAPI.formatProcessingStatus(processingStatus);
  }, [processingStatus]);

  // Auto-start polling if enabled and file is pending/processing
  useEffect(() => {
    if (autoStart && fileId && !isPolling) {
      getStatus().then((statusData) => {
        if (statusData) {
          const status = statusData.file.processing_status;
          if (status === 'pending' || status === 'processing') {
            startPolling();
          }
        }
      });
    }
  }, [autoStart, fileId, isPolling, getStatus, startPolling]);

  // Cleanup on unmount or fileId change
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  // Stop polling when file is no longer pending/processing
  useEffect(() => {
    if (processingStatus && !['pending', 'processing'].includes(processingStatus)) {
      stopPolling();
    }
  }, [processingStatus, stopPolling]);

  return {
    // Status data
    processingStatus,
    processingData,
    isPolling,
    pollCount,
    queuePosition,
    error,
    
    // Formatted status
    formattedStatus: getFormattedStatus(),
    
    // Control functions
    getStatus,
    startPolling,
    stopPolling,
    triggerProcessing,
    retryProcessing,
    
    // Helper functions
    isCompleted: processingStatus === 'completed',
    isFailed: processingStatus === 'failed',
    isPending: processingStatus === 'pending',
    isProcessing: processingStatus === 'processing',
    needsProcessing: ['pending', 'processing'].includes(processingStatus)
  };
};

export default useFileProcessing;