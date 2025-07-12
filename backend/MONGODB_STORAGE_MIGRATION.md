# MongoDB File Storage Migration

## Overview

The application has been successfully migrated from filesystem-based file storage to MongoDB binary storage. This eliminates file sync issues and makes the application truly database-centric.

## Changes Made

### 1. **File Model Updates** (`models/mongodb/File.js`)

**New Fields Added:**
- `file_data`: Buffer - Stores binary PDF data in MongoDB
- `storage_type`: String - Identifies storage method ('filesystem' or 'mongodb')
- `file_path`: Made optional for backward compatibility

**New Methods Added:**
- `storeFileData(buffer)` - Stores binary data in MongoDB
- `getFileData()` - Retrieves binary data from MongoDB
- `hasFileData()` - Checks if binary data exists
- `getFileSize()` - Gets file size from binary data or metadata

### 2. **Upload Endpoint Updates** (`server.js`)

**Changes:**
- **Multer Configuration**: Switched from `diskStorage` to `memoryStorage`
- **File Storage**: Files are now stored as binary data in MongoDB
- **Timeout**: Increased to 15 seconds for binary data uploads
- **Filename Generation**: Generates unique filenames without filesystem dependency

**New Upload Flow:**
1. File received in memory buffer
2. Unique filename generated
3. Binary data stored in MongoDB with metadata
4. No filesystem interaction required

### 3. **File Serving Updates** (`server.js`)

**Dual Storage Support:**
- **MongoDB Files**: Served directly from binary data
- **Legacy Files**: Still supports filesystem-based files for backward compatibility

**New Serving Flow:**
1. Check file's `storage_type`
2. If `mongodb`: Serve binary data directly with proper headers
3. If `filesystem`: Fall back to traditional file streaming

### 4. **File Validation Updates**

**Enhanced Validation:**
- **MongoDB Files**: Validates binary data existence
- **Filesystem Files**: Validates file existence on disk
- **Prevents Infinite Loading**: Only returns valid files to frontend

### 5. **Migration Tools**

**Scripts Created:**
- `migrate-files-to-mongodb.js` - Migrates existing files from uploads/ to MongoDB
- `cleanup-orphaned-files.js` - Existing cleanup utility (updated for both storage types)

## Benefits

### ✅ **Advantages**
1. **No File Sync Issues**: Files and metadata always in sync
2. **Simplified Deployment**: No need to manage uploads/ directory
3. **Better Scalability**: Files stored in database clusters
4. **Atomic Operations**: File and metadata operations are transactional
5. **Backup Simplicity**: Files included in database backups
6. **Multi-Environment**: No file path issues across environments

### ⚠️ **Considerations**
1. **Database Size**: MongoDB size will increase significantly
2. **Memory Usage**: Large files loaded into memory during upload/download
3. **Performance**: Binary queries may be slower than filesystem for very large files
4. **GridFS Alternative**: For files >16MB, consider GridFS in the future

## Testing Instructions

### 1. **Test New File Uploads**
```bash
# Start the server
npm start

# Test file upload via frontend or API
curl -X POST http://localhost:3001/api/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "pdf=@test.pdf"
```

### 2. **Test File Download**
```bash
# Test file serving
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3001/api/files/FILENAME.pdf
```

### 3. **Test File Listing**
```bash
# Test file listing
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3001/api/files
```

### 4. **Migrate Existing Files** (Optional)
```bash
# Run migration script
node migrate-files-to-mongodb.js
```

## Database Schema

### File Document Structure
```javascript
{
  _id: ObjectId,
  user_id: ObjectId,
  filename: String,              // Generated unique filename
  original_name: String,         // User's original filename
  file_size: Number,            // File size in bytes
  file_data: Buffer,            // Binary PDF data (NEW)
  storage_type: 'mongodb',      // Storage method (NEW)
  file_path: String,            // Legacy field (optional)
  mime_type: 'application/pdf',
  upload_source: 'server',
  processing_status: 'pending',
  created_at: Date,
  updated_at: Date
}
```

## API Changes

### Upload Response
```json
{
  "success": true,
  "message": "File uploaded successfully",
  "file": {
    "id": "file_id",
    "filename": "pdf-timestamp-random.pdf",
    "originalName": "user_file.pdf",
    "size": 1048576,
    "storageType": "mongodb",
    "uploadTime": "2025-07-10T00:00:00.000Z"
  }
}
```

### File Serving
- **Headers**: Proper Content-Type and Content-Length
- **Performance**: Direct binary data serving
- **Compatibility**: Maintains same URL structure

## Migration Path

### For New Installations
- Files automatically stored in MongoDB
- No additional configuration needed

### For Existing Installations
1. **Update Code**: Deploy new version
2. **Test**: Verify new uploads work
3. **Migrate**: Run migration script for existing files
4. **Verify**: Check all files are accessible
5. **Cleanup**: Optionally remove uploads/ directory

## Rollback Plan

If needed, you can rollback by:
1. Reverting code changes
2. Existing filesystem files still work
3. MongoDB files would need manual extraction

## Performance Considerations

### Optimizations Implemented
- **Memory Efficient**: Streams used where possible
- **Proper Headers**: Content-Length for efficient downloads
- **Validation**: Early validation prevents unnecessary processing

### Future Optimizations
- **GridFS**: For files >16MB
- **Compression**: Binary data compression
- **Caching**: File caching layer
- **CDN**: Content delivery network integration

## Security

### Current Security
- **Authentication**: All endpoints require valid tokens
- **User Isolation**: Users can only access their own files
- **File Validation**: Only PDF files accepted
- **Size Limits**: 100MB upload limit

### Additional Security Considerations
- **Binary Validation**: Validate PDF structure
- **Virus Scanning**: Consider virus scanning for uploads
- **Rate Limiting**: Prevent abuse of upload endpoints

## Conclusion

The migration to MongoDB storage provides a more robust, scalable, and maintainable file storage solution. The application now eliminates file sync issues and provides a truly database-centric architecture.

**Next Steps:**
1. Test the new system thoroughly
2. Monitor database size and performance
3. Consider implementing GridFS for large files
4. Update backup procedures to include file data