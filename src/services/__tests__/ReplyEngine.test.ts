import { ReplyEngine } from '../ReplyEngine';
import { WhatsAppClient } from '../WhatsAppClient';
import { ConfigurationManager } from '../ConfigurationManager';
import { ActivityLogger } from '../ActivityLogger';
import { RateLimiter } from '../RateLimiter';
import { MessageProcessor } from '../MessageProcessor';
import { Message } from '../../models/Message';
import { SystemSettings } from '../../models/SystemSettings';
import { MessageTemplate } from '../../models/MessageTemplate';

// Mock all dependencies
jest.mock('../WhatsAppClient');
jest.mock('../ConfigurationManager');
jest.mock('../ActivityLogger');
jest.mock('../RateLimiter');
jest.mock('../MessageProcessor');

describe('ReplyEngine', () => {
  let replyEngine: ReplyEngine;
  let mockWhatsAppClient: jest.Mocked<WhatsAppClient>;
  let mockConfigManager: jest.Mocked<ConfigurationManager>;
  let mockActivityLogger: jest.Mocked<ActivityLogger>;
  let mockRateLimiter: jest.Mocked<RateLimiter>;
  let mockMessageProcessor: jest.Mocked<MessageProcessor>;

  beforeEach(() => {
    // Create mocked instances
    mockWhatsAppClient = {
      sendMessage: jest.fn(),
      getContactName: jest.fn(),
      on: jest.fn(),
      emit: jest.fn()
    } as any;

    mockConfigManager = {
      getSystemSettings: jest.fn(),
      getMessageTemplates: jest.fn(),
      isBlacklisted: jest.fn()
    } as any;

    mockActivityLogger = {
      logMessageReceived: jest.fn(),
      logReplySent: jest.fn(),
      logError: jest.fn(),
      logSystemEvent: jest.fn(),
      logRateLimitHit: jest.fn()
    } as any;

    mockRateLimiter = {
      canSendReply: jest.fn(),
      recordReply: jest.fn(),
      getTimeUntilNextReply: jest.fn(),
      updateConfiguration: jest.fn(),
      getOverallStats: jest.fn()
    } as any;

    mockMessageProcessor = {
      processIncomingMessage: jest.fn(),
      updateConfiguration: jest.fn()
    } as any;

    // Set up default mock returns
    mockConfigManager.getSystemSettings.mockReturnValue({
      enabled: true,
      pauseWhenActive: false,
      rateLimitMinutes: 30,
      blacklistedContacts: [],
      businessHours: { start: '09:00', end: '17:00', days: [1, 2, 3, 4, 5] }
    } as SystemSettings);

    mockConfigManager.getMessageTemplates.mockReturnValue([{
      id: 'default',
      name: 'Default',
      content: 'Thanks for your message!',
      isDefault: true,
      placeholders: []
    }] as MessageTemplate[]);

    mockConfigManager.isBlacklisted.mockReturnValue(false);
    mockWhatsAppClient.getContactName.mockReturnValue('John Doe');
    mockRateLimiter.canSendReply.mockReturnValue(true);
    mockRateLimiter.getOverallStats.mockReturnValue({
      totalChatsTracked: 0,
      totalRepliesSent: 0,
      activeRateLimits: 0,
      rateLimitMinutes: 30,
      maxRepliesPerPeriod: 1
    });

    // Create reply engine instance
    replyEngine = new ReplyEngine({
      whatsappClient: mockWhatsAppClient,
      configurationManager: mockConfigManager,
      activityLogger: mockActivityLogger,
      rateLimiter: mockRateLimiter,
      messageProcessor: mockMessageProcessor
    });
  });

  afterEach(() => {
    replyEngine.destroy();
  });

  describe('start and stop', () => {
    it('should start the reply engine', () => {
      expect(replyEngine.isEngineActive()).toBe(false);
      
      replyEngine.start();
      
      expect(replyEngine.isEngineActive()).toBe(true);
      expect(mockActivityLogger.logSystemEvent).toHaveBeenCalledWith('reply_engine_started');
    });

    it('should stop the reply engine', () => {
      replyEngine.start();
      expect(replyEngine.isEngineActive()).toBe(true);
      
      replyEngine.stop();
      
      expect(replyEngine.isEngineActive()).toBe(false);
      expect(mockActivityLogger.logSystemEvent).toHaveBeenCalledWith('reply_engine_stopped');
    });

    it('should not start if already active', () => {
      replyEngine.start();
      const firstCallCount = mockActivityLogger.logSystemEvent.mock.calls.length;
      
      replyEngine.start(); // Try to start again
      
      expect(mockActivityLogger.logSystemEvent).toHaveBeenCalledTimes(firstCallCount);
    });
  });

  describe('processMessage', () => {
    const createTestMessage = (overrides: Partial<Message> = {}): Message => ({
      id: 'msg-1',
      chatId: 'chat-1',
      from: 'contact@c.us',
      body: 'Hello',
      timestamp: new Date(),
      isGroup: false,
      contactName: 'John Doe',
      ...overrides
    });

    beforeEach(() => {
      replyEngine.start();
    });

    it('should process message and send reply when conditions are met', async () => {
      const message = createTestMessage();
      
      mockMessageProcessor.processIncomingMessage.mockResolvedValue({
        shouldReply: true,
        replyContent: 'Thanks for your message!',
        template: { id: 'default' } as any
      });

      mockWhatsAppClient.sendMessage.mockResolvedValue();

      await replyEngine.processMessage(message);

      expect(mockActivityLogger.logMessageReceived).toHaveBeenCalledWith(
        'chat-1',
        'John Doe',
        'Hello'
      );
      expect(mockWhatsAppClient.sendMessage).toHaveBeenCalledWith(
        'chat-1',
        'Thanks for your message!'
      );
      expect(mockRateLimiter.recordReply).toHaveBeenCalledWith('chat-1');
      expect(mockActivityLogger.logReplySent).toHaveBeenCalledWith(
        'chat-1',
        'John Doe',
        'Thanks for your message!',
        'default'
      );
    });

    it('should not process message when engine is inactive', async () => {
      replyEngine.stop();
      
      const message = createTestMessage();
      
      await replyEngine.processMessage(message);

      expect(mockMessageProcessor.processIncomingMessage).not.toHaveBeenCalled();
      expect(mockWhatsAppClient.sendMessage).not.toHaveBeenCalled();
    });

    it('should not send reply when message processor says no', async () => {
      const message = createTestMessage();
      
      mockMessageProcessor.processIncomingMessage.mockResolvedValue({
        shouldReply: false,
        reason: 'Blacklisted contact'
      });

      await replyEngine.processMessage(message);

      expect(mockWhatsAppClient.sendMessage).not.toHaveBeenCalled();
      expect(mockActivityLogger.logMessageReceived).toHaveBeenCalled();
    });

    it('should not send reply when rate limited', async () => {
      const message = createTestMessage();
      
      mockMessageProcessor.processIncomingMessage.mockResolvedValue({
        shouldReply: true,
        replyContent: 'Thanks for your message!'
      });

      mockRateLimiter.canSendReply.mockReturnValue(false);
      mockRateLimiter.getTimeUntilNextReply.mockReturnValue(30000);

      await replyEngine.processMessage(message);

      expect(mockWhatsAppClient.sendMessage).not.toHaveBeenCalled();
      expect(mockActivityLogger.logRateLimitHit).toHaveBeenCalledWith(
        'chat-1',
        'John Doe',
        30000
      );
    });

    it('should handle message processing errors', async () => {
      const message = createTestMessage();
      const error = new Error('Processing failed');
      
      mockMessageProcessor.processIncomingMessage.mockRejectedValue(error);

      await replyEngine.processMessage(message);

      expect(mockActivityLogger.logError).toHaveBeenCalledWith(
        'chat-1',
        'Message processing error: Error: Processing failed',
        expect.any(Object)
      );
    });

    it('should handle reply sending errors with retry', async () => {
      const message = createTestMessage();
      
      mockMessageProcessor.processIncomingMessage.mockResolvedValue({
        shouldReply: true,
        replyContent: 'Thanks for your message!'
      });

      mockWhatsAppClient.sendMessage.mockRejectedValue(new Error('Send failed'));

      await replyEngine.processMessage(message);

      expect(mockWhatsAppClient.sendMessage).toHaveBeenCalled();
      expect(mockActivityLogger.logReplySent).not.toHaveBeenCalled();
      
      // Should schedule a retry
      expect(setTimeout).toHaveBeenCalled();
    });
  });

  describe('updateConfiguration', () => {
    it('should update all components with new configuration', async () => {
      await replyEngine.updateConfiguration();

      expect(mockMessageProcessor.updateConfiguration).toHaveBeenCalledWith({
        systemSettings: expect.any(Object),
        messageTemplates: expect.any(Array),
        isBlacklisted: expect.any(Function),
        getContactName: expect.any(Function)
      });

      expect(mockRateLimiter.updateConfiguration).toHaveBeenCalledWith({
        rateLimitMinutes: 30
      });

      expect(mockActivityLogger.logSystemEvent).toHaveBeenCalledWith('configuration_updated');
    });

    it('should handle configuration update errors', async () => {
      const error = new Error('Config update failed');
      mockMessageProcessor.updateConfiguration.mockImplementation(() => {
        throw error;
      });

      await replyEngine.updateConfiguration();

      expect(mockActivityLogger.logError).toHaveBeenCalledWith(
        'system',
        'Configuration update failed: Error: Config update failed',
        expect.any(Object)
      );
    });
  });

  describe('forceSendReply', () => {
    it('should send reply bypassing all checks', async () => {
      mockWhatsAppClient.sendMessage.mockResolvedValue();

      await replyEngine.forceSendReply('chat-1', 'Manual message');

      expect(mockWhatsAppClient.sendMessage).toHaveBeenCalledWith('chat-1', 'Manual message');
      expect(mockActivityLogger.logReplySent).toHaveBeenCalledWith(
        'chat-1',
        'John Doe',
        'Manual message',
        'manual'
      );
    });

    it('should handle force send errors', async () => {
      const error = new Error('Send failed');
      mockWhatsAppClient.sendMessage.mockRejectedValue(error);

      await expect(replyEngine.forceSendReply('chat-1', 'Manual message'))
        .rejects.toThrow('Send failed');

      expect(mockActivityLogger.logError).toHaveBeenCalledWith(
        'chat-1',
        'Manual reply failed: Error: Send failed',
        expect.any(Object)
      );
    });
  });

  describe('getStatistics', () => {
    it('should return engine statistics', () => {
      replyEngine.start();
      
      const stats = replyEngine.getStatistics();

      expect(stats.isActive).toBe(true);
      expect(stats.pendingRetries).toBe(0);
      expect(stats.rateLimiterStats).toEqual(expect.any(Object));
    });
  });

  describe('clearRetryAttempts', () => {
    it('should clear retry attempts for specific chat', () => {
      // Add some mock retry attempts
      (replyEngine as any).retryAttempts.set('chat-1-123', 1);
      (replyEngine as any).retryAttempts.set('chat-2-456', 1);

      replyEngine.clearRetryAttempts('chat-1');

      const retryAttempts = (replyEngine as any).retryAttempts;
      expect(retryAttempts.has('chat-1-123')).toBe(false);
      expect(retryAttempts.has('chat-2-456')).toBe(true);
    });

    it('should clear all retry attempts when no chat specified', () => {
      (replyEngine as any).retryAttempts.set('chat-1-123', 1);
      (replyEngine as any).retryAttempts.set('chat-2-456', 1);

      replyEngine.clearRetryAttempts();

      const retryAttempts = (replyEngine as any).retryAttempts;
      expect(retryAttempts.size).toBe(0);
    });
  });

  describe('event handling', () => {
    it('should emit reply-sent event when reply is successful', async () => {
      const message = createTestMessage();
      const replyHandler = jest.fn();
      
      replyEngine.on('reply-sent', replyHandler);
      replyEngine.start();

      mockMessageProcessor.processIncomingMessage.mockResolvedValue({
        shouldReply: true,
        replyContent: 'Thanks!',
        template: { id: 'default' } as any
      });

      mockWhatsAppClient.sendMessage.mockResolvedValue();

      await replyEngine.processMessage(message);

      expect(replyHandler).toHaveBeenCalledWith('chat-1', 'Thanks!', 'default');
    });

    it('should emit reply-blocked event when reply is blocked', async () => {
      const message = createTestMessage();
      const blockedHandler = jest.fn();
      
      replyEngine.on('reply-blocked', blockedHandler);
      replyEngine.start();

      mockMessageProcessor.processIncomingMessage.mockResolvedValue({
        shouldReply: false,
        reason: 'Rate limited'
      });

      await replyEngine.processMessage(message);

      expect(blockedHandler).toHaveBeenCalledWith('chat-1', 'Rate limited');
    });

    it('should emit error event when errors occur', async () => {
      const message = createTestMessage();
      const errorHandler = jest.fn();
      const error = new Error('Test error');
      
      replyEngine.on('error', errorHandler);
      replyEngine.start();

      mockMessageProcessor.processIncomingMessage.mockRejectedValue(error);

      await replyEngine.processMessage(message);

      expect(errorHandler).toHaveBeenCalledWith(error, { message });
    });
  });

  const createTestMessage = (overrides: Partial<Message> = {}): Message => ({
    id: 'msg-1',
    chatId: 'chat-1',
    from: 'contact@c.us',
    body: 'Hello',
    timestamp: new Date(),
    isGroup: false,
    contactName: 'John Doe',
    ...overrides
  });
});