import { EventEmitter } from 'events';
import { Message } from '../models/Message';
import { MessageProcessor } from './MessageProcessor';
import { RateLimiter } from './RateLimiter';
import { ActivityLogger } from './ActivityLogger';
import { WhatsAppClient } from './WhatsAppClient';
import { ConfigurationManager } from './ConfigurationManager';
import { errorHandler, ErrorSeverity } from '../utils/ErrorHandler';

export interface ReplyEngineEvents {
  'reply-sent': (chatId: string, replyContent: string, templateId?: string) => void;
  'reply-blocked': (chatId: string, reason: string) => void;
  'error': (error: Error, context?: any) => void;
}

export interface ReplyEngineOptions {
  whatsappClient: WhatsAppClient;
  configurationManager: ConfigurationManager;
  activityLogger: ActivityLogger;
  rateLimiter: RateLimiter;
  messageProcessor: MessageProcessor;
}

export class ReplyEngine extends EventEmitter {
  private whatsappClient: WhatsAppClient;
  private configurationManager: ConfigurationManager;
  private activityLogger: ActivityLogger;
  private rateLimiter: RateLimiter;
  private messageProcessor: MessageProcessor;
  private isActive: boolean = false;
  private retryAttempts: Map<string, number> = new Map();
  private maxRetryAttempts: number = 3;
  private retryDelay: number = 5000; // 5 seconds
  private contacts: Map<string, { name: string }> = new Map(); // Contact cache

  constructor(options: ReplyEngineOptions) {
    super();

    this.whatsappClient = options.whatsappClient;
    this.configurationManager = options.configurationManager;
    this.activityLogger = options.activityLogger;
    this.rateLimiter = options.rateLimiter;
    this.messageProcessor = options.messageProcessor;

    this.setupEventHandlers();
  }

  /**
   * Start the reply engine
   */
  start(): void {
    if (this.isActive) {
      console.log('Reply engine is already active');
      return;
    }

    this.isActive = true;
    console.log('Reply engine started');

    this.activityLogger.logSystemEvent('reply_engine_started');
  }

  /**
   * Stop the reply engine
   */
  stop(): void {
    if (!this.isActive) {
      console.log('Reply engine is already inactive');
      return;
    }

    this.isActive = false;
    console.log('Reply engine stopped');

    this.activityLogger.logSystemEvent('reply_engine_stopped');
  }

  /**
   * Check if the reply engine is active
   */
  isEngineActive(): boolean {
    return this.isActive;
  }

  /**
   * Process an incoming message and potentially send a reply
   */
  async processMessage(message: Message): Promise<void> {
    if (!this.isActive) {
      return;
    }

    await errorHandler.executeWithGracefulDegradation(
      // Primary operation: full message processing
      async () => {
        // Log the incoming message
        const contactName = message.contactName || await this.getContactName(message.from);
        await this.activityLogger.logMessageReceived(
          message.chatId,
          contactName,
          message.body
        );

        // Check if we should pause when user is active
        const systemSettings = this.configurationManager.getSystemSettings();
        if (systemSettings.pauseWhenActive && await this.isUserActive()) {
          console.log('Skipping auto-reply: user is active');
          return;
        }

        // Process the message to determine if we should reply
        const processingResult = await this.messageProcessor.processIncomingMessage(message);

        if (!processingResult.shouldReply) {
          console.log(`Not replying to ${message.from}: ${processingResult.reason}`);
          this.emit('reply-blocked', message.chatId, processingResult.reason || 'Unknown reason');
          return;
        }

        // Check rate limiting
        if (!this.rateLimiter.canSendReply(message.chatId)) {
          const timeUntilNext = this.rateLimiter.getTimeUntilNextReply(message.chatId);
          const contactName = await this.getContactName(message.from);

          console.log(`Rate limited for ${message.from}, next reply in ${Math.ceil(timeUntilNext / 1000)}s`);

          await this.activityLogger.logRateLimitHit(message.chatId, contactName, timeUntilNext);
          this.emit('reply-blocked', message.chatId, 'Rate limited');
          return;
        }

        // Send the reply
        if (processingResult.replyContent) {
          await this.sendReply(message, processingResult.replyContent, processingResult.template?.id);
        }
      },
      // Fallback operation: minimal processing with basic reply
      async () => {
        console.log('Using fallback message processing for:', message.chatId);

        // Basic logging
        await this.activityLogger.logMessageReceived(
          message.chatId,
          message.contactName || 'Unknown',
          message.body
        );

        // Check if system is enabled
        const systemSettings = this.configurationManager.getSystemSettings();
        if (!systemSettings.enabled) {
          return;
        }

        // Simple rate limiting check
        if (!this.rateLimiter.canSendReply(message.chatId)) {
          this.emit('reply-blocked', message.chatId, 'Rate limited (fallback)');
          return;
        }

        // Send default reply
        const templates = this.configurationManager.getMessageTemplates();
        const defaultTemplate = templates.find(t => t.isDefault);

        if (defaultTemplate) {
          await this.sendReply(message, defaultTemplate.content, defaultTemplate.id);
        }
      },
      {
        component: 'ReplyEngine',
        operation: 'processMessage',
        chatId: message.chatId,
        contactName: message.contactName,
        metadata: { messageId: message.id }
      }
    ).catch(async (error) => {
      // Both primary and fallback failed
      await errorHandler.handleError(error, {
        component: 'ReplyEngine',
        operation: 'processMessage',
        chatId: message.chatId,
        contactName: message.contactName,
        metadata: { messageId: message.id }
      }, ErrorSeverity.HIGH);

      this.emit('error', error, { message });
    });
  }

