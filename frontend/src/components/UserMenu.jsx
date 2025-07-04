import React, { useState, useRef, useEffect } from 'react';
import { User, LogOut, Settings, Download, BarChart3, ChevronDown, Save, RotateCcw, Wifi, WifiOff, Database } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useConnectionStatus } from '../utils/connectionStatus';
import { useHybridAPI } from '../utils/hybridAPI';
import UserDashboard from './UserDashboard';

const UserMenu = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isDashboardOpen, setIsDashboardOpen] = useState(false);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const { user, logout, makeAuthenticatedRequest } = useAuth();
  const { showToast } = useToast();
  const connectionStatus = useConnectionStatus();
  const hybridAPI = useHybridAPI();
  const menuRef = useRef(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    try {
      await logout();
      showToast('Successfully logged out', 'success');
    } catch (error) {
      console.error('Logout error:', error);
      showToast('Logout completed', 'info'); // Still show positive message since client logout succeeded
    }
    setIsOpen(false);
  };

  const handleDataExport = async () => {
    try {
      const response = await makeAuthenticatedRequest(
        `${import.meta.env.VITE_API_BASE_URL}/api/data-export/complete`
      );
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `forest-pdf-viewer-data-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        showToast('Data exported successfully', 'success');
      } else {
        throw new Error('Export failed');
      }
    } catch (error) {
      console.error('Export error:', error);
      showToast('Failed to export data', 'error');
    }
    setIsOpen(false);
  };

  const handleSaveAll = async () => {
    setIsSaving(true);
    try {
      await hybridAPI.saveAllData();
      showToast('All data saved successfully!', 'success');
    } catch (error) {
      console.error('Save all error:', error);
      showToast('Failed to save some data', 'error');
    } finally {
      setIsSaving(false);
    }
    setIsOpen(false);
  };

  const toggleAutoSave = () => {
    const newState = !autoSaveEnabled;
    setAutoSaveEnabled(newState);
    localStorage.setItem('autoSaveEnabled', newState.toString());
    showToast(
      newState ? 'Auto-save enabled' : 'Auto-save disabled', 
      newState ? 'success' : 'info'
    );
  };

  const handleForceSync = async () => {
    try {
      setIsSaving(true);
      await connectionStatus.forceCheck();
      if (connectionStatus.canSaveToServer) {
        await hybridAPI.saveAllData();
        showToast('Data synced successfully!', 'success');
      } else {
        showToast('Cannot sync - server not available', 'warning');
      }
    } catch (error) {
      console.error('Sync error:', error);
      showToast('Sync failed', 'error');
    } finally {
      setIsSaving(false);
    }
    setIsOpen(false);
  };

  // Load auto-save preference
  useEffect(() => {
    const saved = localStorage.getItem('autoSaveEnabled');
    if (saved !== null) {
      setAutoSaveEnabled(saved === 'true');
    }
  }, []);

  // Get connection status icon and text
  const getConnectionInfo = () => {
    if (!connectionStatus.isOnline) {
      return { icon: WifiOff, text: 'Offline', color: 'text-red-500' };
    } else if (connectionStatus.canSaveToServer) {
      return { icon: Database, text: 'Connected', color: 'text-green-500' };
    } else if (connectionStatus.isServerConnected) {
      return { icon: Wifi, text: 'Server Only', color: 'text-yellow-500' };
    } else {
      return { icon: WifiOff, text: 'Server Down', color: 'text-orange-500' };
    }
  };

  if (!user) return null;

  return (
    <div className="user-menu" ref={menuRef}>
      <button
        className="user-menu-trigger"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        <div className="user-avatar">
          <User size={20} />
        </div>
        <span className="username">{user.username}</span>
        <ChevronDown size={16} className={`chevron ${isOpen ? 'open' : ''}`} />
      </button>

      {isOpen && (
        <div className="user-menu-dropdown">
          <div className="user-info">
            <div className="user-avatar large">
              <User size={24} />
            </div>
            <div className="user-details">
              <div className="username">{user.username}</div>
              <div className="email">{user.email}</div>
            </div>
          </div>

          <div className="menu-divider"></div>

          <div className="menu-items">
            {/* Connection Status */}
            {(() => {
              const { icon: StatusIcon, text, color } = getConnectionInfo();
              return (
                <div className={`menu-item status ${color}`}>
                  <StatusIcon size={18} />
                  <span>{text}</span>
                </div>
              );
            })()}

            <div className="menu-divider"></div>

            {/* Save Controls */}
            <button 
              className="menu-item" 
              onClick={handleSaveAll}
              disabled={isSaving}
            >
              <Save size={18} />
              <span>{isSaving ? 'Saving...' : 'Save All Data'}</span>
            </button>

            <button 
              className="menu-item" 
              onClick={handleForceSync}
              disabled={isSaving || !connectionStatus.isOnline}
            >
              <RotateCcw size={18} />
              <span>Sync Data</span>
            </button>

            <button 
              className={`menu-item ${autoSaveEnabled ? 'active' : ''}`}
              onClick={toggleAutoSave}
            >
              <RotateCcw size={18} />
              <span>Auto-save {autoSaveEnabled ? 'ON' : 'OFF'}</span>
            </button>

            <div className="menu-divider"></div>

            <button className="menu-item" onClick={() => {
              setIsDashboardOpen(true);
              setIsOpen(false);
            }}>
              <BarChart3 size={18} />
              <span>Dashboard</span>
            </button>

            <button className="menu-item" onClick={handleDataExport}>
              <Download size={18} />
              <span>Export Data</span>
            </button>

            <button className="menu-item" onClick={() => setIsOpen(false)}>
              <Settings size={18} />
              <span>Settings</span>
            </button>
          </div>

          <div className="menu-divider"></div>

          <button className="menu-item logout" onClick={handleLogout}>
            <LogOut size={18} />
            <span>Logout</span>
          </button>
        </div>
      )}

      <UserDashboard 
        isOpen={isDashboardOpen} 
        onClose={() => setIsDashboardOpen(false)} 
      />
    </div>
  );
};

export default UserMenu;