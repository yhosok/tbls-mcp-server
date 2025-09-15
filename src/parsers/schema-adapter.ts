import { existsSync, statSync, promises as fs } from 'fs';
import path from 'path';
import { Result, ok } from 'neverthrow';
import {
  DatabaseSchema,
  SchemaMetadata,
  TableReference,
  validateSchemaData,
} from '../schemas/database';
import { createError, safeExecute, safeExecuteAsync } from '../utils/result';
import { parseJsonFile } from './json-parser';
import {
  parseMarkdownFile,
  parseSingleTableMarkdown,
  parseSchemaOverview as parseMarkdownSchemaOverview,
  parseTableReferences as parseMarkdownTableReferences,
} from './markdown-parser';
import { ResourceCache } from '../cache/resource-cache';

/**
 * Schema parser interface that abstracts JSON and Markdown parsers
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
 * Markdown parser implementation of SchemaParser interface
 */
class MarkdownSchemaParser implements SchemaParser {
  parseSchemaFile(filePath: string): Result<DatabaseSchema, Error> {
    return parseMarkdownFile(filePath);
  }

  parseSingleTableFile(filePath: string, cache?: ResourceCache): Result<DatabaseSchema, Error> {
    if (cache) {
      // Use async cached reading - we need to make this async or wrap it
      return createError('Async cache not supported in sync method - use async parsing functions');
    }
    return safeExecute(
      () => require('fs').readFileSync(filePath, 'utf-8'),
      'Failed to read markdown file'
    ).andThen(content => parseSingleTableMarkdown(content));
  }

  parseSchemaOverview(filePath: string, cache?: ResourceCache): Result<SchemaMetadata, Error> {
    if (cache) {
      // Use async cached reading - we need to make this async or wrap it
      return createError('Async cache not supported in sync method - use async parsing functions');
    }
    return safeExecute(
      () => require('fs').readFileSync(filePath, 'utf-8'),
      'Failed to read markdown file'
    ).andThen(content => parseMarkdownSchemaOverview(content));
  }

  parseTableReferences(filePath: string, cache?: ResourceCache): Result<TableReference[], Error> {
    if (cache) {
      // Use async cached reading - we need to make this async or wrap it
      return createError('Async cache not supported in sync method - use async parsing functions');
    }
    return safeExecute(
      () => require('fs').readFileSync(filePath, 'utf-8'),
      'Failed to read markdown file'
    ).andThen(content => parseMarkdownTableReferences(content));
  }
}

/**
 * Detects file type based on extension and returns appropriate parser
 * @param filePath - Path to the schema file
 * @returns Result containing the appropriate parser or error
 */
export const createSchemaParser = (filePath: string): Result<SchemaParser, Error> => {
  if (!filePath || typeof filePath !== 'string') {
    return createError('File path must be a non-empty string');
  }

  const extension = path.extname(filePath).toLowerCase();

  switch (extension) {
    case '.json':
      return ok(new JsonSchemaParser());
    case '.md':
      return ok(new MarkdownSchemaParser());
    default:
      return createError(`Unsupported file extension: ${extension}. Supported extensions are .json and .md`);
  }
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
 * Detects and resolves schema file path with fallback logic
 * @param basePath - Base path or directory to search in
 * @param cache - Optional cache instance for file resolution caching
 * @returns Result containing resolved file path or error
 */
const resolveSchemaFile = (basePath: string, _cache?: ResourceCache): Result<string, Error> => {
  // If basePath already has an extension, use it directly
  const extension = path.extname(basePath).toLowerCase();
  if (extension === '.json' || extension === '.md') {
    return checkFileExists(basePath);
  }

  // Try different file patterns based on configuration preference
  const candidates = [
    path.join(basePath, 'schema.json'),
    path.join(basePath, 'README.md'),
    path.join(basePath, 'database.json'),
    path.join(basePath, 'database.md'),
    basePath + '.json',
    basePath + '.md',
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
    `No schema file found. Tried: ${candidates.join(', ')}. ` +
    'Please ensure a schema file exists with .json or .md extension.'
  );
};

/**
 * Unified function to parse schema file with automatic format detection
 * @param filePath - Path to schema file or directory
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
 * Unified function to parse single table file with automatic format detection
 * @param filePath - Path to table file or directory
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
 * Unified function to parse schema overview with automatic format detection
 * @param filePath - Path to schema file or directory
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
 * Unified function to parse table references with automatic format detection
 * @param filePath - Path to schema file or directory
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
 * Factory function that returns a configured parser instance
 * @param filePath - Path to determine parser type
 * @param cache - Optional cache instance for performance optimization
 * @returns Result containing parser instance or error
 */
export const getSchemaParser = (filePath: string, cache?: ResourceCache): Result<SchemaParser, Error> => {
  return resolveSchemaFile(filePath, cache)
    .andThen(resolvedPath => createSchemaParser(resolvedPath));
};

/**
 * Utility function to validate a parsed schema regardless of source format
 * @param schema - Schema object to validate
 * @returns Result containing validated schema or error
 */
export const validateParsedSchema = (schema: unknown): Result<DatabaseSchema, Error> => {
  const validationResult = validateSchemaData(schema);
  return validationResult.mapErr(error => new Error(`Schema validation failed: ${error}`));
};

/**
 * Advanced function that tries multiple file patterns and formats
 * @param basePath - Base directory or file path to search
 * @param preferJson - Whether to prefer JSON format over Markdown
 * @param cache - Optional cache instance for performance optimization
 * @returns Result containing parsed schema or error with details of what was tried
 */
export const parseSchemaWithFallback = (
  basePath: string,
  preferJson = true,
  _cache?: ResourceCache
): Result<DatabaseSchema, Error> => {
  const jsonCandidates = [
    path.join(basePath, 'schema.json'),
    path.join(basePath, 'database.json'),
    basePath + '.json',
  ];

  const markdownCandidates = [
    path.join(basePath, 'README.md'),
    path.join(basePath, 'database.md'),
    path.join(basePath, 'schema.md'),
    basePath + '.md',
  ];

  const candidates = preferJson
    ? [...jsonCandidates, ...markdownCandidates]
    : [...markdownCandidates, ...jsonCandidates];

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
    ? `Failed to parse schema from any candidate file:\n${attempts.join('\n')}`
    : `No schema files found in ${basePath}. Expected files: ${candidates.join(', ')}`;

  return createError(lastError ? `${errorMessage}\n\nLast error: ${lastError.message}` : errorMessage);
};