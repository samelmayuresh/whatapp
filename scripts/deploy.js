#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs-extra');
const path = require('path');
const readline = require('readline');

/**
 * Comprehensive deployment script for WhatsApp Auto-Reply System
 * This script guides through the entire deployment process
 */
async function deploy() {
    console.log('🚀 WhatsApp Auto-Reply System - Deployment Wizard');
    console.log('===============================================\n');
    
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    
    try {
        // Step 1: Choose deployment method
        const deploymentMethod = await chooseDeploymentMethod(rl);
        
        // Step 2: Verify prerequisites
        await verifyPrerequisites(deploymentMethod);
        
        // Step 3: Build the application
        await buildApplication();
        
        // Step 4: Run pre-deployment checks
        await runPreDeploymentChecks();
        
        // Step 5: Deploy based on chosen method
        await deployWithMethod(deploymentMethod, rl);
        
        // Step 6: Verify deployment
        await verifyDeployment();
        
        console.log('\n✅ Deployment completed successfully!');
        console.log('\nNext steps:');
        
        if (deploymentMethod === 'docker') {
            console.log('1. Access the application at http://localhost:3000');
            console.log('2. Monitor container logs with: docker-compose logs -f');
            console.log('3. Stop the application with: docker-compose down');
        } else if (deploymentMethod === 'systemd') {
            console.log('1. Access the application at http://localhost:3000');
            console.log('2. Check service status with: sudo systemctl status whatsapp-auto-reply');
            console.log('3. View logs with: sudo journalctl -u whatsapp-auto-reply -f');
        } else {
            console.log('1. Access the application at http://localhost:3000');
            console.log('2. Monitor logs in the logs/ directory');
            console.log('3. Stop the application with Ctrl+C or by closing the terminal');
        }
        
    } catch (error) {
        console.error('\n❌ Deployment failed:', error.message);
        console.error('\nTroubleshooting:');
        console.error('1. Check the error message above');
        console.error('2. Verify all prerequisites are installed');
        console.error('3. Check for permission issues');
        console.error('4. Try running the steps manually as described in DEPLOYMENT.md');
        process.exit(1);
    } finally {
        rl.close();
    }
}

async function chooseDeploymentMethod(rl) {
    console.log('📋 Step 1: Choose Deployment Method');
    console.log('----------------------------------');
    console.log('1. Local Node.js (simplest)');
    console.log('2. Docker (recommended)');
    console.log('3. Linux Systemd Service');
    console.log('');
    
    const answer = await ask(rl, 'Select deployment method (1-3)', '2');
    
    switch (answer) {
        case '1': return 'local';
        case '2': return 'docker';
        case '3': return 'systemd';
        default: return 'docker';
    }
}

async function verifyPrerequisites(deploymentMethod) {
    console.log('\n📋 Step 2: Verifying Prerequisites');
    console.log('--------------------------------');
    
    // Check Node.js
    try {
        const nodeVersion = execSync('node --version', { encoding: 'utf8' }).trim();
        console.log(`✅ Node.js ${nodeVersion} installed`);
        
        // Check if version is sufficient (>= 16.0.0)
        const versionNumber = parseFloat(nodeVersion.slice(1));
        if (versionNumber < 16) {
            throw new Error(`Node.js ${nodeVersion} is too old. Version 16.0.0 or higher is required.`);
        }
    } catch (error) {
        if (error.status === 127) { // Command not found
            throw new Error('Node.js is not installed or not in PATH');
        }
        throw error;
    }
    
    // Check npm
    try {
        const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
        console.log(`✅ npm ${npmVersion} installed`);
    } catch (error) {
        throw new Error('npm is not installed or not in PATH');
    }
    
    // Check method-specific prerequisites
    if (deploymentMethod === 'docker') {
        try {
            const dockerVersion = execSync('docker --version', { encoding: 'utf8' }).trim();
            console.log(`✅ ${dockerVersion}`);
            
            const composeVersion = execSync('docker-compose --version', { encoding: 'utf8' }).trim();
            console.log(`✅ ${composeVersion}`);
        } catch (error) {
            throw new Error('Docker or Docker Compose is not installed');
        }
    } else if (deploymentMethod === 'systemd') {
        if (process.platform !== 'linux') {
            throw new Error('Systemd deployment is only supported on Linux');
        }
        
        try {
            execSync('systemctl --version', { stdio: 'pipe' });
            console.log('✅ Systemd available');
        } catch (error) {
            throw new Error('Systemd is not available on this system');
        }
    }
    
    // Check if required files exist
    const requiredFiles = ['package.json', 'tsconfig.json', 'src/index.ts'];
    for (const file of requiredFiles) {
        if (!await fs.pathExists(file)) {
            throw new Error(`Required file not found: ${file}`);
        }
    }
    
    console.log('✅ All prerequisites verified');
}

async function buildApplication() {
    console.log('\n📋 Step 3: Building Application');
    console.log('-----------------------------');
    
    try {
        // Install dependencies
        console.log('Installing dependencies...');
        execSync('npm ci', { stdio: 'inherit' });
        
        // Build the application
        console.log('Building application...');
        execSync('npm run build:clean', { stdio: 'inherit' });
        
        console.log('✅ Application built successfully');
    } catch (error) {
        throw new Error(`Build failed: ${error.message}`);
    }
}

