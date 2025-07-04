// Centralized storage manager for persistent data
// Handles annotations, timers, page state, and session management

class StorageManager {
  constructor() {
    this.namespace = 'ForestPDFViewer';
  }

  // Generate storage keys
  getKey(type, ...identifiers) {
    return `${this.namespace}_${type}_${identifiers.join('_')}`;
  }

  // === ANNOTATION STORAGE ===
  
  /**
   * Save annotations for a specific file and page
   */
  saveAnnotations(fileName, pageNumber, annotations) {
    try {
      const key = this.getKey('annotations', fileName);
      const existingData = this.getAnnotations(fileName);
      const pageKey = `page-${pageNumber}`;
      
      existingData[pageKey] = annotations;
      localStorage.setItem(key, JSON.stringify(existingData));
      
      console.log(`Saved ${annotations.length} annotations for ${fileName} page ${pageNumber}`);
      return true;
    } catch (error) {
      console.error('Failed to save annotations:', error);
      return false;
    }
  }

  /**
   * Get annotations for a specific file (all pages or specific page)
   */
  getAnnotations(fileName, pageNumber = null) {
    try {
      const key = this.getKey('annotations', fileName);
      const stored = localStorage.getItem(key);
      const data = stored ? JSON.parse(stored) : {};
      
      if (pageNumber !== null) {
        const pageKey = `page-${pageNumber}`;
        return data[pageKey] || [];
      }
      
      return data;
    } catch (error) {
      console.error('Failed to get annotations:', error);
      return pageNumber !== null ? [] : {};
    }
  }

  /**
   * Delete annotations for a specific page or entire file
   */
  deleteAnnotations(fileName, pageNumber = null) {
    try {
      const key = this.getKey('annotations', fileName);
      
      if (pageNumber === null) {
        // Delete all annotations for file
        localStorage.removeItem(key);
      } else {
        // Delete annotations for specific page
        const data = this.getAnnotations(fileName);
        const pageKey = `page-${pageNumber}`;
        delete data[pageKey];
        localStorage.setItem(key, JSON.stringify(data));
      }
      
      return true;
    } catch (error) {
      console.error('Failed to delete annotations:', error);
      return false;
    }
  }

  // === PAGE TIMER STORAGE ===
  
  /**
   * Save page timer data
   */
  savePageTimer(fileName, pageNumber, seconds) {
    try {
      const key = this.getKey('pageTimer', fileName, pageNumber);
      const currentTime = this.getPageTimer(fileName, pageNumber);
      const newTotal = currentTime + seconds;
      
      localStorage.setItem(key, newTotal.toString());
      
      // Also update total document time
      this.updateTotalDocumentTime(fileName, seconds);
      
      return true;
    } catch (error) {
      console.error('Failed to save page timer:', error);
      return false;
    }
  }

  /**
   * Get page timer data
   */
  getPageTimer(fileName, pageNumber) {
    try {
      const key = this.getKey('pageTimer', fileName, pageNumber);
      const stored = localStorage.getItem(key);
      return stored ? parseInt(stored, 10) : 0;
    } catch (error) {
      console.error('Failed to get page timer:', error);
      return 0;
    }
  }

  /**
   * Update total document reading time
   */
  updateTotalDocumentTime(fileName, additionalSeconds) {
    try {
      const key = this.getKey('totalTime', fileName);
      const currentTotal = this.getTotalDocumentTime(fileName);
      const newTotal = currentTotal + additionalSeconds;
      
      localStorage.setItem(key, newTotal.toString());
      return true;
    } catch (error) {
      console.error('Failed to update total document time:', error);
      return false;
    }
  }

  /**
   * Get total document reading time
   */
  getTotalDocumentTime(fileName) {
    try {
      const key = this.getKey('totalTime', fileName);
      const stored = localStorage.getItem(key);
      return stored ? parseInt(stored, 10) : 0;
    } catch (error) {
      console.error('Failed to get total document time:', error);
      return 0;
    }
  }

  // === PAGE STATE STORAGE ===
  
  /**
   * Save current page for a file
   */
  saveCurrentPage(fileName, pageNumber) {
    try {
      const key = this.getKey('lastPage', fileName);
      localStorage.setItem(key, pageNumber.toString());
      return true;
    } catch (error) {
      console.error('Failed to save current page:', error);
      return false;
    }
  }

  /**
   * Get last saved page for a file
   */
  getCurrentPage(fileName) {
    try {
      const key = this.getKey('lastPage', fileName);
      const stored = localStorage.getItem(key);
      return stored ? parseInt(stored, 10) : 1;
    } catch (error) {
      console.error('Failed to get current page:', error);
      return 1;
    }
  }

  // === SESSION MANAGEMENT ===
  
  /**
   * Save session data
   */
  saveSession(sessionData) {
    try {
      const key = this.getKey('session');
      const dataWithTimestamp = {
        ...sessionData,
        timestamp: new Date().toISOString()
      };
      localStorage.setItem(key, JSON.stringify(dataWithTimestamp));
      return true;
    } catch (error) {
      console.error('Failed to save session:', error);
      return false;
    }
  }

  /**
   * Get session data
   */
  getSession() {
    try {
      const key = this.getKey('session');
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      console.error('Failed to get session:', error);
      return null;
    }
  }

  /**
   * Clear session data
   */
  clearSession() {
    try {
      const key = this.getKey('session');
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      console.error('Failed to clear session:', error);
      return false;
    }
  }

