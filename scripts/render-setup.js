#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');

async function setupRenderEnvironment() {
    console.log('🚀 Setting up Render environment...');
    
    try {
        // Create necessary directories
        const dirs = [
            'data',
            'logs/activity',
            'logs/errors', 
            'logs/system',
            'config',
            'temp',
            'backups'
        ];
        
        for (const dir of dirs) {
            await fs.ensureDir(dir);
            console.log(`✅ Created directory: ${dir}`);
        }
        
        // Create .gitkeep files for empty directories
        const gitkeepDirs = ['data', 'temp', 'backups'];
        for (const dir of gitkeepDirs) {
            await fs.writeFile(path.join(dir, '.gitkeep'), '');
        }
        
        // Ensure config files exist
        const configPath = 'config/default.json';
        if (!await fs.pathExists(configPath)) {
            const defaultConfig = {
                "whatsapp": {
                    "sessionName": "whatsapp-session",
                    "qrCodeTimeout": 60000,
                    "authTimeout": 60000,
                    "restartOnAuthFail": true,
                    "puppeteerOptions": {
                        "headless": true,
                        "args": [
                            "--no-sandbox",
                            "--disable-setuid-sandbox",
                            "--disable-dev-shm-usage",
                            "--disable-accelerated-2d-canvas",
                            "--no-first-run",
                            "--no-zygote",
                            "--single-process",
                            "--disable-gpu"
                        ]
                    }
                },
                "server": {
                    "port": 10000,
                    "host": "0.0.0.0"
                },
                "rateLimiter": {
                    "windowMs": 3000,
                    "maxMessages": 1
                },
                "businessHours": {
                    "enabled": false,
                    "start": "09:00",
                    "end": "17:00",
                    "timezone": "UTC"
                },
                "autoReply": {
                    "enabled": true,
                    "defaultMessage": "Thank you for your message! We'll get back to you soon.",
                    "templates": []
                }
            };
            
            await fs.writeJSON(configPath, defaultConfig, { spaces: 2 });
            console.log(`✅ Created default config: ${configPath}`);
        }
        
        console.log('🎉 Render environment setup complete!');
        console.log('\n📋 Next steps:');
        console.log('1. Push your code to GitHub');
        console.log('2. Connect your GitHub repo to Render');
        console.log('3. Deploy as a Web Service');
        console.log('4. Your app will be available at the Render URL');
        
    } catch (error) {
        console.error('❌ Setup failed:', error.message);
        process.exit(1);
    }
}

setupRenderEnvironment();