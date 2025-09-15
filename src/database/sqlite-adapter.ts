import { Result, err } from 'neverthrow';
import sqlite3 from 'sqlite3';
import { DatabaseConfig } from '../schemas/config';
import { QueryResult } from '../schemas/database';
import { safeExecuteAsync } from '../utils/result';

// Types for SQLite callback results
interface SQLiteVersionRow {
  version: string;
}

interface SQLiteMasterRow {
  name: string;
  type: 'table' | 'view' | 'index';
}

interface SQLiteTableInfoRow {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | number | null;
  pk: number;
}

type SQLiteRowValue = string | number | null;
type SQLiteRow = Record<string, SQLiteRowValue>;

/**
 * SQLite connection type
 */
export interface SQLiteConnection {
  type: 'sqlite';
  database: sqlite3.Database;
}

/**
 * SQLite connection options
 */
export interface SQLiteConnectionOptions {
  readonly?: boolean;
  verbose?: boolean;
  timeout?: number;
}

/**
 * Default SQLite connection timeout in milliseconds
 */
const DEFAULT_TIMEOUT_MS = 30000;

/**
 * Create a SQLite database connection
 * @param config - Database configuration
 * @param options - Connection options
 * @returns Result containing SQLite connection
 */
export const createSQLiteConnection = async (
  config: DatabaseConfig & { type: 'sqlite' },
  options: SQLiteConnectionOptions = {}
): Promise<Result<SQLiteConnection, Error>> => {
  if (config.type !== 'sqlite') {
    return err(new Error('Configuration is not for SQLite database'));
  }

  return safeExecuteAsync(async () => {
    const SQLite = options.verbose ? sqlite3.verbose() : sqlite3;

    const database = await new Promise<sqlite3.Database>((resolve, reject) => {
      const mode = options.readonly
        ? sqlite3.OPEN_READONLY
        : sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE;

      const db = new SQLite.Database(config.path, mode, (error) => {
        if (error) {
          reject(new Error(`Failed to open SQLite database: ${error.message}`));
        } else {
          resolve(db);
        }
      });
    });

    // Validate connection by executing a test query
    await new Promise<void>((resolve, reject) => {
      database.get('SELECT sqlite_version() as version', (error, _row) => {
        if (error) {
          database.close();
          reject(
            new Error(`SQLite connection validation failed: ${error.message}`)
          );
        } else {
          resolve();
        }
      });
    });

    return {
      type: 'sqlite' as const,
      database,
    };
  }, 'Failed to create SQLite connection');
};

/**
 * Execute a SQL query on SQLite connection
 * @param connection - SQLite connection
 * @param query - SQL query to execute
 * @param params - Query parameters
 * @param timeoutMs - Query timeout in milliseconds
 * @returns Result containing query results
 */
export const executeSQLiteQuery = async (
  connection: SQLiteConnection,
  query: string,
  params: unknown[] = [],
  timeoutMs?: number
): Promise<Result<QueryResult, Error>> => {
  const startTime = Date.now();

  return safeExecuteAsync(async () => {
    const timeout = timeoutMs ?? DEFAULT_TIMEOUT_MS;

    const queryPromise = new Promise<QueryResult>((resolve, reject) => {
      const callback = (error: Error | null, rows: SQLiteRow[]): void => {
        if (error) {
          reject(new Error(`SQLite query execution failed: ${error.message}`));
          return;
        }

        const executionTimeMs = Date.now() - startTime;

        // Handle empty result set
        if (!rows || rows.length === 0) {
          resolve({
            columns: [],
            rows: [],
            rowCount: 0,
            executionTimeMs,
          });
          return;
        }

        // Extract column names from the first row
        const columns = Object.keys(rows[0]);

        // Convert rows to array format
        const resultRows = rows.map((row) => {
          return columns.map((column) => row[column]);
        });

        resolve({
          columns,
          rows: resultRows,
          rowCount: rows.length,
          executionTimeMs,
        });
      };

      // Execute query with or without parameters
      if (params.length === 0) {
        connection.database.all(query, callback);
      } else {
        connection.database.all(query, params, callback);
      }
    });

    // Apply timeout if specified
    if (timeout > 0) {
      let timeoutId: NodeJS.Timeout;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error(`Query execution timeout after ${timeout}ms`)),
          timeout
        );
      });

      return Promise.race([queryPromise, timeoutPromise]).finally(() => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      });
    }

    return queryPromise;
  }, 'SQLite query execution failed');
};

