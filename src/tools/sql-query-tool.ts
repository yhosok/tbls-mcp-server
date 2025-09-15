import { Result, ok, err } from 'neverthrow';
import { DatabaseConfig } from '../schemas/config';
import {
  QueryResult,
  SqlQueryRequest,
  validateSqlQuery,
  sanitizeQuery,
  validateSqlQueryRequest,
} from '../schemas/database';
import { getPooledConnection, executeQuery } from '../database/connection';
import { safeExecuteAsync } from '../utils/result';

// Type for MCP tool input
interface SqlQueryToolInput {
  query: string;
  parameters?: unknown[];
  timeout?: number;
}

// Type for database connection info
interface DatabaseConnectionInfo {
  connected: boolean;
  version: string;
  serverInfo?: {
    connectionId?: number;
    host?: string;
    database?: string;
  };
}

// Type for query metadata
interface QueryMetadata {
  startTime: number;
  context?: {
    userId?: string;
    sessionId?: string;
    source?: string;
  };
  sanitized: boolean;
  validated: boolean;
  executed: boolean;
  endTime: number | null;
  duration?: number;
}

/**
 * Default query timeout in milliseconds (30 seconds)
 */
const DEFAULT_QUERY_TIMEOUT_MS = 30000;

/**
 * Maximum query timeout in milliseconds (5 minutes)
 */
const MAX_QUERY_TIMEOUT_MS = 300000;

/**
 * Handle SQL query execution with comprehensive security and validation
 * @param request - SQL query request
 * @param config - Database configuration
 * @param timeoutMs - Query timeout in milliseconds
 * @returns Result containing query results
 */
export const handleSqlQuery = async (
  request: SqlQueryRequest,
  config: DatabaseConfig,
  timeoutMs: number = DEFAULT_QUERY_TIMEOUT_MS
): Promise<Result<QueryResult, Error>> => {
  // Validate and sanitize the input request
  const validationResult = validateSqlQueryRequest(request);
  if (validationResult.isErr()) {
    return err(
      new Error(`Request validation failed: ${validationResult.error}`)
    );
  }

  const { query, parameters = [] } = validationResult.value;

  // Sanitize the query
  const sanitizeResult = sanitizeQuery(query);
  if (sanitizeResult.isErr()) {
    return err(sanitizeResult.error);
  }

  const sanitizedQuery = sanitizeResult.value;

  // Validate that it's a SELECT query
  const queryValidationResult = validateSqlQuery(sanitizedQuery);
  if (queryValidationResult.isErr()) {
    return err(queryValidationResult.error);
  }

  // Validate timeout
  const actualTimeout = Math.min(
    Math.max(timeoutMs, 1000),
    MAX_QUERY_TIMEOUT_MS
  );

  return safeExecuteAsync(async () => {
    // Get database connection from pool
    const connectionResult = await getPooledConnection(config);
    if (connectionResult.isErr()) {
      throw new Error(
        `Database connection failed: ${connectionResult.error.message}`
      );
    }

    const connection = connectionResult.value;

    // Execute the query
    const queryResult = await executeQuery(
      connection,
      sanitizedQuery,
      parameters,
      actualTimeout
    );
    if (queryResult.isErr()) {
      throw queryResult.error;
    }

    return queryResult.value;
  }, 'SQL query execution failed');
};

/**
 * Validate SQL query for security and correctness
 * @param query - SQL query string to validate
 * @returns Result containing validated query or error
 */
export { validateSqlQuery };

/**
 * Sanitize SQL query by normalizing whitespace and removing dangerous patterns
 * @param query - SQL query string to sanitize
 * @returns Result containing sanitized query or error
 */
export { sanitizeQuery };

/**
 * MCP Tool definition for SQL query execution
 */
export interface SqlQueryTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: {
      query: {
        type: 'string';
        description: string;
        minLength: number;
      };
      parameters: {
        type: 'array';
        description: string;
        items: {};
        default: never[];
      };
      timeout?: {
        type: 'number';
        description: string;
        minimum: number;
        maximum: number;
        default: number;
      };
    };
    required: string[];
  };
  handler: (input: SqlQueryToolInput) => Promise<Result<QueryResult, Error>>;
}

/**
 * Create SQL query tool for MCP server
 * @param config - Database configuration
 * @returns MCP tool definition
 */