  /**
   * Send a reply with retry logic and error handling
   */
  private async sendReply(message: Message, replyContent: string, templateId?: string): Promise<void> {
    const retryKey = `${message.chatId}-${Date.now()}`;

    await errorHandler.handleRecoverableError(
      async () => {
        // Check circuit breaker before attempting to send
        if (errorHandler.isCircuitBreakerOpen('ReplyEngine', 'sendMessage')) {
          throw new Error('Circuit breaker is open for message sending');
        }

        // Send the message via WhatsApp
        await this.whatsappClient.sendMessage(message.chatId, replyContent);

        // Record the reply in rate limiter
        this.rateLimiter.recordReply(message.chatId);

        // Log the successful reply
        const contactName = await this.getContactName(message.from);
        await this.activityLogger.logReplySent(
          message.chatId,
          contactName,
          replyContent,
          templateId
        );

        console.log(`Reply sent to ${message.from}: ${replyContent.substring(0, 50)}...`);

        // Clear retry attempts on success
        this.retryAttempts.delete(retryKey);

        // Reset circuit breaker on success
        errorHandler.resetCircuitBreaker('ReplyEngine', 'sendMessage');

        this.emit('reply-sent', message.chatId, replyContent, templateId);
      },
      {
        component: 'ReplyEngine',
        operation: 'sendMessage',
        chatId: message.chatId,
        contactName: message.contactName,
        metadata: {
          templateId,
          replyLength: replyContent.length,
          retryKey
        }
      },
      this.maxRetryAttempts,
      this.retryDelay
    ).catch(async (error) => {
      // All retries failed
      await this.handleReplyFailure(message, replyContent, templateId, retryKey, error);
    });
  }

  /**
   * Handle reply failure with comprehensive error handling
   */
  private async handleReplyFailure(
    message: Message,
    replyContent: string,
    templateId: string | undefined,
    retryKey: string,
    error: Error
  ): Promise<void> {
    // Log the failure with appropriate severity
    await errorHandler.handleError(error, {
      component: 'ReplyEngine',
      operation: 'sendReply',
      chatId: message.chatId,
      contactName: message.contactName,
      metadata: {
        messageId: message.id,
        templateId,
        replyLength: replyContent.length,
        retryKey,
        errorType: error.name,
        errorMessage: error.message
      }
    }, ErrorSeverity.MEDIUM);

    // Clean up retry tracking
    this.retryAttempts.delete(retryKey);

    // Try graceful degradation - attempt to send a simpler message
    try {
      console.log('Attempting graceful degradation for failed reply...');

      const fallbackMessage = 'Thank you for your message. We will get back to you soon.';

      await errorHandler.executeWithGracefulDegradation(
        // Primary fallback: send simple acknowledgment
        async () => {
          await this.whatsappClient.sendMessage(message.chatId, fallbackMessage);
          this.rateLimiter.recordReply(message.chatId);

          const contactName = await this.getContactName(message.from);
          await this.activityLogger.logReplySent(
            message.chatId,
            contactName,
            fallbackMessage,
            'fallback'
          );

          console.log(`Fallback reply sent to ${message.from}`);
          this.emit('reply-sent', message.chatId, fallbackMessage, 'fallback');
        },
        // Secondary fallback: just log the attempt
        async () => {
          console.log('Secondary fallback: logging failed reply attempt');
          await this.activityLogger.logError(
            message.chatId,
            `All reply attempts failed: ${error.message}`,
            {
              messageId: message.id,
              originalReplyContent: replyContent.substring(0, 100),
              templateId,
              fallbackAttempted: true
            }
          );
        },
        {
          component: 'ReplyEngine',
          operation: 'fallbackReply',
          chatId: message.chatId,
          contactName: message.contactName,
          metadata: { originalError: error.message }
        }
      );

    } catch (fallbackError) {
      // Even fallback failed
      console.error('All reply attempts including fallback failed:', fallbackError);

      this.emit('error', error, {
        message,
        replyContent,
        templateId,
        reason: 'complete_failure',
        fallbackError: fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
      });
    }
  }

