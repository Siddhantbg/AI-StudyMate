const express = require('express');
const cors = require('cors');
require('dotenv').config();

console.log('Starting minimal test...');

const app = express();
const PORT = 3002;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.json({ message: 'Minimal server running!' });
});

app.post('/test-register', async (req, res) => {
    try {
        console.log('Test register endpoint called');
        const mongoose = require('mongoose');
        
        if (mongoose.connection.readyState === 0) {
            console.log('Connecting to MongoDB...');
            await mongoose.connect(process.env.MONGODB_URI);
        }
        
        const User = require('./models/mongodb/User');
        console.log('User model loaded');
        
        const { email, password, first_name, last_name } = req.body;
        console.log('Creating user with email:', email);
        
        const user = new User({
            email,
            password,
            first_name,
            last_name
        });
        
        await user.save();
        console.log('User saved successfully');
        
        res.json({
            success: true,
            message: 'User registered successfully',
            data: {
                id: user._id,
                email: user.email,
                username: user.username
            }
        });
        
    } catch (error) {
        console.error('Registration error:', error.message);
        res.status(500).json({
            success: false,
            error: 'Registration failed: ' + error.message
        });
    }
});

app.listen(PORT, () => {
    console.log(`Minimal test server running on port ${PORT}`);
});