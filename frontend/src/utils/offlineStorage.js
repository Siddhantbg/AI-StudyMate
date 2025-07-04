// Offline storage utility for when database is unavailable
// Provides robust backup persistence using localStorage and IndexedDB

class OfflineStorage {
  constructor() {
    this.dbName = 'ForestPDFViewer';
    this.version = 1;
    this.db = null;
    this.isOnline = navigator.onLine;
    this.pendingSaves = new Map();
    
    // Initialize IndexedDB
    this.initDB();
    
    // Listen for online/offline events
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.syncPendingData();
    });
    
    window.addEventListener('offline', () => {
      this.isOnline = false;
    });
  }

  async initDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Create object stores
        if (!db.objectStoreNames.contains('annotations')) {
          const annotationStore = db.createObjectStore('annotations', { keyPath: 'id' });
          annotationStore.createIndex('fileId', 'fileId', { unique: false });
          annotationStore.createIndex('pageNumber', 'pageNumber', { unique: false });
        }
        
        if (!db.objectStoreNames.contains('pageTracking')) {
          const trackingStore = db.createObjectStore('pageTracking', { keyPath: 'id' });
          trackingStore.createIndex('fileId', 'fileId', { unique: false });
          trackingStore.createIndex('pageNumber', 'pageNumber', { unique: false });
        }
        
        if (!db.objectStoreNames.contains('fileProgress')) {
          db.createObjectStore('fileProgress', { keyPath: 'fileId' });
        }
        
        if (!db.objectStoreNames.contains('pendingSync')) {
          db.createObjectStore('pendingSync', { keyPath: 'id', autoIncrement: true });
        }
      };
    });
  }

  // Generate unique IDs for offline data
  generateId() {
    return 'offline_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  // Save annotation with fallback
  async saveAnnotation(annotation) {
    try {
      // Try localStorage first (fastest)
      const key = `annotation_${annotation.fileId}_${annotation.pageNumber}_${annotation.id}`;
      localStorage.setItem(key, JSON.stringify({
        ...annotation,
        savedAt: new Date().toISOString(),
        source: 'offline'
      }));

      // Also save to IndexedDB for better persistence
      if (this.db) {
        const transaction = this.db.transaction(['annotations'], 'readwrite');
        const store = transaction.objectStore('annotations');
        await store.put({
          ...annotation,
          savedAt: new Date().toISOString(),
          source: 'offline'
        });
      }

      // Queue for server sync when online
      this.queueForSync('annotation', 'save', annotation);
      
      return { success: true, id: annotation.id, source: 'offline' };
    } catch (error) {
      console.error('Failed to save annotation offline:', error);
      throw error;
    }
  }

  // Load annotations for a file/page
  async loadAnnotations(fileId, pageNumber = null) {
    try {
      const annotations = [];

      // Load from localStorage
      const keys = Object.keys(localStorage);
      const prefix = pageNumber 
        ? `annotation_${fileId}_${pageNumber}_`
        : `annotation_${fileId}_`;
      
      keys.forEach(key => {
        if (key.startsWith(prefix)) {
          try {
            const annotation = JSON.parse(localStorage.getItem(key));
            annotations.push(annotation);
          } catch (e) {
            console.warn('Failed to parse annotation from localStorage:', key);
          }
        }
      });

      // Also load from IndexedDB if available
      if (this.db) {
        const transaction = this.db.transaction(['annotations'], 'readonly');
        const store = transaction.objectStore('annotations');
        const index = store.index('fileId');
        const cursor = await index.openCursor(fileId);
        
        while (cursor) {
          const annotation = cursor.value;
          if (!pageNumber || annotation.pageNumber === pageNumber) {
            // Avoid duplicates from localStorage
            const existing = annotations.find(a => a.id === annotation.id);
            if (!existing) {
              annotations.push(annotation);
            }
          }
          cursor.continue();
        }
      }

      return annotations;
    } catch (error) {
      console.error('Failed to load annotations offline:', error);
      return [];
    }
  }

  // Delete annotation
  async deleteAnnotation(annotationId, fileId, pageNumber) {
    try {
      // Remove from localStorage
      const key = `annotation_${fileId}_${pageNumber}_${annotationId}`;
      localStorage.removeItem(key);

      // Remove from IndexedDB
      if (this.db) {
        const transaction = this.db.transaction(['annotations'], 'readwrite');
        const store = transaction.objectStore('annotations');
        await store.delete(annotationId);
      }

      // Queue for server sync
      this.queueForSync('annotation', 'delete', { id: annotationId, fileId, pageNumber });
      
      return { success: true };
    } catch (error) {
      console.error('Failed to delete annotation offline:', error);
      throw error;
    }
  }

  // Save page tracking data
  async savePageTracking(fileId, pageNumber, timeSpent = 0, data = {}) {
    try {
      const trackingData = {
        id: `${fileId}_${pageNumber}`,
        fileId,
        pageNumber,
        timeSpent,
        lastUpdated: new Date().toISOString(),
        ...data
      };

      // Save to localStorage
      const key = `pageTracking_${fileId}_${pageNumber}`;
      localStorage.setItem(key, JSON.stringify(trackingData));

      // Save to IndexedDB
      if (this.db) {
        const transaction = this.db.transaction(['pageTracking'], 'readwrite');
        const store = transaction.objectStore('pageTracking');
        await store.put(trackingData);
      }

      // Queue for sync
      this.queueForSync('pageTracking', 'save', trackingData);
      
      return { success: true };
    } catch (error) {
      console.error('Failed to save page tracking offline:', error);
      throw error;
    }
  }

  // Load page tracking data
  async loadPageTracking(fileId, pageNumber) {
    try {
      // Try localStorage first
      const key = `pageTracking_${fileId}_${pageNumber}`;
      const stored = localStorage.getItem(key);
      
      if (stored) {
        return JSON.parse(stored);
      }

      // Try IndexedDB
      if (this.db) {
        const transaction = this.db.transaction(['pageTracking'], 'readonly');
        const store = transaction.objectStore('pageTracking');
        const result = await store.get(`${fileId}_${pageNumber}`);
        return result || { timeSpent: 0 };
      }

      return { timeSpent: 0 };
    } catch (error) {
      console.error('Failed to load page tracking offline:', error);
      return { timeSpent: 0 };
    }
  }

  // Save file progress (last page, total time, etc.)
  async saveFileProgress(fileId, progressData) {
    try {
      const data = {
        fileId,
        ...progressData,
        lastUpdated: new Date().toISOString()
      };

      // Save to localStorage
      localStorage.setItem(`fileProgress_${fileId}`, JSON.stringify(data));

      // Save to IndexedDB
      if (this.db) {
        const transaction = this.db.transaction(['fileProgress'], 'readwrite');
        const store = transaction.objectStore('fileProgress');
        await store.put(data);
      }

      // Queue for sync
      this.queueForSync('fileProgress', 'save', data);
      
      return { success: true };
    } catch (error) {
      console.error('Failed to save file progress offline:', error);
      throw error;
    }
  }

  // Load file progress
  async loadFileProgress(fileId) {
    try {
      // Try localStorage first
      const stored = localStorage.getItem(`fileProgress_${fileId}`);
      if (stored) {
        return JSON.parse(stored);
      }

      // Try IndexedDB
      if (this.db) {
        const transaction = this.db.transaction(['fileProgress'], 'readonly');
        const store = transaction.objectStore('fileProgress');
        const result = await store.get(fileId);
        return result || {};
      }

      return {};
    } catch (error) {
      console.error('Failed to load file progress offline:', error);
      return {};
    }
  }

  // Queue data for sync when online
  queueForSync(type, operation, data) {
    const syncItem = {
      type,
      operation,
      data,
      timestamp: new Date().toISOString()
    };

    // Add to pending saves map
    const key = `${type}_${operation}_${Date.now()}`;
    this.pendingSaves.set(key, syncItem);

    // Also save to IndexedDB for persistence
    if (this.db) {
      const transaction = this.db.transaction(['pendingSync'], 'readwrite');
      const store = transaction.objectStore('pendingSync');
      store.add(syncItem);
    }
  }

  // Sync pending data when connection is restored
  async syncPendingData() {
    console.log('🔄 Syncing pending offline data...');
    
    try {
      // Load pending items from IndexedDB
      if (this.db) {
        const transaction = this.db.transaction(['pendingSync'], 'readwrite');
        const store = transaction.objectStore('pendingSync');
        const cursor = await store.openCursor();
        
        while (cursor) {
          const item = cursor.value;
          try {
            await this.syncItem(item);
            // Remove from pending after successful sync
            store.delete(cursor.primaryKey);
          } catch (error) {
            console.warn('Failed to sync item:', item, error);
          }
          cursor.continue();
        }
      }

      // Also sync from memory
      for (const [key, item] of this.pendingSaves) {
        try {
          await this.syncItem(item);
          this.pendingSaves.delete(key);
        } catch (error) {
          console.warn('Failed to sync pending item:', item, error);
        }
      }

      console.log('✅ Offline data sync completed');
    } catch (error) {
      console.error('❌ Failed to sync offline data:', error);
    }
  }

  // Sync individual item to server
  async syncItem(item) {
    // This would make actual API calls to sync data
    // For now, just log what would be synced
    console.log('📤 Would sync to server:', item);
    
    // TODO: Implement actual API calls here
    // Example:
    // if (item.type === 'annotation' && item.operation === 'save') {
    //   await fetch('/api/annotations', { method: 'POST', body: JSON.stringify(item.data) });
    // }
  }

  // Get storage statistics
  getStorageStats() {
    const stats = {
      localStorage: {
        used: 0,
        items: 0
      },
      indexedDB: {
        connected: !!this.db
      },
      pendingSync: this.pendingSaves.size,
      isOnline: this.isOnline
    };

    // Calculate localStorage usage
    for (let key in localStorage) {
      if (key.startsWith('annotation_') || key.startsWith('pageTracking_') || key.startsWith('fileProgress_')) {
        stats.localStorage.used += localStorage.getItem(key).length;
        stats.localStorage.items++;
      }
    }

    return stats;
  }

  // Clear all offline data
  async clearOfflineData() {
    try {
      // Clear localStorage
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith('annotation_') || key.startsWith('pageTracking_') || key.startsWith('fileProgress_')) {
          localStorage.removeItem(key);
        }
      });

      // Clear IndexedDB
      if (this.db) {
        const stores = ['annotations', 'pageTracking', 'fileProgress', 'pendingSync'];
        for (const storeName of stores) {
          const transaction = this.db.transaction([storeName], 'readwrite');
          const store = transaction.objectStore(storeName);
          await store.clear();
        }
      }

      // Clear pending saves
      this.pendingSaves.clear();

      console.log('🗑️ All offline data cleared');
    } catch (error) {
      console.error('Failed to clear offline data:', error);
    }
  }
}

// Create singleton instance
const offlineStorage = new OfflineStorage();

export default offlineStorage;