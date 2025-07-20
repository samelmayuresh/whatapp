#!/usr/bin/env node

/**
 * Simple startup script for WhatsApp Auto-Reply System
 * This version focuses on getting WhatsApp connected first
 */

const { spawn } = require('child_process');
const path = require('path');

async function startSimple() {
    console.log('🚀 Starting WhatsApp Auto-Reply System (Simple Mode)...');
    console.log('====================================================');
    console.log('');
    console.log('This will:');
    console.log('1. Start the application');
    console.log('2. Show QR code for WhatsApp connection');
    console.log('3. Automatically enable auto-replies once connected');
    console.log('');
    console.log('⏳ Starting...');
    console.log('');

    // Start the main application
    const app = spawn('node', ['dist/index.js'], {
        stdio: 'inherit',
        cwd: process.cwd(),
        env: {
            ...process.env,
            NODE_ENV: 'development'
        }
    });

    // Handle application events
    app.on('error', (error) => {
        console.error('❌ Failed to start application:', error.message);
        process.exit(1);
    });

    app.on('close', (code) => {
        console.log(`\n📋 Application exited with code ${code}`);
        if (code !== 0) {
            console.log('💡 Try running these commands to fix issues:');
            console.log('   npm run build');
            console.log('   npm install');
            console.log('   Remove-Item -Recurse -Force .wwebjs_auth');
        }
        process.exit(code);
    });

    // Handle Ctrl+C gracefully
    process.on('SIGINT', () => {
        console.log('\n⏹️  Stopping application...');
        app.kill('SIGINT');
    });

    process.on('SIGTERM', () => {
        console.log('\n⏹️  Stopping application...');
        app.kill('SIGTERM');
    });

    // Show helpful information after a delay
    setTimeout(() => {
        console.log('');
        console.log('📱 WhatsApp Connection Instructions:');
        console.log('   1. Wait for the QR code to appear above');
        console.log('   2. Open WhatsApp on your phone');
        console.log('   3. Go to Settings > Linked Devices');
        console.log('   4. Tap "Link a Device"');
        console.log('   5. Scan the QR code');
        console.log('');
        console.log('🌐 Once connected, you can access:');
        console.log('   Web Interface: http://localhost:3000');
        console.log('   System Status: http://localhost:3000/api/status');
        console.log('');
        console.log('⏹️  To stop: Press Ctrl+C');
        console.log('');
    }, 3000);
}

// Run if called directly
if (require.main === module) {
    startSimple().catch(error => {
        console.error('❌ Startup failed:', error);
        process.exit(1);
    });
}

module.exports = { startSimple };