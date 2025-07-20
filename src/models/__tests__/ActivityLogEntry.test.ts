import { 
  ActivityLogEntry, 
  ActivityLogType, 
  validateActivityLogEntry, 
  createActivityLogEntry,
  serializeActivityLogEntry,
  deserializeActivityLogEntry
} from '../ActivityLogEntry';

describe('ActivityLogEntry', () => {
  describe('validateActivityLogEntry', () => {
    it('should validate a valid activity log entry', () => {
      const entry: ActivityLogEntry = {
        timestamp: new Date(),
        type: 'message_received',
        chatId: 'chat-123',
        contactName: 'John Doe',
        messageContent: 'Hello!'
      };

      expect(validateActivityLogEntry(entry)).toBe(true);
    });

    it('should validate entry with string timestamp', () => {
      const entry = {
        timestamp: '2023-10-01T10:00:00.000Z',
        type: 'reply_sent' as ActivityLogType,
        chatId: 'chat-123',
        replyContent: 'Auto reply message'
      };

      expect(validateActivityLogEntry(entry)).toBe(true);
    });

    it('should reject entry with invalid type', () => {
      const entry = {
        timestamp: new Date(),
        type: 'invalid_type',
        chatId: 'chat-123'
      };

      expect(validateActivityLogEntry(entry)).toBe(false);
    });

    it('should reject entry with missing required fields', () => {
      const entry = {
        timestamp: new Date(),
        type: 'error'
        // missing chatId
      };

      expect(validateActivityLogEntry(entry)).toBe(false);
    });

    it('should validate entry with metadata', () => {
      const entry: ActivityLogEntry = {
        timestamp: new Date(),
        type: 'system_event',
        chatId: 'system',
        metadata: {
          event: 'startup',
          version: '1.0.0'
        }
      };

      expect(validateActivityLogEntry(entry)).toBe(true);
    });
  });

  describe('createActivityLogEntry', () => {
    it('should create entry with current timestamp', () => {
      const before = Date.now();
      const entry = createActivityLogEntry('message_received', 'chat-123');
      const after = Date.now();

      expect(entry.timestamp.getTime()).toBeGreaterThanOrEqual(before);
      expect(entry.timestamp.getTime()).toBeLessThanOrEqual(after);
      expect(entry.type).toBe('message_received');
      expect(entry.chatId).toBe('chat-123');
    });

    it('should create entry with optional fields', () => {
      const entry = createActivityLogEntry('reply_sent', 'chat-123', {
        contactName: 'John Doe',
        replyContent: 'Thanks for your message!',
        metadata: { templateId: 'default' }
      });

      expect(entry.contactName).toBe('John Doe');
      expect(entry.replyContent).toBe('Thanks for your message!');
      expect(entry.metadata).toEqual({ templateId: 'default' });
    });
  });

  describe('serializeActivityLogEntry', () => {
    it('should serialize entry to JSON string', () => {
      const entry: ActivityLogEntry = {
        timestamp: new Date('2023-10-01T10:00:00.000Z'),
        type: 'message_received',
        chatId: 'chat-123',
        contactName: 'John Doe'
      };

      const serialized = serializeActivityLogEntry(entry);
      const parsed = JSON.parse(serialized);

      expect(parsed.timestamp).toBe('2023-10-01T10:00:00.000Z');
      expect(parsed.type).toBe('message_received');
      expect(parsed.chatId).toBe('chat-123');
      expect(parsed.contactName).toBe('John Doe');
    });
  });

  describe('deserializeActivityLogEntry', () => {
    it('should deserialize JSON string to entry with Date object', () => {
      const jsonString = JSON.stringify({
        timestamp: '2023-10-01T10:00:00.000Z',
        type: 'reply_sent',
        chatId: 'chat-123',
        replyContent: 'Auto reply'
      });

      const entry = deserializeActivityLogEntry(jsonString);

      expect(entry.timestamp).toBeInstanceOf(Date);
      expect(entry.timestamp.toISOString()).toBe('2023-10-01T10:00:00.000Z');
      expect(entry.type).toBe('reply_sent');
      expect(entry.chatId).toBe('chat-123');
      expect(entry.replyContent).toBe('Auto reply');
    });
  });
});