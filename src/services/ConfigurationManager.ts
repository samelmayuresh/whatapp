import * as fs from 'fs-extra';
import * as path from 'path';
import { MessageTemplate } from '../models/MessageTemplate';
import { SystemSettings, createDefaultSystemSettings } from '../models/SystemSettings';
import { 
  validateAndParseMessageTemplates, 
  validateAndParseSystemSettings,
  serializeForStorage,
  parseFromStorage,
  DataValidationError
} from '../utils/DataUtils';

export interface ConfigurationData {
  system: SystemSettings;
  messageTemplates: MessageTemplate[];
  webServer: {
    port: number;
    host: string;
  };
}

export class ConfigurationManager {
  private configPath: string;
  private backupPath: string;
  private configuration: ConfigurationData;

  constructor(configDirectory: string = 'config') {
    this.configPath = path.join(configDirectory, 'settings.json');
    this.backupPath = path.join(configDirectory, 'settings.backup.json');
    this.configuration = this.createDefaultConfiguration();
  }

  /**
   * Initialize configuration by loading from file or creating defaults
   */
  async initialize(): Promise<void> {
    try {
      await this.loadConfiguration();
    } catch (error) {
      console.warn('Failed to load configuration, using defaults:', error);
      await this.saveConfiguration();
    }
  }

  /**
   * Load configuration from file
   */
  async loadConfiguration(): Promise<void> {
    if (!await fs.pathExists(this.configPath)) {
      // Try to load from default.json if settings.json doesn't exist
      const defaultPath = path.join(path.dirname(this.configPath), 'default.json');
      if (await fs.pathExists(defaultPath)) {
        const defaultData = await fs.readJson(defaultPath);
        this.configuration = this.parseAndValidateConfiguration(defaultData);
        await this.saveConfiguration(); // Save as settings.json
        return;
      }
      throw new Error('Configuration file not found');
    }

    const data = await fs.readJson(this.configPath);
    this.configuration = this.parseAndValidateConfiguration(data);
  }

  /**
   * Save current configuration to file
   */
  async saveConfiguration(): Promise<void> {
    try {
      // Create backup of existing configuration
      if (await fs.pathExists(this.configPath)) {
        await fs.copy(this.configPath, this.backupPath);
      }

      // Ensure config directory exists
      await fs.ensureDir(path.dirname(this.configPath));

      // Save new configuration
      const serialized = serializeForStorage(this.configuration);
      await fs.writeFile(this.configPath, serialized, 'utf8');
    } catch (error) {
      throw new Error(`Failed to save configuration: ${error}`);
    }
  }

  /**
   * Restore configuration from backup
   */
  async restoreFromBackup(): Promise<void> {
    if (!await fs.pathExists(this.backupPath)) {
      throw new Error('No backup file found');
    }

    await fs.copy(this.backupPath, this.configPath);
    await this.loadConfiguration();
  }

  /**
   * Get system settings
   */
  getSystemSettings(): SystemSettings {
    return { ...this.configuration.system };
  }

  /**
   * Update system settings
   */
  async updateSystemSettings(settings: SystemSettings): Promise<void> {
    if (!validateAndParseSystemSettings(settings)) {
      throw new DataValidationError('Invalid system settings');
    }

    this.configuration.system = { ...settings };
    await this.saveConfiguration();
  }

  /**
   * Get all message templates
   */
  getMessageTemplates(): MessageTemplate[] {
    return [...this.configuration.messageTemplates];
  }

  /**
   * Get default message template
   */
  getDefaultMessageTemplate(): MessageTemplate {
    const defaultTemplate = this.configuration.messageTemplates.find(t => t.isDefault);
    if (!defaultTemplate) {
      throw new Error('No default message template found');
    }
    return { ...defaultTemplate };
  }

  /**
   * Get message template by ID
   */
  getMessageTemplate(id: string): MessageTemplate | undefined {
    const template = this.configuration.messageTemplates.find(t => t.id === id);
    return template ? { ...template } : undefined;
  }

  /**
   * Add or update message template
   */
  async updateMessageTemplate(template: MessageTemplate): Promise<void> {
    const templates = [...this.configuration.messageTemplates];
    const existingIndex = templates.findIndex(t => t.id === template.id);

    if (existingIndex >= 0) {
      templates[existingIndex] = { ...template };
    } else {
      templates.push({ ...template });
    }

    // Validate all templates
    validateAndParseMessageTemplates(templates);

    this.configuration.messageTemplates = templates;
    await this.saveConfiguration();
  }

