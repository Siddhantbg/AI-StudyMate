// FINAL WORKING FIX - PDFViewer.jsx
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { ZoomIn, ZoomOut, RotateCw, ChevronLeft, ChevronRight, Highlighter, MessageSquare, Pencil, Underline, Eraser } from 'lucide-react';
import pdfjsWorker from 'react-pdf/dist/pdf.worker.entry.js?url';

// Import required CSS for react-pdf v10
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// FIXED: Use different CDN that doesn't have CORS issues
pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;

console.log('PDF.js version:', pdfjs.version);
console.log('PDF.js worker configured:', pdfjs.GlobalWorkerOptions.workerSrc);

const PDFViewer = ({ file, currentPage, onPageChange, onLoadSuccess, uploadedFileName }) => {
  console.log('=== PDFViewer Debug Info ===');
  console.log('File received:', file);
  console.log('File type:', typeof file);
  console.log('File constructor:', file?.constructor?.name);
  console.log('Uploaded filename:', uploadedFileName);
  console.log('Current page:', currentPage);

  const [numPages, setNumPages] = useState(null);
  const [scale, setScale] = useState(1.0);
  const [rotation, setRotation] = useState(0);
  const [annotations, setAnnotations] = useState({});
  const [activeAnnotationTool, setActiveAnnotationTool] = useState(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawingPath, setDrawingPath] = useState([]);
  const [selectedText, setSelectedText] = useState(null);
  const [selectionCoords, setSelectionCoords] = useState(null);
  const canvasRef = useRef(null);
  const pageRef = useRef(null);
  const textLayerRef = useRef(null);

  // FIXED: Memoize options to prevent unnecessary reloads
  const documentOptions = useMemo(() => ({
    cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/standard_fonts/`,
    withCredentials: false
  }), []);

  // Text selection handling
  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = window.getSelection();
      if (selection.rangeCount > 0 && !selection.isCollapsed) {
        const range = selection.getRangeAt(0);
        const selectedTextContent = selection.toString();
        
        // Check if selection is within the PDF text layer
        const textLayer = textLayerRef.current;
        if (textLayer && textLayer.contains(range.commonAncestorContainer)) {
          const coords = getSelectionCoordinates(range, textLayer);
          setSelectedText(selectedTextContent);
          setSelectionCoords(coords);
        }
      } else {
        setSelectedText(null);
        setSelectionCoords(null);
      }
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, [currentPage]);

  // Enhanced coordinate calculation with viewport transformations
  const getSelectionCoordinates = (range, textLayer) => {
    try {
      const rects = range.getClientRects();
      const textLayerRect = textLayer.getBoundingClientRect();
      const pageContainer = pageRef.current;
      
      if (!pageContainer) return null;
      
      const coordinates = [];
      
      // Filter out zero-width/height rectangles and apply scaling
      for (let i = 0; i < rects.length; i++) {
        const rect = rects[i];
        
        // Skip zero-width or zero-height rectangles
        if (rect.width <= 0 || rect.height <= 0) continue;
        
        // Calculate relative coordinates with enhanced scale compensation
        const relativeX = (rect.left - textLayerRect.left);
        const relativeY = (rect.top - textLayerRect.top);
        const relativeWidth = rect.width;
        const relativeHeight = rect.height;
        
        // Apply rotation compensation if needed
        let finalCoords = {
          x: relativeX,
          y: relativeY,
          width: relativeWidth,
          height: relativeHeight
        };
        
        // Apply rotation transformation
        if (rotation !== 0) {
          finalCoords = applyRotationToCoords(finalCoords, rotation, pageContainer);
        }
        
        coordinates.push(finalCoords);
      }
      
      return coordinates.length > 0 ? coordinates : null;
    } catch (error) {
      console.warn('Error getting selection coordinates:', error);
      return null;
    }
  };

  // Apply rotation transformation to coordinates
  const applyRotationToCoords = (coords, rotationDegrees, container) => {
    if (rotationDegrees === 0) return coords;
    
    const containerRect = container.getBoundingClientRect();
    const centerX = containerRect.width / 2;
    const centerY = containerRect.height / 2;
    
    const radians = (rotationDegrees * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    
    // Translate to origin, rotate, then translate back
    const translatedX = coords.x - centerX;
    const translatedY = coords.y - centerY;
    
    const rotatedX = translatedX * cos - translatedY * sin;
    const rotatedY = translatedX * sin + translatedY * cos;
    
    return {
      ...coords,
      x: rotatedX + centerX,
      y: rotatedY + centerY
    };
  };

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
      file: typeof file,
      uploadedFileName 
    });
    setNumPages(numPages);
    onLoadSuccess({ numPages });
  };

  const onDocumentLoadError = (error) => {
    console.error('❌ Error loading PDF:', error);
    console.error('File object:', file);
    console.error('Worker source:', pdfjs.GlobalWorkerOptions.workerSrc);
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
    
    // Use text selection if available, otherwise fall back to click
    if (selectedText && selectionCoords && selectionCoords.length > 0) {
      createTextSelectionHighlight();
    } else {
      // Fallback to click-based highlighting
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
        color: '#ffff00',
        isLegacy: true // Mark as legacy click-based
      };

      setAnnotations(prev => ({
        ...prev,
        [pageKey]: [...(prev[pageKey] || []), newHighlight]
      }));
    }
  };

  // Create highlight based on text selection
  const createTextSelectionHighlight = () => {
    if (!selectedText || !selectionCoords) return;
    
    const pageKey = `page-${currentPage}`;
    const newHighlight = {
      id: Date.now(),
      type: 'highlight',
      text: selectedText,
      coordinates: selectionCoords,
      color: '#ffff00',
      isTextSelection: true
    };

    setAnnotations(prev => ({
      ...prev,
      [pageKey]: [...(prev[pageKey] || []), newHighlight]
    }));

    // Clear selection after highlighting
    window.getSelection().removeAllRanges();
    setSelectedText(null);
    setSelectionCoords(null);
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
    
    // Use text selection if available, otherwise fall back to click
    if (selectedText && selectionCoords && selectionCoords.length > 0) {
      createTextSelectionUnderline();
    } else {
      // Fallback to click-based underlining
      const rect = event.currentTarget.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      
      const pageKey = `page-${currentPage}`;
      const newUnderline = {
        id: Date.now(),
        type: 'underline',
        x: x,
        y: y + 15, // Position below click point
        width: 120,
        height: 3,
        color: '#dc2626',
        isLegacy: true // Mark as legacy click-based
      };

      setAnnotations(prev => ({
        ...prev,
        [pageKey]: [...(prev[pageKey] || []), newUnderline]
      }));
    }
  };

  // Create underline based on text selection
  const createTextSelectionUnderline = () => {
    if (!selectedText || !selectionCoords) return;
    
    const pageKey = `page-${currentPage}`;
    const newUnderline = {
      id: Date.now(),
      type: 'underline',
      text: selectedText,
      coordinates: selectionCoords.map(coord => ({
        ...coord,
        y: coord.y + coord.height - 2, // Position at text baseline
        height: 2 // Thinner underline
      })),
      color: '#dc2626',
      isTextSelection: true
    };

    setAnnotations(prev => ({
      ...prev,
      [pageKey]: [...(prev[pageKey] || []), newUnderline]
    }));

    // Clear selection after underlining
    window.getSelection().removeAllRanges();
    setSelectedText(null);
    setSelectionCoords(null);
  };

  // Erase annotation function
  const handleErase = (event) => {
    if (activeAnnotationTool !== 'erase') return;
    
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    // Find annotation at click position
    const pageKey = `page-${currentPage}`;
    const pageAnnotations = annotations[pageKey] || [];
    
    const annotationToRemove = findAnnotationAtPosition(x, y, pageAnnotations);
    
    if (annotationToRemove) {
      removeAnnotation(annotationToRemove.id);
      // Visual feedback for successful erase
      console.log('Annotation erased:', annotationToRemove.type);
    }
  };

  // Find annotation at specific position
  const findAnnotationAtPosition = (x, y, pageAnnotations) => {
    // Check in reverse order (top annotations first)
    for (let i = pageAnnotations.length - 1; i >= 0; i--) {
      const annotation = pageAnnotations[i];
      
      if (annotation.isTextSelection && annotation.coordinates) {
        // Check each coordinate rectangle for text-selection-based annotations
        for (const coord of annotation.coordinates) {
          if (isPointInRectangle(x, y, coord)) {
            return annotation;
          }
        }
      } else if (annotation.type === 'drawing') {
        // Check if point is near the drawing path
        if (isPointNearPath(x, y, annotation.path)) {
          return annotation;
        }
      } else {
        // Check legacy single-rectangle annotations
        if (isPointInRectangle(x, y, annotation)) {
          return annotation;
        }
      }
    }
    return null;
  };

  // Check if point is within rectangle bounds
  const isPointInRectangle = (x, y, rect) => {
    return x >= rect.x && 
           x <= rect.x + rect.width && 
           y >= rect.y && 
           y <= rect.y + rect.height;
  };

  // Check if point is near drawing path
  const isPointNearPath = (x, y, path, tolerance = 10) => {
    for (let i = 0; i < path.length - 1; i++) {
      const distance = distanceToLineSegment(x, y, path[i], path[i + 1]);
      if (distance <= tolerance) {
        return true;
      }
    }
    return false;
  };

  // Calculate distance from point to line segment
  const distanceToLineSegment = (px, py, lineStart, lineEnd) => {
    const dx = lineEnd.x - lineStart.x;
    const dy = lineEnd.y - lineStart.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    
    if (length === 0) return Math.sqrt((px - lineStart.x) ** 2 + (py - lineStart.y) ** 2);
    
    const t = Math.max(0, Math.min(1, ((px - lineStart.x) * dx + (py - lineStart.y) * dy) / (length * length)));
    const projection = {
      x: lineStart.x + t * dx,
      y: lineStart.y + t * dy
    };
    
    return Math.sqrt((px - projection.x) ** 2 + (py - projection.y) ** 2);
  };

  // Remove annotation by ID
  const removeAnnotation = (annotationId) => {
    const pageKey = `page-${currentPage}`;
    setAnnotations(prev => ({
      ...prev,
      [pageKey]: (prev[pageKey] || []).filter(annotation => annotation.id !== annotationId)
    }));
  };

  // Handle direct annotation click for erasing
  const handleAnnotationClick = (event, annotationId) => {
    if (activeAnnotationTool === 'erase') {
      event.stopPropagation(); // Prevent event bubbling to page container
      removeAnnotation(annotationId);
      console.log('Annotation erased via direct click:', annotationId);
    }
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
      case 'erase':
        handleErase(event);
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
          // Handle both text-selection-based and legacy click-based highlights
          if (annotation.isTextSelection && annotation.coordinates) {
            return annotation.coordinates.map((coord, index) => (
              <div
                key={`${annotation.id}-${index}`}
                className="annotation highlight-annotation"
                style={{
                  position: 'absolute',
                  left: coord.x,
                  top: coord.y,
                  width: coord.width,
                  height: coord.height,
                  backgroundColor: annotation.color,
                  opacity: 0.3,
                  pointerEvents: activeAnnotationTool === 'erase' ? 'auto' : 'none',
                  cursor: activeAnnotationTool === 'erase' ? 'pointer' : 'default'
                }}
                title={annotation.text}
                onClick={(e) => handleAnnotationClick(e, annotation.id)}
              />
            ));
          } else {
            // Legacy single rectangle highlight
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
                  pointerEvents: activeAnnotationTool === 'erase' ? 'auto' : 'none',
                  cursor: activeAnnotationTool === 'erase' ? 'pointer' : 'default'
                }}
                onClick={(e) => handleAnnotationClick(e, annotation.id)}
              />
            );
          }
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
                zIndex: 10,
                pointerEvents: activeAnnotationTool === 'erase' ? 'auto' : 'none',
                cursor: activeAnnotationTool === 'erase' ? 'pointer' : 'default'
              }}
              title={annotation.text}
              onClick={(e) => handleAnnotationClick(e, annotation.id)}
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
                pointerEvents: activeAnnotationTool === 'erase' ? 'auto' : 'none',
                zIndex: 5,
                cursor: activeAnnotationTool === 'erase' ? 'pointer' : 'default'
              }}
              onClick={(e) => handleAnnotationClick(e, annotation.id)}
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
          // Handle both text-selection-based and legacy click-based underlines
          if (annotation.isTextSelection && annotation.coordinates) {
            return annotation.coordinates.map((coord, index) => (
              <div
                key={`${annotation.id}-${index}`}
                className="annotation underline-annotation"
                style={{
                  position: 'absolute',
                  left: coord.x,
                  top: coord.y,
                  width: coord.width,
                  height: coord.height,
                  backgroundColor: annotation.color,
                  pointerEvents: activeAnnotationTool === 'erase' ? 'auto' : 'none',
                  cursor: activeAnnotationTool === 'erase' ? 'pointer' : 'default',
                  zIndex: 5
                }}
                title={annotation.text}
                onClick={(e) => handleAnnotationClick(e, annotation.id)}
              />
            ));
          } else {
            // Legacy single rectangle underline
            return (
              <div
                key={annotation.id}
                className="annotation underline-annotation"
                style={{
                  position: 'absolute',
                  left: annotation.x,
                  top: annotation.y + 15,
                  width: annotation.width,
                  height: annotation.height,
                  backgroundColor: annotation.color,
                  pointerEvents: activeAnnotationTool === 'erase' ? 'auto' : 'none',
                  cursor: activeAnnotationTool === 'erase' ? 'pointer' : 'default',
                  zIndex: 5
                }}
                onClick={(e) => handleAnnotationClick(e, annotation.id)}
              />
            );
          }
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
          
          <button
            onClick={() => setActiveAnnotationTool(
              activeAnnotationTool === 'erase' ? null : 'erase'
            )}
            className={`toolbar-btn ${activeAnnotationTool === 'erase' ? 'active' : ''}`}
            title="Erase annotations"
          >
            <Eraser size={20} />
          </button>
        </div>
      </div>

      {/* PDF Display */}
      <div className="pdf-display">
        <div 
          ref={pageRef}
          className={`pdf-page-container ${
            activeAnnotationTool ? 'annotation-active' : ''
          } ${
            activeAnnotationTool === 'highlight' ? 'highlight-active' : ''
          } ${
            activeAnnotationTool === 'underline' ? 'underline-active' : ''
          } ${
            activeAnnotationTool === 'erase' ? 'erase-active' : ''
          }`}
          onClick={handlePageClick}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          style={{ position: 'relative', display: 'inline-block' }}
        >
          <Document
            file={file}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            loading={<div className="pdf-loading">Loading PDF...</div>}
            error={<div className="pdf-error">Error loading PDF</div>}
            options={documentOptions}
          >
            <Page
              pageNumber={currentPage}
              scale={scale}
              rotate={rotation}
              className="pdf-page"
              renderTextLayer={true}
              renderAnnotationLayer={true}
              onGetTextSuccess={(textItems) => {
                // Store reference to text layer for selection detection
                setTimeout(() => {
                  const textLayer = pageRef.current?.querySelector('.react-pdf__Page__textContent');
                  if (textLayer) {
                    textLayerRef.current = textLayer;
                  }
                }, 100);
              }}
            />
          </Document>
          
          {/* Render annotations */}
          {renderAnnotations()}
          
          {/* Selection toolbar */}
          {selectedText && selectionCoords && (
            <div
              className="selection-toolbar"
              style={{
                position: 'absolute',
                left: Math.min(...selectionCoords.map(c => c.x)),
                top: Math.min(...selectionCoords.map(c => c.y)) - 40,
                zIndex: 100,
                background: 'white',
                border: '1px solid #ddd',
                borderRadius: '8px',
                padding: '4px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                display: 'flex',
                gap: '4px'
              }}
            >
              <button
                onClick={createTextSelectionHighlight}
                className="selection-toolbar-btn highlight-btn"
                title="Highlight selected text"
                style={{
                  background: '#ffff00',
                  border: 'none',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px'
                }}
              >
                <Highlighter size={14} />
              </button>
              <button
                onClick={createTextSelectionUnderline}
                className="selection-toolbar-btn underline-btn"
                title="Underline selected text"
                style={{
                  background: '#dc2626',
                  color: 'white',
                  border: 'none',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px'
                }}
              >
                <Underline size={14} />
              </button>
              <button
                onClick={() => {
                  const textToFind = selectedText;
                  if (textToFind) {
                    // Find and remove annotations that match the selected text
                    const pageKey = `page-${currentPage}`;
                    setAnnotations(prev => ({
                      ...prev,
                      [pageKey]: (prev[pageKey] || []).filter(annotation => 
                        annotation.text !== textToFind
                      )
                    }));
                  }
                  window.getSelection().removeAllRanges();
                  setSelectedText(null);
                  setSelectionCoords(null);
                }}
                className="selection-toolbar-btn erase-btn"
                title="Erase annotations with this text"
                style={{
                  background: '#ef4444',
                  color: 'white',
                  border: 'none',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px'
                }}
              >
                <Eraser size={14} />
              </button>
              <button
                onClick={() => {
                  window.getSelection().removeAllRanges();
                  setSelectedText(null);
                  setSelectionCoords(null);
                }}
                className="selection-toolbar-btn cancel-btn"
                title="Cancel selection"
                style={{
                  background: '#f3f4f6',
                  border: 'none',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px'
                }}
              >
                ✕
              </button>
            </div>
          )}
          
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

export default PDFViewer;