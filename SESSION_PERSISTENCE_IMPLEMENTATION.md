# PDF Session Persistence Implementation

## Overview
This implementation adds comprehensive PDF session persistence with manual & auto save functionality and enhanced logout UI to the Forest PDF Viewer application.

## Features Implemented

### 1. User Dropdown Menu Enhancements ✅
- **Logout Button** - Secure logout functionality (already existed, verified working)
- **Autosave Toggle** - Visual switch to enable/disable autosaving with proper toggle UI
- **Manual Save Button** - Saves current PDF session data to database immediately

### 2. Database Schema ✅
Created new `PDFSession` model with comprehensive session tracking:

**Key Fields:**
- `current_page` - Current page number
- `zoom_level` - Current zoom level (0.1-10.0)
- `scroll_position` - Current scroll position {x, y}
- `reading_progress` - Overall reading progress (0-100%)
- `page_time_tracking` - Time spent per page (JSON)
- `annotation_summary` - Count of annotations by type
- `bookmarked_pages` - Array of bookmarked page numbers
- `auto_save_enabled` - User's auto-save preference
- `session_duration` - Total time spent in session
- `focus_metrics` - Focus tracking data
- `ai_interaction_history` - AI feature usage tracking

### 3. Backend API Endpoints ✅
Created `/api/sessions` routes with full CRUD operations:

**Endpoints:**
- `GET /api/sessions` - Get all user sessions
- `GET /api/sessions/file/:fileId` - Get/create session for file
- `POST /api/sessions/:sessionId/save` - Manual save
- `POST /api/sessions/:sessionId/autosave` - Auto save
- `PUT /api/sessions/:sessionId/page` - Update current page
- `PUT /api/sessions/:sessionId/bookmark` - Toggle bookmark
- `PUT /api/sessions/:sessionId/focus` - Record focus session
- `PUT /api/sessions/:sessionId/ai-interaction` - Record AI usage
- `PUT /api/sessions/:sessionId/settings` - Update session settings
- `GET /api/sessions/:sessionId/complete` - Get complete session with annotations

### 4. Frontend Session Management ✅
**SessionAPI Class** (`/src/utils/sessionAPI.js`):
- Handles all session persistence operations
- Automatic retry for failed requests
- Offline queue for when server is unavailable
- Debounced auto-save (2 seconds after changes)

**SessionContext** (`/src/contexts/SessionContext.jsx`):
- React context for session state management
- Page timer tracking with 10-second intervals
- Focus session tracking with distraction detection
- Automatic cleanup on session end

**Auto-save Hook** (`/src/hooks/useAutoSave.js`):
- Configurable auto-save intervals (default 30 seconds)
- Minimum 10 seconds between auto-saves
- Subtle user notifications

### 5. Data Persistence ✅
**What Gets Saved:**
- **Highlights** - Coordinates, color, text, page number, AI-generated flag
- **Underlines** - Coordinates, color, selected text, page number
- **Drawings** - SVG paths, coordinates, color, page number
- **Sticky Notes** - Text content, position, attachments, page number
- **AI-Generated Highlights** - Same format as regular highlights with AI metadata
- **Current Page** - Last viewed page number
- **Time Tracking** - Time spent per page in seconds
- **Reading Progress** - Overall completion percentage
- **Bookmarks** - Array of bookmarked page numbers
- **Focus Data** - Focus sessions with distraction tracking
- **Session Metadata** - Zoom, scroll position, view mode

### 6. Multi-Device Support ✅
**Features:**
- **User-File Session Mapping** - One session per user per file
- **Device Information Tracking** - Browser, OS, screen size
- **Conflict Resolution** - Version tracking for concurrent edits
- **Sync Status** - Tracks sync state (synced, pending, conflict, offline)
- **Cross-Browser Compatibility** - Works across different browsers
- **Offline Capability** - Queues changes when offline, syncs when online

## Database Relationships

```
Users (1) → (∞) PDFSessions
Files (1) → (∞) PDFSessions
Users (1) → (∞) Annotations (existing)
Files (1) → (∞) Annotations (existing)
Users (1) → (∞) PageTracking (existing)
```

## Security Features
- **User Authentication** - All endpoints require valid JWT token
- **User Isolation** - Users can only access their own sessions
- **Data Validation** - Input validation on all endpoints
- **Soft Deletes** - Sessions marked inactive instead of deleted

## Usage Flow

1. **Session Start** - User opens PDF, system creates/loads session
2. **Activity Tracking** - Page changes, time spent, annotations tracked
3. **Auto-save** - Changes automatically saved every 30 seconds (if enabled)
4. **Manual Save** - User clicks save button for immediate persistence
5. **Cross-Device** - User can continue session on different device/browser
6. **Logout** - Session data preserved, can be resumed later

## Technical Implementation Notes

### Auto-save Strategy
- Debounced updates (2 seconds after last change)
- Minimum interval enforcement (10 seconds between saves)
- Graceful offline handling with queue system
- Non-intrusive user notifications

### Performance Optimizations
- **Indexed Database Fields** - Fast queries on user_id, file_id, page_number
- **Composite Indexes** - Optimized for common query patterns
- **JSONB Storage** - Efficient storage for complex data structures
- **Lazy Loading** - Session data loaded only when needed

### Error Handling
- **Network Failures** - Graceful degradation with offline queue
- **Server Errors** - Retry logic with exponential backoff
- **Data Conflicts** - Version-based conflict resolution
- **User Feedback** - Clear error messages and status indicators

## Files Modified/Created

### Backend
- `backend/models/PDFSession.js` - New session model
- `backend/models/index.js` - Added PDFSession associations
- `backend/routes/sessions.js` - New session API routes
- `backend/server.js` - Registered session routes

### Frontend
- `frontend/src/utils/sessionAPI.js` - Session API client
- `frontend/src/contexts/SessionContext.jsx` - Session state management
- `frontend/src/hooks/useAutoSave.js` - Auto-save functionality
- `frontend/src/components/UserMenu.jsx` - Enhanced with toggle switch
- `frontend/src/styles/user-menu.css` - Toggle switch styling
- `frontend/src/App.jsx` - Added SessionProvider

## Testing Recommendations

1. **Cross-Browser Testing** - Verify session persistence across Chrome, Firefox, Safari
2. **Offline/Online Testing** - Test queue functionality when network unavailable
3. **Multi-Device Testing** - Open same file on different devices
4. **Concurrent Access** - Test conflict resolution with simultaneous edits
5. **Performance Testing** - Large documents with many annotations
6. **Error Scenarios** - Network failures, server downtime, invalid data

## Future Enhancements

1. **Real-time Collaboration** - WebSocket support for live collaboration
2. **Session History** - Ability to view/restore previous session states
3. **Advanced Analytics** - Reading pattern analysis and insights
4. **Cloud Sync** - Integration with cloud storage providers
5. **Session Sharing** - Share reading sessions with other users

## Database Migration

The new `PDFSession` model will be automatically created when the server starts. No manual migration required due to Sequelize auto-sync functionality.

## Configuration

Auto-save interval and other settings can be configured in the SessionAPI constructor:
```javascript
// Default settings
this.autoSaveInterval = 30000; // 30 seconds
this.debounceDelay = 2000; // 2 seconds
this.minSaveInterval = 10000; // 10 seconds
```

## Monitoring

Session persistence can be monitored through:
- Database queries on `pdf_sessions` table
- Application logs for save operations
- User feedback through toast notifications
- Network requests in browser dev tools