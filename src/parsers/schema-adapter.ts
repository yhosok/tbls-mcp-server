import { existsSync, statSync, promises as fs } from 'fs';
import path from 'path';
import { Result, ok } from 'neverthrow';
import {
  DatabaseSchema,
  SchemaMetadata,
  TableReference,
  validateSchemaData,
} from '../schemas/database';
import { createError, safeExecuteAsync } from '../utils/result';
import {
  parseJsonFile,
  parseJsonSchemaList,
  parseJsonSchemaByName,
} from './json-parser';
import { ResourceCache } from '../cache/resource-cache';

/**
 * Schema source resolution result
 */
export interface SchemaSourceResult {
  type: 'file' | 'directory';
  path: string;
  resolvedPath?: string; // For directories, the actual JSON file path used
}

/**
 * Schema parser interface for JSON schema parsing
 */
export interface SchemaParser {
  parseSchemaFile(filePath: string): Result<DatabaseSchema, Error>;
  parseSingleTableFile(
    filePath: string,
    tableName?: string
  ): Result<DatabaseSchema, Error>;
  parseSchemaOverview(filePath: string): Result<SchemaMetadata, Error>;
  parseTableReferences(filePath: string): Result<TableReference[], Error>;
  parseSchemaByName(
    filePath: string,
    schemaName: string
  ): Result<DatabaseSchema, Error>;
}

/**
 * JSON parser implementation of SchemaParser interface
 */
class JsonSchemaParser implements SchemaParser {
  parseSchemaFile(filePath: string): Result<DatabaseSchema, Error> {
    return parseJsonFile(filePath);
  }

  parseSingleTableFile(
    filePath: string,
    tableName?: string
  ): Result<DatabaseSchema, Error> {
    return parseJsonFile(filePath).andThen((schema) => {
      // If no tableName is provided, return the full schema (backward compatibility)
      if (!tableName) {
        return ok(schema);
      }

      // Extract the specific table from the schema
      const table = schema.tables.find((t) => t.name === tableName);
      if (!table) {
        return createError(`Table "${tableName}" not found in schema`);
      }

      // Return a new schema containing only the requested table
      return ok({
        ...schema,
        tables: [table],
      });
    });
  }

  parseSchemaOverview(filePath: string): Result<SchemaMetadata, Error> {
    try {
      const content = require('fs').readFileSync(filePath, 'utf-8');
      const metadataListResult = parseJsonSchemaList(content);

      if (metadataListResult.isOk()) {
        const metadataList = metadataListResult.value;
        if (metadataList.length > 0) {
          // Return the first schema's metadata for compatibility
          return ok(metadataList[0]);
        }
        return createError('No schemas found in file');
      }

      // Fallback to single schema parsing
      return parseJsonFile(filePath).andThen((schema) => ok(schema.metadata));
    } catch {
      // Fallback to single schema parsing
      return parseJsonFile(filePath).andThen((schema) => ok(schema.metadata));
    }
  }

  parseTableReferences(filePath: string): Result<TableReference[], Error> {
    return parseJsonFile(filePath).andThen((schema) =>
      ok(schema.tableReferences)
    );
  }

