import { WhatsAppClient } from './services/WhatsAppClient';
import { MessageProcessor } from './services/MessageProcessor';
import { ReplyEngine } from './services/ReplyEngine';
import { ConfigurationManager } from './services/ConfigurationManager';
import { ActivityLogger } from './services/ActivityLogger';
import { RateLimiter } from './services/RateLimiter';
import { WebServer } from './web/WebServer';
import { configWatcher } from './utils/ConfigWatcher';
import { errorHandler, ErrorSeverity } from './utils/ErrorHandler';
import { HealthMonitor } from './utils/HealthMonitor';
import { ConnectionMonitor } from './utils/ConnectionMonitor';
import { AlertingSystem, AlertingConfig } from './utils/AlertingSystem';
import { MonitoringDashboard, MonitoringConfig } from './utils/MonitoringDashboard';
import { Message } from './models/Message';

export class WhatsAppAutoReplyApp {
    private whatsappClient: WhatsAppClient;
    private messageProcessor: MessageProcessor;
    private replyEngine: ReplyEngine;
    private rateLimiter: RateLimiter;
    private webServer: WebServer;
    private healthMonitor: HealthMonitor;
    private connectionMonitor: ConnectionMonitor;
    private alertingSystem: AlertingSystem;
    private monitoringDashboard: MonitoringDashboard;
    private isRunning: boolean = false;
    private isShuttingDown: boolean = false;

    constructor(
        private configManager: ConfigurationManager,
        private activityLogger: ActivityLogger
    ) {
        // Initialize error handler
        errorHandler.setActivityLogger(this.activityLogger);

        // Initialize components
        this.whatsappClient = new WhatsAppClient();
        
        // Get system settings for rate limiter configuration
        const systemSettings = this.configManager.getSystemSettings();
        this.rateLimiter = new RateLimiter({
            rateLimitSeconds: 3, // 3 second rate limit
            maxRepliesPerPeriod: 1
        });
        
        this.messageProcessor = new MessageProcessor({
            systemSettings: this.configManager.getSystemSettings(),
            messageTemplates: this.configManager.getMessageTemplates(),
            isBlacklisted: (contactId: string) => this.configManager.isBlacklisted(contactId),
            getContactName: (contactId: string) => 'Unknown' // Will be updated by ReplyEngine
        });
        
        this.replyEngine = new ReplyEngine({
            whatsappClient: this.whatsappClient,
            configurationManager: this.configManager,
            activityLogger: this.activityLogger,
            rateLimiter: this.rateLimiter,
            messageProcessor: this.messageProcessor
        });
        
        // Initialize health monitor (webServer will be set later)
        this.healthMonitor = new HealthMonitor(
            this.whatsappClient,
            this.replyEngine,
            null as any, // WebServer will be set after creation
            this.configManager,
            this.activityLogger
        );
        
        // Get web server configuration with defaults
        const webConfig = this.configManager.getWebServerConfig();
        const webServerOptions = {
            port: webConfig.port || 3000,
            host: webConfig.host || 'localhost',
            publicPath: 'public' // Fixed path for static files
        };
        
        this.webServer = new WebServer(
            webServerOptions,
            this.configManager,
            this.activityLogger,
            this.replyEngine,
            this.whatsappClient,
            this.healthMonitor
        );
        
        // Update health monitor with webServer reference
        (this.healthMonitor as any).webServer = this.webServer;
        
        // Set main app reference in web server for monitoring access
        this.webServer.setMainApp(this);
        
        this.connectionMonitor = new ConnectionMonitor(this.whatsappClient);

        // Initialize alerting system
        const alertingConfig: AlertingConfig = {
            channels: [
                {
                    name: 'console',
                    type: 'console',
                    enabled: true,
                    config: {}
                },
                {
                    name: 'file',
                    type: 'file',
                    enabled: true,
                    config: {
                        filePath: 'logs/alerts.log'
                    }
                }
            ],
            rules: [],
            cooldownMinutes: 15,
            maxAlertsPerHour: 20
        };
        
        this.alertingSystem = new AlertingSystem(alertingConfig);
        this.alertingSystem.setActivityLogger(this.activityLogger);
        
        // Initialize monitoring dashboard
        const monitoringConfig: MonitoringConfig = {
            updateIntervalMs: 30000, // 30 seconds
            retainHistoryHours: 24,
            alertThresholds: {
                errorRate: 10, // errors per hour
                memoryUsageMB: 500,
                responseTimeMs: 5000
            }
        };
        
        this.monitoringDashboard = new MonitoringDashboard(
            this.healthMonitor,
            this.connectionMonitor,
            errorHandler,
            this.alertingSystem,
            this.activityLogger,
            monitoringConfig
        );

        // Connect error handler to alerting system
        errorHandler.setAlertingSystem(this.alertingSystem);

        // Set up monitoring event handlers
        this.setupMonitoringEventHandlers();
    }