/**
 * Close SQLite connection
 * @param connection - SQLite connection to close
 * @param timeoutMs - Close timeout in milliseconds
 * @returns Result indicating success or failure
 */
export const closeSQLiteConnection = async (
  connection: SQLiteConnection,
  timeoutMs: number = 5000
): Promise<Result<void, Error>> => {
  return safeExecuteAsync(async () => {
    const closePromise = new Promise<void>((resolve, reject) => {
      connection.database.close((error) => {
        if (error) {
          reject(
            new Error(`Failed to close SQLite connection: ${error.message}`)
          );
        } else {
          resolve();
        }
      });
    });

    // Apply timeout to close operation
    let timeoutId: NodeJS.Timeout;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        () =>
          reject(new Error(`Connection close timeout after ${timeoutMs}ms`)),
        timeoutMs
      );
    });

    await Promise.race([closePromise, timeoutPromise]).finally(() => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    });
  }, 'Failed to close SQLite connection');
};

/**
 * Get SQLite database information
 * @param connection - SQLite connection
 * @returns Result containing database info
 */
export const getSQLiteInfo = async (
  connection: SQLiteConnection
): Promise<Result<{ version: string; filename: string }, Error>> => {
  return safeExecuteAsync(async () => {
    const info = await new Promise<{ version: string; filename: string }>(
      (resolve, reject) => {
        connection.database.get(
          'SELECT sqlite_version() as version',
          (error: Error | null, row: SQLiteVersionRow) => {
            if (error) {
              reject(error);
              return;
            }

            // Get database filename from the connection
            const filename =
              (connection.database as sqlite3.Database & { filename?: string })
                .filename || ':memory:';

            resolve({
              version: row.version,
              filename,
            });
          }
        );
      }
    );

    return info;
  }, 'Failed to get SQLite info');
};

/**
 * Check if SQLite connection is alive
 * @param connection - SQLite connection
 * @returns Result indicating if connection is alive
 */
