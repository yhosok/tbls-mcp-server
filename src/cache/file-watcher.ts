import { FSWatcher, watch, promises as fs } from 'fs';
import { safeExecuteAsync } from '../utils/result';

/**
 * File change callback function signature
 */
export type FileChangeCallback = (
  filePath: string,
  newMtime: Date,
  oldMtime: Date
) => void;

/**
 * Error callback function signature
 */
export type ErrorCallback = (error: Error) => void;

/**
 * Directory watching options
 */
export interface WatchOptions {
  /** Whether to watch subdirectories recursively */
  recursive?: boolean;
  /** Function to filter which files should trigger callbacks */
  fileFilter?: (filename: string) => boolean;
}

/**
 * Internal watcher state
 */
interface WatcherState {
  /** File system watcher instance */
  watcher: FSWatcher;
  /** Last known modification time */
  lastMtime: Date;
  /** Change callback function */
  changeCallback: FileChangeCallback;
  /** Error callback function */
  errorCallback?: ErrorCallback;
  /** Debounce timeout ID */
  debounceTimeout?: NodeJS.Timeout;
  /** Whether this is a directory watcher */
  isDirectory: boolean;
  /** File filter for directory watching */
  fileFilter?: (filename: string) => boolean;
}

/**
 * File system monitoring class with change detection and throttling
 *
 * Features:
 * - Individual file watching
 * - Directory watching with recursive option
 * - File filtering for directory watching
 * - Change event throttling/debouncing (100ms default)
 * - Multiple watcher management
 * - Error handling with callbacks
 * - Automatic cleanup on destroy
 */
export class FileWatcher {
  private watchers = new Map<string, WatcherState>();
  private readonly debounceDelayMs = 100;

  /**
   * Starts watching a file for changes
   *
   * @param filePath - Path to the file to watch
   * @param changeCallback - Callback when file changes
   * @param errorCallback - Optional callback for errors
   */
  async watchFile(
    filePath: string,
    changeCallback: FileChangeCallback,
    errorCallback?: ErrorCallback
  ): Promise<void> {
    if (!filePath || filePath.trim().length === 0) {
      throw new Error('Invalid file path');
    }

    // Get initial modification time
    const statResult = await safeExecuteAsync(
      async () => await fs.stat(filePath),
      'Failed to get initial file stats'
    );

    if (statResult.isErr()) {
      if (errorCallback) {
        // Extract the original error from the wrapped error
        const originalError = statResult.error.message.includes(':')
          ? new Error(statResult.error.message.split(': ').slice(1).join(': '))
          : statResult.error;
        errorCallback(originalError);
      }
      return;
    }

    const stats = statResult.value;
    if (!stats.isFile()) {
      const error = new Error(`Path is not a file: ${filePath}`);
      if (errorCallback) {
        errorCallback(error);
      }
      return;
    }

    // Stop any existing watcher for this path
    this.stopWatching(filePath);

    // Create new watcher
    const watcher = watch(filePath);

    // Set up change event handling
    watcher.on('change', (eventType, filename) => {
      this.handleFileChange(filePath, eventType, filename?.toString() ?? null);
    });

    // Set up error handling
    watcher.on('error', (error) => {
      if (errorCallback) {
        errorCallback(error);
      }
    });

    // Store watcher state
    this.watchers.set(filePath, {
      watcher,
      lastMtime: stats.mtime,
      changeCallback,
      errorCallback,
      isDirectory: false,
    });
  }

  /**
   * Starts watching a directory for changes
   *
   * @param dirPath - Path to the directory to watch
   * @param changeCallback - Callback when directory or files change
   * @param errorCallback - Optional callback for errors
   * @param options - Watch options including recursive and file filter
   */
  async watchDirectory(
    dirPath: string,
    changeCallback: FileChangeCallback,
    errorCallback?: ErrorCallback,
    options: WatchOptions = {}
  ): Promise<void> {
    if (!dirPath || dirPath.trim().length === 0) {
      throw new Error('Invalid directory path');
    }

    // Get initial modification time
    const statResult = await safeExecuteAsync(
      async () => await fs.stat(dirPath),
      'Failed to get initial directory stats'
    );

    if (statResult.isErr()) {
      if (errorCallback) {
        // Extract the original error from the wrapped error
        const originalError = statResult.error.message.includes(':')
          ? new Error(statResult.error.message.split(': ').slice(1).join(': '))
          : statResult.error;
        errorCallback(originalError);
      }
      return;
    }

    const stats = statResult.value;
    if (!stats.isDirectory()) {
      const error = new Error(`Path is not a directory: ${dirPath}`);
      if (errorCallback) {
        errorCallback(error);
      }
      return;
    }

    // Stop any existing watcher for this path
    this.stopWatching(dirPath);

    // Create new watcher with recursive option (default to true)
    const recursive = options.recursive !== false; // Default to true
    const watcher = recursive
      ? watch(dirPath, { recursive: true })
      : watch(dirPath);

    // Set up change event handling
    watcher.on('change', (eventType, filename) => {
      this.handleDirectoryChange(dirPath, eventType, filename?.toString() ?? null, options.fileFilter);
    });

    // Set up error handling
    watcher.on('error', (error) => {
      if (errorCallback) {
        errorCallback(error);
      }
    });

    // Store watcher state
    this.watchers.set(dirPath, {
      watcher,
      lastMtime: stats.mtime,
      changeCallback,
      errorCallback,
      isDirectory: true,
      fileFilter: options.fileFilter,
    });
  }

