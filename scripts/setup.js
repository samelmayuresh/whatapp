#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');

/**
 * Main setup script for WhatsApp Auto-Reply System
 * This script sets up the initial configuration and directory structure
 */
async function setup() {
    console.log('🚀 Setting up WhatsApp Auto-Reply System...');
    
    try {
        // Create necessary directories
        await setupDirectories();
        
        // Setup configuration files
        await setupConfiguration();
        
        // Setup environment variables
        await setupEnvironment();
        
        console.log('✅ Setup completed successfully!');
        console.log('\nNext steps:');
        console.log('1. Review and customize config/default.json');
        console.log('2. Run "npm run build" to compile the application');
        console.log('3. Run "npm start" to start the application');
        console.log('4. Open http://localhost:3000 in your browser');
        
    } catch (error) {
        console.error('❌ Setup failed:', error.message);
        process.exit(1);
    }
}

async function setupDirectories() {
    console.log('📁 Creating directories...');
    
    const directories = [
        'logs',
        'config',
        'data',
        'backups',
        'temp'
    ];
    
    for (const dir of directories) {
        await fs.ensureDir(dir);
        console.log(`  ✓ Created ${dir}/`);
    }
    
    // Create .gitkeep files for empty directories
    await fs.writeFile('logs/.gitkeep', '');
    await fs.writeFile('data/.gitkeep', '');
    await fs.writeFile('backups/.gitkeep', '');
    await fs.writeFile('temp/.gitkeep', '');
}

async function setupConfiguration() {
    console.log('⚙️  Setting up configuration...');
    
    // Check if config already exists
    const configPath = 'config/default.json';
    if (await fs.pathExists(configPath)) {
        console.log('  ⚠️  Configuration already exists, skipping...');
        return;
    }
    
    const defaultConfig = {
        system: {
            enabled: false,
            pauseWhenActive: true,
            businessHours: {
                enabled: false,
                start: "09:00",
                end: "17:00",
                days: [1, 2, 3, 4, 5]
            },
            rateLimitMinutes: 30,
            blacklistedContacts: []
        },
        webServer: {
            port: 3000,
            host: "localhost"
        },
        logging: {
            level: "info",
            maxFileSize: "10MB",
            maxFiles: 5,
            rotateDaily: true
        },
        monitoring: {
            enabled: true,
            healthCheckInterval: 30000,
            alertThresholds: {
                errorRate: 10,
                memoryUsageMB: 500,
                responseTimeMs: 5000
            }
        },
        messageTemplates: [
            {
                id: "default",
                name: "Default Auto-Reply",
                content: "Hello {{contactName}}, thank you for your message. I'll get back to you soon!",
                isDefault: true,
                placeholders: ["contactName"]
            }
        ]
    };
    
    await fs.writeJSON(configPath, defaultConfig, { spaces: 2 });
    console.log('  ✓ Created default configuration');
}

async function setupEnvironment() {
    console.log('🌍 Setting up environment...');
    
    const envPath = '.env';
    if (await fs.pathExists(envPath)) {
        console.log('  ⚠️  .env file already exists, skipping...');
        return;
    }
    
    const envContent = `# WhatsApp Auto-Reply System Environment Variables

# Application Environment
NODE_ENV=development

# Server Configuration
PORT=3000
HOST=localhost

# Logging Configuration
LOG_LEVEL=info
LOG_DIR=logs

# Monitoring Configuration
MONITORING_ENABLED=true
HEALTH_CHECK_INTERVAL=30000

# Rate Limiting
RATE_LIMIT_MINUTES=30

# File Paths
CONFIG_DIR=config
DATA_DIR=data
BACKUP_DIR=backups

# Security (Optional)
# SESSION_SECRET=your-session-secret-here
# API_KEY=your-api-key-here

# External Services (Optional)
# WEBHOOK_URL=https://your-webhook-url.com
# ALERT_EMAIL=admin@yourcompany.com
`;
    
    await fs.writeFile(envPath, envContent);
    console.log('  ✓ Created .env file');
}

// Run setup if called directly
if (require.main === module) {
    setup();
}

module.exports = { setup };