    /**
     * Initialize the application
     */
    async initialize(): Promise<void> {
        try {
            console.log('Initializing WhatsApp Auto-Reply System...');

            // Initialize configuration watcher
            this.setupConfigurationWatcher();

            // Initialize web server first (always works)
            await this.initializeWebServer();

            // Initialize WhatsApp client (may fail in cloud environments)
            try {
                await this.initializeWhatsAppClient();
            } catch (error: unknown) {
                console.warn('WhatsApp client initialization failed, continuing in web-only mode:', error);
                this.activityLogger.logError('system', `WhatsApp initialization failed: ${error instanceof Error ? error.message : String(error)}`);
                // Continue without WhatsApp - web dashboard will still work
            }

            // Set up message handling
            this.setupMessageHandling();

            // Start monitoring systems
            this.healthMonitor.startMonitoring();
            this.connectionMonitor.startMonitoring();
            this.monitoringDashboard.start();

            // Note: Reply engine will be started automatically when WhatsApp is ready
            // This is handled in the WhatsApp 'ready' event handler

            this.isRunning = true;
            console.log('WhatsApp Auto-Reply System initialized successfully');

            // Log successful initialization
            await this.activityLogger.logSystemEvent('system_initialized', {
                messageContent: 'WhatsApp Auto-Reply System initialized successfully'
            });

        } catch (error) {
            await errorHandler.handleError(error as Error, {
                component: 'WhatsAppAutoReplyApp',
                operation: 'initialize'
            }, ErrorSeverity.CRITICAL);
            throw error;
        }
    }

    /**
     * Shutdown the application gracefully
     */
    async shutdown(): Promise<void> {
        if (this.isShuttingDown) {
            return;
        }

        this.isShuttingDown = true;
        console.log('Shutting down WhatsApp Auto-Reply System...');

        try {
            // Stop monitoring systems
            this.healthMonitor.stopMonitoring();
            this.connectionMonitor.stopMonitoring();
            this.monitoringDashboard.stop();

            // Stop reply engine
            if (this.replyEngine) {
                await this.replyEngine.stop();
            }

            // Disconnect WhatsApp client
            if (this.whatsappClient) {
                await this.whatsappClient.destroy();
            }

            // Stop web server
            if (this.webServer) {
                await this.webServer.stop();
            }

            // Stop configuration watcher
            configWatcher.unwatchAll();

            // Final activity log
            await this.activityLogger.logSystemEvent('system_shutdown', {
                messageContent: 'WhatsApp Auto-Reply System shutdown'
            });

            this.isRunning = false;
            console.log('WhatsApp Auto-Reply System shutdown complete');

        } catch (error) {
            await errorHandler.handleError(error as Error, {
                component: 'WhatsAppAutoReplyApp',
                operation: 'shutdown'
            });
        }
    }

    /**
     * Start the reply engine
     */
    async startReplyEngine(): Promise<void> {
        if (!this.isRunning) {
            throw new Error('Application not initialized');
        }

        try {
            await this.replyEngine.start();
            
            await this.activityLogger.logSystemEvent('auto_reply_engine_started', {
                messageContent: 'Auto-reply engine started'
            });

            console.log('Reply engine started');
        } catch (error) {
            console.error('Failed to start reply engine:', error);
            throw error;
        }
    }

