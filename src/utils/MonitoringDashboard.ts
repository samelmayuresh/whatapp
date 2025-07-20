import { EventEmitter } from 'events';
import { HealthMonitor, SystemHealth } from './HealthMonitor';
import { ConnectionMonitor, ConnectionStatus } from './ConnectionMonitor';
import { ErrorHandler } from './ErrorHandler';
import { AlertingSystem } from './AlertingSystem';
import { ActivityLogger } from '../services/ActivityLogger';

export interface DashboardMetrics {
    systemHealth: SystemHealth;
    connectionStatus: ConnectionStatus;
    errorReport: ReturnType<typeof ErrorHandler.prototype.getComprehensiveReport>;
    alertStats: ReturnType<typeof AlertingSystem.prototype.getAlertStats>;
    activityStats: Awaited<ReturnType<typeof ActivityLogger.prototype.getStatistics>>;
    uptime: number;
    memoryUsage: NodeJS.MemoryUsage;
    timestamp: Date;
}

export interface MonitoringConfig {
    updateIntervalMs: number;
    retainHistoryHours: number;
    alertThresholds: {
        errorRate: number;
        memoryUsageMB: number;
        responseTimeMs: number;
    };
}

export class MonitoringDashboard extends EventEmitter {
    private healthMonitor: HealthMonitor;
    private connectionMonitor: ConnectionMonitor;
    private errorHandler: ErrorHandler;
    private alertingSystem: AlertingSystem;
    private activityLogger: ActivityLogger;
    private config: MonitoringConfig;
    
    private updateTimer?: NodeJS.Timeout;
    private metricsHistory: DashboardMetrics[] = [];
    private isRunning: boolean = false;
    private startTime: Date = new Date();

    constructor(
        healthMonitor: HealthMonitor,
        connectionMonitor: ConnectionMonitor,
        errorHandler: ErrorHandler,
        alertingSystem: AlertingSystem,
        activityLogger: ActivityLogger,
        config: MonitoringConfig
    ) {
        super();
        
        this.healthMonitor = healthMonitor;
        this.connectionMonitor = connectionMonitor;
        this.errorHandler = errorHandler;
        this.alertingSystem = alertingSystem;
        this.activityLogger = activityLogger;
        this.config = config;
        
        this.setupEventHandlers();
    }

    /**
     * Start the monitoring dashboard
     */
    start(): void {
        if (this.isRunning) {
            return;
        }

        this.isRunning = true;
        this.startTime = new Date();
        
        console.log('Starting monitoring dashboard...');
        
        // Start component monitors
        this.healthMonitor.startMonitoring();
        this.connectionMonitor.startMonitoring();
        
        // Start periodic updates
        this.updateTimer = setInterval(() => {
            this.updateMetrics();
        }, this.config.updateIntervalMs);
        
        // Initial metrics update
        this.updateMetrics();
        
        this.emit('dashboard-started');
    }

    /**
     * Stop the monitoring dashboard
     */
    stop(): void {
        if (!this.isRunning) {
            return;
        }

        this.isRunning = false;
        
        console.log('Stopping monitoring dashboard...');
        
        // Stop component monitors
        this.healthMonitor.stopMonitoring();
        this.connectionMonitor.stopMonitoring();
        
        // Stop periodic updates
        if (this.updateTimer) {
            clearInterval(this.updateTimer);
            this.updateTimer = undefined;
        }
        
        this.emit('dashboard-stopped');
    }

    /**
     * Get current dashboard metrics
     */
    async getCurrentMetrics(): Promise<DashboardMetrics> {
        const systemHealth = this.healthMonitor.getSystemHealth();
        const connectionStatus = this.connectionMonitor.getStatus();
        const errorReport = this.errorHandler.getComprehensiveReport();
        const alertStats = this.alertingSystem.getAlertStats();
        const activityStats = await this.activityLogger.getStatistics(24);
        const memoryUsage = process.memoryUsage();
        const uptime = Date.now() - this.startTime.getTime();

        return {
            systemHealth,
            connectionStatus,
            errorReport,
            alertStats,
            activityStats,
            uptime,
            memoryUsage,
            timestamp: new Date()
        };
    }

    /**
     * Get metrics history
     */
    getMetricsHistory(hours: number = 24): DashboardMetrics[] {
        const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
        return this.metricsHistory.filter(metrics => metrics.timestamp >= cutoff);
    }

