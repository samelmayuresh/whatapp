import { ErrorHandler, ErrorSeverity, ErrorContext } from '../ErrorHandler';
import { ActivityLogger } from '../../services/ActivityLogger';

// Mock ActivityLogger
jest.mock('../../services/ActivityLogger');

describe('ErrorHandler', () => {
    let errorHandler: ErrorHandler;
    let mockActivityLogger: jest.Mocked<ActivityLogger>;

    beforeEach(() => {
        // Reset singleton instance
        (ErrorHandler as any).instance = undefined;
        errorHandler = ErrorHandler.getInstance();
        
        mockActivityLogger = {
            logError: jest.fn().mockResolvedValue(undefined)
        } as any;
        
        errorHandler.setActivityLogger(mockActivityLogger);
        
        // Suppress console output during tests
        jest.spyOn(console, 'error').mockImplementation();
        jest.spyOn(console, 'warn').mockImplementation();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('handleError', () => {
        it('should handle basic error logging', async () => {
            const error = new Error('Test error');
            const context: ErrorContext = {
                component: 'TestComponent',
                operation: 'testOperation'
            };

            await errorHandler.handleError(error, context);

            expect(mockActivityLogger.logError).toHaveBeenCalledWith(
                'system',
                expect.stringContaining('[medium] TestComponent:testOperation - Test error'),
                expect.objectContaining({
                    stack: error.stack
                })
            );
        });

        it('should handle critical errors with alerting', async () => {
            const error = new Error('Critical test error');
            const context: ErrorContext = {
                component: 'TestComponent',
                operation: 'testOperation',
                chatId: 'test-chat',
                contactName: 'Test Contact'
            };

            await errorHandler.handleError(error, context, ErrorSeverity.CRITICAL);

            expect(mockActivityLogger.logError).toHaveBeenCalledWith(
                'test-chat',
                expect.stringContaining('[critical] TestComponent:testOperation - Critical test error'),
                expect.objectContaining({
                    stack: error.stack
                })
            );
        });

        it('should update error statistics', async () => {
            const error = new Error('Test error');
            const context: ErrorContext = {
                component: 'TestComponent',
                operation: 'testOperation'
            };

            await errorHandler.handleError(error, context);
            await errorHandler.handleError(error, context);

            const stats = errorHandler.getErrorStats();
            expect(stats.totalErrors).toBe(2);
            expect(stats.errorsByComponent['TestComponent:testOperation']).toBe(2);
        });
    });

    describe('handleRecoverableError', () => {
        it('should succeed on first attempt', async () => {
            const successfulOperation = jest.fn().mockResolvedValue('success');
            const context: ErrorContext = {
                component: 'TestComponent',
                operation: 'testOperation'
            };

            const result = await errorHandler.handleRecoverableError(
                successfulOperation,
                context,
                3
            );

            expect(result).toBe('success');
            expect(successfulOperation).toHaveBeenCalledTimes(1);
        });

        it('should retry on failure and eventually succeed', async () => {
            const flakyOperation = jest.fn()
                .mockRejectedValueOnce(new Error('First failure'))
                .mockRejectedValueOnce(new Error('Second failure'))
                .mockResolvedValueOnce('success');

            const context: ErrorContext = {
                component: 'TestComponent',
                operation: 'testOperation'
            };

            const result = await errorHandler.handleRecoverableError(
                flakyOperation,
                context,
                3
            );

            expect(result).toBe('success');
            expect(flakyOperation).toHaveBeenCalledTimes(3);
        });

        it('should fail after max retries', async () => {
            const failingOperation = jest.fn().mockRejectedValue(new Error('Persistent failure'));
            const context: ErrorContext = {
                component: 'TestComponent',
                operation: 'testOperation'
            };

            await expect(
                errorHandler.handleRecoverableError(failingOperation, context, 2)
            ).rejects.toThrow('Persistent failure');

            expect(failingOperation).toHaveBeenCalledTimes(2);
        });
    });

    describe('circuit breaker', () => {
        it('should open circuit breaker after repeated failures', async () => {
            const error = new Error('Test error');
            const context: ErrorContext = {
                component: 'TestComponent',
                operation: 'testOperation'
            };

            // Trigger 5 failures to open circuit breaker
            for (let i = 0; i < 5; i++) {
                await errorHandler.handleError(error, context);
            }

            expect(errorHandler.isCircuitBreakerOpen('TestComponent', 'testOperation')).toBe(true);
        });

        it('should reset circuit breaker on successful operation', async () => {
            const error = new Error('Test error');
            const context: ErrorContext = {
                component: 'TestComponent',
                operation: 'testOperation'
            };

            // Trigger failures to open circuit breaker
            for (let i = 0; i < 5; i++) {
                await errorHandler.handleError(error, context);
            }

            expect(errorHandler.isCircuitBreakerOpen('TestComponent', 'testOperation')).toBe(true);

            // Reset circuit breaker
            errorHandler.resetCircuitBreaker('TestComponent', 'testOperation');

            expect(errorHandler.isCircuitBreakerOpen('TestComponent', 'testOperation')).toBe(false);
        });
    });

    describe('graceful degradation', () => {
        it('should execute primary operation successfully', async () => {
            const primaryOp = jest.fn().mockResolvedValue('primary success');
            const fallbackOp = jest.fn().mockResolvedValue('fallback success');
            const context: ErrorContext = {
                component: 'TestComponent',
                operation: 'testOperation'
            };

            const result = await errorHandler.executeWithGracefulDegradation(
                primaryOp,
                fallbackOp,
                context
            );

            expect(result).toBe('primary success');
            expect(primaryOp).toHaveBeenCalled();
            expect(fallbackOp).not.toHaveBeenCalled();
        });

        it('should fall back when primary operation fails', async () => {
            const primaryOp = jest.fn().mockRejectedValue(new Error('Primary failed'));
            const fallbackOp = jest.fn().mockResolvedValue('fallback success');
            const context: ErrorContext = {
                component: 'TestComponent',
                operation: 'testOperation'
            };

            const result = await errorHandler.executeWithGracefulDegradation(
                primaryOp,
                fallbackOp,
                context
            );

            expect(result).toBe('fallback success');
            expect(primaryOp).toHaveBeenCalled();
            expect(fallbackOp).toHaveBeenCalled();
        });

        it('should throw when both operations fail', async () => {
            const primaryOp = jest.fn().mockRejectedValue(new Error('Primary failed'));
            const fallbackOp = jest.fn().mockRejectedValue(new Error('Fallback failed'));
            const context: ErrorContext = {
                component: 'TestComponent',
                operation: 'testOperation'
            };

            await expect(
                errorHandler.executeWithGracefulDegradation(primaryOp, fallbackOp, context)
            ).rejects.toThrow('Fallback failed');

            expect(primaryOp).toHaveBeenCalled();
            expect(fallbackOp).toHaveBeenCalled();
        });
    });

    describe('system health assessment', () => {
        it('should report healthy status with no errors', () => {
            const health = errorHandler.getSystemHealthStatus();
            expect(health.status).toBe('healthy');
            expect(health.issues).toHaveLength(0);
            expect(health.recommendations).toHaveLength(0);
        });

        it('should report degraded status with moderate errors', async () => {
            const error = new Error('Test error');
            const context: ErrorContext = {
                component: 'TestComponent',
                operation: 'testOperation'
            };

            // Generate moderate number of errors
            for (let i = 0; i < 25; i++) {
                await errorHandler.handleError(error, context);
            }

            const health = errorHandler.getSystemHealthStatus();
            expect(health.status).toBe('degraded');
            expect(health.issues.length).toBeGreaterThan(0);
            expect(health.recommendations.length).toBeGreaterThan(0);
        });

        it('should report critical status with high error count', async () => {
            const error = new Error('Test error');
            const context: ErrorContext = {
                component: 'WhatsAppClient',
                operation: 'testOperation'
            };

            // Generate high number of errors in critical component
            for (let i = 0; i < 10; i++) {
                await errorHandler.handleError(error, context);
            }

            const health = errorHandler.getSystemHealthStatus();
            expect(health.status).toBe('critical');
            expect(health.issues.some(issue => issue.includes('Critical components'))).toBe(true);
        });
    });
});