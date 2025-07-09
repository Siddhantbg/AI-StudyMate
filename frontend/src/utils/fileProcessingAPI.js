// Frontend API utilities for file processing status checking and polling

class FileProcessingAPI {
  constructor() {
    this.API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
    this.pollingIntervals = new Map(); // Track active polling intervals
    this.pollingCallbacks = new Map(); // Track polling callbacks
  }

  /**
   * Make authenticated API request
   * @param {string} url - API endpoint URL
   * @param {Object} options - Fetch options
   * @returns {Promise<Response>} Fetch response
   */
  async makeAuthenticatedRequest(url, options = {}) {
    const token = localStorage.getItem('access_token');
    
    if (!token) {
      throw new Error('No authentication token available');
    }

    const requestOptions = {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    };

    const response = await fetch(url, requestOptions);
    
    if (response.status === 401) {
      // Token might be expired, let the auth context handle it
      throw new Error('Authentication failed');
    }
    
    return response;
  }

  /**
   * Get processing status for a specific file
   * @param {string} fileId - UUID of the file
   * @returns {Promise<Object>} File processing status
   */
  async getFileProcessingStatus(fileId) {
    if (!fileId) {
      throw new Error('File ID is required');
    }

    try {
      const response = await this.makeAuthenticatedRequest(
        `${this.API_BASE_URL}/file-processing/status/${fileId}`
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to get processing status');
      }

      return data.data;

    } catch (error) {
      console.error('Failed to get file processing status:', error);
      throw error;
    }
  }

