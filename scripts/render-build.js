#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');

async function renderBuild() {
    console.log('🔧 Setting up Render build environment...');
    
    try {
        // Create necessary directories
        const dirs = [
            'dist',
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
            const gitkeepPath = path.join(dir, '.gitkeep');
            if (!await fs.pathExists(gitkeepPath)) {
                await fs.writeFile(gitkeepPath, '');
            }
        }
        
        // Ensure config file exists
        const configPath = 'config/default.json';
        if (!await fs.pathExists(configPath)) {
            console.log('📝 Creating default config...');
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
        
        console.log('🎉 Render build setup complete!');
        
    } catch (error) {
        console.error('❌ Build setup failed:', error.message);
        process.exit(1);
    }
}

renderBuild();