import React, { useState, useEffect, useRef } from 'react';
import { 
  FileText, 
  MessageSquare, 
  HelpCircle, 
  Play, 
  Copy, 
  Check, 
  Loader2, 
  Clipboard,
  X,
  Plus,
  RotateCcw,
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const Sidebar = ({ uploadedFileName, currentPage, totalPages, onPageChange }) => {
  // Main state
  const [activeTab, setActiveTab] = useState('summarize');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState({});
  const [copiedStates, setCopiedStates] = useState({});
  const [error, setError] = useState(null);

  // Summarize tab state
  const [pageRangeFrom, setPageRangeFrom] = useState(1);
  const [pageRangeTo, setPageRangeTo] = useState(1);

  // Explain tab state
  const [explanationText, setExplanationText] = useState('');

  // Quiz tab state
  const [quizPages, setQuizPages] = useState([]);
  const [questionCount, setQuestionCount] = useState(5);

  const textareaRef = useRef(null);

  // Error handling
  const showError = (message) => {
    setError(message);
    setTimeout(() => setError(null), 5000); // Auto-dismiss after 5 seconds
  };

  const dismissError = () => {
    setError(null);
  };

  // Error Message Component
  const ErrorMessage = ({ message, onDismiss }) => (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="error-message"
    >
      <div className="error-content">
        <AlertCircle size={20} className="error-icon" />
        <span className="error-text">{message}</span>
        <button 
          className="error-dismiss"
          onClick={onDismiss}
          title="Dismiss error"
        >
          <X size={16} />
        </button>
      </div>
    </motion.div>
  );

  // Update quiz pages when current page changes
  useEffect(() => {
    if (currentPage && !quizPages.includes(currentPage)) {
      setQuizPages([currentPage]);
    }
  }, [currentPage]);

  // Update page range defaults
  useEffect(() => {
    if (currentPage) {
      setPageRangeFrom(currentPage);
      setPageRangeTo(Math.min(currentPage + 2, totalPages));
    }
  }, [currentPage, totalPages]);

  // API call helper
  const makeAPICall = async (endpoint, data) => {
    const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`API call failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  };

  // Extract PDF text helper
  const extractPDFText = async (pages = null) => {
    try {
      const data = { filename: uploadedFileName };
      if (pages) {
        data.pages = pages;
      }
      
      const response = await makeAPICall('/api/pdf/extract-text', data);
      return response.text || response.texts;
    } catch (error) {
      console.error('Failed to extract PDF text:', error);
      throw new Error('Failed to extract text from PDF');
    }
  };

  // Copy to clipboard functionality
  const copyToClipboard = async (text, key) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedStates({ ...copiedStates, [key]: true });
      setTimeout(() => {
        setCopiedStates({ ...copiedStates, [key]: false });
      }, 2000);
    } catch (error) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      
      setCopiedStates({ ...copiedStates, [key]: true });
      setTimeout(() => {
        setCopiedStates({ ...copiedStates, [key]: false });
      }, 2000);
    }
  };

  // Paste from clipboard
  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setExplanationText(text);
    } catch (error) {
      showError('Unable to paste from clipboard. Please paste manually.');
    }
  };

  // Summarize current page
  const summarizeCurrentPage = async () => {
    if (!uploadedFileName || !currentPage) return;

    setLoading(true);
    try {
      const text = await extractPDFText([currentPage]);
      const response = await makeAPICall('/api/gemini/summarize-page', {
        text: Array.isArray(text) ? text[0] : text,
        pageNumber: currentPage
      });

      setResults({
        ...results,
        currentPageSummary: {
          ...response,
          pageNumber: currentPage,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      showError(`Failed to summarize page: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Summarize page range
  const summarizePageRange = async () => {
    if (!uploadedFileName || pageRangeFrom > pageRangeTo || pageRangeFrom < 1 || pageRangeTo > totalPages) {
      showError('Please enter a valid page range');
      return;
    }

    setLoading(true);
    try {
      const pages = Array.from(
        { length: pageRangeTo - pageRangeFrom + 1 }, 
        (_, i) => pageRangeFrom + i
      );
      
      const texts = await extractPDFText(pages);
      const response = await makeAPICall('/api/gemini/summarize-range', {
        texts: Array.isArray(texts) ? texts : [texts],
        fromPage: pageRangeFrom,
        toPage: pageRangeTo
      });

      setResults({
        ...results,
        rangeSummary: {
          ...response,
          fromPage: pageRangeFrom,
          toPage: pageRangeTo,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      showError(`Failed to summarize page range: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Explain text
  const explainText = async () => {
    if (!explanationText.trim()) {
      showError('Please enter some text to explain');
      return;
    }

    setLoading(true);
    try {
      const response = await makeAPICall('/api/gemini/explain', {
        text: explanationText,
        context: `This text is from page ${currentPage} of ${uploadedFileName}`
      });

      setResults({
        ...results,
        explanation: {
          ...response,
          originalText: explanationText.substring(0, 200) + (explanationText.length > 200 ? '...' : ''),
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      showError(`Failed to explain text: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Generate quiz
  const generateQuiz = async () => {
    if (!uploadedFileName || quizPages.length === 0) {
      showError('Please select at least one page for the quiz');
      return;
    }

    setLoading(true);
    try {
      const response = await makeAPICall('/api/quiz/generate', {
        filename: uploadedFileName,
        pages: quizPages,
        questionCount: questionCount
      });

      setResults({
        ...results,
        quiz: {
          ...response,
          selectedPages: [...quizPages],
          questionCount: questionCount,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      showError(`Failed to generate quiz: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Toggle page in quiz selection
  const togglePageInQuiz = (page) => {
    if (quizPages.includes(page)) {
      setQuizPages(quizPages.filter(p => p !== page));
    } else {
      setQuizPages([...quizPages, page]);
    }
  };

  // Add page range to quiz
  const addPageRangeToQuiz = () => {
    const from = parseInt(pageRangeFrom);
    const to = parseInt(pageRangeTo);
    
    if (from > to || from < 1 || to > totalPages) {
      showError('Please enter a valid page range');
      return;
    }

    const newPages = Array.from({ length: to - from + 1 }, (_, i) => from + i);
    const uniquePages = [...new Set([...quizPages, ...newPages])].sort((a, b) => a - b);
    setQuizPages(uniquePages);
  };

  // Format timestamp
  const formatTimestamp = (timestamp) => {
    return new Date(timestamp).toLocaleString();
  };

  // Render copy button
  const renderCopyButton = (text, key) => (
    <button
      className="copy-button"
      onClick={() => copyToClipboard(text, key)}
      title="Copy to clipboard"
    >
      {copiedStates[key] ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );

  // Render quiz question
  const renderQuizQuestion = (question, index) => {
    const { type, question: questionText, options, correct_answer, explanation } = question;

    return (
      <div key={index} className="quiz-question">
        <div className="question-header">
          <span className="question-number">Q{index + 1}</span>
          <span className="question-type">{type.replace('_', ' ').toUpperCase()}</span>
        </div>
        
        <p className="question-text">{questionText}</p>
        
        {type === 'multiple_choice' && (
          <div className="quiz-options">
            {options.map((option, optIndex) => (
              <div 
                key={optIndex} 
                className={`option ${optIndex === correct_answer ? 'correct' : ''}`}
              >
                <span className="option-letter">{String.fromCharCode(65 + optIndex)}</span>
                <span className="option-text">{option}</span>
                {optIndex === correct_answer && <Check size={16} className="correct-icon" />}
              </div>
            ))}
          </div>
        )}
        
        {type === 'true_false' && (
          <div className="quiz-options">
            <div className={`option ${correct_answer === 0 ? 'correct' : ''}`}>
              <span className="option-text">True</span>
              {correct_answer === 0 && <Check size={16} className="correct-icon" />}
            </div>
            <div className={`option ${correct_answer === 1 ? 'correct' : ''}`}>
              <span className="option-text">False</span>
              {correct_answer === 1 && <Check size={16} className="correct-icon" />}
            </div>
          </div>
        )}
        
        {explanation && (
          <div className="question-explanation">
            <strong>Explanation:</strong> {explanation}
          </div>
        )}
      </div>
    );
  };

  if (!uploadedFileName) {
    return (
      <div className="sidebar forest-sidebar">
        <div className="sidebar-placeholder">
          <FileText size={48} />
          <h3>No PDF Loaded</h3>
          <p>Upload a PDF to start using AI features</p>
        </div>
      </div>
    );
  }

  return (
    <div className="sidebar forest-sidebar">
      <div className="sidebar-header">
        <div className="file-info">
          <FileText size={20} />
          <div>
            <h3>{uploadedFileName.replace(/\.[^/.]+$/, "")}</h3>
            <p>Page {currentPage} of {totalPages}</p>
          </div>
        </div>
      </div>

      <div className="sidebar-tabs">
        <button
          className={`tab-button ${activeTab === 'summarize' ? 'active' : ''}`}
          onClick={() => setActiveTab('summarize')}
        >
          <FileText size={16} />
          Summarize
        </button>
        <button
          className={`tab-button ${activeTab === 'explain' ? 'active' : ''}`}
          onClick={() => setActiveTab('explain')}
        >
          <MessageSquare size={16} />
          Explain
        </button>
        <button
          className={`tab-button ${activeTab === 'quiz' ? 'active' : ''}`}
          onClick={() => setActiveTab('quiz')}
        >
          <HelpCircle size={16} />
          Quiz Me
        </button>
      </div>

      {/* Error Message */}
      <AnimatePresence>
        {error && (
          <ErrorMessage message={error} onDismiss={dismissError} />
        )}
      </AnimatePresence>

      <div className="sidebar-content">
        <AnimatePresence mode="wait">
          {activeTab === 'summarize' && (
            <motion.div
              key="summarize"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="tab-content"
            >
              {/* Current Page Summary */}
              <div className="action-section">
                <h4>Current Page Summary</h4>
                <button
                  className="action-button"
                  onClick={summarizeCurrentPage}
                  disabled={loading}
                >
                  {loading ? <Loader2 size={16} className="spin" /> : <Play size={16} />}
                  Summarize Page {currentPage}
                </button>

                {results.currentPageSummary && (
                  <div className="result-card">
                    <div className="result-header">
                      <span>Page {results.currentPageSummary.pageNumber} Summary</span>
                      <div className="result-actions">
                        <span className="timestamp">{formatTimestamp(results.currentPageSummary.timestamp)}</span>
                        {renderCopyButton(results.currentPageSummary.summary, 'currentPage')}
                      </div>
                    </div>
                    <div className="result-content">
                      {results.currentPageSummary.summary}
                    </div>
                  </div>
                )}
              </div>

              {/* Page Range Summary */}
              <div className="action-section">
                <h4>Page Range Summary</h4>
                <div className="page-range-inputs">
                  <div className="input-group">
                    <label>From:</label>
                    <input
                      type="number"
                      className="page-input"
                      min="1"
                      max={totalPages}
                      value={pageRangeFrom}
                      onChange={(e) => setPageRangeFrom(parseInt(e.target.value) || 1)}
                    />
                  </div>
                  <div className="input-group">
                    <label>To:</label>
                    <input
                      type="number"
                      className="page-input"
                      min="1"
                      max={totalPages}
                      value={pageRangeTo}
                      onChange={(e) => setPageRangeTo(parseInt(e.target.value) || 1)}
                    />
                  </div>
                </div>
                <button
                  className="action-button"
                  onClick={summarizePageRange}
                  disabled={loading}
                >
                  {loading ? <Loader2 size={16} className="spin" /> : <Play size={16} />}
                  Summarize Pages {pageRangeFrom}-{pageRangeTo}
                </button>

                {results.rangeSummary && (
                  <div className="result-card">
                    <div className="result-header">
                      <span>Pages {results.rangeSummary.fromPage}-{results.rangeSummary.toPage} Summary</span>
                      <div className="result-actions">
                        <span className="timestamp">{formatTimestamp(results.rangeSummary.timestamp)}</span>
                        {renderCopyButton(results.rangeSummary.summary, 'range')}
                      </div>
                    </div>
                    <div className="result-content">
                      {results.rangeSummary.summary}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'explain' && (
            <motion.div
              key="explain"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="tab-content"
            >
              <div className="action-section">
                <h4>Explain Text</h4>
                <div className="textarea-container">
                  <textarea
                    ref={textareaRef}
                    className="explanation-textarea"
                    placeholder="Paste or type text you want explained..."
                    rows="8"
                    value={explanationText}
                    onChange={(e) => setExplanationText(e.target.value)}
                  />
                  <div className="textarea-actions">
                    <div className="char-counter">
                      {explanationText.length} characters
                    </div>
                    <div className="textarea-buttons">
                      <button
                        className="icon-button"
                        onClick={pasteFromClipboard}
                        title="Paste from clipboard"
                      >
                        <Clipboard size={16} />
                      </button>
                      <button
                        className="icon-button"
                        onClick={() => setExplanationText('')}
                        title="Clear text"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                </div>
                <button
                  className="action-button"
                  onClick={explainText}
                  disabled={loading || !explanationText.trim()}
                >
                  {loading ? <Loader2 size={16} className="spin" /> : <MessageSquare size={16} />}
                  Explain Text
                </button>

                {results.explanation && (
                  <div className="result-card">
                    <div className="result-header">
                      <span>Text Explanation</span>
                      <div className="result-actions">
                        <span className="timestamp">{formatTimestamp(results.explanation.timestamp)}</span>
                        {renderCopyButton(results.explanation.explanation, 'explanation')}
                      </div>
                    </div>
                    <div className="original-text">
                      <strong>Original text:</strong> {results.explanation.originalText}
                    </div>
                    <div className="result-content">
                      {results.explanation.explanation}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'quiz' && (
            <motion.div
              key="quiz"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="tab-content"
            >
              <div className="action-section">
                <h4>Generate Quiz</h4>
                
                {/* Question Count Selector */}
                <div className="quiz-settings">
                  <div className="input-group">
                    <label>Questions:</label>
                    <select
                      className="question-count-select"
                      value={questionCount}
                      onChange={(e) => setQuestionCount(parseInt(e.target.value))}
                    >
                      <option value={3}>3</option>
                      <option value={5}>5</option>
                      <option value={8}>8</option>
                      <option value={10}>10</option>
                      <option value={15}>15</option>
                      <option value={20}>20</option>
                    </select>
                  </div>
                </div>

                {/* Page Selection */}
                <div className="page-selection">
                  <div className="page-selection-header">
                    <span>Select Pages ({quizPages.length} selected)</span>
                    <div className="page-actions">
                      <button
                        className="small-button"
                        onClick={addPageRangeToQuiz}
                        title="Add page range"
                      >
                        <Plus size={14} />
                        Add Range ({pageRangeFrom}-{pageRangeTo})
                      </button>
                      <button
                        className="small-button"
                        onClick={() => setQuizPages([])}
                        title="Clear all"
                      >
                        <RotateCcw size={14} />
                        Clear All
                      </button>
                    </div>
                  </div>
                  
                  <div className="page-buttons">
                    {Array.from({ length: Math.min(24, totalPages) }, (_, i) => i + 1).map(page => (
                      <button
                        key={page}
                        className={`page-button ${quizPages.includes(page) ? 'selected' : ''} ${page === currentPage ? 'current' : ''}`}
                        onClick={() => togglePageInQuiz(page)}
                      >
                        {page}
                      </button>
                    ))}
                    {totalPages > 24 && (
                      <div className="page-overflow">
                        +{totalPages - 24} more pages
                      </div>
                    )}
                  </div>

                  {quizPages.length > 0 && (
                    <div className="selected-pages">
                      <strong>Selected pages:</strong> {quizPages.sort((a, b) => a - b).join(', ')}
                    </div>
                  )}
                </div>

                <button
                  className="action-button"
                  onClick={generateQuiz}
                  disabled={loading || quizPages.length === 0}
                >
                  {loading ? <Loader2 size={16} className="spin" /> : <HelpCircle size={16} />}
                  Generate {questionCount} Questions
                </button>

                {results.quiz && results.quiz.quiz && (
                  <div className="result-card quiz-results">
                    <div className="result-header">
                      <span>Quiz Results ({results.quiz.quiz.quiz.length} questions)</span>
                      <div className="result-actions">
                        <span className="timestamp">{formatTimestamp(results.quiz.timestamp)}</span>
                        {renderCopyButton(JSON.stringify(results.quiz.quiz.quiz, null, 2), 'quiz')}
                      </div>
                    </div>
                    <div className="quiz-info">
                      <p><strong>Pages:</strong> {results.quiz.selectedPages.join(', ')}</p>
                      <p><strong>Generated:</strong> {formatTimestamp(results.quiz.timestamp)}</p>
                    </div>
                    <div className="quiz-questions">
                      {results.quiz.quiz.quiz.map((question, index) => 
                        renderQuizQuestion(question, index)
                      )}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <style jsx>{`
        .sidebar {
          width: 380px;
          min-width: 350px;
          max-width: 420px;
          height: 100vh;
          background: linear-gradient(135deg, #f8f4e6 0%, #e8dcc0 100%);
          border-left: 3px solid #8b7355;
          display: flex;
          flex-direction: column;
          font-family: 'Inter', sans-serif;
          box-shadow: -4px 0 20px rgba(0, 0, 0, 0.1);
          flex-shrink: 0;
        }

        .forest-sidebar {
          background-image: 
            radial-gradient(circle at 20% 20%, rgba(139, 115, 85, 0.1) 0%, transparent 20%),
            radial-gradient(circle at 80% 80%, rgba(101, 67, 33, 0.1) 0%, transparent 20%);
        }

        .sidebar-placeholder {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: #8b7355;
          text-align: center;
          padding: 2rem;
        }

        .sidebar-placeholder svg {
          color: #8b7355;
          margin-bottom: 1rem;
        }

        .sidebar-header {
          padding: 1.5rem;
          border-bottom: 2px solid #d4c4a0;
          background: rgba(255, 255, 255, 0.3);
        }

        .file-info {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .file-info svg {
          color: #8b7355;
          flex-shrink: 0;
        }

        .file-info h3 {
          margin: 0;
          font-size: 16px;
          font-weight: 600;
          color: #654321;
          line-height: 1.2;
        }

        .file-info p {
          margin: 4px 0 0 0;
          font-size: 14px;
          color: #8b7355;
        }

        .sidebar-tabs {
          display: flex;
          background: rgba(255, 255, 255, 0.2);
          border-bottom: 2px solid #d4c4a0;
        }

        .tab-button {
          flex: 1;
          padding: 12px 8px;
          border: none;
          background: transparent;
          color: #8b7355;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          transition: all 0.2s ease;
          border-bottom: 3px solid transparent;
        }

        .tab-button:hover {
          background: rgba(139, 115, 85, 0.1);
          color: #654321;
        }

        .tab-button.active {
          background: rgba(139, 115, 85, 0.2);
          color: #654321;
          border-bottom-color: #8b7355;
        }

        .sidebar-content {
          flex: 1;
          overflow-y: auto;
          padding: 0;
        }

        .tab-content {
          padding: 1.5rem;
        }

        .action-section {
          margin-bottom: 2rem;
        }

        .action-section h4 {
          margin: 0 0 1rem 0;
          font-size: 16px;
          font-weight: 600;
          color: #654321;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .action-button {
          width: 100%;
          padding: 12px 16px;
          background: linear-gradient(135deg, #8b7355 0%, #a0875c 100%);
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: all 0.2s ease;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }

        .action-button:hover:not(:disabled) {
          background: linear-gradient(135deg, #9c8461 0%, #b59368 100%);
          transform: translateY(-1px);
          box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
        }

        .action-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
        }

        .small-button {
          padding: 6px 12px;
          background: rgba(139, 115, 85, 0.1);
          color: #8b7355;
          border: 1px solid #d4c4a0;
          border-radius: 6px;
          font-size: 12px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 4px;
          transition: all 0.2s ease;
        }

        .small-button:hover {
          background: rgba(139, 115, 85, 0.2);
        }

        .icon-button {
          padding: 8px;
          background: rgba(139, 115, 85, 0.1);
          color: #8b7355;
          border: 1px solid #d4c4a0;
          border-radius: 6px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
        }

        .icon-button:hover {
          background: rgba(139, 115, 85, 0.2);
        }

        .page-range-inputs {
          display: flex;
          gap: 12px;
          margin-bottom: 12px;
        }

        .input-group {
          flex: 1;
        }

        .input-group label {
          display: block;
          font-size: 12px;
          font-weight: 500;
          color: #8b7355;
          margin-bottom: 4px;
        }

        .page-input,
        .question-count-select {
          width: 100%;
          padding: 8px 12px;
          border: 2px solid #d4c4a0;
          border-radius: 6px;
          background: white;
          color: #654321;
          font-size: 14px;
        }

        .page-input:focus,
        .question-count-select:focus {
          outline: none;
          border-color: #8b7355;
          box-shadow: 0 0 0 3px rgba(139, 115, 85, 0.1);
        }

        .textarea-container {
          position: relative;
          margin-bottom: 12px;
        }

        .explanation-textarea {
          width: 100%;
          padding: 12px;
          border: 2px solid #d4c4a0;
          border-radius: 8px;
          background: white;
          color: #654321;
          font-size: 14px;
          font-family: inherit;
          resize: vertical;
          min-height: 120px;
        }

        .explanation-textarea:focus {
          outline: none;
          border-color: #8b7355;
          box-shadow: 0 0 0 3px rgba(139, 115, 85, 0.1);
        }

        .textarea-actions {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 8px;
        }

        .char-counter {
          font-size: 12px;
          color: #8b7355;
        }

        .textarea-buttons {
          display: flex;
          gap: 8px;
        }

        .quiz-settings {
          margin-bottom: 16px;
        }

        .page-selection {
          margin-bottom: 16px;
        }

        .page-selection-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
          font-size: 14px;
          font-weight: 500;
          color: #654321;
        }

        .page-actions {
          display: flex;
          gap: 8px;
        }

        .page-buttons {
          display: grid;
          grid-template-columns: repeat(6, 1fr);
          gap: 6px;
          margin-bottom: 12px;
        }

        .page-button {
          aspect-ratio: 1;
          border: 2px solid #d4c4a0;
          border-radius: 6px;
          background: white;
          color: #8b7355;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .page-button:hover {
          border-color: #8b7355;
          background: rgba(139, 115, 85, 0.1);
        }

        .page-button.selected {
          background: #8b7355;
          color: white;
          border-color: #8b7355;
        }

        .page-button.current {
          border-color: #654321;
          border-width: 3px;
        }

        .page-button.current.selected {
          border-color: #4a3118;
        }

        .page-overflow {
          grid-column: span 2;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          color: #8b7355;
          font-style: italic;
        }

        .selected-pages {
          font-size: 12px;
          color: #8b7355;
          padding: 8px;
          background: rgba(139, 115, 85, 0.1);
          border-radius: 6px;
        }

        .result-card {
          margin-top: 16px;
          background: white;
          border: 2px solid #d4c4a0;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }

        .result-header {
          padding: 12px 16px;
          background: rgba(139, 115, 85, 0.1);
          border-bottom: 1px solid #d4c4a0;
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 14px;
          font-weight: 600;
          color: #654321;
        }

        .result-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .timestamp {
          font-size: 11px;
          color: #8b7355;
          font-weight: normal;
        }

        .copy-button {
          padding: 4px;
          background: transparent;
          border: 1px solid #d4c4a0;
          border-radius: 4px;
          color: #8b7355;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
        }

        .copy-button:hover {
          background: rgba(139, 115, 85, 0.1);
          border-color: #8b7355;
        }

        .result-content {
          padding: 16px;
          line-height: 1.6;
          color: #654321;
          font-size: 14px;
        }

        .original-text {
          padding: 12px 16px;
          background: rgba(139, 115, 85, 0.05);
          border-bottom: 1px solid #d4c4a0;
          font-size: 13px;
          color: #8b7355;
          font-style: italic;
        }

        .quiz-info {
          padding: 12px 16px;
          background: rgba(139, 115, 85, 0.05);
          border-bottom: 1px solid #d4c4a0;
          font-size: 13px;
          color: #8b7355;
        }

        .quiz-info p {
          margin: 4px 0;
        }

        .quiz-questions {
          padding: 16px;
        }

        .quiz-question {
          margin-bottom: 24px;
          padding: 16px;
          background: rgba(139, 115, 85, 0.02);
          border-radius: 8px;
          border-left: 4px solid #8b7355;
        }

        .question-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }

        .question-number {
          background: #8b7355;
          color: white;
          padding: 4px 8px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 600;
        }

        .question-type {
          font-size: 11px;
          color: #8b7355;
          background: rgba(139, 115, 85, 0.1);
          padding: 2px 6px;
          border-radius: 8px;
        }

        .question-text {
          font-size: 14px;
          font-weight: 500;
          color: #654321;
          margin-bottom: 12px;
          line-height: 1.5;
        }

        .quiz-options {
          margin-bottom: 12px;
        }

        .option {
          display: flex;
          align-items: center;
          padding: 8px 12px;
          margin-bottom: 6px;
          background: white;
          border: 1px solid #d4c4a0;
          border-radius: 6px;
          transition: all 0.2s ease;
        }

        .option.correct {
          background: rgba(34, 197, 94, 0.1);
          border-color: rgba(34, 197, 94, 0.3);
          color: #166534;
        }

        .option-letter {
          background: #8b7355;
          color: white;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 600;
          margin-right: 12px;
          flex-shrink: 0;
        }

        .option.correct .option-letter {
          background: #22c55e;
        }

        .option-text {
          flex: 1;
          font-size: 14px;
        }

        .correct-icon {
          color: #22c55e;
          margin-left: 8px;
        }

        .question-explanation {
          padding: 12px;
          background: rgba(139, 115, 85, 0.05);
          border-radius: 6px;
          font-size: 13px;
          color: #8b7355;
          line-height: 1.5;
        }

        /* Error Message Styles */
        .error-message {
          margin: 12px 16px;
          background: rgba(220, 38, 38, 0.1);
          border: 2px solid rgba(220, 38, 38, 0.3);
          border-radius: 8px;
          overflow: hidden;
        }

        .error-content {
          display: flex;
          align-items: center;
          padding: 12px 16px;
          gap: 12px;
        }

        .error-icon {
          color: #dc2626;
          flex-shrink: 0;
        }

        .error-text {
          flex: 1;
          color: #7f1d1d;
          font-size: 14px;
          font-weight: 500;
          line-height: 1.4;
        }

        .error-dismiss {
          background: transparent;
          border: none;
          color: #dc2626;
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
          flex-shrink: 0;
        }

        .error-dismiss:hover {
          background: rgba(220, 38, 38, 0.1);
          color: #991b1b;
        }

        .spin {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        /* Scrollbar styling */
        .sidebar-content::-webkit-scrollbar {
          width: 6px;
        }

        .sidebar-content::-webkit-scrollbar-track {
          background: rgba(139, 115, 85, 0.1);
        }

        .sidebar-content::-webkit-scrollbar-thumb {
          background: rgba(139, 115, 85, 0.3);
          border-radius: 3px;
        }

        .sidebar-content::-webkit-scrollbar-thumb:hover {
          background: rgba(139, 115, 85, 0.5);
        }

        /* Responsive adjustments */
        @media (max-width: 768px) {
          .sidebar {
            width: 100%;
            height: auto;
            border-left: none;
            border-top: 3px solid #8b7355;
          }
          
          .page-buttons {
            grid-template-columns: repeat(4, 1fr);
          }
        }
      `}</style>
    </div>
  );
};

export default Sidebar;