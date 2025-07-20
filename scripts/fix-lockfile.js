#!/usr/bin/env node

const fs = require('fs-extra');
const { execSync } = require('child_process');

async function fixLockfile() {
    console.log('🔧 Fixing package-lock.json...');
    
    try {
        // Remove package-lock.json if it exists
        if (await fs.pathExists('package-lock.json')) {
            await fs.remove('package-lock.json');
            console.log('✅ Removed old package-lock.json');
        }
        
        // Set environment variable to skip Puppeteer download
        process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD = 'true';
        
        // Run npm install to generate new lock file
        console.log('📦 Generating new package-lock.json...');
        execSync('npm install --package-lock-only', { 
            stdio: 'inherit',
            env: { ...process.env, PUPPETEER_SKIP_CHROMIUM_DOWNLOAD: 'true' }
        });
        
        console.log('🎉 Package-lock.json fixed!');
        
    } catch (error) {
        console.error('❌ Failed to fix package-lock.json:', error.message);
        process.exit(1);
    }
}

fixLockfile();