import { WhatsAppClient } from '../WhatsAppClient';
import { Client } from 'whatsapp-web.js';

// Mock whatsapp-web.js
jest.mock('whatsapp-web.js');
jest.mock('qrcode-terminal');

const MockedClient = Client as jest.MockedClass<typeof Client>;

describe('WhatsAppClient', () => {
  let whatsappClient: WhatsAppClient;
  let mockClient: jest.Mocked<Client>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockClient = {
      initialize: jest.fn(),
      destroy: jest.fn(),
      sendMessage: jest.fn(),
      getContacts: jest.fn(),
      on: jest.fn(),
      info: {
        wid: 'test-wid',
        pushname: 'Test User',
        platform: 'web'
      }
    } as any;

    MockedClient.mockImplementation(() => mockClient);
    
    whatsappClient = new WhatsAppClient();
  });

  describe('initialize', () => {
    it('should initialize the WhatsApp client', async () => {
      mockClient.initialize.mockResolvedValue(undefined);

      await whatsappClient.initialize();

      expect(mockClient.initialize).toHaveBeenCalled();
      expect(whatsappClient.isClientInitialized()).toBe(true);
    });

    it('should throw error if already initialized', async () => {
      mockClient.initialize.mockResolvedValue(undefined);
      await whatsappClient.initialize();

      await expect(whatsappClient.initialize()).rejects.toThrow('WhatsApp client is already initialized');
    });

    it('should handle initialization errors', async () => {
      const error = new Error('Initialization failed');
      mockClient.initialize.mockRejectedValue(error);

      await expect(whatsappClient.initialize()).rejects.toThrow('Initialization failed');
    });
  });

  describe('destroy', () => {
    it('should destroy the WhatsApp client', async () => {
      mockClient.initialize.mockResolvedValue(undefined);
      mockClient.destroy.mockResolvedValue(undefined);

      await whatsappClient.initialize();
      await whatsappClient.destroy();

      expect(mockClient.destroy).toHaveBeenCalled();
      expect(whatsappClient.isClientInitialized()).toBe(false);
      expect(whatsappClient.isClientReady()).toBe(false);
    });

    it('should handle destroy when not initialized', async () => {
      await whatsappClient.destroy();
      expect(mockClient.destroy).not.toHaveBeenCalled();
    });
  });

  describe('sendMessage', () => {
    beforeEach(async () => {
      mockClient.initialize.mockResolvedValue(undefined);
      await whatsappClient.initialize();
      // Simulate ready state
      (whatsappClient as any).isReady = true;
    });

    it('should send a message', async () => {
      mockClient.sendMessage.mockResolvedValue(undefined as any);

      await whatsappClient.sendMessage('test-chat-id', 'Hello World');

      expect(mockClient.sendMessage).toHaveBeenCalledWith('test-chat-id', 'Hello World');
    });

    it('should throw error if client is not ready', async () => {
      (whatsappClient as any).isReady = false;

      await expect(whatsappClient.sendMessage('test-chat-id', 'Hello'))
        .rejects.toThrow('WhatsApp client is not ready');
    });

    it('should throw error for empty message', async () => {
      await expect(whatsappClient.sendMessage('test-chat-id', ''))
        .rejects.toThrow('Message text cannot be empty');
    });

    it('should trim message text', async () => {
      mockClient.sendMessage.mockResolvedValue(undefined as any);

      await whatsappClient.sendMessage('test-chat-id', '  Hello World  ');

      expect(mockClient.sendMessage).toHaveBeenCalledWith('test-chat-id', 'Hello World');
    });
  });

  describe('getContacts', () => {
    beforeEach(async () => {
      mockClient.initialize.mockResolvedValue(undefined);
      await whatsappClient.initialize();
      (whatsappClient as any).isReady = true;
    });

    it('should get contacts from WhatsApp', async () => {
      const mockContacts = [
        {
          id: { _serialized: 'contact1@c.us', user: '1234567890' },
          name: 'John Doe',
          pushname: 'John',
          number: '1234567890'
        },
        {
          id: { _serialized: 'contact2@c.us', user: '0987654321' },
          name: 'Jane Smith',
          pushname: 'Jane',
          number: '0987654321'
        }
      ];

      mockClient.getContacts.mockResolvedValue(mockContacts as any);

      const contacts = await whatsappClient.getContacts();

      expect(contacts).toHaveLength(2);
      expect(contacts[0].name).toBe('John Doe');
      expect(contacts[0].number).toBe('1234567890');
      expect(contacts[1].name).toBe('Jane Smith');
    });

    it('should throw error if client is not ready', async () => {
      (whatsappClient as any).isReady = false;

      await expect(whatsappClient.getContacts()).rejects.toThrow('WhatsApp client is not ready');
    });

    it('should handle contacts without names', async () => {
      const mockContacts = [
        {
          id: { _serialized: 'contact1@c.us', user: '1234567890' },
          number: '1234567890'
        }
      ];

      mockClient.getContacts.mockResolvedValue(mockContacts as any);

      const contacts = await whatsappClient.getContacts();

      expect(contacts).toHaveLength(1);
      expect(contacts[0].name).toBe('1234567890'); // Should use number as fallback
    });
  });

  describe('getContact', () => {
    it('should return contact by ID', async () => {
      mockClient.initialize.mockResolvedValue(undefined);
      await whatsappClient.initialize();
      (whatsappClient as any).isReady = true;

      const mockContacts = [
        {
          id: { _serialized: 'contact1@c.us', user: '1234567890' },
          name: 'John Doe',
          number: '1234567890'
        }
      ];

      mockClient.getContacts.mockResolvedValue(mockContacts as any);
      await whatsappClient.getContacts();

      const contact = whatsappClient.getContact('contact1@c.us');
      expect(contact).toBeDefined();
      expect(contact!.name).toBe('John Doe');
    });

    it('should return undefined for non-existent contact', () => {
      const contact = whatsappClient.getContact('non-existent');
      expect(contact).toBeUndefined();
    });
  });

  describe('getContactName', () => {
    it('should return contact name by ID', async () => {
      mockClient.initialize.mockResolvedValue(undefined);
      await whatsappClient.initialize();
      (whatsappClient as any).isReady = true;

      const mockContacts = [
        {
          id: { _serialized: 'contact1@c.us', user: '1234567890' },
          name: 'John Doe',
          number: '1234567890'
        }
      ];

      mockClient.getContacts.mockResolvedValue(mockContacts as any);
      await whatsappClient.getContacts();

      const name = whatsappClient.getContactName('contact1@c.us');
      expect(name).toBe('John Doe');
    });

    it('should return contact ID if name not found', () => {
      const name = whatsappClient.getContactName('unknown@c.us');
      expect(name).toBe('unknown@c.us');
    });
  });

  describe('getClientInfo', () => {
    beforeEach(async () => {
      mockClient.initialize.mockResolvedValue(undefined);
      await whatsappClient.initialize();
      (whatsappClient as any).isReady = true;
    });

    it('should return client info', async () => {
      const info = await whatsappClient.getClientInfo();

      expect(info).toEqual({
        wid: 'test-wid',
        pushname: 'Test User',
        platform: 'web'
      });
    });

    it('should throw error if client is not ready', async () => {
      (whatsappClient as any).isReady = false;

      await expect(whatsappClient.getClientInfo()).rejects.toThrow('WhatsApp client is not ready');
    });
  });

  describe('event handling', () => {
    it('should emit ready event when client is ready', () => {
      const readyHandler = jest.fn();
      whatsappClient.on('ready', readyHandler);

      // Simulate the ready event from the mock client
      const onCalls = mockClient.on.mock.calls;
      const readyCall = onCalls.find(call => call[0] === 'ready');
      if (readyCall) {
        readyCall[1](); // Call the ready handler
      }

      expect(readyHandler).toHaveBeenCalled();
    });

    it('should emit qr event when QR code is received', () => {
      const qrHandler = jest.fn();
      whatsappClient.on('qr', qrHandler);

      const onCalls = mockClient.on.mock.calls;
      const qrCall = onCalls.find(call => call[0] === 'qr');
      if (qrCall) {
        qrCall[1]('test-qr-code');
      }

      expect(qrHandler).toHaveBeenCalledWith('test-qr-code');
    });

    it('should emit error event when client errors occur', () => {
      const errorHandler = jest.fn();
      whatsappClient.on('error', errorHandler);

      const testError = new Error('Test error');
      const onCalls = mockClient.on.mock.calls;
      const errorCall = onCalls.find(call => call[0] === 'error');
      if (errorCall) {
        errorCall[1](testError);
      }

      expect(errorHandler).toHaveBeenCalledWith(testError);
    });
  });
});