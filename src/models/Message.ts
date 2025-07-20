export interface Message {
  id: string;
  chatId: string;
  from: string;
  body: string;
  timestamp: Date;
  isGroup: boolean;
  contactName?: string;
}

export function validateMessage(message: any): message is Message {
  if (!message || typeof message !== 'object') {
    return false;
  }

  if (typeof message.id !== 'string' || message.id.trim() === '') {
    return false;
  }

  if (typeof message.chatId !== 'string' || message.chatId.trim() === '') {
    return false;
  }

  if (typeof message.from !== 'string' || message.from.trim() === '') {
    return false;
  }

  if (typeof message.body !== 'string') {
    return false;
  }

  if (!(message.timestamp instanceof Date) && typeof message.timestamp !== 'string') {
    return false;
  }

  if (typeof message.isGroup !== 'boolean') {
    return false;
  }

  if (message.contactName !== undefined && typeof message.contactName !== 'string') {
    return false;
  }

  return true;
}

export function createMessageFromWhatsApp(whatsappMessage: any): Message {
  return {
    id: whatsappMessage.id._serialized || whatsappMessage.id,
    chatId: whatsappMessage.from,
    from: whatsappMessage.from,
    body: whatsappMessage.body || '',
    timestamp: new Date(whatsappMessage.timestamp * 1000),
    isGroup: whatsappMessage.from.includes('@g.us'),
    contactName: whatsappMessage.notifyName || undefined
  };
}