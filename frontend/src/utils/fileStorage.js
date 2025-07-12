// File storage utility using IndexedDB for PDF file management

const DB_NAME = 'ForestPDFViewer';
const DB_VERSION = 2;
const STORE_NAME = 'uploadedFiles';

// Initialize IndexedDB
const initDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('uploadDate', 'uploadDate', { unique: false });
        store.createIndex('fileName', 'fileName', { unique: false });
      }
    };
  });
};

// Recreate database if corrupted
const recreateDatabase = () => {
  return new Promise((resolve, reject) => {
    // Delete existing database
    const deleteRequest = indexedDB.deleteDatabase(DB_NAME);
    
    deleteRequest.onerror = () => reject(deleteRequest.error);
    deleteRequest.onsuccess = () => {
      console.log('Database deleted successfully');
      // Reinitialize the database
      initDB().then(resolve).catch(reject);
    };
  });
};

// Save file to IndexedDB
export const saveFile = async (file, uploadedFileName) => {
  try {
    const db = await initDB();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    // Convert file to array buffer for storage
    const arrayBuffer = await file.arrayBuffer();
    
    const fileData = {
      id: Date.now().toString(),
      fileName: file.name,
      uploadedFileName: uploadedFileName,
      fileSize: file.size,
      fileType: file.type,
      uploadDate: new Date().toISOString(),
      arrayBuffer: arrayBuffer
    };
    
    const request = store.add(fileData);
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        console.log('File saved to IndexedDB:', fileData.fileName);
        resolve(fileData.id);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Error saving file:', error);
    throw error;
  }
};

// Get all saved files metadata
export const getSavedFiles = async () => {
  try {
    const db = await initDB();
    
    // Check if object store exists
    if (!db.objectStoreNames.contains(STORE_NAME)) {
      console.log('Object store not found, reinitializing...');
      db.close();
      const newDb = await initDB();
      if (!newDb.objectStoreNames.contains(STORE_NAME)) {
        return [];
      }
    }
    
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const files = request.result.map(file => ({
          id: file.id,
          fileName: file.fileName,
          uploadedFileName: file.uploadedFileName,
          fileSize: file.fileSize,
          fileType: file.fileType,
          uploadDate: file.uploadDate
        }));
        resolve(files);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Error getting saved files:', error);
    // Return empty array instead of recreating database
    return [];
  }
};

// Load file from IndexedDB
export const loadFile = async (fileId) => {
  try {
    const db = await initDB();
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(fileId);
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const fileData = request.result;
        if (fileData) {
          // Convert array buffer back to File object
          const file = new File([fileData.arrayBuffer], fileData.fileName, {
            type: fileData.fileType,
            lastModified: new Date(fileData.uploadDate).getTime()
          });
          
          resolve({
            file: file,
            uploadedFileName: fileData.uploadedFileName,
            metadata: {
              id: fileData.id,
              fileName: fileData.fileName,
              fileSize: fileData.fileSize,
              uploadDate: fileData.uploadDate
            }
          });
        } else {
          reject(new Error('File not found'));
        }
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Error loading file:', error);
    throw error;
  }
};

// Delete file from IndexedDB
export const deleteFile = async (fileId) => {
  try {
    const db = await initDB();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(fileId);
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        console.log('File deleted from IndexedDB:', fileId);
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Error deleting file:', error);
    throw error;
  }
};

// Format file size for display
export const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// Get files from server
export const getServerFiles = async () => {
  try {
    const token = localStorage.getItem('access_token');
    
    if (!token) {
      console.log('No authentication token found');
      return [];
    }
    
    const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/files`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      if (response.status === 401) {
        console.log('Authentication required for server files');
        return [];
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    
    if (result.success) {
      return result.files;
    } else {
      console.error('Failed to fetch server files:', result.error);
      return [];
    }
  } catch (error) {
    console.error('Error fetching server files:', error);
    return [];
  }
};

// Get all files (both local and server)
export const getAllFiles = async () => {
  try {
    const [localFiles, serverFiles] = await Promise.all([
      getSavedFiles(),
      getServerFiles()
    ]);
    
    // Combine and sort by upload date (newest first)
    const allFiles = [...localFiles, ...serverFiles];
    allFiles.sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate));
    
    return allFiles;
  } catch (error) {
    console.error('Error getting all files:', error);
    return [];
  }
};

// Load file from server
export const loadServerFile = async (uploadedFileName) => {
  try {
    const token = localStorage.getItem('access_token');
    
    if (!token) {
      throw new Error('No authentication token found');
    }
    
    const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/files/${uploadedFileName}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to load file: ${response.statusText}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    
    // Create a File object from the server response
    const file = new File([arrayBuffer], uploadedFileName, {
      type: 'application/pdf',
      lastModified: Date.now()
    });
    
    return {
      file: file,
      uploadedFileName: uploadedFileName,
      metadata: {
        fileName: uploadedFileName,
        fileSize: arrayBuffer.byteLength,
        uploadDate: new Date().toISOString(),
        source: 'server'
      }
    };
  } catch (error) {
    console.error('Error loading server file:', error);
    throw error;
  }
};

// Format upload date for display
export const formatUploadDate = (isoDate) => {
  const date = new Date(isoDate);
  const now = new Date();
  const diffTime = Math.abs(now - date);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays === 1) {
    return 'Today';
  } else if (diffDays === 2) {
    return 'Yesterday';
  } else if (diffDays <= 7) {
    return `${diffDays - 1} days ago`;
  } else {
    return date.toLocaleDateString();
  }
};