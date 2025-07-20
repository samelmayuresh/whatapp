import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';

export interface ConfigWatcherEvents {
  'config-changed': (filePath: string) => void;
  'config-error': (error: Error) => void;
}

export class ConfigWatcher extends EventEmitter {
  private watchers: Map<string, fs.FSWatcher> = new Map();
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private debounceDelay: number = 1000; // 1 second

  constructor(debounceDelay: number = 1000) {
    super();
    this.debounceDelay = debounceDelay;
  }

  /**
   * Start watching a configuration file
   */
  watchFile(filePath: string): void {
    if (this.watchers.has(filePath)) {
      return; // Already watching
    }

    try {
      const absolutePath = path.resolve(filePath);
      
      // Check if file exists
      if (!fs.existsSync(absolutePath)) {
        console.warn(`Configuration file does not exist: ${absolutePath}`);
        return;
      }

      const watcher = fs.watch(absolutePath, (eventType) => {
        if (eventType === 'change') {
          this.handleFileChange(absolutePath);
        }
      });

      watcher.on('error', (error) => {
        this.emit('config-error', error);
      });

      this.watchers.set(filePath, watcher);
      console.log(`Started watching configuration file: ${absolutePath}`);
    } catch (error) {
      this.emit('config-error', error as Error);
    }
  }

  /**
   * Stop watching a configuration file
   */
  unwatchFile(filePath: string): void {
    const watcher = this.watchers.get(filePath);
    if (watcher) {
      watcher.close();
      this.watchers.delete(filePath);
      
      // Clear any pending debounce timer
      const timer = this.debounceTimers.get(filePath);
      if (timer) {
        clearTimeout(timer);
        this.debounceTimers.delete(filePath);
      }
      
      console.log(`Stopped watching configuration file: ${filePath}`);
    }
  }

  /**
   * Stop watching all files
   */
  unwatchAll(): void {
    for (const filePath of this.watchers.keys()) {
      this.unwatchFile(filePath);
    }
  }

  /**
   * Get list of currently watched files
   */
  getWatchedFiles(): string[] {
    return Array.from(this.watchers.keys());
  }

  private handleFileChange(filePath: string): void {
    // Clear existing debounce timer
    const existingTimer = this.debounceTimers.get(filePath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new debounce timer
    const timer = setTimeout(() => {
      this.emit('config-changed', filePath);
      this.debounceTimers.delete(filePath);
    }, this.debounceDelay);

    this.debounceTimers.set(filePath, timer);
  }
}

// Singleton instance for global use
export const configWatcher = new ConfigWatcher();