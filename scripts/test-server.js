#!/usr/bin/env node

/**
 * Simple test to check if the web server can start independently
 */
const express = require('express');
const path = require('path');

async function testServer() {
    console.log('🧪 Testing basic web server functionality...');
    
    const app = express();
    const port = 3000;
    
    // Basic middleware
    app.use(express.json());
    app.use(express.static('public'));
    
    // Test routes
    app.get('/', (req, res) => {
        res.json({ 
            status: 'ok', 
            message: 'WhatsApp Auto-Reply System - Test Mode',
            timestamp: new Date().toISOString()
        });
    });
    
    app.get('/api/health', (req, res) => {
        res.json({
            status: 'healthy',
            checks: {
                webServer: true,
                whatsapp: false,
                configuration: true
            },
            timestamp: new Date().toISOString()
        });
    });
    
    app.get('/api/status', (req, res) => {
        res.json({
            whatsapp: 'Not Connected (Test Mode)',
            engine: 'Stopped',
            webServer: 'Running',
            uptime: process.uptime()
        });
    });
    
    // Start server
    const server = app.listen(port, () => {
        console.log('✅ Test server started successfully!');
        console.log('');
        console.log('🌐 Test URLs:');
        console.log(`   Main: http://localhost:${port}`);
        console.log(`   Health: http://localhost:${port}/api/health`);
        console.log(`   Status: http://localhost:${port}/api/status`);
        console.log('');
        console.log('⏹️  Press Ctrl+C to stop');
    });
    
    // Handle shutdown
    process.on('SIGINT', () => {
        console.log('\n⏹️  Stopping test server...');
        server.close(() => {
            console.log('✅ Test server stopped');
            process.exit(0);
        });
    });
}

// Run test
testServer().catch(error => {
    console.error('❌ Test server failed:', error);
    process.exit(1);
});