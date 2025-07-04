// FINAL WORKING FIX - PDFViewer.jsx
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { ZoomIn, ZoomOut, RotateCw, ChevronLeft, ChevronRight, Highlighter, MessageSquare, Pencil, Underline, Eraser, Brain, StickyNote } from 'lucide-react';
import pdfjsWorker from 'react-pdf/dist/pdf.worker.entry.js?url';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { useHybridAPI } from '../utils/hybridAPI';
import { useConnectionStatus } from '../utils/connectionStatus';

// Import required CSS for react-pdf v10
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// FIXED: Use different CDN that doesn't have CORS issues
pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;

console.log('PDF.js version:', pdfjs.version);
console.log('PDF.js worker configured:', pdfjs.GlobalWorkerOptions.workerSrc);

const PDFViewer = ({ file, currentPage, onPageChange, onLoadSuccess, uploadedFileName, fileId }) => {
  console.log('=== PDFViewer Debug Info ===');
  console.log('File received:', file);
  console.log('File type:', typeof file);
  console.log('File constructor:', file?.constructor?.name);
  console.log('Uploaded filename:', uploadedFileName);
  console.log('Current page:', currentPage);
  console.log('FileId for database:', fileId);

  // Toast notifications and APIs
  const { showToast } = useToast();
  const { makeAuthenticatedRequest, user } = useAuth();
  const hybridAPI = useHybridAPI();
  const connectionStatus = useConnectionStatus();

  const [numPages, setNumPages] = useState(null);
  const [scale, setScale] = useState(1.0);
  const [rotation, setRotation] = useState(0);
  const [annotations, setAnnotations] = useState({});
  const [activeAnnotationTool, setActiveAnnotationTool] = useState(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawingPath, setDrawingPath] = useState([]);
  const [selectedText, setSelectedText] = useState(null);
  const [selectionCoords, setSelectionCoords] = useState(null);
  const [eraseSuccessMessage, setEraseSuccessMessage] = useState(null);
  const [isEditingPage, setIsEditingPage] = useState(false);
  const [pageInputValue, setPageInputValue] = useState('');
  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiSuggestionsVisible, setAiSuggestionsVisible] = useState(false);
  const [stickyNoteModal, setStickyNoteModal] = useState(null);
  const [stickyNoteContent, setStickyNoteContent] = useState('');
  const [stickyNoteAttachments, setStickyNoteAttachments] = useState([]);
  const [drawingColor, setDrawingColor] = useState('#2196f3');
  const [showColorPalette, setShowColorPalette] = useState(false);
  const [paletteOpenUpward, setPaletteOpenUpward] = useState(false);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);
  
  // Drawing color palette
  const drawingColors = [
    '#2196f3', // Blue (default)
    '#f44336', // Red
    '#4caf50', // Green
    '#ff9800', // Orange
    '#9c27b0', // Purple
    '#000000', // Black
    '#795548', // Brown
    '#607d8b', // Blue Grey
    '#e91e63', // Pink
    '#ffeb3b', // Yellow
    '#00bcd4', // Cyan
    '#8bc34a'  // Light Green
  ];
  const pageRef = useRef(null);
  const textLayerRef = useRef(null);
  const pageInputRef = useRef(null);
  const fileInputRef = useRef(null);

  // FIXED: Memoize options to prevent unnecessary reloads
  const documentOptions = useMemo(() => ({
    cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/standard_fonts/`,
    withCredentials: false
  }), []);

  // Text layer-based coordinate normalization functions
  const normalizeCoordinates = (coordinates, textLayer) => {
    if (!coordinates || !textLayer) return coordinates;
    
    const textLayerRect = textLayer.getBoundingClientRect();
    const textLayerWidth = textLayerRect.width;
    const textLayerHeight = textLayerRect.height;
    
    // Validate text layer dimensions
    if (textLayerWidth <= 0 || textLayerHeight <= 0) {
      console.warn('Invalid text layer dimensions:', { textLayerWidth, textLayerHeight });
      return coordinates;
    }
    
    return coordinates.map(coord => ({
      // Normalize to text layer dimensions (zoom-independent)
      x: coord.x / textLayerWidth,
      y: coord.y / textLayerHeight,
      width: coord.width / textLayerWidth,
      height: coord.height / textLayerHeight,
      // Store metadata for debugging and validation
      _originalX: coord.x,
      _originalY: coord.y,
      _originalWidth: coord.width,
      _originalHeight: coord.height,
      _textLayerWidth: textLayerWidth,
      _textLayerHeight: textLayerHeight,
      _scaleAtCreation: scale,
      _rotation: rotation
    }));
  };

  const denormalizeCoordinates = (normalizedCoords) => {
    if (!normalizedCoords || !textLayerRef.current) return normalizedCoords;
    
    const currentTextLayer = textLayerRef.current;
    const textLayerRect = currentTextLayer.getBoundingClientRect();
    const textLayerWidth = textLayerRect.width;
    const textLayerHeight = textLayerRect.height;
    
    // Validate current text layer dimensions
    if (textLayerWidth <= 0 || textLayerHeight <= 0) {
      console.warn('Invalid current text layer dimensions:', { textLayerWidth, textLayerHeight });
      return normalizedCoords;
    }
    
    return normalizedCoords.map(coord => ({
      // Apply current text layer dimensions to normalized coordinates
      x: coord.x * textLayerWidth,
      y: coord.y * textLayerHeight,
      width: coord.width * textLayerWidth,
      height: coord.height * textLayerHeight
    }));
  };

  // Normalize drawing path coordinates relative to text layer
  const normalizeDrawingPath = (path, textLayer) => {
    if (!path || !textLayer) return path;
    
    const textLayerRect = textLayer.getBoundingClientRect();
    const textLayerWidth = textLayerRect.width;
    const textLayerHeight = textLayerRect.height;
    
    // Validate text layer dimensions
    if (textLayerWidth <= 0 || textLayerHeight <= 0) {
      console.warn('Invalid text layer dimensions for drawing:', { textLayerWidth, textLayerHeight });
      return path;
    }
    
    return path.map(point => ({
      // Normalize to text layer dimensions (zoom-independent)
      x: point.x / textLayerWidth,
      y: point.y / textLayerHeight,
      // Store metadata for debugging
      _originalX: point.x,
      _originalY: point.y,
      _textLayerWidth: textLayerWidth,
      _textLayerHeight: textLayerHeight,
      _scaleAtCreation: scale
    }));
  };

  // Denormalize drawing path coordinates for display
  const denormalizeDrawingPath = (normalizedPath) => {
    if (!normalizedPath || !textLayerRef.current) return normalizedPath;
    
    const currentTextLayer = textLayerRef.current;
    const textLayerRect = currentTextLayer.getBoundingClientRect();
    const textLayerWidth = textLayerRect.width;
    const textLayerHeight = textLayerRect.height;
    
    // Validate current text layer dimensions
    if (textLayerWidth <= 0 || textLayerHeight <= 0) {
      console.warn('Invalid current text layer dimensions for drawing:', { textLayerWidth, textLayerHeight });
      return normalizedPath;
    }
    
    return normalizedPath.map(point => ({
      // Apply current text layer dimensions to normalized coordinates
      x: point.x * textLayerWidth,
      y: point.y * textLayerHeight
    }));
  };

  // Check if color palette should open upward to prevent cutoff
  const shouldPaletteOpenUpward = () => {
    const paletteHeight = 120; // Approximate height of color palette (3 rows × ~30px + padding)
    const viewportHeight = window.innerHeight;
    
    // Get the position of the drawing tool button to calculate available space below
    const drawingButton = document.querySelector('.toolbar-btn[title="Draw"]');
    if (!drawingButton) return false;
    
    const buttonRect = drawingButton.getBoundingClientRect();
    const spaceBelow = viewportHeight - buttonRect.bottom;
    
    // If there's not enough space below, open upward
    return spaceBelow < paletteHeight;
  };

  // Normalize sticky note coordinates relative to text layer
  const normalizeStickyNoteCoordinates = (x, y, textLayer) => {
    if (!textLayer) return { x, y };
    
    const textLayerRect = textLayer.getBoundingClientRect();
    const textLayerWidth = textLayerRect.width;
    const textLayerHeight = textLayerRect.height;
    
    // Validate text layer dimensions
    if (textLayerWidth <= 0 || textLayerHeight <= 0) {
      console.warn('Invalid text layer dimensions for sticky note:', { textLayerWidth, textLayerHeight });
      return { x, y };
    }
    
    return {
      // Normalize to text layer dimensions (zoom-independent)
      x: x / textLayerWidth,
      y: y / textLayerHeight,
      // Store metadata for debugging
      _originalX: x,
      _originalY: y,
      _textLayerWidth: textLayerWidth,
      _textLayerHeight: textLayerHeight,
      _scaleAtCreation: scale
    };
  };

  // Denormalize sticky note coordinates for display
  const denormalizeStickyNoteCoordinates = (normalizedCoords) => {
    if (!normalizedCoords || !textLayerRef.current) return normalizedCoords;
    
    const currentTextLayer = textLayerRef.current;
    const textLayerRect = currentTextLayer.getBoundingClientRect();
    const textLayerWidth = textLayerRect.width;
    const textLayerHeight = textLayerRect.height;
    
    // Validate current text layer dimensions
    if (textLayerWidth <= 0 || textLayerHeight <= 0) {
      console.warn('Invalid current text layer dimensions for sticky note:', { textLayerWidth, textLayerHeight });
      return normalizedCoords;
    }
    
    return {
      // Apply current text layer dimensions to normalized coordinates
      x: normalizedCoords.x * textLayerWidth,
      y: normalizedCoords.y * textLayerHeight
    };
  };

  // Enhanced coordinate calculation with PDF-intrinsic normalization
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
      
      // Normalize coordinates to text layer system (zoom-independent)
      const normalizedCoords = normalizeCoordinates(coordinates, textLayer);
      
      return normalizedCoords && normalizedCoords.length > 0 ? normalizedCoords : null;
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
  }, [currentPage, scale]); // Add scale dependency for coordinate accuracy

  // Database-based annotation persistence functions
  const saveAnnotation = async (annotation) => {
    if (!fileId) {
      console.warn('No fileId available, saving to localStorage only');
      return { success: true, id: annotation.id, source: 'localStorage' };
    }
    
    try {
      const annotationData = {
        file_id: fileId,
        page_number: currentPage,
        annotation_type: annotation.type,
        coordinates: annotation.coordinates || null,
        content: annotation.content || null,
        selected_text: annotation.selectedText || annotation.text || null,
        color: annotation.color || '#ffff00',
        attachments: annotation.attachments || [],
        style_properties: annotation.style || {},
        ai_generated: annotation.isAISuggested || annotation.ai_generated || false,
        ai_metadata: annotation.isAISuggested ? {
          category: annotation.aiCategory,
          reason: annotation.aiReason,
          importance: annotation.aiImportance
        } : null,
        is_text_selection: annotation.isTextSelection || false,
        coordinate_version: annotation.metadata?.coordinateVersion || '2.0',
        metadata: annotation.metadata || {},
        tags: annotation.tags || []
      };

      const response = await makeAuthenticatedRequest(`${import.meta.env.VITE_API_BASE_URL}/api/annotations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(annotationData)
      });

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to save annotation');
      }
      
      return { success: true, data: result.data, source: 'database' };
    } catch (error) {
      console.error('Failed to save annotation to database:', error);
      // Don't throw error, let it fallback to localStorage
      return { success: false, error: error.message };
    }
  };

  const loadAnnotations = async (fileId, page) => {
    if (!fileId || !page) return [];
    
    try {
      const response = await makeAuthenticatedRequest(
        `${import.meta.env.VITE_API_BASE_URL}/api/annotations/file/${fileId}/page/${page}`
      );
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to load annotations');
      }
      
      // Convert database format to component format
      return result.data.annotations.map(annotation => ({
        id: annotation.id,
        type: annotation.annotation_type,
        coordinates: annotation.coordinates,
        content: annotation.content,
        selectedText: annotation.selected_text,
        text: annotation.selected_text, // alias for compatibility
        color: annotation.color,
        attachments: annotation.attachments || [],
        style: annotation.style_properties || {},
        isAISuggested: annotation.ai_generated,
        ai_generated: annotation.ai_generated,
        aiCategory: annotation.ai_metadata?.category,
        aiReason: annotation.ai_metadata?.reason,
        aiImportance: annotation.ai_metadata?.importance,
        isTextSelection: annotation.is_text_selection,
        metadata: {
          ...annotation.metadata,
          coordinateVersion: annotation.coordinate_version,
          createdAt: annotation.created_at,
          updatedAt: annotation.updated_at
        },
        tags: annotation.tags || [],
        dbId: annotation.id // Store database ID for updates/deletes
      }));
    } catch (error) {
      console.error('Failed to load annotations from database:', error);
      return [];
    }
  };

  const deleteAnnotation = async (annotationId) => {
    if (!annotationId) return;
    
    try {
      const response = await makeAuthenticatedRequest(
        `${import.meta.env.VITE_API_BASE_URL}/api/annotations/${annotationId}`,
        { method: 'DELETE' }
      );
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to delete annotation');
      }
      
      return { success: true };
    } catch (error) {
      console.error('Failed to delete annotation from database:', error);
      throw error;
    }
  };

  // Helper function to add annotation to both state and database
  const addAnnotation = async (annotation) => {
    const pageKey = `page-${currentPage}`;
    
    // Add to local state immediately for responsiveness
    setAnnotations(prev => ({
      ...prev,
      [pageKey]: [...(prev[pageKey] || []), annotation]
    }));

    // Save to database in background
    try {
      const savedAnnotation = await saveAnnotation(annotation);
      
      if (savedAnnotation.success && savedAnnotation.data) {
        // Update the annotation with the database ID
        setAnnotations(prev => ({
          ...prev,
          [pageKey]: (prev[pageKey] || []).map(ann => 
            ann.id === annotation.id ? { ...ann, dbId: savedAnnotation.data.id } : ann
          )
        }));
        
        console.log('Annotation saved to database successfully:', savedAnnotation.data.id);
      } else {
        console.warn('Failed to save to database, annotation remains in local state only');
      }
    } catch (error) {
      console.error('Database save failed for annotation:', error);
      // Keep annotation in local state even if database save fails
    }

    // Always save to localStorage as backup (user-specific key)
    try {
      const userId = user?.id || 'anonymous';
      const storageKey = `annotations_${userId}_${uploadedFileName || 'unknown'}`;
      const existingAnnotations = JSON.parse(localStorage.getItem(storageKey) || '{}');
      existingAnnotations[pageKey] = [...(existingAnnotations[pageKey] || []), annotation];
      localStorage.setItem(storageKey, JSON.stringify(existingAnnotations));
      console.log('Annotation saved to localStorage with user-specific key:', storageKey);
    } catch (error) {
      console.warn('Failed to save annotation to localStorage:', error);
    }
  };

  // Helper function to remove annotation from both state and database with visual feedback
  const removeAnnotation = async (annotationId, showSuccessMessage = true) => {
    const pageKey = `page-${currentPage}`;
    
    // Find the annotation to get its database ID
    const pageAnnotations = annotations[pageKey] || [];
    const annotation = pageAnnotations.find(ann => ann.id === annotationId);
    const dbId = annotation?.dbId || (annotation?.id && annotation.id.length > 10 ? annotation.id : null);

    // Show visual feedback before removing
    const annotationElement = document.querySelector(`[data-annotation-id="${annotationId}"]`);
    
    const performRemoval = async () => {
      // Remove from local state first for immediate UI feedback
      setAnnotations(prev => ({
        ...prev,
        [pageKey]: (prev[pageKey] || []).filter(ann => ann.id !== annotationId)
      }));

      // Remove from database in background
      if (dbId) {
        try {
          await deleteAnnotation(dbId);
          console.log('Annotation deleted from database:', dbId);
        } catch (error) {
          console.error('Failed to delete annotation from database:', error);
          showToast('Failed to delete from server, but removed locally', 'warning', 3000);
        }
      }

      // Remove from localStorage as well (user-specific key)
      try {
        const userId = user?.id || 'anonymous';
        const storageKey = `annotations_${userId}_${uploadedFileName || 'unknown'}`;
        const existingAnnotations = JSON.parse(localStorage.getItem(storageKey) || '{}');
        if (existingAnnotations[pageKey]) {
          existingAnnotations[pageKey] = existingAnnotations[pageKey].filter(ann => ann.id !== annotationId);
          localStorage.setItem(storageKey, JSON.stringify(existingAnnotations));
        }
      } catch (error) {
        console.warn('Failed to remove annotation from localStorage:', error);
      }

      // Show success feedback only if requested
      if (showSuccessMessage) {
        showEraseSuccessMessage();
      }
    };

    if (annotationElement) {
      // Apply visual animation before removal
      annotationElement.style.transition = 'all 0.3s ease';
      annotationElement.style.transform = 'scale(0.8)';
      annotationElement.style.opacity = '0';
      
      // Wait for animation to complete before removing
      setTimeout(performRemoval, 300);
    } else {
      // Fallback immediate removal if element not found
      await performRemoval();
    }
  };


  // Note: Annotation saving is now handled individually when annotations are created/modified

  // Force annotation re-positioning when scale or text layer changes
  useEffect(() => {
    // Trigger a re-render of annotations when scale changes
    // The renderAnnotations function will automatically use the current text layer
    // for denormalization, ensuring annotations stay in correct positions
    if (textLayerRef.current) {
      console.log('Scale changed to:', scale, '- annotations will be repositioned using current text layer');
      // Force component re-render by updating a state value
      setAnnotations(prev => ({ ...prev }));
    }
  }, [scale]);

  // Update annotations when text layer reference changes (after zoom)
  useEffect(() => {
    // When text layer changes (e.g., after zoom), ensure annotations are repositioned
    if (textLayerRef.current && uploadedFileName && currentPage) {
      console.log('Text layer updated - refreshing annotation positions');
      // Force re-render with current annotations
      setAnnotations(prev => ({ ...prev }));
    }
  }, [textLayerRef.current, uploadedFileName, currentPage]);

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

  // Page jumping functionality
  const handlePageInfoClick = () => {
    setIsEditingPage(true);
    setPageInputValue(currentPage.toString());
    // Focus the input after state update
    setTimeout(() => {
      if (pageInputRef.current) {
        pageInputRef.current.focus();
        pageInputRef.current.select();
      }
    }, 10);
  };

  const handlePageInputChange = (e) => {
    const value = e.target.value;
    // Allow empty string during typing, or valid numbers
    if (value === '' || /^\d+$/.test(value)) {
      setPageInputValue(value);
    }
  };

  const handlePageInputKeyDown = (e) => {
    if (e.key === 'Enter') {
      confirmPageJump();
    } else if (e.key === 'Escape') {
      cancelPageEdit();
    }
  };

  const handlePageInputBlur = () => {
    confirmPageJump();
  };

  const confirmPageJump = () => {
    const pageNum = parseInt(pageInputValue, 10);
    
    if (pageInputValue === '' || isNaN(pageNum) || pageNum < 1 || pageNum > numPages) {
      // Invalid input - revert to current page
      setPageInputValue(currentPage.toString());
    } else if (pageNum !== currentPage) {
      // Valid page number and different from current
      onPageChange(pageNum);
    }
    
    setIsEditingPage(false);
  };

  const cancelPageEdit = () => {
    setPageInputValue(currentPage.toString());
    setIsEditingPage(false);
  };

  // AI Suggestions functionality
  const extractPageText = () => {
    if (!textLayerRef.current) return '';
    
    // Extract text from the current page's text layer
    const textItems = textLayerRef.current.querySelectorAll('[role="presentation"]');
    let pageText = '';
    
    textItems.forEach(item => {
      pageText += item.textContent + ' ';
    });
    
    return pageText.trim();
  };

  // Find exact text within the PDF text layer with multi-line support
  const findTextInPDFLayer = (searchText) => {
    if (!textLayerRef.current || !searchText) return null;
    
    const textItems = textLayerRef.current.querySelectorAll('[role="presentation"]');
    const cleanSearchText = searchText.trim().toLowerCase();
    
    // First try exact match in single elements
    for (let item of textItems) {
      const itemText = item.textContent.trim().toLowerCase();
      if (itemText.includes(cleanSearchText)) {
        return { 
          elements: [item], 
          text: item.textContent.trim(),
          isMultiLine: false 
        };
      }
    }
    
    // Try to find text that spans multiple elements
    const itemsArray = Array.from(textItems);
    for (let i = 0; i < itemsArray.length; i++) {
      let combinedText = '';
      let matchingElements = [];
      
      // Try combining text from consecutive elements
      for (let j = i; j < Math.min(i + 5, itemsArray.length); j++) { // Check up to 5 consecutive elements
        combinedText += itemsArray[j].textContent.trim() + ' ';
        matchingElements.push(itemsArray[j]);
        
        if (combinedText.toLowerCase().includes(cleanSearchText)) {
          return {
            elements: matchingElements,
            text: combinedText.trim(),
            isMultiLine: matchingElements.length > 1
          };
        }
      }
    }
    
    // If no exact match, try fuzzy matching by words
    const searchWords = cleanSearchText.split(/\s+/);
    const minWordsMatch = Math.max(1, Math.floor(searchWords.length * 0.6)); // At least 60% word match
    
    for (let item of textItems) {
      const itemText = item.textContent.trim().toLowerCase();
      const itemWords = itemText.split(/\s+/);
      
      let matchedWords = 0;
      for (let searchWord of searchWords) {
        if (itemWords.some(word => word.includes(searchWord) || searchWord.includes(word))) {
          matchedWords++;
        }
      }
      
      if (matchedWords >= minWordsMatch) {
        return { 
          elements: [item], 
          text: item.textContent.trim(),
          isMultiLine: false 
        };
      }
    }
    
    // Try partial word matching for better results
    for (let item of textItems) {
      const itemText = item.textContent.trim().toLowerCase();
      
      // Check if any significant portion of the search text appears
      const searchParts = cleanSearchText.split(/[.!?;]/); // Split by sentence endings
      for (let part of searchParts) {
        const cleanPart = part.trim();
        if (cleanPart.length > 10 && itemText.includes(cleanPart)) {
          return { 
            elements: [item], 
            text: item.textContent.trim(),
            isMultiLine: false 
          };
        }
      }
    }
    
    return null;
  };

  // Get coordinates for text elements with normalization (supports single or multiple elements)
  const getTextElementCoordinates = (foundTextData) => {
    if (!foundTextData || !foundTextData.elements || !textLayerRef.current) return null;
    
    try {
      const textLayerRect = textLayerRef.current.getBoundingClientRect();
      const pageContainer = pageRef.current;
      const coordinates = [];
      
      // Process each element to get coordinates
      for (let element of foundTextData.elements) {
        const elementRect = element.getBoundingClientRect();
        
        // Calculate relative coordinates
        const relativeX = elementRect.left - textLayerRect.left;
        const relativeY = elementRect.top - textLayerRect.top;
        const relativeWidth = elementRect.width;
        const relativeHeight = elementRect.height;
        
        let finalCoords = {
          x: relativeX,
          y: relativeY,
          width: relativeWidth,
          height: relativeHeight
        };
        
        // Apply rotation transformation if needed
        if (rotation !== 0) {
          finalCoords = applyRotationToCoords(finalCoords, rotation, pageContainer);
        }
        
        coordinates.push(finalCoords);
      }
      
      // Normalize coordinates to text layer system (zoom-independent)
      const normalizedCoords = normalizeCoordinates(coordinates, textLayerRef.current);
      
      return normalizedCoords && normalizedCoords.length > 0 ? normalizedCoords : null;
    } catch (error) {
      console.warn('Error getting text element coordinates:', error);
      return null;
    }
  };

  // Coordinate validation and recovery system
  const validateAndRecoverCoordinates = (annotation) => {
    if (!annotation.isTextSelection || !annotation.text || !annotation.coordinates) {
      return annotation; // Skip validation for non-text annotations
    }

    // Check if coordinates seem reasonable (normalized values should be 0-1)
    const hasNormalizedCoords = annotation.coordinates.every(coord => 
      coord.x >= 0 && coord.x <= 1 && coord.y >= 0 && coord.y <= 1
    );

    if (hasNormalizedCoords) {
      return annotation; // Coordinates look good
    }

    // Attempt recovery using text content matching
    console.warn('Invalid coordinates detected for annotation, attempting recovery:', annotation.id);
    
    const foundText = findTextInPDFLayer(annotation.text);
    if (foundText && foundText.elements && foundText.elements.length > 0) {
      const recoveredCoords = getTextElementCoordinates(foundText);
      if (recoveredCoords) {
        console.log('Successfully recovered coordinates for annotation:', annotation.id);
        return {
          ...annotation,
          coordinates: recoveredCoords,
          _recovered: true,
          _recoveryTime: new Date().toISOString()
        };
      }
    }

    console.warn('Could not recover coordinates for annotation:', annotation.id);
    return annotation; // Return as-is if recovery failed
  };

  // Load annotations when page or file changes with validation
  useEffect(() => {
    const loadPageAnnotations = async () => {
      const pageKey = `page-${currentPage}`;
      let annotationsToLoad = [];
      
      // Try to load from database first
      if (fileId && currentPage) {
        try {
          const savedAnnotations = await loadAnnotations(fileId, currentPage);
          annotationsToLoad = savedAnnotations;
        } catch (error) {
          console.error('Failed to load page annotations from database:', error);
        }
      }
      
      // Fallback to localStorage if database fails or no fileId (user-specific key)
      if (annotationsToLoad.length === 0 && uploadedFileName) {
        try {
          const userId = user?.id || 'anonymous';
          const storageKey = `annotations_${userId}_${uploadedFileName}`;
          const storedAnnotations = JSON.parse(localStorage.getItem(storageKey) || '{}');
          annotationsToLoad = storedAnnotations[pageKey] || [];
          console.log('Loaded annotations from localStorage for user:', userId, 'count:', annotationsToLoad.length);
        } catch (error) {
          console.warn('Failed to load annotations from localStorage:', error);
        }
      }
      
      // Validate and recover coordinates if needed
      const validatedAnnotations = annotationsToLoad.map(validateAndRecoverCoordinates);
      
      setAnnotations(prev => ({
        ...prev,
        [pageKey]: validatedAnnotations
      }));
    };

    loadPageAnnotations();
  }, [fileId, currentPage, uploadedFileName]);

  const analyzePageForHighlights = async () => {
    if (!uploadedFileName || isAnalyzing) return;
    
    setIsAnalyzing(true);
    
    // Show thinking toast
    showToast('🧠 AI is analyzing the page for highlights...', 'info', 0); // 0 duration means it won't auto-dismiss
    
    try {
      const pageText = extractPageText();
      
      if (!pageText || pageText.length < 50) {
        showToast('❌ Not enough text on this page for AI analysis', 'error', 4000);
        return;
      }

      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/gemini/analyze-highlights`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: pageText,
          pageNumber: currentPage
        }),
      });

      const result = await response.json();

      if (result.success) {
        const suggestionCount = result.analysis.suggestions?.length || 0;
        setAiSuggestions(result.analysis.suggestions || []);
        setAiSuggestionsVisible(true);
        
        // Show success toast
        showToast(`✅ AI found ${suggestionCount} highlight suggestions!`, 'success', 3000);
        console.log('AI analysis completed:', suggestionCount, 'suggestions');
      } else {
        throw new Error(result.error || 'Failed to analyze page');
      }
    } catch (error) {
      console.error('AI analysis error:', error);
      showToast('❌ Failed to analyze page for highlights. Please try again.', 'error', 4000);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const toggleAiSuggestions = () => {
    if (aiSuggestions.length === 0) {
      analyzePageForHighlights();
    } else {
      setAiSuggestionsVisible(!aiSuggestionsVisible);
    }
  };

  const acceptAiSuggestion = async (suggestion, index) => {
    // Try to find the exact text in the PDF layer
    const foundText = findTextInPDFLayer(suggestion.text);
    
    if (foundText && foundText.elements && foundText.elements.length > 0) {
      // Get accurate coordinates for the found text
      const coordinates = getTextElementCoordinates(foundText);
      
      if (coordinates && coordinates.length > 0) {
        // Create AI highlight with accurate positioning and metadata
        const aiHighlight = {
          id: Date.now() + index,
          type: 'highlight',
          text: suggestion.text,
          isAISuggested: true,
          aiCategory: suggestion.category,
          aiReason: suggestion.reason,
          aiImportance: suggestion.importance,
          color: '#4ade80', // Green color for AI suggestions
          isTextSelection: true, // Mark as text-based highlighting
          coordinates: coordinates, // Use coordinates array from text elements
          foundText: foundText.text, // Store the actual found text
          isMultiLine: foundText.isMultiLine, // Track if spans multiple lines
          // Enhanced metadata for coordinate stability
          metadata: {
            createdAt: new Date().toISOString(),
            page: currentPage,
            scale: scale,
            rotation: rotation,
            textLength: suggestion.text.length,
            coordinateVersion: '2.0',
            textChecksum: suggestion.text.length.toString(36),
            isAIGenerated: true
          }
        };

        await addAnnotation(aiHighlight);

        // Remove from suggestions
        setAiSuggestions(prev => prev.filter((_, i) => i !== index));
        
        console.log('AI highlight placed at coordinates:', coordinates, foundText.isMultiLine ? '(multi-line)' : '(single-line)');
        return;
      }
    }
    
    // Fallback to basic positioning if text not found
    console.warn('Could not find exact text location for:', suggestion.text.substring(0, 50), '...');
    
    const aiHighlight = {
      id: Date.now() + index,
      type: 'highlight',
      text: suggestion.text,
      isAISuggested: true,
      aiCategory: suggestion.category,
      aiReason: suggestion.reason,
      aiImportance: suggestion.importance,
      color: '#4ade80', // Green color for AI suggestions
      isTextSelection: false,
      x: 50 + (index * 20), // Fallback positioning
      y: 50 + (index * 30),
      width: Math.min(suggestion.text.length * 8, 400),
      height: 20
    };

    await addAnnotation(aiHighlight);

    // Remove from suggestions
    setAiSuggestions(prev => prev.filter((_, i) => i !== index));
  };

  const rejectAiSuggestion = (index) => {
    setAiSuggestions(prev => prev.filter((_, i) => i !== index));
  };

  const acceptAllAiSuggestions = () => {
    aiSuggestions.forEach((suggestion, index) => {
      acceptAiSuggestion(suggestion, index);
    });
    setAiSuggestions([]);
  };

  const rejectAllAiSuggestions = () => {
    setAiSuggestions([]);
    setAiSuggestionsVisible(false);
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

      addAnnotation(newHighlight);
    }
  };

  // Create highlight based on text selection with enhanced metadata
  const createTextSelectionHighlight = () => {
    if (!selectedText || !selectionCoords) return;
    
    const newHighlight = {
      id: Date.now(),
      type: 'highlight',
      text: selectedText,
      coordinates: selectionCoords,
      color: '#ffff00',
      isTextSelection: true,
      // Enhanced metadata for coordinate stability
      metadata: {
        createdAt: new Date().toISOString(),
        page: currentPage,
        scale: scale,
        rotation: rotation,
        textLength: selectedText.length,
        coordinateVersion: '2.0', // Version for future compatibility
        textChecksum: selectedText.length.toString(36) // Simple checksum for validation
      }
    };

    addAnnotation(newHighlight);

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

    const newComment = {
      id: Date.now(),
      type: 'comment',
      x: x,
      y: y,
      text: commentText,
      color: '#ff6b6b'
    };

    addAnnotation(newComment);
  };

  // Enhanced sticky note functionality
  const handleStickyNote = (event) => {
    if (activeAnnotationTool !== 'stickynote') return;
    
    // Don't create new sticky notes if modal is already open
    if (stickyNoteModal) return;
    
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    // Open sticky note modal
    setStickyNoteModal({
      x: x,
      y: y,
      originalX: x,
      originalY: y,
      isNew: true
    });
    setStickyNoteContent('');
    setStickyNoteAttachments([]);
  };

  const saveStickyNote = async () => {
    if (!stickyNoteModal || (!stickyNoteContent.trim() && stickyNoteAttachments.length === 0)) {
      closeStickyNoteModal();
      return;
    }

    const pageKey = `page-${currentPage}`;
    
    if (stickyNoteModal.isNew) {
      // Normalize coordinates relative to text layer
      const normalizedCoords = textLayerRef.current ? 
        normalizeStickyNoteCoordinates(stickyNoteModal.originalX, stickyNoteModal.originalY, textLayerRef.current) : 
        { x: stickyNoteModal.originalX, y: stickyNoteModal.originalY }; // Fallback to raw coordinates if text layer not available
      
      // Create new sticky note
      const newStickyNote = {
        id: Date.now(),
        type: 'stickynote',
        // Use normalized coordinates if available, otherwise raw coordinates for backward compatibility
        x: normalizedCoords.x,
        y: normalizedCoords.y,
        content: stickyNoteContent,
        attachments: stickyNoteAttachments,
        color: '#fbbf24', // Yellow sticky note color
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
        // Enhanced metadata for coordinate stability
        metadata: {
          page: currentPage,
          scale: scale,
          rotation: rotation,
          coordinateVersion: '2.0',
          isNormalized: !!textLayerRef.current,
          _normalizedCoords: normalizedCoords
        }
      };

      await addAnnotation(newStickyNote);
    } else {
      // Update existing sticky note (don't change coordinates, just content)
      const pageAnnotations = annotations[pageKey] || [];
      const updatedAnnotations = pageAnnotations.map(annotation => 
        annotation.id === stickyNoteModal.annotationId
          ? {
              ...annotation,
              content: stickyNoteContent,
              attachments: stickyNoteAttachments,
              modifiedAt: new Date().toISOString()
            }
          : annotation
      );
      
      setAnnotations(prev => ({
        ...prev,
        [pageKey]: updatedAnnotations
      }));
      
      // Save updated annotations to localStorage (user-specific key)
      try {
        const userId = user?.id || 'anonymous';
        const storageKey = `annotations_${userId}_${uploadedFileName || 'unknown'}`;
        const existingAnnotations = JSON.parse(localStorage.getItem(storageKey) || '{}');
        existingAnnotations[pageKey] = updatedAnnotations;
        localStorage.setItem(storageKey, JSON.stringify(existingAnnotations));
      } catch (error) {
        console.warn('Failed to save updated annotation to localStorage:', error);
      }
    }

    closeStickyNoteModal();
  };

  const closeStickyNoteModal = () => {
    setStickyNoteModal(null);
    setStickyNoteContent('');
    setStickyNoteAttachments([]);
  };

  // Handle Escape key to close modal and color palette
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        if (stickyNoteModal) {
          closeStickyNoteModal();
        }
        if (showColorPalette) {
          setShowColorPalette(false);
        }
      }
    };

    if (stickyNoteModal || showColorPalette) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [stickyNoteModal, showColorPalette]);

  // Handle click outside to close color palette
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showColorPalette && !event.target.closest('.drawing-color-palette')) {
        setShowColorPalette(false);
      }
    };

    if (showColorPalette) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showColorPalette]);

  // Auto-save functionality
  useEffect(() => {
    // Load autosave preference
    const savedPreference = localStorage.getItem('autoSaveEnabled');
    if (savedPreference !== null) {
      setAutoSaveEnabled(savedPreference === 'true');
    }
  }, []);

  useEffect(() => {
    if (!autoSaveEnabled || !fileId) return;

    // Auto-save annotations every 30 seconds
    const autoSaveInterval = setInterval(async () => {
      try {
        const pageKey = `page-${currentPage}`;
        const pageAnnotations = annotations[pageKey] || [];
        
        // Check if there are any unsaved annotations
        const hasUnsavedAnnotations = pageAnnotations.some(ann => !ann.synced);
        
        if (hasUnsavedAnnotations) {
          console.log('Auto-saving annotations...');
          
          // Save each unsaved annotation
          for (const annotation of pageAnnotations) {
            if (!annotation.synced) {
              try {
                await saveAnnotation(annotation);
                // Mark as synced in local state
                setAnnotations(prev => ({
                  ...prev,
                  [pageKey]: prev[pageKey].map(ann => 
                    ann.id === annotation.id ? { ...ann, synced: true } : ann
                  )
                }));
              } catch (error) {
                console.warn('Failed to auto-save annotation:', annotation.id, error);
              }
            }
          }
          
          // Annotations auto-saved successfully
          
          // Show subtle notification if connected to server
          if (connectionStatus.canSaveToServer) {
            showToast('Auto-saved', 'success', 1500);
          }
        }
      } catch (error) {
        console.error('Auto-save failed:', error);
      }
    }, 30000); // Every 30 seconds

    return () => clearInterval(autoSaveInterval);
  }, [autoSaveEnabled, fileId, currentPage, annotations, connectionStatus.canSaveToServer, saveAnnotation, showToast]);

  const handleFileAttachment = (event) => {
    const files = Array.from(event.target.files);
    
    files.forEach(file => {
      // Create file reader to get base64 data for storage
      const reader = new FileReader();
      reader.onload = (e) => {
        const attachment = {
          id: Date.now() + Math.random(),
          name: file.name,
          type: file.type,
          size: file.size,
          data: e.target.result, // Base64 data
          uploadedAt: new Date().toISOString()
        };
        
        setStickyNoteAttachments(prev => [...prev, attachment]);
      };
      
      // Check file size (limit to 5MB per file)
      if (file.size > 5 * 1024 * 1024) {
        alert(`File ${file.name} is too large. Maximum size is 5MB.`);
        return;
      }
      
      reader.readAsDataURL(file);
    });
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeAttachment = (attachmentId) => {
    setStickyNoteAttachments(prev => 
      prev.filter(attachment => attachment.id !== attachmentId)
    );
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

      addAnnotation(newUnderline);
    }
  };

  // Create underline based on text selection with enhanced metadata
  const createTextSelectionUnderline = () => {
    if (!selectedText || !selectionCoords) return;
    
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
      isTextSelection: true,
      // Enhanced metadata for coordinate stability
      metadata: {
        createdAt: new Date().toISOString(),
        page: currentPage,
        scale: scale,
        rotation: rotation,
        textLength: selectedText.length,
        coordinateVersion: '2.0',
        textChecksum: selectedText.length.toString(36)
      }
    };

    addAnnotation(newUnderline);

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
      removeAnnotation(annotationToRemove.id, true); // Explicitly show success message
      // Visual feedback for successful erase
      console.log('Annotation erased:', annotationToRemove.type);
    }
    // No else clause - don't show success message if no annotation found
  };

  // Find annotation at specific position with enhanced precision
  const findAnnotationAtPosition = (x, y, pageAnnotations) => {
    // Check in reverse order (top annotations first)
    for (let i = pageAnnotations.length - 1; i >= 0; i--) {
      const annotation = pageAnnotations[i];
      
      if (annotation.isTextSelection && annotation.coordinates) {
        // Check each coordinate rectangle for text-selection-based annotations with tolerance
        for (const coord of annotation.coordinates) {
          if (isPointInRectangleWithTolerance(x, y, coord, 5)) {
            return annotation;
          }
        }
      } else if (annotation.type === 'drawing') {
        // Check if point is near the drawing path with increased tolerance
        if (isPointNearPath(x, y, annotation.path, 15)) {
          return annotation;
        }
      } else if (annotation.type === 'comment') {
        // Enhanced detection for comment annotations with tolerance
        if (isPointInRectangleWithTolerance(x, y, annotation, 10)) {
          return annotation;
        }
      } else if (annotation.type === 'stickynote') {
        // Handle both normalized and legacy sticky note coordinates for eraser detection
        const coords = annotation.metadata?.isNormalized ? 
          denormalizeStickyNoteCoordinates({ x: annotation.x, y: annotation.y }) : 
          { x: annotation.x, y: annotation.y };
        
        // Create a rectangle approximation for sticky note bounds (150px min width, ~80px estimated height)
        const stickyRect = {
          x: coords.x,
          y: coords.y,
          width: 150, // minWidth from CSS
          height: 80  // Estimated height for header + content
        };
        
        if (isPointInRectangleWithTolerance(x, y, stickyRect, 10)) {
          return annotation;
        }
      } else {
        // Check legacy single-rectangle annotations with tolerance
        if (isPointInRectangleWithTolerance(x, y, annotation, 5)) {
          return annotation;
        }
      }
    }
    return null;
  };

  // Check if point is within rectangle bounds with tolerance for easier clicking
  const isPointInRectangleWithTolerance = (x, y, rect, tolerance = 5) => {
    return x >= rect.x - tolerance && 
           x <= rect.x + rect.width + tolerance && 
           y >= rect.y - tolerance && 
           y <= rect.y + rect.height + tolerance;
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


  // Show success message for erasing
  const showEraseSuccessMessage = () => {
    setEraseSuccessMessage('Annotation erased!');
    setTimeout(() => {
      setEraseSuccessMessage(null);
    }, 2000);
  };

  // Handle direct annotation click for erasing
  const handleAnnotationClick = (event, annotationId) => {
    if (activeAnnotationTool === 'erase') {
      event.stopPropagation(); // Prevent event bubbling to page container
      removeAnnotation(annotationId, true); // Show success message for direct clicks
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
      // Normalize drawing coordinates relative to text layer
      const normalizedPath = textLayerRef.current ? 
        normalizeDrawingPath(drawingPath, textLayerRef.current) : 
        drawingPath; // Fallback to raw coordinates if text layer not available
      
      const newDrawing = {
        id: Date.now(),
        type: 'drawing',
        path: normalizedPath,
        color: drawingColor,
        strokeWidth: 2,
        // Enhanced metadata for coordinate stability
        metadata: {
          createdAt: new Date().toISOString(),
          page: currentPage,
          scale: scale,
          rotation: rotation,
          pathLength: drawingPath.length,
          coordinateVersion: '2.0',
          isNormalized: !!textLayerRef.current
        }
      };

      addAnnotation(newDrawing);
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
      case 'stickynote':
        handleStickyNote(event);
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
    
    // Validate text layer availability for coordinate calculations
    if (!textLayerRef.current) {
      console.warn('Text layer not available for annotation rendering');
      return [];
    }

    return pageAnnotations.map(annotation => {
      switch (annotation.type) {
        case 'highlight':
          // Handle both text-selection-based and legacy click-based highlights
          if (annotation.isTextSelection && annotation.coordinates) {
            // Denormalize coordinates using current text layer dimensions
            const displayCoords = annotation.coordinates[0]?.x <= 1 ? 
              denormalizeCoordinates(annotation.coordinates) : 
              annotation.coordinates; // Fallback for legacy coordinates

            return displayCoords.map((coord, index) => (
              <div
                key={`${annotation.id}-${index}`}
                className={`annotation highlight-annotation ${annotation.isAISuggested ? 'ai-suggested' : ''}`}
                data-annotation-id={annotation.id}
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
                className={`annotation highlight-annotation ${annotation.isAISuggested ? 'ai-suggested' : ''}`}
                data-annotation-id={annotation.id}
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
              data-annotation-id={annotation.id}
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
        case 'stickynote': {
          // Handle both normalized and legacy sticky note coordinates
          const displayCoords = annotation.metadata?.isNormalized ? 
            denormalizeStickyNoteCoordinates({ x: annotation.x, y: annotation.y }) : 
            { x: annotation.x, y: annotation.y }; // Fallback for legacy sticky notes
          
          return (
            <div
              key={annotation.id}
              className="annotation stickynote-annotation"
              data-annotation-id={annotation.id}
              style={{
                position: 'absolute',
                left: displayCoords.x,
                top: displayCoords.y,
                backgroundColor: annotation.color,
                color: '#333',
                padding: '8px',
                borderRadius: '8px',
                fontSize: '12px',
                minWidth: '150px',
                maxWidth: '250px',
                zIndex: 15,
                pointerEvents: activeAnnotationTool === 'erase' ? 'auto' : 'auto',
                cursor: activeAnnotationTool === 'erase' ? 'pointer' : 'pointer',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                border: '2px solid #f59e0b'
              }}
              title={`Sticky Note: ${annotation.content?.substring(0, 50)}${annotation.content?.length > 50 ? '...' : ''}`}
              onClick={(e) => {
                if (activeAnnotationTool === 'erase') {
                  handleAnnotationClick(e, annotation.id);
                } else {
                  // Open sticky note for editing
                  e.stopPropagation();
                  setStickyNoteModal({
                    x: displayCoords.x,
                    y: displayCoords.y,
                    originalX: displayCoords.x,
                    originalY: displayCoords.y,
                    isNew: false,
                    annotationId: annotation.id
                  });
                  setStickyNoteContent(annotation.content || '');
                  setStickyNoteAttachments(annotation.attachments || []);
                }
              }}
            >
              <div className="stickynote-header">
                📝 Sticky Note
                {annotation.attachments && annotation.attachments.length > 0 && (
                  <span className="attachment-indicator">
                    📎 {annotation.attachments.length}
                  </span>
                )}
              </div>
              <div className="stickynote-content">
                {annotation.content ? 
                  annotation.content.substring(0, 100) + (annotation.content.length > 100 ? '...' : '') 
                  : 'Click to add content'}
              </div>
            </div>
          );
        }
        case 'drawing': {
          // Handle both normalized and legacy drawing coordinates
          const drawingPath = annotation.metadata?.isNormalized ? 
            denormalizeDrawingPath(annotation.path) : 
            annotation.path; // Fallback for legacy drawings
          
          return (
            <svg
              key={annotation.id}
              className="annotation drawing-annotation"
              data-annotation-id={annotation.id}
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
                points={drawingPath.map(p => `${p.x},${p.y}`).join(' ')}
                fill="none"
                stroke={annotation.color}
                strokeWidth={annotation.strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          );
        }
        case 'underline':
          // Handle both text-selection-based and legacy click-based underlines
          if (annotation.isTextSelection && annotation.coordinates) {
            // Denormalize coordinates using current text layer dimensions
            const displayCoords = annotation.coordinates[0]?.x <= 1 ? 
              denormalizeCoordinates(annotation.coordinates) : 
              annotation.coordinates; // Fallback for legacy coordinates

            return displayCoords.map((coord, index) => (
              <div
                key={`${annotation.id}-${index}`}
                className="annotation underline-annotation"
                data-annotation-id={annotation.id}
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
                data-annotation-id={annotation.id}
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
          
          {isEditingPage ? (
            <input
              ref={pageInputRef}
              type="number"
              min="1"
              max={numPages || 999}
              value={pageInputValue}
              onChange={handlePageInputChange}
              onKeyDown={handlePageInputKeyDown}
              onBlur={handlePageInputBlur}
              className="page-info page-info-input"
              placeholder={currentPage.toString()}
              style={{ 
                width: '60px', 
                minWidth: '50px',
                textAlign: 'center',
                fontSize: 'inherit'
              }}
            />
          ) : (
            <span 
              className="page-info page-info-clickable" 
              onClick={handlePageInfoClick}
              title="Click to jump to a specific page"
            >
              {currentPage} / {numPages || '--'}
            </span>
          )}
          
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
            onClick={toggleAiSuggestions}
            className={`toolbar-btn ai-suggest-btn ${aiSuggestionsVisible ? 'active' : ''} ${isAnalyzing ? 'analyzing' : ''}`}
            title={isAnalyzing ? '🧠 AI is thinking...' : aiSuggestions.length > 0 ? 'Toggle AI suggestions' : 'AI suggest highlights'}
            disabled={isAnalyzing}
          >
            <Brain size={20} />
            {aiSuggestions.length > 0 && !isAnalyzing && (
              <span className="suggestion-count">{aiSuggestions.length}</span>
            )}
            {isAnalyzing && (
              <span className="analyzing-text" style={{ 
                fontSize: '10px', 
                position: 'absolute', 
                bottom: '-2px', 
                left: '50%', 
                transform: 'translateX(-50%)', 
                whiteSpace: 'nowrap',
                color: 'currentColor',
                fontWeight: 'bold'
              }}>
                Thinking...
              </span>
            )}
          </button>
          
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
              activeAnnotationTool === 'stickynote' ? null : 'stickynote'
            )}
            className={`toolbar-btn ${activeAnnotationTool === 'stickynote' ? 'active' : ''}`}
            title="Add sticky note with attachments"
          >
            <StickyNote size={20} />
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
          
          {/* Color Palette for Drawing Tool */}
          {activeAnnotationTool === 'draw' && (
            <div className="drawing-color-palette">
              <button
                onClick={() => {
                  if (!showColorPalette) {
                    // Check positioning before opening
                    const openUpward = shouldPaletteOpenUpward();
                    setPaletteOpenUpward(openUpward);
                  }
                  setShowColorPalette(!showColorPalette);
                }}
                className="color-palette-trigger"
                title="Choose drawing color"
                style={{
                  backgroundColor: drawingColor,
                  border: '2px solid #fff',
                  borderRadius: '50%',
                  width: '24px',
                  height: '24px',
                  cursor: 'pointer',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                }}
              />
              {showColorPalette && (
                <div className={`color-palette-dropdown ${paletteOpenUpward ? 'upward' : 'downward'}`}>
                  {drawingColors.map((color, index) => (
                    <button
                      key={index}
                      onClick={() => {
                        setDrawingColor(color);
                        setShowColorPalette(false);
                      }}
                      className={`color-option ${drawingColor === color ? 'selected' : ''}`}
                      style={{
                        backgroundColor: color,
                        border: drawingColor === color ? '2px solid #fff' : '1px solid #ccc',
                        borderRadius: '50%',
                        width: '20px',
                        height: '20px',
                        cursor: 'pointer',
                        margin: '2px',
                        boxShadow: drawingColor === color ? '0 0 0 2px #2196f3' : '0 1px 2px rgba(0,0,0,0.1)'
                      }}
                      title={`Select ${color}`}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
          
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
            activeAnnotationTool === 'draw' ? 'draw-active' : ''
          } ${
            activeAnnotationTool === 'comment' ? 'comment-active' : ''
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
              onGetTextSuccess={() => {
                // Enhanced text layer reference management with proper timing
                const setupTextLayer = () => {
                  const textLayer = pageRef.current?.querySelector('.react-pdf__Page__textContent');
                  if (textLayer) {
                    textLayerRef.current = textLayer;
                    console.log('Text layer reference updated for page', currentPage, 'at scale', scale);
                    
                    // Trigger annotation repositioning after text layer is ready
                    setTimeout(() => {
                      if (uploadedFileName && currentPage) {
                        console.log('Triggering annotation repositioning after text layer setup');
                        setAnnotations(prev => ({ ...prev }));
                      }
                    }, 50);
                    
                    return true;
                  }
                  return false;
                };

                // Try immediate setup
                if (!setupTextLayer()) {
                  // Fallback with timeout for delayed rendering
                  setTimeout(() => {
                    if (!setupTextLayer()) {
                      console.warn('Text layer not found after timeout on page', currentPage);
                    }
                  }, 100);
                }
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
          
          {/* AI Suggestions Overlay */}
          {aiSuggestionsVisible && aiSuggestions.length > 0 && (
            <div className="ai-suggestions-overlay">
              <div className="ai-suggestions-header">
                <h3>
                  <Brain size={16} />
                  AI Suggested Highlights ({aiSuggestions.length})
                </h3>
                <div className="ai-suggestions-actions">
                  <button 
                    onClick={acceptAllAiSuggestions}
                    className="ai-btn ai-btn-accept-all"
                    title="Accept all suggestions"
                  >
                    Accept All
                  </button>
                  <button 
                    onClick={rejectAllAiSuggestions}
                    className="ai-btn ai-btn-reject-all"
                    title="Reject all suggestions"
                  >
                    Reject All
                  </button>
                  <button 
                    onClick={() => setAiSuggestionsVisible(false)}
                    className="ai-btn ai-btn-close"
                    title="Close suggestions"
                  >
                    ✕
                  </button>
                </div>
              </div>
              
              <div className="ai-suggestions-list">
                {aiSuggestions.map((suggestion, index) => (
                  <div key={index} className="ai-suggestion-item">
                    <div className="ai-suggestion-content">
                      <div className="ai-suggestion-text">
                        "{suggestion.text.substring(0, 100)}..."
                      </div>
                      <div className="ai-suggestion-meta">
                        <span className={`ai-category ${suggestion.category}`}>
                          {suggestion.category}
                        </span>
                        <span className={`ai-importance ${suggestion.importance}`}>
                          {suggestion.importance}
                        </span>
                      </div>
                      <div className="ai-suggestion-reason">
                        {suggestion.reason}
                      </div>
                    </div>
                    <div className="ai-suggestion-actions">
                      <button 
                        onClick={() => acceptAiSuggestion(suggestion, index)}
                        className="ai-btn ai-btn-accept"
                        title="Accept this suggestion"
                      >
                        ✓
                      </button>
                      <button 
                        onClick={() => rejectAiSuggestion(index)}
                        className="ai-btn ai-btn-reject"
                        title="Reject this suggestion"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Sticky Note Modal */}
          {stickyNoteModal && (
            <div 
              className="sticky-note-modal-overlay"
              onClick={(e) => {
                // Only close if clicking on the overlay background, not the modal content
                if (e.target === e.currentTarget) {
                  e.preventDefault();
                  e.stopPropagation();
                  closeStickyNoteModal();
                }
              }}
            >
              <div 
                className="sticky-note-modal" 
                style={{
                  left: Math.min(stickyNoteModal.x, window.innerWidth - 400),
                  top: Math.min(stickyNoteModal.y + 20, window.innerHeight - 500)
                }}
                onClick={(e) => {
                  // Prevent modal content clicks from bubbling to overlay
                  e.stopPropagation();
                }}
              >
                <div className="sticky-note-modal-header">
                  <h3>📝 {stickyNoteModal.isNew ? 'New' : 'Edit'} Sticky Note</h3>
                  <button 
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      closeStickyNoteModal();
                    }}
                    className="modal-close-btn"
                    title="Close"
                  >
                    ✕
                  </button>
                </div>
                
                <div className="sticky-note-modal-content">
                  <div className="content-section">
                    <label>Note Content:</label>
                    <textarea
                      value={stickyNoteContent}
                      onChange={(e) => setStickyNoteContent(e.target.value)}
                      placeholder="Enter your notes here..."
                      className="sticky-note-textarea"
                      rows={4}
                    />
                  </div>
                  
                  <div className="attachments-section">
                    <label>Attachments:</label>
                    <div className="attachment-controls">
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept="image/*,.pdf,.doc,.docx,.txt"
                        onChange={handleFileAttachment}
                        style={{ display: 'none' }}
                      />
                      <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="attach-btn"
                      >
                        📎 Attach Files
                      </button>
                      <span className="attachment-note">
                        Max 5MB per file (Images, PDFs, Documents)
                      </span>
                    </div>
                    
                    {stickyNoteAttachments.length > 0 && (
                      <div className="attachments-list">
                        {stickyNoteAttachments.map(attachment => (
                          <div key={attachment.id} className="attachment-item">
                            <div className="attachment-info">
                              {attachment.type.startsWith('image/') ? (
                                <div className="attachment-preview">
                                  <img 
                                    src={attachment.data} 
                                    alt={attachment.name}
                                    className="attachment-thumbnail"
                                    style={{
                                      width: '60px',
                                      height: '60px',
                                      objectFit: 'cover',
                                      borderRadius: '4px',
                                      border: '1px solid #e5e7eb',
                                      marginRight: '8px'
                                    }}
                                  />
                                  <div className="attachment-details">
                                    <span className="attachment-name">
                                      🖼️ {attachment.name}
                                    </span>
                                    <span className="attachment-size">
                                      ({(attachment.size / 1024).toFixed(1)} KB)
                                    </span>
                                  </div>
                                </div>
                              ) : (
                                <div className="attachment-details">
                                  <span className="attachment-name">
                                    📄 {attachment.name}
                                  </span>
                                  <span className="attachment-size">
                                    ({(attachment.size / 1024).toFixed(1)} KB)
                                  </span>
                                </div>
                              )}
                            </div>
                            <button 
                              onClick={() => removeAttachment(attachment.id)}
                              className="remove-attachment-btn"
                              title="Remove attachment"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  <div className="modal-actions">
                    <button 
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        saveStickyNote();
                      }}
                      className="save-btn"
                      disabled={!stickyNoteContent.trim() && stickyNoteAttachments.length === 0}
                    >
                      💾 Save Note
                    </button>
                    <button 
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        closeStickyNoteModal();
                      }}
                      className="cancel-btn"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
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
                stroke={drawingColor}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
          
          {/* Erase Success Message */}
          {eraseSuccessMessage && (
            <div
              style={{
                position: 'absolute',
                top: '20px',
                right: '20px',
                background: 'linear-gradient(135deg, #4caf50, #45a049)',
                color: 'white',
                padding: '12px 20px',
                borderRadius: '25px',
                fontSize: '14px',
                fontWeight: '600',
                boxShadow: '0 4px 12px rgba(76, 175, 80, 0.3)',
                zIndex: 1000,
                animation: 'slideInRight 0.3s ease-out',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              ✓ {eraseSuccessMessage}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PDFViewer;