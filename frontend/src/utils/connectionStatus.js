// Connection status utility to track database and server connectivity
import { useState, useEffect, useCallback } from 'react';

class ConnectionManager {
  constructor() {
    this.isOnline = navigator.onLine;
    this.isDatabaseConnected = false;
    this.isServerConnected = false;
    this.lastChecked = null;
    this.checkInterval = null;
    this.listeners = new Set();
    
    // Start monitoring
    this.startMonitoring();
  }

  startMonitoring() {
    // Check connection status every 30 seconds
    this.checkInterval = setInterval(() => {
      this.checkServerConnection();
    }, 30000);

    // Listen for online/offline events
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.checkServerConnection();
      this.notifyListeners();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      this.isDatabaseConnected = false;
      this.isServerConnected = false;
      this.notifyListeners();
    });

    // Initial check
    this.checkServerConnection();
  }

  async checkServerConnection() {
    if (!this.isOnline) {
      this.isServerConnected = false;
      this.isDatabaseConnected = false;
      this.notifyListeners();
      return;
    }

    try {
      // Check server health endpoint
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/health`, {
        method: 'GET',
        timeout: 5000
      });

      if (response.ok) {
        const data = await response.json();
        this.isServerConnected = true;
        this.isDatabaseConnected = data.database === 'connected';
      } else {
        this.isServerConnected = false;
        this.isDatabaseConnected = false;
      }
    } catch (error) {
      console.warn('Server connection check failed:', error);
      this.isServerConnected = false;
      this.isDatabaseConnected = false;
    }

    this.lastChecked = new Date();
    this.notifyListeners();
  }

  addListener(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notifyListeners() {
    const status = this.getStatus();
    this.listeners.forEach(callback => {
      try {
        callback(status);
      } catch (error) {
        console.error('Connection status listener error:', error);
      }
    });
  }

  getStatus() {
    return {
      isOnline: this.isOnline,
      isServerConnected: this.isServerConnected,
      isDatabaseConnected: this.isDatabaseConnected,
      lastChecked: this.lastChecked,
      canSaveToServer: this.isOnline && this.isServerConnected && this.isDatabaseConnected,
      canSaveOffline: true // Always available
    };
  }

  // Force a connection check
  async forceCheck() {
    await this.checkServerConnection();
    return this.getStatus();
  }

  destroy() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
    this.listeners.clear();
  }
}

// Create singleton instance
const connectionManager = new ConnectionManager();

// React hook to use connection status
export const useConnectionStatus = () => {
  const [status, setStatus] = useState(connectionManager.getStatus());

  useEffect(() => {
    const unsubscribe = connectionManager.addListener(setStatus);
    return unsubscribe;
  }, []);

  const forceCheck = useCallback(async () => {
    const newStatus = await connectionManager.forceCheck();
    setStatus(newStatus);
    return newStatus;
  }, []);

  return { ...status, forceCheck };
};

export default connectionManager;