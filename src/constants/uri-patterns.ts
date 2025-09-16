/**
 * URI Pattern ID constants for type safety and maintainability
 *
 * This module centralizes all pattern identifiers to ensure consistency
 * across the codebase and prevent typos in pattern ID references.
 *
 * @fileoverview Centralized constants for URI patterns used throughout the MCP server
 * @author tbls-mcp-server
 * @since 1.0.0
 */

/**
 * Pattern ID constants for all supported resource types
 * @readonly
 * @constant
 */
export const PATTERN_IDS = {
  /** Root schema list pattern - db://schemas */
  SCHEMA_LIST: 'db-schemas',

  /** Schema tables pattern - db://schemas/{schemaName}/tables */
  SCHEMA_TABLES: 'db-schema-tables',

  /** Individual schema pattern - db://schemas/{schemaName} */
  SCHEMA_INFO: 'db-schema',

  /** Table information pattern - db://schemas/{schemaName}/tables/{tableName} */
  TABLE_INFO: 'db-table-info',

  /** Table indexes pattern - db://schemas/{schemaName}/tables/{tableName}/indexes */
  TABLE_INDEXES: 'db-table-indexes',

  /** URI patterns resource pattern - db://uri-patterns */
  URI_PATTERNS: 'uri-patterns',
} as const;

/**
 * Regular expressions for URI pattern matching
 * Uses strict character validation for schema and table names
 * @readonly
 * @constant
 */
export const URI_PATTERNS = {
  /** Matches db://schemas exactly */
  SCHEMA_LIST: /^db:\/\/schemas$/,

  /** Matches db://schemas/{schemaName}/tables with valid schema names */
  SCHEMA_TABLES: /^db:\/\/schemas\/([a-zA-Z0-9_]+)\/tables$/,

  /** Matches db://schemas/{schemaName} with valid schema names */
  SCHEMA_INFO: /^db:\/\/schemas\/([a-zA-Z0-9_]+)$/,

  /** Matches db://schemas/{schemaName}/tables/{tableName} with valid names */
  TABLE_INFO: /^db:\/\/schemas\/([a-zA-Z0-9_]+)\/tables\/([a-zA-Z0-9_]+)$/,

  /** Matches db://schemas/{schemaName}/tables/{tableName}/indexes with valid names */
  TABLE_INDEXES: /^db:\/\/schemas\/([a-zA-Z0-9_]+)\/tables\/([a-zA-Z0-9_]+)\/indexes$/,

  /** Matches db://uri-patterns exactly */
  URI_PATTERNS: /^db:\/\/uri-patterns$/,
} as const;

/**
 * URI template strings with placeholders
 * @readonly
 * @constant
 */
export const URI_TEMPLATES = {
  /** Template for schema list URI */
  SCHEMA_LIST: 'db://schemas',

  /** Template for schema tables URI */
  SCHEMA_TABLES: 'db://schemas/{schemaName}/tables',

  /** Template for schema info URI */
  SCHEMA_INFO: 'db://schemas/{schemaName}',

  /** Template for table info URI */
  TABLE_INFO: 'db://schemas/{schemaName}/tables/{tableName}',

  /** Template for table indexes URI */
  TABLE_INDEXES: 'db://schemas/{schemaName}/tables/{tableName}/indexes',

  /** Template for URI patterns resource */
  URI_PATTERNS: 'db://uri-patterns',
} as const;

/**
 * Type for pattern ID values
 * @typedef {string} PatternId
 */
export type PatternId = typeof PATTERN_IDS[keyof typeof PATTERN_IDS];

/**
 * Type for URI pattern RegExp values
 * @typedef {RegExp} UriPattern
 */
export type UriPattern = typeof URI_PATTERNS[keyof typeof URI_PATTERNS];

/**
 * Type for URI template string values
 * @typedef {string} UriTemplate
 */
export type UriTemplate = typeof URI_TEMPLATES[keyof typeof URI_TEMPLATES];