# WhatsApp Auto-Reply System - Deployment Guide

This guide covers various deployment methods for the WhatsApp Auto-Reply System.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Local Development Setup](#local-development-setup)
3. [Production Deployment](#production-deployment)
4. [Docker Deployment](#docker-deployment)
5. [Linux Service Deployment](#linux-service-deployment)
6. [Environment Variables](#environment-variables)
7. [Configuration](#configuration)
8. [Monitoring and Health Checks](#monitoring-and-health-checks)
9. [Backup and Recovery](#backup-and-recovery)
10. [Troubleshooting](#troubleshooting)

## Prerequisites

- Node.js 16.0.0 or higher
- npm 7.0.0 or higher
- Chrome/Chromium browser (for WhatsApp Web)
- At least 512MB RAM
- 1GB free disk space

## Local Development Setup

### 1. Clone and Install

```bash
# Clone the repository
git clone <repository-url>
cd whatsapp-auto-reply

# Install dependencies
npm install

# Run setup script
npm run setup
```

### 2. Configure the Application

```bash
# Interactive configuration setup
npm run setup:config

# Or manually edit config/default.json
```

### 3. Build and Start

```bash
# Build the application
npm run build

# Start in development mode
npm run dev

# Or start in production mode
npm start
```

### 4. Access the Application

Open your browser and navigate to `http://localhost:3000`

## Production Deployment

### 1. Prepare for Deployment

```bash
# Install production dependencies only
npm ci --only=production

# Build the application
npm run build:clean

# Verify deployment
npm run deploy:verify
```

### 2. Environment Setup

Create a `.env` file:

```env
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
LOG_LEVEL=info
```

### 3. Start the Application

```bash
# Start with PM2 (recommended)
npm install -g pm2
pm2 start dist/index.js --name whatsapp-auto-reply

# Or start directly
npm run start:prod
```

## Docker Deployment

### 1. Using Docker Compose (Recommended)

```bash
# Create environment file
cp .env.example .env

# Edit configuration
nano config/default.json

# Start with Docker Compose
docker-compose up -d

# View logs
docker-compose logs -f whatsapp-auto-reply
```

### 2. Using Docker Directly

```bash
# Build the image
docker build -t whatsapp-auto-reply .

# Run the container
docker run -d \
  --name whatsapp-auto-reply \
  -p 3000:3000 \
  -v $(pwd)/config:/app/config:ro \
  -v $(pwd)/logs:/app/logs \
  -v $(pwd)/data:/app/data \
  whatsapp-auto-reply
```

### 3. Docker Health Checks

The container includes built-in health checks:

```bash
# Check container health
docker ps

# View health check logs
docker inspect whatsapp-auto-reply | grep Health -A 10
```

## Linux Service Deployment

### 1. System Setup

```bash
# Create application user
sudo useradd --system --shell /bin/false whatsapp

# Create application directory
sudo mkdir -p /opt/whatsapp-auto-reply
sudo chown whatsapp:whatsapp /opt/whatsapp-auto-reply

# Copy application files
sudo cp -r * /opt/whatsapp-auto-reply/
sudo chown -R whatsapp:whatsapp /opt/whatsapp-auto-reply
```

### 2. Install Systemd Service

```bash
# Copy service file
sudo cp whatsapp-auto-reply.service /etc/systemd/system/

# Reload systemd
sudo systemctl daemon-reload

# Enable and start service
sudo systemctl enable whatsapp-auto-reply
sudo systemctl start whatsapp-auto-reply

# Check status
sudo systemctl status whatsapp-auto-reply
```

### 3. Service Management

```bash
# Start service
sudo systemctl start whatsapp-auto-reply

# Stop service
sudo systemctl stop whatsapp-auto-reply

# Restart service
sudo systemctl restart whatsapp-auto-reply

# View logs
sudo journalctl -u whatsapp-auto-reply -f
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | Application environment |
| `PORT` | `3000` | Web server port |
| `HOST` | `localhost` | Web server host |
| `LOG_LEVEL` | `info` | Logging level |
| `LOG_DIR` | `logs` | Log directory path |
| `CONFIG_DIR` | `config` | Configuration directory |
| `DATA_DIR` | `data` | Data storage directory |
| `BACKUP_DIR` | `backups` | Backup directory |

## Configuration

### 1. System Configuration

Edit `config/default.json`:

```json
{
  "system": {
    "enabled": false,
    "pauseWhenActive": true,
    "businessHours": {
      "enabled": false,
      "start": "09:00",
      "end": "17:00",
      "days": [1, 2, 3, 4, 5]
    },
    "rateLimitMinutes": 30,
    "blacklistedContacts": []
  },
  "webServer": {
    "port": 3000,
    "host": "localhost"
  },
  "monitoring": {
    "enabled": true,
    "healthCheckInterval": 30000,
    "alertThresholds": {
      "errorRate": 10,
      "memoryUsageMB": 500,
      "responseTimeMs": 5000
    }
  }
}
```

### 2. Message Templates

Configure auto-reply templates in the web interface or directly in the configuration file.

## Monitoring and Health Checks

### 1. Built-in Health Checks

```bash
# Check application health
npm run health:check

# System health check
npm run health:check -- --system
```

### 2. API Endpoints

- Health Check: `GET /api/health`
- System Status: `GET /api/status`
- Monitoring Dashboard: `GET /api/monitoring/dashboard`

### 3. Log Files

- Application logs: `logs/`
- Error logs: `logs/errors/`
- Activity logs: `logs/activity/`

## Backup and Recovery

### 1. Configuration Backup

```bash
# Create configuration backup
npm run backup:config

# Backups are stored in backups/ directory
```

### 2. Data Backup

```bash
# Backup all application data
tar -czf whatsapp-backup-$(date +%Y%m%d).tar.gz \
  config/ logs/ data/ backups/
```

### 3. Recovery

```bash
# Restore from backup
tar -xzf whatsapp-backup-YYYYMMDD.tar.gz

# Restart application
npm restart
```

## Troubleshooting

### Common Issues

#### 1. WhatsApp Connection Issues

```bash
# Check WhatsApp client status
curl http://localhost:3000/api/whatsapp/info

# Force reconnection
curl -X POST http://localhost:3000/api/system/force-reconnect
```

#### 2. Permission Issues

```bash
# Fix file permissions
chmod -R 755 logs/ config/ data/
chown -R whatsapp:whatsapp logs/ config/ data/
```

#### 3. Port Already in Use

```bash
# Find process using port
lsof -i :3000

# Kill process
kill -9 <PID>
```

#### 4. Memory Issues

```bash
# Check memory usage
npm run health:check -- --system

# Restart application
pm2 restart whatsapp-auto-reply
```

### Log Analysis

```bash
# View application logs
tail -f logs/application.log

# View error logs
tail -f logs/errors/error.log

# Search for specific errors
grep -r "ERROR" logs/
```

### Performance Monitoring

```bash
# Monitor system resources
htop

# Monitor application metrics
curl http://localhost:3000/api/monitoring/report
```

## Security Considerations

1. **Firewall Configuration**: Only expose necessary ports
2. **User Permissions**: Run with minimal privileges
3. **File Permissions**: Restrict access to configuration files
4. **Regular Updates**: Keep dependencies updated
5. **Backup Encryption**: Encrypt sensitive backups

## Scaling and High Availability

For high-traffic deployments:

1. Use a reverse proxy (nginx)
2. Implement load balancing
3. Set up monitoring and alerting
4. Use container orchestration (Kubernetes)
5. Implement database clustering if needed

## Support

For issues and support:

1. Check the logs first
2. Run deployment verification
3. Check system health
4. Review configuration
5. Consult the troubleshooting guide

---

For more detailed information, refer to the application documentation and API reference.