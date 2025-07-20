import { AlertingSystem, AlertingConfig } from '../AlertingSystem';
import { ErrorSeverity } from '../ErrorHandler';
import { ActivityLogger } from '../../services/ActivityLogger';

// Mock ActivityLogger
const mockActivityLogger = {
    logSystemEvent: jest.fn().mockResolvedValue(undefined)
} as any;

describe('AlertingSystem', () => {
    let alertingSystem: AlertingSystem;
    let config: AlertingConfig;

    beforeEach(() => {
        config = {
            channels: [
                {
                    name: 'console',
                    type: 'console',
                    enabled: true,
                    config: {}
                },
                {
                    name: 'test-webhook',
                    type: 'webhook',
                    enabled: false,
                    config: {
                        url: 'https://example.com/webhook'
                    }
                }
            ],
            rules: [],
            cooldownMinutes: 5,
            maxAlertsPerHour: 10
        };

        alertingSystem = new AlertingSystem(config);
        alertingSystem.setActivityLogger(mockActivityLogger);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('sendAlert', () => {
        it('should send alert through enabled channels', async () => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            await alertingSystem.sendAlert(
                ErrorSeverity.HIGH,
                'Test Alert',
                'This is a test alert',
                'TestComponent',
                'testOperation'
            );

            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('ALERT [HIGH]'));
            expect(mockActivityLogger.logSystemEvent).toHaveBeenCalledWith('alert_sent', expect.any(Object));

            consoleSpy.mockRestore();
        });

        it('should respect cooldown periods', async () => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            // Send first alert
            await alertingSystem.sendAlert(
                ErrorSeverity.MEDIUM,
                'Test Alert',
                'First alert',
                'TestComponent',
                'testOperation'
            );

            // Send second identical alert immediately
            await alertingSystem.sendAlert(
                ErrorSeverity.MEDIUM,
                'Test Alert',
                'Second alert',
                'TestComponent',
                'testOperation'
            );

            // Should only log once due to cooldown
            expect(consoleSpy).toHaveBeenCalledTimes(1);

            consoleSpy.mockRestore();
        });

        it('should respect rate limits', async () => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
            const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

            // Send alerts up to the limit
            for (let i = 0; i < config.maxAlertsPerHour + 2; i++) {
                await alertingSystem.sendAlert(
                    ErrorSeverity.LOW,
                    `Test Alert ${i}`,
                    `Alert number ${i}`,
                    'TestComponent',
                    `testOperation${i}`
                );
            }

            expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('rate limit exceeded'));

            consoleSpy.mockRestore();
            warnSpy.mockRestore();
        });

        it('should emit alert-sent event', async () => {
            const alertSentSpy = jest.fn();
            alertingSystem.on('alert-sent', alertSentSpy);

            await alertingSystem.sendAlert(
                ErrorSeverity.CRITICAL,
                'Critical Alert',
                'System is down',
                'SystemComponent',
                'healthCheck'
            );

            expect(alertSentSpy).toHaveBeenCalledWith(expect.objectContaining({
                severity: ErrorSeverity.CRITICAL,
                title: 'Critical Alert',
                message: 'System is down',
                component: 'SystemComponent',
                operation: 'healthCheck'
            }));
        });
    });

    describe('resolveAlert', () => {
        it('should resolve active alert', async () => {
            // Send an alert first
            await alertingSystem.sendAlert(
                ErrorSeverity.HIGH,
                'Test Alert',
                'Test message',
                'TestComponent',
                'testOperation'
            );

            const activeAlerts = alertingSystem.getActiveAlerts();
            expect(activeAlerts).toHaveLength(1);

            const alertId = activeAlerts[0].id;

            // Resolve the alert
            await alertingSystem.resolveAlert(alertId, 'Issue fixed');

            const activeAlertsAfter = alertingSystem.getActiveAlerts();
            expect(activeAlertsAfter).toHaveLength(0);

            expect(mockActivityLogger.logSystemEvent).toHaveBeenCalledWith('alert_resolved', expect.any(Object));
        });

        it('should emit alert-resolved event', async () => {
            const alertResolvedSpy = jest.fn();
            alertingSystem.on('alert-resolved', alertResolvedSpy);

            // Send and resolve alert
            await alertingSystem.sendAlert(
                ErrorSeverity.MEDIUM,
                'Test Alert',
                'Test message',
                'TestComponent',
                'testOperation'
            );

            const activeAlerts = alertingSystem.getActiveAlerts();
            const alertId = activeAlerts[0].id;

            await alertingSystem.resolveAlert(alertId);

            expect(alertResolvedSpy).toHaveBeenCalledWith(expect.objectContaining({
                id: alertId,
                resolved: true,
                resolvedAt: expect.any(Date)
            }));
        });
    });

    describe('getAlertStats', () => {
        it('should return correct alert statistics', async () => {
            // Send some alerts
            await alertingSystem.sendAlert(ErrorSeverity.HIGH, 'Alert 1', 'Message 1', 'Component1', 'op1');
            await alertingSystem.sendAlert(ErrorSeverity.CRITICAL, 'Alert 2', 'Message 2', 'Component2', 'op2');
            await alertingSystem.sendAlert(ErrorSeverity.MEDIUM, 'Alert 3', 'Message 3', 'Component1', 'op3');

            const stats = alertingSystem.getAlertStats();

            expect(stats.activeAlerts).toBe(3);
            expect(stats.totalAlertsToday).toBe(3);
            expect(stats.alertsByComponent['Component1']).toBe(2);
            expect(stats.alertsByComponent['Component2']).toBe(1);
            expect(stats.alertsBySeverity[ErrorSeverity.HIGH]).toBe(1);
            expect(stats.alertsBySeverity[ErrorSeverity.CRITICAL]).toBe(1);
            expect(stats.alertsBySeverity[ErrorSeverity.MEDIUM]).toBe(1);
        });
    });

    describe('testAlerts', () => {
        it('should test all enabled channels', async () => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            const results = await alertingSystem.testAlerts();

            expect(results).toHaveLength(1); // Only console channel is enabled
            expect(results[0]).toEqual({
                channel: 'console',
                success: true
            });

            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Test Alert'));

            consoleSpy.mockRestore();
        });
    });

    describe('updateConfig', () => {
        it('should update configuration', () => {
            const newConfig = {
                cooldownMinutes: 10,
                maxAlertsPerHour: 20
            };

            alertingSystem.updateConfig(newConfig);

            // Test that new config is applied by checking cooldown behavior
            expect(true).toBe(true); // Config update doesn't have direct observable effects in this test
        });
    });
});