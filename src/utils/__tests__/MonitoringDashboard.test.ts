import { MonitoringDashboard, MonitoringConfig } from '../MonitoringDashboard';
import { HealthMonitor } from '../HealthMonitor';
import { ConnectionMonitor } from '../ConnectionMonitor';
import { ErrorHandler } from '../ErrorHandler';
import { AlertingSystem } from '../AlertingSystem';
import { ActivityLogger } from '../../services/ActivityLogger';

// Mock all dependencies
const mockHealthMonitor = {
    startMonitoring: jest.fn(),
    stopMonitoring: jest.fn(),
    getSystemHealth: jest.fn().mockReturnValue({
        overall: 'healthy',
        checks: [
            {
                name: 'WhatsApp Connection',
                status: 'healthy',
                message: 'Connected and ready',
                lastCheck: new Date(),
                responseTime: 100
            }
        ],
        uptime: 3600,
        timestamp: new Date()
    })
} as any;

const mockConnectionMonitor = {
    startMonitoring: jest.fn(),
    stopMonitoring: jest.fn(),
    getStatus: jest.fn().mockReturnValue({
        isConnected: true,
        lastConnected: new Date(),
        reconnectAttempts: 0
    })
} as any;

const mockErrorHandler = {
    getComprehensiveReport: jest.fn().mockReturnValue({
        errorStats: {
            totalErrors: 5,
            errorsByComponent: {},
            circuitBreakers: {},
            systemHealth: {
                status: 'healthy',
                issues: [],
                recommendations: []
            }
        },
        componentHealth: {},
        activeCircuitBreakers: [],
        recommendations: [],
        criticalIssues: []
    })
} as any;

const mockAlertingSystem = {
    getAlertStats: jest.fn().mockReturnValue({
        activeAlerts: 0,
        totalAlertsToday: 2,
        alertsByComponent: {},
        alertsBySeverity: {}
    }),
    sendAlert: jest.fn().mockResolvedValue(undefined)
} as any;

const mockActivityLogger = {
    getStatistics: jest.fn().mockResolvedValue({
        totalMessages: 10,
        totalReplies: 8,
        totalErrors: 1,
        averageResponseTime: 500
    })
} as any;

