import { Result, ok, err } from 'neverthrow';
import { DatabaseConfig } from '../schemas/config';
import { QueryResult, validateSqlQuery } from '../schemas/database';
import { safeExecuteAsync, validateNotEmpty } from '../utils/result';
import { createMySQLConnection, executeMySQLQuery, closeMySQLConnection, MySQLConnection } from './mysql-adapter';
import { createSQLiteConnection, executeSQLiteQuery, closeSQLiteConnection, SQLiteConnection } from './sqlite-adapter';

/**
 * Union type for all database connection types
 */
export type DatabaseConnection = MySQLConnection | SQLiteConnection;

/**
 * Default query timeout in milliseconds (30 seconds)
 */
export const DEFAULT_QUERY_TIMEOUT_MS = 30000;

/**
 * Connection pool for managing database connections
 */
export class ConnectionPool {
  private connections: Map<string, DatabaseConnection> = new Map();

  /**
   * Get or create a database connection
   * @param config - Database configuration
   * @returns Result containing database connection
   */
  async getConnection(config: DatabaseConfig): Promise<Result<DatabaseConnection, Error>> {
    const configKey = this.getConfigKey(config);

    const existingConnection = this.connections.get(configKey);
    if (existingConnection) {
      return ok(existingConnection);
    }

    const connectionResult = await createConnection(config);
    if (connectionResult.isErr()) {
      return err(connectionResult.error);
    }

    this.connections.set(configKey, connectionResult.value);
    return ok(connectionResult.value);
  }

  /**
   * Close all connections in the pool
   * @returns Result indicating success or failure
   */
  async closeAll(): Promise<Result<void, Error>> {
    const closePromises = Array.from(this.connections.values()).map(connection =>
      closeConnection(connection)
    );

    const results = await Promise.allSettled(closePromises);
    this.connections.clear();

    const errors = results
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .map(result => result.reason);

    if (errors.length > 0) {
      return err(new Error(`Failed to close some connections: ${errors.join(', ')}`));
    }

    return ok(undefined);
  }

  /**
   * Generate a unique key for database configuration
   * @param config - Database configuration
   * @returns Unique configuration key
   */
  private getConfigKey(config: DatabaseConfig): string {
    if (config.type === 'mysql') {
      if (config.connectionString) {
        return `mysql:${config.connectionString}`;
      }
      return `mysql://${config.user}@${config.host}:${config.port || 3306}/${config.database}`;
    }

    return `sqlite:${config.path}`;
  }
}

/**
 * Global connection pool instance
 */
const globalConnectionPool = new ConnectionPool();

/**
 * Create a new database connection
 * @param config - Database configuration
 * @returns Result containing database connection
 */
export const createConnection = async (
  config: DatabaseConfig
): Promise<Result<DatabaseConnection, Error>> => {
  return safeExecuteAsync(async () => {
    switch (config.type) {
      case 'mysql':
        const mysqlResult = await createMySQLConnection(config);
        if (mysqlResult.isErr()) {
          throw mysqlResult.error;
        }
        return mysqlResult.value;

      case 'sqlite':
        const sqliteResult = await createSQLiteConnection(config);
        if (sqliteResult.isErr()) {
          throw sqliteResult.error;
        }
        return sqliteResult.value;

      default:
        throw new Error(`Unsupported database type: ${(config as any).type}`);
    }
  }, 'Failed to create database connection');
};

/**
 * Execute a SQL query on a database connection
 * @param connection - Database connection
 * @param query - SQL query to execute
 * @param params - Query parameters
 * @param timeoutMs - Query timeout in milliseconds
 * @returns Result containing query results
 */
export const executeQuery = async (
  connection: DatabaseConnection,
  query: string,
  params: unknown[] = [],
  timeoutMs: number = DEFAULT_QUERY_TIMEOUT_MS
): Promise<Result<QueryResult, Error>> => {
  // Validate query is a SELECT statement
  const validationResult = validateSqlQuery(query);
  if (validationResult.isErr()) {
    return err(validationResult.error);
  }

  // Validate query is not empty
  const trimmedQuery = query.trim();
  const nonEmptyResult = validateNotEmpty(trimmedQuery, 'Query cannot be empty');
  if (nonEmptyResult.isErr()) {
    return err(nonEmptyResult.error);
  }

  // Check for multiple statements (basic SQL injection prevention)
  const statements = trimmedQuery.split(';').filter(s => s.trim().length > 0);
  if (statements.length > 1) {
    return err(new Error('Multiple statements are not allowed'));
  }

  return safeExecuteAsync(async () => {
    switch (connection.type) {
      case 'mysql':
        const mysqlResult = await executeMySQLQuery(connection, trimmedQuery, params, timeoutMs);
        if (mysqlResult.isErr()) {
          throw mysqlResult.error;
        }
        return mysqlResult.value;

      case 'sqlite':
        const sqliteResult = await executeSQLiteQuery(connection, trimmedQuery, params, timeoutMs);
        if (sqliteResult.isErr()) {
          throw sqliteResult.error;
        }
        return sqliteResult.value;

      default:
        throw new Error(`Unsupported connection type: ${(connection as any).type}`);
    }
  }, 'Query execution failed');
};

