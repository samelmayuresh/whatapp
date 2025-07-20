import { ActivityLogger } from '../services/ActivityLogger';
import { AlertingSystem } from './AlertingSystem';

export enum ErrorSeverity {
    LOW = 'low',
    MEDIUM = 'medium',
    HIGH = 'high',
    CRITICAL = 'critical'
}

export interface ErrorContext {
    component: string;
    operation: string;
    chatId?: string;
    contactName?: string;
    metadata?: Record<string, any>;
}

export class ErrorHandler {
    private static instance: ErrorHandler;
    private activityLogger?: ActivityLogger;
    private alertingSystem?: AlertingSystem;
    private errorCounts: Map<string, number> = new Map();
    private lastErrors: Map<string, Date> = new Map();
    private circuitBreakers: Map<string, { isOpen: boolean; lastFailure: Date; failureCount: number }> = new Map();
    private componentHealth: Map<string, { status: 'healthy' | 'degraded' | 'critical'; lastUpdate: Date }> = new Map();

    private constructor() {
        // Set up global error handlers
        this.setupGlobalErrorHandlers();
    }

    static getInstance(): ErrorHandler {
        if (!ErrorHandler.instance) {
            ErrorHandler.instance = new ErrorHandler();
        }
        return ErrorHandler.instance;
    }

    setActivityLogger(logger: ActivityLogger): void {
        this.activityLogger = logger;
    }

    setAlertingSystem(alertingSystem: AlertingSystem): void {
        this.alertingSystem = alertingSystem;
    }

    /**
     * Handle an error with context and severity
     */
    async handleError(
        error: Error,
        context: ErrorContext,
        severity: ErrorSeverity = ErrorSeverity.MEDIUM
    ): Promise<void> {
        const errorKey = `${context.component}:${context.operation}`;
        
        // Update error statistics
        this.updateErrorStats(errorKey);
        
        // Log the error
        await this.logError(error, context, severity);
        
        // Check if circuit breaker should be triggered
        this.checkCircuitBreaker(errorKey, error);
        
        // Handle critical errors
        if (severity === ErrorSeverity.CRITICAL) {
            await this.handleCriticalError(error, context);
        }

        // Send alert if alerting system is configured
        if (this.alertingSystem && severity >= ErrorSeverity.MEDIUM) {
            await this.alertingSystem.sendAlert(
                severity,
                `${context.component} Error`,
                error.message,
                context.component,
                context.operation,
                context.metadata
            );
        }

        // Update component health status
        this.updateComponentHealth(context.component, severity);
        
        console.error(`[${severity.toUpperCase()}] ${context.component}:${context.operation}:`, error.message);
        if (context.metadata) {
            console.error('Context:', context.metadata);
        }
    }

