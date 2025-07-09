const mongoose = require('mongoose');
require('dotenv').config();

async function testMongoDBConnection() {
    console.log('🧪 Testing MongoDB Connection...');
    console.log('=====================================');
    
    try {
        // Get connection details from environment
        const mongoUri = process.env.MONGODB_URI;
        console.log('📍 MongoDB URI:', mongoUri ? mongoUri.replace(/\/\/.*@/, '//***:***@') : 'Not set');
        
        if (!mongoUri) {
            throw new Error('MONGODB_URI environment variable is not set');
        }
        
        // Test connection
        console.log('🔗 Connecting to MongoDB...');
        await mongoose.connect(mongoUri, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 10000, // 10 second timeout
            socketTimeoutMS: 45000,
        });
        
        console.log('✅ Connected to MongoDB successfully!');
        
        // Test database operations
        console.log('🧪 Testing basic database operations...');
        
        // Test ping
        await mongoose.connection.db.admin().ping();
        console.log('🏓 Database ping successful');
        
        // Test database info
        const dbStats = await mongoose.connection.db.stats();
        console.log('📊 Database stats:');
        console.log(`   - Database: ${mongoose.connection.name}`);
        console.log(`   - Collections: ${dbStats.collections}`);
        console.log(`   - Data Size: ${(dbStats.dataSize / 1024 / 1024).toFixed(2)} MB`);
        
        // Test creating a test collection
        const testCollection = mongoose.connection.db.collection('connection_test');
        const testDoc = { test: true, timestamp: new Date() };
        const insertResult = await testCollection.insertOne(testDoc);
        console.log('✅ Test document inserted:', insertResult.insertedId);
        
        // Clean up test document
        await testCollection.deleteOne({ _id: insertResult.insertedId });
        console.log('🧹 Test document cleaned up');
        
        // Test model creation
        console.log('🔧 Testing model compilation...');
        const TestSchema = new mongoose.Schema({
            name: String,
            created: { type: Date, default: Date.now }
        });
        
        const TestModel = mongoose.model('ConnectionTest', TestSchema);
        const testInstance = new TestModel({ name: 'Connection Test' });
        await testInstance.save();
        console.log('✅ Test model document created:', testInstance._id);
        
        // Clean up test model document
        await TestModel.deleteOne({ _id: testInstance._id });
        console.log('🧹 Test model document cleaned up');
        
        // Test indexes
        console.log('🔍 Testing index creation...');
        await TestModel.createIndexes();
        console.log('✅ Indexes created successfully');
        
        console.log('');
        console.log('🎉 All MongoDB tests passed successfully!');
        console.log('=====================================');
        console.log('✅ MongoDB is ready for the application');
        
        return true;
        
    } catch (error) {
        console.error('❌ MongoDB connection test failed:');
        console.error('   Error:', error.message);
        
        if (error.code) {
            console.error('   Error Code:', error.code);
        }
        
        console.log('');
        console.log('🔧 TROUBLESHOOTING GUIDE:');
        console.log('=====================================');
        
        if (error.message.includes('ENOTFOUND')) {
            console.log('❌ DNS Resolution Failed');
            console.log('   - Check your internet connection');
            console.log('   - Verify the MongoDB URI hostname');
            console.log('   - Check if your firewall is blocking the connection');
        } else if (error.message.includes('authentication failed')) {
            console.log('❌ Authentication Failed');
            console.log('   - Check your MongoDB username and password');
            console.log('   - Verify user permissions in MongoDB Atlas');
            console.log('   - Ensure the user has read/write access to the database');
        } else if (error.message.includes('timeout')) {
            console.log('❌ Connection Timeout');
            console.log('   - Check your internet connection speed');
            console.log('   - Verify MongoDB server is running');
            console.log('   - Check firewall settings');
        } else if (error.message.includes('not set')) {
            console.log('❌ Environment Variable Missing');
            console.log('   - Set MONGODB_URI in your .env file');
            console.log('   - Format: mongodb://username:password@host:port/database');
            console.log('   - For Atlas: mongodb+srv://username:password@cluster.mongodb.net/database');
        }
        
        console.log('');
        console.log('📝 Next Steps:');
        console.log('   1. Fix the issues above');
        console.log('   2. Run this test again: node test-mongodb.js');
        console.log('   3. Once successful, start your server: npm start');
        
        return false;
        
    } finally {
        // Close connection
        if (mongoose.connection.readyState === 1) {
            await mongoose.connection.close();
            console.log('🔌 MongoDB connection closed');
        }
    }
}

// Run the test
testMongoDBConnection().then(success => {
    process.exit(success ? 0 : 1);
}).catch(error => {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
});