describe('MonitoringDashboard', () => {
    let dashboard: MonitoringDashboard;
    let config: MonitoringConfig;

    beforeEach(() => {
        config = {
            updateIntervalMs: 1000, // 1 second for testing
            retainHistoryHours: 1,
            alertThresholds: {
                errorRate: 5,
                memoryUsageMB: 100,
                responseTimeMs: 1000
            }
        };

        dashboard = new MonitoringDashboard(
            mockHealthMonitor,
            mockConnectionMonitor,
            mockErrorHandler,
            mockAlertingSystem,
            mockActivityLogger,
            config
        );
    });

    afterEach(() => {
        dashboard.stop();
        jest.clearAllMocks();
    });

    describe('start and stop', () => {
        it('should start monitoring components', () => {
            dashboard.start();

            expect(mockHealthMonitor.startMonitoring).toHaveBeenCalled();
            expect(mockConnectionMonitor.startMonitoring).toHaveBeenCalled();
        });

        it('should stop monitoring components', () => {
            dashboard.start();
            dashboard.stop();

            expect(mockHealthMonitor.stopMonitoring).toHaveBeenCalled();
            expect(mockConnectionMonitor.stopMonitoring).toHaveBeenCalled();
        });

        it('should emit dashboard-started event', (done) => {
            dashboard.on('dashboard-started', () => {
                done();
            });

            dashboard.start();
        });

        it('should emit dashboard-stopped event', (done) => {
            dashboard.on('dashboard-stopped', () => {
                done();
            });

            dashboard.start();
            dashboard.stop();
        });
    });

    describe('getCurrentMetrics', () => {
        it('should return current dashboard metrics', async () => {
            const metrics = await dashboard.getCurrentMetrics();

            expect(metrics).toHaveProperty('systemHealth');
            expect(metrics).toHaveProperty('connectionStatus');
            expect(metrics).toHaveProperty('errorReport');
            expect(metrics).toHaveProperty('alertStats');
            expect(metrics).toHaveProperty('activityStats');
            expect(metrics).toHaveProperty('uptime');
            expect(metrics).toHaveProperty('memoryUsage');
            expect(metrics).toHaveProperty('timestamp');

            expect(mockHealthMonitor.getSystemHealth).toHaveBeenCalled();
            expect(mockConnectionMonitor.getStatus).toHaveBeenCalled();
            expect(mockErrorHandler.getComprehensiveReport).toHaveBeenCalled();
            expect(mockAlertingSystem.getAlertStats).toHaveBeenCalled();
            expect(mockActivityLogger.getStatistics).toHaveBeenCalledWith(24);
        });
    });

    describe('getStatusSummary', () => {
        it('should return system status summary with healthy status', async () => {
            const summary = await dashboard.getStatusSummary();

            expect(summary.overall).toBe('healthy');
            expect(summary.issues).toEqual([]);
            expect(summary.recommendations).toEqual([]);
            expect(summary.keyMetrics).toHaveProperty('uptime');
            expect(summary.keyMetrics).toHaveProperty('memoryUsage');
            expect(summary.keyMetrics).toHaveProperty('errorRate');
            expect(summary.keyMetrics).toHaveProperty('activeAlerts');
            expect(summary.keyMetrics).toHaveProperty('connectionStatus');
        });

        it('should detect critical status when connection is down', async () => {
            mockConnectionMonitor.getStatus.mockReturnValue({
                isConnected: false,
                lastDisconnected: new Date(),
                reconnectAttempts: 3
            });

            const summary = await dashboard.getStatusSummary();

            expect(summary.overall).toBe('critical');
            expect(summary.issues).toContain('WhatsApp connection is down');
            expect(summary.recommendations).toContain('Check internet connection and restart WhatsApp client');
        });

        it('should detect degraded status with high memory usage', async () => {
            // Mock high memory usage
            const originalMemoryUsage = process.memoryUsage;
            process.memoryUsage = jest.fn().mockReturnValue({
                heapUsed: 200 * 1024 * 1024, // 200MB
                heapTotal: 300 * 1024 * 1024,
                external: 0,
                rss: 0,
                arrayBuffers: 0
            });

            const summary = await dashboard.getStatusSummary();

            expect(summary.overall).toBe('degraded');
            expect(summary.issues).toContain('High memory usage: 200MB');
            expect(summary.recommendations).toContain('Consider restarting the application');

            process.memoryUsage = originalMemoryUsage;
        });
    });

    describe('generateReport', () => {
        it('should generate comprehensive monitoring report', async () => {
            const report = await dashboard.generateReport();

            expect(report).toHaveProperty('summary');
            expect(report).toHaveProperty('detailedMetrics');
            expect(report).toHaveProperty('trends');
            expect(report).toHaveProperty('healthChecks');

            expect(report.trends).toHaveProperty('errorTrend');
            expect(report.trends).toHaveProperty('memoryTrend');
            expect(report.trends).toHaveProperty('performanceTrend');

            expect(report.healthChecks).toBeInstanceOf(Array);
            expect(report.healthChecks[0]).toHaveProperty('name');
            expect(report.healthChecks[0]).toHaveProperty('status');
        });
    });

    describe('exportData', () => {
        it('should export monitoring data', async () => {
            // Start dashboard to generate some metrics
            dashboard.start();
            
            // Wait a bit for metrics to be collected
            await new Promise(resolve => setTimeout(resolve, 100));

            const exportData = await dashboard.exportData(1);

            expect(exportData).toHaveProperty('metrics');
            expect(exportData).toHaveProperty('summary');
            expect(exportData).toHaveProperty('exportTime');

            expect(exportData.metrics).toBeInstanceOf(Array);
            expect(exportData.exportTime).toBeInstanceOf(Date);
        });
    });

    describe('metrics history', () => {
        it('should retain metrics history', async () => {
            dashboard.start();

            // Wait for a few metric updates
            await new Promise(resolve => setTimeout(resolve, 1100));

            const history = dashboard.getMetricsHistory(1);
            expect(history.length).toBeGreaterThan(0);
        });

        it('should trim old metrics based on retention period', async () => {
            // Use a very short retention period for testing
            const shortConfig = { ...config, retainHistoryHours: 0.001 }; // ~3.6 seconds
            const shortDashboard = new MonitoringDashboard(
                mockHealthMonitor,
                mockConnectionMonitor,
                mockErrorHandler,
                mockAlertingSystem,
                mockActivityLogger,
                shortConfig
            );

            shortDashboard.start();

            // Wait for metrics to be collected and then trimmed
            await new Promise(resolve => setTimeout(resolve, 1100));

            const history = shortDashboard.getMetricsHistory(1);
            // History should be limited due to short retention period
            expect(history.length).toBeLessThanOrEqual(2);

            shortDashboard.stop();
        });
    });

    describe('threshold monitoring', () => {
        it('should trigger alerts when thresholds are exceeded', async () => {
            // Mock high error rate
            mockErrorHandler.getComprehensiveReport.mockReturnValue({
                errorStats: {
                    totalErrors: 100, // High error count
                    errorsByComponent: {},
                    circuitBreakers: {},
                    systemHealth: {
                        status: 'degraded',
                        issues: ['High error count'],
                        recommendations: []
                    }
                },
                componentHealth: {},
                activeCircuitBreakers: [],
                recommendations: [],
                criticalIssues: []
            });

            dashboard.start();

            // Wait for threshold check
            await new Promise(resolve => setTimeout(resolve, 1100));

            // Should have triggered an alert for high error rate
            expect(mockAlertingSystem.sendAlert).toHaveBeenCalled();
        });
    });

    describe('event handling', () => {
        it('should handle health status changes', (done) => {
            dashboard.on('health-change', (event) => {
                expect(event).toBeDefined();
                done();
            });

            // Simulate health status change
            mockHealthMonitor.emit('health-status-changed', {
                check: 'test',
                previousStatus: 'healthy',
                newStatus: 'degraded'
            });
        });

        it('should handle connection changes', (done) => {
            dashboard.on('connection-restored', (status) => {
                expect(status).toBeDefined();
                done();
            });

            // Simulate connection restored
            mockConnectionMonitor.emit('connected', { isConnected: true });
        });
    });
});