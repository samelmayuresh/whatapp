import { MessageTemplate, validateMessageTemplate } from '../models/MessageTemplate';
import { SystemSettings, validateSystemSettings } from '../models/SystemSettings';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export class ConfigValidator {
  /**
   * Validate complete configuration object
   */
  static validateConfiguration(config: any): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: []
    };

    if (!config || typeof config !== 'object') {
      result.isValid = false;
      result.errors.push('Configuration must be an object');
      return result;
    }

    // Validate system settings
    if (!config.system) {
      result.isValid = false;
      result.errors.push('Missing system configuration');
    } else {
      const systemValidation = this.validateSystemSettings(config.system);
      result.errors.push(...systemValidation.errors);
      result.warnings.push(...systemValidation.warnings);
      if (!systemValidation.isValid) {
        result.isValid = false;
      }
    }

    // Validate message templates
    if (!config.messageTemplates) {
      result.isValid = false;
      result.errors.push('Missing message templates');
    } else {
      const templatesValidation = this.validateMessageTemplates(config.messageTemplates);
      result.errors.push(...templatesValidation.errors);
      result.warnings.push(...templatesValidation.warnings);
      if (!templatesValidation.isValid) {
        result.isValid = false;
      }
    }

    // Validate web server config
    if (config.webServer) {
      const webServerValidation = this.validateWebServerConfig(config.webServer);
      result.errors.push(...webServerValidation.errors);
      result.warnings.push(...webServerValidation.warnings);
      if (!webServerValidation.isValid) {
        result.isValid = false;
      }
    }

    return result;
  }

  /**
   * Validate system settings
   */
  static validateSystemSettings(settings: any): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: []
    };

    if (!validateSystemSettings(settings)) {
      result.isValid = false;
      result.errors.push('Invalid system settings format');
      return result;
    }

    // Additional business logic validations
    if (settings.rateLimitMinutes < 1) {
      result.warnings.push('Rate limit is very low, may cause performance issues');
    }

    if (settings.rateLimitMinutes > 1440) { // 24 hours
      result.warnings.push('Rate limit is very high, auto-replies may be infrequent');
    }

    if (settings.businessHours) {
      const start = this.parseTime(settings.businessHours.start);
      const end = this.parseTime(settings.businessHours.end);
      
      if (start >= end) {
        result.warnings.push('Business hours end time should be after start time');
      }

      if (settings.businessHours.days.length === 0) {
        result.warnings.push('No business days configured');
      }
    }

    return result;
  }

  /**
   * Validate message templates array
   */
  static validateMessageTemplates(templates: any): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: []
    };

    if (!Array.isArray(templates)) {
      result.isValid = false;
      result.errors.push('Message templates must be an array');
      return result;
    }

    if (templates.length === 0) {
      result.isValid = false;
      result.errors.push('At least one message template is required');
      return result;
    }

    const templateIds = new Set<string>();
    let defaultCount = 0;

    for (let i = 0; i < templates.length; i++) {
      const template = templates[i];
      
      if (!validateMessageTemplate(template)) {
        result.isValid = false;
        result.errors.push(`Invalid message template at index ${i}`);
        continue;
      }

      // Check for duplicate IDs
      if (templateIds.has(template.id)) {
        result.isValid = false;
        result.errors.push(`Duplicate template ID: ${template.id}`);
      }
      templateIds.add(template.id);

      // Count default templates
      if (template.isDefault) {
        defaultCount++;
      }

      // Validate template content
      if (template.content.trim().length === 0) {
        result.warnings.push(`Template '${template.name}' has empty content`);
      }

      // Check for unused placeholders
      const contentPlaceholders = this.extractPlaceholders(template.content);
      const unusedPlaceholders = template.placeholders.filter(p => !contentPlaceholders.includes(p));
      if (unusedPlaceholders.length > 0) {
        result.warnings.push(`Template '${template.name}' has unused placeholders: ${unusedPlaceholders.join(', ')}`);
      }

      // Check for undeclared placeholders
      const undeclaredPlaceholders = contentPlaceholders.filter(p => !template.placeholders.includes(p));
      if (undeclaredPlaceholders.length > 0) {
        result.warnings.push(`Template '${template.name}' uses undeclared placeholders: ${undeclaredPlaceholders.join(', ')}`);
      }
    }

    // Check default template count
    if (defaultCount === 0) {
      result.isValid = false;
      result.errors.push('At least one template must be marked as default');
    } else if (defaultCount > 1) {
      result.warnings.push('Multiple templates marked as default, only one will be used');
    }

    return result;
  }

  /**
   * Validate web server configuration
   */
  static validateWebServerConfig(config: any): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: []
    };

    if (!config || typeof config !== 'object') {
      result.isValid = false;
      result.errors.push('Web server config must be an object');
      return result;
    }

    if (typeof config.port !== 'number') {
      result.isValid = false;
      result.errors.push('Web server port must be a number');
    } else if (config.port < 1 || config.port > 65535) {
      result.isValid = false;
      result.errors.push('Web server port must be between 1 and 65535');
    } else if (config.port < 1024) {
      result.warnings.push('Using privileged port (< 1024), may require elevated permissions');
    }

    if (typeof config.host !== 'string') {
      result.isValid = false;
      result.errors.push('Web server host must be a string');
    } else if (config.host === '0.0.0.0') {
      result.warnings.push('Web server bound to all interfaces, ensure proper security measures');
    }

    return result;
  }

  private static parseTime(timeString: string): number {
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours * 60 + minutes;
  }

  private static extractPlaceholders(content: string): string[] {
    const placeholderRegex = /\{([^}]+)\}/g;
    const placeholders: string[] = [];
    let match;

    while ((match = placeholderRegex.exec(content)) !== null) {
      const placeholder = `{${match[1]}}`;
      if (!placeholders.includes(placeholder)) {
        placeholders.push(placeholder);
      }
    }

    return placeholders;
  }
}