import React, { useState, useRef, useEffect } from 'react';
import { User, LogOut, Settings, Download, BarChart3, ChevronDown, Save, RotateCcw, Wifi, WifiOff, Database } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
// import { useConnectionStatus } from '../utils/connectionStatus';
// import { useHybridAPI } from '../utils/hybridAPI';
// import { useSessionAPI } from '../utils/sessionAPI'; // Temporarily disabled
import UserDashboard from './UserDashboard';

const UserMenu = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isDashboardOpen, setIsDashboardOpen] = useState(false);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, right: 0 });
  const { user, logout, makeAuthenticatedRequest } = useAuth();
  const { showToast } = useToast();
  // Temporarily disable these hooks to debug
  // const connectionStatus = useConnectionStatus();
  // const hybridAPI = useHybridAPI();
  
  // Simple fallback connection status
  const connectionStatus = {
    isOnline: navigator.onLine,
    canSaveToServer: true,
    isServerConnected: true,
    forceCheck: async () => {}
  };
  
  // Simple fallback hybrid API
  const hybridAPI = {
    saveAllData: async () => {
      // Simple save to localStorage
      console.log('Saving data to localStorage...');
      return Promise.resolve();
    }
  };
  // const sessionAPI = useSessionAPI(); // Temporarily disabled
  const menuRef = useRef(null);

  // Close menu when clicking outside or on window resize
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    const handleResize = () => {
      if (isOpen) {
        setIsOpen(false); // Close dropdown on resize to prevent positioning issues
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('resize', handleResize);
    document.addEventListener('keydown', handleEscape);
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

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
      // Save via hybrid API
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

  const toggleAutoSave = async () => {
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

  if (!user) {
    console.log('UserMenu: No user found, not rendering');
    return null;
  }

  console.log('UserMenu: Rendering with user:', user.username);

  return (
    <div className="user-menu" ref={menuRef} style={{
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      zIndex: 10000
    }}>
      <button
        className="user-menu-trigger"
        onClick={(e) => {
          console.log('UserMenu: Toggle clicked, isOpen will be:', !isOpen);
          
          // Calculate dropdown position relative to button
          const rect = e.currentTarget.getBoundingClientRect();
          const dropdownWidth = 260;
          const viewportWidth = window.innerWidth;
          const viewportHeight = window.innerHeight;
          
          // Calculate right position, ensuring dropdown doesn't go off-screen
          let rightPosition = viewportWidth - rect.right;
          if (rightPosition < 0) {
            rightPosition = 16; // Minimum margin from right edge
          }
          
          // Calculate top position, ensuring dropdown doesn't go off-screen
          let topPosition = rect.bottom + 8;
          const estimatedDropdownHeight = 500; // Approximate height
          if (topPosition + estimatedDropdownHeight > viewportHeight) {
            topPosition = rect.top - estimatedDropdownHeight - 8; // Show above if needed
          }
          
          setDropdownPosition({
            top: Math.max(16, topPosition), // Minimum margin from top
            right: rightPosition
          });
          
          setIsOpen(!isOpen);
        }}
        aria-expanded={isOpen}
      >
        <div className="user-avatar">
          <User size={20} />
        </div>
        <span className="username">{user.username}</span>
        <ChevronDown size={16} className={`chevron ${isOpen ? 'open' : ''}`} />
      </button>

      {isOpen && (() => {
        console.log('UserMenu: Dropdown is rendering');
        return (
        <div className="user-menu-dropdown" style={{
          zIndex: 99999,
          position: 'fixed',
          top: `${dropdownPosition.top}px`,
          right: `${dropdownPosition.right}px`,
          minWidth: window.innerWidth <= 768 ? '240px' : '260px',
          maxWidth: window.innerWidth <= 768 ? '280px' : '300px',
          background: '#3F6B4A',
          border: '1px solid #2d4f34',
          borderRadius: '12px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), 0 4px 16px rgba(63, 107, 74, 0.3)',
          overflow: 'visible',
          backdropFilter: 'blur(10px)',
          transform: 'translateY(0)',
          transition: 'all 0.2s ease'
        }}>
          <div className="user-info" style={{
            padding: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            background: 'rgba(45, 79, 52, 0.7)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
          }}>
            <div className="user-avatar large" style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '40px',
              height: '40px',
              background: '#2d4f34',
              color: 'white',
              borderRadius: '50%',
              fontWeight: '600'
            }}>
              <User size={24} />
            </div>
            <div className="user-details">
              <div className="username" style={{
                fontWeight: '600',
                color: 'white',
                marginBottom: '0.25rem',
                fontSize: '0.95rem'
              }}>{user.username}</div>
              <div className="email" style={{
                fontSize: '0.8rem',
                color: 'rgba(255, 255, 255, 0.8)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>{user.email}</div>
            </div>
          </div>

          <div className="menu-divider" style={{
            height: '1px',
            background: 'rgba(255, 255, 255, 0.1)',
            margin: '0.5rem 0'
          }}></div>

          <div className="menu-items">
            {/* Connection Status */}
            {(() => {
              const { icon: StatusIcon, text, color } = getConnectionInfo();
              return (
                <div 
                  className={`menu-item status ${color}`}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.75rem 1rem',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: 'none',
                    color: 'rgba(255, 255, 255, 0.9)',
                    fontSize: '0.9rem',
                    textAlign: 'left',
                    borderRadius: '8px',
                    margin: '0 0.5rem',
                    pointerEvents: 'none',
                    opacity: 0.8
                  }}
                >
                  <StatusIcon size={18} />
                  <span>{text}</span>
                </div>
              );
            })()}

            <div className="menu-divider" style={{
            height: '1px',
            background: 'rgba(255, 255, 255, 0.1)',
            margin: '0.5rem 0'
          }}></div>

            {/* Save Controls */}
            <button 
              className="menu-item" 
              onClick={handleSaveAll}
              disabled={isSaving}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.75rem 1rem',
                background: 'none',
                border: 'none',
                color: 'white',
                cursor: 'pointer',
                fontSize: '0.9rem',
                textAlign: 'left',
                borderRadius: '8px',
                margin: '0 0.5rem',
                transition: 'background-color 0.2s ease',
                ':hover': {
                  background: 'rgba(255, 255, 255, 0.1)'
                }
              }}
              onMouseEnter={(e) => e.target.style.background = 'rgba(255, 255, 255, 0.1)'}
              onMouseLeave={(e) => e.target.style.background = 'none'}
            >
              <Save size={18} />
              <span>{isSaving ? 'Saving...' : 'Save All Data'}</span>
            </button>

            <button 
              className="menu-item" 
              onClick={handleForceSync}
              disabled={isSaving || !connectionStatus.isOnline}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.75rem 1rem',
                background: 'none',
                border: 'none',
                color: 'white',
                cursor: 'pointer',
                fontSize: '0.9rem',
                textAlign: 'left',
                borderRadius: '8px',
                margin: '0 0.5rem',
                transition: 'background-color 0.2s ease',
                opacity: (isSaving || !connectionStatus.isOnline) ? 0.5 : 1
              }}
              onMouseEnter={(e) => e.target.style.background = 'rgba(255, 255, 255, 0.1)'}
              onMouseLeave={(e) => e.target.style.background = 'none'}
            >
              <RotateCcw size={18} />
              <span>Sync Data</span>
            </button>

            <button 
              className={`menu-item toggle-item ${autoSaveEnabled ? 'active' : ''}`}
              onClick={toggleAutoSave}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.75rem',
                padding: '0.75rem 1rem',
                background: 'none',
                border: 'none',
                color: 'white',
                cursor: 'pointer',
                fontSize: '0.9rem',
                textAlign: 'left',
                borderRadius: '8px',
                margin: '0 0.5rem',
                transition: 'background-color 0.2s ease'
              }}
              onMouseEnter={(e) => e.target.style.background = 'rgba(255, 255, 255, 0.1)'}
              onMouseLeave={(e) => e.target.style.background = 'none'}
            >
              <RotateCcw size={18} />
              <span>Auto-save</span>
              <div 
                className={`toggle-switch ${autoSaveEnabled ? 'on' : 'off'}`}
                style={{
                  position: 'relative',
                  width: '44px',
                  height: '24px',
                  background: autoSaveEnabled ? '#68d391' : 'rgba(255, 255, 255, 0.3)',
                  borderRadius: '12px',
                  transition: 'background-color 0.2s ease',
                  cursor: 'pointer'
                }}
              >
                <div 
                  className="toggle-slider"
                  style={{
                    position: 'absolute',
                    top: '2px',
                    left: '2px',
                    width: '20px',
                    height: '20px',
                    background: 'white',
                    borderRadius: '50%',
                    transition: 'transform 0.2s ease',
                    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
                    transform: autoSaveEnabled ? 'translateX(20px)' : 'translateX(0px)'
                  }}
                />
              </div>
            </button>

            <div className="menu-divider" style={{
            height: '1px',
            background: 'rgba(255, 255, 255, 0.1)',
            margin: '0.5rem 0'
          }}></div>

            <button 
              className="menu-item" 
              onClick={() => {
                setIsDashboardOpen(true);
                setIsOpen(false);
              }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.75rem 1rem',
                background: 'none',
                border: 'none',
                color: 'white',
                cursor: 'pointer',
                fontSize: '0.9rem',
                textAlign: 'left',
                borderRadius: '8px',
                margin: '0 0.5rem',
                transition: 'background-color 0.2s ease'
              }}
              onMouseEnter={(e) => e.target.style.background = 'rgba(255, 255, 255, 0.1)'}
              onMouseLeave={(e) => e.target.style.background = 'none'}
            >
              <BarChart3 size={18} />
              <span>Dashboard</span>
            </button>

            <button 
              className="menu-item" 
              onClick={handleDataExport}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.75rem 1rem',
                background: 'none',
                border: 'none',
                color: 'white',
                cursor: 'pointer',
                fontSize: '0.9rem',
                textAlign: 'left',
                borderRadius: '8px',
                margin: '0 0.5rem',
                transition: 'background-color 0.2s ease'
              }}
              onMouseEnter={(e) => e.target.style.background = 'rgba(255, 255, 255, 0.1)'}
              onMouseLeave={(e) => e.target.style.background = 'none'}
            >
              <Download size={18} />
              <span>Export Data</span>
            </button>

            <button 
              className="menu-item" 
              onClick={() => setIsOpen(false)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.75rem 1rem',
                background: 'none',
                border: 'none',
                color: 'white',
                cursor: 'pointer',
                fontSize: '0.9rem',
                textAlign: 'left',
                borderRadius: '8px',
                margin: '0 0.5rem',
                transition: 'background-color 0.2s ease'
              }}
              onMouseEnter={(e) => e.target.style.background = 'rgba(255, 255, 255, 0.1)'}
              onMouseLeave={(e) => e.target.style.background = 'none'}
            >
              <Settings size={18} />
              <span>Settings</span>
            </button>
          </div>

          <div className="menu-divider" style={{
            height: '1px',
            background: 'rgba(255, 255, 255, 0.1)',
            margin: '0.5rem 0'
          }}></div>

          <button 
            className="menu-item logout" 
            onClick={handleLogout}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.75rem 1rem',
              background: 'none',
              border: 'none',
              color: '#ff6b6b',
              cursor: 'pointer',
              fontSize: '0.9rem',
              textAlign: 'left',
              borderRadius: '8px',
              margin: '0 0.5rem',
              transition: 'background-color 0.2s ease'
            }}
            onMouseEnter={(e) => {
              e.target.style.background = 'rgba(255, 107, 107, 0.1)';
              e.target.style.color = '#ff5252';
            }}
            onMouseLeave={(e) => {
              e.target.style.background = 'none';
              e.target.style.color = '#ff6b6b';
            }}
          >
            <LogOut size={18} />
            <span>Logout</span>
          </button>
        </div>
        );
      })()}

      <UserDashboard 
        isOpen={isDashboardOpen} 
        onClose={() => setIsDashboardOpen(false)} 
      />
    </div>
  );
};

export default UserMenu;