import { EventEmitter } from 'events';
import { ActivityLogger } from '../services/ActivityLogger';
import { ErrorSeverity } from './ErrorHandler';

export interface AlertChannel {
    name: string;
    type: 'console' | 'webhook' | 'email' | 'file';
    enabled: boolean;
    config: Record<string, any>;
}

export interface Alert {
    id: string;
    severity: ErrorSeverity;
    title: string;
    message: string;
    component: string;
    operation: string;
    timestamp: Date;
    metadata?: Record<string, any>;
    resolved?: boolean;
    resolvedAt?: Date;
}

export interface AlertingConfig {
    channels: AlertChannel[];
    rules: AlertRule[];
    cooldownMinutes: number;
    maxAlertsPerHour: number;
}

export interface AlertRule {
    name: string;
    condition: string; // e.g., 'error_count > 10' or 'component == "WhatsAppClient"'
    severity: ErrorSeverity;
    enabled: boolean;
    cooldownMinutes: number;
}

export class AlertingSystem extends EventEmitter {
    private config: AlertingConfig;
    private activityLogger?: ActivityLogger;
    private activeAlerts: Map<string, Alert> = new Map();
    private alertCooldowns: Map<string, Date> = new Map();
    private alertCounts: Map<string, number> = new Map();
    private lastAlertReset: Date = new Date();

    constructor(config: AlertingConfig) {
        super();
        this.config = config;
        this.setupPeriodicCleanup();
    }

    setActivityLogger(logger: ActivityLogger): void {
        this.activityLogger = logger;
    }

    /**
     * Send an alert through configured channels
     */
    async sendAlert(
        severity: ErrorSeverity,
        title: string,
        message: string,
        component: string,
        operation: string,
        metadata?: Record<string, any>
    ): Promise<void> {
        const alertId = this.generateAlertId(component, operation, title);
        
        // Check cooldown
        if (this.isInCooldown(alertId)) {
            console.log(`Alert ${alertId} is in cooldown, skipping`);
            return;
        }

        // Check rate limits
        if (this.isRateLimited()) {
            console.warn('Alert rate limit exceeded, skipping alert');
            return;
        }

        const alert: Alert = {
            id: alertId,
            severity,
            title,
            message,
            component,
            operation,
            timestamp: new Date(),
            metadata
        };

        // Store active alert
        this.activeAlerts.set(alertId, alert);
        
        // Update cooldown and rate limiting
        this.setCooldown(alertId);
        this.incrementAlertCount();

        // Send through all enabled channels
        await this.sendThroughChannels(alert);

        // Log the alert
        if (this.activityLogger) {
            await this.activityLogger.logSystemEvent('alert_sent', {
                alertId,
                severity,
                title,
                component,
                operation
            });
        }

        // Emit event
        this.emit('alert-sent', alert);
    }

    /**
     * Resolve an active alert
     */
    async resolveAlert(alertId: string, resolution?: string): Promise<void> {
        const alert = this.activeAlerts.get(alertId);
        if (!alert) {
            return;
        }

        alert.resolved = true;
        alert.resolvedAt = new Date();

        if (this.activityLogger) {
            await this.activityLogger.logSystemEvent('alert_resolved', {
                alertId,
                resolution,
                duration: alert.resolvedAt.getTime() - alert.timestamp.getTime()
            });
        }

        this.emit('alert-resolved', alert);
    }

    /**
     * Get active alerts
     */
    getActiveAlerts(): Alert[] {
        return Array.from(this.activeAlerts.values()).filter(alert => !alert.resolved);
    }

    /**
     * Get alert statistics
     */
    getAlertStats(): {
        activeAlerts: number;
        totalAlertsToday: number;
        alertsByComponent: Record<string, number>;
        alertsBySeverity: Record<string, number>;
    } {
        const activeAlerts = this.getActiveAlerts().length;
        const allAlerts = Array.from(this.activeAlerts.values());
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const todayAlerts = allAlerts.filter(alert => alert.timestamp >= today);
        
        const alertsByComponent: Record<string, number> = {};
        const alertsBySeverity: Record<string, number> = {};
        
        todayAlerts.forEach(alert => {
            alertsByComponent[alert.component] = (alertsByComponent[alert.component] || 0) + 1;
            alertsBySeverity[alert.severity] = (alertsBySeverity[alert.severity] || 0) + 1;
        });

        return {
            activeAlerts,
            totalAlertsToday: todayAlerts.length,
            alertsByComponent,
            alertsBySeverity
        };
    }

    /**
     * Update alerting configuration
     */
    updateConfig(config: Partial<AlertingConfig>): void {
        this.config = { ...this.config, ...config };
        console.log('Alerting configuration updated');
    }

    /**
     * Test alert channels
     */
    async testAlerts(): Promise<{ channel: string; success: boolean; error?: string }[]> {
        const results: { channel: string; success: boolean; error?: string }[] = [];
        
        for (const channel of this.config.channels.filter(c => c.enabled)) {
            try {
                await this.sendTestAlert(channel);
                results.push({ channel: channel.name, success: true });
            } catch (error) {
                results.push({ 
                    channel: channel.name, 
                    success: false, 
                    error: (error as Error).message 
                });
            }
        }
        
        return results;
    }

    private async sendThroughChannels(alert: Alert): Promise<void> {
        const enabledChannels = this.config.channels.filter(c => c.enabled);
        
        await Promise.allSettled(
            enabledChannels.map(channel => this.sendToChannel(channel, alert))
        );
    }

