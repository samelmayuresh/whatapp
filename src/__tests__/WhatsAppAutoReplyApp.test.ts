import { WhatsAppAutoReplyApp } from '../WhatsAppAutoReplyApp';
import { ConfigurationManager } from '../services/ConfigurationManager';
import { ActivityLogger } from '../services/ActivityLogger';
import { WhatsAppClient } from '../services/WhatsAppClient';
import { ReplyEngine } from '../services/ReplyEngine';
import { WebServer } from '../web/WebServer';

// Mock all dependencies
jest.mock('../services/ConfigurationManager');
jest.mock('../services/ActivityLogger');
jest.mock('../services/WhatsAppClient');
jest.mock('../services/ReplyEngine');
jest.mock('../web/WebServer');
jest.mock('../utils/ConfigWatcher');

const MockedConfigurationManager = ConfigurationManager as jest.MockedClass<typeof ConfigurationManager>;
const MockedActivityLogger = ActivityLogger as jest.MockedClass<typeof ActivityLogger>;
const MockedWhatsAppClient = WhatsAppClient as jest.MockedClass<typeof WhatsAppClient>;
const MockedReplyEngine = ReplyEngine as jest.MockedClass<typeof ReplyEngine>;
const MockedWebServer = WebServer as jest.MockedClass<typeof WebServer>;