  /**
   * Check if user is currently active (simplified implementation)
   * In a real implementation, this could check for recent user activity
   */
  private async isUserActive(): Promise<boolean> {
    // For now, always return false (user not active)
    // This could be enhanced to check:
    // - Recent WhatsApp Web activity
    // - System idle time
    // - Manual override settings
    return false;
  }

  /**
   * Update configuration and refresh components
   */
  async updateConfiguration(): Promise<void> {
    try {
      const systemSettings = this.configurationManager.getSystemSettings();
      const messageTemplates = this.configurationManager.getMessageTemplates();

      // Update message processor
      this.messageProcessor.updateConfiguration({
        systemSettings,
        messageTemplates,
        isBlacklisted: (contactId: string) => this.configurationManager.isBlacklisted(contactId),
        getContactName: (contactId: string) => {
          // Return cached contact name or 'Unknown' for synchronous access
          const cachedContact = this.contacts.get(contactId);
          return cachedContact?.name || 'Unknown';
        }
      });

      // Update rate limiter - use 3 seconds for fast testing
      this.rateLimiter.updateConfiguration({
        rateLimitSeconds: 3
      });

      console.log('Reply engine configuration updated');

      await this.activityLogger.logSystemEvent('configuration_updated');

    } catch (error) {
      console.error('Failed to update reply engine configuration:', error);

      await this.activityLogger.logError(
        'system',
        `Configuration update failed: ${error}`,
        { error: error instanceof Error ? error.stack : String(error) }
      );

      this.emit('error', error as Error, { reason: 'configuration_update_failed' });
    }
  }

  /**
   * Get reply engine statistics
   */
  getStatistics(): {
    isActive: boolean;
    pendingRetries: number;
    rateLimiterStats: any;
  } {
    return {
      isActive: this.isActive,
      pendingRetries: this.retryAttempts.size,
      rateLimiterStats: this.rateLimiter.getOverallStats()
    };
  }

  /**
   * Force send a reply (bypass rate limiting and other checks)
   */
  async forceSendReply(chatId: string, content: string): Promise<void> {
    try {
      await this.whatsappClient.sendMessage(chatId, content);

      const contactName = await this.getContactName(chatId);
      await this.activityLogger.logReplySent(chatId, contactName, content, 'manual');

      console.log(`Manual reply sent to ${chatId}: ${content.substring(0, 50)}...`);

      this.emit('reply-sent', chatId, content, 'manual');

    } catch (error) {
      console.error(`Failed to force send reply to ${chatId}:`, error);

      await this.activityLogger.logError(
        chatId,
        `Manual reply failed: ${error}`,
        { content: content.substring(0, 100), error: error instanceof Error ? error.stack : String(error) }
      );

      throw error;
    }
  }

  /**
   * Clear retry attempts for a specific chat or all chats
   */
  clearRetryAttempts(chatId?: string): void {
    if (chatId) {
      // Clear retries for specific chat
      const keysToDelete = Array.from(this.retryAttempts.keys())
        .filter(key => key.startsWith(chatId));

      keysToDelete.forEach(key => this.retryAttempts.delete(key));

      console.log(`Cleared retry attempts for chat: ${chatId}`);
    } else {
      // Clear all retry attempts
      this.retryAttempts.clear();
      console.log('Cleared all retry attempts');
    }
  }

  /**
   * Destroy the reply engine and clean up resources
   */
  destroy(): void {
    this.stop();
    this.retryAttempts.clear();
    this.removeAllListeners();

    console.log('Reply engine destroyed');
  }

  private setupEventHandlers(): void {
    // Listen for WhatsApp messages
    this.whatsappClient.on('message', async (message: Message) => {
      await this.processMessage(message);
    });

    // Listen for WhatsApp connection events
    this.whatsappClient.on('ready', () => {
      this.activityLogger.logConnectionStatus('ready', 'WhatsApp client ready');
    });

    this.whatsappClient.on('disconnected', (reason: string) => {
      this.activityLogger.logConnectionStatus('disconnected', reason);
    });

    this.whatsappClient.on('error', (error: Error) => {
      this.activityLogger.logError('system', `WhatsApp client error: ${error.message}`);
    });
  }

  private async getContactName(contactId: string): Promise<string> {
    try {
      // Check cache first
      const cached = this.contacts.get(contactId);
      if (cached) {
        return cached.name;
      }

      // Fetch from WhatsApp client
      const contact = this.whatsappClient.getContact(contactId);
      if (contact) {
        // Cache the contact
        this.contacts.set(contactId, { name: contact.name || 'Unknown' });
        return contact.name || 'Unknown';
      }

      // Cache as unknown
      this.contacts.set(contactId, { name: 'Unknown' });
      return 'Unknown';
    } catch (error) {
      console.error(`Failed to get contact name for ${contactId}:`, error);
      // Cache as unknown on error
      this.contacts.set(contactId, { name: 'Unknown' });
      return 'Unknown';
    }
  }
}