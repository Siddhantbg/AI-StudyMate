import React, { useState } from 'react';
import { TreePine } from 'lucide-react';
import LoginForm from './LoginForm';
import RegisterForm from './RegisterForm';
import ThemeToggle from '../ThemeToggle';

const AuthPage = () => {
  const [isLogin, setIsLogin] = useState(true);

  return (
    <div className="auth-page">
      <div className="auth-header-bar">
        <div className="auth-logo-section">
          <TreePine size={28} className="logo-icon" />
          <span className="app-title">Forest PDF Viewer</span>
        </div>
        <ThemeToggle />
      </div>

      <div className="auth-content">
        <div className="auth-background">
          <div className="auth-pattern"></div>
        </div>
        
        {isLogin ? (
          <LoginForm onSwitchToRegister={() => setIsLogin(false)} />
        ) : (
          <RegisterForm onSwitchToLogin={() => setIsLogin(true)} />
        )}
      </div>
    </div>
  );
};

export default AuthPage;