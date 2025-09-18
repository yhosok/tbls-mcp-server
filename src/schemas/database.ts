import { z } from 'zod';
import { Result, ok, err } from 'neverthrow';
import { URI_PATTERNS } from '../constants/uri-patterns';

/**
 * Database column schema representing column information from tbls markdown
 */
export const DatabaseColumnSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  nullable: z.boolean().default(true),
  defaultValue: z.string().nullable().default(null),
  comment: z.string().nullable().default(null),
  isPrimaryKey: z.boolean().default(false),
  isAutoIncrement: z.boolean().default(false),
  maxLength: z.number().int().positive().nullable().default(null),
  precision: z.number().int().positive().nullable().default(null),
  scale: z.number().int().min(0).nullable().default(null),
});
export type DatabaseColumn = z.infer<typeof DatabaseColumnSchema>;

/**
 * Database index schema representing index information from tbls markdown
 */
export const DatabaseIndexSchema = z.object({
  name: z.string().min(1),
  columns: z
    .array(z.string().min(1))
    .min(1, 'Index must have at least one column'),
  isUnique: z.boolean().default(false),
  isPrimary: z.boolean().default(false),
  type: z.string().optional(),
  comment: z.string().nullable().optional(),
});
export type DatabaseIndex = z.infer<typeof DatabaseIndexSchema>;

/**
 * Database relation schema representing foreign key relationships
 */
export const DatabaseRelationSchema = z.object({
  type: z.enum(['belongsTo', 'hasMany', 'hasOne']),
  table: z.string().min(1),
  columns: z.array(z.string().min(1)).min(1),
  referencedTable: z.string().min(1),
  referencedColumns: z.array(z.string().min(1)).min(1),
  constraintName: z.string().optional(),
});
export type DatabaseRelation = z.infer<typeof DatabaseRelationSchema>;

/**
 * Database table schema representing complete table information from tbls markdown
 */
export const DatabaseTableSchema = z.object({
  name: z.string().min(1),
  comment: z.string().nullable().optional(),
  columns: z
    .array(DatabaseColumnSchema)
    .min(1, 'Table must have at least one column'),
  indexes: z.array(DatabaseIndexSchema).default([]),
  relations: z.array(DatabaseRelationSchema).default([]),
});
export type DatabaseTable = z.infer<typeof DatabaseTableSchema>;

/**
 * Table reference schema for schema overview
 */
export const TableReferenceSchema = z.object({
  name: z.string().min(1),
  comment: z.string().nullable().default(null),
  columnCount: z.number().int().min(0).nullable().default(null),
});
export type TableReference = z.infer<typeof TableReferenceSchema>;

/**
 * Schema metadata schema
 */
export const SchemaMetadataSchema = z.object({
  name: z.string().min(1),
  tableCount: z.number().int().min(0).nullable().default(null),
  generated: z.string().datetime().nullable().default(null),
  version: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
});
export type SchemaMetadata = z.infer<typeof SchemaMetadataSchema>;

/**
 * Complete database schema representing the structure parsed from tbls markdown
 */
export const DatabaseSchemaSchema = z.object({
  metadata: SchemaMetadataSchema,
  tables: z.array(DatabaseTableSchema),
  tableReferences: z.array(TableReferenceSchema),
});
export type DatabaseSchema = z.infer<typeof DatabaseSchemaSchema>;

/**
 * Query result schema for SQL execution results
 */
export const QueryResultSchema = z.object({
  columns: z.array(z.string()),
  rows: z.array(z.array(z.unknown())),
  rowCount: z.number().int().min(0),
  executionTimeMs: z.number().min(0).optional(),
  truncated: z.boolean().default(false),
  totalRows: z.number().int().optional(),
});
export type QueryResult = z.infer<typeof QueryResultSchema>;

/**
 * SQL query request schema
 */
export const SqlQueryRequestSchema = z.object({
  query: z.string().min(1, 'SQL query cannot be empty').max(50000),
  parameters: z.array(z.unknown()).max(100).default([]),
  maxRows: z.number().int().min(1).max(500).optional(),
});
export type SqlQueryRequest = z.infer<typeof SqlQueryRequestSchema>;

/**
 * Resource URI schemas for MCP resources
 */
export const SchemaListUriSchema = z.literal('db://schemas');
export const SchemaTablesUriSchema = z
  .string()
  .regex(URI_PATTERNS.SCHEMA_TABLES);
export const SchemaInfoUriSchema = z.string().regex(URI_PATTERNS.SCHEMA_INFO);
export const TableInfoUriSchema = z.string().regex(URI_PATTERNS.TABLE_INFO);
export const TableIndexesUriSchema = z
  .string()
  .regex(URI_PATTERNS.TABLE_INDEXES);
