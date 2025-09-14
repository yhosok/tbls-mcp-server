import { Result, err } from 'neverthrow';
import mysql from 'mysql2';
import { DatabaseConfig } from '../schemas/config';
import { QueryResult } from '../schemas/database';
import { safeExecuteAsync, fromPromise } from '../utils/result';

/**
 * MySQL connection type
 */
export interface MySQLConnection {
  type: 'mysql';
  pool: mysql.Pool;
}

/**
 * MySQL connection pool configuration
 */
export interface MySQLPoolConfig {
  connectionLimit?: number;
  queueLimit?: number;
  acquireTimeout?: number;
  timeout?: number;
}

/**
 * Default MySQL pool configuration
 */
const DEFAULT_POOL_CONFIG: MySQLPoolConfig = {
  connectionLimit: 10,
  queueLimit: 0,
  acquireTimeout: 30000,
  timeout: 30000,
};

/**
 * Create a MySQL database connection
 * @param config - Database configuration
 * @param poolConfig - Connection pool configuration
 * @returns Result containing MySQL connection
 */
export const createMySQLConnection = async (
  config: DatabaseConfig & { type: 'mysql' },
  poolConfig: MySQLPoolConfig = DEFAULT_POOL_CONFIG
): Promise<Result<MySQLConnection, Error>> => {
  if (config.type !== 'mysql') {
    return err(new Error('Configuration is not for MySQL database'));
  }

  return safeExecuteAsync(async () => {
    let poolOptions: mysql.PoolOptions;

    if (config.connectionString) {
      // Use connection string
      poolOptions = {
        uri: config.connectionString,
        waitForConnections: true,
        connectionLimit: poolConfig.connectionLimit ?? DEFAULT_POOL_CONFIG.connectionLimit,
        queueLimit: poolConfig.queueLimit ?? DEFAULT_POOL_CONFIG.queueLimit,
        // acquireTimeout: poolConfig.acquireTimeout ?? DEFAULT_POOL_CONFIG.acquireTimeout, // Not supported in all versions
        // timeout: poolConfig.timeout ?? DEFAULT_POOL_CONFIG.timeout, // Not supported in all versions
        // reconnect: true, // Not supported in all versions
        multipleStatements: false, // Security: prevent multiple statements
      };
    } else {
      // Use individual connection parameters
      if (!config.host || !config.user || !config.database) {
        throw new Error('MySQL configuration must include host, user, and database');
      }

      poolOptions = {
        host: config.host,
        port: config.port ?? 3306,
        user: config.user,
        password: config.password ?? '',
        database: config.database,
        waitForConnections: true,
        connectionLimit: poolConfig.connectionLimit ?? DEFAULT_POOL_CONFIG.connectionLimit,
        queueLimit: poolConfig.queueLimit ?? DEFAULT_POOL_CONFIG.queueLimit,
        // acquireTimeout: poolConfig.acquireTimeout ?? DEFAULT_POOL_CONFIG.acquireTimeout, // Not supported in all versions
        // timeout: poolConfig.timeout ?? DEFAULT_POOL_CONFIG.timeout, // Not supported in all versions
        // reconnect: true, // Not supported in all versions
        multipleStatements: false, // Security: prevent multiple statements
      };
    }

    const pool = mysql.createPool(poolOptions);

    // Validate connection by executing a test query
    try {
      const promisePool = pool.promise();
      await promisePool.execute('SELECT 1');
    } catch (error) {
      pool.end();
      throw new Error(`MySQL connection validation failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    return {
      type: 'mysql' as const,
      pool,
    };
  }, 'Failed to create MySQL connection');
};

/**
 * Execute a SQL query on MySQL connection
 * @param connection - MySQL connection
 * @param query - SQL query to execute
 * @param params - Query parameters
 * @param timeoutMs - Query timeout in milliseconds
 * @returns Result containing query results
 */
export const executeMySQLQuery = async (
  connection: MySQLConnection,
  query: string,
  params: unknown[] = [],
  timeoutMs?: number
): Promise<Result<QueryResult, Error>> => {
  const startTime = Date.now();

  return safeExecuteAsync(async () => {
    const promisePool = connection.pool.promise();

    let queryPromise = promisePool.execute(query, params) as Promise<[mysql.RowDataPacket[], mysql.FieldPacket[]]>;

    // Apply timeout if specified
    if (timeoutMs && timeoutMs > 0) {
      queryPromise = Promise.race([
        queryPromise,
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(`Query execution timeout after ${timeoutMs}ms`)), timeoutMs);
        })
      ]);
    }

    const [rows, fields] = await queryPromise;
    const executionTimeMs = Date.now() - startTime;

    // Extract column names from fields
    const columns = fields.map(field => field.name);

    // Convert rows to array format
    const resultRows = rows.map(row => {
      return columns.map(column => row[column]);
    });

    const result: QueryResult = {
      columns,
      rows: resultRows,
      rowCount: rows.length,
      executionTimeMs,
    };

    return result;
  }, 'MySQL query execution failed');
};

/**
 * Close MySQL connection
 * @param connection - MySQL connection to close
 * @returns Result indicating success or failure
 */
export const closeMySQLConnection = async (
  connection: MySQLConnection
): Promise<Result<void, Error>> => {
  return safeExecuteAsync(async () => {
    await fromPromise(
      new Promise<void>((resolve, reject) => {
        connection.pool.end((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      }),
      'Failed to close MySQL pool'
    ).then(result => {
      if (result.isErr()) {
        throw result.error;
      }
    });
  }, 'Failed to close MySQL connection');
};

/**
 * Get MySQL connection information
 * @param connection - MySQL connection
 * @returns Result containing connection info
 */
export const getMySQLConnectionInfo = async (
  connection: MySQLConnection
): Promise<Result<{ serverVersion: string; connectionId: number }, Error>> => {
  return safeExecuteAsync(async () => {
    const promisePool = connection.pool.promise();
    const [rows] = await promisePool.execute('SELECT VERSION() as version, CONNECTION_ID() as connection_id') as [mysql.RowDataPacket[], mysql.FieldPacket[]];

    if (rows.length === 0) {
      throw new Error('No connection info returned');
    }

    const row = rows[0];
    return {
      serverVersion: row.version as string,
      connectionId: row.connection_id as number,
    };
  }, 'Failed to get MySQL connection info');
};

/**
 * Check if MySQL connection is alive
 * @param connection - MySQL connection
 * @returns Result indicating if connection is alive
 */
export const isMySQLConnectionAlive = async (
  connection: MySQLConnection
): Promise<Result<boolean, Error>> => {
  return safeExecuteAsync(async () => {
    const promisePool = connection.pool.promise();

    try {
      await promisePool.execute('SELECT 1');
      return true;
    } catch (error) {
      return false;
    }
  }, 'Failed to check MySQL connection status');
};

/**
 * Get MySQL database schema information
 * @param connection - MySQL connection
 * @param databaseName - Database name
 * @returns Result containing schema info
 */
export const getMySQLSchemaInfo = async (
  connection: MySQLConnection,
  databaseName: string
): Promise<Result<{ tables: string[]; views: string[] }, Error>> => {
  return safeExecuteAsync(async () => {
    const promisePool = connection.pool.promise();

    const [tableRows] = await promisePool.execute(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = ?
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `, [databaseName]) as [mysql.RowDataPacket[], mysql.FieldPacket[]];

    const [viewRows] = await promisePool.execute(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = ?
        AND table_type = 'VIEW'
      ORDER BY table_name
    `, [databaseName]) as [mysql.RowDataPacket[], mysql.FieldPacket[]];

    return {
      tables: tableRows.map(row => row.table_name as string),
      views: viewRows.map(row => row.table_name as string),
    };
  }, 'Failed to get MySQL schema info');
};

/**
 * Execute a MySQL query with retries
 * @param connection - MySQL connection
 * @param query - SQL query to execute
 * @param params - Query parameters
 * @param maxRetries - Maximum number of retries
 * @param retryDelay - Delay between retries in milliseconds
 * @returns Result containing query results
 */
export const executeMySQLQueryWithRetry = async (
  connection: MySQLConnection,
  query: string,
  params: unknown[] = [],
  maxRetries: number = 3,
  retryDelay: number = 1000
): Promise<Result<QueryResult, Error>> => {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await executeMySQLQuery(connection, query, params);

    if (result.isOk()) {
      return result;
    }

    lastError = result.error;

    // Don't retry on certain types of errors
    const errorMessage = lastError.message.toLowerCase();
    if (errorMessage.includes('syntax') ||
        errorMessage.includes('unknown column') ||
        errorMessage.includes('unknown table')) {
      break;
    }

    if (attempt < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }

  return err(new Error(`Query failed after ${maxRetries + 1} attempts: ${lastError?.message || 'Unknown error'}`));
};

/**
 * Prepare and execute a MySQL statement
 * @param connection - MySQL connection
 * @param query - SQL query with placeholders
 * @param params - Parameters for the prepared statement
 * @returns Result containing query results
 */
export const executeMySQLPreparedStatement = async (
  connection: MySQLConnection,
  query: string,
  params: unknown[] = []
): Promise<Result<QueryResult, Error>> => {
  const startTime = Date.now();

  return safeExecuteAsync(async () => {
    const promisePool = connection.pool.promise();

    // Use the execute method which automatically prepares the statement
    const [rows, fields] = await promisePool.execute(query, params) as [mysql.RowDataPacket[], mysql.FieldPacket[]];
    const executionTimeMs = Date.now() - startTime;

    const columns = fields.map(field => field.name);
    const resultRows = rows.map(row => columns.map(column => row[column]));

    return {
      columns,
      rows: resultRows,
      rowCount: rows.length,
      executionTimeMs,
    };
  }, 'MySQL prepared statement execution failed');
};