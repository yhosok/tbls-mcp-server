import { Result, ok, err } from 'neverthrow';
import { join } from 'path';
import * as path from 'path';
import { existsSync } from 'fs';
import { DatabaseTable } from '../schemas/database';
import {
  parseSingleTableFile,
  resolveSchemaSource,
  resolveSchemaName,
} from '../parsers/schema-adapter';
import { ResourceCache } from '../cache/resource-cache';

/**
 * Configuration for resource resolution strategies
 */
export interface ResourceResolutionConfig {
  /** Whether to use schema name resolution (true) or basic schema source resolution (false) */
  useSchemaNameResolution: boolean;
  /** Cache method strategy for getting tables */
  cacheStrategy: 'legacy' | 'byName';
}

/**
 * Result of schema resolution process
 */
export interface SchemaResolutionResult {
  /** Resolved schema name (may differ from requested name for backward compatibility) */
  schemaName: string;
  /** Path to the schema file or directory */
  schemaPath: string;
  /** Type of schema source (file or directory) */
  sourceType: 'file' | 'directory';
  /** Path to table file for parsing (computed based on source type and schema structure) */
  tableFilePath: string;
}

/**
 * Generic cache operations interface for different caching strategies
 */
export interface CacheOperations<T> {
  get: (key: string, ...args: string[]) => Promise<T | null>;
  set: (key: string, data: T, ...args: string[]) => Promise<void>;
}

/**
 * Creates cache operations for legacy table caching (getTable/setTable)
 */
export const createLegacyCacheOperations = (
  cache?: ResourceCache
): CacheOperations<DatabaseTable> => ({
  get: async (tablePath: string): Promise<DatabaseTable | null> => {
    if (!cache) return null;
    return await cache.getTable(tablePath);
  },
  set: async (tablePath: string, table: DatabaseTable): Promise<void> => {
    if (!cache) return;
    await cache.setTable(tablePath, table);
  },
});

/**
 * Creates cache operations for table-by-name caching (getTableByName/setTableByName)
 */
export const createTableByNameCacheOperations = (
  cache?: ResourceCache
): CacheOperations<DatabaseTable> => ({
  get: async (schemaPath: string, tableName: string): Promise<DatabaseTable | null> => {
    if (!cache) return null;
    return await cache.getTableByName(schemaPath, tableName);
  },
  set: async (schemaPath: string, table: DatabaseTable, tableName: string): Promise<void> => {
    if (!cache) return;
    await cache.setTableByName(schemaPath, tableName, table);
  },
});

/**
 * Resolves schema source and computes table file path based on resolution strategy
 *
 * @param schemaSource - Path to schema file or directory containing tbls schema files
 * @param schemaName - Name of the schema containing the table
 * @param tableName - Name of the table to resolve
 * @param config - Configuration for resolution strategy
 * @param cache - Optional cache instance for schema name resolution
 * @returns Result containing schema resolution information
 */
export const resolveSchemaAndTablePath = async (
  schemaSource: string,
  schemaName: string,
  tableName: string,
  config: ResourceResolutionConfig,
  cache?: ResourceCache
): Promise<Result<SchemaResolutionResult, Error>> => {
  if (config.useSchemaNameResolution) {
    // Use advanced schema name resolution (for handleTableInfoResource)
    const schemaResolveResult = resolveSchemaName(
      schemaSource,
      schemaName,
      cache
    );
    if (schemaResolveResult.isErr()) {
      return err(schemaResolveResult.error);
    }

    const { resolvedSchemaName, schemaPath, sourceType } = schemaResolveResult.value;

    // Additional validation for directory-based schemas to preserve original error behavior
    if (sourceType === 'directory') {
      // Verify schema.json exists in directory to match original handleTableInfoResource behavior
      if (!existsSync(schemaPath)) {
        return err(
          new Error(
            `Schema file not found: ${schemaPath}. Only JSON schema files are supported.`
          )
        );
      }
    }

    return ok({
      schemaName: resolvedSchemaName,
      schemaPath,
      sourceType,
      tableFilePath: schemaPath, // For named resolution, we parse from the resolved schema path
    });
  } else {
    // Use basic schema source resolution (for handleTableIndexesResource)
    const resolveResult = resolveSchemaSource(schemaSource);
    if (resolveResult.isErr()) {
      return err(resolveResult.error);
    }

    const { type: sourceType, path: schemaPath } = resolveResult.value;

    // Determine the path to the table file (JSON format)
    let tableFilePath: string;
    if (sourceType === 'file') {
      // Single file - use the directory containing the file
      const schemaDir = path.dirname(schemaPath);
      tableFilePath = join(schemaDir, tableName);
    } else {
      // Directory - determine subdirectory for multi-schema setup
      if (schemaName === 'default') {
        tableFilePath = join(schemaPath, tableName);
      } else {
        tableFilePath = join(schemaPath, schemaName, tableName);
      }
    }

    return ok({
      schemaName,
      schemaPath,
      sourceType,
      tableFilePath,
    });
  }
};