  parseSchemaByName(
    filePath: string,
    schemaName: string
  ): Result<DatabaseSchema, Error> {
    try {
      const content = require('fs').readFileSync(filePath, 'utf-8');
      return parseJsonSchemaByName(content, schemaName);
    } catch (error) {
      return createError(
        `Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}

/**
 * Creates a JSON schema parser for the given file path
 * @param filePath - Path to the schema file (must be .json)
 * @returns Result containing the JSON parser or error
 */
export const createSchemaParser = (
  filePath: string
): Result<SchemaParser, Error> => {
  if (!filePath || typeof filePath !== 'string') {
    return createError('File path must be a non-empty string');
  }

  const extension = path.extname(filePath).toLowerCase();

  if (extension === '.json') {
    return ok(new JsonSchemaParser());
  }

  if (extension === '.md') {
    return createError(
      'Markdown files are no longer supported. Please use JSON schema files (.json)'
    );
  }

  return createError(
    `Unsupported file extension: ${extension}. Only JSON files (.json) are supported`
  );
};

/**
 * Checks if a file exists and is readable
 * @param filePath - Path to check
 * @returns Result indicating if file exists and is accessible
 */
const checkFileExists = (filePath: string): Result<string, Error> => {
  try {
    if (!existsSync(filePath)) {
      return createError(`File does not exist: ${filePath}`);
    }

    const stats = statSync(filePath);
    if (!stats.isFile()) {
      return createError(`Path is not a file: ${filePath}`);
    }

    return ok(filePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return createError(`Error accessing file ${filePath}: ${message}`);
  }
};

/**
 * Reads file content with optional caching
 * @param filePath - Path to the file to read
 * @param cache - Optional cache instance
 * @returns Result containing file content or error
 */
const readFileWithCache = async (
  filePath: string,
  cache?: ResourceCache
): Promise<Result<string, Error>> => {
  // Try to get cached content first
  if (cache) {
    const cachedContent = await cache.getFileContent(filePath);
    if (cachedContent !== null) {
      return ok(cachedContent);
    }
  }

  // Read file content
  const contentResult = await safeExecuteAsync(
    async () => await fs.readFile(filePath, 'utf-8'),
    'Failed to read file'
  );

  if (contentResult.isErr()) {
    return contentResult;
  }

  const content = contentResult.value;

  // Cache the content if cache is available
  if (cache) {
    await cache.setFileContent(filePath, content);
  }

  return ok(content);
};

// Function is available for future caching enhancements
export { readFileWithCache };

/**
 * Detects and resolves JSON schema file path with fallback logic
 * @param basePath - Base path or directory to search in
 * @param cache - Optional cache instance for file resolution caching
 * @returns Result containing resolved file path or error
 */
const resolveSchemaFile = (
  basePath: string,
  _cache?: ResourceCache
): Result<string, Error> => {
  // If basePath already has an extension, use it directly
  const extension = path.extname(basePath).toLowerCase();
  if (extension === '.json') {
    return checkFileExists(basePath);
  }

  if (extension === '.md') {
    return createError(
      'Markdown files are no longer supported. Please use JSON schema files (.json)'
    );
  }

  // Try different JSON file patterns
  const candidates = [
    path.join(basePath, 'schema.json'),
    path.join(basePath, 'database.json'),
    basePath + '.json',
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      const checkResult = checkFileExists(candidate);
      if (checkResult.isOk()) {
        return checkResult;
      }
    }
  }

  return createError(
    `No JSON schema file found. Tried: ${candidates.join(', ')}. ` +
      'Please ensure a schema file exists with .json extension.'
  );
};

/**
 * Unified function to parse JSON schema file with automatic file detection
 * @param filePath - Path to JSON schema file or directory
 * @param cache - Optional cache instance for performance optimization
 * @returns Result containing parsed database schema or error
 */
export const parseSchemaFile = (
  filePath: string,
  cache?: ResourceCache
): Result<DatabaseSchema, Error> => {
  return resolveSchemaFile(filePath, cache).andThen((resolvedPath) =>
    createSchemaParser(resolvedPath).andThen((parser) =>
      parser.parseSchemaFile(resolvedPath)
    )
  );
};

/**
 * Unified function to parse single table from JSON schema file
 * @param filePath - Path to JSON table file or directory
 * @param cacheOrTableName - Either a cache instance or the table name to extract
 * @param cache - Optional cache instance for performance optimization (when second param is tableName)
 * @returns Result containing parsed database schema with single table or error
 */
export const parseSingleTableFile = (
  filePath: string,
  cacheOrTableName?: ResourceCache | string,
  cache?: ResourceCache
): Result<DatabaseSchema, Error> => {
  // Handle overloaded parameters
  let tableName: string | undefined;
  let cacheInstance: ResourceCache | undefined;

  if (typeof cacheOrTableName === 'string') {
    tableName = cacheOrTableName;
    cacheInstance = cache;
  } else {
    cacheInstance = cacheOrTableName;
  }

  return resolveSchemaFile(filePath, cacheInstance).andThen((resolvedPath) =>
    createSchemaParser(resolvedPath).andThen((parser) =>
      parser.parseSingleTableFile(resolvedPath, tableName)
    )
  );
};

/**
 * Unified function to parse schema overview from JSON schema file
 * @param filePath - Path to JSON schema file or directory
 * @param cache - Optional cache instance for performance optimization
 * @returns Result containing schema metadata or error
 */
export const parseSchemaOverview = (
  filePath: string,
  cache?: ResourceCache
): Result<SchemaMetadata, Error> => {
  return resolveSchemaFile(filePath, cache).andThen((resolvedPath) =>
    createSchemaParser(resolvedPath).andThen((parser) =>
      parser.parseSchemaOverview(resolvedPath)
    )
  );
};

/**
 * Unified function to parse table references from JSON schema file
 * @param filePath - Path to JSON schema file or directory
 * @param cache - Optional cache instance for performance optimization
 * @returns Result containing table references or error
 */
export const parseTableReferences = (
  filePath: string,
  cache?: ResourceCache
): Result<TableReference[], Error> => {
  return resolveSchemaFile(filePath, cache).andThen((resolvedPath) =>
    createSchemaParser(resolvedPath).andThen((parser) =>
      parser.parseTableReferences(resolvedPath)
    )
  );
};

/**
 * Factory function that returns a configured JSON parser instance
 * @param filePath - Path to JSON schema file
 * @param cache - Optional cache instance for performance optimization
 * @returns Result containing JSON parser instance or error
 */
export const getSchemaParser = (
  filePath: string,
  cache?: ResourceCache
): Result<SchemaParser, Error> => {
  return resolveSchemaFile(filePath, cache).andThen((resolvedPath) =>
    createSchemaParser(resolvedPath)
  );
};

/**
 * Utility function to validate a parsed JSON schema
 * @param schema - Schema object to validate
 * @returns Result containing validated schema or error
 */
export const validateParsedSchema = (
  schema: unknown
): Result<DatabaseSchema, Error> => {
  const validationResult = validateSchemaData(schema);
  return validationResult.mapErr(
    (error) => new Error(`Schema validation failed: ${error}`)
  );
};

/**
 * Resolves schema source path to determine type and actual file to use
 * @param schemaSource - Schema source path (file or directory)
 * @returns Result containing schema source resolution information
 */
export const resolveSchemaSource = (
  schemaSource: string
): Result<SchemaSourceResult, Error> => {
  if (!schemaSource || typeof schemaSource !== 'string') {
    return createError('Schema source must be a non-empty string');
  }

  if (schemaSource.trim() === '') {
    return createError('Schema source cannot be empty');
  }

  try {
    if (!existsSync(schemaSource)) {
      return createError(`Schema source does not exist: ${schemaSource}`);
    }

    const stats = statSync(schemaSource);

    if (stats.isFile()) {
      // Direct file path
      const extension = path.extname(schemaSource).toLowerCase();
      if (extension === '.md') {
        return createError(
          'Markdown files are no longer supported. Please use JSON schema files (.json)'
        );
      }
      if (extension !== '.json') {
        return createError(
          `Schema file must have .json extension, got: ${extension}`
        );
      }

      return ok({
        type: 'file',
        path: schemaSource,
      });
    } else if (stats.isDirectory()) {
      // Directory - return directory type without resolving to specific file
      // This allows the caller to determine the appropriate schema file
      return ok({
        type: 'directory',
        path: schemaSource,
      });
    } else {
      return createError(
        `Schema source is neither a file nor directory: ${schemaSource}`
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return createError(
      `Error accessing schema source ${schemaSource}: ${message}`
    );
  }
};

/**
 * Resolves schema name with backward compatibility support
 * Maps "default" requests to appropriate schema paths while preserving schema name expectations
 * @param schemaSource - Path to schema file or directory
 * @param requestedSchemaName - Schema name requested by client (might be "default")
 * @param cache - Optional cache instance for performance optimization
 * @returns Result containing resolved schema name and path information
 */
export const resolveSchemaName = (
  schemaSource: string,
  requestedSchemaName: string,
  cache?: ResourceCache
): Result<
  {
    resolvedSchemaName: string;
    schemaPath: string;
    sourceType: 'file' | 'directory';
  },
  Error
> => {
  // First resolve the schema source
  const resolveResult = resolveSchemaSource(schemaSource);
  if (resolveResult.isErr()) {
    return createError(
      `Failed to resolve schema source: ${resolveResult.error.message}`
    );
  }

  const { type: sourceType, path: sourcePath } = resolveResult.value;

  if (sourceType === 'file') {
    // Single file setup - check if it's multi-schema or single schema
    try {
      const content = require('fs').readFileSync(sourcePath, 'utf-8');
      const metadataListResult = parseJsonSchemaList(content);

      if (metadataListResult.isOk()) {
        const metadataList = metadataListResult.value;

        // Multi-schema file
        if (metadataList.length > 1) {
          // Check if the requested schema exists
          const schemaExists = metadataList.some(
            (metadata) => metadata.name === requestedSchemaName
          );

          if (schemaExists) {
            return ok({
              resolvedSchemaName: requestedSchemaName,
              schemaPath: sourcePath,
              sourceType: 'file',
            });
          }

          // Handle "default" for multi-schema - should fail unless there's actually a schema named "default"
          if (requestedSchemaName === 'default') {
            const schemaNames = metadataList.map((m) => m.name).join(', ');
            return createError(
              `Schema 'default' not found in multi-schema file. Available schemas: ${schemaNames}`
            );
          }

          const schemaNames = metadataList.map((m) => m.name).join(', ');
          return createError(
            `Schema '${requestedSchemaName}' not found. Available schemas: ${schemaNames}`
          );
        }

        // Single schema in schemas array - handle backward compatibility
        const singleSchema = metadataList[0];
        if (requestedSchemaName === 'default') {
          return ok({
            resolvedSchemaName: 'default',
            schemaPath: sourcePath,
            sourceType: 'file',
          });
        }

        if (singleSchema.name === requestedSchemaName) {
          return ok({
            resolvedSchemaName: requestedSchemaName,
            schemaPath: sourcePath,
            sourceType: 'file',
          });
        }

        return createError(
          `Schema name mismatch: requested '${requestedSchemaName}' but schema file contains '${singleSchema.name}'. Use '${singleSchema.name}' or 'default' instead.`
        );
      }
    } catch {
      // Fall back to old logic for single-schema format
    }

    // Legacy single schema format
    if (requestedSchemaName === 'default') {
      return ok({
        resolvedSchemaName: 'default',
        schemaPath: sourcePath,
        sourceType: 'file',
      });
    }

    // For named schema requests on single file, verify the name matches
    const metadataResult = parseSchemaOverview(sourcePath, cache);
    if (metadataResult.isOk() && metadataResult.value.name) {
      const actualName = metadataResult.value.name;
      if (actualName !== requestedSchemaName) {
        return createError(
          `Schema name mismatch: requested '${requestedSchemaName}' but schema file contains '${actualName}'. Use '${actualName}' or 'default' instead.`
        );
      }
    }
    return ok({
      resolvedSchemaName: requestedSchemaName,
      schemaPath: sourcePath,
      sourceType: 'file',
    });
  }

  // Directory setup - handle multi-schema case
  if (requestedSchemaName === 'default') {
    // Check if there's a root schema.json file (single schema setup in directory)
    const rootSchemaPath = path.join(sourcePath, 'schema.json');
    if (existsSync(rootSchemaPath)) {
      // For backward compatibility, return "default" for single-schema directory setups
      return ok({
        resolvedSchemaName: 'default',
        schemaPath: rootSchemaPath,
        sourceType: 'directory',
      });
    }
    // No root schema.json, use "default" as-is (multi-schema setup with default schema)
    return ok({
      resolvedSchemaName: 'default',
      schemaPath: path.join(sourcePath, 'default'),
      sourceType: 'directory',
    });
  }

  // Named schema in directory - use as-is
  const namedSchemaPath = path.join(
    sourcePath,
    requestedSchemaName,
    'schema.json'
  );
  return ok({
    resolvedSchemaName: requestedSchemaName,
    schemaPath: namedSchemaPath,
    sourceType: 'directory',
  });
};

/**
 * Advanced function that tries multiple JSON file patterns
 * @param basePath - Base directory or file path to search
 * @param cache - Optional cache instance for performance optimization
 * @returns Result containing parsed schema or error with details of what was tried
 */
export const parseSchemaWithFallback = (
  basePath: string,
  _cache?: ResourceCache
): Result<DatabaseSchema, Error> => {
  const candidates = [
    path.join(basePath, 'schema.json'),
    path.join(basePath, 'database.json'),
    basePath + '.json',
  ];

  const attempts: string[] = [];
  let lastError: Error | null = null;

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      const parseResult = createSchemaParser(candidate).andThen((parser) =>
        parser.parseSchemaFile(candidate)
      );

      if (parseResult.isOk()) {
        return parseResult;
      }

      attempts.push(`${candidate}: ${parseResult.error.message}`);
      lastError = parseResult.error;
    } else {
      attempts.push(`${candidate}: file not found`);
    }
  }

  const errorMessage =
    attempts.length > 0
      ? `Failed to parse JSON schema from any candidate file:\n${attempts.join('\n')}`
      : `No JSON schema files found in ${basePath}. Expected files: ${candidates.join(', ')}`;

  return createError(
    lastError
      ? `${errorMessage}\n\nLast error: ${lastError.message}`
      : errorMessage
  );
};