    private async sendToChannel(channel: AlertChannel, alert: Alert): Promise<void> {
        try {
            switch (channel.type) {
                case 'console':
                    await this.sendConsoleAlert(alert);
                    break;
                case 'webhook':
                    await this.sendWebhookAlert(channel, alert);
                    break;
                case 'email':
                    await this.sendEmailAlert(channel, alert);
                    break;
                case 'file':
                    await this.sendFileAlert(channel, alert);
                    break;
                default:
                    console.warn(`Unknown alert channel type: ${channel.type}`);
            }
        } catch (error) {
            console.error(`Failed to send alert through ${channel.name}:`, error);
        }
    }

    private async sendConsoleAlert(alert: Alert): Promise<void> {
        const emoji = this.getSeverityEmoji(alert.severity);
        const timestamp = alert.timestamp.toISOString();
        
        console.log(`\n${emoji} ALERT [${alert.severity.toUpperCase()}] ${emoji}`);
        console.log(`Time: ${timestamp}`);
        console.log(`Component: ${alert.component}`);
        console.log(`Operation: ${alert.operation}`);
        console.log(`Title: ${alert.title}`);
        console.log(`Message: ${alert.message}`);
        
        if (alert.metadata) {
            console.log(`Metadata:`, JSON.stringify(alert.metadata, null, 2));
        }
        
        console.log(`Alert ID: ${alert.id}`);
        console.log('─'.repeat(60));
    }

    private async sendWebhookAlert(channel: AlertChannel, alert: Alert): Promise<void> {
        const { url, method = 'POST', headers = {} } = channel.config;
        
        if (!url) {
            throw new Error('Webhook URL not configured');
        }

        const payload = {
            alert_id: alert.id,
            severity: alert.severity,
            title: alert.title,
            message: alert.message,
            component: alert.component,
            operation: alert.operation,
            timestamp: alert.timestamp.toISOString(),
            metadata: alert.metadata
        };

        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                ...headers
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`Webhook request failed: ${response.status} ${response.statusText}`);
        }
    }

    private async sendEmailAlert(channel: AlertChannel, alert: Alert): Promise<void> {
        // Email implementation would go here
        // This is a placeholder for future email integration
        console.log(`Email alert would be sent to ${channel.config.recipients}: ${alert.title}`);
    }

    private async sendFileAlert(channel: AlertChannel, alert: Alert): Promise<void> {
        const { filePath } = channel.config;
        
        if (!filePath) {
            throw new Error('File path not configured for file alert channel');
        }

        const alertLine = `${alert.timestamp.toISOString()} [${alert.severity.toUpperCase()}] ${alert.component}:${alert.operation} - ${alert.title}: ${alert.message}\n`;
        
        const fs = await import('fs-extra');
        await fs.appendFile(filePath, alertLine);
    }

    private async sendTestAlert(channel: AlertChannel): Promise<void> {
        const testAlert: Alert = {
            id: 'test-alert',
            severity: ErrorSeverity.LOW,
            title: 'Test Alert',
            message: 'This is a test alert to verify channel configuration',
            component: 'AlertingSystem',
            operation: 'test',
            timestamp: new Date()
        };

        await this.sendToChannel(channel, testAlert);
    }

    private generateAlertId(component: string, operation: string, title: string): string {
        const hash = Buffer.from(`${component}:${operation}:${title}`).toString('base64').slice(0, 8);
        return `alert-${hash}`;
    }

    private isInCooldown(alertId: string): boolean {
        const cooldownEnd = this.alertCooldowns.get(alertId);
        if (!cooldownEnd) {
            return false;
        }
        
        return new Date() < cooldownEnd;
    }

    private setCooldown(alertId: string): void {
        const cooldownMinutes = this.config.cooldownMinutes || 15;
        const cooldownEnd = new Date(Date.now() + cooldownMinutes * 60 * 1000);
        this.alertCooldowns.set(alertId, cooldownEnd);
    }

    private isRateLimited(): boolean {
        const now = new Date();
        const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
        
        // Reset hourly counter if needed
        if (this.lastAlertReset < hourAgo) {
            this.alertCounts.clear();
            this.lastAlertReset = now;
        }
        
        const currentHourKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}`;
        const currentCount = this.alertCounts.get(currentHourKey) || 0;
        
        return currentCount >= this.config.maxAlertsPerHour;
    }

    private incrementAlertCount(): void {
        const now = new Date();
        const currentHourKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}`;
        const currentCount = this.alertCounts.get(currentHourKey) || 0;
        this.alertCounts.set(currentHourKey, currentCount + 1);
    }

    private getSeverityEmoji(severity: ErrorSeverity): string {
        switch (severity) {
            case ErrorSeverity.CRITICAL:
                return '🚨';
            case ErrorSeverity.HIGH:
                return '⚠️';
            case ErrorSeverity.MEDIUM:
                return '⚡';
            case ErrorSeverity.LOW:
                return 'ℹ️';
            default:
                return '📢';
        }
    }

    private setupPeriodicCleanup(): void {
        // Clean up old alerts and cooldowns every hour
        setInterval(() => {
            this.cleanupOldData();
        }, 60 * 60 * 1000);
    }

    private cleanupOldData(): void {
        const now = new Date();
        const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        
        // Remove old alerts
        for (const [id, alert] of this.activeAlerts.entries()) {
            if (alert.timestamp < dayAgo && alert.resolved) {
                this.activeAlerts.delete(id);
            }
        }
        
        // Remove expired cooldowns
        for (const [id, cooldownEnd] of this.alertCooldowns.entries()) {
            if (now > cooldownEnd) {
                this.alertCooldowns.delete(id);
            }
        }
        
        console.log('Cleaned up old alert data');
    }
}