/**
 * Generic cache retrieval with different strategies
 *
 * @param cacheOps - Cache operations interface
 * @param resolution - Schema resolution result
 * @param tableName - Name of the table to get from cache
 * @param config - Configuration for cache strategy
 * @returns Cached table data or null if cache miss
 */
export const getCachedTable = async (
  cacheOps: CacheOperations<DatabaseTable>,
  resolution: SchemaResolutionResult,
  tableName: string,
  config: ResourceResolutionConfig
): Promise<DatabaseTable | null> => {
  if (config.cacheStrategy === 'byName') {
    // Use schema path and table name for cache key
    return await cacheOps.get(resolution.schemaPath, tableName);
  } else {
    // Use table file path for cache key (legacy)
    return await cacheOps.get(resolution.tableFilePath);
  }
};

/**
 * Generic cache storage with different strategies
 *
 * @param cacheOps - Cache operations interface
 * @param resolution - Schema resolution result
 * @param table - Table data to cache
 * @param tableName - Name of the table to cache
 * @param config - Configuration for cache strategy
 */
export const setCachedTable = async (
  cacheOps: CacheOperations<DatabaseTable>,
  resolution: SchemaResolutionResult,
  table: DatabaseTable,
  tableName: string,
  config: ResourceResolutionConfig
): Promise<void> => {
  if (config.cacheStrategy === 'byName') {
    // Use schema path and table name for cache key
    await cacheOps.set(resolution.schemaPath, table, tableName);
  } else {
    // Use table file path for cache key (legacy)
    await cacheOps.set(resolution.tableFilePath, table);
  }
};

/**
 * Parse table from schema file with appropriate strategy
 *
 * @param resolution - Schema resolution result
 * @param tableName - Name of the table to parse
 * @param config - Configuration for parsing strategy
 * @param cache - Optional cache instance
 * @returns Result containing parsed database schema with table
 */
export const parseTableFromSchema = (
  resolution: SchemaResolutionResult,
  tableName: string,
  config: ResourceResolutionConfig,
  cache?: ResourceCache
): Result<{ table: DatabaseTable }, Error> => {
  let parseResult: Result<{ tables: DatabaseTable[] }, Error>;

  if (config.useSchemaNameResolution) {
    // For schema name resolution, parse with table name from schema path
    parseResult = parseSingleTableFile(resolution.schemaPath, tableName, cache);
  } else {
    // For basic resolution, parse from computed table file path
    parseResult = parseSingleTableFile(resolution.tableFilePath);
  }

  if (parseResult.isErr()) {
    return err(
      new Error(`Failed to parse table: ${parseResult.error.message}`)
    );
  }

  const schema = parseResult.value;
  if (schema.tables.length === 0) {
    return err(new Error('No table found in schema file'));
  }

  const table = schema.tables[0];
  return ok({ table });
};

/**
 * Generic resource handler that encapsulates common patterns
 *
 * @param schemaSource - Path to schema file or directory containing tbls schema files
 * @param schemaName - Name of the schema containing the table
 * @param tableName - Name of the table to process
 * @param config - Configuration for resolution and caching strategy
 * @param cache - Optional cache instance for performance optimization
 * @param extractData - Function to extract specific data from table (e.g., indexes, full table)
 * @returns Result containing processed resource data
 */
export const handleTableResource = async <T>(
  schemaSource: string,
  schemaName: string,
  tableName: string,
  config: ResourceResolutionConfig,
  cache: ResourceCache | undefined,
  extractData: (table: DatabaseTable, resolvedSchemaName: string) => T
): Promise<Result<T, Error>> => {
  // 1. Resolve schema source and compute table file path
  const resolutionResult = await resolveSchemaAndTablePath(
    schemaSource,
    schemaName,
    tableName,
    config,
    cache
  );
  if (resolutionResult.isErr()) {
    return err(resolutionResult.error);
  }

  const resolution = resolutionResult.value;

  // 2. Set up cache operations based on strategy
  const cacheOps = config.cacheStrategy === 'byName'
    ? createTableByNameCacheOperations(cache)
    : createLegacyCacheOperations(cache);

  // 3. Try to get cached table first
  const cachedTable = await getCachedTable(cacheOps, resolution, tableName, config);
  if (cachedTable) {
    return ok(extractData(cachedTable, resolution.schemaName));
  }

  // 4. Parse the table file using schema adapter
  const parseResult = parseTableFromSchema(resolution, tableName, config, cache);
  if (parseResult.isErr()) {
    return err(parseResult.error);
  }

  const { table } = parseResult.value;

  // 5. Cache the table if cache is available
  await setCachedTable(cacheOps, resolution, table, tableName, config);

  // 6. Extract and return the requested data
  return ok(extractData(table, resolution.schemaName));
};