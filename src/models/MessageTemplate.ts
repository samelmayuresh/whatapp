export interface TimeRule {
  startTime: string; // "09:00"
  endTime: string;   // "17:00"
  days: number[];    // [1,2,3,4,5] for Mon-Fri (1=Monday, 7=Sunday)
}

export interface MessageTemplate {
  id: string;
  name: string;
  content: string;
  isDefault: boolean;
  timeBasedRules?: TimeRule[];
  placeholders: string[]; // e.g., ['{name}', '{time}']
}

export function validateMessageTemplate(template: any): template is MessageTemplate {
  if (!template || typeof template !== 'object') {
    return false;
  }

  const required = ['id', 'name', 'content', 'isDefault', 'placeholders'];
  for (const field of required) {
    if (!(field in template)) {
      return false;
    }
  }

  if (typeof template.id !== 'string' || template.id.trim() === '') {
    return false;
  }

  if (typeof template.name !== 'string' || template.name.trim() === '') {
    return false;
  }

  if (typeof template.content !== 'string' || template.content.trim() === '') {
    return false;
  }

  if (typeof template.isDefault !== 'boolean') {
    return false;
  }

  if (!Array.isArray(template.placeholders)) {
    return false;
  }

  // Validate time-based rules if present
  if (template.timeBasedRules) {
    if (!Array.isArray(template.timeBasedRules)) {
      return false;
    }

    for (const rule of template.timeBasedRules) {
      if (!validateTimeRule(rule)) {
        return false;
      }
    }
  }

  return true;
}

export function validateTimeRule(rule: any): rule is TimeRule {
  if (!rule || typeof rule !== 'object') {
    return false;
  }

  if (typeof rule.startTime !== 'string' || !isValidTimeFormat(rule.startTime)) {
    return false;
  }

  if (typeof rule.endTime !== 'string' || !isValidTimeFormat(rule.endTime)) {
    return false;
  }

  if (!Array.isArray(rule.days) || rule.days.length === 0) {
    return false;
  }

  for (const day of rule.days) {
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