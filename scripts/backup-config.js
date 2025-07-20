#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');

/**
 * Backup configuration files
 */
async function backupConfig() {
    console.log('💾 Creating configuration backup...');
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join('backups', `config-${timestamp}`);
    
    try {
        // Ensure backup directory exists
        await fs.ensureDir(backupDir);
        
        // Files to backup
        const filesToBackup = [
            'config/default.json',
            '.env',
            'package.json'
        ];
        
        const backedUpFiles = [];
        
        for (const file of filesToBackup) {
            if (await fs.pathExists(file)) {
                const fileName = path.basename(file);
                const backupPath = path.join(backupDir, fileName);
                await fs.copy(file, backupPath);
                backedUpFiles.push(file);
                console.log(`  ✓ Backed up ${file}`);
            } else {
                console.log(`  ⚠️  Skipped ${file} (not found)`);
            }
        }
        
        // Create backup manifest
        const manifest = {
            timestamp: new Date().toISOString(),
            files: backedUpFiles,
            version: await getAppVersion(),
            nodeVersion: process.version
        };
        
        await fs.writeJSON(path.join(backupDir, 'manifest.json'), manifest, { spaces: 2 });
        
        console.log(`\n✅ Configuration backup created: ${backupDir}`);
        console.log(`📁 Backed up ${backedUpFiles.length} files`);
        
        // Clean up old backups (keep last 10)
        await cleanupOldBackups();
        
    } catch (error) {
        console.error('❌ Backup failed:', error.message);
        process.exit(1);
    }
}

async function getAppVersion() {
    try {
        const packageJson = await fs.readJSON('package.json');
        return packageJson.version;
    } catch (error) {
        return 'unknown';
    }
}

async function cleanupOldBackups() {
    try {
        const backupsDir = 'backups';
        const entries = await fs.readdir(backupsDir);
        
        // Filter config backup directories
        const configBackups = entries
            .filter(entry => entry.startsWith('config-'))
            .map(entry => ({
                name: entry,
                path: path.join(backupsDir, entry),
                timestamp: entry.replace('config-', '')
            }))
            .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
        
        // Keep only the 10 most recent backups
        const backupsToDelete = configBackups.slice(10);
        
        for (const backup of backupsToDelete) {
            await fs.remove(backup.path);
            console.log(`  🗑️  Removed old backup: ${backup.name}`);
        }
        
        if (backupsToDelete.length > 0) {
            console.log(`  ✓ Cleaned up ${backupsToDelete.length} old backups`);
        }
        
    } catch (error) {
        console.warn('⚠️  Could not clean up old backups:', error.message);
    }
}

// Run backup if called directly
if (require.main === module) {
    backupConfig();
}

module.exports = { backupConfig };