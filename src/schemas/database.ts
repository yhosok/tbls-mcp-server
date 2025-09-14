import { z } from 'zod';
import { Result, ok, err } from 'neverthrow';

/**
 * Database column schema representing column information from tbls markdown
 */
export const DatabaseColumn = z.object({
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
export type DatabaseColumn = z.infer<typeof DatabaseColumn>;

/**
 * Database index schema representing index information from tbls markdown
 */
export const DatabaseIndex = z.object({
  name: z.string().min(1),
  columns: z.array(z.string().min(1)).min(1, 'Index must have at least one column'),
  isUnique: z.boolean().default(false),
  isPrimary: z.boolean().default(false),
  type: z.string().optional(),
  comment: z.string().nullable().optional(),
});
export type DatabaseIndex = z.infer<typeof DatabaseIndex>;

/**
 * Database relation schema representing foreign key relationships
 */
export const DatabaseRelation = z.object({
  type: z.enum(['belongsTo', 'hasMany', 'hasOne']),
  table: z.string().min(1),
  columns: z.array(z.string().min(1)).min(1),
  referencedTable: z.string().min(1),
  referencedColumns: z.array(z.string().min(1)).min(1),
  constraintName: z.string().optional(),
});
export type DatabaseRelation = z.infer<typeof DatabaseRelation>;

/**
 * Database table schema representing complete table information from tbls markdown
 */
export const DatabaseTable = z.object({
  name: z.string().min(1),
  comment: z.string().nullable().optional(),
  columns: z.array(DatabaseColumn).min(1, 'Table must have at least one column'),
  indexes: z.array(DatabaseIndex).default([]),
  relations: z.array(DatabaseRelation).default([]),
});
export type DatabaseTable = z.infer<typeof DatabaseTable>;

/**
 * Table reference schema for schema overview
 */
export const TableReference = z.object({
  name: z.string().min(1),
  comment: z.string().nullable().default(null),
  columnCount: z.number().int().min(0).nullable().default(null),
});
export type TableReference = z.infer<typeof TableReference>;

/**
 * Schema metadata schema
 */
export const SchemaMetadata = z.object({
  name: z.string().min(1),
  tableCount: z.number().int().min(0).nullable().default(null),
  generated: z.string().datetime().nullable().default(null),
  version: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
});
export type SchemaMetadata = z.infer<typeof SchemaMetadata>;

/**
 * Complete database schema representing the structure parsed from tbls markdown
 */
export const DatabaseSchema = z.object({
  metadata: SchemaMetadata,
  tables: z.array(DatabaseTable),
  tableReferences: z.array(TableReference),
});
export type DatabaseSchema = z.infer<typeof DatabaseSchema>;

/**
 * Query result schema for SQL execution results
 */
export const QueryResult = z.object({
  columns: z.array(z.string()),
  rows: z.array(z.array(z.unknown())),
  rowCount: z.number().int().min(0),
  executionTimeMs: z.number().min(0).optional(),
});
export type QueryResult = z.infer<typeof QueryResult>;

/**
 * SQL query request schema
 */
export const SqlQueryRequest = z.object({
  query: z.string().min(1, 'SQL query cannot be empty'),
  parameters: z.array(z.unknown()).default([]),
});
export type SqlQueryRequest = z.infer<typeof SqlQueryRequest>;

/**
 * Resource URI schemas for MCP resources
 */
export const SchemaListUri = z.literal('schema://list');
export const SchemaTablesUri = z.string().regex(/^schema:\/\/[^\/]+\/tables$/);
export const TableInfoUri = z.string().regex(/^table:\/\/[^\/]+\/[^\/]+$/);
export const TableIndexesUri = z.string().regex(/^table:\/\/[^\/]+\/[^\/]+\/indexes$/);

export type SchemaListUri = z.infer<typeof SchemaListUri>;
export type SchemaTablesUri = z.infer<typeof SchemaTablesUri>;
export type TableInfoUri = z.infer<typeof TableInfoUri>;
export type TableIndexesUri = z.infer<typeof TableIndexesUri>;

/**
 * MCP Resource content schemas
 */
export const SchemaListResource = z.object({
  schemas: z.array(z.object({
    name: z.string(),
    tableCount: z.number().int().min(0).optional(),
    description: z.string().nullable().optional(),
  })),
});
export type SchemaListResource = z.infer<typeof SchemaListResource>;

export const SchemaTablesResource = z.object({
  schemaName: z.string(),
  tables: z.array(TableReference),
});
export type SchemaTablesResource = z.infer<typeof SchemaTablesResource>;

export const TableInfoResource = z.object({
  schemaName: z.string(),
  table: DatabaseTable,
});
export type TableInfoResource = z.infer<typeof TableInfoResource>;

export const TableIndexesResource = z.object({
  schemaName: z.string(),
  tableName: z.string(),
  indexes: z.array(DatabaseIndex),
});
export type TableIndexesResource = z.infer<typeof TableIndexesResource>;

/**
 * Validates table data using neverthrow Result
 * @param data - Table data object to validate
 * @returns Result containing validated table or error message
 */
export const validateTableData = (data: unknown): Result<DatabaseTable, string> => {
  try {
    const validated = DatabaseTable.parse(data);
    return ok(validated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessage = `Table validation failed: ${error.errors
        .map(e => `${e.path.join('.')}: ${e.message}`)
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
export const validateSchemaData = (data: unknown): Result<DatabaseSchema, string> => {
  try {
    const validated = DatabaseSchema.parse(data);
    return ok(validated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessage = `Schema validation failed: ${error.errors
        .map(e => `${e.path.join('.')}: ${e.message}`)
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
export const validateQueryResult = (data: unknown): Result<QueryResult, string> => {
  try {
    const validated = QueryResult.parse(data);
    return ok(validated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessage = `Query result validation failed: ${error.errors
        .map(e => `${e.path.join('.')}: ${e.message}`)
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
export const validateSqlQueryRequest = (data: unknown): Result<SqlQueryRequest, string> => {
  try {
    const validated = SqlQueryRequest.parse(data);
    return ok(validated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessage = `SQL query request validation failed: ${error.errors
        .map(e => `${e.path.join('.')}: ${e.message}`)
        .join(', ')}`;
      return err(errorMessage);
    }
    return err('Unknown SQL query request validation error occurred');
  }
};

/**
 * Validates that a SQL query is a SELECT statement
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
  const statements = trimmedQuery.split(';').filter(s => s.trim().length > 0);
  if (statements.length > 1) {
    return err(new Error('Multiple statements are not allowed'));
  }

  // Check if query starts with SELECT or PRAGMA or SHOW (case-insensitive)
  const queryStart = trimmedQuery.toLowerCase();

  // Remove comments and leading whitespace
  const cleanQuery = queryStart
    .replace(/^\s*\/\*[\s\S]*?\*\/\s*/g, '') // Remove /* */ comments
    .replace(/^\s*--.*$/gm, '') // Remove -- comments
    .trim();

  const allowedQueryTypes = ['select', 'pragma', 'show', 'describe', 'desc', 'explain'];
  const queryType = cleanQuery.split(/\s+/)[0];

  if (!allowedQueryTypes.includes(queryType)) {
    return err(new Error('Only SELECT, PRAGMA, SHOW, DESCRIBE, and EXPLAIN queries are allowed'));
  }

  return ok(query);
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
  let sanitized = query.trim();

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