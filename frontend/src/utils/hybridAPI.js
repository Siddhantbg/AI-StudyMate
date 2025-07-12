// Hybrid API utility that works with both server and offline storage
import React, { useMemo } from 'react';
import offlineStorage from './offlineStorage';
import { useConnectionStatus } from './connectionStatus';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

class HybridAPI {
  constructor() {
    this.offlineStorage = offlineStorage;
    this.retryQueue = new Map();
    this.maxRetries = 3;
  }

  // Enhanced annotation API with offline fallback
  async saveAnnotation(annotation) {
    const { canSaveToServer } = this.getConnectionStatus();
    
    if (canSaveToServer) {
      try {
        // Try server first
        const response = await this.makeAuthenticatedRequest('/api/annotations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(annotation)
        });
        
        const result = await response.json();
        if (result.success) {
          // Also save offline as backup
          await this.offlineStorage.saveAnnotation({
            ...annotation,
            dbId: result.data.id,
            synced: true
          });
          return { success: true, data: result.data, source: 'server' };
        }
      } catch (error) {
        console.warn('Server save failed, falling back to offline:', error);
      }
    }

    // Fallback to offline storage
    const result = await this.offlineStorage.saveAnnotation({
      ...annotation,
      synced: false
    });
    
    this.showToast('Saved offline - will sync when connection restored', 'info');
    return { ...result, source: 'offline' };
  }

  async loadAnnotations(fileId, pageNumber = null) {
    const { canSaveToServer } = this.getConnectionStatus();
    
    if (canSaveToServer) {
      try {
        // Try server first
        const url = pageNumber 
          ? `/api/annotations/file/${fileId}/page/${pageNumber}`
          : `/api/annotations/file/${fileId}`;
          
        const response = await this.makeAuthenticatedRequest(url);
        const result = await response.json();
        
        if (result.success) {
          // Also save to offline storage for backup
          for (const annotation of result.data) {
            await this.offlineStorage.saveAnnotation({
              ...annotation,
              synced: true
            });
          }
          return result.data;
        }
      } catch (error) {
        console.warn('Server load failed, falling back to offline:', error);
      }
    }

    // Fallback to offline storage
    return await this.offlineStorage.loadAnnotations(fileId, pageNumber);
  }

  async deleteAnnotation(annotationId, fileId, pageNumber) {
    const { canSaveToServer } = this.getConnectionStatus();
    
    if (canSaveToServer) {
      try {
        // Try server first
        const response = await this.makeAuthenticatedRequest(`/api/annotations/${annotationId}`, {
          method: 'DELETE'
        });
        
        if (response.ok) {
          // Also delete from offline storage
          await this.offlineStorage.deleteAnnotation(annotationId, fileId, pageNumber);
          return { success: true, source: 'server' };
        }
      } catch (error) {
        console.warn('Server delete failed, marking for offline deletion:', error);
      }
    }

    // Fallback to offline storage
    await this.offlineStorage.deleteAnnotation(annotationId, fileId, pageNumber);
    this.showToast('Deleted offline - will sync when connection restored', 'info');
    return { success: true, source: 'offline' };
  }

  // Enhanced page tracking with offline support
  async trackTimeSpent(fileId, pageNumber, timeSpent) {
    // Page tracking endpoints disabled - save to offline storage only
    console.log('Page tracking disabled, saving offline:', { fileId, pageNumber, timeSpent });
    
    // Fallback to offline storage
    return await this.offlineStorage.savePageTracking(fileId, pageNumber, timeSpent, {
      synced: false
    });
  }

  async getPageTrackingData(fileId, pageNumber) {
    // Page tracking endpoints disabled - use offline storage only
    console.log('Page tracking data disabled, using offline:', { fileId, pageNumber });
    
    // Fallback to offline storage
    const offlineData = await this.offlineStorage.loadPageTracking(fileId, pageNumber);
    return {
      total_time_spent: offlineData.timeSpent || 0,
      ...offlineData
    };
  }

  async getFileProgress(fileId) {
    // Page tracking endpoints disabled - use offline storage only
    console.log('File progress tracking disabled, using offline:', { fileId });
    
    // Fallback to offline storage
    return await this.offlineStorage.loadFileProgress(fileId);
  }

  async trackPage(fileId, pageNumber, data = {}) {
    // Page tracking endpoints disabled - use offline storage only
    console.log('Page tracking disabled, saving offline:', { fileId, pageNumber, data });
    
    // Fallback to offline storage
    await this.offlineStorage.saveFileProgress(fileId, {
      lastReadPage: pageNumber,
      lastUpdated: new Date().toISOString(),
      synced: false
    });
    
    return { success: true, source: 'offline' };
  }

  // Auto-save functionality
  async enableAutoSave() {
    const interval = setInterval(async () => {
      try {
        // Auto-save any pending annotations
        await this.offlineStorage.syncPendingData();
      } catch (error) {
        console.warn('Auto-save failed:', error);
      }
    }, 30000); // Every 30 seconds

    return () => clearInterval(interval);
  }

  // Manual save all data
  async saveAllData() {
    const { canSaveToServer } = this.getConnectionStatus();
    
    if (!canSaveToServer) {
      this.showToast('Offline mode - data saved locally', 'info');
      return { success: true, source: 'offline' };
    }

    try {
      // Sync all pending offline data
      await this.offlineStorage.syncPendingData();
      this.showToast('All data saved successfully!', 'success');
      return { success: true, source: 'server' };
    } catch (error) {
      console.error('Failed to save all data:', error);
      this.showToast('Some data failed to save to server', 'warning');
      return { success: false, error: error.message };
    }
  }

  // Connection status helpers
  getConnectionStatus() {
    // This will be injected by the component using this API
    return { canSaveToServer: false };
  }

  makeAuthenticatedRequest() {
    // This will be injected by the component using this API
    throw new Error('makeAuthenticatedRequest not initialized');
  }

  showToast(message, type) {
    // This will be injected by the component using this API
    console.log(`Toast: ${type} - ${message}`);
  }
}

// React hook for hybrid API
export const useHybridAPI = () => {
  const { makeAuthenticatedRequest } = useAuth();
  const connectionStatus = useConnectionStatus();
  const { showToast } = useToast();
  
  return useMemo(() => {
    const api = new HybridAPI();
    
    // Inject dependencies
    api.getConnectionStatus = () => connectionStatus;
    api.makeAuthenticatedRequest = makeAuthenticatedRequest;
    api.showToast = showToast;

    return api;
  }, [makeAuthenticatedRequest, connectionStatus, showToast]);
};

export default HybridAPI;