import * as fs from 'fs-extra';
import * as path from 'path';
import { ConfigurationManager } from '../ConfigurationManager';
import { MessageTemplate } from '../../models/MessageTemplate';
import { SystemSettings } from '../../models/SystemSettings';

// Mock fs-extra
jest.mock('fs-extra');
const mockedFs = fs as jest.Mocked<typeof fs>;

describe('ConfigurationManager', () => {
  let configManager: ConfigurationManager;
  let testConfigDir: string;

  beforeEach(() => {
    jest.clearAllMocks();
    testConfigDir = 'test-config';
    configManager = new ConfigurationManager(testConfigDir);
  });

  describe('initialize', () => {
    it('should load existing configuration', async () => {
      const mockConfig = {
        system: {
          enabled: true,
          pauseWhenActive: false,
          businessHours: { start: '09:00', end: '17:00', days: [1, 2, 3, 4, 5] },
          rateLimitMinutes: 30,
          blacklistedContacts: []
        },
        messageTemplates: [{
          id: 'test',
          name: 'Test Template',
          content: 'Hello {name}',
          isDefault: true,
          placeholders: ['{name}']
        }],
        webServer: { port: 3000, host: 'localhost' }
      };

      mockedFs.pathExists.mockResolvedValue(true);
      mockedFs.readJson.mockResolvedValue(mockConfig);

      await configManager.initialize();

      expect(mockedFs.readJson).toHaveBeenCalledWith(path.join(testConfigDir, 'settings.json'));
    });

    it('should create default configuration if file does not exist', async () => {
      mockedFs.pathExists.mockResolvedValue(false);
      mockedFs.ensureDir.mockResolvedValue();
      mockedFs.writeFile.mockResolvedValue();

      await configManager.initialize();

      expect(mockedFs.writeFile).toHaveBeenCalled();
    });

    it('should load from default.json if settings.json does not exist', async () => {
      const mockDefaultConfig = {
        system: {
          enabled: false,
          pauseWhenActive: true,
          businessHours: { start: '09:00', end: '17:00', days: [1, 2, 3, 4, 5] },
          rateLimitMinutes: 30,
          blacklistedContacts: []
        },
        messageTemplates: [{
          id: 'default',
          name: 'Default',
          content: 'Hi there!',
          isDefault: true,
          placeholders: []
        }],
        webServer: { port: 3000, host: 'localhost' }
      };

      mockedFs.pathExists
        .mockResolvedValueOnce(false) // settings.json doesn't exist
        .mockResolvedValueOnce(true); // default.json exists
      mockedFs.readJson.mockResolvedValue(mockDefaultConfig);
      mockedFs.ensureDir.mockResolvedValue();
      mockedFs.writeFile.mockResolvedValue();

      await configManager.initialize();

      expect(mockedFs.readJson).toHaveBeenCalledWith(path.join(testConfigDir, 'default.json'));
      expect(mockedFs.writeFile).toHaveBeenCalled(); // Should save as settings.json
    });
  });

  describe('saveConfiguration', () => {
    it('should create backup before saving', async () => {
      mockedFs.pathExists.mockResolvedValue(true);
      mockedFs.copy.mockResolvedValue();
      mockedFs.ensureDir.mockResolvedValue();
      mockedFs.writeFile.mockResolvedValue();

      await configManager.saveConfiguration();

      expect(mockedFs.copy).toHaveBeenCalledWith(
        path.join(testConfigDir, 'settings.json'),
        path.join(testConfigDir, 'settings.backup.json')
      );
      expect(mockedFs.writeFile).toHaveBeenCalled();
    });

    it('should handle save errors gracefully', async () => {
      mockedFs.pathExists.mockResolvedValue(false);
      mockedFs.ensureDir.mockResolvedValue();
      mockedFs.writeFile.mockRejectedValue(new Error('Write failed'));

      await expect(configManager.saveConfiguration()).rejects.toThrow('Failed to save configuration');
    });
  });

  describe('restoreFromBackup', () => {
    it('should restore from backup file', async () => {
      const mockConfig = {
        system: {
          enabled: true,
          pauseWhenActive: true,
          businessHours: { start: '09:00', end: '17:00', days: [1, 2, 3, 4, 5] },
          rateLimitMinutes: 30,
          blacklistedContacts: []
        },
        messageTemplates: [{
          id: 'backup',
          name: 'Backup Template',
          content: 'Restored',
          isDefault: true,
          placeholders: []
        }],
        webServer: { port: 3000, host: 'localhost' }
      };

      mockedFs.pathExists.mockResolvedValue(true);
      mockedFs.copy.mockResolvedValue();
      mockedFs.readJson.mockResolvedValue(mockConfig);

      await configManager.restoreFromBackup();

      expect(mockedFs.copy).toHaveBeenCalledWith(
        path.join(testConfigDir, 'settings.backup.json'),
        path.join(testConfigDir, 'settings.json')
      );
    });

    it('should throw error if no backup exists', async () => {
      mockedFs.pathExists.mockResolvedValue(false);

      await expect(configManager.restoreFromBackup()).rejects.toThrow('No backup file found');
    });
  });

  describe('message template management', () => {
    beforeEach(async () => {
      // Initialize with default config
      mockedFs.pathExists.mockResolvedValue(false);
      mockedFs.ensureDir.mockResolvedValue();
      mockedFs.writeFile.mockResolvedValue();
      await configManager.initialize();
    });

    it('should get default message template', () => {
      const defaultTemplate = configManager.getDefaultMessageTemplate();
      expect(defaultTemplate.isDefault).toBe(true);
      expect(defaultTemplate.id).toBe('default');
    });

    it('should get message template by ID', () => {
      const template = configManager.getMessageTemplate('default');
      expect(template).toBeDefined();
      expect(template!.id).toBe('default');
    });

    it('should return undefined for non-existent template', () => {
      const template = configManager.getMessageTemplate('non-existent');
      expect(template).toBeUndefined();
    });

    it('should add new message template', async () => {
      const newTemplate: MessageTemplate = {
        id: 'new-template',
        name: 'New Template',
        content: 'New message',
        isDefault: false,
        placeholders: []
      };

      await configManager.updateMessageTemplate(newTemplate);

      const retrieved = configManager.getMessageTemplate('new-template');
      expect(retrieved).toEqual(newTemplate);
    });

    it('should update existing message template', async () => {
      const updatedTemplate: MessageTemplate = {
        id: 'default',
        name: 'Updated Default',
        content: 'Updated content',
        isDefault: true,
        placeholders: []
      };

      await configManager.updateMessageTemplate(updatedTemplate);

      const retrieved = configManager.getMessageTemplate('default');
      expect(retrieved!.name).toBe('Updated Default');
      expect(retrieved!.content).toBe('Updated content');
    });

    it('should remove message template', async () => {
      // Add a second template first
      const secondTemplate: MessageTemplate = {
        id: 'second',
        name: 'Second Template',
        content: 'Second message',
        isDefault: false,
        placeholders: []
      };
      await configManager.updateMessageTemplate(secondTemplate);

      await configManager.removeMessageTemplate('second');

      const retrieved = configManager.getMessageTemplate('second');
      expect(retrieved).toBeUndefined();
    });

    it('should throw error when removing non-existent template', async () => {
      await expect(configManager.removeMessageTemplate('non-existent'))
        .rejects.toThrow('Template with id \'non-existent\' not found');
    });

    it('should ensure default template exists after removal', async () => {
      // Add a second template and make it default
      const secondTemplate: MessageTemplate = {
        id: 'second',
        name: 'Second Template',
        content: 'Second message',
        isDefault: false,
        placeholders: []
      };
      await configManager.updateMessageTemplate(secondTemplate);

      // Remove the original default
      await configManager.removeMessageTemplate('default');

      // The remaining template should become default
      const templates = configManager.getMessageTemplates();
      expect(templates.some(t => t.isDefault)).toBe(true);
    });
  });

  describe('blacklist management', () => {
    beforeEach(async () => {
      mockedFs.pathExists.mockResolvedValue(false);
      mockedFs.ensureDir.mockResolvedValue();
      mockedFs.writeFile.mockResolvedValue();
      await configManager.initialize();
    });

    it('should check if contact is blacklisted', () => {
      expect(configManager.isBlacklisted('test-contact')).toBe(false);
    });

    it('should add contact to blacklist', async () => {
      await configManager.addToBlacklist('test-contact');
      expect(configManager.isBlacklisted('test-contact')).toBe(true);
    });

    it('should not add duplicate contacts to blacklist', async () => {
      await configManager.addToBlacklist('test-contact');
      await configManager.addToBlacklist('test-contact');
      
      const settings = configManager.getSystemSettings();
      const count = settings.blacklistedContacts.filter(c => c === 'test-contact').length;
      expect(count).toBe(1);
    });

    it('should remove contact from blacklist', async () => {
      await configManager.addToBlacklist('test-contact');
      await configManager.removeFromBlacklist('test-contact');
      
      expect(configManager.isBlacklisted('test-contact')).toBe(false);
    });
  });

  describe('system settings management', () => {
    beforeEach(async () => {
      mockedFs.pathExists.mockResolvedValue(false);
      mockedFs.ensureDir.mockResolvedValue();
      mockedFs.writeFile.mockResolvedValue();
      await configManager.initialize();
    });

    it('should get system settings', () => {
      const settings = configManager.getSystemSettings();
      expect(settings).toBeDefined();
      expect(typeof settings.enabled).toBe('boolean');
    });

    it('should update system settings', async () => {
      const newSettings: SystemSettings = {
        enabled: true,
        pauseWhenActive: false,
        businessHours: {
          start: '08:00',
          end: '18:00',
          days: [1, 2, 3, 4, 5, 6]
        },
        rateLimitMinutes: 60,
        blacklistedContacts: ['blocked-user']
      };

      await configManager.updateSystemSettings(newSettings);

      const retrieved = configManager.getSystemSettings();
      expect(retrieved.enabled).toBe(true);
      expect(retrieved.pauseWhenActive).toBe(false);
      expect(retrieved.rateLimitMinutes).toBe(60);
      expect(retrieved.blacklistedContacts).toEqual(['blocked-user']);
    });
  });

  describe('configuration export/import', () => {
    beforeEach(async () => {
      mockedFs.pathExists.mockResolvedValue(false);
      mockedFs.ensureDir.mockResolvedValue();
      mockedFs.writeFile.mockResolvedValue();
      await configManager.initialize();
    });

    it('should export configuration as JSON string', () => {
      const exported = configManager.exportConfiguration();
      expect(typeof exported).toBe('string');
      
      const parsed = JSON.parse(exported);
      expect(parsed.system).toBeDefined();
      expect(parsed.messageTemplates).toBeDefined();
      expect(parsed.webServer).toBeDefined();
    });

    it('should import configuration from JSON string', async () => {
      const configData = {
        system: {
          enabled: true,
          pauseWhenActive: false,
          businessHours: { start: '10:00', end: '16:00', days: [1, 2, 3] },
          rateLimitMinutes: 45,
          blacklistedContacts: ['imported-blocked']
        },
        messageTemplates: [{
          id: 'imported',
          name: 'Imported Template',
          content: 'Imported message',
          isDefault: true,
          placeholders: []
        }],
        webServer: { port: 4000, host: '0.0.0.0' }
      };

      await configManager.importConfiguration(JSON.stringify(configData));

      const settings = configManager.getSystemSettings();
      expect(settings.enabled).toBe(true);
      expect(settings.rateLimitMinutes).toBe(45);
      
      const template = configManager.getMessageTemplate('imported');
      expect(template).toBeDefined();
      expect(template!.name).toBe('Imported Template');
    });
  });

  describe('resetToDefaults', () => {
    it('should reset configuration to defaults', async () => {
      mockedFs.pathExists.mockResolvedValue(false);
      mockedFs.ensureDir.mockResolvedValue();
      mockedFs.writeFile.mockResolvedValue();

      // Initialize and modify configuration
      await configManager.initialize();
      await configManager.addToBlacklist('test-contact');

      // Reset to defaults
      await configManager.resetToDefaults();

      const settings = configManager.getSystemSettings();
      expect(settings.blacklistedContacts).toEqual([]);
      expect(settings.enabled).toBe(false);
    });
  });
});