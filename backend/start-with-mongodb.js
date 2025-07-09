const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config();

// Initialize MongoDB connection
const { connectToMongoDB, testConnection, initializeDatabase } = require('./config/mongodb');

// Import middleware
const { httpLogger, logger } = require('./middleware/logging');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
    origin: ['https://ai-study-mate-seven.vercel.app', 'http://localhost:5173'],
    credentials: true
}));

app.use(httpLogger);
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());

// Basic route to test if server is running
app.get('/', (req, res) => {
    res.json({ 
        message: 'Forest PDF Viewer API is running with MongoDB! 🌲🍃',
        database: 'MongoDB',
        status: 'healthy'
    });
});

// Health check route
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        database: 'MongoDB',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Authentication routes (basic version)
app.post('/api/auth/test', async (req, res) => {
    try {
        const { User } = require('./models/mongodb');
        const testUser = new User({
            email: 'test@example.com',
            password: 'testpassword123',
            first_name: 'Test',
            last_name: 'User'
        });
        
        // Don't actually save, just test the model
        const errors = testUser.validateSync();
        if (errors) {
            return res.status(400).json({ 
                success: false, 
                error: 'Validation failed',
                details: errors.message 
            });
        }
        
        res.json({ 
            success: true, 
            message: 'MongoDB models are working correctly',
            user_model_test: 'passed'
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: 'Model test failed',
            details: error.message 
        });
    }
});

// Error handling
app.use(errorHandler);
app.use(notFoundHandler);

// Start server with MongoDB
const startServer = async () => {
    try {
        console.log('🚀 Starting Forest PDF Viewer with MongoDB...');
        console.log('=====================================');
        
        // Test MongoDB connection
        console.log('🔗 Connecting to MongoDB...');
        const connectionSuccess = await testConnection();
        
        if (connectionSuccess) {
            // Initialize database
            console.log('🔧 Initializing MongoDB database...');
            await initializeDatabase();
            console.log('✅ Database initialized successfully');
            
            // Start server
            app.listen(PORT, () => {
                console.log('');
                console.log('🎉 SERVER STARTED SUCCESSFULLY!');
                console.log('=====================================');
                console.log(`🌲 Forest PDF Viewer running on port ${PORT}`);
                console.log(`🍃 Database: MongoDB (Connected)`);
                console.log(`🔗 Health Check: http://localhost:${PORT}/api/health`);
                console.log(`🧪 Model Test: http://localhost:${PORT}/api/auth/test`);
                console.log('📚 Ready to process PDFs with MongoDB!');
                console.log('=====================================');
                
                logger.info('Forest PDF Viewer server started', {
                    port: PORT,
                    database: 'MongoDB',
                    environment: process.env.NODE_ENV || 'development',
                    timestamp: new Date().toISOString()
                });
            });
        } else {
            console.error('❌ Failed to connect to MongoDB. Server startup aborted.');
            console.log('');
            console.log('🔧 TROUBLESHOOTING:');
            console.log('   1. Check your MONGODB_URI in .env file');
            console.log('   2. Verify MongoDB Atlas connection');
            console.log('   3. Run: node test-mongodb.js');
            process.exit(1);
        }
    } catch (error) {
        console.error('❌ Failed to start server:', error.message);
        console.error('Error details:', error);
        process.exit(1);
    }
};

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down server...');
    const { closeConnection } = require('./config/mongodb');
    await closeConnection();
    console.log('✅ Server shut down gracefully');
    process.exit(0);
});

// Start the server
startServer().catch(error => {
    console.error('❌ Server startup failed:', error);
    process.exit(1);
});

module.exports = app;