    /**
     * Handle recoverable errors with retry logic
     */
    async handleRecoverableError<T>(
        operation: () => Promise<T>,
        context: ErrorContext,
        maxRetries: number = 3,
        retryDelay: number = 1000
    ): Promise<T> {
        let lastError: Error;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error as Error;
                
                await this.handleError(lastError, {
                    ...context,
                    metadata: { ...context.metadata, attempt, maxRetries }
                }, attempt === maxRetries ? ErrorSeverity.HIGH : ErrorSeverity.LOW);
                
                if (attempt < maxRetries) {
                    await this.delay(retryDelay * attempt); // Exponential backoff
                }
            }
        }
        
        throw lastError!;
    }

    /**
     * Check if a circuit breaker should be opened
     */
    isCircuitBreakerOpen(component: string, operation: string): boolean {
        const key = `${component}:${operation}`;
        const breaker = this.circuitBreakers.get(key);
        
        if (!breaker) {
            return false;
        }
        
        if (breaker.isOpen) {
            // Check if enough time has passed to try again
            const timeSinceFailure = Date.now() - breaker.lastFailure.getTime();
            if (timeSinceFailure > 60000) { // 1 minute cooldown
                breaker.isOpen = false;
                breaker.failureCount = 0;
                return false;
            }
            return true;
        }
        
        return false;
    }

    /**
     * Reset circuit breaker for successful operations
     */
    resetCircuitBreaker(component: string, operation: string): void {
        const key = `${component}:${operation}`;
        const breaker = this.circuitBreakers.get(key);
        
        if (breaker) {
            breaker.failureCount = 0;
            breaker.isOpen = false;
        }
    }

    /**
     * Execute operation with graceful degradation
     */
    async executeWithGracefulDegradation<T>(
        primaryOperation: () => Promise<T>,
        fallbackOperation: () => Promise<T>,
        context: ErrorContext,
        maxRetries: number = 2
    ): Promise<T> {
        try {
            return await this.handleRecoverableError(primaryOperation, context, maxRetries);
        } catch (primaryError) {
            console.warn(`Primary operation failed, attempting fallback: ${context.component}:${context.operation}`);
            
            try {
                const result = await fallbackOperation();
                
                // Log successful degradation
                await this.handleError(
                    new Error(`Graceful degradation activated: ${(primaryError as Error).message}`),
                    { ...context, operation: `${context.operation}_degraded` },
                    ErrorSeverity.MEDIUM
                );
                
                return result;
            } catch (fallbackError) {
                // Both operations failed
                await this.handleError(fallbackError as Error, {
                    ...context,
                    operation: `${context.operation}_fallback_failed`,
                    metadata: {
                        ...context.metadata,
                        primaryError: (primaryError as Error).message,
                        fallbackError: (fallbackError as Error).message
                    }
                }, ErrorSeverity.HIGH);
                
                throw fallbackError;
            }
        }
    }

    /**
     * Check system health based on error patterns
     */
    getSystemHealthStatus(): {
        status: 'healthy' | 'degraded' | 'critical';
        issues: string[];
        recommendations: string[];
    } {
        const issues: string[] = [];
        const recommendations: string[] = [];
        
        // Check error rates
        const totalErrors = Array.from(this.errorCounts.values()).reduce((sum, count) => sum + count, 0);
        if (totalErrors > 50) {
            issues.push(`High error count: ${totalErrors} total errors`);
            recommendations.push('Review error logs and consider restarting affected components');
        }
        
        // Check circuit breakers
        const openBreakers = Array.from(this.circuitBreakers.entries())
            .filter(([_, breaker]) => breaker.isOpen);
        
        if (openBreakers.length > 0) {
            issues.push(`${openBreakers.length} circuit breakers are open`);
            recommendations.push('Check component health and consider manual intervention');
        }
        
        // Check for critical component failures
        const criticalComponents = ['WhatsAppClient', 'ReplyEngine', 'WebServer'];
        const criticalErrors = Array.from(this.errorCounts.entries())
            .filter(([key, count]) => {
                const component = key.split(':')[0];
                return criticalComponents.includes(component) && count > 5;
            });
        
        if (criticalErrors.length > 0) {
            issues.push('Critical components experiencing high error rates');
            recommendations.push('Consider restarting the application');
        }
        
        // Determine overall status
        let status: 'healthy' | 'degraded' | 'critical' = 'healthy';
        if (openBreakers.length > 2 || criticalErrors.length > 0) {
            status = 'critical';
        } else if (totalErrors > 20 || openBreakers.length > 0) {
            status = 'degraded';
        }
        
        return { status, issues, recommendations };
    }

    /**
     * Get error statistics
     */
    getErrorStats(): {
        totalErrors: number;
        errorsByComponent: Record<string, number>;
        circuitBreakers: Record<string, { isOpen: boolean; failureCount: number }>;
        systemHealth: {
            status: 'healthy' | 'degraded' | 'critical';
            issues: string[];
            recommendations: string[];
        };
    } {
        const totalErrors = Array.from(this.errorCounts.values()).reduce((sum, count) => sum + count, 0);
        
        const errorsByComponent: Record<string, number> = {};
        this.errorCounts.forEach((count, key) => {
            errorsByComponent[key] = count;
        });
        
        const circuitBreakers: Record<string, { isOpen: boolean; failureCount: number }> = {};
        this.circuitBreakers.forEach((breaker, key) => {
            circuitBreakers[key] = {
                isOpen: breaker.isOpen,
                failureCount: breaker.failureCount
            };
        });
        
        return {
            totalErrors,
            errorsByComponent,
            circuitBreakers,
            systemHealth: this.getSystemHealthStatus()
        };
    }

    private setupGlobalErrorHandlers(): void {
        // Handle unhandled promise rejections
        process.on('unhandledRejection', async (reason, promise) => {
            const error = reason instanceof Error ? reason : new Error(String(reason));
            await this.handleError(error, {
                component: 'process',
                operation: 'unhandledRejection',
                metadata: { promise: promise.toString() }
            }, ErrorSeverity.CRITICAL);
        });

        // Handle uncaught exceptions
        process.on('uncaughtException', async (error) => {
            await this.handleError(error, {
                component: 'process',
                operation: 'uncaughtException'
            }, ErrorSeverity.CRITICAL);
            
            // Give time for logging before exit
            setTimeout(() => {
                process.exit(1);
            }, 1000);
        });
    }

    private async logError(error: Error, context: ErrorContext, severity: ErrorSeverity): Promise<void> {
        if (this.activityLogger) {
            await this.activityLogger.logError(
                context.chatId || 'system',
                `[${severity}] ${context.component}:${context.operation} - ${error.message}`,
                {
                    stack: error.stack,
                    ...context.metadata
                }
            );
        }
    }

    private updateErrorStats(errorKey: string): void {
        const currentCount = this.errorCounts.get(errorKey) || 0;
        this.errorCounts.set(errorKey, currentCount + 1);
        this.lastErrors.set(errorKey, new Date());
    }

    private checkCircuitBreaker(errorKey: string, error: Error): void {
        let breaker = this.circuitBreakers.get(errorKey);
        
        if (!breaker) {
            breaker = { isOpen: false, lastFailure: new Date(), failureCount: 0 };
            this.circuitBreakers.set(errorKey, breaker);
        }
        
        breaker.failureCount++;
        breaker.lastFailure = new Date();
        
        // Open circuit breaker after 5 failures in a short time
        if (breaker.failureCount >= 5) {
            breaker.isOpen = true;
            console.warn(`Circuit breaker opened for ${errorKey} due to repeated failures`);
        }
    }

    private async handleCriticalError(error: Error, context: ErrorContext): Promise<void> {
        console.error('CRITICAL ERROR DETECTED:', error.message);
        console.error('Context:', context);
        console.error('Stack:', error.stack);
        
        // Implement additional critical error handling here:
        // - Send alerts (e.g., email, webhook)
        this.sendAlert(error, context);
        // - Trigger emergency shutdown (optional)
        // - Notify administrators (could be extended)
    }

    private async sendAlert(error: Error, context: ErrorContext): Promise<void> {
        // Enhanced alerting system
        console.warn('🚨 CRITICAL ERROR ALERT 🚨');
        console.warn(`Component: ${context.component}`);
        console.warn(`Operation: ${context.operation}`);
        console.warn(`Error: ${error.message}`);
        console.warn(`Time: ${new Date().toISOString()}`);
        
        if (context.chatId && context.chatId !== 'system') {
            console.warn(`Chat ID: ${context.chatId}`);
        }
        
        if (context.contactName) {
            console.warn(`Contact: ${context.contactName}`);
        }
        
        if (context.metadata) {
            console.warn('Additional Context:', JSON.stringify(context.metadata, null, 2));
        }
        
        // Stack trace for debugging
        if (error.stack) {
            console.warn('Stack Trace:', error.stack);
        }
        
        // TODO: Integrate with external alerting systems:
        // - Email notifications
        // - Slack/Discord webhooks
        // - SMS alerts
        // - Push notifications
        // - External monitoring services (PagerDuty, etc.)
        
        // Example webhook integration (commented out):
        /*
        try {
            await fetch('YOUR_WEBHOOK_URL', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: `🚨 Critical Error in WhatsApp Auto-Reply System`,
                    attachments: [{
                        color: 'danger',
                        fields: [
                            { title: 'Component', value: context.component, short: true },
                            { title: 'Operation', value: context.operation, short: true },
                            { title: 'Error', value: error.message, short: false },
                            { title: 'Time', value: new Date().toISOString(), short: true }
                        ]
                    }]
                })
            });
        } catch (webhookError) {
            console.error('Failed to send webhook alert:', webhookError);
        }
        */
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private updateComponentHealth(component: string, severity: ErrorSeverity): void {
        let status: 'healthy' | 'degraded' | 'critical' = 'healthy';
        
        if (severity === ErrorSeverity.CRITICAL) {
            status = 'critical';
        } else if (severity === ErrorSeverity.HIGH) {
            status = 'degraded';
        }
        
        const currentHealth = this.componentHealth.get(component);
        if (!currentHealth || currentHealth.status !== status) {
            this.componentHealth.set(component, {
                status,
                lastUpdate: new Date()
            });
            
            console.log(`Component health updated: ${component} -> ${status}`);
        }
    }

    /**
     * Get component health status
     */
    getComponentHealth(): Record<string, { status: 'healthy' | 'degraded' | 'critical'; lastUpdate: Date }> {
        const health: Record<string, { status: 'healthy' | 'degraded' | 'critical'; lastUpdate: Date }> = {};
        
        this.componentHealth.forEach((value, key) => {
            health[key] = { ...value };
        });
        
        return health;
    }

    /**
     * Reset component health to healthy
     */
    resetComponentHealth(component: string): void {
        this.componentHealth.set(component, {
            status: 'healthy',
            lastUpdate: new Date()
        });
        
        console.log(`Component health reset: ${component} -> healthy`);
    }

    /**
     * Reset all component health statuses
     */
    resetAllComponentHealth(): void {
        this.componentHealth.clear();
        console.log('All component health statuses reset');
    }

    /**
     * Get comprehensive error and health report
     */
    getComprehensiveReport(): {
        errorStats: ReturnType<ErrorHandler['getErrorStats']>;
        componentHealth: Record<string, { status: 'healthy' | 'degraded' | 'critical'; lastUpdate: Date }>;
        activeCircuitBreakers: string[];
        recommendations: string[];
        criticalIssues: string[];
    } {
        const errorStats = this.getErrorStats();
        const componentHealth = this.getComponentHealth();
        
        const activeCircuitBreakers = Object.entries(errorStats.circuitBreakers)
            .filter(([_, breaker]) => breaker.isOpen)
            .map(([key, _]) => key);
        
        const recommendations: string[] = [];
        const criticalIssues: string[] = [];
        
        // Analyze component health
        Object.entries(componentHealth).forEach(([component, health]) => {
            if (health.status === 'critical') {
                criticalIssues.push(`${component} is in critical state`);
                recommendations.push(`Immediate attention required for ${component}`);
            } else if (health.status === 'degraded') {
                recommendations.push(`Monitor ${component} - performance degraded`);
            }
        });
        
        // Analyze circuit breakers
        if (activeCircuitBreakers.length > 0) {
            criticalIssues.push(`${activeCircuitBreakers.length} circuit breakers are open`);
            recommendations.push('Review failed operations and consider manual intervention');
        }
        
        // Analyze error patterns
        if (errorStats.totalErrors > 100) {
            criticalIssues.push('High error count detected');
            recommendations.push('Review error logs and consider system restart');
        }
        
        return {
            errorStats,
            componentHealth,
            activeCircuitBreakers,
            recommendations,
            criticalIssues
        };
    }
}

// Export singleton instance
export const errorHandler = ErrorHandler.getInstance();