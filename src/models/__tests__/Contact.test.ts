import { Contact, validateContact, normalizePhoneNumber, createContactFromWhatsApp } from '../Contact';

describe('Contact', () => {
  describe('validateContact', () => {
    it('should validate a valid contact', () => {
      const contact: Contact = {
        id: 'contact-1',
        name: 'John Doe',
        number: '+1234567890',
        isBlacklisted: false
      };

      expect(validateContact(contact)).toBe(true);
    });

    it('should reject contact with empty id', () => {
      const contact = {
        id: '',
        name: 'John Doe',
        number: '+1234567890',
        isBlacklisted: false
      };

      expect(validateContact(contact)).toBe(false);
    });

    it('should reject contact with missing required fields', () => {
      const contact = {
        name: 'John Doe',
        number: '+1234567890'
        // missing id and isBlacklisted
      };

      expect(validateContact(contact)).toBe(false);
    });
  });

  describe('normalizePhoneNumber', () => {
    it('should preserve numbers with country code', () => {
      expect(normalizePhoneNumber('+1234567890')).toBe('+1234567890');
    });

    it('should remove non-digit characters except +', () => {
      expect(normalizePhoneNumber('+1 (234) 567-890')).toBe('+1234567890');
    });

    it('should handle numbers without country code', () => {
      expect(normalizePhoneNumber('1234567890')).toBe('1234567890');
    });

    it('should remove spaces and special characters', () => {
      expect(normalizePhoneNumber('123 456 7890')).toBe('1234567890');
    });
  });

  describe('createContactFromWhatsApp', () => {
    it('should create contact with all fields', () => {
      const contact = createContactFromWhatsApp('wa-id-123', 'John Doe', '+1234567890');
      
      expect(contact.id).toBe('wa-id-123');
      expect(contact.name).toBe('John Doe');
      expect(contact.number).toBe('+1234567890');
      expect(contact.isBlacklisted).toBe(false);
    });

    it('should use number as name fallback when name is empty', () => {
      const contact = createContactFromWhatsApp('wa-id-123', '', '+1234567890');
      
      expect(contact.name).toBe('+1234567890');
    });

    it('should normalize the phone number', () => {
      const contact = createContactFromWhatsApp('wa-id-123', 'John', '+1 (234) 567-890');
      
      expect(contact.number).toBe('+1234567890');
    });
  });
});