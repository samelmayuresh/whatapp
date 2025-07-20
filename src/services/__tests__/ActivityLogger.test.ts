import * as fs from 'fs-extra';
import * as path from 'path';
import { ActivityLogger } from '../ActivityLogger';
import { ActivityLogType } from '../../models/ActivityLogEntry';

// Mock fs-extra
jest.mock('fs-extra');
const mockedFs = fs as jest.Mocked<typeof fs>;

describe('ActivityLogger', () => {
  let logger: ActivityLogger;
  let testLogDir: string;

  beforeEach(() => {
    jest.clearAllMocks();
    testLogDir = 'test-logs';
    
    logger = new ActivityLogger({
      logDirectory: testLogDir,
      maxLogFiles: 5,
      maxLogSizeBytes: 1024 * 1024, // 1MB
      rotationIntervalHours: 24
    });

    // Mock fs operations
    mockedFs.ensureDir.mockResolvedValue();
    mockedFs.appendFile.mockResolvedValue();
    mockedFs.pathExists.mockResolvedValue(false);
    mockedFs.stat.mockResolvedValue({ size: 1000 } as any);
    mockedFs.readdir.mockResolvedValue([]);
    mockedFs.readFile.mockResolvedValue('');
    mockedFs.remove.mockResolvedValue();
  });

  afterEach(() => {
    logger.destroy();
  });

  describe('initialization', () => {
    it('should create log directory on initialization', () => {
      expect(mockedFs.ensureDir).toHaveBeenCalledWith(testLogDir);
    });
  });

  describe('logMessageReceived', () => {
    it('should log message received event', async () => {
      await logger.logMessageReceived('chat1', 'John Doe', 'Hello world');

      expect(mockedFs.appendFile).toHaveBeenCalled();
      const appendCall = mockedFs.appendFile.mock.calls[0];
      const logContent = appendCall[1] as string;
      
      expect(logContent).toContain('message_received');
      expect(logContent).toContain('chat1');
      expect(logContent).toContain('John Doe');
      expect(logContent).toContain('Hello world');
    });

    it('should truncate long message content', async () => {
      const longMessage = 'a'.repeat(1000);
      await logger.logMessageReceived('chat1', 'John Doe', longMessage);

      const appendCall = mockedFs.appendFile.mock.calls[0];
      const logContent = appendCall[1] as string;
      
      expect(logContent).toContain('[truncated]');
      expect(logContent.length).toBeLessThan(longMessage.length + 200); // Much shorter than original
    });
  });

  describe('logReplySent', () => {
    it('should log reply sent event', async () => {
      await logger.logReplySent('chat1', 'John Doe', 'Thanks for your message!', 'default');

      expect(mockedFs.appendFile).toHaveBeenCalled();
      const appendCall = mockedFs.appendFile.mock.calls[0];
      const logContent = appendCall[1] as string;
      
      expect(logContent).toContain('reply_sent');
      expect(logContent).toContain('chat1');
      expect(logContent).toContain('John Doe');
      expect(logContent).toContain('Thanks for your message!');
      expect(logContent).toContain('default');
    });

    it('should log reply without template ID', async () => {
      await logger.logReplySent('chat1', 'John Doe', 'Thanks for your message!');

      expect(mockedFs.appendFile).toHaveBeenCalled();
      const appendCall = mockedFs.appendFile.mock.calls[0];
      const logContent = appendCall[1] as string;
      
      expect(logContent).toContain('reply_sent');
      expect(logContent).not.toContain('templateId');
    });
  });

  describe('logError', () => {
    it('should log error event', async () => {
      await logger.logError('chat1', 'Failed to send message', { code: 500 });

      expect(mockedFs.appendFile).toHaveBeenCalled();
      const appendCall = mockedFs.appendFile.mock.calls[0];
      const logContent = appendCall[1] as string;
      
      expect(logContent).toContain('error');
      expect(logContent).toContain('chat1');
      expect(logContent).toContain('Failed to send message');
      expect(logContent).toContain('500');
    });
  });

  describe('logSystemEvent', () => {
    it('should log system event', async () => {
      await logger.logSystemEvent('startup', { version: '1.0.0' });

      expect(mockedFs.appendFile).toHaveBeenCalled();
      const appendCall = mockedFs.appendFile.mock.calls[0];
      const logContent = appendCall[1] as string;
      
      expect(logContent).toContain('system_event');
      expect(logContent).toContain('system');
      expect(logContent).toContain('startup');
      expect(logContent).toContain('1.0.0');
    });
  });

  describe('logConnectionStatus', () => {
    it('should log connection status change', async () => {
      await logger.logConnectionStatus('connected', 'WhatsApp Web ready');

      expect(mockedFs.appendFile).toHaveBeenCalled();
      const appendCall = mockedFs.appendFile.mock.calls[0];
      const logContent = appendCall[1] as string;
      
      expect(logContent).toContain('connection_status');
      expect(logContent).toContain('connected');
      expect(logContent).toContain('WhatsApp Web ready');
    });
  });

  describe('logRateLimitHit', () => {
    it('should log rate limit hit', async () => {
      await logger.logRateLimitHit('chat1', 'John Doe', 30000);

      expect(mockedFs.appendFile).toHaveBeenCalled();
      const appendCall = mockedFs.appendFile.mock.calls[0];
      const logContent = appendCall[1] as string;
      
      expect(logContent).toContain('rate_limit_hit');
      expect(logContent).toContain('chat1');
      expect(logContent).toContain('John Doe');
      expect(logContent).toContain('30000');
    });
  });

  describe('getRecentEntries', () => {
    it('should return recent log entries', async () => {
      const mockLogContent = [
        '{"timestamp":"2023-01-01T10:00:00.000Z","type":"message_received","chatId":"chat1"}',
        '{"timestamp":"2023-01-01T10:01:00.000Z","type":"reply_sent","chatId":"chat1"}'
      ].join('\n');

      mockedFs.readdir.mockResolvedValue(['activity-2023-01-01T10-00-00.log'] as any);
      mockedFs.readFile.mockResolvedValue(mockLogContent);

      const entries = await logger.getRecentEntries(10);

      expect(entries).toHaveLength(2);
      expect(entries[0].type).toBe('reply_sent'); // Should be newest first
      expect(entries[1].type).toBe('message_received');
      expect(entries[0].timestamp).toBeInstanceOf(Date);
    });

    it('should filter entries by type', async () => {
      const mockLogContent = [
        '{"timestamp":"2023-01-01T10:00:00.000Z","type":"message_received","chatId":"chat1"}',
        '{"timestamp":"2023-01-01T10:01:00.000Z","type":"reply_sent","chatId":"chat1"}',
        '{"timestamp":"2023-01-01T10:02:00.000Z","type":"error","chatId":"chat1"}'
      ].join('\n');

      mockedFs.readdir.mockResolvedValue(['activity-2023-01-01T10-00-00.log'] as any);
      mockedFs.readFile.mockResolvedValue(mockLogContent);

      const entries = await logger.getRecentEntries(10, 'reply_sent');

      expect(entries).toHaveLength(1);
      expect(entries[0].type).toBe('reply_sent');
    });

    it('should handle malformed log entries gracefully', async () => {
      const mockLogContent = [
        '{"timestamp":"2023-01-01T10:00:00.000Z","type":"message_received","chatId":"chat1"}',
        'invalid json line',
        '{"timestamp":"2023-01-01T10:01:00.000Z","type":"reply_sent","chatId":"chat1"}'
      ].join('\n');

      mockedFs.readdir.mockResolvedValue(['activity-2023-01-01T10-00-00.log'] as any);
      mockedFs.readFile.mockResolvedValue(mockLogContent);

      const entries = await logger.getRecentEntries(10);

      expect(entries).toHaveLength(2); // Should skip the invalid line
    });

    it('should return empty array on error', async () => {
      mockedFs.readdir.mockRejectedValue(new Error('Directory not found'));

      const entries = await logger.getRecentEntries(10);

      expect(entries).toEqual([]);
    });
  });

  describe('getStatistics', () => {
    it('should return activity statistics', async () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      
      const mockLogContent = [
        `{"timestamp":"${oneHourAgo.toISOString()}","type":"message_received","chatId":"chat1"}`,
        `{"timestamp":"${oneHourAgo.toISOString()}","type":"reply_sent","chatId":"chat1"}`,
        `{"timestamp":"${oneHourAgo.toISOString()}","type":"error","chatId":"chat1"}`,
        `{"timestamp":"${oneHourAgo.toISOString()}","type":"rate_limit_hit","chatId":"chat1"}`,
        `{"timestamp":"${oneHourAgo.toISOString()}","type":"system_event","chatId":"system"}`,
        `{"timestamp":"${oneHourAgo.toISOString()}","type":"connection_status","chatId":"system"}`
      ].join('\n');

      mockedFs.readdir.mockResolvedValue(['activity-2023-01-01T10-00-00.log'] as any);
      mockedFs.readFile.mockResolvedValue(mockLogContent);

      const stats = await logger.getStatistics(24);

      expect(stats.totalMessages).toBe(1);
      expect(stats.totalReplies).toBe(1);
      expect(stats.totalErrors).toBe(1);
      expect(stats.rateLimitHits).toBe(1);
      expect(stats.systemEvents).toBe(1);
      expect(stats.connectionEvents).toBe(1);
      expect(stats.timeRange.start).toBeInstanceOf(Date);
      expect(stats.timeRange.end).toBeInstanceOf(Date);
    });

    it('should filter statistics by time range', async () => {
      const now = new Date();
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      
      const mockLogContent = [
        `{"timestamp":"${twoHoursAgo.toISOString()}","type":"message_received","chatId":"chat1"}`,
        `{"timestamp":"${now.toISOString()}","type":"reply_sent","chatId":"chat1"}`
      ].join('\n');

      mockedFs.readdir.mockResolvedValue(['activity-2023-01-01T10-00-00.log'] as any);
      mockedFs.readFile.mockResolvedValue(mockLogContent);

      const stats = await logger.getStatistics(1); // Only last 1 hour

      expect(stats.totalMessages).toBe(0); // 2 hours ago, outside range
      expect(stats.totalReplies).toBe(1); // Recent, within range
    });
  });

  describe('cleanup', () => {
    it('should remove old log files when exceeding max count', async () => {
      const logFiles = [
        'activity-2023-01-01T10-00-00.log',
        'activity-2023-01-01T11-00-00.log',
        'activity-2023-01-01T12-00-00.log',
        'activity-2023-01-01T13-00-00.log',
        'activity-2023-01-01T14-00-00.log',
        'activity-2023-01-01T15-00-00.log', // This should be deleted
        'activity-2023-01-01T16-00-00.log'  // This should be deleted
      ];

      mockedFs.readdir.mockResolvedValue(logFiles as any);

      await logger.cleanup();

      expect(mockedFs.remove).toHaveBeenCalledTimes(2);
      expect(mockedFs.remove).toHaveBeenCalledWith(path.join(testLogDir, 'activity-2023-01-01T10-00-00.log'));
      expect(mockedFs.remove).toHaveBeenCalledWith(path.join(testLogDir, 'activity-2023-01-01T11-00-00.log'));
    });

    it('should not remove files when under max count', async () => {
      const logFiles = [
        'activity-2023-01-01T10-00-00.log',
        'activity-2023-01-01T11-00-00.log'
      ];

      mockedFs.readdir.mockResolvedValue(logFiles as any);

      await logger.cleanup();

      expect(mockedFs.remove).not.toHaveBeenCalled();
    });
  });

  describe('rotateLogFile', () => {
    it('should rotate log file when size exceeds limit', async () => {
      const largeSizeStats = { size: 2 * 1024 * 1024 }; // 2MB, exceeds 1MB limit
      
      mockedFs.pathExists.mockResolvedValue(true);
      mockedFs.stat.mockResolvedValue(largeSizeStats as any);
      mockedFs.readdir.mockResolvedValue([]);

      const originalLogFile = (logger as any).currentLogFile;
      
      await logger.rotateLogFile();

      const newLogFile = (logger as any).currentLogFile;
      expect(newLogFile).not.toBe(originalLogFile);
    });

    it('should not rotate log file when size is under limit', async () => {
      const smallSizeStats = { size: 500 * 1024 }; // 500KB, under 1MB limit
      
      mockedFs.pathExists.mockResolvedValue(true);
      mockedFs.stat.mockResolvedValue(smallSizeStats as any);

      const originalLogFile = (logger as any).currentLogFile;
      
      await logger.rotateLogFile();

      const newLogFile = (logger as any).currentLogFile;
      expect(newLogFile).toBe(originalLogFile);
    });
  });

  describe('exportLogs', () => {
    it('should export all logs when no date range specified', async () => {
      const mockLogContent = [
        '{"timestamp":"2023-01-01T10:00:00.000Z","type":"message_received","chatId":"chat1"}',
        '{"timestamp":"2023-01-01T11:00:00.000Z","type":"reply_sent","chatId":"chat1"}'
      ].join('\n');

      mockedFs.readdir.mockResolvedValue(['activity-2023-01-01T10-00-00.log'] as any);
      mockedFs.readFile.mockResolvedValue(mockLogContent);

      const logs = await logger.exportLogs();

      expect(logs).toHaveLength(2);
    });

    it('should filter logs by date range', async () => {
      const mockLogContent = [
        '{"timestamp":"2023-01-01T10:00:00.000Z","type":"message_received","chatId":"chat1"}',
        '{"timestamp":"2023-01-01T12:00:00.000Z","type":"reply_sent","chatId":"chat1"}',
        '{"timestamp":"2023-01-01T14:00:00.000Z","type":"error","chatId":"chat1"}'
      ].join('\n');

      mockedFs.readdir.mockResolvedValue(['activity-2023-01-01T10-00-00.log'] as any);
      mockedFs.readFile.mockResolvedValue(mockLogContent);

      const startDate = new Date('2023-01-01T11:00:00.000Z');
      const endDate = new Date('2023-01-01T13:00:00.000Z');

      const logs = await logger.exportLogs(startDate, endDate);

      expect(logs).toHaveLength(1);
      expect(logs[0].type).toBe('reply_sent');
    });
  });

  describe('destroy', () => {
    it('should clean up resources', () => {
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
      
      logger.destroy();

      expect(clearIntervalSpy).toHaveBeenCalled();
    });
  });
});