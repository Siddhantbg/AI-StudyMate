// frontend/src/components/ThemeToggle.jsx
import React, { useState } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import '../styles/ThemeToggle.css';

const ThemeToggle = () => {
  const { cycleTheme, themeConfig, currentTheme } = useTheme();
  const [isChanging, setIsChanging] = useState(false);

  const handleThemeChange = () => {
    setIsChanging(true);
    cycleTheme();
    
    // Reset animation state
    setTimeout(() => setIsChanging(false), 300);
    
    // Announce theme change to screen readers (delayed to get new theme name)
    setTimeout(() => {
      const announcement = `Theme changed to ${themeConfig.name}`;
      const announcer = document.createElement('div');
      announcer.setAttribute('aria-live', 'polite');
      announcer.setAttribute('aria-atomic', 'true');
      announcer.className = 'sr-only';
      announcer.textContent = announcement;
      document.body.appendChild(announcer);
      
      setTimeout(() => {
        if (document.body.contains(announcer)) {
          document.body.removeChild(announcer);
        }
      }, 1000);
    }, 100);
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleThemeChange();
    }
  };

  return (
    <button 
      className={`theme-toggle-btn ${isChanging ? 'changing' : ''}`}
      onClick={handleThemeChange}
      onKeyDown={handleKeyDown}
      title={`Switch to next theme (Current: ${themeConfig.name})`}
      aria-label={`Current theme: ${themeConfig.name}. Click to cycle to next theme`}
      aria-describedby="theme-description"
      role="button"
      tabIndex={0}
    >
      <span className="theme-icon" aria-hidden="true">{themeConfig.icon}</span>
      <span className="theme-name">{themeConfig.name}</span>
      <span id="theme-description" className="sr-only">
        Cycles between Forest, Interstellar, and Spider-Venom themes
      </span>
    </button>
  );
};

export default ThemeToggle;