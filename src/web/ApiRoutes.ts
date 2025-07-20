import { Router, Request, Response } from 'express';
import { ConfigurationManager } from '../services/ConfigurationManager';
import { ActivityLogger } from '../services/ActivityLogger';
import { ReplyEngine } from '../services/ReplyEngine';
import { WhatsAppClient } from '../services/WhatsAppClient';
import { MessageTemplate } from '../models/MessageTemplate';
import { SystemSettings } from '../models/SystemSettings';

export class ApiRoutes {
  private router: Router;
  private configManager: ConfigurationManager;
  private activityLogger: ActivityLogger;
  private replyEngine: ReplyEngine;
  private whatsappClient: WhatsAppClient;
  private healthMonitor: any;
  private app?: any; // Reference to main app for monitoring access

  constructor(
    configManager: ConfigurationManager,
    activityLogger: ActivityLogger,
    replyEngine: ReplyEngine,
    whatsappClient: WhatsAppClient,
    healthMonitor: any,
    app?: any
  ) {
    this.configManager = configManager;
    this.activityLogger = activityLogger;
    this.replyEngine = replyEngine;
    this.whatsappClient = whatsappClient;
    this.healthMonitor = healthMonitor;
    this.app = app;
    this.router = Router();
    
    this.setupRoutes();
  }

  getRouter(): Router {
    return this.router;
  }

  private setupRoutes(): void {
    // System status routes
    this.router.get('/status', this.getSystemStatus.bind(this));
    this.router.get('/health', this.getHealthCheck.bind(this));

    // Configuration routes
    this.router.get('/config/system', this.getSystemConfig.bind(this));
    this.router.put('/config/system', this.updateSystemConfig.bind(this));
    
    this.router.get('/config/templates', this.getMessageTemplates.bind(this));
    this.router.post('/config/templates', this.createMessageTemplate.bind(this));
    this.router.put('/config/templates/:id', this.updateMessageTemplate.bind(this));
    this.router.delete('/config/templates/:id', this.deleteMessageTemplate.bind(this));

    // Activity and statistics routes
    this.router.get('/activity/recent', this.getRecentActivity.bind(this));
    this.router.get('/activity/statistics', this.getActivityStatistics.bind(this));
    this.router.get('/activity/export', this.exportActivity.bind(this));

    // Control routes
    this.router.post('/control/start', this.startReplyEngine.bind(this));
    this.router.post('/control/stop', this.stopReplyEngine.bind(this));
    this.router.post('/control/send-message', this.sendManualMessage.bind(this));

    // WhatsApp routes
    this.router.get('/whatsapp/info', this.getWhatsAppInfo.bind(this));
    this.router.get('/whatsapp/contacts', this.getWhatsAppContacts.bind(this));

    // Blacklist routes
    this.router.get('/blacklist', this.getBlacklist.bind(this));
    this.router.post('/blacklist', this.addToBlacklist.bind(this));
    this.router.delete('/blacklist/:contactId', this.removeFromBlacklist.bind(this));

    // Monitoring and error handling routes
    this.router.get('/monitoring/dashboard', this.getMonitoringDashboard.bind(this));
    this.router.get('/monitoring/report', this.getMonitoringReport.bind(this));
    this.router.get('/monitoring/status-summary', this.getStatusSummary.bind(this));
    this.router.get('/monitoring/export', this.exportMonitoringData.bind(this));
    
    // Error handling routes
    this.router.get('/errors/stats', this.getErrorStats.bind(this));
    this.router.get('/errors/report', this.getErrorReport.bind(this));
    this.router.post('/errors/reset-component/:component', this.resetComponentHealth.bind(this));
    
    // Alerting routes
    this.router.get('/alerts/active', this.getActiveAlerts.bind(this));
    this.router.get('/alerts/stats', this.getAlertStats.bind(this));
    this.router.post('/alerts/test', this.testAlerts.bind(this));
    this.router.post('/alerts/resolve/:alertId', this.resolveAlert.bind(this));
    
    // System control routes
    this.router.post('/system/force-health-check', this.forceHealthCheck.bind(this));
    this.router.post('/system/force-reconnect', this.forceReconnect.bind(this));
  }