export const UriPatternsUriSchema = z.literal('db://uri-patterns');

export type SchemaListUri = z.infer<typeof SchemaListUriSchema>;
export type SchemaTablesUri = z.infer<typeof SchemaTablesUriSchema>;
export type SchemaInfoUri = z.infer<typeof SchemaInfoUriSchema>;
export type TableInfoUri = z.infer<typeof TableInfoUriSchema>;
export type TableIndexesUri = z.infer<typeof TableIndexesUriSchema>;
export type UriPatternsUri = z.infer<typeof UriPatternsUriSchema>;

/**
 * MCP Resource content schemas
 */
export const SchemaListResourceSchema = z.object({
  schemas: z.array(
    z.object({
      name: z.string(),
      tableCount: z.number().int().min(0).optional(),
      description: z.string().nullable().optional(),
    })
  ),
});
export type SchemaListResource = z.infer<typeof SchemaListResourceSchema>;

export const SchemaTablesResourceSchema = z.object({
  schemaName: z.string(),
  tables: z.array(TableReferenceSchema),
});
export type SchemaTablesResource = z.infer<typeof SchemaTablesResourceSchema>;

export const TableInfoResourceSchema = z.object({
  schemaName: z.string(),
  table: DatabaseTableSchema,
});
export type TableInfoResource = z.infer<typeof TableInfoResourceSchema>;

export const TableIndexesResourceSchema = z.object({
  schemaName: z.string(),
  tableName: z.string(),
  indexes: z.array(DatabaseIndexSchema),
});
export type TableIndexesResource = z.infer<typeof TableIndexesResourceSchema>;

export const UriPatternInfoSchema = z.object({
  id: z.string().min(1),
  uri: z.string().min(1),
  description: z.string().min(1),
  examples: z.array(z.string()).min(1),
  parameters: z
    .array(
      z.object({
        name: z.string().min(1),
        description: z.string().min(1),
        required: z.boolean().default(true),
      })
    )
    .default([]),
});
export type UriPatternInfo = z.infer<typeof UriPatternInfoSchema>;

export const UriPatternsResourceSchema = z.object({
  patterns: z.array(UriPatternInfoSchema),
});
export type UriPatternsResource = z.infer<typeof UriPatternsResourceSchema>;

/**
 * Validates table data using neverthrow Result
 * @param data - Table data object to validate
 * @returns Result containing validated table or error message
 */
export const validateTableData = (
  data: unknown
): Result<DatabaseTable, string> => {
  try {
    const validated = DatabaseTableSchema.parse(data);
    return ok(validated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessage = `Table validation failed: ${error.errors
        .map((e) => `${e.path.join('.')}: ${e.message}`)
        .join(', ')}`;
      return err(errorMessage);
    }
    return err('Unknown table validation error occurred');
  }
};

/**
 * Validates schema data using neverthrow Result
 * @param data - Schema data object to validate
 * @returns Result containing validated schema or error message
 */
export const validateSchemaData = (
  data: unknown
): Result<DatabaseSchema, string> => {
  try {
    const validated = DatabaseSchemaSchema.parse(data);
    return ok(validated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessage = `Schema validation failed: ${error.errors
        .map((e) => `${e.path.join('.')}: ${e.message}`)
        .join(', ')}`;
      return err(errorMessage);
    }
    return err('Unknown schema validation error occurred');
  }
};

/**
 * Validates query result data using neverthrow Result
 * @param data - Query result data to validate
 * @returns Result containing validated query result or error message
 */
export const validateQueryResult = (
  data: unknown
): Result<QueryResult, string> => {
  try {
    const validated = QueryResultSchema.parse(data);
    return ok(validated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessage = `Query result validation failed: ${error.errors
        .map((e) => `${e.path.join('.')}: ${e.message}`)
        .join(', ')}`;
      return err(errorMessage);
    }
    return err('Unknown query result validation error occurred');
  }
};

/**
 * Validates SQL query request using neverthrow Result
 * @param data - SQL query request data to validate
 * @returns Result containing validated request or error message
 */
export const validateSqlQueryRequest = (
  data: unknown
): Result<SqlQueryRequest, string> => {
  try {
    const validated = SqlQueryRequestSchema.parse(data);
    return ok(validated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessage = `SQL query request validation failed: ${error.errors
        .map((e) => `${e.path.join('.')}: ${e.message}`)
        .join(', ')}`;
      return err(errorMessage);
    }
    return err('Unknown SQL query request validation error occurred');
  }
};

/**
 * List of dangerous SQL keywords that are not allowed
 */
