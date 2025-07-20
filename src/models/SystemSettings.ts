export interface BusinessHours {
  start: string; // "09:00"
  end: string;   // "17:00"
  days: number[]; // [1,2,3,4,5] for Mon-Fri
}

export interface SystemSettings {
  enabled: boolean;
  pauseWhenActive: boolean;
  businessHours: BusinessHours;
  rateLimitMinutes: number; // default 30
  blacklistedContacts: string[];
}

export function validateSystemSettings(settings: any): settings is SystemSettings {
  if (!settings || typeof settings !== 'object') {
    return false;
  }

  if (typeof settings.enabled !== 'boolean') {
    return false;
  }

  if (typeof settings.pauseWhenActive !== 'boolean') {
    return false;
  }

  if (!validateBusinessHours(settings.businessHours)) {
    return false;
  }

  if (typeof settings.rateLimitMinutes !== 'number' || settings.rateLimitMinutes < 1) {
    return false;
  }

  if (!Array.isArray(settings.blacklistedContacts)) {
    return false;
  }

  for (const contact of settings.blacklistedContacts) {
    if (typeof contact !== 'string') {
      return false;
    }
  }

  return true;
}

export function validateBusinessHours(hours: any): hours is BusinessHours {
  if (!hours || typeof hours !== 'object') {
    return false;
  }

  if (typeof hours.start !== 'string' || !isValidTimeFormat(hours.start)) {
    return false;
  }

  if (typeof hours.end !== 'string' || !isValidTimeFormat(hours.end)) {
    return false;
  }

  if (!Array.isArray(hours.days) || hours.days.length === 0) {
    return false;
  }

  for (const day of hours.days) {
    if (typeof day !== 'number' || day < 1 || day > 7) {
      return false;
    }
  }

  return true;
}

function isValidTimeFormat(time: string): boolean {
  const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
  return timeRegex.test(time);
}

export function createDefaultSystemSettings(): SystemSettings {
  return {
    enabled: false,
    pauseWhenActive: true,
    businessHours: {
      start: "09:00",
      end: "17:00",
      days: [1, 2, 3, 4, 5] // Monday to Friday
    },
    rateLimitMinutes: 30,
    blacklistedContacts: []
  };
}