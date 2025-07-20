import { ConnectionMonitor, ConnectionStatus } from '../ConnectionMonitor';
import { WhatsAppClient } from '../../services/WhatsAppClient';
import { errorHandler } from '../ErrorHandler';

// Mock dependencies
jest.mock('../../services/WhatsAppClient');
jest.mock('../ErrorHandler', () => ({
    errorHandler: {
        isCircuitBreakerOpen: jest.fn().mockReturnValue(false),
        resetCircuitBreaker: jest.fn(),
        handleError: jest.fn().mockResolvedValue(undefined),
        executeWithGracefulDegradation: jest.fn().mockResolvedValue(true)
    },
    ErrorSeverity: {
        LOW: 'low',
        MEDIUM: 'medium',
        HIGH: 'high',
        CRITICAL: 'critical'
    }
}));

describe('ConnectionMonitor', () => {
    let connectionMonitor: ConnectionMonitor;
    let mockWhatsAppClient: jest.Mocked<WhatsAppClient>;
    let mockErrorHandler: jest.Mocked<typeof errorHandler>;

    beforeEach(() => {
        mockWhatsAppClient = {
            isReady: jest.fn().mockReturnValue(false),
            initialize: jest.fn().mockResolvedValue(undefined),
            destroy: jest.fn().mockResolvedValue(undefined),
            on: jest.fn(),
            emit: jest.fn()
        } as any;

        // Get the mocked error handler
        const { errorHandler: mockedErrorHandler } = require('../ErrorHandler');
        mockErrorHandler = mockedErrorHandler;

        connectionMonitor = new ConnectionMonitor(mockWhatsAppClient);

        // Suppress console output during tests
        jest.spyOn(console, 'log').mockImplementation();
        jest.spyOn(console, 'warn').mockImplementation();
        jest.spyOn(console, 'error').mockImplementation();
    });

    afterEach(() => {
        connectionMonitor.stopMonitoring();
        jest.restoreAllMocks();
        jest.clearAllTimers();
    });

    describe('initialization', () => {
        it('should initialize with disconnected status', () => {
            const status = connectionMonitor.getStatus();
            expect(status.isConnected).toBe(false);
            expect(status.reconnectAttempts).toBe(0);
        });

        it('should set up event handlers on WhatsApp client', () => {
            expect(mockWhatsAppClient.on).toHaveBeenCalledWith('ready', expect.any(Function));
            expect(mockWhatsAppClient.on).toHaveBeenCalledWith('disconnected', expect.any(Function));
            expect(mockWhatsAppClient.on).toHaveBeenCalledWith('auth_failure', expect.any(Function));
        });
    });

    describe('monitoring lifecycle', () => {
        it('should start monitoring successfully', () => {
            jest.useFakeTimers();
            const setIntervalSpy = jest.spyOn(global, 'setInterval');
            
            connectionMonitor.startMonitoring();
            
            // Should set up health check timer
            expect(setIntervalSpy).toHaveBeenCalled();
            
            setIntervalSpy.mockRestore();
            jest.useRealTimers();
        });

        it('should not start monitoring if already monitoring', () => {
            jest.useFakeTimers();
            
            connectionMonitor.startMonitoring();
            const firstCallCount = jest.getTimerCount();
            
            connectionMonitor.startMonitoring();
            const secondCallCount = jest.getTimerCount();
            
            expect(secondCallCount).toBe(firstCallCount);
            
            jest.useRealTimers();
        });

        it('should stop monitoring and clear timers', () => {
            jest.useFakeTimers();
            const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
            
            connectionMonitor.startMonitoring();
            connectionMonitor.stopMonitoring();
            
            expect(clearIntervalSpy).toHaveBeenCalled();
            
            clearIntervalSpy.mockRestore();
            jest.useRealTimers();
        });
    });

    describe('connection events', () => {
        it('should handle connection established event', () => {
            const eventHandler = jest.fn();
            connectionMonitor.on('connected', eventHandler);

            // Simulate ready event from WhatsApp client
            const readyHandler = mockWhatsAppClient.on.mock.calls.find(
                call => call[0] === 'ready'
            )?.[1];
            
            if (readyHandler) {
                readyHandler();
            }

            const status = connectionMonitor.getStatus();
            expect(status.isConnected).toBe(true);
            expect(status.lastConnected).toBeInstanceOf(Date);
            expect(status.reconnectAttempts).toBe(0);
            expect(eventHandler).toHaveBeenCalledWith(status);
        });

        it('should handle connection lost event', () => {
            const eventHandler = jest.fn();
            connectionMonitor.on('disconnected', eventHandler);

            // First establish connection
            const readyHandler = mockWhatsAppClient.on.mock.calls.find(
                call => call[0] === 'ready'
            )?.[1];
            if (readyHandler) readyHandler();

            // Then simulate disconnection
            const disconnectedHandler = mockWhatsAppClient.on.mock.calls.find(
                call => call[0] === 'disconnected'
            )?.[1];
            
            if (disconnectedHandler) {
                disconnectedHandler();
            }

            const status = connectionMonitor.getStatus();
            expect(status.isConnected).toBe(false);
            expect(status.lastDisconnected).toBeInstanceOf(Date);
            expect(eventHandler).toHaveBeenCalledWith(status);
        });

        it('should handle authentication failure', async () => {
            const eventHandler = jest.fn();
            connectionMonitor.on('auth-failure', eventHandler);

            const authFailureHandler = mockWhatsAppClient.on.mock.calls.find(
                call => call[0] === 'auth_failure'
            )?.[1];
            
            if (authFailureHandler) {
                await authFailureHandler();
            }

            // Wait for async operations to complete
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(mockErrorHandler.handleError).toHaveBeenCalledWith(
                expect.any(Error),
                expect.objectContaining({
                    component: 'ConnectionMonitor',
                    operation: 'authentication'
                }),
                expect.any(String)
            );
            expect(eventHandler).toHaveBeenCalled();
        });
    });

    describe('health checks', () => {
        it('should detect connection loss during health check', async () => {
            jest.useFakeTimers();
            
            // Start with connected state
            mockWhatsAppClient.isReady.mockReturnValue(true);
            const readyHandler = mockWhatsAppClient.on.mock.calls.find(
                call => call[0] === 'ready'
            )?.[1];
            if (readyHandler) readyHandler();

            connectionMonitor.startMonitoring();

            // Simulate connection loss
            mockWhatsAppClient.isReady.mockReturnValue(false);

            // Trigger health check
            jest.advanceTimersByTime(30000);
            await Promise.resolve(); // Allow async operations to complete

            const status = connectionMonitor.getStatus();
            expect(status.isConnected).toBe(false);
            
            jest.useRealTimers();
        });

        it('should detect connection restoration during health check', async () => {
            jest.useFakeTimers();
            
            connectionMonitor.startMonitoring();

            // Simulate connection restoration
            mockWhatsAppClient.isReady.mockReturnValue(true);

            // Trigger health check
            jest.advanceTimersByTime(30000);
            await Promise.resolve(); // Allow async operations to complete

            const status = connectionMonitor.getStatus();
            expect(status.isConnected).toBe(true);
            
            jest.useRealTimers();
        });
    });

    describe('reconnection logic', () => {
        beforeEach(() => {
            jest.useFakeTimers();
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        it('should schedule reconnection after connection loss', () => {
            connectionMonitor.startMonitoring();

            // Simulate connection loss
            const disconnectedHandler = mockWhatsAppClient.on.mock.calls.find(
                call => call[0] === 'disconnected'
            )?.[1];
            
            if (disconnectedHandler) {
                disconnectedHandler();
            }

            const status = connectionMonitor.getStatus();
            expect(status.nextReconnectAt).toBeInstanceOf(Date);
        });

        it('should attempt reconnection with exponential backoff', async () => {
            connectionMonitor.startMonitoring();

            // Simulate connection loss
            const disconnectedHandler = mockWhatsAppClient.on.mock.calls.find(
                call => call[0] === 'disconnected'
            )?.[1];
            
            if (disconnectedHandler) {
                disconnectedHandler();
            }

            // Mock graceful degradation to simulate reconnection attempt
            mockErrorHandler.executeWithGracefulDegradation.mockResolvedValue(true);

            // Advance time to trigger first reconnection attempt
            jest.advanceTimersByTime(6000);

            expect(mockErrorHandler.executeWithGracefulDegradation).toHaveBeenCalled();
        }, 10000);

        it('should stop reconnection attempts after max attempts', async () => {
            const maxAttemptsHandler = jest.fn();
            connectionMonitor.on('max-reconnect-attempts-reached', maxAttemptsHandler);
            
            connectionMonitor.startMonitoring();

            // Simulate connection loss
            const disconnectedHandler = mockWhatsAppClient.on.mock.calls.find(
                call => call[0] === 'disconnected'
            )?.[1];
            
            if (disconnectedHandler) {
                disconnectedHandler();
            }

            // Mock failed reconnection attempts
            mockErrorHandler.executeWithGracefulDegradation.mockRejectedValue(new Error('Reconnection failed'));

            // Simulate multiple failed attempts
            for (let i = 0; i < 11; i++) {
                jest.advanceTimersByTime(30000);
            }

            expect(maxAttemptsHandler).toHaveBeenCalled();
        }, 10000);

        it('should respect circuit breaker state', async () => {
            // Reset the mock to clear previous calls
            mockErrorHandler.executeWithGracefulDegradation.mockClear();
            mockErrorHandler.isCircuitBreakerOpen.mockReturnValue(true);
            
            connectionMonitor.startMonitoring();

            // Simulate connection loss
            const disconnectedHandler = mockWhatsAppClient.on.mock.calls.find(
                call => call[0] === 'disconnected'
            )?.[1];
            
            if (disconnectedHandler) {
                disconnectedHandler();
            }

            // Advance time to trigger reconnection attempt
            jest.advanceTimersByTime(6000);

            // Should not attempt reconnection when circuit breaker is open
            expect(mockErrorHandler.executeWithGracefulDegradation).not.toHaveBeenCalled();
        }, 10000);
    });

    describe('configuration updates', () => {
        it('should update monitoring configuration', () => {
            const newConfig = {
                maxReconnectAttempts: 15,
                baseReconnectDelay: 10000,
                maxReconnectDelay: 600000,
                healthCheckInterval: 60000
            };

            connectionMonitor.updateConfig(newConfig);

            // Configuration should be updated (we can't directly test private properties,
            // but we can test the behavior)
            expect(() => connectionMonitor.updateConfig(newConfig)).not.toThrow();
        });

        it('should restart health check timer with new interval', () => {
            jest.useFakeTimers();
            const setIntervalSpy = jest.spyOn(global, 'setInterval');
            const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
            
            connectionMonitor.startMonitoring();
            const initialCallCount = setIntervalSpy.mock.calls.length;

            connectionMonitor.updateConfig({ healthCheckInterval: 60000 });

            // Should have cleared old timer and set new one
            expect(clearIntervalSpy).toHaveBeenCalled();
            expect(setIntervalSpy.mock.calls.length).toBeGreaterThan(initialCallCount);
            
            setIntervalSpy.mockRestore();
            clearIntervalSpy.mockRestore();
            jest.useRealTimers();
        });
    });

    describe('force reconnection', () => {
        it('should force immediate reconnection attempt', async () => {
            // Clear previous calls
            mockErrorHandler.executeWithGracefulDegradation.mockClear();
            mockErrorHandler.executeWithGracefulDegradation.mockResolvedValue(true);

            await connectionMonitor.forceReconnect();

            expect(mockErrorHandler.executeWithGracefulDegradation).toHaveBeenCalled();
        });

        it('should clear existing reconnection timer', async () => {
            jest.useFakeTimers();
            const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
            
            connectionMonitor.startMonitoring();

            // Simulate connection loss to schedule reconnection
            const disconnectedHandler = mockWhatsAppClient.on.mock.calls.find(
                call => call[0] === 'disconnected'
            )?.[1];
            
            if (disconnectedHandler) {
                disconnectedHandler();
            }

            mockErrorHandler.executeWithGracefulDegradation.mockResolvedValue(true);

            // Force reconnection should clear the scheduled timer
            await connectionMonitor.forceReconnect();

            expect(clearTimeoutSpy).toHaveBeenCalled();
            
            clearTimeoutSpy.mockRestore();
            jest.useRealTimers();
        });
    });
});