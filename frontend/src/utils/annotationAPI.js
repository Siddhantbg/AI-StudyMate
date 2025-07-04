// API utilities for annotation management
import { useAuth } from '../contexts/AuthContext';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

class AnnotationAPI {
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
   * Get all annotations for a file
   */
  async getAnnotations(fileId, page = null) {
    try {
      const url = page 
        ? `${API_BASE_URL}/api/annotations/file/${fileId}/page/${page}`
        : `${API_BASE_URL}/api/annotations/file/${fileId}`;
      
      const response = await this.makeRequest(url);
      const data = await response.json();
      
      if (data.success) {
        return data.data;
      } else {
        throw new Error(data.error || 'Failed to get annotations');
      }
    } catch (error) {
      console.error('Get annotations error:', error);
      throw error;
    }
  }

  /**
   * Create a new annotation
   */
  async createAnnotation(annotationData) {
    try {
      const response = await this.makeRequest(`${API_BASE_URL}/api/annotations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(annotationData),
      });

      const data = await response.json();
      
      if (data.success) {
        return data.data;
      } else {
        throw new Error(data.error || 'Failed to create annotation');
      }
    } catch (error) {
      console.error('Create annotation error:', error);
      throw error;
    }
  }

  /**
   * Update an annotation
   */
  async updateAnnotation(annotationId, updateData) {
    try {
      const response = await this.makeRequest(`${API_BASE_URL}/api/annotations/${annotationId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData),
      });

      const data = await response.json();
      
      if (data.success) {
        return data.data;
      } else {
        throw new Error(data.error || 'Failed to update annotation');
      }
    } catch (error) {
      console.error('Update annotation error:', error);
      throw error;
    }
  }

  /**
   * Delete an annotation
   */
  async deleteAnnotation(annotationId) {
    try {
      const response = await this.makeRequest(`${API_BASE_URL}/api/annotations/${annotationId}`, {
        method: 'DELETE',
      });

      const data = await response.json();
      
      if (data.success) {
        return true;
      } else {
        throw new Error(data.error || 'Failed to delete annotation');
      }
    } catch (error) {
      console.error('Delete annotation error:', error);
      throw error;
    }
  }

  /**
   * Create multiple annotations at once
   */
  async createBulkAnnotations(fileId, annotations) {
    try {
      const response = await this.makeRequest(`${API_BASE_URL}/api/annotations/bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          file_id: fileId,
          annotations,
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        return data.data;
      } else {
        throw new Error(data.error || 'Failed to create bulk annotations');
      }
    } catch (error) {
      console.error('Create bulk annotations error:', error);
      throw error;
    }
  }

  /**
   * Search annotations
   */
  async searchAnnotations(query, filters = {}) {
    try {
      const params = new URLSearchParams({
        q: query,
        ...filters,
      });

      const response = await this.makeRequest(`${API_BASE_URL}/api/annotations/search?${params}`);
      const data = await response.json();
      
      if (data.success) {
        return data.data;
      } else {
        throw new Error(data.error || 'Failed to search annotations');
      }
    } catch (error) {
      console.error('Search annotations error:', error);
      throw error;
    }
  }
}

// Create singleton instance
const annotationAPI = new AnnotationAPI();

// Hook to use annotation API with auth context
export const useAnnotationAPI = () => {
  const authContext = useAuth();
  
  // Initialize auth context if not already done
  if (annotationAPI.authContext !== authContext) {
    annotationAPI.setAuthContext(authContext);
  }
  
  return annotationAPI;
};

export default annotationAPI;