    /**
     * Get system status summary
     */
    async getStatusSummary(): Promise<{
        overall: 'healthy' | 'degraded' | 'critical';
        issues: string[];
        recommendations: string[];
        keyMetrics: {
            uptime: string;
            memoryUsage: string;
            errorRate: number;
            activeAlerts: number;
            connectionStatus: string;
        };
    }> {
        const metrics = await this.getCurrentMetrics();
        
        // Determine overall status
        let overall: 'healthy' | 'degraded' | 'critical' = 'healthy';
        const issues: string[] = [];
        const recommendations: string[] = [];
        
        // Check system health
        if (metrics.systemHealth.overall === 'unhealthy') {
            overall = 'critical';
            issues.push('System health is critical');
        } else if (metrics.systemHealth.overall === 'degraded') {
            if (overall === 'healthy') overall = 'degraded';
            issues.push('System health is degraded');
        }
        
        // Check connection status
        if (!metrics.connectionStatus.isConnected) {
            overall = 'critical';
            issues.push('WhatsApp connection is down');
            recommendations.push('Check internet connection and restart WhatsApp client');
        }
        
        // Check error rates
        const errorRate = this.calculateErrorRate(metrics);
        if (errorRate > this.config.alertThresholds.errorRate) {
            if (overall === 'healthy') overall = 'degraded';
            issues.push(`High error rate: ${errorRate.toFixed(2)} errors/hour`);
            recommendations.push('Review error logs and investigate root causes');
        }
        
        // Check memory usage
        const memoryUsageMB = Math.round(metrics.memoryUsage.heapUsed / 1024 / 1024);
        if (memoryUsageMB > this.config.alertThresholds.memoryUsageMB) {
            if (overall === 'healthy') overall = 'degraded';
            issues.push(`High memory usage: ${memoryUsageMB}MB`);
            recommendations.push('Consider restarting the application');
        }
        
        // Check active alerts
        if (metrics.alertStats.activeAlerts > 0) {
            if (overall === 'healthy') overall = 'degraded';
            issues.push(`${metrics.alertStats.activeAlerts} active alerts`);
            recommendations.push('Review and resolve active alerts');
        }
        
        // Add error report issues and recommendations
        issues.push(...metrics.errorReport.criticalIssues);
        recommendations.push(...metrics.errorReport.recommendations);
        
        return {
            overall,
            issues,
            recommendations,
            keyMetrics: {
                uptime: this.formatUptime(metrics.uptime),
                memoryUsage: `${memoryUsageMB}MB`,
                errorRate: parseFloat(errorRate.toFixed(2)),
                activeAlerts: metrics.alertStats.activeAlerts,
                connectionStatus: metrics.connectionStatus.isConnected ? 'Connected' : 'Disconnected'
            }
        };
    }

    /**
     * Generate comprehensive monitoring report
     */
    async generateReport(): Promise<{
        summary: Awaited<ReturnType<MonitoringDashboard['getStatusSummary']>>;
        detailedMetrics: DashboardMetrics;
        trends: {
            errorTrend: 'increasing' | 'decreasing' | 'stable';
            memoryTrend: 'increasing' | 'decreasing' | 'stable';
            performanceTrend: 'improving' | 'degrading' | 'stable';
        };
        healthChecks: Array<{
            name: string;
            status: 'healthy' | 'unhealthy' | 'degraded';
            message?: string;
            responseTime?: number;
        }>;
    }> {
        const summary = await this.getStatusSummary();
        const detailedMetrics = await this.getCurrentMetrics();
        const trends = this.calculateTrends();
        
        const healthChecks = detailedMetrics.systemHealth.checks.map(check => ({
            name: check.name,
            status: check.status,
            message: check.message,
            responseTime: check.responseTime
        }));
        
        return {
            summary,
            detailedMetrics,
            trends,
            healthChecks
        };
    }

    /**
     * Export monitoring data for analysis
     */
    async exportData(hours: number = 24): Promise<{
        metrics: DashboardMetrics[];
        summary: Awaited<ReturnType<MonitoringDashboard['getStatusSummary']>>;
        exportTime: Date;
    }> {
        const metrics = this.getMetricsHistory(hours);
        const summary = await this.getStatusSummary();
        
        return {
            metrics,
            summary,
            exportTime: new Date()
        };
    }

    private setupEventHandlers(): void {
        // Listen for health status changes
        this.healthMonitor.on('health-status-changed', (event) => {
            this.emit('health-change', event);
            this.checkForAlerts();
        });
        
        // Listen for connection changes
        this.connectionMonitor.on('connected', (status) => {
            this.emit('connection-restored', status);
        });
        
        this.connectionMonitor.on('disconnected', (status) => {
            this.emit('connection-lost', status);
        });
        
        // Listen for alerts
        this.alertingSystem.on('alert-sent', (alert) => {
            this.emit('alert-triggered', alert);
        });
    }

    private async updateMetrics(): Promise<void> {
        try {
            const metrics = await this.getCurrentMetrics();
            
            // Add to history
            this.metricsHistory.push(metrics);
            
            // Trim history to configured retention period
            const cutoff = new Date(Date.now() - this.config.retainHistoryHours * 60 * 60 * 1000);
            this.metricsHistory = this.metricsHistory.filter(m => m.timestamp >= cutoff);
            
            // Emit metrics update
            this.emit('metrics-updated', metrics);
            
            // Check for threshold violations
            await this.checkThresholds(metrics);
            
        } catch (error) {
            console.error('Failed to update dashboard metrics:', error);
            
            await this.errorHandler.handleError(error as Error, {
                component: 'MonitoringDashboard',
                operation: 'updateMetrics'
            });
        }
    }

