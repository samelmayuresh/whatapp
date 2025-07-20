#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');
const readline = require('readline');

/**
 * Interactive configuration setup script
 */
async function setupConfig() {
    console.log('⚙️  WhatsApp Auto-Reply Configuration Setup');
    console.log('==========================================\n');
    
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    
    try {
        const config = await collectConfiguration(rl);
        await saveConfiguration(config);
        
        console.log('\n✅ Configuration saved successfully!');
        console.log('You can modify the configuration later by editing config/default.json');
        
    } catch (error) {
        console.error('❌ Configuration setup failed:', error.message);
        process.exit(1);
    } finally {
        rl.close();
    }
}

async function collectConfiguration(rl) {
    const config = {
        system: {},
        webServer: {},
        logging: {},
        monitoring: {},
        messageTemplates: []
    };
    
    console.log('📋 System Configuration');
    console.log('----------------------');
    
    // System settings
    config.system.enabled = await askYesNo(rl, 'Enable auto-reply system by default?', false);
    config.system.pauseWhenActive = await askYesNo(rl, 'Pause auto-replies when user is active?', true);
    config.system.rateLimitMinutes = parseInt(await ask(rl, 'Rate limit minutes (prevent spam):', '30'));
    
    // Business hours
    const useBusinessHours = await askYesNo(rl, 'Enable business hours restrictions?', false);
    config.system.businessHours = {
        enabled: useBusinessHours,
        start: useBusinessHours ? await ask(rl, 'Business hours start (HH:MM):', '09:00') : '09:00',
        end: useBusinessHours ? await ask(rl, 'Business hours end (HH:MM):', '17:00') : '17:00',
        days: [1, 2, 3, 4, 5] // Monday to Friday
    };
    
    console.log('\n🌐 Web Server Configuration');
    console.log('---------------------------');
    
    config.webServer.port = parseInt(await ask(rl, 'Web server port:', '3000'));
    config.webServer.host = await ask(rl, 'Web server host:', 'localhost');
    
    console.log('\n📝 Logging Configuration');
    console.log('------------------------');
    
    config.logging.level = await askChoice(rl, 'Log level:', ['error', 'warn', 'info', 'debug'], 'info');
    config.logging.maxFileSize = await ask(rl, 'Max log file size:', '10MB');
    config.logging.maxFiles = parseInt(await ask(rl, 'Max log files to keep:', '5'));
    config.logging.rotateDaily = await askYesNo(rl, 'Rotate logs daily?', true);
    
    console.log('\n📊 Monitoring Configuration');
    console.log('---------------------------');
    
    config.monitoring.enabled = await askYesNo(rl, 'Enable monitoring and health checks?', true);
    config.monitoring.healthCheckInterval = parseInt(await ask(rl, 'Health check interval (ms):', '30000'));
    config.monitoring.alertThresholds = {
        errorRate: parseInt(await ask(rl, 'Error rate alert threshold (errors/hour):', '10')),
        memoryUsageMB: parseInt(await ask(rl, 'Memory usage alert threshold (MB):', '500')),
        responseTimeMs: parseInt(await ask(rl, 'Response time alert threshold (ms):', '5000'))
    };
    
    console.log('\n💬 Default Message Template');
    console.log('---------------------------');
    
    const templateContent = await ask(rl, 
        'Default auto-reply message (use {{contactName}} for personalization):', 
        'Hello {{contactName}}, thank you for your message. I\'ll get back to you soon!'
    );
    
    config.messageTemplates = [{
        id: 'default',
        name: 'Default Auto-Reply',
        content: templateContent,
        isDefault: true,
        placeholders: ['contactName']
    }];
    
    config.system.blacklistedContacts = [];
    
    return config;
}

function ask(rl, question, defaultValue = '') {
    return new Promise((resolve) => {
        const prompt = defaultValue ? `${question} [${defaultValue}]: ` : `${question}: `;
        rl.question(prompt, (answer) => {
            resolve(answer.trim() || defaultValue);
        });
    });
}

function askYesNo(rl, question, defaultValue = false) {
    return new Promise((resolve) => {
        const defaultText = defaultValue ? 'Y/n' : 'y/N';
        rl.question(`${question} [${defaultText}]: `, (answer) => {
            const response = answer.trim().toLowerCase();
            if (response === '') {
                resolve(defaultValue);
            } else {
                resolve(response === 'y' || response === 'yes');
            }
        });
    });
}

function askChoice(rl, question, choices, defaultValue) {
    return new Promise((resolve) => {
        const choicesText = choices.join('/');
        rl.question(`${question} [${choicesText}] (${defaultValue}): `, (answer) => {
            const response = answer.trim().toLowerCase();
            if (response === '' || !choices.includes(response)) {
                resolve(defaultValue);
            } else {
                resolve(response);
            }
        });
    });
}

async function saveConfiguration(config) {
    await fs.ensureDir('config');
    await fs.writeJSON('config/default.json', config, { spaces: 2 });
}

// Run setup if called directly
if (require.main === module) {
    setupConfig();
}

module.exports = { setupConfig };