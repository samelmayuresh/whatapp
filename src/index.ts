import { WhatsAppAutoReplyApp } from './WhatsAppAutoReplyApp';
import { ConfigurationManager } from './services/ConfigurationManager';
import { ActivityLogger } from './services/ActivityLogger';

/**
 * Main application entry point
 */
async function main() {
    console.log('WhatsApp Auto-Reply System starting...');
    
    try {
        // Initialize configuration manager
        const configManager = new ConfigurationManager();
        await configManager.initialize();
        
        // Initialize activity logger
        const activityLogger = new ActivityLogger({
            logDirectory: './logs',
            maxLogFiles: 10,
            maxLogSizeBytes: 10485760, // 10 MB
            rotationIntervalHours: 24
        });
        // Removed call to private initialize()
        
        // Create and start the main application
        const app = new WhatsAppAutoReplyApp(configManager, activityLogger);
        await app.initialize();
        
        // Handle graceful shutdown
        process.on('SIGINT', async () => {
            console.log('\nReceived SIGINT, shutting down gracefully...');
            await app.shutdown();
            process.exit(0);
        });
        
        process.on('SIGTERM', async () => {
            console.log('\nReceived SIGTERM, shutting down gracefully...');
            await app.shutdown();
            process.exit(0);
        });
        
        console.log('WhatsApp Auto-Reply System started successfully');
        
    } catch (error) {
        console.error('Failed to start WhatsApp Auto-Reply System:', error);
        process.exit(1);
    }
}

// Start the application
main().catch((error) => {
    console.error('Unhandled error in main:', error);
    process.exit(1);
});
