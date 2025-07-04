import React, { createContext, useState, useContext, useEffect } from 'react';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(localStorage.getItem('access_token'));

  // API base URL
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

  // Check if user is authenticated on app load
  useEffect(() => {
    const checkAuth = async () => {
      const savedToken = localStorage.getItem('access_token');
      if (savedToken) {
        try {
          const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
            headers: {
              'Authorization': `Bearer ${savedToken}`
            }
          });

          if (response.ok) {
            const userData = await response.json();
            setUser(userData.data.user);
            setToken(savedToken);
          } else {
            // Token is invalid, clear it
            localStorage.removeItem('access_token');
            localStorage.removeItem('refresh_token');
            setToken(null);
          }
        } catch (error) {
          console.error('Auth check failed:', error);
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          setToken(null);
        }
      }
      setLoading(false);
    };

    checkAuth();
  }, [API_BASE_URL]);

  // Login function
  const login = async (email, password) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (response.ok) {
        localStorage.setItem('access_token', data.data.access_token);
        localStorage.setItem('refresh_token', data.data.refresh_token);
        setToken(data.data.access_token);
        setUser(data.data.user);
        return { success: true };
      } else {
        return { success: false, error: data.error || 'Login failed' };
      }
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: 'Network error. Please try again.' };
    }
  };

  // Register function
  const register = async (firstName, lastName, email, password) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          first_name: firstName, 
          last_name: lastName, 
          email, 
          password 
        }),
      });

      const data = await response.json();

      if (response.ok) {
        localStorage.setItem('access_token', data.data.access_token);
        localStorage.setItem('refresh_token', data.data.refresh_token);
        setToken(data.data.access_token);
        setUser(data.data.user);
        return { success: true };
      } else {
        return { success: false, error: data.error || 'Registration failed' };
      }
    } catch (error) {
      console.error('Registration error:', error);
      return { success: false, error: 'Network error. Please try again.' };
    }
  };

  // Logout function
  const logout = async () => {
    const accessToken = localStorage.getItem('access_token');
    
    // Try to logout on server to invalidate session
    if (accessToken) {
      try {
        await fetch(`${API_BASE_URL}/api/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        });
      } catch (error) {
        console.warn('Failed to logout on server:', error);
        // Continue with client-side logout even if server logout fails
      }
    }
    
    // Clear client-side state regardless of server response
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    setToken(null);
    setUser(null);
    
    // Clear any cached file data
    localStorage.removeItem('cached_files');
  };

  // Refresh token function
  const refreshToken = async () => {
    const refreshTokenValue = localStorage.getItem('refresh_token');
    if (!refreshTokenValue) {
      logout();
      return false;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh_token: refreshTokenValue }),
      });

      if (response.ok) {
        const data = await response.json();
        localStorage.setItem('access_token', data.data.access_token);
        setToken(data.data.access_token);
        return true;
      } else {
        logout();
        return false;
      }
    } catch (error) {
      console.error('Token refresh failed:', error);
      logout();
      return false;
    }
  };

  // Make authenticated API request with automatic token refresh
  const makeAuthenticatedRequest = async (url, options = {}) => {
    const currentToken = localStorage.getItem('access_token');
    
    if (!currentToken) {
      throw new Error('No authentication token available');
    }

    const requestOptions = {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${currentToken}`,
      },
    };

    let response = await fetch(url, requestOptions);

    // If token expired, try to refresh
    if (response.status === 401) {
      const refreshSuccess = await refreshToken();
      if (refreshSuccess) {
        const newToken = localStorage.getItem('access_token');
        requestOptions.headers['Authorization'] = `Bearer ${newToken}`;
        response = await fetch(url, requestOptions);
      } else {
        throw new Error('Authentication failed');
      }
    }

    return response;
  };

  const value = {
    user,
    token,
    loading,
    login,
    register,
    logout,
    refreshToken,
    makeAuthenticatedRequest,
    isAuthenticated: !!token && !!user,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};