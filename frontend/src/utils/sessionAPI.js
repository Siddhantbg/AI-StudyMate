import React from 'react';
import { useAuth } from '../contexts/AuthContext';

class SessionAPI {
  constructor() {
    this.baseURL = import.meta.env.VITE_API_BASE_URL;
    this.currentSession = null;
    this.autoSaveInterval = null;
    this.autoSaveEnabled = true;
    this.pendingChanges = {};
    this.saveQueue = [];
    this.isOnline = navigator.onLine;
    
    // Listen for online/offline events
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.processSaveQueue();
    });
    
    window.addEventListener('offline', () => {
      this.isOnline = false;
    });
  }

  // Set authentication token
  setAuthToken(token) {
    this.authToken = token;
  }

  // Make authenticated API request
  async makeRequest(url, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    const response = await fetch(`${this.baseURL}${url}`, {
      ...options,
      headers
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Network error' }));
      throw new Error(error.error || 'Request failed');
    }

    return response.json();
  }

  // Get or create session for a file
  async getOrCreateSession(fileId) {
    try {
      const response = await this.makeRequest(`/api/sessions/file/${fileId}`);
      this.currentSession = response.data.session;
      return this.currentSession;
    } catch (error) {
      console.error('Error getting/creating session:', error);
      throw error;
    }
  }

  // Get all user sessions
  async getUserSessions() {
    try {
      const response = await this.makeRequest('/api/sessions');
      return response.data.sessions;
    } catch (error) {
      console.error('Error fetching user sessions:', error);
      throw error;
    }
  }

  // Update session data locally
  updateSessionData(updates) {
    if (!this.currentSession) return;

    // Merge updates with current session
    this.currentSession = { ...this.currentSession, ...updates };
    
    // Track pending changes for auto-save
    this.pendingChanges = { ...this.pendingChanges, ...updates };
    
    // Trigger auto-save if enabled
    if (this.autoSaveEnabled) {
      this.scheduleAutoSave();
    }
  }

  // Schedule auto-save (debounced)
  scheduleAutoSave() {
    if (this.autoSaveTimeout) {
      clearTimeout(this.autoSaveTimeout);
    }
    
    this.autoSaveTimeout = setTimeout(() => {
      this.performAutoSave();
    }, 2000); // Auto-save after 2 seconds of inactivity
  }

  // Perform auto-save
  async performAutoSave() {
    if (!this.currentSession || Object.keys(this.pendingChanges).length === 0) {
      return;
    }

    try {
      if (this.isOnline) {
        await this.makeRequest(`/api/sessions/${this.currentSession.id}/autosave`, {
          method: 'POST',
          body: JSON.stringify(this.pendingChanges)
        });
        this.pendingChanges = {};
      } else {
        // Queue for later when online
        this.saveQueue.push({
          type: 'autosave',
          sessionId: this.currentSession.id,
          data: { ...this.pendingChanges }
        });
      }
    } catch (error) {
      console.error('Auto-save failed:', error);
      // Don't clear pending changes if save failed
    }
  }

  // Manual save
  async performManualSave(additionalData = {}) {
    if (!this.currentSession) {
      throw new Error('No active session');
    }

    const saveData = {
      ...this.pendingChanges,
      ...additionalData
    };

    try {
      if (this.isOnline) {
        const response = await this.makeRequest(`/api/sessions/${this.currentSession.id}/save`, {
          method: 'POST',
          body: JSON.stringify(saveData)
        });
        
        this.currentSession = response.data.session;
        this.pendingChanges = {};
        
        return response.data;
      } else {
        // Queue for later when online
        this.saveQueue.push({
          type: 'manual',
          sessionId: this.currentSession.id,
          data: saveData
        });
        throw new Error('Cannot save while offline - queued for later');
      }
    } catch (error) {
      console.error('Manual save failed:', error);
      throw error;
    }
  }

  // Process queued saves when coming back online
  async processSaveQueue() {
    if (!this.isOnline || this.saveQueue.length === 0) return;

    const queue = [...this.saveQueue];
    this.saveQueue = [];

    for (const item of queue) {
      try {
        const endpoint = item.type === 'manual' ? 'save' : 'autosave';
        await this.makeRequest(`/api/sessions/${item.sessionId}/${endpoint}`, {
          method: 'POST',
          body: JSON.stringify(item.data)
        });
      } catch (error) {
        console.error(`Failed to process queued ${item.type}:`, error);
        // Re-add to queue if it failed
        this.saveQueue.push(item);
      }
    }
  }

  // Update current page
  async updateCurrentPage(pageNumber, timeSpent = 0) {
    this.updateSessionData({ current_page: pageNumber });
    
    try {
      if (this.isOnline) {
        await this.makeRequest(`/api/sessions/${this.currentSession.id}/page`, {
          method: 'PUT',
          body: JSON.stringify({ page_number: pageNumber, time_spent: timeSpent })
        });
      }
    } catch (error) {
      console.error('Error updating current page:', error);
    }
  }

  // Update zoom level
  updateZoomLevel(zoomLevel) {
    this.updateSessionData({ zoom_level: zoomLevel });
  }

  // Update scroll position
  updateScrollPosition(x, y) {
    this.updateSessionData({ scroll_position: { x, y } });
  }

  // Update reading progress
  updateReadingProgress(progress) {
    this.updateSessionData({ reading_progress: progress });
  }

  // Add page time
  addPageTime(pageNumber, timeSpent) {
    const pageTimeTracking = { ...this.currentSession.page_time_tracking };
    pageTimeTracking[pageNumber] = (pageTimeTracking[pageNumber] || 0) + timeSpent;
    
    const sessionDuration = this.currentSession.session_duration + timeSpent;
    
    this.updateSessionData({
      page_time_tracking: pageTimeTracking,
      session_duration: sessionDuration
    });
  }

  // Toggle bookmark
  async toggleBookmark(pageNumber) {
    try {
      if (this.isOnline) {
        const response = await this.makeRequest(`/api/sessions/${this.currentSession.id}/bookmark`, {
          method: 'PUT',
          body: JSON.stringify({ page_number: pageNumber })
        });
        
        this.updateSessionData({ bookmarked_pages: response.data.bookmarked_pages });
        return response.data.bookmarked_pages;
      } else {
        // Handle offline bookmark toggle
        const bookmarks = [...this.currentSession.bookmarked_pages];
        const index = bookmarks.indexOf(pageNumber);
        
        if (index === -1) {
          bookmarks.push(pageNumber);
        } else {
          bookmarks.splice(index, 1);
        }
        
        this.updateSessionData({ bookmarked_pages: bookmarks });
        return bookmarks;
      }
    } catch (error) {
      console.error('Error toggling bookmark:', error);
      throw error;
    }
  }

  // Record focus session
  async recordFocusSession(startTime, endTime, distractionCount = 0) {
    try {
      if (this.isOnline) {
        const response = await this.makeRequest(`/api/sessions/${this.currentSession.id}/focus`, {
          method: 'PUT',
          body: JSON.stringify({
            start_time: startTime.toISOString(),
            end_time: endTime.toISOString(),
            distraction_count: distractionCount
          })
        });
        
        this.updateSessionData({ focus_metrics: response.data.focus_metrics });
      }
    } catch (error) {
      console.error('Error recording focus session:', error);
    }
  }

  // Record AI interaction
  async recordAIInteraction(interactionType) {
    try {
      if (this.isOnline) {
        const response = await this.makeRequest(`/api/sessions/${this.currentSession.id}/ai-interaction`, {
          method: 'PUT',
          body: JSON.stringify({ interaction_type: interactionType })
        });
        
        this.updateSessionData({ ai_interaction_history: response.data.ai_interaction_history });
      }
    } catch (error) {
      console.error('Error recording AI interaction:', error);
    }
  }

  // Update session settings
  async updateSessionSettings(settings) {
    try {
      if (this.isOnline) {
        const response = await this.makeRequest(`/api/sessions/${this.currentSession.id}/settings`, {
          method: 'PUT',
          body: JSON.stringify(settings)
        });
        
        this.updateSessionData(response.data);
        
        if (settings.auto_save_enabled !== undefined) {
          this.autoSaveEnabled = settings.auto_save_enabled;
        }
      }
    } catch (error) {
      console.error('Error updating session settings:', error);
      throw error;
    }
  }

  // Get complete session data including annotations
  async getCompleteSessionData() {
    try {
      if (!this.currentSession) {
        throw new Error('No active session');
      }
      
      const response = await this.makeRequest(`/api/sessions/${this.currentSession.id}/complete`);
      return response.data;
    } catch (error) {
      console.error('Error fetching complete session data:', error);
      throw error;
    }
  }

  // Update annotation summary
  updateAnnotationSummary(annotations) {
    const summary = {
      highlights: 0,
      underlines: 0,
      drawings: 0,
      sticky_notes: 0,
      ai_highlights: 0,
      total: annotations.length
    };

    annotations.forEach(annotation => {
      if (annotation.ai_generated) {
        summary.ai_highlights++;
      } else {
        const type = annotation.annotation_type + 's';
        summary[type] = (summary[type] || 0) + 1;
      }
    });

    this.updateSessionData({ annotation_summary: summary });
  }

  // Enable/disable auto-save
  setAutoSaveEnabled(enabled) {
    this.autoSaveEnabled = enabled;
    localStorage.setItem('autoSaveEnabled', enabled.toString());
    
    if (this.currentSession) {
      this.updateSessionSettings({ auto_save_enabled: enabled });
    }
  }

  // Get auto-save status
  getAutoSaveEnabled() {
    const saved = localStorage.getItem('autoSaveEnabled');
    return saved !== null ? saved === 'true' : true;
  }

  // Clean up
  cleanup() {
    if (this.autoSaveTimeout) {
      clearTimeout(this.autoSaveTimeout);
    }
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
    }
  }

  // Get current session
  getCurrentSession() {
    return this.currentSession;
  }

  // Check if there are pending changes
  hasPendingChanges() {
    return Object.keys(this.pendingChanges).length > 0;
  }
}

// Create singleton instance
const sessionAPI = new SessionAPI();

// Custom hook for using session API
export const useSessionAPI = () => {
  const { token } = useAuth();
  
  // Update token when auth changes
  React.useEffect(() => {
    if (token) {
      sessionAPI.setAuthToken(token);
    }
  }, [token]);

  return sessionAPI;
};

export default sessionAPI;