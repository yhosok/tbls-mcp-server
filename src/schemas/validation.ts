import { Result, ok, err } from 'neverthrow';
import { z } from 'zod';

/**
 * Custom validation error class
 */
export class ValidationError extends Error {
  public context?: Record<string, unknown>;

  constructor(message: string, context?: Record<string, unknown>) {
    super(message);
    this.name = 'ValidationError';
    this.context = context;
  }
}

/**
 * SQL keywords that should be rejected for table/column names
 */
const SQL_KEYWORDS = new Set([
  'select', 'from', 'where', 'insert', 'update', 'delete', 'drop', 'create',
  'alter', 'truncate', 'grant', 'revoke', 'union', 'join', 'inner', 'outer',
  'left', 'right', 'group', 'order', 'having', 'limit', 'offset', 'distinct',
  'count', 'sum', 'avg', 'max', 'min', 'as', 'and', 'or', 'not', 'null',
  'true', 'false', 'is', 'in', 'exists', 'between', 'like', 'case', 'when',
  'then', 'else', 'end', 'if', 'else', 'elseif', 'while', 'for', 'do', 'begin'
]);

/**
 * Checks if a SQL query is a SELECT statement
 * @param query - SQL query string to validate
 * @returns true if query starts with SELECT (case insensitive)
 */
export const isSelectQuery = (query: string): boolean => {
  if (!query || typeof query !== 'string') {
    return false;
  }

  const trimmedQuery = query.trim();
  if (trimmedQuery.length === 0) {
    return false;
  }

  // Check if query starts with SELECT (case insensitive)
  const selectRegex = /^\s*select\s+/i;
  if (!selectRegex.test(trimmedQuery)) {
    return false;
  }

  // Basic check for potential SQL injection attempts
  // Reject queries with multiple statements (semicolon followed by non-whitespace)
  const multiStatementRegex = /;\s*\S/;
  if (multiStatementRegex.test(trimmedQuery)) {
    return false;
  }

  return true;
};

/**
 * Validates SQL query to ensure it's a SELECT statement
 * @param query - SQL query string to validate
 * @returns Result containing the query or error message
 */
export const validateSqlQuery = (query: string): Result<string, string> => {
  if (!query || typeof query !== 'string') {
    return err('SQL query must be a non-empty string');
  }

  const trimmedQuery = query.trim();
  if (trimmedQuery.length === 0) {
    return err('SQL query cannot be empty');
  }

  if (!isSelectQuery(trimmedQuery)) {
    return err('Only SELECT queries are allowed for security reasons');
  }

  return ok(trimmedQuery);
};

/**
 * Validates and sanitizes table names
 * @param tableName - Table name to validate
 * @returns Result containing sanitized table name or error message
 */
export const sanitizeTableName = (tableName: string): Result<string, string> => {
  if (!tableName || typeof tableName !== 'string') {
    return err('Table name must be a non-empty string');
  }

  const trimmedName = tableName.trim();
  if (trimmedName.length === 0) {
    return err('Invalid table name: cannot be empty');
  }

  // Check for valid identifier format (letters, numbers, underscore)
  // Must start with letter or underscore
  const validIdentifierRegex = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
  if (!validIdentifierRegex.test(trimmedName)) {
    return err('Invalid table name: must contain only letters, numbers, and underscores, and start with a letter or underscore');
  }

  // Check against SQL keywords
  if (SQL_KEYWORDS.has(trimmedName.toLowerCase())) {
    return err('Invalid table name: cannot use SQL keywords');
  }

  return ok(trimmedName);
};

/**
 * Validates and sanitizes column names
 * @param columnName - Column name to validate
 * @returns Result containing sanitized column name or error message
 */
export const sanitizeColumnName = (columnName: string): Result<string, string> => {
  if (!columnName || typeof columnName !== 'string') {
    return err('Column name must be a non-empty string');
  }

  const trimmedName = columnName.trim();
  if (trimmedName.length === 0) {
    return err('Invalid column name: cannot be empty');
  }

  // Check for valid identifier format (letters, numbers, underscore)
  // Must start with letter or underscore
  const validIdentifierRegex = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
  if (!validIdentifierRegex.test(trimmedName)) {
    return err('Invalid column name: must contain only letters, numbers, and underscores, and start with a letter or underscore');
  }

  // Check against SQL keywords
  if (SQL_KEYWORDS.has(trimmedName.toLowerCase())) {
    return err('Invalid column name: cannot use SQL keywords');
  }

  return ok(trimmedName);
};

/**
 * Connection string validation schema
 */