const DANGEROUS_KEYWORDS = [
  'DROP', 'CREATE', 'ALTER', 'TRUNCATE', 'RENAME',
  'GRANT', 'REVOKE', 'DENY',
  'INSERT', 'UPDATE', 'DELETE', 'REPLACE', 'MERGE', 'UPSERT',
  'ATTACH', 'DETACH', 'VACUUM',
  'LOAD_EXTENSION', 'LOAD_FILE', 'OUTFILE', 'DUMPFILE'
];

/**
 * List of allowed PRAGMA statements for SQLite
 */
const ALLOWED_PRAGMAS = [
  'table_info', 'index_list', 'index_info',
  'foreign_key_list', 'schema_version', 'compile_options'
];

/**
 * List of dangerous PRAGMA statements that are not allowed
 */
const DANGEROUS_PRAGMAS = [
  'writable_schema', 'load_extension'
];

/**
 * Error categories for better error handling
 */
export enum QueryErrorCategory {
  POLICY = 'policy',
  VALIDATION = 'validation',
  EXECUTION = 'execution',
  TIMEOUT = 'timeout',
  SIZE_LIMIT = 'size_limit'
}

/**
 * Check if a query contains dangerous keywords outside of comments and string literals
 * @param query - SQL query string to check
 * @returns The dangerous keyword found, or null if none
 */
export const containsDangerousKeywords = (query: string): string | null => {
  // Remove comments and string literals to avoid false positives
  const cleanedQuery = removeCommentsAndStrings(query);

  for (const keyword of DANGEROUS_KEYWORDS) {
    // Use word boundary regex to avoid partial matches
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    if (regex.test(cleanedQuery)) {
      return keyword;
    }
  }

  return null;
};

/**
 * Remove comments and string literals from SQL query for safe keyword checking
 * @param query - SQL query string
 * @returns Query with comments and string literals removed
 */
const removeCommentsAndStrings = (query: string): string => {
  let result = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < query.length; i++) {
    const char = query[i];
    const nextChar = i < query.length - 1 ? query[i + 1] : '';
    const prevChar = i > 0 ? query[i - 1] : '';

    // Handle block comments /* */
    if (!inSingleQuote && !inDoubleQuote && !inLineComment && char === '/' && nextChar === '*') {
      inBlockComment = true;
      i++; // Skip next char
      continue;
    }
    if (inBlockComment && char === '*' && nextChar === '/') {
      inBlockComment = false;
      i++; // Skip next char
      continue;
    }

    // Handle line comments --
    if (!inSingleQuote && !inDoubleQuote && !inBlockComment && char === '-' && nextChar === '-') {
      inLineComment = true;
      continue;
    }
    if (inLineComment && char === '\n') {
      inLineComment = false;
      result += char; // Keep newline
      continue;
    }

    // Skip if in any comment
    if (inBlockComment || inLineComment) {
      continue;
    }

    // Handle string literals
    if (char === "'" && prevChar !== '\\' && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      continue; // Remove quote
    }
    if (char === '"' && prevChar !== '\\' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      continue; // Remove quote
    }

    // Skip content inside string literals
    if (inSingleQuote || inDoubleQuote) {
      continue;
    }

    result += char;
  }

  return result;
};

/**
 * Validate PRAGMA statement for SQLite
 * @param query - SQL query string to validate
 * @returns Result containing validated query or error
 */
export const validatePragmaStatement = (query: string): Result<string, Error> => {
  const trimmedQuery = query.trim().toLowerCase();

  if (!trimmedQuery.startsWith('pragma')) {
    return ok(query); // Not a PRAGMA statement
  }

  // Extract PRAGMA name
  const pragmaMatch = trimmedQuery.match(/^pragma\s+([a-z_]+)/i);
  if (!pragmaMatch) {
    return err(new Error('Invalid PRAGMA syntax'));
  }

  const pragmaName = pragmaMatch[1].toLowerCase();

  // Check for dangerous PRAGMAs
  if (DANGEROUS_PRAGMAS.includes(pragmaName)) {
    return err(new Error(`PRAGMA statement not allowed: ${pragmaName}`));
  }

  // For now, only allow specific safe PRAGMAs
  if (!ALLOWED_PRAGMAS.includes(pragmaName)) {
    return err(new Error(`PRAGMA statement not allowed: ${pragmaName}`));
  }

  return ok(query);
};

/**
 * Validate EXPLAIN statement to ensure it only explains SELECT queries
 * @param query - SQL query string to validate
 * @returns Result containing validated query or error
 */
