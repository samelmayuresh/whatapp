import * as fs from 'fs-extra';
import * as path from 'path';
import { ActivityLogEntry, ActivityLogType, createActivityLogEntry, serializeActivityLogEntry } from '../models/ActivityLogEntry';

export interface ActivityLoggerOptions {
  logDirectory: string;
  maxLogFiles: number;
  maxLogSizeBytes: number;
  rotationIntervalHours: number;
}

export class ActivityLogger {
  private logDirectory: string;
  private maxLogFiles: number;
  private maxLogSizeBytes: number;
  private rotationIntervalHours: number;
  private currentLogFile: string;
  private rotationTimer: NodeJS.Timeout | null = null;
  private writeQueue: ActivityLogEntry[] = [];
  private isWriting: boolean = false;

  constructor(options: ActivityLoggerOptions) {
    this.logDirectory = options.logDirectory;
    this.maxLogFiles = options.maxLogFiles;
    this.maxLogSizeBytes = options.maxLogSizeBytes;
    this.rotationIntervalHours = options.rotationIntervalHours;
    this.currentLogFile = this.generateLogFileName();
    
    this.initialize();
  }

  /**
   * Initialize the activity logger
   */
  private async initialize(): Promise<void> {
    try {
      await fs.ensureDir(this.logDirectory);
      await this.startRotationTimer();
      console.log(`Activity logger initialized. Log directory: ${this.logDirectory}`);
    } catch (error) {
      console.error('Failed to initialize activity logger:', error);
      throw error;
    }
  }

  /**
   * Log a message received event
   */
  async logMessageReceived(chatId: string, contactName: string, messageContent: string): Promise<void> {
    const entry = createActivityLogEntry('message_received', chatId, {
      contactName,
      messageContent: this.truncateContent(messageContent)
    });
    
    await this.writeLogEntry(entry);
  }

  /**
   * Log a reply sent event
   */
  async logReplySent(chatId: string, contactName: string, replyContent: string, templateId?: string): Promise<void> {
    const entry = createActivityLogEntry('reply_sent', chatId, {
      contactName,
      replyContent: this.truncateContent(replyContent),
      metadata: templateId ? { templateId } : undefined
    });
    
    await this.writeLogEntry(entry);
  }

  /**
   * Log an error event
   */
  async logError(chatId: string, error: string, context?: Record<string, any>): Promise<void> {
    const entry = createActivityLogEntry('error', chatId, {
      error: this.truncateContent(error),
      metadata: context
    });
    
    await this.writeLogEntry(entry);
  }

  /**
   * Log a system event
   */
  async logSystemEvent(event: string, metadata?: Record<string, any>): Promise<void> {
    const entry = createActivityLogEntry('system_event', 'system', {
      metadata: { event, ...metadata }
    });
    
    await this.writeLogEntry(entry);
  }

  /**
   * Log a connection status change
   */
  async logConnectionStatus(status: string, details?: string): Promise<void> {
    const entry = createActivityLogEntry('connection_status', 'system', {
      metadata: { status, details }
    });
    
    await this.writeLogEntry(entry);
  }

  /**
   * Log a rate limit hit
   */
  async logRateLimitHit(chatId: string, contactName: string, timeUntilNext: number): Promise<void> {
    const entry = createActivityLogEntry('rate_limit_hit', chatId, {
      contactName,
      metadata: { timeUntilNextMs: timeUntilNext }
    });
    
    await this.writeLogEntry(entry);
  }

  /**
   * Get recent log entries
   */
  async getRecentEntries(limit: number = 100, type?: ActivityLogType): Promise<ActivityLogEntry[]> {
    try {
      const logFiles = await this.getLogFiles();
      const entries: ActivityLogEntry[] = [];
      
      // Read log files in reverse chronological order
      for (const logFile of logFiles.reverse()) {
        const filePath = path.join(this.logDirectory, logFile);
        const content = await fs.readFile(filePath, 'utf8');
        const lines = content.trim().split('\n').filter(line => line.trim());
        
        // Parse lines in reverse order (newest first)
        for (const line of lines.reverse()) {
          try {
            const entry = JSON.parse(line);
            entry.timestamp = new Date(entry.timestamp);
            
            if (!type || entry.type === type) {
              entries.push(entry);
              
              if (entries.length >= limit) {
                return entries;
              }
            }
          } catch (parseError) {
            console.warn('Failed to parse log entry:', line);
          }
        }
      }
      
      return entries;
    } catch (error) {
      console.error('Failed to get recent entries:', error);
      return [];
    }
  }