    /**
     * Stop the reply engine
     */
    async stopReplyEngine(): Promise<void> {
        try {
            await this.replyEngine.stop();
            
            await this.activityLogger.logSystemEvent('auto_reply_engine_stopped', {
                messageContent: 'Auto-reply engine stopped'
            });

            console.log('Reply engine stopped');
        } catch (error) {
            console.error('Failed to stop reply engine:', error);
            throw error;
        }
    }

    /**
     * Get application status
     */
    getStatus(): {
        whatsapp: string;
        engine: string;
        webServer: string;
        uptime: number;
    } {
        return {
            whatsapp: this.whatsappClient.isReady() ? 'Connected' : 'Disconnected',
            engine: this.replyEngine.isEngineActive() ? 'Running' : 'Stopped',
            webServer: this.webServer.isServerRunning() ? 'Running' : 'Stopped',
            uptime: process.uptime()
        };
    }

    /**
     * Get application statistics
     */
    async getStatistics(): Promise<{
        messagesReceived: number;
        repliesSent: number;
        rateLimits: number;
        uptime: number;
    }> {
        const logs = await this.activityLogger.getRecentEntries(1000);
        
        const messagesReceived = logs.filter(log => log.type === 'message_received').length;
        const repliesSent = logs.filter(log => log.type === 'reply_sent').length;
        const rateLimits = logs.filter(log => log.type === 'rate_limit_hit').length;

        return {
            messagesReceived,
            repliesSent,
            rateLimits,
            uptime: process.uptime()
        };
    }

    private async initializeWhatsAppClient(): Promise<void> {
        console.log('Initializing WhatsApp client...');
        
        // Set up event handlers
        this.whatsappClient.on('qr', (qr) => {
            console.log('QR Code received, scan with WhatsApp');
            this.webServer.broadcastQRCode(qr);
        });

        this.whatsappClient.on('ready', async () => {
            console.log('WhatsApp client ready');
            this.activityLogger.logSystemEvent('whatsapp_client_connected', {
                messageContent: 'WhatsApp client connected'
            });
            this.webServer.broadcastStatus(this.getStatus());
            
            // Start the reply engine if enabled
            const settings = this.configManager.getSystemSettings();
            if (settings.enabled) {
                try {
                    await this.startReplyEngine();
                    console.log('Auto-reply system is now active!');
                } catch (error) {
                    console.error('Failed to start reply engine:', error);
                }
            }
        });

        this.whatsappClient.on('disconnected', () => {
            console.log('WhatsApp client disconnected');
            this.activityLogger.logSystemEvent('whatsapp_client_disconnected', {
                messageContent: 'WhatsApp client disconnected'
            });
            this.webServer.broadcastStatus(this.getStatus());
        });

        this.whatsappClient.on('auth_failure', () => {
            console.log('WhatsApp authentication failed');
            this.activityLogger.logError('system', 'WhatsApp authentication failed');
        });

        this.whatsappClient.on('error', (error) => {
            console.error('WhatsApp client error:', error);
            this.activityLogger.logError('system', `WhatsApp client error: ${error.message}`);
        });

        // Initialize the client with retry logic
        let retryCount = 0;
        const maxRetries = 3;
        
        while (retryCount < maxRetries) {
            try {
                console.log(`WhatsApp initialization attempt ${retryCount + 1}/${maxRetries}`);
                await this.whatsappClient.initialize();
                console.log('WhatsApp client initialized successfully');
                return;
            } catch (error: unknown) {
                retryCount++;
                console.error(`WhatsApp initialization attempt ${retryCount} failed:`, error);
                
                if (retryCount >= maxRetries) {
                    console.error('All WhatsApp initialization attempts failed. Starting in web-only mode.');
                    this.activityLogger.logError('system', `WhatsApp initialization failed after ${maxRetries} attempts: ${error instanceof Error ? error.message : String(error)}`);
                    // Don't throw - continue with web server only
                    return;
                }
                
                // Wait before retry
                await new Promise(resolve => setTimeout(resolve, 5000 * retryCount));
            }
        }
    }

    private async initializeWebServer(): Promise<void> {
        console.log('Initializing web server...');
        
        await this.webServer.start();
        
        const webConfig = this.configManager.getWebServerConfig();
        console.log(`Web server started on http://${webConfig.host || 'localhost'}:${webConfig.port || 3000}`);
    }