  private async getSystemStatus(req: Request, res: Response): Promise<void> {
    try {
      const status = {
        whatsapp: {
          ready: this.whatsappClient.isReady(),
          initialized: true
        },
        replyEngine: {
          active: this.replyEngine.isEngineActive(),
          statistics: this.replyEngine.getStatistics()
        },
        system: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          timestamp: new Date().toISOString()
        }
      };

      res.json(status);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get system status' });
    }
  }

  private async getHealthCheck(req: Request, res: Response): Promise<void> {
    try {
      const systemHealth = await this.healthMonitor.healthCheck();

      const statusCode = systemHealth.status === 'healthy' ? 200 : 503;

      res.status(statusCode).json(systemHealth);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get health status' });
    }
  }

  private async getSystemConfig(req: Request, res: Response): Promise<void> {
    try {
      const systemSettings = this.configManager.getSystemSettings();
      res.json(systemSettings);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get system configuration' });
    }
  }

  private async updateSystemConfig(req: Request, res: Response): Promise<void> {
    try {
      const settings: SystemSettings = req.body;
      await this.configManager.updateSystemSettings(settings);
      await this.replyEngine.updateConfiguration();
      
      res.json({ success: true, message: 'System configuration updated' });
    } catch (error) {
      res.status(400).json({ error: `Failed to update system configuration: ${error}` });
    }
  }

  private async getMessageTemplates(req: Request, res: Response): Promise<void> {
    try {
      const templates = this.configManager.getMessageTemplates();
      res.json(templates);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get message templates' });
    }
  }

  private async createMessageTemplate(req: Request, res: Response): Promise<void> {
    try {
      const template: MessageTemplate = req.body;
      await this.configManager.updateMessageTemplate(template);
      await this.replyEngine.updateConfiguration();
      
      res.status(201).json({ success: true, message: 'Message template created' });
    } catch (error) {
      res.status(400).json({ error: `Failed to create message template: ${error}` });
    }
  }

  private async updateMessageTemplate(req: Request, res: Response): Promise<void> {
    try {
      const templateId = req.params.id;
      const template: MessageTemplate = { ...req.body, id: templateId };
      
      await this.configManager.updateMessageTemplate(template);
      await this.replyEngine.updateConfiguration();
      
      res.json({ success: true, message: 'Message template updated' });
    } catch (error) {
      res.status(400).json({ error: `Failed to update message template: ${error}` });
    }
  }

  private async deleteMessageTemplate(req: Request, res: Response): Promise<void> {
    try {
      const templateId = req.params.id;
      await this.configManager.removeMessageTemplate(templateId);
      await this.replyEngine.updateConfiguration();
      
      res.json({ success: true, message: 'Message template deleted' });
    } catch (error) {
      res.status(400).json({ error: `Failed to delete message template: ${error}` });
    }
  }

  private async getRecentActivity(req: Request, res: Response): Promise<void> {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const type = req.query.type as string;
      
      const entries = await this.activityLogger.getRecentEntries(limit, type as any);
      res.json(entries);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get recent activity' });
    }
  }

  private async getActivityStatistics(req: Request, res: Response): Promise<void> {
    try {
      const hours = parseInt(req.query.hours as string) || 24;
      const statistics = await this.activityLogger.getStatistics(hours);
      res.json(statistics);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get activity statistics' });
    }
  }

  private async exportActivity(req: Request, res: Response): Promise<void> {
    try {
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
      
      const logs = await this.activityLogger.exportLogs(startDate, endDate);
      
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename=activity-export.json');
      res.json(logs);
    } catch (error) {
      res.status(500).json({ error: 'Failed to export activity logs' });
    }
  }

  private async startReplyEngine(req: Request, res: Response): Promise<void> {
    try {
      this.replyEngine.start();
      res.json({ success: true, message: 'Reply engine started' });
    } catch (error) {
      res.status(400).json({ error: `Failed to start reply engine: ${error}` });
    }
  }

  private async stopReplyEngine(req: Request, res: Response): Promise<void> {
    try {
      this.replyEngine.stop();
      res.json({ success: true, message: 'Reply engine stopped' });
    } catch (error) {
      res.status(400).json({ error: `Failed to stop reply engine: ${error}` });
    }
  }

  private async sendManualMessage(req: Request, res: Response): Promise<void> {
    try {
      const { chatId, message } = req.body;
      
      if (!chatId || !message) {
        res.status(400).json({ error: 'chatId and message are required' });
        return;
      }

      await this.replyEngine.forceSendReply(chatId, message);
      res.json({ success: true, message: 'Message sent successfully' });
    } catch (error) {
      res.status(400).json({ error: `Failed to send message: ${error}` });
    }
  }

  private async getWhatsAppInfo(req: Request, res: Response): Promise<void> {
    try {
      if (!this.whatsappClient.isReady()) {
        res.status(503).json({ error: 'WhatsApp client is not ready' });
        return;
      }

      const info = await this.whatsappClient.getClientInfo();
      res.json(info);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get WhatsApp info' });
    }
  }

  private async getWhatsAppContacts(req: Request, res: Response): Promise<void> {
    try {
      if (!this.whatsappClient.isReady()) {
        res.status(503).json({ error: 'WhatsApp client is not ready' });
        return;
      }

      const contacts = await this.whatsappClient.getContacts();
      res.json(contacts);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get WhatsApp contacts' });
    }
  }

  private async getBlacklist(req: Request, res: Response): Promise<void> {
    try {
      const systemSettings = this.configManager.getSystemSettings();
      res.json({ blacklistedContacts: systemSettings.blacklistedContacts });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get blacklist' });
    }
  }

  private async addToBlacklist(req: Request, res: Response): Promise<void> {
    try {
      const { contactId } = req.body;
      
      if (!contactId) {
        res.status(400).json({ error: 'contactId is required' });
        return;
      }

      await this.configManager.addToBlacklist(contactId);
      await this.replyEngine.updateConfiguration();
      
      res.json({ success: true, message: 'Contact added to blacklist' });
    } catch (error) {
      res.status(400).json({ error: `Failed to add to blacklist: ${error}` });
    }
  }

  private async removeFromBlacklist(req: Request, res: Response): Promise<void> {
    try {
      const contactId = req.params.contactId;
      
      await this.configManager.removeFromBlacklist(contactId);
      await this.replyEngine.updateConfiguration();
      
      res.json({ success: true, message: 'Contact removed from blacklist' });
    } catch (error) {
      res.status(400).json({ error: `Failed to remove from blacklist: ${error}` });
    }
  }

  // Monitoring and Error Handling Methods

  private async getMonitoringDashboard(req: Request, res: Response): Promise<void> {
    try {
      if (!this.app) {
        res.status(503).json({ error: 'Monitoring dashboard not available' });
        return;
      }

      const metrics = await this.app.getCurrentMetrics();
      res.json(metrics);
    } catch (error) {
      res.status(500).json({ error: `Failed to get monitoring dashboard: ${error}` });
    }
  }

  private async getMonitoringReport(req: Request, res: Response): Promise<void> {
    try {
      if (!this.app) {
        res.status(503).json({ error: 'Monitoring report not available' });
        return;
      }

      const report = await this.app.getMonitoringReport();
      res.json(report);
    } catch (error) {
      res.status(500).json({ error: `Failed to generate monitoring report: ${error}` });
    }
  }

  private async getStatusSummary(req: Request, res: Response): Promise<void> {
    try {
      if (!this.app) {
        res.status(503).json({ error: 'Status summary not available' });
        return;
      }

      const summary = await this.app.getSystemStatusSummary();
      res.json(summary);
    } catch (error) {
      res.status(500).json({ error: `Failed to get status summary: ${error}` });
    }
  }

  private async exportMonitoringData(req: Request, res: Response): Promise<void> {
    try {
      if (!this.app) {
        res.status(503).json({ error: 'Monitoring export not available' });
        return;
      }

      const hours = parseInt(req.query.hours as string) || 24;
      const data = await this.app.exportMonitoringData(hours);
      
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="monitoring-data-${new Date().toISOString().split('T')[0]}.json"`);
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: `Failed to export monitoring data: ${error}` });
    }
  }

  private async getErrorStats(req: Request, res: Response): Promise<void> {
    try {
      if (!this.app) {
        res.status(503).json({ error: 'Error stats not available' });
        return;
      }

      const stats = this.app.getErrorStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: `Failed to get error stats: ${error}` });
    }
  }

  private async getErrorReport(req: Request, res: Response): Promise<void> {
    try {
      if (!this.app) {
        res.status(503).json({ error: 'Error report not available' });
        return;
      }

      const report = this.app.getComprehensiveErrorReport();
      res.json(report);
    } catch (error) {
      res.status(500).json({ error: `Failed to get error report: ${error}` });
    }
  }

  private async resetComponentHealth(req: Request, res: Response): Promise<void> {
    try {
      const component = req.params.component;
      
      if (!this.app) {
        res.status(503).json({ error: 'Component health reset not available' });
        return;
      }

      // Access error handler through the app
      const errorHandler = this.app.getErrorHandler();
      errorHandler.resetComponentHealth(component);
      
      res.json({ success: true, message: `Component health reset for ${component}` });
    } catch (error) {
      res.status(500).json({ error: `Failed to reset component health: ${error}` });
    }
  }

  private async getActiveAlerts(req: Request, res: Response): Promise<void> {
    try {
      if (!this.app) {
        res.status(503).json({ error: 'Alerts not available' });
        return;
      }

      const alerts = this.app.getActiveAlerts();
      res.json(alerts);
    } catch (error) {
      res.status(500).json({ error: `Failed to get active alerts: ${error}` });
    }
  }

  private async getAlertStats(req: Request, res: Response): Promise<void> {
    try {
      if (!this.app) {
        res.status(503).json({ error: 'Alert stats not available' });
        return;
      }

      const stats = this.app.getAlertStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: `Failed to get alert stats: ${error}` });
    }
  }

  private async testAlerts(req: Request, res: Response): Promise<void> {
    try {
      if (!this.app) {
        res.status(503).json({ error: 'Alert testing not available' });
        return;
      }

      const results = await this.app.testAlerts();
      res.json(results);
    } catch (error) {
      res.status(500).json({ error: `Failed to test alerts: ${error}` });
    }
  }

  private async resolveAlert(req: Request, res: Response): Promise<void> {
    try {
      const alertId = req.params.alertId;
      const { resolution } = req.body;
      
      if (!this.app) {
        res.status(503).json({ error: 'Alert resolution not available' });
        return;
      }

      await this.app.resolveAlert(alertId, resolution);
      
      res.json({ success: true, message: `Alert ${alertId} resolved` });
    } catch (error) {
      res.status(500).json({ error: `Failed to resolve alert: ${error}` });
    }
  }

  private async forceHealthCheck(req: Request, res: Response): Promise<void> {
    try {
      if (!this.app) {
        res.status(503).json({ error: 'Health check not available' });
        return;
      }

      await this.app.forceHealthCheck();
      res.json({ success: true, message: 'Health check triggered' });
    } catch (error) {
      res.status(500).json({ error: `Failed to trigger health check: ${error}` });
    }
  }

  private async forceReconnect(req: Request, res: Response): Promise<void> {
    try {
      if (!this.app) {
        res.status(503).json({ error: 'Reconnect not available' });
        return;
      }

      await this.app.forceReconnect();
      res.json({ success: true, message: 'Reconnection attempt triggered' });
    } catch (error) {
      res.status(500).json({ error: `Failed to trigger reconnection: ${error}` });
    }
  }
}