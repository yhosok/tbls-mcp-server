import { LRUCache } from 'lru-cache';
import { promises as fs } from 'fs';
import { DatabaseSchema, DatabaseTable, TableReference } from '../schemas/database';
import { safeExecuteAsync } from '../utils/result';

/**
 * Configuration options for ResourceCache
 */
export interface ResourceCacheOptions {
  /** Maximum number of items to cache */
  maxItems: number;
  /** Time-to-live in milliseconds */
  ttlMs: number;
}

/**
 * Cache statistics interface
 */
export interface CacheStats {
  /** Number of cache hits */
  hits: number;
  /** Number of cache misses */
  misses: number;
  /** Hit rate (hits / (hits + misses)) */
  hitRate: number;
  /** Current cache size */
  size: number;
}

/**
 * Internal cache entry with metadata
 */
interface CacheEntry<T> {
  /** Cached data */
  data: T;
  /** File modification time when cached */
  mtime: Date;
  /** Path to the cached file/directory */
  path: string;
}

/**
 * LRU Cache system for tbls MCP server resources
 *
 * Features:
 * - File content caching with mtime-based invalidation
 * - Parsed schema caching
 * - Table references caching
 * - Individual table caching
 * - Cache statistics tracking
 * - LRU eviction policy
 */
export class ResourceCache {
  private cache: LRUCache<string, CacheEntry<unknown>>;
  private hits = 0;
  private misses = 0;

  constructor(options: ResourceCacheOptions) {
    this.cache = new LRUCache({
      max: options.maxItems,
      ttl: options.ttlMs,
      // Allow stale entries to avoid blocking operations
      allowStale: false,
      // Update modification time on access
      updateAgeOnGet: true,
      // Don't update modification time on peek operations
      updateAgeOnHas: false,
    });
  }

  /**
   * Gets file content from cache if valid, null if expired or missing
   */
  async getFileContent(filePath: string): Promise<string | null> {
    const cacheKey = `file:${filePath}`;
    const cached = this.cache.get(cacheKey) as CacheEntry<string> | undefined;

    if (!cached) {
      this.misses++;
      return null;
    }

    // Check if file modification time has changed
    const isValid = await this.isFileEntryValid(cached);
    if (!isValid) {
      this.cache.delete(cacheKey);
      this.misses++;
      return null;
    }

    this.hits++;
    return cached.data;
  }

  /**
   * Caches file content with current mtime
   */
  async setFileContent(filePath: string, content: string): Promise<void> {
    const statResult = await safeExecuteAsync(
      async () => await fs.stat(filePath),
      'Failed to get file stats'
    );

    if (statResult.isErr()) {
      return;
    }

    const stats = statResult.value;
    const cacheKey = `file:${filePath}`;

    this.cache.set(cacheKey, {
      data: content,
      mtime: stats.mtime,
      path: filePath,
    });
  }

  /**
   * Gets parsed schema from cache if valid, null if expired or missing
   */
  async getSchema(schemaPath: string): Promise<DatabaseSchema | null> {
    const cacheKey = `schema:${schemaPath}`;
    const cached = this.cache.get(cacheKey) as CacheEntry<DatabaseSchema> | undefined;

    if (!cached) {
      this.misses++;
      return null;
    }

    // Check if directory modification time has changed
    const isValid = await this.isDirectoryEntryValid(cached);
    if (!isValid) {
      this.cache.delete(cacheKey);
      this.misses++;
      return null;
    }

    this.hits++;
    return cached.data;
  }

  /**
   * Caches parsed schema with current directory mtime
   */
  async setSchema(schemaPath: string, schema: DatabaseSchema): Promise<void> {
    const statResult = await safeExecuteAsync(
      async () => await fs.stat(schemaPath),
      'Failed to get directory stats'
    );

    if (statResult.isErr()) {
      return;
    }

    const stats = statResult.value;
    const cacheKey = `schema:${schemaPath}`;

    this.cache.set(cacheKey, {
      data: schema,
      mtime: stats.mtime,
      path: schemaPath,
    });
  }

