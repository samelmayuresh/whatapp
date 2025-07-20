export interface Contact {
  id: string;
  name: string;
  number: string;
  isBlacklisted: boolean;
}

export function validateContact(contact: any): contact is Contact {
  if (!contact || typeof contact !== 'object') {
    return false;
  }

  if (typeof contact.id !== 'string' || contact.id.trim() === '') {
    return false;
  }

  if (typeof contact.name !== 'string' || contact.name.trim() === '') {
    return false;
  }

  if (typeof contact.number !== 'string' || contact.number.trim() === '') {
    return false;
  }

  if (typeof contact.isBlacklisted !== 'boolean') {
    return false;
  }

  return true;
}

export function normalizePhoneNumber(number: string): string {
  // Remove all non-digit characters except +
  const cleaned = number.replace(/[^\d+]/g, '');
  
  // If it starts with +, keep it, otherwise add country code logic if needed
  if (cleaned.startsWith('+')) {
    return cleaned;
  }
  
  // For now, return as-is, but this could be enhanced with country code detection
  return cleaned;
}

export function createContactFromWhatsApp(id: string, name: string, number: string): Contact {
  return {
    id,
    name: name || number, // Use number as fallback if name is empty
    number: normalizePhoneNumber(number),
    isBlacklisted: false
  };
}