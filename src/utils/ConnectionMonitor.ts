import { EventEmitter } from 'events';
import { WhatsAppClient } from '../services/WhatsAppClient';
import { errorHandler, ErrorSeverity } from './ErrorHandler';

export interface ConnectionStatus {
    isConnected: boolean;
    lastConnected?: Date;
    lastDisconnected?: Date;
    reconnectAttempts: number;
    nextReconnectAt?: Date;
}

export class ConnectionMonitor extends EventEmitter {
    private status: ConnectionStatus = {
        isConnected: false,
        reconnectAttempts: 0
    };
    
    private reconnectTimer?: NodeJS.Timeout;
    private healthCheckTimer?: NodeJS.Timeout;
    private maxReconnectAttempts: number = 10;
    private baseReconnectDelay: number = 5000; // 5 seconds
    private maxReconnectDelay: number = 300000; // 5 minutes
    private healthCheckInterval: number = 30000; // 30 seconds
    private isMonitoring: boolean = false;

    constructor(private whatsappClient: WhatsAppClient) {
        super();
        this.setupEventHandlers();
    }

    /**
     * Start connection monitoring
     */
    startMonitoring(): void {
        if (this.isMonitoring) {
            return;
        }

        this.isMonitoring = true;
        console.log('Starting connection monitoring...');

        // Start periodic health checks
        this.healthCheckTimer = setInterval(() => {
            this.performHealthCheck();
        }, this.healthCheckInterval);

        // Initial health check
        this.performHealthCheck();
    }