  /**
   * Trigger manual processing for a file
   * @param {string} fileId - UUID of the file
   * @param {string} priority - Processing priority (low, normal, high, critical)
   * @returns {Promise<Object>} Processing job information
   */
  async triggerFileProcessing(fileId, priority = 'normal') {
    if (!fileId) {
      throw new Error('File ID is required');
    }

    try {
      const response = await this.makeAuthenticatedRequest(
        `${this.API_BASE_URL}/file-processing/trigger/${fileId}`,
        {
          method: 'POST',
          body: JSON.stringify({ priority })
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to trigger processing');
      }

      return data.data;

    } catch (error) {
      console.error('Failed to trigger file processing:', error);
      throw error;
    }
  }

  /**
   * Retry processing for a failed file
   * @param {string} fileId - UUID of the file
   * @returns {Promise<Object>} Retry job information
   */
  async retryFileProcessing(fileId) {
    if (!fileId) {
      throw new Error('File ID is required');
    }

    try {
      const response = await this.makeAuthenticatedRequest(
        `${this.API_BASE_URL}/file-processing/retry/${fileId}`,
        {
          method: 'POST'
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to retry processing');
      }

      return data.data;

    } catch (error) {
      console.error('Failed to retry file processing:', error);
      throw error;
    }
  }

  /**
   * Get queue statistics
   * @returns {Promise<Object>} Queue and processing statistics
   */
  async getQueueStats() {
    try {
      const response = await this.makeAuthenticatedRequest(
        `${this.API_BASE_URL}/file-processing/queue/stats`
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to get queue stats');
      }

      return data.data;

    } catch (error) {
      console.error('Failed to get queue statistics:', error);
      throw error;
    }
  }

  /**
   * Start polling for file processing status
   * @param {string} fileId - UUID of the file
   * @param {Function} onStatusUpdate - Callback function for status updates
   * @param {Object} options - Polling options
   * @returns {string} Polling ID for stopping polling
   */
  startPolling(fileId, onStatusUpdate, options = {}) {
    const {
      interval = 2000,        // Poll every 2 seconds
      maxDuration = 300000,   // Stop polling after 5 minutes
      onError = console.error,
      onComplete = null,
      onFailed = null
    } = options;

    if (!fileId || typeof onStatusUpdate !== 'function') {
      throw new Error('File ID and status update callback are required');
    }

    const pollingId = `${fileId}_${Date.now()}`;
    let pollCount = 0;
    const maxPolls = Math.floor(maxDuration / interval);

    console.log(`Starting polling for file ${fileId} (ID: ${pollingId})`);

    const pollFunction = async () => {
      try {
        pollCount++;
        
        // Stop polling if max duration reached
        if (pollCount > maxPolls) {
          console.warn(`Polling timeout for file ${fileId}`);
          this.stopPolling(pollingId);
          onError(new Error('Polling timeout - file processing may have stalled'));
          return;
        }

        const statusData = await this.getFileProcessingStatus(fileId);
        const processingStatus = statusData.file.processing_status;

        // Call status update callback
        onStatusUpdate(statusData, pollCount);

        // Check if processing is complete
        if (processingStatus === 'completed') {
          console.log(`File processing completed for ${fileId}`);
          this.stopPolling(pollingId);
          if (onComplete) {
            onComplete(statusData);
          }
          return;
        }

        // Check if processing failed
        if (processingStatus === 'failed') {
          console.error(`File processing failed for ${fileId}`);
          this.stopPolling(pollingId);
          if (onFailed) {
            onFailed(statusData);
          }
          return;
        }

        // Continue polling for pending/processing status
        console.log(`Polling ${fileId}: ${processingStatus} (attempt ${pollCount}/${maxPolls})`);

      } catch (error) {
        console.error(`Polling error for file ${fileId}:`, error);
        
        // Stop polling on consecutive errors
        if (pollCount > 3) {
          this.stopPolling(pollingId);
          onError(error);
        }
      }
    };

    // Start immediate poll, then set interval
    pollFunction();
    const intervalId = setInterval(pollFunction, interval);
    
    // Store polling information
    this.pollingIntervals.set(pollingId, intervalId);
    this.pollingCallbacks.set(pollingId, { onStatusUpdate, onError, onComplete, onFailed });

    return pollingId;
  }

  /**
   * Stop polling for a specific file
   * @param {string} pollingId - Polling ID returned by startPolling
   */
  stopPolling(pollingId) {
    if (!pollingId) {
      return;
    }

    const intervalId = this.pollingIntervals.get(pollingId);
    if (intervalId) {
      clearInterval(intervalId);
      this.pollingIntervals.delete(pollingId);
      this.pollingCallbacks.delete(pollingId);
      console.log(`Stopped polling: ${pollingId}`);
    }
  }

  /**
   * Stop all active polling
   */
  stopAllPolling() {
    for (const [pollingId, intervalId] of this.pollingIntervals) {
      clearInterval(intervalId);
      console.log(`Stopped polling: ${pollingId}`);
    }
    
    this.pollingIntervals.clear();
    this.pollingCallbacks.clear();
  }

  /**
   * Get user files with processing status
   * @param {Object} options - Query options
   * @returns {Promise<Object>} User files with processing status
   */
  async getUserFiles(options = {}) {
    const {
      status = null,
      limit = 50,
      offset = 0
    } = options;

    try {
      const queryParams = new URLSearchParams({
        limit: limit.toString(),
        offset: offset.toString()
      });

      if (status) {
        queryParams.append('status', status);
      }

      const response = await this.makeAuthenticatedRequest(
        `${this.API_BASE_URL}/file-processing/user/files?${queryParams}`
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to get user files');
      }

      return data.data;

    } catch (error) {
      console.error('Failed to get user files:', error);
      throw error;
    }
  }

  /**
   * Format processing status for display
   * @param {string} status - Processing status
   * @returns {Object} Formatted status information
   */
  formatProcessingStatus(status) {
    const statusMap = {
      pending: {
        label: 'Pending',
        color: '#ffa500',
        icon: '⏳',
        description: 'File is queued for processing'
      },
      processing: {
        label: 'Processing',
        color: '#2196f3',
        icon: '⚙️',
        description: 'File is currently being processed'
      },
      completed: {
        label: 'Completed',
        color: '#4caf50',
        icon: '✅',
        description: 'File processing completed successfully'
      },
      failed: {
        label: 'Failed',
        color: '#f44336',
        icon: '❌',
        description: 'File processing failed'
      }
    };

    return statusMap[status] || {
      label: 'Unknown',
      color: '#9e9e9e',
      icon: '❓',
      description: 'Unknown processing status'
    };
  }

  /**
   * Cleanup on page unload
   */
  cleanup() {
    this.stopAllPolling();
  }
}

// Create singleton instance
const fileProcessingAPI = new FileProcessingAPI();

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  fileProcessingAPI.cleanup();
});

export default fileProcessingAPI;