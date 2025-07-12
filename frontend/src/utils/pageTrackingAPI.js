// API utilities for page tracking and reading progress
// DISABLED - All page tracking endpoints have been removed from backend
// This file is kept for reference but all functions are disabled

import { useAuth } from '../contexts/AuthContext';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

class PageTrackingAPI {
  constructor() {
    this.authContext = null;
  }

  setAuthContext(authContext) {
    this.authContext = authContext;
  }

  async makeRequest(url, options = {}) {
    if (!this.authContext) {
      throw new Error('Auth context not initialized');
    }
    return this.authContext.makeAuthenticatedRequest(url, options);
  }

  /**
   * Track page reading activity
   */
  async trackPage(fileId, pageNumber, trackingData = {}) {
    try {
      const response = await this.makeRequest(`${API_BASE_URL}/api/page-tracking/track`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          file_id: fileId,
          page_number: pageNumber,
          ...trackingData,
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        return data.data;
      } else {
        throw new Error(data.error || 'Failed to track page');
      }
    } catch (error) {
      console.error('Track page error:', error);
      throw error;
    }
  }

  /**
   * Track time spent on a page
   */
  async trackTimeSpent(fileId, pageNumber, timeSpent) {
    return this.trackPage(fileId, pageNumber, { time_spent: timeSpent });
  }

  /**
   * Update reading progress for a page
   */
  async updateReadingProgress(fileId, pageNumber, progress) {
    return this.trackPage(fileId, pageNumber, { reading_progress: progress });
  }

  /**
   * Record focus session
   */
  async recordFocusSession(fileId, pageNumber, startTime, endTime, focusScore = null) {
    try {
      const response = await this.makeRequest(`${API_BASE_URL}/api/page-tracking/focus-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          file_id: fileId,
          page_number: pageNumber,
          start_time: startTime,
          end_time: endTime,
          focus_score: focusScore,
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        return data.data;
      } else {
        throw new Error(data.error || 'Failed to record focus session');
      }
    } catch (error) {
      console.error('Record focus session error:', error);
      throw error;
    }
  }

  /**
   * Get reading progress for a file
   */
  async getFileProgress(fileId) {
    try {
      const response = await this.makeRequest(`${API_BASE_URL}/api/page-tracking/file/${fileId}`);
      const data = await response.json();
      
      if (data.success) {
        return data.data;
      } else {
        throw new Error(data.error || 'Failed to get file progress');
      }
    } catch (error) {
      console.error('Get file progress error:', error);
      throw error;
    }
  }

  /**
   * Get detailed tracking data for a specific page
   */
  async getPageTrackingData(fileId, pageNumber) {
    try {
      const response = await this.makeRequest(`${API_BASE_URL}/api/page-tracking/file/${fileId}/page/${pageNumber}`);
      const data = await response.json();
      
      if (data.success) {
        return data.data;
      } else {
        throw new Error(data.error || 'Failed to get page tracking data');
      }
    } catch (error) {
      console.error('Get page tracking data error:', error);
      throw error;
    }
  }

  /**
   * Toggle bookmark for a page
   */
  async toggleBookmark(fileId, pageNumber) {
    try {
      const response = await this.makeRequest(`${API_BASE_URL}/api/page-tracking/bookmark`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          file_id: fileId,
          page_number: pageNumber,
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        return data.data;
      } else {
        throw new Error(data.error || 'Failed to toggle bookmark');
      }
    } catch (error) {
      console.error('Toggle bookmark error:', error);
      throw error;
    }
  }

  /**
   * Update notes for a page
   */
  async updatePageNotes(fileId, pageNumber, notes) {
    try {
      const response = await this.makeRequest(`${API_BASE_URL}/api/page-tracking/notes`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          file_id: fileId,
          page_number: pageNumber,
          notes,
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        return data.data;
      } else {
        throw new Error(data.error || 'Failed to update page notes');
      }
    } catch (error) {
      console.error('Update page notes error:', error);
      throw error;
    }
  }

  /**
   * Set difficulty rating for a page
   */
  async setDifficultyRating(fileId, pageNumber, rating) {
    try {
      const response = await this.makeRequest(`${API_BASE_URL}/api/page-tracking/difficulty`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          file_id: fileId,
          page_number: pageNumber,
          difficulty_rating: rating,
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        return data.data;
      } else {
        throw new Error(data.error || 'Failed to set difficulty rating');
      }
    } catch (error) {
      console.error('Set difficulty rating error:', error);
      throw error;
    }
  }

  /**
   * Get user's reading statistics
   */
  async getReadingStats(startDate = null, endDate = null) {
    try {
      const params = new URLSearchParams();
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);

      const url = `${API_BASE_URL}/api/page-tracking/stats${params.toString() ? '?' + params.toString() : ''}`;
      const response = await this.makeRequest(url);
      const data = await response.json();
      
      if (data.success) {
        return data.data;
      } else {
        throw new Error(data.error || 'Failed to get reading stats');
      }
    } catch (error) {
      console.error('Get reading stats error:', error);
      throw error;
    }
  }

  /**
   * Get all bookmarked pages
   */
  async getBookmarks(fileId = null) {
    try {
      const params = new URLSearchParams();
      if (fileId) params.append('file_id', fileId);

      const url = `${API_BASE_URL}/api/page-tracking/bookmarks${params.toString() ? '?' + params.toString() : ''}`;
      const response = await this.makeRequest(url);
      const data = await response.json();
      
      if (data.success) {
        return data.data;
      } else {
        throw new Error(data.error || 'Failed to get bookmarks');
      }
    } catch (error) {
      console.error('Get bookmarks error:', error);
      throw error;
    }
  }
}

// Create singleton instance
const pageTrackingAPI = new PageTrackingAPI();

// Hook to use page tracking API with auth context
export const usePageTrackingAPI = () => {
  const authContext = useAuth();
  
  // Initialize auth context if not already done
  if (pageTrackingAPI.authContext !== authContext) {
    pageTrackingAPI.setAuthContext(authContext);
  }
  
  return pageTrackingAPI;
};

export default pageTrackingAPI;