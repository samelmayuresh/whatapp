#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');
const http = require('http');

/**
 * Verify deployment integrity and readiness
 */
async function verifyDeployment() {
    console.log('🔍 Verifying deployment...');
    
    const checks = [
        { name: 'Directory Structure', check: verifyDirectories },
        { name: 'Configuration Files', check: verifyConfiguration },
        { name: 'Dependencies', check: verifyDependencies },
        { name: 'Build Output', check: verifyBuild },
        { name: 'Permissions', check: verifyPermissions },
        { name: 'Environment Variables', check: verifyEnvironment }
    ];
    
    let allPassed = true;
    
    for (const { name, check } of checks) {
        try {
            console.log(`\n📋 ${name}`);
            console.log('-'.repeat(name.length + 3));
            
            const result = await check();
            if (result.success) {
                console.log('  ✅ PASSED');
                if (result.details) {
                    result.details.forEach(detail => console.log(`    ${detail}`));
                }
            } else {
                console.log('  ❌ FAILED');
                if (result.errors) {
                    result.errors.forEach(error => console.log(`    ❌ ${error}`));
                }
                if (result.warnings) {
                    result.warnings.forEach(warning => console.log(`    ⚠️  ${warning}`));
                }
                allPassed = false;
            }
        } catch (error) {
            console.log(`  ❌ ERROR: ${error.message}`);
            allPassed = false;
        }
    }
    
    console.log('\n' + '='.repeat(50));
    if (allPassed) {
        console.log('✅ Deployment verification PASSED');
        console.log('🚀 Application is ready to start!');
        process.exit(0);
    } else {
        console.log('❌ Deployment verification FAILED');
        console.log('🔧 Please fix the issues above before starting the application');
        process.exit(1);
    }
}

async function verifyDirectories() {
    const requiredDirs = ['logs', 'config', 'data', 'backups', 'temp', 'public', 'dist'];
    const errors = [];
    const details = [];
    
    for (const dir of requiredDirs) {
        if (await fs.pathExists(dir)) {
            details.push(`✓ ${dir}/`);
        } else {
            errors.push(`Missing directory: ${dir}/`);
        }
    }
    
    return {
        success: errors.length === 0,
        errors,
        details
    };
}

async function verifyConfiguration() {
    const configFile = 'config/default.json';
    const errors = [];
    const warnings = [];
    const details = [];
    
    if (!await fs.pathExists(configFile)) {
        errors.push('Configuration file missing: config/default.json');
        return { success: false, errors };
    }
    
    try {
        const config = await fs.readJSON(configFile);
        details.push('✓ Configuration file exists and is valid JSON');
        
        // Check required configuration sections
        const requiredSections = ['system', 'webServer', 'messageTemplates'];
        for (const section of requiredSections) {
            if (config[section]) {
                details.push(`✓ ${section} configuration present`);
            } else {
                errors.push(`Missing configuration section: ${section}`);
            }
        }
        
        // Check for default message template
        if (config.messageTemplates && config.messageTemplates.length > 0) {
            const hasDefault = config.messageTemplates.some(t => t.isDefault);
            if (hasDefault) {
                details.push('✓ Default message template configured');
            } else {
                warnings.push('No default message template found');
            }
        }
        
    } catch (error) {
        errors.push(`Invalid configuration file: ${error.message}`);
    }
    
    return {
        success: errors.length === 0,
        errors,
        warnings,
        details
    };
}

