import { RateLimiter, RateLimitEntry } from '../RateLimiter';

describe('RateLimiter', () => {
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    rateLimiter = new RateLimiter({
      rateLimitMinutes: 30,
      maxRepliesPerPeriod: 1,
      cleanupIntervalMinutes: 60
    });
  });

  afterEach(() => {
    rateLimiter.destroy();
  });

  describe('canSendReply', () => {
    it('should allow first reply to a chat', () => {
      expect(rateLimiter.canSendReply('chat1')).toBe(true);
    });

    it('should block reply within rate limit period', () => {
      rateLimiter.recordReply('chat1');
      expect(rateLimiter.canSendReply('chat1')).toBe(false);
    });

    it('should allow reply after rate limit period', () => {
      // Mock Date to control time
      const originalDate = Date;
      const mockDate = jest.fn();
      global.Date = mockDate as any;

      const baseTime = new Date('2023-01-01T10:00:00Z');
      mockDate.mockReturnValue(baseTime);
      mockDate.prototype = originalDate.prototype;

      rateLimiter.recordReply('chat1');
      expect(rateLimiter.canSendReply('chat1')).toBe(false);

      // Move time forward by 31 minutes (past the 30-minute limit)
      const futureTime = new Date('2023-01-01T10:31:00Z');
      mockDate.mockReturnValue(futureTime);

      expect(rateLimiter.canSendReply('chat1')).toBe(true);

      // Restore original Date
      global.Date = originalDate;
    });

    it('should handle multiple chats independently', () => {
      rateLimiter.recordReply('chat1');
      
      expect(rateLimiter.canSendReply('chat1')).toBe(false);
      expect(rateLimiter.canSendReply('chat2')).toBe(true);
    });
  });

  describe('recordReply', () => {
    it('should record first reply for a chat', () => {
      rateLimiter.recordReply('chat1');
      
      const stats = rateLimiter.getChatStats('chat1');
      expect(stats.hasHistory).toBe(true);
      expect(stats.replyCount).toBe(1);
      expect(stats.lastReplyTime).toBeInstanceOf(Date);
    });

    it('should increment reply count within same period', () => {
      const rateLimiterMultiple = new RateLimiter({
        rateLimitMinutes: 30,
        maxRepliesPerPeriod: 3
      });

      rateLimiterMultiple.recordReply('chat1');
      rateLimiterMultiple.recordReply('chat1');
      
      const stats = rateLimiterMultiple.getChatStats('chat1');
      expect(stats.replyCount).toBe(2);
      
      rateLimiterMultiple.destroy();
    });

    it('should reset count after rate limit period', () => {
      const originalDate = Date;
      const mockDate = jest.fn();
      global.Date = mockDate as any;

      const baseTime = new Date('2023-01-01T10:00:00Z');
      mockDate.mockReturnValue(baseTime);
      mockDate.prototype = originalDate.prototype;

      rateLimiter.recordReply('chat1');
      
      // Move time forward past rate limit
      const futureTime = new Date('2023-01-01T10:31:00Z');
      mockDate.mockReturnValue(futureTime);
      
      rateLimiter.recordReply('chat1');
      
      const stats = rateLimiter.getChatStats('chat1');
      expect(stats.replyCount).toBe(1); // Should reset to 1

      global.Date = originalDate;
    });
  });

  describe('getTimeUntilNextReply', () => {
    it('should return 0 for chat with no history', () => {
      expect(rateLimiter.getTimeUntilNextReply('chat1')).toBe(0);
    });

    it('should return remaining time for rate-limited chat', () => {
      const originalDate = Date;
      const mockDate = jest.fn();
      global.Date = mockDate as any;

      const baseTime = new Date('2023-01-01T10:00:00Z');
      mockDate.mockReturnValue(baseTime);
      mockDate.prototype = originalDate.prototype;

      rateLimiter.recordReply('chat1');
      
      // Move time forward by 10 minutes
      const currentTime = new Date('2023-01-01T10:10:00Z');
      mockDate.mockReturnValue(currentTime);
      
      const remainingTime = rateLimiter.getTimeUntilNextReply('chat1');
      expect(remainingTime).toBe(20 * 60 * 1000); // 20 minutes in milliseconds

      global.Date = originalDate;
    });

    it('should return 0 when rate limit period has passed', () => {
      const originalDate = Date;
      const mockDate = jest.fn();
      global.Date = mockDate as any;

      const baseTime = new Date('2023-01-01T10:00:00Z');
      mockDate.mockReturnValue(baseTime);
      mockDate.prototype = originalDate.prototype;

      rateLimiter.recordReply('chat1');
      
      // Move time forward past rate limit
      const futureTime = new Date('2023-01-01T10:31:00Z');
      mockDate.mockReturnValue(futureTime);
      
      expect(rateLimiter.getTimeUntilNextReply('chat1')).toBe(0);

      global.Date = originalDate;
    });
  });

  describe('getChatStats', () => {
    it('should return stats for chat with no history', () => {
      const stats = rateLimiter.getChatStats('chat1');
      
      expect(stats.hasHistory).toBe(false);
      expect(stats.lastReplyTime).toBeUndefined();
      expect(stats.replyCount).toBe(0);
      expect(stats.canReply).toBe(true);
      expect(stats.timeUntilNextReply).toBe(0);
    });

    it('should return stats for chat with history', () => {
      rateLimiter.recordReply('chat1');
      
      const stats = rateLimiter.getChatStats('chat1');
      
      expect(stats.hasHistory).toBe(true);
      expect(stats.lastReplyTime).toBeInstanceOf(Date);
      expect(stats.replyCount).toBe(1);
      expect(stats.canReply).toBe(false);
      expect(stats.timeUntilNextReply).toBeGreaterThan(0);
    });
  });

  describe('getOverallStats', () => {
    it('should return overall statistics', () => {
      rateLimiter.recordReply('chat1');
      rateLimiter.recordReply('chat2');
      
      const stats = rateLimiter.getOverallStats();
      
      expect(stats.totalChatsTracked).toBe(2);
      expect(stats.totalRepliesSent).toBe(2);
      expect(stats.activeRateLimits).toBe(2);
      expect(stats.rateLimitMinutes).toBe(30);
      expect(stats.maxRepliesPerPeriod).toBe(1);
    });

    it('should count active rate limits correctly', () => {
      const originalDate = Date;
      const mockDate = jest.fn();
      global.Date = mockDate as any;

      const baseTime = new Date('2023-01-01T10:00:00Z');
      mockDate.mockReturnValue(baseTime);
      mockDate.prototype = originalDate.prototype;

      rateLimiter.recordReply('chat1');
      rateLimiter.recordReply('chat2');
      
      // Move time forward past rate limit for one chat
      const futureTime = new Date('2023-01-01T10:31:00Z');
      mockDate.mockReturnValue(futureTime);
      
      const stats = rateLimiter.getOverallStats();
      expect(stats.activeRateLimits).toBe(0); // Both should be expired

      global.Date = originalDate;
    });
  });

  describe('updateConfiguration', () => {
    it('should update rate limit minutes', () => {
      rateLimiter.updateConfiguration({ rateLimitMinutes: 60 });
      
      const stats = rateLimiter.getOverallStats();
      expect(stats.rateLimitMinutes).toBe(60);
    });

    it('should update max replies per period', () => {
      rateLimiter.updateConfiguration({ maxRepliesPerPeriod: 3 });
      
      const stats = rateLimiter.getOverallStats();
      expect(stats.maxRepliesPerPeriod).toBe(3);
    });
  });

  describe('resetLimits', () => {
    it('should reset all rate limits', () => {
      rateLimiter.recordReply('chat1');
      rateLimiter.recordReply('chat2');
      
      expect(rateLimiter.getOverallStats().totalChatsTracked).toBe(2);
      
      rateLimiter.resetLimits();
      
      expect(rateLimiter.getOverallStats().totalChatsTracked).toBe(0);
      expect(rateLimiter.canSendReply('chat1')).toBe(true);
      expect(rateLimiter.canSendReply('chat2')).toBe(true);
    });
  });

  describe('resetChatLimit', () => {
    it('should reset rate limit for specific chat', () => {
      rateLimiter.recordReply('chat1');
      rateLimiter.recordReply('chat2');
      
      expect(rateLimiter.canSendReply('chat1')).toBe(false);
      expect(rateLimiter.canSendReply('chat2')).toBe(false);
      
      rateLimiter.resetChatLimit('chat1');
      
      expect(rateLimiter.canSendReply('chat1')).toBe(true);
      expect(rateLimiter.canSendReply('chat2')).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('should remove old entries', () => {
      const originalDate = Date;
      const mockDate = jest.fn();
      global.Date = mockDate as any;

      const baseTime = new Date('2023-01-01T10:00:00Z');
      mockDate.mockReturnValue(baseTime);
      mockDate.prototype = originalDate.prototype;

      rateLimiter.recordReply('chat1');
      
      // Move time forward well past cleanup threshold
      const futureTime = new Date('2023-01-01T12:01:00Z'); // 2+ hours later
      mockDate.mockReturnValue(futureTime);
      
      expect(rateLimiter.getOverallStats().totalChatsTracked).toBe(1);
      
      rateLimiter.cleanup();
      
      expect(rateLimiter.getOverallStats().totalChatsTracked).toBe(0);

      global.Date = originalDate;
    });

    it('should keep recent entries', () => {
      const originalDate = Date;
      const mockDate = jest.fn();
      global.Date = mockDate as any;

      const baseTime = new Date('2023-01-01T10:00:00Z');
      mockDate.mockReturnValue(baseTime);
      mockDate.prototype = originalDate.prototype;

      rateLimiter.recordReply('chat1');
      
      // Move time forward but not past cleanup threshold
      const futureTime = new Date('2023-01-01T10:30:00Z'); // 30 minutes later
      mockDate.mockReturnValue(futureTime);
      
      rateLimiter.cleanup();
      
      expect(rateLimiter.getOverallStats().totalChatsTracked).toBe(1);

      global.Date = originalDate;
    });
  });

  describe('exportData and importData', () => {
    it('should export and import rate limit data', () => {
      rateLimiter.recordReply('chat1');
      rateLimiter.recordReply('chat2');
      
      const exportedData = rateLimiter.exportData();
      expect(exportedData).toHaveLength(2);
      
      const newRateLimiter = new RateLimiter({
        rateLimitMinutes: 30,
        maxRepliesPerPeriod: 1
      });
      
      newRateLimiter.importData(exportedData);
      
      expect(newRateLimiter.getOverallStats().totalChatsTracked).toBe(2);
      expect(newRateLimiter.canSendReply('chat1')).toBe(false);
      expect(newRateLimiter.canSendReply('chat2')).toBe(false);
      
      newRateLimiter.destroy();
    });

    it('should handle date conversion during import', () => {
      const mockEntry: RateLimitEntry = {
        chatId: 'chat1',
        lastReplyTime: '2023-01-01T10:00:00Z' as any, // String instead of Date
        replyCount: 1
      };
      
      rateLimiter.importData([mockEntry]);
      
      const stats = rateLimiter.getChatStats('chat1');
      expect(stats.lastReplyTime).toBeInstanceOf(Date);
    });
  });

  describe('destroy', () => {
    it('should clean up resources', () => {
      rateLimiter.recordReply('chat1');
      
      expect(rateLimiter.getOverallStats().totalChatsTracked).toBe(1);
      
      rateLimiter.destroy();
      
      expect(rateLimiter.getOverallStats().totalChatsTracked).toBe(0);
    });
  });
});