  /**
   * Stops watching a specific file or directory
   *
   * @param path - Path to stop watching
   */
  stopWatching(path: string): void {
    const watcherState = this.watchers.get(path);
    if (watcherState) {
      // Clear any pending debounce timeout
      if (watcherState.debounceTimeout) {
        clearTimeout(watcherState.debounceTimeout);
      }

      // Close the watcher
      watcherState.watcher.close();

      // Remove from map
      this.watchers.delete(path);
    }
  }

  /**
   * Stops all watchers and cleans up resources
   */
  destroy(): void {
    for (const [path] of this.watchers) {
      this.stopWatching(path);
    }
  }

  /**
   * Handles file change events with debouncing
   */
  private handleFileChange(filePath: string, _eventType: string, _filename: string | null): void {
    const watcherState = this.watchers.get(filePath);
    if (!watcherState) {
      return;
    }

    // Clear any existing timeout
    if (watcherState.debounceTimeout) {
      clearTimeout(watcherState.debounceTimeout);
    }

    // Set up debounced change detection
    watcherState.debounceTimeout = setTimeout(async () => {
      await this.checkFileChange(filePath, watcherState);
    }, this.debounceDelayMs);
  }

  /**
   * Handles directory change events with debouncing and filtering
   */
  private handleDirectoryChange(
    dirPath: string,
    _eventType: string,
    filename: string | null,
    fileFilter?: (filename: string) => boolean
  ): void {
    const watcherState = this.watchers.get(dirPath);
    if (!watcherState) {
      return;
    }

    // Apply file filter if provided and filename is available
    if (fileFilter && filename && !fileFilter(filename)) {
      return;
    }

    // Clear any existing timeout
    if (watcherState.debounceTimeout) {
      clearTimeout(watcherState.debounceTimeout);
    }

    // Set up debounced change detection
    watcherState.debounceTimeout = setTimeout(async () => {
      await this.checkDirectoryChange(dirPath, watcherState);
    }, this.debounceDelayMs);
  }

  /**
   * Checks if file has actually changed by comparing modification times
   */
  private async checkFileChange(filePath: string, watcherState: WatcherState): Promise<void> {
    const statResult = await safeExecuteAsync(
      async () => await fs.stat(filePath),
      'Failed to check file modification time'
    );

    if (statResult.isErr()) {
      if (watcherState.errorCallback) {
        watcherState.errorCallback(statResult.error);
      }
      return;
    }

    const stats = statResult.value;
    if (!stats.isFile()) {
      if (watcherState.errorCallback) {
        watcherState.errorCallback(new Error(`Path is no longer a file: ${filePath}`));
      }
      return;
    }

    // Check if modification time has actually changed
    if (stats.mtime.getTime() !== watcherState.lastMtime.getTime()) {
      const oldMtime = watcherState.lastMtime;
      watcherState.lastMtime = stats.mtime;

      // Trigger callback with old and new modification times
      watcherState.changeCallback(filePath, stats.mtime, oldMtime);
    }
  }

  /**
   * Checks if directory has actually changed by comparing modification times
   */
  private async checkDirectoryChange(dirPath: string, watcherState: WatcherState): Promise<void> {
    const statResult = await safeExecuteAsync(
      async () => await fs.stat(dirPath),
      'Failed to check directory modification time'
    );

    if (statResult.isErr()) {
      if (watcherState.errorCallback) {
        watcherState.errorCallback(statResult.error);
      }
      return;
    }

    const stats = statResult.value;
    if (!stats.isDirectory()) {
      if (watcherState.errorCallback) {
        watcherState.errorCallback(new Error(`Path is no longer a directory: ${dirPath}`));
      }
      return;
    }

    // Check if modification time has actually changed
    if (stats.mtime.getTime() !== watcherState.lastMtime.getTime()) {
      const oldMtime = watcherState.lastMtime;
      watcherState.lastMtime = stats.mtime;

      // Trigger callback with old and new modification times
      watcherState.changeCallback(dirPath, stats.mtime, oldMtime);
    }
  }
}