export const validateExplainStatement = (query: string): Result<string, Error> => {
  const trimmedQuery = query.trim().toLowerCase();

  if (!trimmedQuery.startsWith('explain')) {
    return ok(query); // Not an EXPLAIN statement
  }

  // Remove 'EXPLAIN' and optional 'QUERY PLAN' prefix
  const explainedQuery = trimmedQuery
    .replace(/^explain\s+(?:query\s+plan\s+)?/i, '')
    .trim();

  if (!explainedQuery.startsWith('select')) {
    return err(new Error('EXPLAIN can only be used with SELECT queries'));
  }

  return ok(query);
};

/**
 * Enhanced SQL query validation with security checks
 * @param query - SQL query string to validate
 * @returns Result containing validated query or error
 */
export const validateSqlQuery = (query: string): Result<string, Error> => {
  if (!query || typeof query !== 'string') {
    return err(new Error('Query cannot be empty or null'));
  }

  const trimmedQuery = query.trim();
  if (trimmedQuery.length === 0) {
    return err(new Error('Query cannot be empty'));
  }

  // Check for multiple statements (basic SQL injection prevention)
  const statements = trimmedQuery.split(';').filter((s) => s.trim().length > 0);
  if (statements.length > 1) {
    return err(new Error('Multiple statements are not allowed'));
  }

  // Check for dangerous keywords
  const dangerousKeyword = containsDangerousKeywords(trimmedQuery);
  if (dangerousKeyword) {
    return err(new Error(`Only read-only queries are allowed. Detected dangerous keyword: ${dangerousKeyword}`));
  }

  // Remove comments and leading whitespace for query type detection
  const cleanQuery = removeCommentsAndStrings(trimmedQuery.toLowerCase()).trim();

  const allowedQueryTypes = [
    'select',
    'pragma',
    'show',
    'describe',
    'desc',
    'explain',
  ];
  const queryType = cleanQuery.split(/\s+/)[0];

  if (!allowedQueryTypes.includes(queryType)) {
    return err(
      new Error(
        'Only SELECT, PRAGMA, SHOW, DESCRIBE, and EXPLAIN queries are allowed'
      )
    );
  }

  // Validate PRAGMA statements
  if (queryType === 'pragma') {
    const pragmaResult = validatePragmaStatement(trimmedQuery);
    if (pragmaResult.isErr()) {
      return pragmaResult;
    }
  }

  // Validate EXPLAIN statements
  if (queryType === 'explain') {
    const explainResult = validateExplainStatement(trimmedQuery);
    if (explainResult.isErr()) {
      return explainResult;
    }
  }

  return ok(query);
};

/**
 * Enforce LIMIT clause on SELECT queries
 * @param query - SQL query string
 * @param maxRows - Maximum number of rows to return
 * @returns Query with enforced LIMIT
 */
export const enforceLimitOnQuery = (query: string, maxRows: number): string => {
  const trimmedQuery = query.trim();
  const lowerQuery = trimmedQuery.toLowerCase();

  // Check if query already has a LIMIT clause
  const limitMatch = lowerQuery.match(/\blimit\s+(\d+)(?:\s+offset\s+\d+)?$/i);

  if (limitMatch) {
    const existingLimit = parseInt(limitMatch[1], 10);
    if (existingLimit <= maxRows) {
      // Existing limit is fine, keep it
      return trimmedQuery;
    } else {
      // Replace existing limit with maxRows
      return trimmedQuery.replace(/\blimit\s+\d+(?:\s+offset\s+\d+)?$/i, `LIMIT ${maxRows}`);
    }
  } else {
    // Add LIMIT clause
    return `${trimmedQuery} LIMIT ${maxRows}`;
  }
};

/**
 * Sanitizes a SQL query by normalizing whitespace
 * @param query - SQL query string to sanitize
 * @returns Result containing sanitized query or error
 */
export const sanitizeQuery = (query: string): Result<string, Error> => {
  if (!query || typeof query !== 'string') {
    return err(new Error('Query cannot be null or undefined'));
  }

  // Basic sanitization: normalize whitespace while preserving string literals
  const sanitized = query.trim();

  if (sanitized.length === 0) {
    return err(new Error('Query cannot be empty after sanitization'));
  }

  // Normalize whitespace outside of string literals
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let result = '';

  for (let i = 0; i < sanitized.length; i++) {
    const char = sanitized[i];
    const prevChar = i > 0 ? sanitized[i - 1] : '';

    if (char === "'" && prevChar !== '\\' && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      result += char;
    } else if (char === '"' && prevChar !== '\\' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      result += char;
    } else if (inSingleQuote || inDoubleQuote) {
      // Inside string literal, preserve as-is
      result += char;
    } else if (/\s/.test(char)) {
      // Outside string literal, normalize whitespace
      if (result.length > 0 && !/\s$/.test(result)) {
        result += ' ';
      }
    } else {
      result += char;
    }
  }

  return ok(result.trim());
};
