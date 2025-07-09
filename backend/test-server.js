const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const { testConnection, initializeDatabase } = require('./config/mongodb');
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

// Health check
app.get('/', (req, res) => {
    res.json({ message: 'Test server running! 🌲' });
});

// Auth routes
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

// Error handling middleware
app.use(errorHandler);
app.use(notFoundHandler);

// Start server
const startServer = async () => {
    try {
        console.log('🔗 Connecting to database...');
        const connectionSuccess = await testConnection();
        
        if (connectionSuccess) {
            await initializeDatabase();
            logger.info('Database initialized successfully');
            
            app.listen(PORT, () => {
                console.log(`🌲 Test server running on port ${PORT}`);
                console.log(`🔐 Authentication endpoints available at /api/auth/`);
            });
        } else {
            console.error('❌ Failed to connect to database. Server will not start.');
            process.exit(1);
        }
    } catch (error) {
        console.error('❌ Failed to start server:', error.message);
        process.exit(1);
    }
};

startServer();