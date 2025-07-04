import React, { useState } from 'react';
import { User, Mail, Lock, Eye, EyeOff, UserPlus } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';

const RegisterForm = ({ onSwitchToLogin }) => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const { showToast } = useToast();

  const validateForm = () => {
    if (!firstName || !lastName || !email || !password || !confirmPassword) {
      showToast('Please fill in all fields', 'error');
      return false;
    }

    if (firstName.length < 1) {
      showToast('First name is required', 'error');
      return false;
    }

    if (lastName.length < 1) {
      showToast('Last name is required', 'error');
      return false;
    }

    if (password.length < 8) {
      showToast('Password must be at least 8 characters long', 'error');
      return false;
    }

    // Check for password complexity (uppercase, lowercase, number)
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/;
    if (!passwordRegex.test(password)) {
      showToast('Password must contain at least one lowercase letter, one uppercase letter, and one number', 'error');
      return false;
    }

    if (password !== confirmPassword) {
      showToast('Passwords do not match', 'error');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setLoading(true);
    
    try {
      const result = await register(firstName, lastName, email, password);
      
      if (result.success) {
        showToast('Account created successfully! Welcome to Forest PDF Viewer.', 'success');
      } else {
        showToast(result.error, 'error');
      }
    } catch (error) {
      showToast('Registration failed. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-form-container">
      <div className="auth-form">
        <div className="auth-header">
          <UserPlus size={32} className="auth-icon" />
          <h2>Create Account</h2>
          <p>Join Forest PDF Viewer and start your reading journey</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form-content">
          <div className="form-group">
            <label htmlFor="firstName">First Name</label>
            <div className="input-wrapper">
              <User size={20} className="input-icon" />
              <input
                id="firstName"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Enter your first name"
                required
                autoComplete="given-name"
                minLength={1}
                maxLength={50}
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="lastName">Last Name</label>
            <div className="input-wrapper">
              <User size={20} className="input-icon" />
              <input
                id="lastName"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Enter your last name"
                required
                autoComplete="family-name"
                minLength={1}
                maxLength={50}
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="email">Email Address</label>
            <div className="input-wrapper">
              <Mail size={20} className="input-icon" />
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                required
                autoComplete="email"
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <div className="input-wrapper">
              <Lock size={20} className="input-icon" />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Create a password"
                required
                autoComplete="new-password"
                minLength={8}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm Password</label>
            <div className="input-wrapper">
              <Lock size={20} className="input-icon" />
              <input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm your password"
                required
                autoComplete="new-password"
                minLength={8}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                tabIndex={-1}
              >
                {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className={`auth-submit-button ${loading ? 'loading' : ''}`}
            disabled={loading}
          >
            {loading ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            Already have an account?{' '}
            <button
              type="button"
              className="auth-link-button"
              onClick={onSwitchToLogin}
            >
              Sign in here
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default RegisterForm;