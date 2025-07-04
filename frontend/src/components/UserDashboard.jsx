import React, { useState, useEffect } from 'react';
import { 
  User, 
  BookOpen, 
  Clock, 
  BarChart3, 
  Star, 
  TrendingUp, 
  Calendar,
  FileText,
  Target,
  Award,
  Timer,
  Download,
  X
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

const UserDashboard = ({ isOpen, onClose }) => {
  const [stats, setStats] = useState(null);
  const [recentActivity, setRecentActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user, makeAuthenticatedRequest } = useAuth();
  const { showToast } = useToast();

  useEffect(() => {
    if (isOpen) {
      loadDashboardData();
    }
  }, [isOpen]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      // Load multiple data sources in parallel
      const [filesResponse, quizResponse, analyticsResponse] = await Promise.all([
        makeAuthenticatedRequest(`${import.meta.env.VITE_API_BASE_URL}/api/files`),
        makeAuthenticatedRequest(`${import.meta.env.VITE_API_BASE_URL}/api/quiz/stats`),
        makeAuthenticatedRequest(`${import.meta.env.VITE_API_BASE_URL}/api/data-export/reading-analytics`)
      ]);

      const filesData = await filesResponse.json();
      const quizData = await quizResponse.json();
      const analyticsData = await analyticsResponse.json();

      // Process and combine data
      const files = filesData.files || [];
      const quizStats = quizData.data?.stats || {};
      const readingStats = analyticsData.data?.summary || {};
      const recentFiles = files.slice(0, 5);

      setStats({
        totalFiles: files.length,
        totalReadingTime: readingStats.total_time_spent || 0,
        totalQuizzes: quizStats.total_quizzes || 0,
        averageQuizScore: quizStats.average_score || 0,
        bestQuizScore: quizStats.best_score || 0,
        completionRate: quizStats.completion_rate || 0,
        pagesRead: readingStats.total_pages_read || 0,
        bookmarkedPages: readingStats.bookmarked_pages || 0,
        improvementTrend: quizStats.improvement_trend || 'neutral'
      });

      setRecentActivity(recentFiles);

    } catch (error) {
      console.error('Error loading dashboard data:', error);
      showToast('Failed to load dashboard data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (seconds) => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    return `${Math.round(seconds / 3600)}h ${Math.round((seconds % 3600) / 60)}m`;
  };

  const getTrendIcon = (trend) => {
    switch (trend) {
      case 'improving': return <TrendingUp className="trend-icon improving" size={16} />;
      case 'declining': return <TrendingUp className="trend-icon declining" size={16} style={{ transform: 'rotate(180deg)' }} />;
      default: return <TrendingUp className="trend-icon stable" size={16} style={{ transform: 'rotate(90deg)' }} />;
    }
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
  };

  if (!isOpen) return null;

  return (
    <div className="dashboard-overlay">
      <div className="dashboard-modal">
        <div className="dashboard-header">
          <div className="dashboard-title">
            <BarChart3 size={24} />
            <h2>Dashboard</h2>
          </div>
          <button className="close-button" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {loading ? (
          <div className="dashboard-loading">
            <div className="loading-spinner"></div>
            <p>Loading your statistics...</p>
          </div>
        ) : (
          <div className="dashboard-content">
            {/* User Info */}
            <div className="user-profile-section">
              <div className="user-avatar-large">
                <User size={32} />
              </div>
              <div className="user-info">
                <h3>{user?.username}</h3>
                <p>{user?.email}</p>
                <div className="member-since">
                  <Calendar size={14} />
                  Member since {new Date(user?.created_at).toLocaleDateString()}
                </div>
              </div>
              <button className="export-button" onClick={handleDataExport}>
                <Download size={16} />
                Export Data
              </button>
            </div>

            {/* Statistics Grid */}
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-icon">
                  <FileText size={24} />
                </div>
                <div className="stat-content">
                  <h4>Total Files</h4>
                  <div className="stat-value">{stats?.totalFiles || 0}</div>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon">
                  <Clock size={24} />
                </div>
                <div className="stat-content">
                  <h4>Reading Time</h4>
                  <div className="stat-value">{formatTime(stats?.totalReadingTime || 0)}</div>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon">
                  <BookOpen size={24} />
                </div>
                <div className="stat-content">
                  <h4>Pages Read</h4>
                  <div className="stat-value">{stats?.pagesRead || 0}</div>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon">
                  <Target size={24} />
                </div>
                <div className="stat-content">
                  <h4>Quizzes Taken</h4>
                  <div className="stat-value">{stats?.totalQuizzes || 0}</div>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon">
                  <Award size={24} />
                </div>
                <div className="stat-content">
                  <h4>Average Score</h4>
                  <div className="stat-value">{stats?.averageQuizScore || 0}%</div>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon">
                  <Star size={24} />
                </div>
                <div className="stat-content">
                  <h4>Best Score</h4>
                  <div className="stat-value">{stats?.bestQuizScore || 0}%</div>
                </div>
              </div>
            </div>

            {/* Performance Insights */}
            <div className="insights-section">
              <h3>Performance Insights</h3>
              <div className="insights-grid">
                <div className="insight-card">
                  <div className="insight-header">
                    <h4>Quiz Performance</h4>
                    {getTrendIcon(stats?.improvementTrend)}
                  </div>
                  <p className="insight-text">
                    {stats?.improvementTrend === 'improving' && "You're improving! Keep up the great work."}
                    {stats?.improvementTrend === 'stable' && "Your performance is consistent. Try challenging yourself with harder questions."}
                    {stats?.improvementTrend === 'declining' && "Consider reviewing your notes and taking more time with questions."}
                  </p>
                </div>

                <div className="insight-card">
                  <div className="insight-header">
                    <h4>Reading Habits</h4>
                    <Timer size={16} />
                  </div>
                  <p className="insight-text">
                    You've read {stats?.pagesRead || 0} pages with an average of{' '}
                    {stats?.pagesRead > 0 
                      ? Math.round((stats?.totalReadingTime || 0) / stats.pagesRead) 
                      : 0}s per page.
                  </p>
                </div>
              </div>
            </div>

            {/* Recent Activity */}
            <div className="recent-activity-section">
              <h3>Recent Files</h3>
              <div className="activity-list">
                {recentActivity.length > 0 ? (
                  recentActivity.map((file, index) => (
                    <div key={file.id || index} className="activity-item">
                      <FileText size={20} />
                      <div className="activity-content">
                        <div className="activity-title">{file.fileName}</div>
                        <div className="activity-meta">
                          {file.lastReadPage && `Last read: Page ${file.lastReadPage}`}
                          {file.totalReadTime && ` • ${formatTime(file.totalReadTime)} total`}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="no-activity">
                    <p>No files uploaded yet. Start by uploading your first PDF!</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default UserDashboard;