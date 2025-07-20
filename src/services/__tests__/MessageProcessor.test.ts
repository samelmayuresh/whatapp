import { MessageProcessor } from '../MessageProcessor';
import { Message } from '../../models/Message';
import { MessageTemplate } from '../../models/MessageTemplate';
import { SystemSettings } from '../../models/SystemSettings';

describe('MessageProcessor', () => {
  let processor: MessageProcessor;
  let mockSystemSettings: SystemSettings;
  let mockMessageTemplates: MessageTemplate[];
  let mockIsBlacklisted: jest.Mock;
  let mockGetContactName: jest.Mock;

  beforeEach(() => {
    mockSystemSettings = {
      enabled: true,
      pauseWhenActive: false,
      businessHours: {
        start: '09:00',
        end: '17:00',
        days: [1, 2, 3, 4, 5] // Monday to Friday
      },
      rateLimitMinutes: 30,
      blacklistedContacts: []
    };

    mockMessageTemplates = [
      {
        id: 'default',
        name: 'Default Template',
        content: 'Hi {name}! Thanks for your message.',
        isDefault: true,
        placeholders: ['{name}']
      },
      {
        id: 'out-of-office',
        name: 'Out of Office',
        content: 'I\'m currently out of office. I\'ll respond when I return.',
        isDefault: false,
        placeholders: [],
        timeBasedRules: [{
          startTime: '18:00',
          endTime: '09:00',
          days: [1, 2, 3, 4, 5, 6, 7]
        }]
      }
    ];

    mockIsBlacklisted = jest.fn().mockReturnValue(false);
    mockGetContactName = jest.fn().mockReturnValue('John Doe');

    processor = new MessageProcessor({
      systemSettings: mockSystemSettings,
      messageTemplates: mockMessageTemplates,
      isBlacklisted: mockIsBlacklisted,
      getContactName: mockGetContactName
    });
  });

  describe('shouldReply', () => {
    const createTestMessage = (overrides: Partial<Message> = {}): Message => ({
      id: 'msg-1',
      chatId: 'chat-1',
      from: 'contact@c.us',
      body: 'Hello',
      timestamp: new Date(),
      isGroup: false,
      ...overrides
    });

    it('should return true for valid message', () => {
      const message = createTestMessage();
      expect(processor.shouldReply(message)).toBe(true);
    });

    it('should return false when system is disabled', () => {
      mockSystemSettings.enabled = false;
      processor.updateConfiguration({ systemSettings: mockSystemSettings });

      const message = createTestMessage();
      expect(processor.shouldReply(message)).toBe(false);
    });

    it('should return false for group messages', () => {
      const message = createTestMessage({ isGroup: true });
      expect(processor.shouldReply(message)).toBe(false);
    });

    it('should return false for blacklisted contacts', () => {
      mockIsBlacklisted.mockReturnValue(true);

      const message = createTestMessage();
      expect(processor.shouldReply(message)).toBe(false);
    });

    it('should return false for empty messages', () => {
      const message = createTestMessage({ body: '' });
      expect(processor.shouldReply(message)).toBe(false);

      const message2 = createTestMessage({ body: '   ' });
      expect(processor.shouldReply(message2)).toBe(false);
    });
  });

  describe('generateReply', () => {
    const createTestMessage = (): Message => ({
      id: 'msg-1',
      chatId: 'chat-1',
      from: 'contact@c.us',
      body: 'Hello there',
      timestamp: new Date(),
      isGroup: false
    });

    it('should generate reply with placeholders replaced', () => {
      const message = createTestMessage();
      const reply = processor.generateReply(message);

      expect(reply).toBe('Hi John Doe! Thanks for your message.');
      expect(mockGetContactName).toHaveBeenCalledWith('contact@c.us');
    });

    it('should use fallback name when contact name not available', () => {
      mockGetContactName.mockReturnValue('');
      
      const message = createTestMessage();
      const reply = processor.generateReply(message);

      expect(reply).toBe('Hi there! Thanks for your message.');
    });

    it('should throw error when no templates available', () => {
      processor.updateConfiguration({ messageTemplates: [] });

      const message = createTestMessage();
      expect(() => processor.generateReply(message)).toThrow('No message template available');
    });

    it('should replace multiple placeholders', () => {
      const templateWithMultiplePlaceholders: MessageTemplate = {
        id: 'multi',
        name: 'Multi Placeholder',
        content: 'Hi {name}! Today is {day}. Your message: {message}',
        isDefault: true,
        placeholders: ['{name}', '{day}', '{message}']
      };

      processor.updateConfiguration({ 
        messageTemplates: [templateWithMultiplePlaceholders] 
      });

      const message = createTestMessage();
      const reply = processor.generateReply(message);

      expect(reply).toContain('Hi John Doe!');
      expect(reply).toContain('Today is');
      expect(reply).toContain('Your message: Hello there');
    });
  });

  describe('processIncomingMessage', () => {
    const createTestMessage = (overrides: Partial<Message> = {}): Message => ({
      id: 'msg-1',
      chatId: 'chat-1',
      from: 'contact@c.us',
      body: 'Hello',
      timestamp: new Date(),
      isGroup: false,
      ...overrides
    });

    it('should process valid message and return reply', async () => {
      const message = createTestMessage();
      const result = await processor.processIncomingMessage(message);

      expect(result.shouldReply).toBe(true);
      expect(result.replyContent).toBe('Hi John Doe! Thanks for your message.');
      expect(result.template).toBeDefined();
      expect(result.template!.id).toBe('default');
    });

    it('should return no reply for invalid message', async () => {
      const message = createTestMessage({ isGroup: true });
      const result = await processor.processIncomingMessage(message);

      expect(result.shouldReply).toBe(false);
      expect(result.reason).toBe('Group messages are ignored');
      expect(result.replyContent).toBeUndefined();
    });

    it('should handle processing errors gracefully', async () => {
      mockGetContactName.mockImplementation(() => {
        throw new Error('Contact lookup failed');
      });

      const message = createTestMessage();
      const result = await processor.processIncomingMessage(message);

      expect(result.shouldReply).toBe(false);
      expect(result.reason).toContain('Processing error');
    });
  });

  describe('template selection', () => {
    beforeEach(() => {
      // Mock current time to be during business hours (10:00 AM)
      jest.spyOn(Date.prototype, 'toTimeString').mockReturnValue('10:00:00 GMT+0000 (UTC)');
      jest.spyOn(Date.prototype, 'getDay').mockReturnValue(2); // Tuesday
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should select default template during business hours', () => {
      const message: Message = {
        id: 'msg-1',
        chatId: 'chat-1',
        from: 'contact@c.us',
        body: 'Hello',
        timestamp: new Date(),
        isGroup: false
      };

      const reply = processor.generateReply(message);
      expect(reply).toBe('Hi John Doe! Thanks for your message.');
    });

    it('should select time-based template outside business hours', () => {
      // Mock current time to be outside business hours (8:00 PM)
      jest.spyOn(Date.prototype, 'toTimeString').mockReturnValue('20:00:00 GMT+0000 (UTC)');

      const message: Message = {
        id: 'msg-1',
        chatId: 'chat-1',
        from: 'contact@c.us',
        body: 'Hello',
        timestamp: new Date(),
        isGroup: false
      };

      const reply = processor.generateReply(message);
      expect(reply).toBe('I\'m currently out of office. I\'ll respond when I return.');
    });
  });

  describe('business hours checking', () => {
    const createTestMessage = (): Message => ({
      id: 'msg-1',
      chatId: 'chat-1',
      from: 'contact@c.us',
      body: 'Hello',
      timestamp: new Date(),
      isGroup: false
    });

    it('should allow replies during business hours', () => {
      // Mock Tuesday 10:00 AM
      jest.spyOn(Date.prototype, 'toTimeString').mockReturnValue('10:00:00 GMT+0000 (UTC)');
      jest.spyOn(Date.prototype, 'getDay').mockReturnValue(2);

      const message = createTestMessage();
      expect(processor.shouldReply(message)).toBe(true);
    });

    it('should block replies outside business hours', () => {
      // Mock Tuesday 8:00 PM
      jest.spyOn(Date.prototype, 'toTimeString').mockReturnValue('20:00:00 GMT+0000 (UTC)');
      jest.spyOn(Date.prototype, 'getDay').mockReturnValue(2);

      const message = createTestMessage();
      expect(processor.shouldReply(message)).toBe(false);
    });

    it('should block replies on weekends', () => {
      // Mock Saturday 10:00 AM
      jest.spyOn(Date.prototype, 'toTimeString').mockReturnValue('10:00:00 GMT+0000 (UTC)');
      jest.spyOn(Date.prototype, 'getDay').mockReturnValue(6);

      const message = createTestMessage();
      expect(processor.shouldReply(message)).toBe(false);
    });

    it('should allow replies when no business hours configured', () => {
      const settingsWithoutBusinessHours = {
        ...mockSystemSettings,
        businessHours: undefined as any
      };

      processor.updateConfiguration({ 
        systemSettings: settingsWithoutBusinessHours 
      });

      // Mock Saturday 8:00 PM (outside normal business hours)
      jest.spyOn(Date.prototype, 'toTimeString').mockReturnValue('20:00:00 GMT+0000 (UTC)');
      jest.spyOn(Date.prototype, 'getDay').mockReturnValue(6);

      const message = createTestMessage();
      expect(processor.shouldReply(message)).toBe(true);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });
  });

  describe('updateConfiguration', () => {
    it('should update system settings', () => {
      const newSettings: SystemSettings = {
        ...mockSystemSettings,
        enabled: false
      };

      processor.updateConfiguration({ systemSettings: newSettings });

      const message: Message = {
        id: 'msg-1',
        chatId: 'chat-1',
        from: 'contact@c.us',
        body: 'Hello',
        timestamp: new Date(),
        isGroup: false
      };

      expect(processor.shouldReply(message)).toBe(false);
    });

    it('should update message templates', () => {
      const newTemplates: MessageTemplate[] = [{
        id: 'new',
        name: 'New Template',
        content: 'New message content',
        isDefault: true,
        placeholders: []
      }];

      processor.updateConfiguration({ messageTemplates: newTemplates });

      const message: Message = {
        id: 'msg-1',
        chatId: 'chat-1',
        from: 'contact@c.us',
        body: 'Hello',
        timestamp: new Date(),
        isGroup: false
      };

      const reply = processor.generateReply(message);
      expect(reply).toBe('New message content');
    });
  });
});