  // === FILE METADATA STORAGE ===
  
  /**
   * Save file metadata
   */
  saveFileMetadata(fileName, metadata) {
    try {
      const key = this.getKey('metadata', fileName);
      const dataWithTimestamp = {
        ...metadata,
        lastAccessed: new Date().toISOString()
      };
      localStorage.setItem(key, JSON.stringify(dataWithTimestamp));
      return true;
    } catch (error) {
      console.error('Failed to save file metadata:', error);
      return false;
    }
  }

  /**
   * Get file metadata
   */
  getFileMetadata(fileName) {
    try {
      const key = this.getKey('metadata', fileName);
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      console.error('Failed to get file metadata:', error);
      return null;
    }
  }

  // === UTILITY FUNCTIONS ===
  
  /**
   * Get all stored files
   */
  getAllStoredFiles() {
    try {
      const files = [];
      const prefix = `${this.namespace}_metadata_`;
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(prefix)) {
          const fileName = key.substring(prefix.length);
          const metadata = this.getFileMetadata(fileName);
          if (metadata) {
            files.push({
              fileName,
              ...metadata,
              currentPage: this.getCurrentPage(fileName),
              totalTime: this.getTotalDocumentTime(fileName),
              annotationCount: Object.keys(this.getAnnotations(fileName)).length
            });
          }
        }
      }
      
      // Sort by last accessed
      return files.sort((a, b) => new Date(b.lastAccessed) - new Date(a.lastAccessed));
    } catch (error) {
      console.error('Failed to get all stored files:', error);
      return [];
    }
  }

  /**
   * Clean up old data (remove files not accessed in X days)
   */
  cleanup(daysOld = 30) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);
      
      const allFiles = this.getAllStoredFiles();
      let cleanedCount = 0;
      
      allFiles.forEach(file => {
        if (new Date(file.lastAccessed) < cutoffDate) {
          this.deleteAllFileData(file.fileName);
          cleanedCount++;
        }
      });
      
      console.log(`Cleaned up ${cleanedCount} old files`);
      return cleanedCount;
    } catch (error) {
      console.error('Failed to cleanup old data:', error);
      return 0;
    }
  }

  /**
   * Delete all data for a specific file
   */
  deleteAllFileData(fileName) {
    try {
      this.deleteAnnotations(fileName);
      localStorage.removeItem(this.getKey('metadata', fileName));
      localStorage.removeItem(this.getKey('totalTime', fileName));
      localStorage.removeItem(this.getKey('lastPage', fileName));
      
      // Delete all page timers for this file
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.getKey('pageTimer', fileName))) {
          localStorage.removeItem(key);
        }
      }
      
      return true;
    } catch (error) {
      console.error('Failed to delete all file data:', error);
      return false;
    }
  }

  /**
   * Get storage usage statistics
   */
  getStorageStats() {
    try {
      let totalSize = 0;
      let itemCount = 0;
      const breakdown = {
        annotations: 0,
        timers: 0,
        metadata: 0,
        session: 0,
        other: 0
      };
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.namespace)) {
          const value = localStorage.getItem(key);
          const size = key.length + (value ? value.length : 0);
          totalSize += size;
          itemCount++;
          
          if (key.includes('_annotations_')) {
            breakdown.annotations += size;
          } else if (key.includes('_pageTimer_') || key.includes('_totalTime_')) {
            breakdown.timers += size;
          } else if (key.includes('_metadata_')) {
            breakdown.metadata += size;
          } else if (key.includes('_session')) {
            breakdown.session += size;
          } else {
            breakdown.other += size;
          }
        }
      }
      
      return {
        totalSize,
        itemCount,
        breakdown,
        totalSizeKB: Math.round(totalSize / 1024 * 100) / 100,
        availableQuota: this.getAvailableQuota()
      };
    } catch (error) {
      console.error('Failed to get storage stats:', error);
      return null;
    }
  }

  /**
   * Get available localStorage quota
   */
  getAvailableQuota() {
    try {
      const test = 'test';
      let total = 0;
      
      // Estimate total quota by trying to fill it
      try {
        while (true) {
          localStorage.setItem(test + total, test);
          total++;
          if (total > 10000) break; // Safety break
        }
      } catch (_error) {
        // Quota exceeded
      }
      
      // Clean up test data
      for (let i = 0; i < total; i++) {
        localStorage.removeItem(test + i);
      }
      
      return total * test.length;
    } catch (error) {
      console.error('Failed to check available quota:', error);
      return 0;
    }
  }

  /**
   * Export all data for backup
   */
  exportData() {
    try {
      const data = {};
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.namespace)) {
          data[key] = localStorage.getItem(key);
        }
      }
      
      return {
        version: '1.0',
        timestamp: new Date().toISOString(),
        data
      };
    } catch (error) {
      console.error('Failed to export data:', error);
      return null;
    }
  }

  /**
   * Import data from backup
   */
  importData(exportedData) {
    try {
      if (!exportedData || !exportedData.data) {
        throw new Error('Invalid export data format');
      }
      
      let importedCount = 0;
      
      for (const [key, value] of Object.entries(exportedData.data)) {
        if (key.startsWith(this.namespace)) {
          localStorage.setItem(key, value);
          importedCount++;
        }
      }
      
      console.log(`Imported ${importedCount} items`);
      return importedCount;
    } catch (error) {
      console.error('Failed to import data:', error);
      return 0;
    }
  }
}

// Create and export singleton instance
const storageManager = new StorageManager();

export default storageManager;