    /**
     * Stop connection monitoring
     */
    stopMonitoring(): void {
        this.isMonitoring = false;
        
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
            this.healthCheckTimer = undefined;
        }

        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = undefined;
        }

        console.log('Connection monitoring stopped');
    }

    /**
     * Get current connection status
     */
    getStatus(): ConnectionStatus {
        return { ...this.status };
    }

    /**
     * Force a reconnection attempt
     */
    async forceReconnect(): Promise<void> {
        console.log('Forcing reconnection...');
        
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = undefined;
        }

        await this.attemptReconnection();
    }

    /**
     * Reset reconnection attempts counter
     */
    resetReconnectAttempts(): void {
        this.status.reconnectAttempts = 0;
        this.status.nextReconnectAt = undefined;
    }

    private setupEventHandlers(): void {
        this.whatsappClient.on('ready', () => {
            this.handleConnectionEstablished();
        });

        this.whatsappClient.on('disconnected', () => {
            this.handleConnectionLost();
        });

        this.whatsappClient.on('auth_failure', () => {
            this.handleAuthFailure();
        });
    }

    private handleConnectionEstablished(): void {
        console.log('WhatsApp connection established');
        
        this.status.isConnected = true;
        this.status.lastConnected = new Date();
        this.status.reconnectAttempts = 0;
        this.status.nextReconnectAt = undefined;

        // Clear any pending reconnection timer
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = undefined;
        }

        this.emit('connected', this.status);
    }

    private handleConnectionLost(): void {
        console.log('WhatsApp connection lost');
        
        this.status.isConnected = false;
        this.status.lastDisconnected = new Date();

        this.emit('disconnected', this.status);

        // Start reconnection process if monitoring is active
        if (this.isMonitoring) {
            this.scheduleReconnection();
        }
    }

    private async handleAuthFailure(): Promise<void> {
        console.error('WhatsApp authentication failed');
        
        await errorHandler.handleError(
            new Error('WhatsApp authentication failed'),
            {
                component: 'ConnectionMonitor',
                operation: 'authentication'
            },
            ErrorSeverity.HIGH
        );

        this.status.isConnected = false;
        this.emit('auth-failure', this.status);

        // Don't auto-reconnect on auth failure - requires manual intervention
    }

    private async performHealthCheck(): Promise<void> {
        try {
            const isReady = this.whatsappClient.isReady();
            
            if (this.status.isConnected && !isReady) {
                // Connection was lost but we didn't get the event
                console.warn('Health check detected connection loss');
                this.handleConnectionLost();
            } else if (!this.status.isConnected && isReady) {
                // Connection was restored but we didn't get the event
                console.log('Health check detected connection restoration');
                this.handleConnectionEstablished();
            }

        } catch (error) {
            await errorHandler.handleError(error as Error, {
                component: 'ConnectionMonitor',
                operation: 'healthCheck'
            });
        }
    }

    private scheduleReconnection(): void {
        if (this.status.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error(`Maximum reconnection attempts (${this.maxReconnectAttempts}) reached`);
            this.emit('max-reconnect-attempts-reached', this.status);
            return;
        }

        const delay = this.calculateReconnectDelay();
        this.status.nextReconnectAt = new Date(Date.now() + delay);

        console.log(`Scheduling reconnection attempt ${this.status.reconnectAttempts + 1} in ${delay}ms`);

        this.reconnectTimer = setTimeout(async () => {
            await this.attemptReconnection();
        }, delay);
    }

    private async attemptReconnection(): Promise<void> {
        this.status.reconnectAttempts++;
        
        console.log(`Attempting reconnection (attempt ${this.status.reconnectAttempts}/${this.maxReconnectAttempts})`);

        try {
            // Check if circuit breaker is open
            if (errorHandler.isCircuitBreakerOpen('ConnectionMonitor', 'reconnect')) {
                console.warn('Circuit breaker is open, skipping reconnection attempt');
                this.scheduleReconnection();
                return;
            }

            // Use graceful degradation for reconnection
            await errorHandler.executeWithGracefulDegradation(
                // Primary operation: full reconnection
                async () => {
                    // Attempt to disconnect first (cleanup)
                    try {
                        await this.whatsappClient.destroy();
                    } catch (error) {
                        // Ignore disconnect errors during reconnection
                    }

                    // Wait a moment before reconnecting
                    await this.delay(1000);

                    // Attempt to reconnect
                    await this.whatsappClient.initialize();
                    return true;
                },
                // Fallback operation: minimal reconnection
                async () => {
                    console.log('Attempting minimal reconnection...');
                    await this.delay(2000);
                    await this.whatsappClient.initialize();
                    return true;
                },
                {
                    component: 'ConnectionMonitor',
                    operation: 'reconnect',
                    metadata: { attempt: this.status.reconnectAttempts }
                }
            );

            // Reset circuit breaker on successful connection attempt
            errorHandler.resetCircuitBreaker('ConnectionMonitor', 'reconnect');

            console.log('Reconnection attempt initiated');

        } catch (error) {
            console.error(`Reconnection attempt ${this.status.reconnectAttempts} failed:`, (error as Error).message);

            await errorHandler.handleError(error as Error, {
                component: 'ConnectionMonitor',
                operation: 'reconnect',
                metadata: { attempt: this.status.reconnectAttempts }
            });

            // Schedule next attempt if we haven't reached the limit
            if (this.status.reconnectAttempts < this.maxReconnectAttempts) {
                this.scheduleReconnection();
            } else {
                this.emit('max-reconnect-attempts-reached', this.status);
            }
        }
    }

    private calculateReconnectDelay(): number {
        // Exponential backoff with jitter
        const exponentialDelay = Math.min(
            this.baseReconnectDelay * Math.pow(2, this.status.reconnectAttempts),
            this.maxReconnectDelay
        );

        // Add jitter (±25%)
        const jitter = exponentialDelay * 0.25 * (Math.random() - 0.5);
        
        return Math.max(1000, exponentialDelay + jitter);
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Update monitoring configuration
     */
    updateConfig(config: {
        maxReconnectAttempts?: number;
        baseReconnectDelay?: number;
        maxReconnectDelay?: number;
        healthCheckInterval?: number;
    }): void {
        if (config.maxReconnectAttempts !== undefined) {
            this.maxReconnectAttempts = config.maxReconnectAttempts;
        }
        if (config.baseReconnectDelay !== undefined) {
            this.baseReconnectDelay = config.baseReconnectDelay;
        }
        if (config.maxReconnectDelay !== undefined) {
            this.maxReconnectDelay = config.maxReconnectDelay;
        }
        if (config.healthCheckInterval !== undefined) {
            this.healthCheckInterval = config.healthCheckInterval;
            
            // Restart health check timer with new interval
            if (this.healthCheckTimer) {
                clearInterval(this.healthCheckTimer);
                this.healthCheckTimer = setInterval(() => {
                    this.performHealthCheck();
                }, this.healthCheckInterval);
            }
        }
    }
}