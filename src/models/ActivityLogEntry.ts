export type ActivityLogType = 
  | 'message_received' 
  | 'reply_sent' 
  | 'error' 
  | 'system_event'
  | 'connection_status'
  | 'rate_limit_hit';

export interface ActivityLogEntry {
  timestamp: Date;
  type: ActivityLogType;
  chatId: string;
  contactName?: string;
  messageContent?: string;
  replyContent?: string;
  error?: string;
  metadata?: Record<string, any>;
}

export function validateActivityLogEntry(entry: any): entry is ActivityLogEntry {
  if (!entry || typeof entry !== 'object') {
    return false;
  }

  if (!(entry.timestamp instanceof Date) && typeof entry.timestamp !== 'string') {
    return false;
  }

  const validTypes: ActivityLogType[] = [
    'message_received', 
    'reply_sent', 
    'error', 
    'system_event',
    'connection_status',
    'rate_limit_hit'
  ];

  if (!validTypes.includes(entry.type)) {
    return false;
  }

  if (typeof entry.chatId !== 'string') {
    return false;
  }

  // Optional fields validation
  if (entry.contactName !== undefined && typeof entry.contactName !== 'string') {
    return false;
  }

  if (entry.messageContent !== undefined && typeof entry.messageContent !== 'string') {
    return false;
  }

  if (entry.replyContent !== undefined && typeof entry.replyContent !== 'string') {
    return false;
  }

  if (entry.error !== undefined && typeof entry.error !== 'string') {
    return false;
  }

  if (entry.metadata !== undefined && (typeof entry.metadata !== 'object' || entry.metadata === null)) {
    return false;
  }

  return true;
}

export function createActivityLogEntry(
  type: ActivityLogType,
  chatId: string,
  options: {
    contactName?: string;
    messageContent?: string;
    replyContent?: string;
    error?: string;
    metadata?: Record<string, any>;
  } = {}
): ActivityLogEntry {
  return {
    timestamp: new Date(),
    type,
    chatId,
    ...options
  };
}

export function serializeActivityLogEntry(entry: ActivityLogEntry): string {
  const serializable = {
    ...entry,
    timestamp: entry.timestamp.toISOString()
  };
  return JSON.stringify(serializable);
}

export function deserializeActivityLogEntry(data: string): ActivityLogEntry {
  const parsed = JSON.parse(data);
  return {
    ...parsed,
    timestamp: new Date(parsed.timestamp)
  };
}