async function runPreDeploymentChecks() {
    console.log('\n📋 Step 4: Running Pre-deployment Checks');
    console.log('--------------------------------------');
    
    try {
        // Run the deploy-check.js script
        execSync('node scripts/deploy-check.js', { stdio: 'inherit' });
        console.log('✅ Pre-deployment checks passed');
    } catch (error) {
        throw new Error('Pre-deployment checks failed');
    }
}

async function deployWithMethod(method, rl) {
    console.log(`\n📋 Step 5: Deploying with ${method.toUpperCase()}`);
    console.log('-'.repeat(method.length + 25));
    
    if (method === 'local') {
        await deployLocal();
    } else if (method === 'docker') {
        await deployDocker();
    } else if (method === 'systemd') {
        await deploySystemd(rl);
    }
}

async function deployLocal() {
    console.log('Setting up for local deployment...');
    
    // Create necessary directories
    await fs.ensureDir('logs');
    await fs.ensureDir('data');
    await fs.ensureDir('backups');
    
    // Create .env file if it doesn't exist
    if (!await fs.pathExists('.env')) {
        const envContent = `NODE_ENV=production\nPORT=3000\nHOST=localhost\nLOG_LEVEL=info\n`;
        await fs.writeFile('.env', envContent);
        console.log('✅ Created .env file');
    }
    
    console.log('✅ Local deployment setup complete');
    console.log('\nTo start the application:');
    console.log('  npm start');
    console.log('\nFor development mode:');
    console.log('  npm run dev');
}

async function deployDocker() {
    console.log('Setting up Docker deployment...');
    
    // Check if docker-compose.yml exists
    if (!await fs.pathExists('docker-compose.yml')) {
        throw new Error('docker-compose.yml not found');
    }
    
    // Create .env file for Docker if it doesn't exist
    if (!await fs.pathExists('.env')) {
        const envContent = `NODE_ENV=production\nPORT=3000\nHOST=0.0.0.0\nLOG_LEVEL=info\n`;
        await fs.writeFile('.env', envContent);
        console.log('✅ Created .env file');
    }
    
    // Build and start Docker containers
    console.log('Building and starting Docker containers...');
    execSync('docker-compose up -d --build', { stdio: 'inherit' });
    
    console.log('✅ Docker deployment complete');
    console.log('\nContainer status:');
    execSync('docker-compose ps', { stdio: 'inherit' });
}

async function deploySystemd(rl) {
    console.log('Setting up Systemd service...');
    
    // Check if running as root
    const isRoot = process.getuid && process.getuid() === 0;
    if (!isRoot) {
        console.log('⚠️  Warning: Not running as root. Some operations may fail.');
        console.log('   Consider running this script with sudo.');
        
        const proceed = await ask(rl, 'Continue anyway? (y/n)', 'n');
        if (proceed.toLowerCase() !== 'y') {
            throw new Error('Deployment cancelled');
        }
    }
    
    // Check if service file exists
    if (!await fs.pathExists('whatsapp-auto-reply.service')) {
        throw new Error('whatsapp-auto-reply.service file not found');
    }
    
    try {
        // Create application user
        console.log('Creating application user...');
        try {
            execSync('sudo useradd --system --shell /bin/false whatsapp', { stdio: 'pipe' });
            console.log('✅ Created whatsapp user');
        } catch (error) {
            console.log('⚠️  User whatsapp may already exist, continuing...');
        }
        
        // Create application directory
        console.log('Creating application directory...');
        execSync('sudo mkdir -p /opt/whatsapp-auto-reply', { stdio: 'pipe' });
        
        // Copy application files
        console.log('Copying application files...');
        execSync('sudo cp -r * /opt/whatsapp-auto-reply/', { stdio: 'pipe' });
        
        // Set permissions
        console.log('Setting permissions...');
        execSync('sudo chown -R whatsapp:whatsapp /opt/whatsapp-auto-reply', { stdio: 'pipe' });
        
        // Install service file
        console.log('Installing systemd service...');
        execSync('sudo cp whatsapp-auto-reply.service /etc/systemd/system/', { stdio: 'pipe' });
        
        // Reload systemd
        console.log('Reloading systemd...');
        execSync('sudo systemctl daemon-reload', { stdio: 'pipe' });
        
        // Enable and start service
        console.log('Enabling and starting service...');
        execSync('sudo systemctl enable whatsapp-auto-reply', { stdio: 'pipe' });
        execSync('sudo systemctl start whatsapp-auto-reply', { stdio: 'pipe' });
        
        console.log('✅ Systemd service deployed');
        
        // Show service status
        console.log('\nService status:');
        execSync('sudo systemctl status whatsapp-auto-reply', { stdio: 'inherit' });
        
    } catch (error) {
        throw new Error(`Systemd deployment failed: ${error.message}`);
    }
}

async function verifyDeployment() {
    console.log('\n📋 Step 6: Verifying Deployment');
    console.log('-----------------------------');
    
    try {
        // Run the verify-deployment.js script
        execSync('node scripts/verify-deployment.js', { stdio: 'inherit' });
        console.log('✅ Deployment verification passed');
    } catch (error) {
        throw new Error('Deployment verification failed');
    }
}

function ask(rl, question, defaultValue = '') {
    return new Promise((resolve) => {
        const prompt = defaultValue ? `${question} [${defaultValue}]: ` : `${question}: `;
        rl.question(prompt, (answer) => {
            resolve(answer.trim() || defaultValue);
        });
    });
}

// Run deployment if called directly
if (require.main === module) {
    deploy();
}

module.exports = { deploy };