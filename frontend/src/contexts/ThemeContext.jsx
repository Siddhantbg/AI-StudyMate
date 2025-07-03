// frontend/src/contexts/ThemeContext.jsx
import React, { createContext, useContext, useState, useEffect } from 'react';
import { themeAnimations } from '../utils/themeAnimations';

const ThemeContext = createContext();

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export const themes = {
  FOREST: 'forest',
  INTERSTELLAR: 'interstellar',
  SPIDERMAN_VENOM: 'spiderman-venom'
};

export const themeConfig = {
  [themes.FOREST]: {
    name: 'Forest',
    icon: '🌲',
    cssClass: 'theme-forest'
  },
  [themes.INTERSTELLAR]: {
    name: 'Interstellar',
    icon: '🚀',
    cssClass: 'theme-interstellar'
  },
  [themes.SPIDERMAN_VENOM]: {
    name: 'Spider-Venom',
    icon: '🕷️',
    cssClass: 'theme-spiderman-venom'
  }
};

const getStoredTheme = () => {
  const stored = localStorage.getItem('pdf-viewer-theme');
  return stored && Object.values(themes).includes(stored) ? stored : themes.FOREST;
};

export const ThemeProvider = ({ children }) => {
  const [currentTheme, setCurrentTheme] = useState(getStoredTheme);
  
  useEffect(() => {
    // Apply theme to document root
    document.documentElement.className = '';
    document.documentElement.classList.add(themeConfig[currentTheme].cssClass);
    
    // Store theme preference
    localStorage.setItem('pdf-viewer-theme', currentTheme);
  }, [currentTheme]);

  const cycleTheme = () => {
    const themeKeys = Object.values(themes);
    const currentIndex = themeKeys.indexOf(currentTheme);
    const nextIndex = (currentIndex + 1) % themeKeys.length;
    const oldTheme = currentTheme;
    const newTheme = themeKeys[nextIndex];
    
    // Trigger theme animation
    themeAnimations.transitionTheme(oldTheme, newTheme);
    
    setCurrentTheme(newTheme);
  };

  const setTheme = (theme) => {
    if (Object.values(themes).includes(theme)) {
      setCurrentTheme(theme);
    }
  };

  return (
    <ThemeContext.Provider value={{
      currentTheme,
      setTheme,
      cycleTheme,
      themeConfig: themeConfig[currentTheme]
    }}>
      {children}
    </ThemeContext.Provider>
  );
};