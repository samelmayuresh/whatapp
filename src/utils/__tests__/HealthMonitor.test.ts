import { HealthMonitor, HealthCheck, SystemHealth } from '../HealthMonitor';
import { WhatsAppClient } from '../../services/WhatsAppClient';
import { ReplyEngine } from '../../services/ReplyEngine';
import { WebServer } from '../../web/WebServer';
import { ConfigurationManager } from '../../services/ConfigurationManager';
import { ActivityLogger } from '../../services/ActivityLogger';
import { errorHandler } from '../ErrorHandler';

// Mock dependencies
jest.mock('../../services/WhatsAppClient');
jest.mock('../../services/ReplyEngine');
jest.mock('../../web/WebServer');
jest.mock('../../services/ConfigurationManager');
jest.mock('../../services/ActivityLogger');
jest.mock('../ErrorHandler');

describe('HealthMonitor', () => {
    let healthMonitor: HealthMonitor;
    let mockWhatsAppClient: jest.Mocked<WhatsAppClient>;
    let mockReplyEngine: jest.Mocked<ReplyEngine>;
    let mockWebServer: jest.Mocked<WebServer>;
    let mockConfigManager: jest.Mocked<ConfigurationManager>;
    let mockActivityLogger: jest.Mocked<ActivityLogger>;
    let mockErrorHandler: jest.Mocked<typeof errorHandler>;

    beforeEach(() => {
        mockWhatsAppClient = {
            isReady: jest.fn().mockReturnValue(true)
        } as any;

        mockReplyEngine = {
            isEngineActive: jest.fn().mockReturnValue(true)
        } as any;

        mockWebServer = {
            isServerRunning: jest.fn().mockReturnValue(true)
        } as any;

        mockConfigManager = {
            getSystemSettings: jest.fn().mockReturnValue({ enabled: true }),
            getMessageTemplates: jest.fn().mockReturnValue([{ id: '1', name: 'Test' }])
        } as any;

        mockActivityLogger = {
            getRecentEntries: jest.fn().mockResolvedValue([])
        } as any;

        mockErrorHandler = {
            getErrorStats: jest.fn().mockReturnValue({
                totalErrors: 0,
                errorsByComponent: {},
                circuitBreakers: {},
                systemHealth: {
                    status: 'healthy',
                    issues: [],
                    recommendations: []
                }
            })
        } as any;

        healthMonitor = new HealthMonitor(
            mockWhatsAppClient,
            mockReplyEngine,
            mockWebServer,
            mockConfigManager,
            mockActivityLogger
        );

        // Suppress console output during tests
        jest.spyOn(console, 'log').mockImplementation();
        jest.spyOn(console, 'warn').mockImplementation();
        jest.spyOn(console, 'error').mockImplementation();
    });

    afterEach(() => {
        healthMonitor.stopMonitoring();
        jest.restoreAllMocks();
        jest.clearAllTimers();
    });

    describe('monitoring lifecycle', () => {
        it('should start monitoring successfully', () => {
            jest.useFakeTimers();
            
            healthMonitor.startMonitoring();
            
            expect(setInterval).toHaveBeenCalled();
            
            jest.useRealTimers();
        });

        it('should not start monitoring if already monitoring', () => {
            jest.useFakeTimers();
            
            healthMonitor.startMonitoring();
            const firstCallCount = (setInterval as jest.Mock).mock.calls.length;
            
            healthMonitor.startMonitoring();
            const secondCallCount = (setInterval as jest.Mock).mock.calls.length;
            
            expect(secondCallCount).toBe(firstCallCount);
            
            jest.useRealTimers();
        });

        it('should stop monitoring and clear timers', () => {
            jest.useFakeTimers();
            
            healthMonitor.startMonitoring();
            healthMonitor.stopMonitoring();
            
            expect(clearInterval).toHaveBeenCalled();
            
            jest.useRealTimers();
        });
    });

    describe('health checks', () => {
        it('should perform all health checks', async () => {
            jest.useFakeTimers();
            
            const healthCheckCompleteHandler = jest.fn();
            healthMonitor.on('health-check-complete', healthCheckCompleteHandler);
            
            healthMonitor.startMonitoring();
            
            // Advance time to trigger health checks
            jest.advanceTimersByTime(30000);
            await Promise.resolve(); // Allow async operations to complete
            
            expect(healthCheckCompleteHandler).toHaveBeenCalled();
            
            jest.useRealTimers();
        });

        it('should check WhatsApp connection health', async () => {
            mockWhatsAppClient.isReady.mockReturnValue(true);
            
            const systemHealth = healthMonitor.getSystemHealth();
            
            expect(systemHealth.checks.some(check => 
                check.name === 'WhatsApp Connection' && check.status === 'healthy'
            )).toBe(true);
        });

        it('should detect unhealthy WhatsApp connection', async () => {
            mockWhatsAppClient.isReady.mockReturnValue(false);
            
            jest.useFakeTimers();
            healthMonitor.startMonitoring();
            jest.advanceTimersByTime(30000);
            await Promise.resolve();
            
            const systemHealth = healthMonitor.getSystemHealth();
            const whatsappCheck = systemHealth.checks.find(check => 
                check.name === 'WhatsApp Connection'
            );
            
            expect(whatsappCheck?.status).toBe('unhealthy');
            
            jest.useRealTimers();
        });

        it('should check reply engine health', async () => {
            mockReplyEngine.isEngineActive.mockReturnValue(true);
            
            jest.useFakeTimers();
            healthMonitor.startMonitoring();
            jest.advanceTimersByTime(30000);
            await Promise.resolve();
            
            const systemHealth = healthMonitor.getSystemHealth();
            const engineCheck = systemHealth.checks.find(check => 
                check.name === 'Reply Engine'
            );
            
            expect(engineCheck?.status).toBe('healthy');
            
            jest.useRealTimers();
        });

        it('should check web server health', async () => {
            mockWebServer.isServerRunning.mockReturnValue(true);
            
            jest.useFakeTimers();
            healthMonitor.startMonitoring();
            jest.advanceTimersByTime(30000);
            await Promise.resolve();
            
            const systemHealth = healthMonitor.getSystemHealth();
            const serverCheck = systemHealth.checks.find(check => 
                check.name === 'Web Server'
            );
            
            expect(serverCheck?.status).toBe('healthy');
            
            jest.useRealTimers();
        });

        it('should check configuration health', async () => {
            mockConfigManager.getSystemSettings.mockReturnValue({
                enabled: true,
                pauseWhenActive: false,
                businessHours: { start: '09:00', end: '17:00', days: [1,2,3,4,5] },
                rateLimitMinutes: 30,
                blacklistedContacts: []
            });
            mockConfigManager.getMessageTemplates.mockReturnValue([{
                id: '1',
                name: 'Default',
                content: 'Hello',
                isDefault: true,
                placeholders: []
            }]);
            
            jest.useFakeTimers();
            healthMonitor.startMonitoring();
            jest.advanceTimersByTime(30000);
            await Promise.resolve();
            
            const systemHealth = healthMonitor.getSystemHealth();
            const configCheck = systemHealth.checks.find(check => 
                check.name === 'Configuration'
            );
            
            expect(configCheck?.status).toBe('healthy');
            
            jest.useRealTimers();
        });

        it('should detect configuration issues', async () => {
            mockConfigManager.getSystemSettings.mockReturnValue({
                enabled: false,
                pauseWhenActive: false,
                businessHours: { start: '09:00', end: '17:00', days: [1,2,3,4,5] },
                rateLimitMinutes: 30,
                blacklistedContacts: []
            });
            mockConfigManager.getMessageTemplates.mockReturnValue([]);
            
            jest.useFakeTimers();
            healthMonitor.startMonitoring();
            jest.advanceTimersByTime(30000);
            await Promise.resolve();
            
            const systemHealth = healthMonitor.getSystemHealth();
            const configCheck = systemHealth.checks.find(check => 
                check.name === 'Configuration'
            );
            
            expect(configCheck?.status).toBe('degraded');
            
            jest.useRealTimers();
        });

        it('should check memory usage', async () => {
            // Mock process.memoryUsage to return normal values
            const originalMemoryUsage = process.memoryUsage;
            (process.memoryUsage as any) = jest.fn().mockReturnValue({
                heapUsed: 100 * 1024 * 1024, // 100MB
                heapTotal: 200 * 1024 * 1024, // 200MB
                external: 0,
                arrayBuffers: 0,
                rss: 0
            });
            
            jest.useFakeTimers();
            healthMonitor.startMonitoring();
            jest.advanceTimersByTime(30000);
            await Promise.resolve();
            
            const systemHealth = healthMonitor.getSystemHealth();
            const memoryCheck = systemHealth.checks.find(check => 
                check.name === 'Memory Usage'
            );
            
            expect(memoryCheck?.status).toBe('healthy');
            
            process.memoryUsage = originalMemoryUsage;
            jest.useRealTimers();
        });

        it('should detect high memory usage', async () => {
            // Mock process.memoryUsage to return high values
            const originalMemoryUsage = process.memoryUsage;
            (process.memoryUsage as any) = jest.fn().mockReturnValue({
                heapUsed: 600 * 1024 * 1024, // 600MB
                heapTotal: 800 * 1024 * 1024, // 800MB
                external: 0,
                arrayBuffers: 0,
                rss: 0
            });
            
            jest.useFakeTimers();
            healthMonitor.startMonitoring();
            jest.advanceTimersByTime(30000);
            await Promise.resolve();
            
            const systemHealth = healthMonitor.getSystemHealth();
            const memoryCheck = systemHealth.checks.find(check => 
                check.name === 'Memory Usage'
            );
            
            expect(memoryCheck?.status).toBe('degraded');
            
            process.memoryUsage = originalMemoryUsage;
            jest.useRealTimers();
        });

        it('should check error rates', async () => {
            mockErrorHandler.getErrorStats.mockReturnValue({
                totalErrors: 5,
                errorsByComponent: {},
                circuitBreakers: {},
                systemHealth: {
                    status: 'healthy',
                    issues: [],
                    recommendations: []
                }
            });
            
            jest.useFakeTimers();
            healthMonitor.startMonitoring();
            jest.advanceTimersByTime(30000);
            await Promise.resolve();
            
            const systemHealth = healthMonitor.getSystemHealth();
            const errorCheck = systemHealth.checks.find(check => 
                check.name === 'Error Rates'
            );
            
            expect(errorCheck?.status).toBe('healthy');
            
            jest.useRealTimers();
        });

        it('should detect high error rates', async () => {
            mockErrorHandler.getErrorStats.mockReturnValue({
                totalErrors: 150,
                errorsByComponent: {},
                circuitBreakers: {
                    'TestComponent:testOp': { isOpen: true, failureCount: 5 }
                },
                systemHealth: {
                    status: 'degraded',
                    issues: ['High error count'],
                    recommendations: ['Review logs']
                }
            });
            
            jest.useFakeTimers();
            healthMonitor.startMonitoring();
            jest.advanceTimersByTime(30000);
            await Promise.resolve();
            
            const systemHealth = healthMonitor.getSystemHealth();
            const errorCheck = systemHealth.checks.find(check => 
                check.name === 'Error Rates'
            );
            
            expect(errorCheck?.status).toBe('degraded');
            
            jest.useRealTimers();
        });
    });

    describe('overall health calculation', () => {
        it('should report healthy when all checks pass', () => {
            const systemHealth = healthMonitor.getSystemHealth();
            expect(systemHealth.overall).toBe('healthy');
        });

        it('should report unhealthy when critical checks fail', async () => {
            mockWhatsAppClient.isReady.mockReturnValue(false);
            mockWebServer.isServerRunning.mockReturnValue(false);
            
            jest.useFakeTimers();
            healthMonitor.startMonitoring();
            jest.advanceTimersByTime(30000);
            await Promise.resolve();
            
            const systemHealth = healthMonitor.getSystemHealth();
            expect(systemHealth.overall).toBe('unhealthy');
            
            jest.useRealTimers();
        });

        it('should report degraded when some checks are degraded', async () => {
            mockReplyEngine.isEngineActive.mockReturnValue(false);
            
            jest.useFakeTimers();
            healthMonitor.startMonitoring();
            jest.advanceTimersByTime(30000);
            await Promise.resolve();
            
            const systemHealth = healthMonitor.getSystemHealth();
            expect(systemHealth.overall).toBe('degraded');
            
            jest.useRealTimers();
        });
    });

    describe('detailed health report', () => {
        it('should provide detailed health report with recommendations', async () => {
            mockWhatsAppClient.isReady.mockReturnValue(false);
            mockErrorHandler.getErrorStats.mockReturnValue({
                totalErrors: 25,
                errorsByComponent: {},
                circuitBreakers: {},
                systemHealth: {
                    status: 'degraded',
                    issues: ['Moderate error count'],
                    recommendations: ['Monitor system closely']
                }
            });
            
            jest.useFakeTimers();
            healthMonitor.startMonitoring();
            jest.advanceTimersByTime(30000);
            await Promise.resolve();
            
            const report = healthMonitor.getDetailedHealthReport();
            
            expect(report.systemHealth.overall).toBe('unhealthy');
            expect(report.criticalIssues.length).toBeGreaterThan(0);
            expect(report.recommendations.length).toBeGreaterThan(0);
            expect(report.errorStats).toBeDefined();
            
            jest.useRealTimers();
        });

        it('should provide specific recommendations for different components', async () => {
            mockWhatsAppClient.isReady.mockReturnValue(false);
            mockWebServer.isServerRunning.mockReturnValue(false);
            mockConfigManager.getSystemSettings.mockReturnValue({
                enabled: false,
                pauseWhenActive: false,
                businessHours: { start: '09:00', end: '17:00', days: [1,2,3,4,5] },
                rateLimitMinutes: 30,
                blacklistedContacts: []
            });
            
            jest.useFakeTimers();
            healthMonitor.startMonitoring();
            jest.advanceTimersByTime(30000);
            await Promise.resolve();
            
            const report = healthMonitor.getDetailedHealthReport();
            
            expect(report.recommendations.some(rec => 
                rec.includes('WhatsApp') || rec.includes('internet connection')
            )).toBe(true);
            expect(report.recommendations.some(rec => 
                rec.includes('web server') || rec.includes('port')
            )).toBe(true);
            expect(report.recommendations.some(rec => 
                rec.includes('configuration')
            )).toBe(true);
            
            jest.useRealTimers();
        });
    });

    describe('event emission', () => {
        it('should emit health-status-changed events', async () => {
            const statusChangeHandler = jest.fn();
            healthMonitor.on('health-status-changed', statusChangeHandler);
            
            jest.useFakeTimers();
            healthMonitor.startMonitoring();
            
            // First health check - all healthy
            jest.advanceTimersByTime(30000);
            await Promise.resolve();
            
            // Change WhatsApp status to unhealthy
            mockWhatsAppClient.isReady.mockReturnValue(false);
            
            // Second health check - WhatsApp unhealthy
            jest.advanceTimersByTime(30000);
            await Promise.resolve();
            
            expect(statusChangeHandler).toHaveBeenCalledWith(
                expect.objectContaining({
                    check: 'whatsapp_connection',
                    previousStatus: 'healthy',
                    newStatus: 'unhealthy'
                })
            );
            
            jest.useRealTimers();
        });

        it('should emit health-check-complete events', async () => {
            const completeHandler = jest.fn();
            healthMonitor.on('health-check-complete', completeHandler);
            
            jest.useFakeTimers();
            healthMonitor.startMonitoring();
            
            jest.advanceTimersByTime(30000);
            await Promise.resolve();
            
            expect(completeHandler).toHaveBeenCalledWith(
                expect.objectContaining({
                    overall: expect.any(String),
                    checks: expect.any(Array),
                    uptime: expect.any(Number),
                    timestamp: expect.any(Date)
                })
            );
            
            jest.useRealTimers();
        });
    });

    describe('custom health checks', () => {
        it('should allow adding custom health checks', () => {
            const customCheck = jest.fn().mockResolvedValue({
                status: 'healthy',
                message: 'Custom check passed'
            });
            
            healthMonitor.addHealthCheck('custom_check', customCheck);
            
            // Verify the check was added (we can't directly test private properties,
            // but we can test that the method doesn't throw)
            expect(() => healthMonitor.addHealthCheck('custom_check', customCheck)).not.toThrow();
        });
    });
});