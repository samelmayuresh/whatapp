import { EventEmitter } from 'events';
import { WhatsAppClient } from '../services/WhatsAppClient';
import { ReplyEngine } from '../services/ReplyEngine';
import { WebServer } from '../web/WebServer';
import { ConfigurationManager } from '../services/ConfigurationManager';
import { ActivityLogger } from '../services/ActivityLogger';
import { errorHandler } from './ErrorHandler';

export interface HealthCheck {
    name: string;
    status: 'healthy' | 'unhealthy' | 'degraded';
    message?: string;
    lastCheck: Date;
    responseTime?: number;
}

export interface SystemHealth {
    overall: 'healthy' | 'unhealthy' | 'degraded';
    checks: HealthCheck[];
    uptime: number;
    timestamp: Date;
}

export class HealthMonitor extends EventEmitter {
    private checks: Map<string, HealthCheck> = new Map();
    private monitoringInterval?: NodeJS.Timeout;
    private isMonitoring: boolean = false;
    
    constructor(
        private whatsappClient: WhatsAppClient,
        private replyEngine: ReplyEngine,
        private webServer: WebServer,
        private configManager: ConfigurationManager,
        private activityLogger: ActivityLogger
    ) {
        super();
    }

    /**
     * Start health monitoring
     */
    startMonitoring(intervalMs: number = 30000): void {
        if (this.isMonitoring) {
            return;
        }

        this.isMonitoring = true;
        console.log('Starting health monitoring...');

        // Initial health check
        this.performHealthChecks();

        // Set up periodic monitoring
        this.monitoringInterval = setInterval(() => {
            this.performHealthChecks();
        }, intervalMs);
    }