    private async checkThresholds(metrics: DashboardMetrics): Promise<void> {
        // Check error rate threshold
        const errorRate = this.calculateErrorRate(metrics);
        if (errorRate > this.config.alertThresholds.errorRate) {
            await this.alertingSystem.sendAlert(
                'HIGH' as any,
                'High Error Rate Detected',
                `Error rate is ${errorRate.toFixed(2)} errors/hour, exceeding threshold of ${this.config.alertThresholds.errorRate}`,
                'MonitoringDashboard',
                'errorRateCheck',
                { errorRate, threshold: this.config.alertThresholds.errorRate }
            );
        }
        
        // Check memory usage threshold
        const memoryUsageMB = Math.round(metrics.memoryUsage.heapUsed / 1024 / 1024);
        if (memoryUsageMB > this.config.alertThresholds.memoryUsageMB) {
            await this.alertingSystem.sendAlert(
                'MEDIUM' as any,
                'High Memory Usage',
                `Memory usage is ${memoryUsageMB}MB, exceeding threshold of ${this.config.alertThresholds.memoryUsageMB}MB`,
                'MonitoringDashboard',
                'memoryCheck',
                { memoryUsageMB, threshold: this.config.alertThresholds.memoryUsageMB }
            );
        }
    }

    private async checkForAlerts(): Promise<void> {
        const summary = await this.getStatusSummary();
        
        if (summary.overall === 'critical') {
            await this.alertingSystem.sendAlert(
                'CRITICAL' as any,
                'System Status Critical',
                'System health has degraded to critical status',
                'MonitoringDashboard',
                'healthCheck',
                { issues: summary.issues }
            );
        }
    }

    private calculateErrorRate(metrics: DashboardMetrics): number {
        const recentHistory = this.getMetricsHistory(1); // Last hour
        if (recentHistory.length < 2) {
            return 0;
        }
        
        const oldest = recentHistory[0];
        const newest = recentHistory[recentHistory.length - 1];
        
        const errorDiff = newest.errorReport.errorStats.totalErrors - oldest.errorReport.errorStats.totalErrors;
        const timeDiffHours = (newest.timestamp.getTime() - oldest.timestamp.getTime()) / (1000 * 60 * 60);
        
        return timeDiffHours > 0 ? errorDiff / timeDiffHours : 0;
    }

    private calculateTrends(): {
        errorTrend: 'increasing' | 'decreasing' | 'stable';
        memoryTrend: 'increasing' | 'decreasing' | 'stable';
        performanceTrend: 'improving' | 'degrading' | 'stable';
    } {
        const history = this.getMetricsHistory(6); // Last 6 hours
        
        if (history.length < 3) {
            return {
                errorTrend: 'stable',
                memoryTrend: 'stable',
                performanceTrend: 'stable'
            };
        }
        
        // Calculate trends based on recent history
        const recent = history.slice(-3);
        const older = history.slice(0, 3);
        
        const recentAvgErrors = recent.reduce((sum, m) => sum + m.errorReport.errorStats.totalErrors, 0) / recent.length;
        const olderAvgErrors = older.reduce((sum, m) => sum + m.errorReport.errorStats.totalErrors, 0) / older.length;
        
        const recentAvgMemory = recent.reduce((sum, m) => sum + m.memoryUsage.heapUsed, 0) / recent.length;
        const olderAvgMemory = older.reduce((sum, m) => sum + m.memoryUsage.heapUsed, 0) / older.length;
        
        const recentHealthyChecks = recent.reduce((sum, m) => 
            sum + m.systemHealth.checks.filter(c => c.status === 'healthy').length, 0) / recent.length;
        const olderHealthyChecks = older.reduce((sum, m) => 
            sum + m.systemHealth.checks.filter(c => c.status === 'healthy').length, 0) / older.length;
        
        return {
            errorTrend: recentAvgErrors > olderAvgErrors * 1.1 ? 'increasing' : 
                       recentAvgErrors < olderAvgErrors * 0.9 ? 'decreasing' : 'stable',
            memoryTrend: recentAvgMemory > olderAvgMemory * 1.1 ? 'increasing' : 
                        recentAvgMemory < olderAvgMemory * 0.9 ? 'decreasing' : 'stable',
            performanceTrend: recentHealthyChecks > olderHealthyChecks * 1.1 ? 'improving' : 
                             recentHealthyChecks < olderHealthyChecks * 0.9 ? 'degrading' : 'stable'
        };
    }

    private formatUptime(uptimeMs: number): string {
        const seconds = Math.floor(uptimeMs / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        if (days > 0) {
            return `${days}d ${hours % 24}h ${minutes % 60}m`;
        } else if (hours > 0) {
            return `${hours}h ${minutes % 60}m`;
        } else {
            return `${minutes}m ${seconds % 60}s`;
        }
    }
}