/**
 * Close a database connection
 * @param connection - Database connection to close
 * @returns Result indicating success or failure
 */
export const closeConnection = async (
  connection: DatabaseConnection
): Promise<Result<void, Error>> => {
  return safeExecuteAsync(async () => {
    switch (connection.type) {
      case 'mysql':
        const mysqlResult = await closeMySQLConnection(connection);
        if (mysqlResult.isErr()) {
          throw mysqlResult.error;
        }
        break;

      case 'sqlite':
        const sqliteResult = await closeSQLiteConnection(connection);
        if (sqliteResult.isErr()) {
          throw sqliteResult.error;
        }
        break;

      default:
        throw new Error(`Unsupported connection type: ${(connection as any).type}`);
    }
  }, 'Failed to close database connection');
};

/**
 * Get a connection from the global pool
 * @param config - Database configuration
 * @returns Result containing database connection
 */
export const getPooledConnection = async (
  config: DatabaseConfig
): Promise<Result<DatabaseConnection, Error>> => {
  return globalConnectionPool.getConnection(config);
};

/**
 * Close all pooled connections
 * @returns Result indicating success or failure
 */
export const closeAllPooledConnections = async (): Promise<Result<void, Error>> => {
  return globalConnectionPool.closeAll();
};

/**
 * Test database connection
 * @param config - Database configuration
 * @returns Result indicating connection success
 */
export const testConnection = async (
  config: DatabaseConfig
): Promise<Result<boolean, Error>> => {
  const connectionResult = await createConnection(config);
  if (connectionResult.isErr()) {
    return err(connectionResult.error);
  }

  const connection = connectionResult.value;

  try {
    // Execute a simple test query
    const testQuery = connection.type === 'mysql'
      ? 'SELECT 1 as test'
      : 'SELECT 1 as test';

    const queryResult = await executeQuery(connection, testQuery, [], 5000);

    if (queryResult.isErr()) {
      return err(queryResult.error);
    }

    return ok(true);
  } finally {
    // Always close the test connection
    await closeConnection(connection);
  }
};

/**
 * Get database version information
 * @param config - Database configuration
 * @returns Result containing version information
 */
export const getDatabaseVersion = async (
  config: DatabaseConfig
): Promise<Result<string, Error>> => {
  const connectionResult = await createConnection(config);
  if (connectionResult.isErr()) {
    return err(connectionResult.error);
  }

  const connection = connectionResult.value;

  try {
    const versionQuery = connection.type === 'mysql'
      ? 'SELECT VERSION() as version'
      : 'SELECT sqlite_version() as version';

    const queryResult = await executeQuery(connection, versionQuery, [], 5000);

    if (queryResult.isErr()) {
      return err(queryResult.error);
    }

    if (queryResult.value.rows.length === 0) {
      return err(new Error('No version information returned'));
    }

    const version = queryResult.value.rows[0][0] as string;
    return ok(version);
  } finally {
    await closeConnection(connection);
  }
};

/**
 * Execute a query with automatic connection management
 * @param config - Database configuration
 * @param query - SQL query to execute
 * @param params - Query parameters
 * @param timeoutMs - Query timeout in milliseconds
 * @returns Result containing query results
 */
export const executeQueryWithConnection = async (
  config: DatabaseConfig,
  query: string,
  params: unknown[] = [],
  timeoutMs: number = DEFAULT_QUERY_TIMEOUT_MS
): Promise<Result<QueryResult, Error>> => {
  const connectionResult = await getPooledConnection(config);
  if (connectionResult.isErr()) {
    return err(connectionResult.error);
  }

  return executeQuery(connectionResult.value, query, params, timeoutMs);
};

// Export the global connection pool for advanced usage (already exported above)