    /**
     * Stop health monitoring
     */
    stopMonitoring(): void {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = undefined;
        }
        this.isMonitoring = false;
        console.log('Health monitoring stopped');
    }

    /**
     * Get current system health
     */
    getSystemHealth(): SystemHealth {
        const checks = Array.from(this.checks.values());
        const overall = this.calculateOverallHealth(checks);

        return {
            overall,
            checks,
            uptime: process.uptime(),
            timestamp: new Date()
        };
    }

    /**
     * Add custom health check
     */
    addHealthCheck(name: string, checkFunction: () => Promise<{ status: 'healthy' | 'unhealthy' | 'degraded'; message?: string }>): void {
        // Store the check function for later use
        (this as any)[`check_${name}`] = checkFunction;
    }

    /**
     * Perform all health checks
     */
    private async performHealthChecks(): Promise<void> {
        const startTime = Date.now();

        try {
            // Core component checks
            await Promise.all([
                this.checkWhatsAppConnection(),
                this.checkReplyEngine(),
                this.checkWebServer(),
                this.checkConfiguration(),
                this.checkActivityLogger(),
                this.checkMemoryUsage(),
                this.checkErrorRates()
            ]);

            const totalTime = Date.now() - startTime;
            console.log(`Health checks completed in ${totalTime}ms`);

            // Emit health status
            this.emit('health-check-complete', this.getSystemHealth());

        } catch (error) {
            await errorHandler.handleError(error as Error, {
                component: 'HealthMonitor',
                operation: 'performHealthChecks'
            });
        }
    }

    private async checkWhatsAppConnection(): Promise<void> {
        const startTime = Date.now();
        
        try {
            const isReady = this.whatsappClient.isReady();
            const responseTime = Date.now() - startTime;

            this.updateCheck('whatsapp_connection', {
                name: 'WhatsApp Connection',
                status: isReady ? 'healthy' : 'unhealthy',
                message: isReady ? 'Connected and ready' : 'Not connected',
                lastCheck: new Date(),
                responseTime
            });

        } catch (error) {
            this.updateCheck('whatsapp_connection', {
                name: 'WhatsApp Connection',
                status: 'unhealthy',
                message: `Error checking connection: ${(error as Error).message}`,
                lastCheck: new Date(),
                responseTime: Date.now() - startTime
            });
        }
    }

    private async checkReplyEngine(): Promise<void> {
        const startTime = Date.now();
        
        try {
            const isRunning = this.replyEngine.isEngineActive();
            const responseTime = Date.now() - startTime;

            this.updateCheck('reply_engine', {
                name: 'Reply Engine',
                status: isRunning ? 'healthy' : 'degraded',
                message: isRunning ? 'Running normally' : 'Not running',
                lastCheck: new Date(),
                responseTime
            });

        } catch (error) {
            this.updateCheck('reply_engine', {
                name: 'Reply Engine',
                status: 'unhealthy',
                message: `Error checking engine: ${(error as Error).message}`,
                lastCheck: new Date(),
                responseTime: Date.now() - startTime
            });
        }
    }

    private async checkWebServer(): Promise<void> {
        const startTime = Date.now();
        
        try {
            const isRunning = this.webServer.isServerRunning();
            const responseTime = Date.now() - startTime;

            this.updateCheck('web_server', {
                name: 'Web Server',
                status: isRunning ? 'healthy' : 'unhealthy',
                message: isRunning ? 'Server running' : 'Server not running',
                lastCheck: new Date(),
                responseTime
            });

        } catch (error) {
            this.updateCheck('web_server', {
                name: 'Web Server',
                status: 'unhealthy',
                message: `Error checking server: ${(error as Error).message}`,
                lastCheck: new Date(),
                responseTime: Date.now() - startTime
            });
        }
    }

    private async checkConfiguration(): Promise<void> {
        const startTime = Date.now();
        
        try {
            const settings = this.configManager.getSystemSettings();
            const templates = this.configManager.getMessageTemplates();
            const responseTime = Date.now() - startTime;

            const hasValidConfig = settings && templates && templates.length > 0;

            this.updateCheck('configuration', {
                name: 'Configuration',
                status: hasValidConfig ? 'healthy' : 'degraded',
                message: hasValidConfig ? 'Configuration loaded' : 'Configuration issues detected',
                lastCheck: new Date(),
                responseTime
            });

        } catch (error) {
            this.updateCheck('configuration', {
                name: 'Configuration',
                status: 'unhealthy',
                message: `Configuration error: ${(error as Error).message}`,
                lastCheck: new Date(),
                responseTime: Date.now() - startTime
            });
        }
    }

    private async checkActivityLogger(): Promise<void> {
        const startTime = Date.now();
        
        try {
            // Try to get recent activity to test logger
            await this.activityLogger.getRecentEntries(1);
            const responseTime = Date.now() - startTime;

            this.updateCheck('activity_logger', {
                name: 'Activity Logger',
                status: 'healthy',
                message: 'Logger operational',
                lastCheck: new Date(),
                responseTime
            });

        } catch (error) {
            this.updateCheck('activity_logger', {
                name: 'Activity Logger',
                status: 'unhealthy',
                message: `Logger error: ${(error as Error).message}`,
                lastCheck: new Date(),
                responseTime: Date.now() - startTime
            });
        }
    }

    private async checkMemoryUsage(): Promise<void> {
        const startTime = Date.now();
        
        try {
            const memUsage = process.memoryUsage();
            const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
            const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
            const responseTime = Date.now() - startTime;

            let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
            let message = `Heap: ${heapUsedMB}MB / ${heapTotalMB}MB`;

            if (heapUsedMB > 500) {
                status = 'degraded';
                message += ' (High memory usage)';
            } else if (heapUsedMB > 1000) {
                status = 'unhealthy';
                message += ' (Critical memory usage)';
            }

            this.updateCheck('memory_usage', {
                name: 'Memory Usage',
                status,
                message,
                lastCheck: new Date(),
                responseTime
            });

        } catch (error) {
            this.updateCheck('memory_usage', {
                name: 'Memory Usage',
                status: 'unhealthy',
                message: `Memory check error: ${(error as Error).message}`,
                lastCheck: new Date(),
                responseTime: Date.now() - startTime
            });
        }
    }

    private async checkErrorRates(): Promise<void> {
        const startTime = Date.now();
        
        try {
            const errorStats = errorHandler.getErrorStats();
            const responseTime = Date.now() - startTime;

            let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
            let message = `Total errors: ${errorStats.totalErrors}`;

            // Check for circuit breakers
            const openBreakers = Object.entries(errorStats.circuitBreakers)
                .filter(([_, breaker]) => breaker.isOpen);

            if (openBreakers.length > 0) {
                status = 'degraded';
                message += ` (${openBreakers.length} circuit breakers open)`;
            }

            if (errorStats.totalErrors > 100) {
                status = 'degraded';
                message += ' (High error count)';
            }

            this.updateCheck('error_rates', {
                name: 'Error Rates',
                status,
                message,
                lastCheck: new Date(),
                responseTime
            });

        } catch (error) {
            this.updateCheck('error_rates', {
                name: 'Error Rates',
                status: 'unhealthy',
                message: `Error rate check failed: ${(error as Error).message}`,
                lastCheck: new Date(),
                responseTime: Date.now() - startTime
            });
        }
    }

    private updateCheck(key: string, check: HealthCheck): void {
        const previousCheck = this.checks.get(key);
        this.checks.set(key, check);

        // Emit status change events
        if (previousCheck && previousCheck.status !== check.status) {
            this.emit('health-status-changed', {
                check: key,
                previousStatus: previousCheck.status,
                newStatus: check.status,
                message: check.message
            });

            console.log(`Health status changed: ${key} ${previousCheck.status} -> ${check.status}`);
        }
    }

    private calculateOverallHealth(checks: HealthCheck[]): 'healthy' | 'unhealthy' | 'degraded' {
        if (checks.length === 0) {
            return 'unhealthy';
        }

        const unhealthyCount = checks.filter(c => c.status === 'unhealthy').length;
        const degradedCount = checks.filter(c => c.status === 'degraded').length;
        const totalChecks = checks.length;

        // Critical if more than 50% of checks are unhealthy
        if (unhealthyCount > totalChecks * 0.5) {
            return 'unhealthy';
        }
        // Degraded if any checks are unhealthy or more than 25% are degraded
        else if (unhealthyCount > 0 || degradedCount > totalChecks * 0.25) {
            return 'degraded';
        }
        else {
            return 'healthy';
        }
    }

    /**
     * Get detailed health report with recommendations
     */
    getDetailedHealthReport(): {
        systemHealth: SystemHealth;
        errorStats: ReturnType<typeof errorHandler.getErrorStats>;
        recommendations: string[];
        criticalIssues: string[];
    } {
        const systemHealth = this.getSystemHealth();
        const errorStats = errorHandler.getErrorStats();
        const recommendations: string[] = [];
        const criticalIssues: string[] = [];

        // Analyze health checks
        systemHealth.checks.forEach(check => {
            if (check.status === 'unhealthy') {
                criticalIssues.push(`${check.name} is unhealthy: ${check.message}`);
                
                // Specific recommendations based on component
                switch (check.name) {
                    case 'WhatsApp Connection':
                        recommendations.push('Check internet connection and WhatsApp Web status');
                        recommendations.push('Consider restarting the WhatsApp client');
                        break;
                    case 'Web Server':
                        recommendations.push('Check if port is available and restart web server');
                        break;
                    case 'Configuration':
                        recommendations.push('Verify configuration files are valid and accessible');
                        break;
                    case 'Memory Usage':
                        recommendations.push('Consider restarting the application to free memory');
                        break;
                }
            } else if (check.status === 'degraded') {
                recommendations.push(`Monitor ${check.name}: ${check.message}`);
            }
        });

        // Add error-based recommendations
        if (errorStats.systemHealth.status !== 'healthy') {
            recommendations.push(...errorStats.systemHealth.recommendations);
            criticalIssues.push(...errorStats.systemHealth.issues);
        }

        return {
            systemHealth,
            errorStats,
            recommendations,
            criticalIssues
        };
    }
}