    private setupMessageHandling(): void {
        this.whatsappClient.on('message', async (message: Message) => {
            try {
                // Log incoming message
                await this.activityLogger.logMessageReceived(message.chatId, message.contactName || 'Unknown', message.body);

                // Broadcast activity to web clients
                this.webServer.broadcastActivity({
                    type: 'message_received',
                    chatId: message.chatId,
                    contactName: message.contactName,
                    messageContent: message.body,
                    timestamp: new Date()
                });

                // Update statistics
                const stats = await this.getStatistics();
                this.webServer.broadcastStatistics(stats);

            } catch (error) {
                console.error('Error handling incoming message:', error);
                await this.activityLogger.logError(message.chatId, `Failed to handle incoming message: ${error}`);
            }
        });
    }

    private setupConfigurationWatcher(): void {
        // Watch configuration file for changes
        configWatcher.watchFile('config/settings.json');
        
        configWatcher.on('config-changed', async (filePath) => {
            console.log(`Configuration file changed: ${filePath}`);
            
            try {
                // Reload configuration
                await this.configManager.loadConfiguration();
                
                // Broadcast updated settings to web clients
                const settings = this.configManager.getSystemSettings();
                this.webServer.broadcastSettings({ system: settings });
                
                await this.activityLogger.logSystemEvent('configuration_reloaded', {
                    messageContent: 'Configuration reloaded'
                });
                
            } catch (error) {
                console.error('Failed to reload configuration:', error);
                await this.activityLogger.logError('system', `Failed to reload configuration: ${error}`);
            }
        });

        configWatcher.on('config-error', async (error) => {
            console.error('Configuration watcher error:', error);
                await this.activityLogger.logError('system', `Configuration watcher error: ${error}`);
        });
    }

    /**
     * Set up monitoring event handlers
     */
    private setupMonitoringEventHandlers(): void {
        // Connection monitor events
        this.connectionMonitor.on('connected', (status) => {
            console.log('Connection restored:', status);
            this.webServer.broadcastStatus(this.getStatus());
        });

        this.connectionMonitor.on('disconnected', (status) => {
            console.log('Connection lost:', status);
            this.webServer.broadcastStatus(this.getStatus());
        });

        this.connectionMonitor.on('max-reconnect-attempts-reached', async (status) => {
            console.error('Max reconnection attempts reached');
            await errorHandler.handleError(
                new Error('Max reconnection attempts reached'),
                {
                    component: 'ConnectionMonitor',
                    operation: 'reconnect',
                    metadata: { attempts: status.reconnectAttempts }
                },
                ErrorSeverity.CRITICAL
            );
        });

        // Health monitor events
        this.healthMonitor.on('health-status-changed', (event) => {
            console.log(`Health status changed: ${event.check} ${event.previousStatus} -> ${event.newStatus}`);
            this.webServer.broadcastStatus(this.getStatus());
        });

        this.healthMonitor.on('health-check-complete', (health) => {
            // Broadcast health status if there are issues
            if (health.overall !== 'healthy') {
                this.webServer.broadcastActivity({
                    type: 'system_health',
                    status: health.overall,
                    checks: health.checks,
                    timestamp: health.timestamp
                });
            }
        });

        // Reply engine error handling
        this.replyEngine.on('error', async (error, context) => {
            await errorHandler.handleError(error, {
                component: 'ReplyEngine',
                operation: 'processMessage',
                metadata: context
            });
        });

        // Alerting system events
        this.alertingSystem.on('alert-sent', (alert) => {
            console.log(`Alert sent: ${alert.title} [${alert.severity}]`);
            this.webServer.broadcastActivity({
                type: 'alert',
                severity: alert.severity,
                title: alert.title,
                message: alert.message,
                component: alert.component,
                timestamp: alert.timestamp
            });
        });

        this.alertingSystem.on('alert-resolved', (alert) => {
            console.log(`Alert resolved: ${alert.title}`);
            this.webServer.broadcastActivity({
                type: 'alert_resolved',
                alertId: alert.id,
                title: alert.title,
                timestamp: new Date()
            });
        });

        // Monitoring dashboard events
        this.monitoringDashboard.on('dashboard-started', () => {
            console.log('Monitoring dashboard started');
        });

        this.monitoringDashboard.on('metrics-updated', (metrics) => {
            // Broadcast key metrics to web clients
            this.webServer.broadcastActivity({
                type: 'metrics_update',
                systemHealth: metrics.systemHealth.overall,
                connectionStatus: metrics.connectionStatus.isConnected ? 'connected' : 'disconnected',
                errorCount: metrics.errorReport.errorStats.totalErrors,
                activeAlerts: metrics.alertStats.activeAlerts,
                timestamp: metrics.timestamp
            });
        });

        this.monitoringDashboard.on('alert-triggered', (alert) => {
            console.log(`Dashboard alert triggered: ${alert.title}`);
        });
    }