  /**
   * Get activity statistics
   */
  async getStatistics(hours: number = 24): Promise<{
    totalMessages: number;
    totalReplies: number;
    totalErrors: number;
    rateLimitHits: number;
    systemEvents: number;
    connectionEvents: number;
    timeRange: { start: Date; end: Date };
  }> {
    const now = new Date();
    const startTime = new Date(now.getTime() - (hours * 60 * 60 * 1000));
    
    const entries = await this.getRecentEntries(10000); // Get a large number of recent entries
    const filteredEntries = entries.filter(entry => entry.timestamp >= startTime);
    
    const stats = {
      totalMessages: 0,
      totalReplies: 0,
      totalErrors: 0,
      rateLimitHits: 0,
      systemEvents: 0,
      connectionEvents: 0,
      timeRange: { start: startTime, end: now }
    };
    
    for (const entry of filteredEntries) {
      switch (entry.type) {
        case 'message_received':
          stats.totalMessages++;
          break;
        case 'reply_sent':
          stats.totalReplies++;
          break;
        case 'error':
          stats.totalErrors++;
          break;
        case 'rate_limit_hit':
          stats.rateLimitHits++;
          break;
        case 'system_event':
          stats.systemEvents++;
          break;
        case 'connection_status':
          stats.connectionEvents++;
          break;
      }
    }
    
    return stats;
  }

  /**
   * Clean up old log files
   */
  async cleanup(): Promise<void> {
    try {
      const logFiles = await this.getLogFiles();
      
      if (logFiles.length <= this.maxLogFiles) {
        return;
      }
      
      // Sort files by creation time (oldest first)
      const filesToDelete = logFiles.slice(0, logFiles.length - this.maxLogFiles);
      
      for (const file of filesToDelete) {
        const filePath = path.join(this.logDirectory, file);
        await fs.remove(filePath);
        console.log(`Deleted old log file: ${file}`);
      }
    } catch (error) {
      console.error('Failed to cleanup old log files:', error);
    }
  }

  /**
   * Rotate log file if needed
   */
  async rotateLogFile(): Promise<void> {
    try {
      const currentLogPath = path.join(this.logDirectory, this.currentLogFile);
      
      // Check if current log file exists and its size
      if (await fs.pathExists(currentLogPath)) {
        const stats = await fs.stat(currentLogPath);
        
        if (stats.size >= this.maxLogSizeBytes) {
          console.log(`Rotating log file (size: ${stats.size} bytes)`);
          this.currentLogFile = this.generateLogFileName();
        }
      }
      
      // Clean up old files
      await this.cleanup();
    } catch (error) {
      console.error('Failed to rotate log file:', error);
    }
  }

  /**
   * Export logs for backup or analysis
   */
  async exportLogs(startDate?: Date, endDate?: Date): Promise<ActivityLogEntry[]> {
    const entries = await this.getRecentEntries(50000); // Get many entries
    
    if (!startDate && !endDate) {
      return entries;
    }
    
    return entries.filter(entry => {
      if (startDate && entry.timestamp < startDate) {
        return false;
      }
      if (endDate && entry.timestamp > endDate) {
        return false;
      }
      return true;
    });
  }

  /**
   * Destroy the logger and clean up resources
   */
  destroy(): void {
    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
      this.rotationTimer = null;
    }
    
    // Flush any remaining entries
    if (this.writeQueue.length > 0) {
      this.flushWriteQueue().catch(error => {
        console.error('Failed to flush write queue during destroy:', error);
      });
    }
    
    console.log('Activity logger destroyed');
  }

  private async writeLogEntry(entry: ActivityLogEntry): Promise<void> {
    this.writeQueue.push(entry);
    
    if (!this.isWriting) {
      await this.flushWriteQueue();
    }
  }

  private async flushWriteQueue(): Promise<void> {
    if (this.isWriting || this.writeQueue.length === 0) {
      return;
    }
    
    this.isWriting = true;
    
    try {
      const entries = [...this.writeQueue];
      this.writeQueue = [];
      
      const logPath = path.join(this.logDirectory, this.currentLogFile);
      const logLines = entries.map(entry => serializeActivityLogEntry(entry));
      const logContent = logLines.join('\n') + '\n';
      
      await fs.appendFile(logPath, logContent, 'utf8');
      
      // Check if rotation is needed after writing
      await this.rotateLogFile();
    } catch (error) {
      console.error('Failed to write log entries:', error);
      // Put entries back in queue for retry
      this.writeQueue.unshift(...this.writeQueue);
    } finally {
      this.isWriting = false;
    }
  }

  private generateLogFileName(): string {
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    return `activity-${timestamp}.log`;
  }

  private async getLogFiles(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.logDirectory);
      return files
        .filter(file => file.startsWith('activity-') && file.endsWith('.log'))
        .sort(); // Sort alphabetically (which is chronological due to timestamp format)
    } catch (error) {
      console.error('Failed to get log files:', error);
      return [];
    }
  }

  private async startRotationTimer(): Promise<void> {
    const intervalMs = this.rotationIntervalHours * 60 * 60 * 1000;
    
    this.rotationTimer = setInterval(async () => {
      await this.rotateLogFile();
    }, intervalMs);
  }

  private truncateContent(content: string, maxLength: number = 500): string {
    if (content.length <= maxLength) {
      return content;
    }
    
    return content.substring(0, maxLength) + '... [truncated]';
  }
}