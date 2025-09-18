import { Result } from 'neverthrow';
import { QueryResult } from '../schemas/database';
import { safeExecuteAsync } from '../utils/result';

/**
 * Executes a promise with a timeout, racing between the original promise and timeout
 * @param promise - The promise to execute with timeout
 * @param timeoutMs - Timeout in milliseconds
 * @param timeoutErrorMessage - Error message to use when timeout occurs
 * @returns Promise that resolves with the original promise result or rejects on timeout
 */
export const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutErrorMessage: string
): Promise<T> => {
  let timeoutId: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error(timeoutErrorMessage)),
      timeoutMs
    );
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  });
};

/**
 * Builds a standardized QueryResult object from database results
 * @param columns - Array of column names
 * @param rows - Array of row data (each row is array of values)
 * @param startTime - Execution start time (from Date.now())
 * @returns QueryResult object with standardized structure
 */
export const buildQueryResult = (
  columns: string[],
  rows: unknown[][],
  startTime: number
): QueryResult => {
  return {
    columns,
    rows,
    rowCount: rows.length,
    truncated: false,
    executionTimeMs: Date.now() - startTime,
  };
};

/**
 * Transforms database-specific row data to standardized array format
 * @param rows - Array of database row objects
 * @param columns - Array of column names to extract
 * @returns Array of arrays where each inner array represents a row's values
 */
export const transformRowsToArrayFormat = (
  rows: Record<string, unknown>[],
  columns: string[]
): unknown[][] => {
  return rows.map((row) => columns.map((column) => row[column]));
};

/**
 * Executes a database operation with timing, timeout handling, and result transformation
 * @param operation - Function that performs the actual database operation
 * @param timeoutMs - Optional timeout in milliseconds
 * @param timeoutMessage - Error message for timeout (defaults to generic message)
 * @param errorContext - Context for error wrapping in safeExecuteAsync
 * @returns Result containing QueryResult or Error
 */
export const executeTimedQuery = async <TRawResult>(
  operation: () => Promise<TRawResult>,
  resultTransformer: (rawResult: TRawResult, startTime: number) => QueryResult,
  timeoutMs?: number,
  timeoutMessage?: string,
  errorContext?: string
): Promise<Result<QueryResult, Error>> => {
  const startTime = Date.now();

  return safeExecuteAsync(async () => {
    let operationPromise = operation();

    // Apply timeout if specified
    if (timeoutMs && timeoutMs > 0) {
      const defaultTimeoutMessage = `Query execution timeout after ${timeoutMs}ms`;
      operationPromise = withTimeout(
        operationPromise,
        timeoutMs,
        timeoutMessage || defaultTimeoutMessage
      );
    }

    const rawResult = await operationPromise;
    return resultTransformer(rawResult, startTime);
  }, errorContext || 'Database query execution failed');
};

/**
 * Common timeout handling for database operations with cleanup
 * @param promise - Promise to apply timeout to
 * @param timeoutMs - Timeout duration in milliseconds
 * @returns Promise that resolves or rejects based on race condition
 */
export const applyQueryTimeout = <T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<T> => {
  let timeoutId: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error(`Query execution timeout after ${timeoutMs}ms`)),
      timeoutMs
    );
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  });
};

/**
 * Creates an empty QueryResult for cases where no data is returned
 * @param startTime - Execution start time
 * @returns Empty QueryResult with timing information
 */
export const createEmptyQueryResult = (startTime: number): QueryResult => {
  return buildQueryResult([], [], startTime);
};