describe('WhatsAppAutoReplyApp', () => {
    let app: WhatsAppAutoReplyApp;
    let mockConfigManager: jest.Mocked<ConfigurationManager>;
    let mockActivityLogger: jest.Mocked<ActivityLogger>;
    let mockWhatsAppClient: jest.Mocked<WhatsAppClient>;
    let mockReplyEngine: jest.Mocked<ReplyEngine>;
    let mockWebServer: jest.Mocked<WebServer>;

    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();

        // Create mock instances
        mockConfigManager = new MockedConfigurationManager() as jest.Mocked<ConfigurationManager>;
        mockActivityLogger = new MockedActivityLogger() as jest.Mocked<ActivityLogger>;

        // Mock configuration manager methods
        mockConfigManager.getSystemSettings.mockReturnValue({
            enabled: false,
            pauseWhenActive: true,
            businessHours: { start: '09:00', end: '17:00', days: [1, 2, 3, 4, 5] },
            rateLimitMinutes: 30,
            blacklistedContacts: []
        });

        mockConfigManager.getWebServerConfig.mockReturnValue({
            port: 3000,
            host: 'localhost'
        });

        // Mock activity logger methods
        mockActivityLogger.logActivity.mockResolvedValue();
        mockActivityLogger.getRecentActivity.mockResolvedValue([]);

        // Create app instance
        app = new WhatsAppAutoReplyApp(mockConfigManager, mockActivityLogger);

        // Get mocked instances from the app
        mockWhatsAppClient = (app as any).whatsappClient;
        mockReplyEngine = (app as any).replyEngine;
        mockWebServer = (app as any).webServer;

        // Mock WhatsApp client methods
        mockWhatsAppClient.initialize.mockResolvedValue();
        mockWhatsAppClient.disconnect.mockResolvedValue();
        mockWhatsAppClient.isReady.mockReturnValue(false);
        mockWhatsAppClient.onQRCode.mockImplementation(() => {});
        mockWhatsAppClient.onReady.mockImplementation(() => {});
        mockWhatsAppClient.onDisconnected.mockImplementation(() => {});
        mockWhatsAppClient.onAuthFailure.mockImplementation(() => {});
        mockWhatsAppClient.onMessage.mockImplementation(() => {});

        // Mock reply engine methods
        mockReplyEngine.start.mockResolvedValue();
        mockReplyEngine.stop.mockResolvedValue();
        mockReplyEngine.isRunning.mockReturnValue(false);

        // Mock web server methods
        mockWebServer.start.mockResolvedValue();
        mockWebServer.stop.mockResolvedValue();
        mockWebServer.isRunning.mockReturnValue(false);
        mockWebServer.broadcastQRCode.mockImplementation(() => {});
        mockWebServer.broadcastStatus.mockImplementation(() => {});
        mockWebServer.broadcastActivity.mockImplementation(() => {});
        mockWebServer.broadcastStatistics.mockImplementation(() => {});
        mockWebServer.broadcastSettings.mockImplementation(() => {});
    });

    describe('initialize', () => {
        it('should initialize all components successfully', async () => {
            await app.initialize();

            expect(mockWhatsAppClient.initialize).toHaveBeenCalled();
            expect(mockWebServer.start).toHaveBeenCalledWith(3000, 'localhost');
            expect(mockWhatsAppClient.onMessage).toHaveBeenCalled();
            expect(mockWhatsAppClient.onQRCode).toHaveBeenCalled();
            expect(mockWhatsAppClient.onReady).toHaveBeenCalled();
            expect(mockWhatsAppClient.onDisconnected).toHaveBeenCalled();
            expect(mockWhatsAppClient.onAuthFailure).toHaveBeenCalled();
        });

        it('should start reply engine if system is enabled', async () => {
            mockConfigManager.getSystemSettings.mockReturnValue({
                enabled: true,
                pauseWhenActive: true,
                businessHours: { start: '09:00', end: '17:00', days: [1, 2, 3, 4, 5] },
                rateLimitMinutes: 30,
                blacklistedContacts: []
            });

            await app.initialize();

            expect(mockReplyEngine.start).toHaveBeenCalled();
        });

        it('should not start reply engine if system is disabled', async () => {
            mockConfigManager.getSystemSettings.mockReturnValue({
                enabled: false,
                pauseWhenActive: true,
                businessHours: { start: '09:00', end: '17:00', days: [1, 2, 3, 4, 5] },
                rateLimitMinutes: 30,
                blacklistedContacts: []
            });

            await app.initialize();

            expect(mockReplyEngine.start).not.toHaveBeenCalled();
        });

        it('should handle initialization errors', async () => {
            mockWhatsAppClient.initialize.mockRejectedValue(new Error('WhatsApp init failed'));

            await expect(app.initialize()).rejects.toThrow('WhatsApp init failed');
        });
    });

    describe('shutdown', () => {
        beforeEach(async () => {
            await app.initialize();
        });

        it('should shutdown all components gracefully', async () => {
            await app.shutdown();

            expect(mockReplyEngine.stop).toHaveBeenCalled();
            expect(mockWhatsAppClient.disconnect).toHaveBeenCalled();
            expect(mockWebServer.stop).toHaveBeenCalled();
            expect(mockActivityLogger.logActivity).toHaveBeenCalledWith({
                type: 'system_event',
                chatId: 'system',
                messageContent: 'WhatsApp Auto-Reply System shutdown'
            });
        });

        it('should handle shutdown errors gracefully', async () => {
            mockReplyEngine.stop.mockRejectedValue(new Error('Stop failed'));

            // Should not throw, but handle error gracefully
            await expect(app.shutdown()).resolves.toBeUndefined();
        });

        it('should not shutdown twice', async () => {
            await app.shutdown();
            await app.shutdown(); // Second call

            // Should only call stop methods once
            expect(mockReplyEngine.stop).toHaveBeenCalledTimes(1);
            expect(mockWhatsAppClient.disconnect).toHaveBeenCalledTimes(1);
            expect(mockWebServer.stop).toHaveBeenCalledTimes(1);
        });
    });

    describe('startReplyEngine', () => {
        beforeEach(async () => {
            await app.initialize();
        });

        it('should start reply engine successfully', async () => {
            await app.startReplyEngine();

            expect(mockReplyEngine.start).toHaveBeenCalled();
            expect(mockActivityLogger.logActivity).toHaveBeenCalledWith({
                type: 'system_event',
                chatId: 'system',
                messageContent: 'Auto-reply engine started'
            });
        });

        it('should handle start errors', async () => {
            mockReplyEngine.start.mockRejectedValue(new Error('Start failed'));

            await expect(app.startReplyEngine()).rejects.toThrow('Start failed');
        });

        it('should throw error if app not initialized', async () => {
            const uninitializedApp = new WhatsAppAutoReplyApp(mockConfigManager, mockActivityLogger);

            await expect(uninitializedApp.startReplyEngine()).rejects.toThrow('Application not initialized');
        });
    });

    describe('stopReplyEngine', () => {
        beforeEach(async () => {
            await app.initialize();
        });

        it('should stop reply engine successfully', async () => {
            await app.stopReplyEngine();

            expect(mockReplyEngine.stop).toHaveBeenCalled();
            expect(mockActivityLogger.logActivity).toHaveBeenCalledWith({
                type: 'system_event',
                chatId: 'system',
                messageContent: 'Auto-reply engine stopped'
            });
        });

        it('should handle stop errors', async () => {
            mockReplyEngine.stop.mockRejectedValue(new Error('Stop failed'));

            await expect(app.stopReplyEngine()).rejects.toThrow('Stop failed');
        });
    });

    describe('getStatus', () => {
        beforeEach(async () => {
            await app.initialize();
        });

        it('should return current application status', () => {
            mockWhatsAppClient.isReady.mockReturnValue(true);
            mockReplyEngine.isRunning.mockReturnValue(true);
            mockWebServer.isRunning.mockReturnValue(true);

            const status = app.getStatus();

            expect(status).toEqual({
                whatsapp: 'Connected',
                engine: 'Running',
                webServer: 'Running',
                uptime: expect.any(Number)
            });
        });

        it('should return disconnected status when components are not ready', () => {
            mockWhatsAppClient.isReady.mockReturnValue(false);
            mockReplyEngine.isRunning.mockReturnValue(false);
            mockWebServer.isRunning.mockReturnValue(false);

            const status = app.getStatus();

            expect(status).toEqual({
                whatsapp: 'Disconnected',
                engine: 'Stopped',
                webServer: 'Stopped',
                uptime: expect.any(Number)
            });
        });
    });

    describe('getStatistics', () => {
        beforeEach(async () => {
            await app.initialize();
        });

        it('should return application statistics', async () => {
            const mockLogs = [
                { type: 'message_received', chatId: 'chat1', timestamp: new Date() },
                { type: 'reply_sent', chatId: 'chat1', timestamp: new Date() },
                { type: 'rate_limit_hit', chatId: 'chat2', timestamp: new Date() },
                { type: 'message_received', chatId: 'chat2', timestamp: new Date() }
            ];

            mockActivityLogger.getRecentActivity.mockResolvedValue(mockLogs as any);

            const stats = await app.getStatistics();

            expect(stats).toEqual({
                messagesReceived: 2,
                repliesSent: 1,
                rateLimits: 1,
                uptime: expect.any(Number)
            });
        });

        it('should handle empty activity log', async () => {
            mockActivityLogger.getRecentActivity.mockResolvedValue([]);

            const stats = await app.getStatistics();

            expect(stats).toEqual({
                messagesReceived: 0,
                repliesSent: 0,
                rateLimits: 0,
                uptime: expect.any(Number)
            });
        });
    });

    describe('healthCheck', () => {
        beforeEach(async () => {
            await app.initialize();
        });

        it('should return healthy status when all components are ready', async () => {
            mockWhatsAppClient.isReady.mockReturnValue(true);
            mockWebServer.isRunning.mockReturnValue(true);

            const health = await app.healthCheck();

            expect(health.status).toBe('healthy');
            expect(health.checks.whatsappConnected).toBe(true);
            expect(health.checks.webServerRunning).toBe(true);
            expect(health.checks.configurationLoaded).toBe(true);
            expect(health.checks.activityLoggerReady).toBe(true);
            expect(health.timestamp).toBeInstanceOf(Date);
        });

        it('should return unhealthy status when components are not ready', async () => {
            mockWhatsAppClient.isReady.mockReturnValue(false);
            mockWebServer.isRunning.mockReturnValue(false);

            const health = await app.healthCheck();

            expect(health.status).toBe('unhealthy');
            expect(health.checks.whatsappConnected).toBe(false);
            expect(health.checks.webServerRunning).toBe(false);
        });
    });

    describe('message handling', () => {
        beforeEach(async () => {
            await app.initialize();
        });

        it('should handle incoming messages correctly', async () => {
            // Get the message handler that was registered
            const messageHandler = mockWhatsAppClient.onMessage.mock.calls[0][0];

            const testMessage = {
                id: 'msg1',
                chatId: 'chat1',
                from: 'user1',
                body: 'Hello',
                timestamp: new Date(),
                isGroup: false,
                contactName: 'John Doe'
            };

            await messageHandler(testMessage);

            expect(mockActivityLogger.logActivity).toHaveBeenCalledWith({
                type: 'message_received',
                chatId: 'chat1',
                contactName: 'John Doe',
                messageContent: 'Hello'
            });

            expect(mockWebServer.broadcastActivity).toHaveBeenCalledWith({
                type: 'message_received',
                chatId: 'chat1',
                contactName: 'John Doe',
                messageContent: 'Hello',
                timestamp: expect.any(Date)
            });
        });

        it('should handle message processing errors', async () => {
            const messageHandler = mockWhatsAppClient.onMessage.mock.calls[0][0];
            mockActivityLogger.logActivity.mockRejectedValueOnce(new Error('Log failed'));

            const testMessage = {
                id: 'msg1',
                chatId: 'chat1',
                from: 'user1',
                body: 'Hello',
                timestamp: new Date(),
                isGroup: false
            };

            // Should not throw, but handle error gracefully
            await expect(messageHandler(testMessage)).resolves.toBeUndefined();

            // Should log the error
            expect(mockActivityLogger.logActivity).toHaveBeenCalledWith({
                type: 'error',
                chatId: 'chat1',
                error: expect.stringContaining('Failed to handle incoming message')
            });
        });
    });
});