const MySQLConnectionStringSchema = z.string().regex(
  /^mysql:\/\/[^@\/]+@[^@\/:]+(:\d+)?\/[^\/]+$/,
  'Invalid MySQL connection string format'
);

const SQLitePathSchema = z.string().min(1).refine(
  (path) => {
    // Reject URLs that look like MySQL but failed MySQL validation
    if (path.startsWith('mysql://')) return false;
    if (path.startsWith('invalid://')) return false;

    // Allow :memory: for in-memory databases
    if (path === ':memory:') return true;

    // Allow file: prefix
    if (path.startsWith('file:')) return true;

    // Reject paths that look like incomplete URLs
    if (path.includes('://')) return false;

    // Basic path validation (no invalid characters)
    const invalidChars = /[<>|"*?]/;
    return !invalidChars.test(path);
  },
  'Invalid SQLite path format'
);

/**
 * Validates database connection strings
 * @param connectionString - Connection string to validate
 * @returns Result containing validated connection string or error message
 */
export const validateConnectionString = (connectionString: string): Result<string, string> => {
  if (!connectionString || typeof connectionString !== 'string') {
    return err('Connection string must be a non-empty string');
  }

  const trimmed = connectionString.trim();
  if (trimmed.length === 0) {
    return err('Connection string cannot be empty');
  }

  // Try MySQL format first
  const mysqlResult = MySQLConnectionStringSchema.safeParse(trimmed);
  if (mysqlResult.success) {
    return ok(trimmed);
  }

  // Try SQLite path format
  const sqliteResult = SQLitePathSchema.safeParse(trimmed);
  if (sqliteResult.success) {
    return ok(trimmed);
  }

  return err('Invalid connection string format. Must be a valid MySQL URL or SQLite path');
};

/**
 * Connection info for parsed connection strings
 */
export type ParsedConnectionInfo =
  | {
      type: 'mysql';
      host: string;
      port: number;
      user: string;
      password?: string;
      database: string;
    }
  | {
      type: 'sqlite';
      path: string;
    };

/**
 * Parses connection string into structured information
 * @param connectionString - Connection string to parse
 * @returns Result containing parsed connection info or error message
 */
export const parseConnectionString = (connectionString: string): Result<ParsedConnectionInfo, string> => {
  const validationResult = validateConnectionString(connectionString);
  if (validationResult.isErr()) {
    return err(validationResult.error);
  }

  const trimmed = connectionString.trim();

  // Try parsing as MySQL connection string
  if (trimmed.startsWith('mysql://')) {
    try {
      const url = new URL(trimmed);

      if (!url.hostname || !url.username || !url.pathname || url.pathname === '/') {
        return err('Invalid MySQL connection string: missing required components');
      }

      const database = url.pathname.slice(1); // Remove leading slash
      const port = url.port ? parseInt(url.port, 10) : 3306;

      return ok({
        type: 'mysql',
        host: url.hostname,
        port: port,
        user: url.username,
        password: url.password || undefined,
        database: database,
      });
    } catch (error) {
      return err('Invalid MySQL connection string format');
    }
  }

  // Treat as SQLite path
  return ok({
    type: 'sqlite',
    path: trimmed,
  });
};

/**
 * Validates file path for security
 * @param filePath - File path to validate
 * @returns Result containing validated path or error message
 */
export const validateFilePath = (filePath: string): Result<string, string> => {
  if (!filePath || typeof filePath !== 'string') {
    return err('File path must be a non-empty string');
  }

  const trimmed = filePath.trim();
  if (trimmed.length === 0) {
    return err('File path cannot be empty');
  }

  // Check for directory traversal attempts
  if (trimmed.includes('..')) {
    return err('File path cannot contain directory traversal sequences (..)');
  }

  // Check for potentially dangerous characters
  const dangerousChars = /[<>|"*?]/;
  if (dangerousChars.test(trimmed)) {
    return err('File path contains invalid characters');
  }

  return ok(trimmed);
};

/**
 * Validates that a string represents a positive integer
 * @param value - String value to validate
 * @returns Result containing parsed integer or error message
 */
export const validatePositiveInteger = (value: string): Result<number, string> => {
  if (!value || typeof value !== 'string') {
    return err('Value must be a non-empty string');
  }

  const trimmed = value.trim();
  const parsed = parseInt(trimmed, 10);

  if (isNaN(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
    return err('Value must be a positive integer');
  }

  // Check if the string representation matches (no leading zeros, etc.)
  if (parsed.toString() !== trimmed) {
    return err('Invalid integer format');
  }

  return ok(parsed);
};