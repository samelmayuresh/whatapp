import { ConfigValidator } from '../ConfigValidator';

describe('ConfigValidator', () => {
  describe('validateConfiguration', () => {
    it('should validate a complete valid configuration', () => {
      const config = {
        system: {
          enabled: true,
          pauseWhenActive: false,
          businessHours: {
            start: '09:00',
            end: '17:00',
            days: [1, 2, 3, 4, 5]
          },
          rateLimitMinutes: 30,
          blacklistedContacts: []
        },
        messageTemplates: [{
          id: 'default',
          name: 'Default Template',
          content: 'Hello {name}!',
          isDefault: true,
          placeholders: ['{name}']
        }],
        webServer: {
          port: 3000,
          host: 'localhost'
        }
      };

      const result = ConfigValidator.validateConfiguration(config);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid configuration object', () => {
      const result = ConfigValidator.validateConfiguration(null);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Configuration must be an object');
    });

    it('should reject configuration missing system settings', () => {
      const config = {
        messageTemplates: [],
        webServer: { port: 3000, host: 'localhost' }
      };

      const result = ConfigValidator.validateConfiguration(config);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Missing system configuration');
    });

    it('should reject configuration missing message templates', () => {
      const config = {
        system: {
          enabled: true,
          pauseWhenActive: false,
          businessHours: { start: '09:00', end: '17:00', days: [1, 2, 3, 4, 5] },
          rateLimitMinutes: 30,
          blacklistedContacts: []
        },
        webServer: { port: 3000, host: 'localhost' }
      };

      const result = ConfigValidator.validateConfiguration(config);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Missing message templates');
    });
  });

  describe('validateSystemSettings', () => {
    it('should validate valid system settings', () => {
      const settings = {
        enabled: true,
        pauseWhenActive: false,
        businessHours: {
          start: '09:00',
          end: '17:00',
          days: [1, 2, 3, 4, 5]
        },
        rateLimitMinutes: 30,
        blacklistedContacts: []
      };

      const result = ConfigValidator.validateSystemSettings(settings);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should warn about very low rate limit', () => {
      const settings = {
        enabled: true,
        pauseWhenActive: false,
        businessHours: { start: '09:00', end: '17:00', days: [1, 2, 3, 4, 5] },
        rateLimitMinutes: 0.5,
        blacklistedContacts: []
      };

      const result = ConfigValidator.validateSystemSettings(settings);
      
      expect(result.warnings).toContain('Rate limit is very low, may cause performance issues');
    });

    it('should warn about very high rate limit', () => {
      const settings = {
        enabled: true,
        pauseWhenActive: false,
        businessHours: { start: '09:00', end: '17:00', days: [1, 2, 3, 4, 5] },
        rateLimitMinutes: 2000,
        blacklistedContacts: []
      };

      const result = ConfigValidator.validateSystemSettings(settings);
      
      expect(result.warnings).toContain('Rate limit is very high, auto-replies may be infrequent');
    });

    it('should warn about invalid business hours', () => {
      const settings = {
        enabled: true,
        pauseWhenActive: false,
        businessHours: {
          start: '17:00',
          end: '09:00', // End before start
          days: [1, 2, 3, 4, 5]
        },
        rateLimitMinutes: 30,
        blacklistedContacts: []
      };

      const result = ConfigValidator.validateSystemSettings(settings);
      
      expect(result.warnings).toContain('Business hours end time should be after start time');
    });
  });

  describe('validateMessageTemplates', () => {
    it('should validate valid message templates', () => {
      const templates = [{
        id: 'default',
        name: 'Default Template',
        content: 'Hello {name}!',
        isDefault: true,
        placeholders: ['{name}']
      }];

      const result = ConfigValidator.validateMessageTemplates(templates);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject non-array templates', () => {
      const result = ConfigValidator.validateMessageTemplates('not an array');
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Message templates must be an array');
    });

    it('should reject empty templates array', () => {
      const result = ConfigValidator.validateMessageTemplates([]);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('At least one message template is required');
    });

    it('should reject duplicate template IDs', () => {
      const templates = [
        {
          id: 'duplicate',
          name: 'Template 1',
          content: 'Content 1',
          isDefault: true,
          placeholders: []
        },
        {
          id: 'duplicate',
          name: 'Template 2',
          content: 'Content 2',
          isDefault: false,
          placeholders: []
        }
      ];

      const result = ConfigValidator.validateMessageTemplates(templates);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Duplicate template ID: duplicate');
    });

    it('should require at least one default template', () => {
      const templates = [{
        id: 'template1',
        name: 'Template 1',
        content: 'Content',
        isDefault: false,
        placeholders: []
      }];

      const result = ConfigValidator.validateMessageTemplates(templates);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('At least one template must be marked as default');
    });

    it('should warn about multiple default templates', () => {
      const templates = [
        {
          id: 'template1',
          name: 'Template 1',
          content: 'Content 1',
          isDefault: true,
          placeholders: []
        },
        {
          id: 'template2',
          name: 'Template 2',
          content: 'Content 2',
          isDefault: true,
          placeholders: []
        }
      ];

      const result = ConfigValidator.validateMessageTemplates(templates);
      
      expect(result.warnings).toContain('Multiple templates marked as default, only one will be used');
    });

    it('should warn about unused placeholders', () => {
      const templates = [{
        id: 'template1',
        name: 'Template 1',
        content: 'Hello there!',
        isDefault: true,
        placeholders: ['{name}', '{time}'] // Unused placeholders
      }];

      const result = ConfigValidator.validateMessageTemplates(templates);
      
      expect(result.warnings).toContain('Template \'Template 1\' has unused placeholders: {name}, {time}');
    });

    it('should warn about undeclared placeholders', () => {
      const templates = [{
        id: 'template1',
        name: 'Template 1',
        content: 'Hello {name}! Today is {date}.',
        isDefault: true,
        placeholders: ['{name}'] // Missing {date}
      }];

      const result = ConfigValidator.validateMessageTemplates(templates);
      
      expect(result.warnings).toContain('Template \'Template 1\' uses undeclared placeholders: {date}');
    });

    it('should warn about empty template content', () => {
      const templates = [{
        id: 'template1',
        name: 'Empty Template',
        content: '   ', // Empty/whitespace only
        isDefault: true,
        placeholders: []
      }];

      const result = ConfigValidator.validateMessageTemplates(templates);
      
      expect(result.warnings).toContain('Template \'Empty Template\' has empty content');
    });
  });

  describe('validateWebServerConfig', () => {
    it('should validate valid web server config', () => {
      const config = {
        port: 3000,
        host: 'localhost'
      };

      const result = ConfigValidator.validateWebServerConfig(config);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid port numbers', () => {
      const config = {
        port: 70000, // Too high
        host: 'localhost'
      };

      const result = ConfigValidator.validateWebServerConfig(config);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Web server port must be between 1 and 65535');
    });

    it('should warn about privileged ports', () => {
      const config = {
        port: 80,
        host: 'localhost'
      };

      const result = ConfigValidator.validateWebServerConfig(config);
      
      expect(result.warnings).toContain('Using privileged port (< 1024), may require elevated permissions');
    });

    it('should warn about binding to all interfaces', () => {
      const config = {
        port: 3000,
        host: '0.0.0.0'
      };

      const result = ConfigValidator.validateWebServerConfig(config);
      
      expect(result.warnings).toContain('Web server bound to all interfaces, ensure proper security measures');
    });

    it('should reject non-string host', () => {
      const config = {
        port: 3000,
        host: 123
      };

      const result = ConfigValidator.validateWebServerConfig(config);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Web server host must be a string');
    });
  });
});