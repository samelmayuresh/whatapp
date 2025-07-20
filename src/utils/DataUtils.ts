import { MessageTemplate, validateMessageTemplate } from '../models/MessageTemplate';
import { SystemSettings, validateSystemSettings } from '../models/SystemSettings';
import { Contact, validateContact } from '../models/Contact';
import { ActivityLogEntry, validateActivityLogEntry } from '../models/ActivityLogEntry';

export class DataValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = 'DataValidationError';
  }
}

export function validateAndParseMessageTemplates(data: any): MessageTemplate[] {
  if (!Array.isArray(data)) {
    throw new DataValidationError('Message templates must be an array');
  }

  const templates: MessageTemplate[] = [];
  for (let i = 0; i < data.length; i++) {
    if (!validateMessageTemplate(data[i])) {
      throw new DataValidationError(`Invalid message template at index ${i}`);
    }
    templates.push(data[i]);
  }

  // Ensure at least one default template exists
  const hasDefault = templates.some(t => t.isDefault);
  if (!hasDefault && templates.length > 0) {
    templates[0].isDefault = true;
  }

  return templates;
}

export function validateAndParseSystemSettings(data: any): SystemSettings {
  if (!validateSystemSettings(data)) {
    throw new DataValidationError('Invalid system settings format');
  }
  return data;
}

export function validateAndParseContacts(data: any): Contact[] {
  if (!Array.isArray(data)) {
    throw new DataValidationError('Contacts must be an array');
  }

  const contacts: Contact[] = [];
  for (let i = 0; i < data.length; i++) {
    if (!validateContact(data[i])) {
      throw new DataValidationError(`Invalid contact at index ${i}`);
    }
    contacts.push(data[i]);
  }

  return contacts;
}

export function validateAndParseActivityLog(data: any): ActivityLogEntry[] {
  if (!Array.isArray(data)) {
    throw new DataValidationError('Activity log must be an array');
  }

  const entries: ActivityLogEntry[] = [];
  for (let i = 0; i < data.length; i++) {
    if (!validateActivityLogEntry(data[i])) {
      throw new DataValidationError(`Invalid activity log entry at index ${i}`);
    }
    
    // Convert timestamp string to Date if needed
    const entry = { ...data[i] };
    if (typeof entry.timestamp === 'string') {
      entry.timestamp = new Date(entry.timestamp);
    }
    
    entries.push(entry);
  }

  return entries;
}

export function serializeForStorage(data: any): string {
  return JSON.stringify(data, (key, value) => {
    if (value instanceof Date) {
      return value.toISOString();
    }
    return value;
  }, 2);
}

export function parseFromStorage<T>(jsonString: string): T {
  return JSON.parse(jsonString, (key, value) => {
    // Try to parse ISO date strings back to Date objects
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }
    return value;
  });
}