  /**
   * Gets table references from cache if valid, null if expired or missing
   */
  async getTableReferences(schemaPath: string): Promise<TableReference[] | null> {
    const cacheKey = `tableRefs:${schemaPath}`;
    const cached = this.cache.get(cacheKey) as CacheEntry<TableReference[]> | undefined;

    if (!cached) {
      this.misses++;
      return null;
    }

    // Check if directory modification time has changed
    const isValid = await this.isDirectoryEntryValid(cached);
    if (!isValid) {
      this.cache.delete(cacheKey);
      this.misses++;
      return null;
    }

    this.hits++;
    return cached.data;
  }

  /**
   * Caches table references with current directory mtime
   */
  async setTableReferences(schemaPath: string, tableReferences: TableReference[]): Promise<void> {
    const statResult = await safeExecuteAsync(
      async () => await fs.stat(schemaPath),
      'Failed to get directory stats'
    );

    if (statResult.isErr()) {
      return;
    }

    const stats = statResult.value;
    const cacheKey = `tableRefs:${schemaPath}`;

    this.cache.set(cacheKey, {
      data: tableReferences,
      mtime: stats.mtime,
      path: schemaPath,
    });
  }

  /**
   * Gets individual table from cache if valid, null if expired or missing
   */
  async getTable(tablePath: string): Promise<DatabaseTable | null> {
    const cacheKey = `table:${tablePath}`;
    const cached = this.cache.get(cacheKey) as CacheEntry<DatabaseTable> | undefined;

    if (!cached) {
      this.misses++;
      return null;
    }

    // Check if file modification time has changed
    const isValid = await this.isFileEntryValid(cached);
    if (!isValid) {
      this.cache.delete(cacheKey);
      this.misses++;
      return null;
    }

    this.hits++;
    return cached.data;
  }

  /**
   * Caches individual table with current file mtime
   */
  async setTable(tablePath: string, table: DatabaseTable): Promise<void> {
    const statResult = await safeExecuteAsync(
      async () => await fs.stat(tablePath),
      'Failed to get file stats'
    );

    if (statResult.isErr()) {
      return;
    }

    const stats = statResult.value;
    const cacheKey = `table:${tablePath}`;

    this.cache.set(cacheKey, {
      data: table,
      mtime: stats.mtime,
      path: tablePath,
    });
  }

  /**
   * Gets cache statistics
   */
  getStats(): CacheStats {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
      size: this.cache.size,
    };
  }

  /**
   * Invalidates a specific file from cache
   */
  invalidateFile(filePath: string): void {
    // Remove all cache entries for this file path
    const prefixes = ['file:', 'table:', 'schema:', 'tableRefs:'];

    for (const prefix of prefixes) {
      const cacheKey = `${prefix}${filePath}`;
      this.cache.delete(cacheKey);
    }
  }

  /**
   * Clears all cache entries and resets statistics
   */
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Checks if a file-based cache entry is still valid
   */
  private async isFileEntryValid(entry: CacheEntry<unknown>): Promise<boolean> {
    const statResult = await safeExecuteAsync(
      async () => await fs.stat(entry.path),
      'Failed to get file stats for validation'
    );

    if (statResult.isErr()) {
      return false;
    }

    const stats = statResult.value;

    // Entry is valid if it's a file and mtime hasn't changed
    return stats.isFile() && stats.mtime.getTime() === entry.mtime.getTime();
  }

  /**
   * Checks if a directory-based cache entry is still valid
   */
  private async isDirectoryEntryValid(entry: CacheEntry<unknown>): Promise<boolean> {
    const statResult = await safeExecuteAsync(
      async () => await fs.stat(entry.path),
      'Failed to get directory stats for validation'
    );

    if (statResult.isErr()) {
      return false;
    }

    const stats = statResult.value;

    // Entry is valid if it's a directory and mtime hasn't changed
    return stats.isDirectory() && stats.mtime.getTime() === entry.mtime.getTime();
  }
}