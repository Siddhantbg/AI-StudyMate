// React component for displaying file processing status

import React from 'react';
import { 
  Clock, 
  CheckCircle, 
  XCircle, 
  Loader2, 
  RotateCcw, 
  Play,
  AlertCircle,
  Info
} from 'lucide-react';
import { useFileProcessing } from '../hooks/useFileProcessing';
import './ProcessingStatus.css';

const ProcessingStatus = ({ 
  fileId, 
  showControls = true, 
  autoStart = true,
  onComplete = null,
  onFailed = null,
  compact = false 
}) => {
  const {
    processingStatus,
    processingData,
    isPolling,
    pollCount,
    queuePosition,
    error,
    formattedStatus,
    getStatus,
    startPolling,
    stopPolling,
    triggerProcessing,
    retryProcessing,
    isCompleted,
    isFailed,
    isPending,
    isProcessing,
    needsProcessing
  } = useFileProcessing(fileId, {
    autoStart,
    showToasts: true,
    onComplete,
    onFailed
  });

  // Get status icon
  const getStatusIcon = () => {
    if (isPolling && (isPending || isProcessing)) {
      return <Loader2 className="processing-icon spinning" size={compact ? 16 : 20} />;
    }

    switch (processingStatus) {
      case 'completed':
        return <CheckCircle className="status-icon completed" size={compact ? 16 : 20} />;
      case 'failed':
        return <XCircle className="status-icon failed" size={compact ? 16 : 20} />;
      case 'processing':
        return <Loader2 className="status-icon processing spinning" size={compact ? 16 : 20} />;
      case 'pending':
        return <Clock className="status-icon pending" size={compact ? 16 : 20} />;
      default:
        return <AlertCircle className="status-icon unknown" size={compact ? 16 : 20} />;
    }
  };

  // Get status message
  const getStatusMessage = () => {
    if (error) {
      return `Error: ${error}`;
    }

    if (!processingStatus) {
      return 'Checking status...';
    }

    let message = formattedStatus?.description || processingStatus;

    if (isPolling) {
      if (queuePosition && queuePosition > 0) {
        message += ` (Position in queue: ${queuePosition})`;
      }
      if (pollCount > 0) {
        message += ` - Checking... (${pollCount})`;
      }
    }

    return message;
  };

  // Handle manual trigger
  const handleTrigger = async () => {
    await triggerProcessing('normal');
  };

  // Handle retry
  const handleRetry = async () => {
    await retryProcessing();
  };

  // Handle refresh status
  const handleRefresh = async () => {
    await getStatus();
  };

  // Compact view
  if (compact) {
    return (
      <div className={`processing-status compact ${processingStatus || 'unknown'}`}>
        {getStatusIcon()}
        <span className="status-text">{formattedStatus?.label || 'Unknown'}</span>
        {showControls && (
          <div className="status-controls">
            {isFailed && (
              <button 
                onClick={handleRetry}
                className="control-btn retry"
                title="Retry processing"
              >
                <RotateCcw size={14} />
              </button>
            )}
            {(isPending || processingStatus === null) && (
              <button 
                onClick={handleTrigger}
                className="control-btn trigger"
                title="Trigger processing"
              >
                <Play size={14} />
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  // Full view
  return (
    <div className={`processing-status ${processingStatus || 'unknown'}`}>
      <div className="status-header">
        {getStatusIcon()}
        <div className="status-info">
          <div className="status-title">
            {formattedStatus?.label || 'Processing Status'}
          </div>
          <div className="status-message">
            {getStatusMessage()}
          </div>
        </div>
      </div>

      {processingData && (
        <div className="processing-details">
          {processingData.file.num_pages && (
            <div className="detail-item">
              <span className="detail-label">Pages:</span>
              <span className="detail-value">{processingData.file.num_pages}</span>
            </div>
          )}
          
          {processingData.file.has_extracted_text && (
            <div className="detail-item">
              <span className="detail-label">Text Extracted:</span>
              <span className="detail-value">✓</span>
            </div>
          )}
          
          {queuePosition && queuePosition > 0 && (
            <div className="detail-item">
              <span className="detail-label">Queue Position:</span>
              <span className="detail-value">{queuePosition}</span>
            </div>
          )}
          
          {isPolling && (
            <div className="detail-item">
              <span className="detail-label">Status Checks:</span>
              <span className="detail-value">{pollCount}</span>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="error-message">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {showControls && (
        <div className="status-controls">
          {isFailed && (
            <button 
              onClick={handleRetry}
              className="control-btn retry"
              title="Retry processing"
            >
              <RotateCcw size={16} />
              Retry
            </button>
          )}
          
          {(isPending || processingStatus === null) && (
            <button 
              onClick={handleTrigger}
              className="control-btn trigger"
              title="Trigger processing"
            >
              <Play size={16} />
              Process Now
            </button>
          )}
          
          <button 
            onClick={handleRefresh}
            className="control-btn refresh"
            title="Refresh status"
          >
            <Info size={16} />
            Refresh
          </button>
          
          {isPolling && (
            <button 
              onClick={stopPolling}
              className="control-btn stop"
              title="Stop checking status"
            >
              Stop Checking
            </button>
          )}
          
          {!isPolling && needsProcessing && (
            <button 
              onClick={startPolling}
              className="control-btn start"
              title="Start checking status"
            >
              Start Checking
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default ProcessingStatus;