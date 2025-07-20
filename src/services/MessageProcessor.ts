import { Message } from '../models/Message';
import { MessageTemplate } from '../models/MessageTemplate';
import { SystemSettings } from '../models/SystemSettings';
import { Contact } from '../models/Contact';

export interface MessageProcessorOptions {
  systemSettings: SystemSettings;
  messageTemplates: MessageTemplate[];
  isBlacklisted: (contactId: string) => boolean;
  getContactName: (contactId: string) => string;
}

export class MessageProcessor {
  private systemSettings: SystemSettings;
  private messageTemplates: MessageTemplate[];
  private isBlacklisted: (contactId: string) => boolean;
  private getContactName: (contactId: string) => string;

  constructor(options: MessageProcessorOptions) {
    this.systemSettings = options.systemSettings;
    this.messageTemplates = options.messageTemplates;
    this.isBlacklisted = options.isBlacklisted;
    this.getContactName = options.getContactName;
  }

  /**
   * Update processor configuration
   */
  updateConfiguration(options: Partial<MessageProcessorOptions>): void {
    if (options.systemSettings) {
      this.systemSettings = options.systemSettings;
    }
    if (options.messageTemplates) {
      this.messageTemplates = options.messageTemplates;
    }
    if (options.isBlacklisted) {
      this.isBlacklisted = options.isBlacklisted;
    }
    if (options.getContactName) {
      this.getContactName = options.getContactName;
    }
  }

  /**
   * Determine if an auto-reply should be sent for this message
   */
  shouldReply(message: Message): boolean {
    // Don't reply if system is disabled
    if (!this.systemSettings.enabled) {
      return false;
    }

    // Don't reply to group messages
    if (message.isGroup) {
      return false;
    }

    // Don't reply to blacklisted contacts
    if (this.isBlacklisted(message.from)) {
      return false;
    }

    // Don't reply to empty messages
    if (!message.body || message.body.trim() === '') {
      return false;
    }

    // Check business hours if configured
    if (!this.isWithinBusinessHours()) {
      return false;
    }

    return true;
  }

  /**
   * Generate an auto-reply message for the given message
   */
  generateReply(message: Message): string {
    const template = this.selectMessageTemplate();
    if (!template) {
      throw new Error('No message template available');
    }

    return this.renderTemplate(template, message);
  }

  /**
   * Process an incoming message and determine response
   */
  async processIncomingMessage(message: Message): Promise<{
    shouldReply: boolean;
    replyContent?: string;
    template?: MessageTemplate;
    reason?: string;
  }> {
    try {
      if (!this.shouldReply(message)) {
        return {
          shouldReply: false,
          reason: this.getNoReplyReason(message)
        };
      }

      const template = this.selectMessageTemplate();
      if (!template) {
        return {
          shouldReply: false,
          reason: 'No message template available'
        };
      }

      const replyContent = this.renderTemplate(template, message);

      return {
        shouldReply: true,
        replyContent,
        template
      };
    } catch (error) {
      console.error('Error processing message:', error);
      return {
        shouldReply: false,
        reason: `Processing error: ${error}`
      };
    }
  }

  /**
   * Select the appropriate message template based on current conditions
   */
  private selectMessageTemplate(): MessageTemplate | null {
    if (this.messageTemplates.length === 0) {
      return null;
    }

    const now = new Date();
    const currentTime = this.formatTime(now);
    const currentDay = now.getDay() === 0 ? 7 : now.getDay(); // Convert Sunday from 0 to 7

    // First, try to find a template with matching time-based rules
    for (const template of this.messageTemplates) {
      if (template.timeBasedRules && template.timeBasedRules.length > 0) {
        for (const rule of template.timeBasedRules) {
          if (this.isTimeWithinRule(currentTime, currentDay, rule)) {
            return template;
          }
        }
      }
    }

    // If no time-based template matches, use the default template
    const defaultTemplate = this.messageTemplates.find(t => t.isDefault);
    return defaultTemplate || this.messageTemplates[0];
  }

  /**
   * Render a message template with placeholders replaced
   */
  private renderTemplate(template: MessageTemplate, message: Message): string {
    let content = template.content;

    // Replace common placeholders
    const contactName = this.getContactName(message.from) || 'there';
    const now = new Date();

    const placeholders: Record<string, string> = {
      '{name}': contactName,
      '{time}': now.toLocaleTimeString(),
      '{date}': now.toLocaleDateString(),
      '{datetime}': now.toLocaleString(),
      '{day}': now.toLocaleDateString('en-US', { weekday: 'long' }),
      '{message}': message.body.substring(0, 100) // First 100 chars of original message
    };

    // Replace all placeholders
    for (const [placeholder, value] of Object.entries(placeholders)) {
      content = content.replace(new RegExp(this.escapeRegExp(placeholder), 'g'), value);
    }

    return content;
  }

  /**
   * Check if current time is within business hours
   */
  private isWithinBusinessHours(): boolean {
    if (!this.systemSettings.businessHours) {
      return true; // No business hours restriction
    }

    const now = new Date();
    const currentTime = this.formatTime(now);
    const currentDay = now.getDay() === 0 ? 7 : now.getDay(); // Convert Sunday from 0 to 7

    const { start, end, days } = this.systemSettings.businessHours;

    // Check if current day is in business days
    if (!days.includes(currentDay)) {
      return false;
    }

    // Check if current time is within business hours
    const startMinutes = this.timeToMinutes(start);
    const endMinutes = this.timeToMinutes(end);
    const currentMinutes = this.timeToMinutes(currentTime);

    if (startMinutes <= endMinutes) {
      // Normal case: start < end (e.g., 9:00 - 17:00)
      return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
    } else {
      // Overnight case: start > end (e.g., 22:00 - 06:00)
      return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
    }
  }

  /**
   * Check if current time matches a time-based rule
   */
  private isTimeWithinRule(currentTime: string, currentDay: number, rule: any): boolean {
    // Check if current day is in rule days
    if (!rule.days.includes(currentDay)) {
      return false;
    }

    // Check if current time is within rule time range
    const startMinutes = this.timeToMinutes(rule.startTime);
    const endMinutes = this.timeToMinutes(rule.endTime);
    const currentMinutes = this.timeToMinutes(currentTime);

    if (startMinutes <= endMinutes) {
      return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
    } else {
      return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
    }
  }

  /**
   * Get reason why no reply should be sent
   */
  private getNoReplyReason(message: Message): string {
    if (!this.systemSettings.enabled) {
      return 'System is disabled';
    }

    if (message.isGroup) {
      return 'Group messages are ignored';
    }

    if (this.isBlacklisted(message.from)) {
      return 'Contact is blacklisted';
    }

    if (!message.body || message.body.trim() === '') {
      return 'Empty message';
    }

    if (!this.isWithinBusinessHours()) {
      return 'Outside business hours';
    }

    return 'Unknown reason';
  }

  /**
   * Format current time as HH:MM
   */
  private formatTime(date: Date): string {
    return date.toTimeString().substring(0, 5);
  }

  /**
   * Convert time string (HH:MM) to minutes since midnight
   */
  private timeToMinutes(timeString: string): number {
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours * 60 + minutes;
  }

  /**
   * Escape special regex characters
   */
  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}