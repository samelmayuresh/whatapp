import { Client, LocalAuth, Message as WhatsAppMessage } from 'whatsapp-web.js';
import { EventEmitter } from 'events';
import * as qrcode from 'qrcode-terminal';
import { Message, createMessageFromWhatsApp } from '../models/Message';
import { Contact, createContactFromWhatsApp } from '../models/Contact';

export interface WhatsAppClientEvents {
  'ready': () => void;
  'qr': (qr: string) => void;
  'message': (message: Message) => void;
  'disconnected': (reason: string) => void;
  'auth_failure': (message: string) => void;
  'authenticated': () => void;
  'error': (error: Error) => void;
}

export class WhatsAppClient extends EventEmitter {
  private client: Client;
  private isInitialized: boolean = false;
  private clientReady: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 5000; // 5 seconds
  private contacts: Map<string, Contact> = new Map();

  constructor() {
    super();
    this.client = new Client({
      authStrategy: new LocalAuth({
        clientId: 'whatsapp-auto-reply'
      }),
      puppeteer: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
          '--disable-gpu',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--disable-extensions',
          '--disable-plugins',
          '--disable-default-apps',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--disable-ipc-flooding-protection',
          '--disable-hang-monitor',
          '--disable-client-side-phishing-detection',
          '--disable-component-update',
          '--disable-domain-reliability',
          '--disable-sync',
          '--disable-translate',
          '--hide-scrollbars',
          '--mute-audio',
          '--no-default-browser-check',
          '--no-pings',
          '--password-store=basic',
          '--use-mock-keychain',
          '--disable-blink-features=AutomationControlled'
        ],
        timeout: 120000,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
      }
    });

    this.setupEventHandlers();
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      throw new Error('WhatsApp client is already initialized');
    }

    try {
      console.log('Initializing WhatsApp client...');
      await this.client.initialize();
      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize WhatsApp client:', error);
      throw error;
    }
  }

  async destroy(): Promise<void> {
    if (!this.isInitialized) {
      return;
    }

    try {
      console.log('Destroying WhatsApp client...');
      await this.client.destroy();
      this.isInitialized = false;
      this.clientReady = false;
      this.contacts.clear();
    } catch (error) {
      console.error('Error destroying WhatsApp client:', error);
      throw error;
    }
  }

  async sendMessage(chatId: string, text: string): Promise<void> {
    if (!this.clientReady) {
      throw new Error('WhatsApp client is not ready');
    }

    if (!text || text.trim() === '') {
      throw new Error('Message text cannot be empty');
    }

    try {
      await this.client.sendMessage(chatId, text.trim());
      console.log(`Message sent to ${chatId}: ${text.substring(0, 50)}...`);
    } catch (error) {
      console.error(`Failed to send message to ${chatId}:`, error);
      throw error;
    }
  }

  async getContacts(): Promise<Contact[]> {
    if (!this.clientReady) {
      throw new Error('WhatsApp client is not ready');
    }

    try {
      const whatsappContacts = await this.client.getContacts();
      const contacts: Contact[] = [];

      for (const contact of whatsappContacts) {
        if (contact.id && contact.id.user) {
          const contactObj = createContactFromWhatsApp(
            contact.id._serialized,
            contact.name || contact.pushname || '',
            contact.number || contact.id.user
          );
          contacts.push(contactObj);
          this.contacts.set(contact.id._serialized, contactObj);
        }
      }

      console.log(`Loaded ${contacts.length} contacts`);
      return contacts;
    } catch (error) {
      console.error('Failed to get contacts:', error);
      throw error;
    }
  }

  getContact(contactId: string): Contact | undefined {
    return this.contacts.get(contactId);
  }

  getContactName(contactId: string): string {
    const contact = this.contacts.get(contactId);
    return contact?.name || contactId;
  }

  isClientReady(): boolean {
    return this.clientReady;
  }

  isReady(): boolean {
    return this.clientReady;
  }

  isClientInitialized(): boolean {
    return this.isInitialized;
  }

  async getClientInfo(): Promise<any> {
    if (!this.clientReady) {
      throw new Error('WhatsApp client is not ready');
    }

    try {
      const info = this.client.info;
      return {
        wid: info?.wid,
        pushname: info?.pushname,
        platform: info?.platform
      };
    } catch (error) {
      console.error('Failed to get client info:', error);
      throw error;
    }
  }

  private setupEventHandlers(): void {
    this.client.on('qr', (qr) => {
      console.log('QR Code received, scan with your phone:');
      qrcode.generate(qr, { small: true });
      this.emit('qr', qr);
    });

    this.client.on('authenticated', () => {
      console.log('WhatsApp client authenticated');
      this.emit('authenticated');
    });

    this.client.on('auth_failure', (msg) => {
      console.error('WhatsApp authentication failed:', msg);
      this.emit('auth_failure', msg);
    });

    this.client.on('ready', async () => {
      console.log('WhatsApp client is ready!');
      this.clientReady = true;
      this.reconnectAttempts = 0;
      
      try {
        await this.getContacts();
      } catch (error) {
        console.error('Failed to load contacts on ready:', error);
      }
      
      this.emit('ready');
    });

    this.client.on('message', async (msg: WhatsAppMessage) => {
      try {
        if (msg.fromMe) {
          return;
        }

        if (msg.from === 'status@broadcast') {
          return;
        }

        const message = createMessageFromWhatsApp(msg);
        
        // Handle contact name updates from WhatsApp message
        const msgWithNotify = msg as any; // Type assertion to access notifyName
        if (msgWithNotify.notifyName && this.contacts.has(message.from)) {
          const contact = this.contacts.get(message.from)!;
          if (contact.name !== msgWithNotify.notifyName) {
            contact.name = msgWithNotify.notifyName;
            this.contacts.set(message.from, contact);
          }
        }

        console.log(`Message received from ${message.contactName || message.from}: ${message.body.substring(0, 50)}...`);
        this.emit('message', message);
      } catch (error) {
        console.error('Error processing incoming message:', error);
        this.emit('error', error as Error);
      }
    });

    this.client.on('disconnected', (reason) => {
      console.log('WhatsApp client disconnected:', reason);
      this.clientReady = false;
      this.emit('disconnected', reason);
      
      this.attemptReconnect();
    });

    this.client.on('error', (error) => {
      console.error('WhatsApp client error:', error);
      this.emit('error', error);
    });
  }

  private async attemptReconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached, giving up');
      return;
    }

    this.reconnectAttempts++;
    console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

    setTimeout(async () => {
      try {
        if (!this.clientReady) {
          await this.client.initialize();
        }
      } catch (error) {
        console.error('Reconnection attempt failed:', error);
        this.attemptReconnect();
      }
    }, this.reconnectDelay * this.reconnectAttempts);
  }
}