async function verifyDependencies() {
    const packageJsonPath = 'package.json';
    const nodeModulesPath = 'node_modules';
    const errors = [];
    const details = [];
    
    if (!await fs.pathExists(packageJsonPath)) {
        errors.push('package.json not found');
        return { success: false, errors };
    }
    
    if (!await fs.pathExists(nodeModulesPath)) {
        errors.push('node_modules not found - run "npm install"');
        return { success: false, errors };
    }
    
    try {
        const packageJson = await fs.readJSON(packageJsonPath);
        details.push(`✓ Package: ${packageJson.name}@${packageJson.version}`);
        
        // Check critical dependencies
        const criticalDeps = ['express', 'whatsapp-web.js', 'fs-extra', 'ws'];
        for (const dep of criticalDeps) {
            const depPath = path.join(nodeModulesPath, dep);
            if (await fs.pathExists(depPath)) {
                details.push(`✓ ${dep} installed`);
            } else {
                errors.push(`Critical dependency missing: ${dep}`);
            }
        }
        
    } catch (error) {
        errors.push(`Error reading package.json: ${error.message}`);
    }
    
    return {
        success: errors.length === 0,
        errors,
        details
    };
}

async function verifyBuild() {
    const distPath = 'dist';
    const mainFile = 'dist/index.js';
    const errors = [];
    const details = [];
    
    if (!await fs.pathExists(distPath)) {
        errors.push('Build output directory missing - run "npm run build"');
        return { success: false, errors };
    }
    
    if (!await fs.pathExists(mainFile)) {
        errors.push('Main application file missing - run "npm run build"');
        return { success: false, errors };
    }
    
    details.push('✓ Build output directory exists');
    details.push('✓ Main application file exists');
    
    // Check for other important build files
    const importantFiles = [
        'dist/services',
        'dist/utils',
        'dist/web',
        'dist/models'
    ];
    
    for (const file of importantFiles) {
        if (await fs.pathExists(file)) {
            details.push(`✓ ${file.replace('dist/', '')} compiled`);
        }
    }
    
    return {
        success: errors.length === 0,
        errors,
        details
    };
}

async function verifyPermissions() {
    const errors = [];
    const warnings = [];
    const details = [];
    
    // Skip permission checks on Windows
    if (process.platform === 'win32') {
        details.push('✓ Permission checks skipped (Windows)');
        return { success: true, details };
    }
    
    const checkDirs = [
        { path: 'logs', required: true },
        { path: 'config', required: true },
        { path: 'data', required: true },
        { path: 'backups', required: true }
    ];
    
    for (const { path: dirPath, required } of checkDirs) {
        try {
            await fs.access(dirPath, fs.constants.R_OK | fs.constants.W_OK);
            details.push(`✓ ${dirPath}/ is readable and writable`);
        } catch (error) {
            if (required) {
                errors.push(`Cannot read/write ${dirPath}/ - check permissions`);
            } else {
                warnings.push(`Cannot read/write ${dirPath}/ - check permissions`);
            }
        }
    }
    
    return {
        success: errors.length === 0,
        errors,
        warnings,
        details
    };
}

async function verifyEnvironment() {
    const errors = [];
    const warnings = [];
    const details = [];
    
    // Check Node.js version
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
    
    if (majorVersion >= 16) {
        details.push(`✓ Node.js ${nodeVersion} (supported)`);
    } else {
        errors.push(`Node.js ${nodeVersion} is too old (requires >= 16.0.0)`);
    }
    
    // Check environment variables
    const envFile = '.env';
    if (await fs.pathExists(envFile)) {
        details.push('✓ .env file exists');
    } else {
        warnings.push('.env file not found (using defaults)');
    }
    
    // Check port availability (if specified)
    const port = process.env.PORT || 3000;
    try {
        await checkPortAvailable(port);
        details.push(`✓ Port ${port} is available`);
    } catch (error) {
        warnings.push(`Port ${port} may be in use`);
    }
    
    return {
        success: errors.length === 0,
        errors,
        warnings,
        details
    };
}

function checkPortAvailable(port) {
    return new Promise((resolve, reject) => {
        const server = http.createServer();
        
        server.listen(port, () => {
            server.close(() => resolve());
        });
        
        server.on('error', (error) => {
            if (error.code === 'EADDRINUSE') {
                reject(new Error(`Port ${port} is already in use`));
            } else {
                reject(error);
            }
        });
    });
}

// Run verification if called directly
if (require.main === module) {
    verifyDeployment();
}

module.exports = { verifyDeployment };