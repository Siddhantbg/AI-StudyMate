import React, { useState, useRef, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { ZoomIn, ZoomOut, RotateCw, ChevronLeft, ChevronRight, Highlighter, MessageSquare, Pencil, Underline } from 'lucide-react';

// Import required CSS for react-pdf v10
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Configure PDF.js worker with multiple fallbacks
const configurePDFWorker = () => {
  try {
    // Try to use local worker from node_modules (best for Vite)
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.js',
      import.meta.url
    ).toString();
    console.log('PDF.js worker configured (local):', pdfjs.GlobalWorkerOptions.workerSrc);
  } catch (error) {
    console.warn('Failed to configure local PDF worker, using CDN fallback:', error);
    // Fallback to CDN
    pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`;
    console.log('PDF.js worker configured (CDN):', pdfjs.GlobalWorkerOptions.workerSrc);
  }
};

// Initialize worker
configurePDFWorker();

const PDFViewer = ({ file, currentPage, onPageChange, onLoadSuccess, uploadedFileName }) => {
  // Enhanced debugging
  console.log('=== PDFViewer Debug Info ===');
  console.log('File received:', file);
  console.log('File type:', typeof file);
  console.log('File constructor:', file?.constructor?.name);
  console.log('Uploaded filename:', uploadedFileName);
  console.log('Current page:', currentPage);
  
  // Validate file object
  const isValidFile = file && (file instanceof File || file instanceof Blob || typeof file === 'string');

  const [numPages, setNumPages] = useState(null);
  const [scale, setScale] = useState(1.0);
  const [rotation, setRotation] = useState(0);
  const [annotations, setAnnotations] = useState({});
  const [activeAnnotationTool, setActiveAnnotationTool] = useState(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawingPath, setDrawingPath] = useState([]);
  const [loadingStrategy, setLoadingStrategy] = useState('file'); // 'file' or 'url'
  const [pdfUrl, setPdfUrl] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const canvasRef = useRef(null);
  const pageRef = useRef(null);

  // Initialize PDF URL for fallback loading
  useEffect(() => {
    if (uploadedFileName && !pdfUrl) {
      const url = `${import.meta.env.VITE_API_BASE_URL}/api/files/${uploadedFileName}`;
      setPdfUrl(url);
      console.log('Generated PDF URL for fallback:', url);
    }
  }, [uploadedFileName, pdfUrl]);

  // Reset error state when file changes
  useEffect(() => {
    setLoadError(null);
    setLoadingStrategy('file');
  }, [file]);

  // Annotation persistence functions
  const saveAnnotations = (pageAnnotations, filename, page) => {
    if (!filename) return;
    const key = `annotations-${filename}-page-${page}`;
    localStorage.setItem(key, JSON.stringify(pageAnnotations));
  };

  const loadAnnotations = (filename, page) => {
    if (!filename) return [];
    const key = `annotations-${filename}-page-${page}`;
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : [];
  };

  // Load annotations when page or file changes
  useEffect(() => {
    if (uploadedFileName && currentPage) {
      const savedAnnotations = loadAnnotations(uploadedFileName, currentPage);
      const pageKey = `page-${currentPage}`;
      setAnnotations(prev => ({
        ...prev,
        [pageKey]: savedAnnotations
      }));
    }
  }, [uploadedFileName, currentPage]);

  // Save annotations when they change
  useEffect(() => {
    if (uploadedFileName && currentPage) {
      const pageKey = `page-${currentPage}`;
      const pageAnnotations = annotations[pageKey] || [];
      if (pageAnnotations.length > 0) {
        saveAnnotations(pageAnnotations, uploadedFileName, currentPage);
      }
    }
  }, [annotations, uploadedFileName, currentPage]);

  const onDocumentLoadSuccess = ({ numPages }) => {
    console.log('✅ PDF loaded successfully:', { 
      numPages, 
      strategy: loadingStrategy,
      file: typeof file,
      uploadedFileName 
    });
    setNumPages(numPages);
    setLoadError(null);
    onLoadSuccess({ numPages });
  };

  const onDocumentLoadError = (error) => {
    console.error('❌ Error loading PDF:', error);
    console.error('Current strategy:', loadingStrategy);
    console.error('File object:', file);
    console.error('PDF URL:', pdfUrl);
    console.error('Worker source:', pdfjs.GlobalWorkerOptions.workerSrc);
    
    // Implement fallback strategy
    if (loadingStrategy === 'file' && pdfUrl) {
      console.log('🔄 Switching to URL loading strategy...');
      setLoadingStrategy('url');
      setLoadError(null);
    } else {
      console.error('💥 All loading strategies failed');
      setLoadError(error.message || 'Failed to load PDF document');
    }
  };

  const handleZoomIn = () => {
    setScale(prev => Math.min(prev + 0.2, 3.0));
  };

  const handleZoomOut = () => {
    setScale(prev => Math.max(prev - 0.2, 0.5));
  };

  const handleRotate = () => {
    setRotation(prev => (prev + 90) % 360);
  };

  const goToPrevPage = () => {
    if (currentPage > 1) {
      onPageChange(currentPage - 1);
    }
  };

  const goToNextPage = () => {
    if (currentPage < numPages) {
      onPageChange(currentPage + 1);
    }
  };

  // Annotation Tools
  const handleHighlight = (event) => {
    if (activeAnnotationTool !== 'highlight') return;
    
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    const pageKey = `page-${currentPage}`;
    const newHighlight = {
      id: Date.now(),
      type: 'highlight',
      x: x,
      y: y,
      width: 100,
      height: 20,
      color: '#ffff00'
    };

    setAnnotations(prev => ({
      ...prev,
      [pageKey]: [...(prev[pageKey] || []), newHighlight]
    }));
  };

  const handleComment = (event) => {
    if (activeAnnotationTool !== 'comment') return;
    
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    const commentText = prompt('Enter your comment:');
    if (!commentText) return;

    const pageKey = `page-${currentPage}`;
    const newComment = {
      id: Date.now(),
      type: 'comment',
      x: x,
      y: y,
      text: commentText,
      color: '#ff6b6b'
    };

    setAnnotations(prev => ({
      ...prev,
      [pageKey]: [...(prev[pageKey] || []), newComment]
    }));
  };

  const handleUnderline = (event) => {
    if (activeAnnotationTool !== 'underline') return;
    
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    const pageKey = `page-${currentPage}`;
    const newUnderline = {
      id: Date.now(),
      type: 'underline',
      x: x,
      y: y,
      width: 120,
      height: 3,
      color: '#dc2626'
    };

    setAnnotations(prev => ({
      ...prev,
      [pageKey]: [...(prev[pageKey] || []), newUnderline]
    }));
  };

  // Drawing functionality
  const startDrawing = (event) => {
    if (activeAnnotationTool !== 'draw') return;
    
    setIsDrawing(true);
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    setDrawingPath([{ x, y }]);
  };

  const draw = (event) => {
    if (!isDrawing || activeAnnotationTool !== 'draw') return;
    
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    setDrawingPath(prev => [...prev, { x, y }]);
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    
    setIsDrawing(false);
    if (drawingPath.length > 1) {
      const pageKey = `page-${currentPage}`;
      const newDrawing = {
        id: Date.now(),
        type: 'drawing',
        path: [...drawingPath],
        color: '#2196f3',
        strokeWidth: 2
      };

      setAnnotations(prev => ({
        ...prev,
        [pageKey]: [...(prev[pageKey] || []), newDrawing]
      }));
    }
    setDrawingPath([]);
  };

  const handlePageClick = (event) => {
    switch (activeAnnotationTool) {
      case 'highlight':
        handleHighlight(event);
        break;
      case 'comment':
        handleComment(event);
        break;
      case 'underline':
        handleUnderline(event);
        break;
      default:
        break;
    }
  };

  const renderAnnotations = () => {
    const pageKey = `page-${currentPage}`;
    const pageAnnotations = annotations[pageKey] || [];

    return pageAnnotations.map(annotation => {
      switch (annotation.type) {
        case 'highlight':
          return (
            <div
              key={annotation.id}
              className="annotation highlight-annotation"
              style={{
                position: 'absolute',
                left: annotation.x,
                top: annotation.y,
                width: annotation.width,
                height: annotation.height,
                backgroundColor: annotation.color,
                opacity: 0.3,
                pointerEvents: 'none'
              }}
            />
          );
        case 'comment':
          return (
            <div
              key={annotation.id}
              className="annotation comment-annotation"
              style={{
                position: 'absolute',
                left: annotation.x,
                top: annotation.y,
                backgroundColor: annotation.color,
                color: 'white',
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '12px',
                maxWidth: '200px',
                zIndex: 10
              }}
              title={annotation.text}
            >
              💬 {annotation.text.substring(0, 20)}...
            </div>
          );
        case 'drawing':
          return (
            <svg
              key={annotation.id}
              className="annotation drawing-annotation"
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
                zIndex: 5
              }}
            >
              <polyline
                points={annotation.path.map(p => `${p.x},${p.y}`).join(' ')}
                fill="none"
                stroke={annotation.color}
                strokeWidth={annotation.strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          );
        case 'underline':
          return (
            <div
              key={annotation.id}
              className="annotation underline-annotation"
              style={{
                position: 'absolute',
                left: annotation.x,
                top: annotation.y + 15, // Position slightly below click point
                width: annotation.width,
                height: annotation.height,
                backgroundColor: annotation.color,
                pointerEvents: 'none',
                zIndex: 5
              }}
            />
          );
        default:
          return null;
      }
    });
  };

  return (
    <div className="pdf-viewer">
      {/* Toolbar */}
      <div className="pdf-toolbar">
        <div className="toolbar-section">
          <button
            onClick={goToPrevPage}
            disabled={currentPage <= 1}
            className="toolbar-btn"
            title="Previous page"
          >
            <ChevronLeft size={20} />
          </button>
          
          <span className="page-info">
            {currentPage} / {numPages || '--'}
          </span>
          
          <button
            onClick={goToNextPage}
            disabled={currentPage >= numPages}
            className="toolbar-btn"
            title="Next page"
          >
            <ChevronRight size={20} />
          </button>
        </div>

        <div className="toolbar-section">
          <button
            onClick={handleZoomOut}
            className="toolbar-btn"
            title="Zoom out"
          >
            <ZoomOut size={20} />
          </button>
          
          <span className="zoom-info">{Math.round(scale * 100)}%</span>
          
          <button
            onClick={handleZoomIn}
            className="toolbar-btn"
            title="Zoom in"
          >
            <ZoomIn size={20} />
          </button>
          
          <button
            onClick={handleRotate}
            className="toolbar-btn"
            title="Rotate"
          >
            <RotateCw size={20} />
          </button>
        </div>

        <div className="toolbar-section annotation-tools">
          <button
            onClick={() => setActiveAnnotationTool(
              activeAnnotationTool === 'highlight' ? null : 'highlight'
            )}
            className={`toolbar-btn ${activeAnnotationTool === 'highlight' ? 'active' : ''}`}
            title="Highlight"
          >
            <Highlighter size={20} />
          </button>
          
          <button
            onClick={() => setActiveAnnotationTool(
              activeAnnotationTool === 'comment' ? null : 'comment'
            )}
            className={`toolbar-btn ${activeAnnotationTool === 'comment' ? 'active' : ''}`}
            title="Add comment"
          >
            <MessageSquare size={20} />
          </button>
          
          <button
            onClick={() => setActiveAnnotationTool(
              activeAnnotationTool === 'draw' ? null : 'draw'
            )}
            className={`toolbar-btn ${activeAnnotationTool === 'draw' ? 'active' : ''}`}
            title="Draw"
          >
            <Pencil size={20} />
          </button>
          
          <button
            onClick={() => setActiveAnnotationTool(
              activeAnnotationTool === 'underline' ? null : 'underline'
            )}
            className={`toolbar-btn ${activeAnnotationTool === 'underline' ? 'active' : ''}`}
            title="Underline"
          >
            <Underline size={20} />
          </button>
        </div>
      </div>

      {/* PDF Display */}
      <div className="pdf-display">
        <div 
          className="pdf-page-container"
          onClick={handlePageClick}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          style={{ position: 'relative', display: 'inline-block' }}
        >
          <Document
            file={loadingStrategy === 'file' ? file : pdfUrl}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            loading={
              <div className="pdf-loading">
                <div className="loading-spinner"></div>
                <p>Loading PDF... ({loadingStrategy === 'file' ? 'Direct' : 'URL'} method)</p>
              </div>
            }
            error={
              <div className="pdf-error">
                <p>❌ Error loading PDF</p>
                {loadError && <p className="error-details">{loadError}</p>}
                {loadingStrategy === 'url' && (
                  <p className="retry-info">All loading methods failed. Please try uploading again.</p>
                )}
              </div>
            }
            options={{
              cMapUrl: 'https://unpkg.com/pdfjs-dist@3.11.174/cmaps/',
              cMapPacked: true,
              standardFontDataUrl: 'https://unpkg.com/pdfjs-dist@3.11.174/standard_fonts/',
            }}
          >
            <Page
              pageNumber={currentPage}
              scale={scale}
              rotate={rotation}
              renderTextLayer={true}
              renderAnnotationLayer={true}
              className="pdf-page"
            />
          </Document>
          
          {/* Render annotations */}
          {renderAnnotations()}
          
          {/* Drawing preview */}
          {isDrawing && drawingPath.length > 1 && (
            <svg
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
                zIndex: 10
              }}
            >
              <polyline
                points={drawingPath.map(p => `${p.x},${p.y}`).join(' ')}
                fill="none"
                stroke="#2196f3"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </div>
      </div>
    </div>
  );
};

// Validation wrapper component
const ValidatedPDFViewer = (props) => {
  const { file, uploadedFileName } = props;
  
  // Show loading message if no file yet
  if (!file && !uploadedFileName) {
    return (
      <div className="pdf-viewer">
        <div className="pdf-display">
          <div className="pdf-loading">
            <p>Please upload a PDF file to begin viewing</p>
          </div>
        </div>
      </div>
    );
  }

  // Show error if file is invalid
  if (file && !(file instanceof File || file instanceof Blob || typeof file === 'string')) {
    return (
      <div className="pdf-viewer">
        <div className="pdf-display">
          <div className="pdf-error">
            <p>❌ Invalid file format</p>
            <p className="error-details">Expected: File, Blob, or URL string</p>
            <p className="retry-info">Please upload a valid PDF file</p>
          </div>
        </div>
      </div>
    );
  }

  return <PDFViewer {...props} />;
};

export default ValidatedPDFViewer;