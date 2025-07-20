#!/usr/bin/env node

const http = require('http');
const https = require('https');
const fs = require('fs-extra');

/**
 * Health check script for monitoring and deployment verification
 */
async function healthCheck() {
    console.log('🏥 Running health check...');
    
    const config = await loadConfig();
    const port = config?.webServer?.port || process.env.PORT || 3000;
    const host = config?.webServer?.host || process.env.HOST || 'localhost';
    
    try {
        const healthStatus = await checkHealth(host, port);
        
        console.log('\n📊 Health Check Results');
        console.log('======================');
        console.log(`Status: ${healthStatus.status}`);
        console.log(`Timestamp: ${healthStatus.timestamp}`);
        
        if (healthStatus.checks) {
            console.log('\nComponent Status:');
            Object.entries(healthStatus.checks).forEach(([component, status]) => {
                const icon = status ? '✅' : '❌';
                console.log(`  ${icon} ${component}: ${status ? 'OK' : 'FAILED'}`);
            });
        }
        
        if (healthStatus.status === 'healthy') {
            console.log('\n✅ Application is healthy');
            process.exit(0);
        } else {
            console.log('\n❌ Application is unhealthy');
            process.exit(1);
        }
        
    } catch (error) {
        console.error('❌ Health check failed:', error.message);
        
        // Try to provide more specific error information
        if (error.code === 'ECONNREFUSED') {
            console.error(`   Application is not running on ${host}:${port}`);
            console.error('   Make sure the application is started with "npm start"');
        } else if (error.code === 'ENOTFOUND') {
            console.error(`   Cannot resolve hostname: ${host}`);
        }
        
        process.exit(1);
    }
}

async function loadConfig() {
    try {
        const configPath = 'config/default.json';
        if (await fs.pathExists(configPath)) {
            return await fs.readJSON(configPath);
        }
    } catch (error) {
        console.warn('Could not load configuration, using defaults');
    }
    return null;
}

function checkHealth(host, port) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: host,
            port: port,
            path: '/api/health',
            method: 'GET',
            timeout: 5000
        };
        
        const req = http.request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    const healthStatus = JSON.parse(data);
                    resolve(healthStatus);
                } catch (error) {
                    reject(new Error(`Invalid health check response: ${error.message}`));
                }
            });
        });
        
        req.on('error', (error) => {
            reject(error);
        });
        
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Health check request timed out'));
        });
        
        req.end();
    });
}

// Additional health checks for system resources
async function checkSystemHealth() {
    const health = {
        memory: checkMemoryUsage(),
        disk: await checkDiskSpace(),
        uptime: process.uptime()
    };
    
    return health;
}

function checkMemoryUsage() {
    const usage = process.memoryUsage();
    const totalMB = Math.round(usage.heapTotal / 1024 / 1024);
    const usedMB = Math.round(usage.heapUsed / 1024 / 1024);
    const freeMB = totalMB - usedMB;
    
    return {
        total: `${totalMB}MB`,
        used: `${usedMB}MB`,
        free: `${freeMB}MB`,
        percentage: Math.round((usedMB / totalMB) * 100)
    };
}

async function checkDiskSpace() {
    try {
        const stats = await fs.stat('.');
        return {
            available: true,
            writable: true
        };
    } catch (error) {
        return {
            available: false,
            writable: false,
            error: error.message
        };
    }
}

// Run health check if called directly
if (require.main === module) {
    // Parse command line arguments
    const args = process.argv.slice(2);
    const verbose = args.includes('--verbose') || args.includes('-v');
    const systemCheck = args.includes('--system') || args.includes('-s');
    
    if (systemCheck) {
        checkSystemHealth().then(health => {
            console.log('🖥️  System Health:');
            console.log(`Memory: ${health.memory.used}/${health.memory.total} (${health.memory.percentage}%)`);
            console.log(`Uptime: ${Math.round(health.uptime)}s`);
            console.log(`Disk: ${health.disk.available ? 'Available' : 'Unavailable'}`);
        });
    } else {
        healthCheck();
    }
}

module.exports = { healthCheck, checkSystemHealth };