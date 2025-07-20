#!/usr/bin/env node

const { WhatsAppAutoReplyApp } = require('../dist/WhatsAppAutoReplyApp');
const { ConfigurationManager } = require('../dist/services/ConfigurationManager');
const { ActivityLogger } = require('../dist/services/ActivityLogger');

/**
 * Focused WhatsApp connection startup script
 */
async function startWhatsApp() {
    console.log('🚀 Starting WhatsApp Auto-Reply System...');
    console.log('=====================================');
    console.log('');
    
    let app;
    
    try {
        console.log('📋 Step 1: Initializing Configuration Manager...');
        const configManager = new ConfigurationManager();
        await configManager.initialize();
        console.log('✅ Configuration Manager initialized');
        console.log('');
        
        console.log('📋 Step 2: Initializing Activity Logger...');
        const activityLogger = new ActivityLogger({
            logDirectory: './logs',
            maxLogFiles: 10,
            maxLogSizeBytes: 10485760, // 10 MB
            rotationIntervalHours: 24
        });
        console.log('✅ Activity Logger initialized');
        console.log('');
        
        console.log('📋 Step 3: Creating Main Application...');
        app = new WhatsAppAutoReplyApp(configManager, activityLogger);
        console.log('✅ Main Application created');
        console.log('');
        
        console.log('📋 Step 4: Starting Web Server...');
        console.log('⏳ This will start the web interface first...');
        
        // Initialize the application
        await app.initialize();
        
        console.log('');
        console.log('🎉 APPLICATION STARTED SUCCESSFULLY!');
        console.log('=====================================');
        console.log('');
        console.log('🌐 Web Interface: http://localhost:3000');
        console.log('📱 WhatsApp Setup Instructions:');
        console.log('   1. Open http://localhost:3000 in your browser');
        console.log('   2. You should see a QR code on the page');
        console.log('   3. Open WhatsApp on your phone');
        console.log('   4. Go to Settings > Linked Devices');
        console.log('   5. Tap "Link a Device"');
        console.log('   6. Scan the QR code displayed in your browser');
        console.log('');
        console.log('📊 Monitoring:');
        console.log('   Health Check: http://localhost:3000/api/health');
        console.log('   System Status: http://localhost:3000/api/status');
        console.log('');
        console.log('⏹️  To stop: Press Ctrl+C');
        console.log('');
        
    } catch (error) {
        console.error('❌ Failed to start application:', error.message);
        console.error('');
        console.error('🔍 Troubleshooting:');
        console.error('   1. Make sure port 3000 is not in use');
        console.error('   2. Check if all dependencies are installed: npm install');
        console.error('   3. Verify build is successful: npm run build');
        console.error('   4. Check configuration: config/default.json');
        console.error('');
        process.exit(1);
    }
    
    // Handle graceful shutdown
    const shutdown = async (signal) => {
        console.log(`\n⏹️  Received ${signal}, shutting down gracefully...`);
        try {
            if (app) {
                await app.shutdown();
            }
            console.log('✅ Shutdown complete');
            process.exit(0);
        } catch (error) {
            console.error('❌ Error during shutdown:', error.message);
            process.exit(1);
        }
    };
    
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    
    // Keep the process alive
    process.on('uncaughtException', (error) => {
        console.error('❌ Uncaught Exception:', error);
        shutdown('uncaughtException');
    });
    
    process.on('unhandledRejection', (reason, promise) => {
        console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
        shutdown('unhandledRejection');
    });
}

// Start the application
startWhatsApp();