    /**
     * Health check for the application
     */
    async healthCheck(): Promise<{
        status: 'healthy' | 'unhealthy';
        checks: Record<string, boolean>;
        timestamp: Date;
    }> {
        const checks = {
            whatsappConnected: this.whatsappClient.isReady(),
            webServerRunning: this.webServer.isServerRunning(),
            configurationLoaded: !!this.configManager.getSystemSettings(),
            activityLoggerReady: true // ActivityLogger doesn't have a specific ready state
        };

        const allHealthy = Object.values(checks).every(check => check);

        return {
            status: allHealthy ? 'healthy' : 'unhealthy',
            checks,
            timestamp: new Date()
        };
    }

    /**
     * Get comprehensive monitoring report
     */
    async getMonitoringReport(): Promise<ReturnType<typeof this.monitoringDashboard.generateReport>> {
        return await this.monitoringDashboard.generateReport();
    }

    /**
     * Get current system status summary
     */
    async getSystemStatusSummary(): Promise<ReturnType<typeof this.monitoringDashboard.getStatusSummary>> {
        return await this.monitoringDashboard.getStatusSummary();
    }

    /**
     * Get active alerts
     */
    getActiveAlerts(): ReturnType<typeof this.alertingSystem.getActiveAlerts> {
        return this.alertingSystem.getActiveAlerts();
    }

    /**
     * Get alert statistics
     */
    getAlertStats(): ReturnType<typeof this.alertingSystem.getAlertStats> {
        return this.alertingSystem.getAlertStats();
    }

    /**
     * Test alert channels
     */
    async testAlerts(): Promise<ReturnType<typeof this.alertingSystem.testAlerts>> {
        return await this.alertingSystem.testAlerts();
    }

    /**
     * Export monitoring data
     */
    async exportMonitoringData(hours: number = 24): Promise<ReturnType<typeof this.monitoringDashboard.exportData>> {
        return await this.monitoringDashboard.exportData(hours);
    }

    /**
     * Force a health check
     */
    async forceHealthCheck(): Promise<void> {
        // Trigger immediate health check by restarting monitoring
        this.healthMonitor.stopMonitoring();
        this.healthMonitor.startMonitoring();
    }

    /**
     * Force reconnection attempt
     */
    async forceReconnect(): Promise<void> {
        await this.connectionMonitor.forceReconnect();
    }

    /**
     * Get error handler statistics
     */
    getErrorStats(): ReturnType<typeof errorHandler.getErrorStats> {
        return errorHandler.getErrorStats();
    }

    /**
     * Get comprehensive error report
     */
    getComprehensiveErrorReport(): ReturnType<typeof errorHandler.getComprehensiveReport> {
        return errorHandler.getComprehensiveReport();
    }

    /**
     * Get current monitoring dashboard metrics
     */
    async getCurrentMetrics(): Promise<ReturnType<typeof this.monitoringDashboard.getCurrentMetrics>> {
        return await this.monitoringDashboard.getCurrentMetrics();
    }

    /**
     * Resolve an alert
     */
    async resolveAlert(alertId: string, resolution?: string): Promise<void> {
        await this.alertingSystem.resolveAlert(alertId, resolution);
    }

    /**
     * Get error handler instance
     */
    getErrorHandler(): typeof errorHandler {
        return errorHandler;
    }
}
