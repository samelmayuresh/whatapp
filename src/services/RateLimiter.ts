export interface RateLimitEntry {
  chatId: string;
  lastReplyTime: Date;
  replyCount: number;
}

export interface RateLimiterOptions {
  rateLimitMinutes?: number;
  rateLimitSeconds?: number;
  maxRepliesPerPeriod?: number;
  cleanupIntervalMinutes?: number;
}

export class RateLimiter {
  private rateLimitMs: number; // Store in milliseconds for flexibility
  private maxRepliesPerPeriod: number;
  private cleanupIntervalMinutes: number;
  private replyHistory: Map<string, RateLimitEntry> = new Map();
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(options: RateLimiterOptions) {
    // Support both minutes and seconds, with seconds taking priority
    if (options.rateLimitSeconds !== undefined) {
      this.rateLimitMs = options.rateLimitSeconds * 1000;
    } else if (options.rateLimitMinutes !== undefined) {
      this.rateLimitMs = options.rateLimitMinutes * 60 * 1000;
    } else {
      this.rateLimitMs = 30 * 60 * 1000; // Default 30 minutes
    }
    
    this.maxRepliesPerPeriod = options.maxRepliesPerPeriod || 1;
    this.cleanupIntervalMinutes = options.cleanupIntervalMinutes || 60; // 1 hour

    this.startCleanupTimer();
  }

  /**
   * Check if a reply can be sent to the specified chat
   */
  canSendReply(chatId: string): boolean {
    const entry = this.replyHistory.get(chatId);
    
    if (!entry) {
      // No previous reply, can send
      return true;
    }

    const now = new Date();
    const timeSinceLastReply = now.getTime() - entry.lastReplyTime.getTime();

    // Check if enough time has passed since last reply
    if (timeSinceLastReply >= this.rateLimitMs) {
      return true;
    }

    // Check if we've exceeded max replies in the current period
    if (entry.replyCount >= this.maxRepliesPerPeriod) {
      return false;
    }

    return false;
  }

  /**
   * Record that a reply was sent to the specified chat
   */
  recordReply(chatId: string): void {
    const now = new Date();
    const existingEntry = this.replyHistory.get(chatId);

    if (existingEntry) {
      const timeSinceLastReply = now.getTime() - existingEntry.lastReplyTime.getTime();

      if (timeSinceLastReply >= this.rateLimitMs) {
        // Reset count if rate limit period has passed
        this.replyHistory.set(chatId, {
          chatId,
          lastReplyTime: now,
          replyCount: 1
        });
      } else {
        // Increment count within the same period
        this.replyHistory.set(chatId, {
          chatId,
          lastReplyTime: now,
          replyCount: existingEntry.replyCount + 1
        });
      }
    } else {
      // First reply to this chat
      this.replyHistory.set(chatId, {
        chatId,
        lastReplyTime: now,
        replyCount: 1
      });
    }
  }

  /**
   * Get the time remaining until next reply is allowed for a chat
   */
  getTimeUntilNextReply(chatId: string): number {
    const entry = this.replyHistory.get(chatId);
    
    if (!entry) {
      return 0; // Can reply immediately
    }

    const now = new Date();
    const timeSinceLastReply = now.getTime() - entry.lastReplyTime.getTime();

    const remainingTime = this.rateLimitMs - timeSinceLastReply;
    return Math.max(0, remainingTime);
  }

  /**
   * Get rate limit statistics for a specific chat
   */
  getChatStats(chatId: string): {
    hasHistory: boolean;
    lastReplyTime?: Date;
    replyCount: number;
    canReply: boolean;
    timeUntilNextReply: number;
  } {
    const entry = this.replyHistory.get(chatId);
    
    return {
      hasHistory: !!entry,
      lastReplyTime: entry?.lastReplyTime,
      replyCount: entry?.replyCount || 0,
      canReply: this.canSendReply(chatId),
      timeUntilNextReply: this.getTimeUntilNextReply(chatId)
    };
  }

