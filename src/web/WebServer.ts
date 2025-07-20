import express from 'express';
import * as http from 'http';
import * as WebSocket from 'ws';
import * as path from 'path';
import { ConfigurationManager } from '../services/ConfigurationManager';
import { ActivityLogger } from '../services/ActivityLogger';
import { ReplyEngine } from '../services/ReplyEngine';
import { WhatsAppClient } from '../services/WhatsAppClient';
import { ApiRoutes } from './ApiRoutes';
import { HealthMonitor } from '../utils/HealthMonitor';

export interface WebServerOptions {
  port: number;
  host: string;
  publicPath: string;
}

export class WebServer {
  private app: express.Application;
  private server: http.Server;
  private wss: WebSocket.Server;
  private configManager: ConfigurationManager;
  private activityLogger: ActivityLogger;
  private replyEngine: ReplyEngine;
  private whatsappClient: WhatsAppClient;
  private healthMonitor: HealthMonitor;
  private options: WebServerOptions;
  private isRunning: boolean = false;
  private mainApp?: any; // Reference to main application for monitoring

  constructor(
    options: WebServerOptions,
    configManager: ConfigurationManager,
    activityLogger: ActivityLogger,
    replyEngine: ReplyEngine,
    whatsappClient: WhatsAppClient,
    healthMonitor: HealthMonitor
  ) {
    this.options = options;
    this.configManager = configManager;
    this.activityLogger = activityLogger;
    this.replyEngine = replyEngine;
    this.whatsappClient = whatsappClient;
    this.healthMonitor = healthMonitor;

    this.app = express();
    this.server = http.createServer(this.app);
    this.wss = new WebSocket.Server({ server: this.server });

    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Set reference to main application for monitoring access
   */
  setMainApp(app: any): void {
    this.mainApp = app;
    // Re-setup routes with app reference
    this.setupRoutes();
    this.setupWebSocket();
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Web server is already running');
    }

    return new Promise((resolve, reject) => {
      this.server.listen(this.options.port, this.options.host, () => {
        this.isRunning = true;
        console.log(`Web server started on http://${this.options.host}:${this.options.port}`);
        this.activityLogger.logSystemEvent('web_server_started', {
          host: this.options.host,
          port: this.options.port
        });
        resolve();
      });

      this.server.on('error', (error) => {
        console.error('Web server error:', error);
        reject(error);
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    return new Promise((resolve) => {
      this.wss.close(() => {
        this.server.close(() => {
          this.isRunning = false;
          console.log('Web server stopped');
          this.activityLogger.logSystemEvent('web_server_stopped');
          resolve();
        });
      });
    });
  }

  isServerRunning(): boolean {
    return this.isRunning;
  }

  private setupMiddleware(): void {
    // Parse JSON bodies
    this.app.use(express.json({ limit: '10mb' }));
    
    // Parse URL-encoded bodies
    this.app.use(express.urlencoded({ extended: true }));

    // CORS middleware
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
      
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
      } else {
        next();
      }
    });

    // Request logging
    this.app.use((req, res, next) => {
      console.log(`${req.method} ${req.path} - ${req.ip}`);
      next();
    });

    // Serve static files
    this.app.use(express.static(this.options.publicPath));
  }

  private setupRoutes(): void {
    const apiRoutes = new ApiRoutes(
      this.configManager,
      this.activityLogger,
      this.replyEngine,
      this.whatsappClient,
      this.healthMonitor,
      this.mainApp
    );

    // API routes
    this.app.use('/api', apiRoutes.getRouter());

    // Handle favicon.ico specifically
    this.app.get('/favicon.ico', (req, res) => {
      res.status(204).end();
    });

    // Serve main page for all non-API routes
    this.app.get('*', (req, res) => {
      const indexPath = path.resolve(this.options.publicPath, 'index.html');
      res.sendFile(indexPath);
    });

    // Error handling middleware
    this.app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
      console.error('Express error:', error);
      
      this.activityLogger.logError('web_server', `HTTP error: ${error.message}`, {
        method: req.method,
        path: req.path,
        error: error.stack
      });

      res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
      });
    });
  }

  private setupWebSocket(): void {
    this.wss.on('connection', (ws: WebSocket, req) => {
      console.log(`WebSocket client connected from ${req.socket.remoteAddress}`);

      // Send initial status
      this.sendWebSocketMessage(ws, 'status', {
        whatsappReady: this.whatsappClient.isReady(),
        replyEngineActive: this.replyEngine.isEngineActive(),
        timestamp: new Date().toISOString()
      });

      // Handle client messages
      ws.on('message', async (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());
          await this.handleWebSocketMessage(ws, message);
        } catch (error) {
          console.error('WebSocket message error:', error);
          this.sendWebSocketMessage(ws, 'error', {
            message: 'Invalid message format'
          });
        }
      });

      ws.on('close', () => {
        console.log('WebSocket client disconnected');
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
      });
    });

    // Set up event listeners to broadcast updates
    this.setupEventBroadcasting();
  }

  private async handleWebSocketMessage(ws: WebSocket, message: any): Promise<void> {
    switch (message.type) {
      case 'ping':
        this.sendWebSocketMessage(ws, 'pong', { timestamp: new Date().toISOString() });
        break;

      case 'get_status':
        this.sendWebSocketMessage(ws, 'status', {
          whatsappReady: this.whatsappClient.isReady(),
          replyEngineActive: this.replyEngine.isEngineActive(),
          statistics: this.replyEngine.getStatistics(),
          timestamp: new Date().toISOString()
        });
        break;

      case 'get_recent_activity':
        const recentEntries = await this.activityLogger.getRecentEntries(50);
        this.sendWebSocketMessage(ws, 'recent_activity', {
          entries: recentEntries,
          timestamp: new Date().toISOString()
        });
        break;

      default:
        this.sendWebSocketMessage(ws, 'error', {
          message: `Unknown message type: ${message.type}`
        });
    }
  }

  private sendWebSocketMessage(ws: WebSocket, type: string, data: any): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type, data, timestamp: new Date().toISOString() }));
    }
  }

  private broadcastWebSocketMessage(type: string, data: any): void {
    const message = JSON.stringify({ type, data, timestamp: new Date().toISOString() });
    
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  private setupEventBroadcasting(): void {
    // WhatsApp client events
    this.whatsappClient.on('ready', () => {
      this.broadcastWebSocketMessage('whatsapp_status', {
        status: 'ready',
        timestamp: new Date().toISOString()
      });
    });

    this.whatsappClient.on('disconnected', (reason: string) => {
      this.broadcastWebSocketMessage('whatsapp_status', {
        status: 'disconnected',
        reason,
        timestamp: new Date().toISOString()
      });
    });

    this.whatsappClient.on('qr', (qr: string) => {
      this.broadcastWebSocketMessage('qr_code', {
        qr,
        timestamp: new Date().toISOString()
      });
    });

    // Reply engine events
    this.replyEngine.on('reply-sent', (chatId: string, replyContent: string, templateId?: string) => {
      this.broadcastWebSocketMessage('reply_sent', {
        chatId,
        replyContent: replyContent.substring(0, 100),
        templateId,
        timestamp: new Date().toISOString()
      });
    });

    this.replyEngine.on('reply-blocked', (chatId: string, reason: string) => {
      this.broadcastWebSocketMessage('reply_blocked', {
        chatId,
        reason,
        timestamp: new Date().toISOString()
      });
    });

    this.replyEngine.on('error', (error: Error) => {
      this.broadcastWebSocketMessage('system_error', {
        message: error.message,
        timestamp: new Date().toISOString()
      });
    });
  }

  broadcastQRCode(qr: string): void {
    this.broadcastWebSocketMessage('qr_code', { qr, timestamp: new Date().toISOString() });
  }

  broadcastStatus(status: any): void {
    this.broadcastWebSocketMessage('status', { status, timestamp: new Date().toISOString() });
  }

  broadcastActivity(activity: any): void {
    this.broadcastWebSocketMessage('activity', { activity, timestamp: new Date().toISOString() });
  }

  broadcastStatistics(statistics: any): void {
    this.broadcastWebSocketMessage('statistics', { statistics, timestamp: new Date().toISOString() });
  }

  broadcastSettings(settings: any): void {
    this.broadcastWebSocketMessage('settings', { settings, timestamp: new Date().toISOString() });
  }
}