export const createSqlQueryTool = (config: DatabaseConfig): SqlQueryTool => {
  return {
    name: 'execute-sql',
    description: [
      'Execute SQL SELECT queries on the configured database.',
      '',
      'SECURITY FEATURES:',
      '• SELECT queries only - INSERT, UPDATE, DELETE, DROP, etc. are blocked',
      '• Parameterized queries prevent SQL injection attacks',
      '• Query timeout protection prevents long-running queries',
      '• Multiple statement prevention blocks compound SQL injection',
      '• Input sanitization removes dangerous patterns',
      '',
      'SUPPORTED DATABASES:',
      '• MySQL (via connection string or individual parameters)',
      '• SQLite (file path or :memory: database)',
      '',
      'USAGE:',
      '• Use ? placeholders for parameters in queries',
      '• Parameters are safely bound to prevent SQL injection',
      '• Complex SELECT queries with JOINs, subqueries, etc. are supported',
      '• Schema introspection queries (SHOW TABLES, PRAGMA, etc.) are allowed',
      '',
      'EXAMPLES:',
      '• SELECT * FROM users WHERE active = ?',
      '• SELECT u.name, COUNT(p.id) FROM users u LEFT JOIN posts p ON u.id = p.user_id GROUP BY u.id',
      '• SHOW TABLES (MySQL) or SELECT name FROM sqlite_master WHERE type="table" (SQLite)',
    ].join('\n'),
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'SQL SELECT query to execute',
          minLength: 1,
        },
        parameters: {
          type: 'array',
          description:
            'Query parameters for prepared statements (use ? placeholders in query)',
          items: {},
          default: [],
        },
        timeout: {
          type: 'number',
          description:
            'Query timeout in milliseconds (1000-300000, default 30000)',
          minimum: 1000,
          maximum: MAX_QUERY_TIMEOUT_MS,
          default: DEFAULT_QUERY_TIMEOUT_MS,
        },
      },
      required: ['query'],
    },
    handler: async (
      input: SqlQueryToolInput
    ): Promise<Result<QueryResult, Error>> => {
      try {
        const request: SqlQueryRequest = {
          query: input.query,
          parameters: input.parameters || [],
        };

        const timeout = input.timeout || DEFAULT_QUERY_TIMEOUT_MS;

        return await handleSqlQuery(request, config, timeout);
      } catch (error) {
        return err(
          new Error(
            `Tool handler error: ${error instanceof Error ? error.message : String(error)}`
          )
        );
      }
    },
  };
};

/**
 * Advanced SQL query execution with retry logic
 * @param request - SQL query request
 * @param config - Database configuration
 * @param maxRetries - Maximum number of retries
 * @param retryDelay - Delay between retries in milliseconds
 * @returns Result containing query results
 */
export const handleSqlQueryWithRetry = async (
  request: SqlQueryRequest,
  config: DatabaseConfig,
  maxRetries: number = 3,
  retryDelay: number = 1000
): Promise<Result<QueryResult, Error>> => {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await handleSqlQuery(request, config);

    if (result.isOk()) {
      return result;
    }

    lastError = result.error;

    // Don't retry on certain types of errors
    const errorMessage = lastError.message.toLowerCase();
    if (
      errorMessage.includes('validation failed') ||
      errorMessage.includes('only select queries') ||
      errorMessage.includes('syntax') ||
      errorMessage.includes('unknown column') ||
      errorMessage.includes('no such table')
    ) {
      break;
    }

    // Retry on connection and timeout errors
    if (attempt < maxRetries) {
      if (
        errorMessage.includes('connection') ||
        errorMessage.includes('timeout') ||
        errorMessage.includes('busy')
      ) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
        continue;
      }
    }

    break;
  }

  return err(
    new Error(
      `Query failed after ${maxRetries + 1} attempts: ${lastError?.message || 'Unknown error'}`
    )
  );
};

/**
 * Execute multiple SQL queries in sequence
 * @param requests - Array of SQL query requests
 * @param config - Database configuration
 * @returns Result containing array of query results
 */
export const handleMultipleSqlQueries = async (
  requests: SqlQueryRequest[],
  config: DatabaseConfig
): Promise<Result<QueryResult[], Error>> => {
  const results: QueryResult[] = [];

  for (const request of requests) {
    const result = await handleSqlQuery(request, config);
    if (result.isErr()) {
      return err(
        new Error(`Query ${results.length + 1} failed: ${result.error.message}`)
      );
    }
    results.push(result.value);
  }

  return ok(results);
};

/**
 * Get database schema information using SQL queries
 * @param config - Database configuration
 * @returns Result containing schema information
 */
export const getDatabaseSchemaInfo = async (
  config: DatabaseConfig
): Promise<
  Result<{ tables: string[]; columns: Record<string, string[]> }, Error>