  /**
   * Remove message template
   */
  async removeMessageTemplate(id: string): Promise<void> {
    const templates = this.configuration.messageTemplates.filter(t => t.id !== id);
    
    if (templates.length === this.configuration.messageTemplates.length) {
      throw new Error(`Template with id '${id}' not found`);
    }

    // Ensure at least one default template remains
    const hasDefault = templates.some(t => t.isDefault);
    if (!hasDefault && templates.length > 0) {
      templates[0].isDefault = true;
    }

    this.configuration.messageTemplates = templates;
    await this.saveConfiguration();
  }

  /**
   * Check if contact is blacklisted
   */
  isBlacklisted(contactId: string): boolean {
    return this.configuration.system.blacklistedContacts.includes(contactId);
  }

  /**
   * Add contact to blacklist
   */
  async addToBlacklist(contactId: string): Promise<void> {
    if (!this.isBlacklisted(contactId)) {
      this.configuration.system.blacklistedContacts.push(contactId);
      await this.saveConfiguration();
    }
  }

  /**
   * Remove contact from blacklist
   */
  async removeFromBlacklist(contactId: string): Promise<void> {
    const index = this.configuration.system.blacklistedContacts.indexOf(contactId);
    if (index >= 0) {
      this.configuration.system.blacklistedContacts.splice(index, 1);
      await this.saveConfiguration();
    }
  }

  /**
   * Get web server configuration
   */
  getWebServerConfig(): { port: number; host: string } {
    return { ...this.configuration.webServer };
  }

  /**
   * Update web server configuration
   */
  async updateWebServerConfig(config: { port: number; host: string }): Promise<void> {
    if (typeof config.port !== 'number' || config.port < 1 || config.port > 65535) {
      throw new DataValidationError('Invalid port number');
    }

    if (typeof config.host !== 'string' || config.host.trim() === '') {
      throw new DataValidationError('Invalid host');
    }

    this.configuration.webServer = { ...config };
    await this.saveConfiguration();
  }

  /**
   * Export configuration for backup
   */
  exportConfiguration(): string {
    return serializeForStorage(this.configuration);
  }

  /**
   * Import configuration from backup
   */
  async importConfiguration(configData: string): Promise<void> {
    const parsed = parseFromStorage(configData);
    const validated = this.parseAndValidateConfiguration(parsed);
    
    this.configuration = validated;
    await this.saveConfiguration();
  }

  /**
   * Reset to default configuration
   */
  async resetToDefaults(): Promise<void> {
    this.configuration = this.createDefaultConfiguration();
    await this.saveConfiguration();
  }

  private createDefaultConfiguration(): ConfigurationData {
    return {
      system: createDefaultSystemSettings(),
      messageTemplates: [
        {
          id: 'default',
          name: 'Default Auto-Reply',
          content: 'Hi {name}! Thanks for your message. I\'ll get back to you soon.',
          isDefault: true,
          placeholders: ['{name}', '{time}']
        },
        {
          id: 'out-of-office',
          name: 'Out of Office',
          content: 'Thanks for your message! I\'m currently out of office and will respond when I return.',
          isDefault: false,
          placeholders: ['{time}'],
          timeBasedRules: [{
            startTime: '18:00',
            endTime: '09:00',
            days: [1, 2, 3, 4, 5, 6, 7]
          }]
        }
      ],
      webServer: {
        port: 3000,
        host: 'localhost'
      }
    };
  }

  private parseAndValidateConfiguration(data: any): ConfigurationData {
    if (!data || typeof data !== 'object') {
      throw new DataValidationError('Configuration must be an object');
    }

    // Validate system settings
    const system = validateAndParseSystemSettings(data.system);

    // Validate message templates
    const messageTemplates = validateAndParseMessageTemplates(data.messageTemplates || []);

    // Validate web server config
    const webServer = data.webServer || { port: 3000, host: 'localhost' };
    if (typeof webServer.port !== 'number' || webServer.port < 1 || webServer.port > 65535) {
      throw new DataValidationError('Invalid web server port');
    }
    if (typeof webServer.host !== 'string') {
      throw new DataValidationError('Invalid web server host');
    }

    return {
      system,
      messageTemplates,
      webServer
    };
  }
}