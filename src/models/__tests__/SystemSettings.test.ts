import { SystemSettings, validateSystemSettings, createDefaultSystemSettings, BusinessHours, validateBusinessHours } from '../SystemSettings';

describe('SystemSettings', () => {
  describe('validateSystemSettings', () => {
    it('should validate valid system settings', () => {
      const settings: SystemSettings = {
        enabled: true,
        pauseWhenActive: false,
        businessHours: {
          start: '09:00',
          end: '17:00',
          days: [1, 2, 3, 4, 5]
        },
        rateLimitMinutes: 30,
        blacklistedContacts: ['123456789']
      };

      expect(validateSystemSettings(settings)).toBe(true);
    });

    it('should reject settings with invalid rate limit', () => {
      const settings = {
        enabled: true,
        pauseWhenActive: false,
        businessHours: {
          start: '09:00',
          end: '17:00',
          days: [1, 2, 3, 4, 5]
        },
        rateLimitMinutes: 0, // invalid
        blacklistedContacts: []
      };

      expect(validateSystemSettings(settings)).toBe(false);
    });

    it('should reject settings with invalid blacklisted contacts', () => {
      const settings = {
        enabled: true,
        pauseWhenActive: false,
        businessHours: {
          start: '09:00',
          end: '17:00',
          days: [1, 2, 3, 4, 5]
        },
        rateLimitMinutes: 30,
        blacklistedContacts: [123] // should be strings
      };

      expect(validateSystemSettings(settings)).toBe(false);
    });
  });

  describe('validateBusinessHours', () => {
    it('should validate valid business hours', () => {
      const hours: BusinessHours = {
        start: '09:00',
        end: '17:00',
        days: [1, 2, 3, 4, 5]
      };

      expect(validateBusinessHours(hours)).toBe(true);
    });

    it('should reject invalid time format', () => {
      const hours = {
        start: '25:00', // invalid
        end: '17:00',
        days: [1, 2, 3, 4, 5]
      };

      expect(validateBusinessHours(hours)).toBe(false);
    });

    it('should reject empty days array', () => {
      const hours = {
        start: '09:00',
        end: '17:00',
        days: []
      };

      expect(validateBusinessHours(hours)).toBe(false);
    });
  });

  describe('createDefaultSystemSettings', () => {
    it('should create valid default settings', () => {
      const defaults = createDefaultSystemSettings();
      
      expect(validateSystemSettings(defaults)).toBe(true);
      expect(defaults.enabled).toBe(false);
      expect(defaults.pauseWhenActive).toBe(true);
      expect(defaults.rateLimitMinutes).toBe(30);
      expect(defaults.blacklistedContacts).toEqual([]);
      expect(defaults.businessHours.days).toEqual([1, 2, 3, 4, 5]);
    });
  });
});