> => {
  return safeExecuteAsync(async () => {
    let tablesQuery: string;
    let columnsQuery: string;

    if (config.type === 'mysql') {
      tablesQuery = `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = DATABASE()
        AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `;
      columnsQuery = `
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
        ORDER BY table_name, ordinal_position
      `;
    } else {
      tablesQuery = `
        SELECT name as table_name
        FROM sqlite_master
        WHERE type = 'table'
        AND name NOT LIKE 'sqlite_%'
        ORDER BY name
      `;
      columnsQuery = `
        SELECT m.name as table_name, p.name as column_name
        FROM sqlite_master m
        JOIN pragma_table_info(m.name) p
        WHERE m.type = 'table'
        AND m.name NOT LIKE 'sqlite_%'
        ORDER BY m.name, p.cid
      `;
    }

    // Get tables
    const tablesResult = await handleSqlQuery(
      { query: tablesQuery, parameters: [] },
      config
    );
    if (tablesResult.isErr()) {
      throw tablesResult.error;
    }

    const tables = tablesResult.value.rows.map((row) => row[0] as string);

    // Get columns
    const columnsResult = await handleSqlQuery(
      { query: columnsQuery, parameters: [] },
      config
    );
    if (columnsResult.isErr()) {
      throw columnsResult.error;
    }

    const columns: Record<string, string[]> = {};
    columnsResult.value.rows.forEach((row) => {
      const tableName = row[0] as string;
      const columnName = row[1] as string;

      if (!columns[tableName]) {
        columns[tableName] = [];
      }
      columns[tableName].push(columnName);
    });

    return { tables, columns };
  }, 'Failed to get database schema information');
};

/**
 * Validate database connection using SQL query
 * @param config - Database configuration
 * @returns Result indicating connection success
 */
export const validateDatabaseConnection = async (
  config: DatabaseConfig
): Promise<Result<DatabaseConnectionInfo, Error>> => {
  return safeExecuteAsync(async () => {
    const versionQuery =
      config.type === 'mysql'
        ? 'SELECT VERSION() as version, CONNECTION_ID() as connection_id'
        : 'SELECT sqlite_version() as version';

    const result = await handleSqlQuery(
      { query: versionQuery, parameters: [] },
      config
    );
    if (result.isErr()) {
      throw result.error;
    }

    const row = result.value.rows[0];
    return {
      connected: true,
      version: row[0] as string,
      serverInfo:
        config.type === 'mysql'
          ? { connectionId: row[1] as number }
          : undefined,
    };
  }, 'Database connection validation failed');
};

/**
 * Execute a safe query with comprehensive logging and monitoring
 * @param request - SQL query request
 * @param config - Database configuration
 * @param context - Additional context for logging
 * @returns Result containing query results with execution metadata
 */
export const executeSafeQuery = async (
  request: SqlQueryRequest,
  config: DatabaseConfig,
  context?: { userId?: string; sessionId?: string; source?: string }
): Promise<Result<QueryResult & { metadata: QueryMetadata }, Error>> => {
  const startTime = Date.now();
  const metadata = {
    startTime,
    context,
    sanitized: false,
    validated: false,
    executed: false,
    endTime: null as number | null,
    totalTimeMs: null as number | null,
  };

  try {
    // Sanitize query
    const sanitizeResult = sanitizeQuery(request.query);
    if (sanitizeResult.isErr()) {
      metadata.endTime = Date.now();
      metadata.totalTimeMs = metadata.endTime - startTime;
      return err(sanitizeResult.error);
    }
    metadata.sanitized = true;

    // Validate query
    const validateResult = validateSqlQuery(sanitizeResult.value);
    if (validateResult.isErr()) {
      metadata.endTime = Date.now();
      metadata.totalTimeMs = metadata.endTime - startTime;
      return err(validateResult.error);
    }
    metadata.validated = true;

    // Execute query
    const result = await handleSqlQuery(request, config);
    if (result.isErr()) {
      metadata.endTime = Date.now();
      metadata.totalTimeMs = metadata.endTime - startTime;
      return err(result.error);
    }
    metadata.executed = true;

    metadata.endTime = Date.now();
    metadata.totalTimeMs = metadata.endTime - startTime;

    return ok({
      ...result.value,
      metadata,
    });
  } catch (error) {
    metadata.endTime = Date.now();
    metadata.totalTimeMs = metadata.endTime - startTime;
    return err(
      new Error(
        `Safe query execution failed: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
};