export const isSQLiteConnectionAlive = async (
  connection: SQLiteConnection
): Promise<Result<boolean, Error>> => {
  return safeExecuteAsync(async () => {
    try {
      await new Promise<void>((resolve, reject) => {
        connection.database.get('SELECT 1', (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
      return true;
    } catch {
      return false;
    }
  }, 'Failed to check SQLite connection status');
};

/**
 * Get SQLite database schema information
 * @param connection - SQLite connection
 * @returns Result containing schema info
 */
export const getSQLiteSchemaInfo = async (
  connection: SQLiteConnection
): Promise<
  Result<{ tables: string[]; views: string[]; indexes: string[] }, Error>
> => {
  return safeExecuteAsync(async () => {
    const schema = await new Promise<{
      tables: string[];
      views: string[];
      indexes: string[];
    }>((resolve, reject) => {
      connection.database.all(
        `SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view', 'index') ORDER BY type, name`,
        (error: Error | null, rows: SQLiteMasterRow[]) => {
          if (error) {
            reject(error);
            return;
          }

          const tables = rows
            .filter(
              (row) => row.type === 'table' && !row.name.startsWith('sqlite_')
            )
            .map((row) => row.name);
          const views = rows
            .filter((row) => row.type === 'view')
            .map((row) => row.name);
          const indexes = rows
            .filter((row) => row.type === 'index')
            .map((row) => row.name);

          resolve({ tables, views, indexes });
        }
      );
    });

    return schema;
  }, 'Failed to get SQLite schema info');
};

/**
 * Get table information from SQLite database
 * @param connection - SQLite connection
 * @param tableName - Table name
 * @returns Result containing table info
 */
export const getSQLiteTableInfo = async (
  connection: SQLiteConnection,
  tableName: string
): Promise<Result<SQLiteTableInfoRow[], Error>> => {
  return safeExecuteAsync(async () => {
    const tableInfo = await new Promise<SQLiteTableInfoRow[]>(
      (resolve, reject) => {
        connection.database.all(
          `PRAGMA table_info(${tableName})`,
          (error: Error | null, rows: SQLiteTableInfoRow[]) => {
            if (error) {
              reject(error);
            } else {
              resolve(rows);
            }
          }
        );
      }
    );

    return tableInfo;
  }, `Failed to get table info for ${tableName}`);
};

/**
 * Execute a SQLite transaction
 * @param connection - SQLite connection
 * @param queries - Array of queries to execute in transaction
 * @returns Result indicating success or failure
 */
export const executeSQLiteTransaction = async (
  connection: SQLiteConnection,
  queries: Array<{ query: string; params?: unknown[] }>
): Promise<Result<void, Error>> => {
  return safeExecuteAsync(async () => {
    await new Promise<void>((resolve, reject) => {
      connection.database.serialize(() => {
        connection.database.run('BEGIN TRANSACTION', (error) => {
          if (error) {
            reject(error);
            return;
          }

          let completed = 0;
          let hasError = false;

          const complete = (error?: Error): void => {
            if (hasError) return;

            if (error) {
              hasError = true;
              connection.database.run('ROLLBACK', () => {
                reject(error);
              });
              return;
            }

            completed++;
            if (completed === queries.length) {
              connection.database.run('COMMIT', (commitError) => {
                if (commitError) {
                  reject(commitError);
                } else {
                  resolve();
                }
              });
            }
          };

          if (queries.length === 0) {
            connection.database.run('COMMIT', (commitError) => {
              if (commitError) {
                reject(commitError);
              } else {
                resolve();
              }
            });
            return;
          }

          queries.forEach(({ query, params = [] }) => {
            connection.database.run(query, params, complete);
          });
        });
      });
    });
  }, 'SQLite transaction failed');
};

/**
 * Execute SQLite query with retry logic
 * @param connection - SQLite connection
 * @param query - SQL query to execute
 * @param params - Query parameters
 * @param maxRetries - Maximum number of retries
 * @param retryDelay - Delay between retries in milliseconds
 * @returns Result containing query results
 */
export const executeSQLiteQueryWithRetry = async (
  connection: SQLiteConnection,
  query: string,
  params: unknown[] = [],
  maxRetries: number = 3,
  retryDelay: number = 1000
): Promise<Result<QueryResult, Error>> => {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await executeSQLiteQuery(connection, query, params);

    if (result.isOk()) {
      return result;
    }

    lastError = result.error;

    // Don't retry on certain types of errors
    const errorMessage = lastError.message.toLowerCase();
    if (
      errorMessage.includes('syntax') ||
      errorMessage.includes('no such column') ||
      errorMessage.includes('no such table')
    ) {
      break;
    }

    // Retry on database busy errors
    if (
      errorMessage.includes('database is locked') ||
      errorMessage.includes('busy')
    ) {
      if (attempt < maxRetries) {
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
 * Enable SQLite WAL mode for better concurrent access
 * @param connection - SQLite connection
 * @returns Result indicating success or failure
 */
export const enableSQLiteWALMode = async (
  connection: SQLiteConnection
): Promise<Result<void, Error>> => {
  return safeExecuteAsync(async () => {
    await new Promise<void>((resolve, reject) => {
      connection.database.run('PRAGMA journal_mode=WAL', (error) => {
        if (error) {
          reject(new Error(`Failed to enable WAL mode: ${error.message}`));
        } else {
          resolve();
        }
      });
    });
  }, 'Failed to enable SQLite WAL mode');
};

/**
 * Set SQLite busy timeout
 * @param connection - SQLite connection
 * @param timeoutMs - Timeout in milliseconds
 * @returns Result indicating success or failure
 */
export const setSQLiteBusyTimeout = async (
  connection: SQLiteConnection,
  timeoutMs: number
): Promise<Result<void, Error>> => {
  return safeExecuteAsync(async () => {
    await new Promise<void>((resolve, reject) => {
      connection.database.run(`PRAGMA busy_timeout=${timeoutMs}`, (error) => {
        if (error) {
          reject(new Error(`Failed to set busy timeout: ${error.message}`));
        } else {
          resolve();
        }
      });
    });
  }, 'Failed to set SQLite busy timeout');
};
