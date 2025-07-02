// Enhanced Sidebar.jsx with navigation arrows and better quiz display
import React, { useState, useRef, useEffect } from 'react';
import { 
  Brain, 
  HelpCircle, 
  FileText, 
  ArrowRight, 
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Loader, 
  Copy,
  CheckCircle,
  AlertCircle,
  Lightbulb,
  Clipboard,
  X
} from 'lucide-react';

const Sidebar = ({ uploadedFileName, currentPage, totalPages, onPageChange }) => {
  const [activeTab, setActiveTab] = useState('summarize');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState({});
  const [pageRangeFrom, setPageRangeFrom] = useState(1);
  const [pageRangeTo, setPageRangeTo] = useState(1);
  const [explanationText, setExplanationText] = useState('');
  const [quizPages, setQuizPages] = useState([currentPage]);
  const [questionCount, setQuestionCount] = useState(5);
  const [copiedStates, setCopiedStates] = useState({});
  const [pageNavigationStart, setPageNavigationStart] = useState(1); // For pagination
  const textareaRef = useRef(null);

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
  const PAGES_PER_VIEW = 24; // Show 24 pages at a time

  // Update quiz pages when current page changes
  useEffect(() => {
    if (!quizPages.includes(currentPage)) {
      setQuizPages(prev => [...prev, currentPage].sort((a, b) => a - b));
    }
  }, [currentPage]);

  // Update page range defaults
  useEffect(() => {
    setPageRangeFrom(Math.max(1, currentPage));
    setPageRangeTo(Math.min(totalPages, currentPage + 2));
  }, [currentPage, totalPages]);

  // Extract text from PDF for AI processing
  const extractPDFText = async (filename, pages = null) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/pdf/extract-text`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filename: filename,
          pages: pages
        }),
      });

      const result = await response.json();
      if (result.success) {
        return result.text;
      } else {
        throw new Error(result.error || 'Failed to extract text');
      }
    } catch (error) {
      console.error('Text extraction error:', error);
      throw error;
    }
  };

  // Summarize current page
  const handleSummarizeCurrentPage = async () => {
    if (!uploadedFileName) return;

    setLoading(true);
    try {
      const text = await extractPDFText(uploadedFileName);
      
      const response = await fetch(`${API_BASE_URL}/api/gemini/summarize-page`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: text,
          pageNumber: currentPage
        }),
      });

      const result = await response.json();
      if (result.success) {
        setResults(prev => ({
          ...prev,
          currentPageSummary: {
            content: result.summary,
            page: currentPage,
            timestamp: result.timestamp
          }
        }));
      } else {
        throw new Error(result.error || 'Failed to summarize page');
      }
    } catch (error) {
      console.error('Summarization error:', error);
      alert('Failed to summarize page: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Summarize page range
  const handleSummarizePageRange = async () => {
    if (!uploadedFileName) return;

    if (pageRangeFrom > pageRangeTo || pageRangeFrom < 1 || pageRangeTo > totalPages) {
      alert('Please enter a valid page range');
      return;
    }

    setLoading(true);
    try {
      const text = await extractPDFText(uploadedFileName);
      
      const response = await fetch(`${API_BASE_URL}/api/gemini/summarize-range`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          texts: [text],
          fromPage: pageRangeFrom,
          toPage: pageRangeTo
        }),
      });

      const result = await response.json();
      if (result.success) {
        setResults(prev => ({
          ...prev,
          pageRangeSummary: {
            content: result.summary,
            fromPage: pageRangeFrom,
            toPage: pageRangeTo,
            timestamp: result.timestamp
          }
        }));
      } else {
        throw new Error(result.error || 'Failed to summarize page range');
      }
    } catch (error) {
      console.error('Page range summarization error:', error);
      alert('Failed to summarize page range: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Explain pasted text
  const handleExplainText = async () => {
    if (!explanationText.trim()) {
      alert('Please enter some text to explain');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/gemini/explain`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: explanationText.trim(),
          context: `From PDF: ${uploadedFileName || 'Unknown'}`
        }),
      });

      const result = await response.json();
      if (result.success) {
        setResults(prev => ({
          ...prev,
          textExplanation: {
            content: result.explanation,
            originalText: explanationText.trim(),
            timestamp: result.timestamp
          }
        }));
      } else {
        throw new Error(result.error || 'Failed to explain text');
      }
    } catch (error) {
      console.error('Text explanation error:', error);
      alert('Failed to explain text: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Generate quiz
  const handleGenerateQuiz = async () => {
    if (!uploadedFileName || quizPages.length === 0) {
      alert('Please select pages for quiz generation');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/quiz/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filename: uploadedFileName,
          pages: quizPages,
          questionCount: questionCount
        }),
      });

      const result = await response.json();
      if (result.success) {
        setResults(prev => ({
          ...prev,
          quiz: {
            content: result.quiz,
            pages: quizPages,
            questionCount: questionCount,
            timestamp: result.metadata.generatedAt
          }
        }));
      } else {
        throw new Error(result.error || 'Failed to generate quiz');
      }
    } catch (error) {
      console.error('Quiz generation error:', error);
      alert('Failed to generate quiz: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Copy result to clipboard
  const copyToClipboard = async (text, type) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedStates(prev => ({ ...prev, [type]: true }));
      setTimeout(() => {
        setCopiedStates(prev => ({ ...prev, [type]: false }));
      }, 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      alert('Failed to copy to clipboard');
    }
  };

  // Paste text from clipboard
  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setExplanationText(text);
    } catch (error) {
      console.error('Failed to paste from clipboard:', error);
      alert('Failed to paste from clipboard. Please paste manually.');
    }
  };

  // Add/remove pages for quiz
  const toggleQuizPage = (page) => {
    setQuizPages(prev => 
      prev.includes(page) 
        ? prev.filter(p => p !== page)
        : [...prev, page].sort((a, b) => a - b)
    );
  };

  // Quick add page range for quiz
  const addPageRangeToQuiz = () => {
    const from = parseInt(pageRangeFrom);
    const to = parseInt(pageRangeTo);
    if (from <= to && from >= 1 && to <= totalPages) {
      const newPages = Array.from({ length: to - from + 1 }, (_, i) => from + i);
      setQuizPages(prev => {
        const combined = [...new Set([...prev, ...newPages])];
        return combined.sort((a, b) => a - b);
      });
    }
  };

  // Clear all selected quiz pages
  const clearQuizPages = () => {
    setQuizPages([]);
  };

  // Navigation functions for page cycling
  const goToPreviousPageSet = () => {
    setPageNavigationStart(prev => Math.max(1, prev - PAGES_PER_VIEW));
  };

  const goToNextPageSet = () => {
    setPageNavigationStart(prev => Math.min(totalPages - PAGES_PER_VIEW + 1, prev + PAGES_PER_VIEW));
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'summarize':
        return (
          <div className="tab-content">
            <div className="action-section">
              <h3>📄 Current Page Summary</h3>
              <p>Get AI-powered summary of page {currentPage}</p>
              <button 
                onClick={handleSummarizeCurrentPage}
                disabled={loading || !uploadedFileName}
                className="action-button primary"
              >
                {loading ? <Loader className="spinning" size={16} /> : <Brain size={16} />}
                Summarize Page {currentPage}
              </button>
              
              {results.currentPageSummary && (
                <div className="result-card">
                  <div className="result-header">
                    <h4>Page {results.currentPageSummary.page} Summary</h4>
                    <button 
                      onClick={() => copyToClipboard(results.currentPageSummary.content, 'currentPage')}
                      className="copy-button"
                      title="Copy to clipboard"
                    >
                      {copiedStates.currentPage ? <CheckCircle size={14} /> : <Copy size={14} />}
                    </button>
                  </div>
                  <div className="result-content">
                    {results.currentPageSummary.content}
                  </div>
                  <div className="result-timestamp">
                    Generated: {new Date(results.currentPageSummary.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              )}
            </div>

            <div className="action-section">
              <h3>📚 Page Range Summary</h3>
              <div className="page-range-inputs">
                <div className="input-group">
                  <label>From Page:</label>
                  <input
                    type="number"
                    min="1"
                    max={totalPages}
                    value={pageRangeFrom}
                    onChange={(e) => setPageRangeFrom(parseInt(e.target.value) || 1)}
                    className="page-input"
                  />
                </div>
                <div className="input-group">
                  <label>To Page:</label>
                  <input
                    type="number"
                    min="1"
                    max={totalPages}
                    value={pageRangeTo}
                    onChange={(e) => setPageRangeTo(parseInt(e.target.value) || 1)}
                    className="page-input"
                  />
                </div>
              </div>
              
              <div className="range-actions">
                <button 
                  onClick={handleSummarizePageRange}
                  disabled={loading || !uploadedFileName}
                  className="action-button primary"
                >
                  {loading ? <Loader className="spinning" size={16} /> : <FileText size={16} />}
                  Summarize Pages {pageRangeFrom}-{pageRangeTo}
                </button>
                
                <button 
                  onClick={() => {
                    setPageRangeFrom(currentPage);
                    setPageRangeTo(currentPage);
                  }}
                  className="action-button secondary small"
                >
                  Current Page
                </button>
              </div>

              {results.pageRangeSummary && (
                <div className="result-card">
                  <div className="result-header">
                    <h4>Pages {results.pageRangeSummary.fromPage}-{results.pageRangeSummary.toPage} Summary</h4>
                    <button 
                      onClick={() => copyToClipboard(results.pageRangeSummary.content, 'pageRange')}
                      className="copy-button"
                    >
                      {copiedStates.pageRange ? <CheckCircle size={14} /> : <Copy size={14} />}
                    </button>
                  </div>
                  <div className="result-content">
                    {results.pageRangeSummary.content}
                  </div>
                  <div className="result-timestamp">
                    Generated: {new Date(results.pageRangeSummary.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              )}
            </div>
          </div>
        );

      case 'explain':
        return (
          <div className="tab-content">
            <div className="action-section">
              <h3>🧠 Text Explanation</h3>
              <p>Paste any text for detailed AI explanation</p>
              
              <div className="textarea-container">
                <textarea
                  ref={textareaRef}
                  value={explanationText}
                  onChange={(e) => setExplanationText(e.target.value)}
                  placeholder="Paste text here to get detailed explanation...

Examples:
• Complex technical terms
• Scientific concepts  
• Mathematical formulas
• Historical references
• Any confusing passages"
                  className="explanation-textarea"
                  rows={8}
                />
                <div className="textarea-actions">
                  <button 
                    onClick={handlePasteFromClipboard}
                    className="action-button secondary small"
                    title="Paste from clipboard"
                  >
                    <Clipboard size={16} />
                    Paste
                  </button>
                  <button 
                    onClick={() => setExplanationText('')}
                    className="action-button secondary small"
                    title="Clear text"
                  >
                    <X size={16} />
                    Clear
                  </button>
                </div>
              </div>
              
              <button 
                onClick={handleExplainText}
                disabled={loading || !explanationText.trim()}
                className="action-button primary"
              >
                {loading ? <Loader className="spinning" size={16} /> : <Lightbulb size={16} />}
                Explain Text ({explanationText.length} characters)
              </button>

              {results.textExplanation && (
                <div className="result-card">
                  <div className="result-header">
                    <h4>Text Explanation</h4>
                    <button 
                      onClick={() => copyToClipboard(results.textExplanation.content, 'explanation')}
                      className="copy-button"
                    >
                      {copiedStates.explanation ? <CheckCircle size={14} /> : <Copy size={14} />}
                    </button>
                  </div>
                  <div className="original-text">
                    <strong>Original text:</strong> "{results.textExplanation.originalText.substring(0, 100)}{results.textExplanation.originalText.length > 100 ? '...' : ''}"
                  </div>
                  <div className="result-content">
                    {results.textExplanation.content}
                  </div>
                  <div className="result-timestamp">
                    Generated: {new Date(results.textExplanation.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              )}
            </div>
          </div>
        );

      case 'quiz':
        return (
          <div className="tab-content">
            <div className="action-section">
              <h3>🎯 Quiz Generator</h3>
              <p>Generate quiz questions from selected pages</p>
              
              <div className="quiz-settings">
                <div className="input-group">
                  <label>Number of Questions:</label>
                  <select 
                    value={questionCount} 
                    onChange={(e) => setQuestionCount(parseInt(e.target.value))}
                    className="question-count-select"
                  >
                    <option value={3}>3 Questions</option>
                    <option value={5}>5 Questions</option>
                    <option value={8}>8 Questions</option>
                    <option value={10}>10 Questions</option>
                  </select>
                </div>

                <div className="page-selection">
                  <div className="page-selection-header">
                    <label>Select Pages for Quiz:</label>
                    <div className="page-selection-actions">
                      <button
                        onClick={addPageRangeToQuiz}
                        className="action-button secondary small"
                        title="Add page range to quiz"
                      >
                        + Add Range ({pageRangeFrom}-{pageRangeTo})
                      </button>
                      <button
                        onClick={clearQuizPages}
                        className="action-button secondary small"
                        title="Clear all selected pages"
                      >
                        Clear All
                      </button>
                    </div>
                  </div>
                  
                  {/* FIXED: Added navigation arrows and better layout */}
                  <div className="page-buttons-container">
                    <div className="page-navigation">
                      <button
                        onClick={goToPreviousPageSet}
                        disabled={pageNavigationStart <= 1}
                        className="nav-arrow-btn"
                        title="Previous pages"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      
                      <span className="page-range-indicator">
                        Pages {pageNavigationStart}-{Math.min(pageNavigationStart + PAGES_PER_VIEW - 1, totalPages)}
                      </span>
                      
                      <button
                        onClick={goToNextPageSet}
                        disabled={pageNavigationStart + PAGES_PER_VIEW > totalPages}
                        className="nav-arrow-btn"
                        title="Next pages"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                    
                    <div className="page-buttons">
                      {Array.from({ length: Math.min(PAGES_PER_VIEW, totalPages - pageNavigationStart + 1) }, (_, i) => {
                        const page = pageNavigationStart + i;
                        return (
                          <button
                            key={page}
                            onClick={() => toggleQuizPage(page)}
                            className={`page-button ${quizPages.includes(page) ? 'selected' : ''} ${page === currentPage ? 'current' : ''}`}
                            title={`Page ${page}${page === currentPage ? ' (current)' : ''}`}
                          >
                            {page}
                          </button>
                        );
                      })}
                    </div>
                    
                    {totalPages > PAGES_PER_VIEW && (
                      <div className="page-note">
                        <p>Showing {PAGES_PER_VIEW} pages at a time. Use arrows to navigate through all {totalPages} pages.</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="selected-pages">
                  <strong>Selected pages ({quizPages.length}):</strong> 
                  <span className="pages-list">
                    {quizPages.length > 0 ? quizPages.join(', ') : 'None selected'}
                  </span>
                </div>
              </div>

              <button 
                onClick={handleGenerateQuiz}
                disabled={loading || !uploadedFileName || quizPages.length === 0}
                className="action-button primary"
              >
                {loading ? <Loader className="spinning" size={16} /> : <HelpCircle size={16} />}
                Generate {questionCount} Questions from {quizPages.length} page{quizPages.length !== 1 ? 's' : ''}
              </button>

              {/* FIXED: Better quiz results display with proper scrolling */}
              {results.quiz && (
                <div className="result-card quiz-results">
                  <div className="result-header">
                    <h4>Generated Quiz</h4>
                    <button 
                      onClick={() => copyToClipboard(JSON.stringify(results.quiz.content, null, 2), 'quiz')}
                      className="copy-button"
                      title="Copy quiz data as JSON"
                    >
                      {copiedStates.quiz ? <CheckCircle size={14} /> : <Copy size={14} />}
                    </button>
                  </div>
                  <div className="quiz-info">
                    <p><strong>Pages:</strong> {results.quiz.pages.join(', ')}</p>
                    <p><strong>Questions:</strong> {results.quiz.questionCount}</p>
                    <p><strong>Generated:</strong> {new Date(results.quiz.timestamp).toLocaleString()}</p>
                  </div>
                  <div className="quiz-content-container">
                    <div className="result-content quiz-content">
                      {results.quiz.content.quiz ? (
                        results.quiz.content.quiz.map((question, index) => (
                          <div key={index} className="quiz-question">
                            <h5>Question {index + 1} ({question.type?.replace('_', ' ') || 'Question'})</h5>
                            <p className="question-text"><strong>{question.question}</strong></p>
                            
                            {question.options && (
                              <ul className="quiz-options">
                                {question.options.map((option, optIndex) => (
                                  <li 
                                    key={optIndex} 
                                    className={optIndex === question.correct_answer ? 'correct' : ''}
                                  >
                                    <span className="option-letter">{String.fromCharCode(65 + optIndex)}.</span>
                                    {option} 
                                    {optIndex === question.correct_answer && <span className="correct-indicator"> ✓</span>}
                                  </li>
                                ))}
                              </ul>
                            )}
                            
                            {question.correct_answer === true && (
                              <p className="true-false-answer"><strong>Answer:</strong> True ✓</p>
                            )}
                            {question.correct_answer === false && (
                              <p className="true-false-answer"><strong>Answer:</strong> False ✗</p>
                            )}
                            
                            {question.sample_answer && (
                              <div className="sample-answer">
                                <strong>Sample Answer:</strong> {question.sample_answer}
                              </div>
                            )}
                            
                            {question.key_points && (
                              <div className="key-points">
                                <strong>Key Points:</strong>
                                <ul>
                                  {question.key_points.map((point, pointIndex) => (
                                    <li key={pointIndex}>{point}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            
                            {question.explanation && (
                              <p className="quiz-explanation">
                                <strong>Explanation:</strong> <em>{question.explanation}</em>
                              </p>
                            )}
                          </div>
                        ))
                      ) : (
                        <div className="quiz-text-content">
                          <h5>Quiz Content (Text Format)</h5>
                          <pre>{typeof results.quiz.content === 'string' 
                            ? results.quiz.content 
                            : JSON.stringify(results.quiz.content, null, 2)}</pre>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="sidebar forest-sidebar">
      <div className="sidebar-header">
        <h2>🌿 AI Assistant</h2>
        <p className="sidebar-subtitle">Powered by Gemini AI</p>
        {uploadedFileName && (
          <div className="file-info">
            <p className="file-name">📄 {uploadedFileName.split('-').pop()}</p>
          </div>
        )}
      </div>

      <div className="sidebar-tabs">
        <button
          onClick={() => setActiveTab('summarize')}
          className={`tab-button ${activeTab === 'summarize' ? 'active' : ''}`}
        >
          <FileText size={16} />
          Summarize
        </button>
        <button
          onClick={() => setActiveTab('explain')}
          className={`tab-button ${activeTab === 'explain' ? 'active' : ''}`}
        >
          <Lightbulb size={16} />
          Explain
        </button>
        <button
          onClick={() => setActiveTab('quiz')}
          className={`tab-button ${activeTab === 'quiz' ? 'active' : ''}`}
        >
          <HelpCircle size={16} />
          Quiz Me
        </button>
      </div>

      <div className="sidebar-content">
        {uploadedFileName ? renderTabContent() : (
          <div className="sidebar-placeholder">
            <AlertCircle size={48} className="placeholder-icon" />
            <h3>Upload a PDF to get started</h3>
            <p>Once you upload a PDF file, you'll be able to:</p>
            <ul className="feature-list">
              <li>📝 Generate AI summaries</li>
              <li>🧠 Get text explanations</li>
              <li>🎯 Create custom quizzes</li>
              <li>🌿 Focus on your learning</li>
            </ul>
          </div>
        )}
      </div>

      {loading && (
        <div className="loading-indicator">
          <Loader className="spinning" size={20} />
          <span>AI is thinking...</span>
        </div>
      )}
    </div>
  );
};

export default Sidebar;