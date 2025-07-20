#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');

/**
 * Setup required directories for the application
 */
async function setupDirectories() {
    console.log('📁 Setting up directory structure...');
    
    const directories = [
        {
            path: 'logs',
            description: 'Application logs'
        },
        {
            path: 'config',
            description: 'Configuration files'
        },
        {
            path: 'data',
            description: 'Application data storage'
        },
        {
            path: 'backups',
            description: 'Configuration backups'
        },
        {
            path: 'temp',
            description: 'Temporary files'
        },
        {
            path: 'public',
            description: 'Web interface static files'
        }
    ];
    
    try {
        for (const dir of directories) {
            await fs.ensureDir(dir.path);
            
            // Create .gitkeep for empty directories (except public which has files)
            if (dir.path !== 'public') {
                const gitkeepPath = path.join(dir.path, '.gitkeep');
                if (!await fs.pathExists(gitkeepPath)) {
                    await fs.writeFile(gitkeepPath, `# ${dir.description}\n`);
                }
            }
            
            console.log(`  ✓ ${dir.path}/ - ${dir.description}`);
        }
        
        // Create subdirectories for logs
        const logSubdirs = ['activity', 'errors', 'system'];
        for (const subdir of logSubdirs) {
            const logDir = path.join('logs', subdir);
            await fs.ensureDir(logDir);
            await fs.writeFile(path.join(logDir, '.gitkeep'), `# ${subdir} logs\n`);
            console.log(`  ✓ logs/${subdir}/ - ${subdir} logs`);
        }
        
        // Set appropriate permissions (Unix-like systems)
        if (process.platform !== 'win32') {
            try {
                await fs.chmod('logs', 0o755);
                await fs.chmod('config', 0o755);
                await fs.chmod('data', 0o755);
                await fs.chmod('backups', 0o700); // More restrictive for backups
                console.log('  ✓ Set directory permissions');
            } catch (error) {
                console.log('  ⚠️  Could not set directory permissions (this is normal on some systems)');
            }
        }
        
        console.log('\n✅ Directory structure created successfully!');
        
    } catch (error) {
        console.error('❌ Failed to create directory structure:', error.message);
        process.exit(1);
    }
}

// Run setup if called directly
if (require.main === module) {
    setupDirectories();
}

module.exports = { setupDirectories };