  /**
   * Get overall rate limiting statistics
   */
  getOverallStats(): {
    totalChatsTracked: number;
    totalRepliesSent: number;
    activeRateLimits: number;
    rateLimitMinutes: number;
    maxRepliesPerPeriod: number;
  } {
    const now = new Date();
    
    let totalReplies = 0;
    let activeRateLimits = 0;

    for (const entry of this.replyHistory.values()) {
      totalReplies += entry.replyCount;
      
      const timeSinceLastReply = now.getTime() - entry.lastReplyTime.getTime();
      if (timeSinceLastReply < this.rateLimitMs) {
        activeRateLimits++;
      }
    }

    return {
      totalChatsTracked: this.replyHistory.size,
      totalRepliesSent: totalReplies,
      activeRateLimits,
      rateLimitMinutes: Math.round(this.rateLimitMs / 60000), // Convert back to minutes for display
      maxRepliesPerPeriod: this.maxRepliesPerPeriod
    };
  }

  /**
   * Update rate limiting configuration
   */
  updateConfiguration(options: Partial<RateLimiterOptions>): void {
    if (options.rateLimitSeconds !== undefined) {
      this.rateLimitMs = options.rateLimitSeconds * 1000;
    } else if (options.rateLimitMinutes !== undefined) {
      this.rateLimitMs = options.rateLimitMinutes * 60 * 1000;
    }
    
    if (options.maxRepliesPerPeriod !== undefined) {
      this.maxRepliesPerPeriod = options.maxRepliesPerPeriod;
    }
    
    if (options.cleanupIntervalMinutes !== undefined) {
      this.cleanupIntervalMinutes = options.cleanupIntervalMinutes;
      this.restartCleanupTimer();
    }
  }

  /**
   * Reset rate limits for all chats
   */
  resetLimits(): void {
    this.replyHistory.clear();
    console.log('Rate limits reset for all chats');
  }

  /**
   * Reset rate limit for a specific chat
   */
  resetChatLimit(chatId: string): void {
    this.replyHistory.delete(chatId);
    console.log(`Rate limit reset for chat: ${chatId}`);
  }

  /**
   * Clean up old rate limit entries
   */
  cleanup(): void {
    const now = new Date();
    const cleanupThreshold = this.rateLimitMs * 2; // Keep entries for 2x the rate limit period
    
    let removedCount = 0;
    
    for (const [chatId, entry] of this.replyHistory.entries()) {
      const timeSinceLastReply = now.getTime() - entry.lastReplyTime.getTime();
      
      if (timeSinceLastReply > cleanupThreshold) {
        this.replyHistory.delete(chatId);
        removedCount++;
      }
    }
    
    if (removedCount > 0) {
      console.log(`Cleaned up ${removedCount} old rate limit entries`);
    }
  }

  /**
   * Export rate limit data for persistence
   */
  exportData(): RateLimitEntry[] {
    return Array.from(this.replyHistory.values());
  }

  /**
   * Import rate limit data from persistence
   */
  importData(entries: RateLimitEntry[]): void {
    this.replyHistory.clear();
    
    for (const entry of entries) {
      // Ensure lastReplyTime is a Date object
      const normalizedEntry: RateLimitEntry = {
        ...entry,
        lastReplyTime: new Date(entry.lastReplyTime)
      };
      
      this.replyHistory.set(entry.chatId, normalizedEntry);
    }
    
    console.log(`Imported ${entries.length} rate limit entries`);
  }

  /**
   * Destroy the rate limiter and clean up resources
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    
    this.replyHistory.clear();
    console.log('Rate limiter destroyed');
  }

  private startCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    
    const intervalMs = this.cleanupIntervalMinutes * 60 * 1000;
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, intervalMs);
  }

  private restartCleanupTimer(): void {
    this.startCleanupTimer();
  }
}