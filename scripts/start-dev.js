#!/usr/bin/env node

const { spawn } = require('child_process');
const http = require('http');

/**
 * Development startup script with better feedback
 */
async function startDev() {
    console.log('🚀 Starting WhatsApp Auto-Reply System in development mode...');
    console.log('');
    
    // Start the application
    const app = spawn('node', ['dist/index.js'], {
        stdio: 'inherit',
        env: { ...process.env, NODE_ENV: 'development' }
    });
    
    // Wait a moment for the server to start
    setTimeout(async () => {
        console.log('');
        console.log('📋 Checking application status...');
        
        try {
            await checkWebServer();
            console.log('✅ Web server is running');
            console.log('');
            console.log('🌐 Access the application:');
            console.log('   Web Interface: http://localhost:3000');
            console.log('   Health Check:  http://localhost:3000/api/health');
            console.log('   System Status: http://localhost:3000/api/status');
            console.log('');
            console.log('📱 WhatsApp Setup:');
            console.log('   1. Open http://localhost:3000 in your browser');
            console.log('   2. Scan the QR code with your WhatsApp mobile app');
            console.log('   3. Go to WhatsApp > Settings > Linked Devices');
            console.log('   4. Tap "Link a Device" and scan the QR code');
            console.log('');
            console.log('⏹️  To stop the application, press Ctrl+C');
            console.log('');
        } catch (error) {
            console.log('⚠️  Web server may still be starting...');
            console.log('   If this persists, check the logs above for errors');
        }
    }, 3000);
    
    // Handle application exit
    app.on('close', (code) => {
        console.log(`\n📋 Application exited with code ${code}`);
        process.exit(code);
    });
    
    app.on('error', (error) => {
        console.error('❌ Failed to start application:', error);
        process.exit(1);
    });
    
    // Handle Ctrl+C
    process.on('SIGINT', () => {
        console.log('\n⏹️  Stopping application...');
        app.kill('SIGINT');
    });
}

function checkWebServer() {
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: 'localhost',
            port: 3000,
            path: '/api/health',
            method: 'GET',
            timeout: 2000
        }, (res) => {
            resolve();
        });
        
        req.on('error', reject);
        req.on('timeout', () => reject(new Error('Timeout')));
        req.end();
    });
}

// Run if called directly
if (require.main === module) {
    startDev();
}

module.exports = { startDev };