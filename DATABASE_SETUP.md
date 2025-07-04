# Forest PDF Viewer - Database Setup Guide

This guide will help you set up the PostgreSQL database integration for the Forest PDF Viewer application.

## 🗄️ Database Features

The PostgreSQL integration provides:

- **User Management**: Secure authentication with JWT tokens
- **PDF File Storage**: Metadata storage with user ownership
- **Annotation System**: Persistent highlights, comments, drawings, and sticky notes
- **Page Tracking**: Reading progress, time spent, and bookmarks
- **Quiz Results**: Storage and analysis of quiz performance
- **Session Management**: Secure session handling with device tracking

## 📋 Prerequisites

Before setting up the database, ensure you have:

1. **PostgreSQL 12+** installed and running
2. **Node.js 18+** (already required for the project)
3. **Database access credentials** (username, password, database name)

## 🚀 Quick Setup

### 1. Install PostgreSQL

#### On Ubuntu/Debian:
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

#### On macOS (using Homebrew):
```bash
brew install postgresql
brew services start postgresql
```

#### On Windows:
Download and install from [PostgreSQL official website](https://www.postgresql.org/download/windows/)

### 2. Create Database and User

```bash
# Connect to PostgreSQL as superuser
sudo -u postgres psql

# Create database
CREATE DATABASE forest_pdf_viewer_dev;
CREATE DATABASE forest_pdf_viewer_test;

# Create user (optional, you can use postgres user)
CREATE USER forest_user WITH PASSWORD 'your_secure_password';

# Grant permissions
GRANT ALL PRIVILEGES ON DATABASE forest_pdf_viewer_dev TO forest_user;
GRANT ALL PRIVILEGES ON DATABASE forest_pdf_viewer_test TO forest_user;

# Exit PostgreSQL
\q
```

### 3. Configure Environment Variables

Update your `backend/.env` file with the database configuration:

```env
# Database Configuration (PostgreSQL)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=forest_pdf_viewer_dev
DB_NAME_TEST=forest_pdf_viewer_test
DB_USER=forest_user
DB_PASSWORD=your_secure_password
DB_SSL=false

# JWT Configuration (IMPORTANT: Generate secure secrets!)
JWT_SECRET=your_very_long_and_secure_jwt_secret_key_here_at_least_32_characters
JWT_REFRESH_SECRET=your_very_long_and_secure_refresh_secret_key_here_at_least_32_characters
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d
```

**⚠️ Security Note**: Always use strong, unique secrets for JWT tokens in production!

### 4. Install Dependencies

If not already installed, add the cookie-parser dependency:

```bash
cd backend
npm install cookie-parser
```

### 5. Initialize Database

Run the database initialization script:

```bash
# Navigate to backend directory
cd backend

# Initialize development database
node scripts/initDatabase.js

# Or initialize with force mode (⚠️ WARNING: Deletes existing data!)
node scripts/initDatabase.js --force

# For production environment
node scripts/initDatabase.js --env=production
```

### 6. Start the Server

```bash
# Development mode
npm run dev

# Production mode
npm start
```

## 🔧 Database Schema

### Core Tables

#### Users Table
- User authentication and profile information
- Preferences and settings
- Email verification status

#### Files Table
- PDF file metadata and ownership
- Reading progress tracking
- File processing status

#### Annotations Table
- All annotation types (highlights, comments, drawings, sticky notes)
- Coordinate system for precise positioning
- AI-generated annotations support

#### Page Tracking Table
- Detailed reading analytics per page
- Time spent, scroll depth, interaction events
- Focus sessions and difficulty ratings

#### Quiz Results Table
- Quiz performance and analytics
- AI feedback and improvement suggestions
- Historical tracking

#### User Sessions Table
- JWT session management
- Device and location tracking
- Security and audit logging

## 📊 API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/refresh` - Token refresh
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Get user profile

### File Management
- `POST /api/upload` - Upload PDF (requires auth)
- `GET /api/files` - List user's files (requires auth)
- `GET /api/files/:filename` - Serve PDF file (requires auth)
- `POST /api/files/rename` - Rename file (requires auth)

### Annotations
- `GET /api/annotations/file/:fileId` - Get file annotations
- `GET /api/annotations/file/:fileId/page/:pageNumber` - Get page annotations
- `POST /api/annotations` - Create annotation
- `PUT /api/annotations/:annotationId` - Update annotation
- `DELETE /api/annotations/:annotationId` - Delete annotation
- `POST /api/annotations/bulk` - Bulk create annotations
- `GET /api/annotations/search` - Search annotations

### Page Tracking
- `POST /api/page-tracking/track` - Track page activity
- `POST /api/page-tracking/focus-session` - Record focus session
- `GET /api/page-tracking/file/:fileId` - Get file progress
- `PUT /api/page-tracking/bookmark` - Toggle page bookmark
- `GET /api/page-tracking/stats` - Get reading statistics

## 🔄 Migration from Local Storage

The new system is designed to work alongside the existing localStorage system during transition:

1. **Existing Data**: Current localStorage annotations and files continue to work
2. **New Features**: Database-backed features require user authentication
3. **Data Migration**: Plan to migrate existing data to user accounts (future feature)

## 🧪 Testing

### Create Test User

The initialization script creates default users:

- **Admin User**: `admin@forestpdf.com` / `admin123456`
- **Test User** (dev only): `test@forestpdf.com` / `test123456`

⚠️ **Important**: Change default passwords in production!

### Test API Endpoints

```bash
# Register new user
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123","first_name":"Test","last_name":"User"}'

# Login
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123"}'

# Upload file (requires auth token)
curl -X POST http://localhost:3001/api/upload \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "pdf=@test.pdf"
```

## 🔐 Security Features

### Authentication Security
- **JWT Tokens**: Secure access and refresh tokens
- **Password Hashing**: bcrypt with salt rounds
- **Session Management**: Device tracking and session expiry
- **Rate Limiting**: Protection against brute force attacks

### Data Security
- **User Isolation**: Users can only access their own data
- **File Authorization**: PDF serving requires ownership verification
- **Input Validation**: Comprehensive validation on all endpoints
- **SQL Injection Protection**: Sequelize ORM with parameterized queries

## 🚨 Troubleshooting

### Common Issues

#### Database Connection Failed
```
❌ Unable to connect to the database
```
**Solution**: Check PostgreSQL is running and credentials are correct in `.env`

#### Authentication Required
```
❌ Access token required
```
**Solution**: Include JWT token in Authorization header: `Bearer YOUR_TOKEN`

#### File Not Found
```
❌ File not found or access denied
```
**Solution**: Ensure user owns the file and file exists in database

### Debug Mode

Enable detailed logging by setting:
```env
NODE_ENV=development
```

### Reset Database

To completely reset the database:
```bash
# WARNING: This deletes all data!
node scripts/initDatabase.js --force
```

## 📈 Performance Optimization

### Database Indexes
The schema includes optimized indexes for:
- User file queries
- Page-based annotation lookups
- Search operations
- Session management

### Connection Pooling
Configured for optimal performance:
- Development: 5 connections
- Production: 20 connections

### Caching
- JWT token validation
- File metadata caching
- Session management optimization

## 🌐 Production Deployment

### Environment Variables
Ensure all production environment variables are set:
```env
NODE_ENV=production
DB_HOST=your_production_host
DB_SSL=true
JWT_SECRET=very_long_secure_secret
```

### Database Migrations
For production updates:
```bash
node scripts/initDatabase.js --env=production
```

### Monitoring
Monitor these metrics:
- Database connection pool usage
- Session creation/cleanup
- Authentication rates
- File upload/access patterns

## 📚 Additional Resources

- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Sequelize ORM Guide](https://sequelize.org/docs/v6/)
- [JWT Best Practices](https://auth0.com/blog/a-look-at-the-latest-draft-for-jwt-bcp/)
- [Node.js Security Checklist](https://blog.risingstack.com/node-js-security-checklist/)

## ❓ Support

If you encounter issues:

1. Check the troubleshooting section above
2. Verify your PostgreSQL installation and configuration
3. Ensure all environment variables are correctly set
4. Check server logs for detailed error messages

For additional help, refer to the main project documentation or create an issue in the project repository.