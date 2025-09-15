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
import { parseJsonFile } from './json-parser';
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
  parseSingleTableFile(filePath: string): Result<DatabaseSchema, Error>;
  parseSchemaOverview(filePath: string): Result<SchemaMetadata, Error>;
  parseTableReferences(filePath: string): Result<TableReference[], Error>;
}

/**
 * JSON parser implementation of SchemaParser interface
 */
class JsonSchemaParser implements SchemaParser {
  parseSchemaFile(filePath: string): Result<DatabaseSchema, Error> {
    return parseJsonFile(filePath);
  }

  parseSingleTableFile(filePath: string): Result<DatabaseSchema, Error> {
    // JSON files contain complete schema information, so single table is not different
    return parseJsonFile(filePath);
  }

  parseSchemaOverview(filePath: string): Result<SchemaMetadata, Error> {
    return parseJsonFile(filePath).andThen(schema => ok(schema.metadata));
  }

  parseTableReferences(filePath: string): Result<TableReference[], Error> {
    return parseJsonFile(filePath).andThen(schema => ok(schema.tableReferences));
  }
}



/**
 * Creates a JSON schema parser for the given file path
 * @param filePath - Path to the schema file (must be .json)
 * @returns Result containing the JSON parser or error
 */
export const createSchemaParser = (filePath: string): Result<SchemaParser, Error> => {
  if (!filePath || typeof filePath !== 'string') {
    return createError('File path must be a non-empty string');
  }

  const extension = path.extname(filePath).toLowerCase();

  if (extension === '.json') {
    return ok(new JsonSchemaParser());
  }

  if (extension === '.md') {
    return createError('Markdown files are no longer supported. Please use JSON schema files (.json)');
  }

  return createError(`Unsupported file extension: ${extension}. Only JSON files (.json) are supported`);
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
const readFileWithCache = async (filePath: string, cache?: ResourceCache): Promise<Result<string, Error>> => {
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

// Mark as used to avoid TS warning for now
readFileWithCache;

/**
 * Detects and resolves JSON schema file path with fallback logic
 * @param basePath - Base path or directory to search in
 * @param cache - Optional cache instance for file resolution caching
 * @returns Result containing resolved file path or error
 */
const resolveSchemaFile = (basePath: string, _cache?: ResourceCache): Result<string, Error> => {
  // If basePath already has an extension, use it directly
  const extension = path.extname(basePath).toLowerCase();
  if (extension === '.json') {
    return checkFileExists(basePath);
  }

  if (extension === '.md') {
    return createError('Markdown files are no longer supported. Please use JSON schema files (.json)');
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
export const parseSchemaFile = (filePath: string, cache?: ResourceCache): Result<DatabaseSchema, Error> => {
  return resolveSchemaFile(filePath, cache)
    .andThen(resolvedPath => createSchemaParser(resolvedPath)
      .andThen(parser => parser.parseSchemaFile(resolvedPath))
    );
};

/**
 * Unified function to parse single table from JSON schema file
 * @param filePath - Path to JSON table file or directory
 * @param cache - Optional cache instance for performance optimization
 * @returns Result containing parsed database schema with single table or error
 */
export const parseSingleTableFile = (filePath: string, cache?: ResourceCache): Result<DatabaseSchema, Error> => {
  return resolveSchemaFile(filePath, cache)
    .andThen(resolvedPath => createSchemaParser(resolvedPath)
      .andThen(parser => parser.parseSingleTableFile(resolvedPath))
    );
};

/**
 * Unified function to parse schema overview from JSON schema file
 * @param filePath - Path to JSON schema file or directory
 * @param cache - Optional cache instance for performance optimization
 * @returns Result containing schema metadata or error
 */
export const parseSchemaOverview = (filePath: string, cache?: ResourceCache): Result<SchemaMetadata, Error> => {
  return resolveSchemaFile(filePath, cache)
    .andThen(resolvedPath => createSchemaParser(resolvedPath)
      .andThen(parser => parser.parseSchemaOverview(resolvedPath))
    );
};

/**
 * Unified function to parse table references from JSON schema file
 * @param filePath - Path to JSON schema file or directory
 * @param cache - Optional cache instance for performance optimization
 * @returns Result containing table references or error
 */
export const parseTableReferences = (filePath: string, cache?: ResourceCache): Result<TableReference[], Error> => {
  return resolveSchemaFile(filePath, cache)
    .andThen(resolvedPath => createSchemaParser(resolvedPath)
      .andThen(parser => parser.parseTableReferences(resolvedPath))
    );
};

/**
 * Factory function that returns a configured JSON parser instance
 * @param filePath - Path to JSON schema file
 * @param cache - Optional cache instance for performance optimization
 * @returns Result containing JSON parser instance or error
 */
export const getSchemaParser = (filePath: string, cache?: ResourceCache): Result<SchemaParser, Error> => {
  return resolveSchemaFile(filePath, cache)
    .andThen(resolvedPath => createSchemaParser(resolvedPath));
};

/**
 * Utility function to validate a parsed JSON schema
 * @param schema - Schema object to validate
 * @returns Result containing validated schema or error
 */
export const validateParsedSchema = (schema: unknown): Result<DatabaseSchema, Error> => {
  const validationResult = validateSchemaData(schema);
  return validationResult.mapErr(error => new Error(`Schema validation failed: ${error}`));
};

/**
 * Resolves schema source path to determine type and actual file to use
 * @param schemaSource - Schema source path (file or directory)
 * @returns Result containing schema source resolution information
 */
export const resolveSchemaSource = (schemaSource: string): Result<SchemaSourceResult, Error> => {
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
        return createError('Markdown files are no longer supported. Please use JSON schema files (.json)');
      }
      if (extension !== '.json') {
        return createError(`Schema file must have .json extension, got: ${extension}`);
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
      return createError(`Schema source is neither a file nor directory: ${schemaSource}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return createError(`Error accessing schema source ${schemaSource}: ${message}`);
  }
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
      const parseResult = createSchemaParser(candidate)
        .andThen(parser => parser.parseSchemaFile(candidate));

      if (parseResult.isOk()) {
        return parseResult;
      }

      attempts.push(`${candidate}: ${parseResult.error.message}`);
      lastError = parseResult.error;
    } else {
      attempts.push(`${candidate}: file not found`);
    }
  }

  const errorMessage = attempts.length > 0
    ? `Failed to parse JSON schema from any candidate file:\n${attempts.join('\n')}`
    : `No JSON schema files found in ${basePath}. Expected files: ${candidates.join(', ')}`;

  return createError(lastError ? `${errorMessage}\n\nLast error: ${lastError.message}` : errorMessage);
};