import { Result, ok, err } from 'neverthrow';

/**
 * Safely executes a function and wraps the result in a Result type
 * @param fn - Function to execute safely
 * @param errorMessage - Custom error message prefix
 * @returns Result containing the function result or error
 */
export const safeExecute = <T>(
  fn: () => T,
  errorMessage = 'Operation failed'
): Result<T, Error> => {
  try {
    const result = fn();
    return ok(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return err(new Error(`${errorMessage}: ${message}`));
  }
};

/**
 * Safely executes an async function and wraps the result in a Result type
 * @param fn - Async function to execute safely
 * @param errorMessage - Custom error message prefix
 * @returns Promise<Result> containing the function result or error
 */
export const safeExecuteAsync = async <T>(
  fn: () => Promise<T>,
  errorMessage = 'Async operation failed'
): Promise<Result<T, Error>> => {
  try {
    const result = await fn();
    return ok(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return err(new Error(`${errorMessage}: ${message}`));
  }
};

/**
 * Maps an array of Results to a Result containing an array
 * Fails fast if any Result is an error
 * @param results - Array of Result objects
 * @returns Result containing array of values or first error encountered
 */
export const combineResults = <T, E>(results: Result<T, E>[]): Result<T[], E> => {
  const values: T[] = [];

  for (const result of results) {
    if (result.isErr()) {
      return err(result.error);
    }
    values.push(result.value);
  }

  return ok(values);
};

/**
 * Maps a Result to a new Result type using a transformation function
 * @param result - Source Result
 * @param mapper - Function to transform the success value
 * @returns New Result with transformed value or original error
 */
export const mapResult = <T, U, E>(
  result: Result<T, E>,
  mapper: (value: T) => U
): Result<U, E> => {
  return result.map(mapper);
};

/**
 * Maps a Result to a new Result type using a transformation function that can fail
 * @param result - Source Result
 * @param mapper - Function to transform the success value, returning a Result
 * @returns New Result with transformed value or error from transformation
 */
export const flatMapResult = <T, U, E>(
  result: Result<T, E>,
  mapper: (value: T) => Result<U, E>
): Result<U, E> => {
  return result.andThen(mapper);
};

/**
 * Filters a successful Result value, converting to error if predicate fails
 * @param result - Source Result
 * @param predicate - Function to test the value
 * @param errorMsg - Error message if predicate fails
 * @returns Result that passes predicate or error
 */
export const filterResult = <T, E>(
  result: Result<T, E>,
  predicate: (value: T) => boolean,
  errorMsg: string
): Result<T, E | Error> => {
  if (result.isErr()) {
    return err(result.error);
  }

  if (predicate(result.value)) {
    return ok(result.value);
  }

  return err(new Error(errorMsg));
};

/**
 * Validates that a value is not null or undefined
 * @param value - Value to check
 * @param errorMsg - Error message if value is null/undefined
 * @returns Result containing the value or error
 */
export const validateNotNull = <T>(
  value: T | null | undefined,
  errorMsg = 'Value is null or undefined'
): Result<NonNullable<T>, Error> => {
  if (value == null) {
    return err(new Error(errorMsg));
  }
  return ok(value as NonNullable<T>);
};

/**
 * Validates that a string is not empty
 * @param value - String to check
 * @param errorMsg - Error message if string is empty
 * @returns Result containing the string or error
 */
export const validateNotEmpty = (
  value: string,
  errorMsg = 'String is empty'
): Result<string, Error> => {
  if (!value || value.trim().length === 0) {
    return err(new Error(errorMsg));
  }
  return ok(value);
};

/**
 * Validates that an array is not empty
 * @param value - Array to check
 * @param errorMsg - Error message if array is empty
 * @returns Result containing the array or error
 */
export const validateNotEmptyArray = <T>(
  value: T[],
  errorMsg = 'Array is empty'
): Result<T[], Error> => {
  if (!Array.isArray(value) || value.length === 0) {
    return err(new Error(errorMsg));
  }
  return ok(value);
};

/**
 * Creates a Result from a nullable value
 * @param value - Nullable value
 * @param errorMsg - Error message if value is null
 * @returns Result containing the value or error
 */
export const fromNullable = <T>(
  value: T | null | undefined,
  errorMsg = 'Value is null'
): Result<T, Error> => {
  return value != null ? ok(value) : err(new Error(errorMsg));
};

/**
 * Converts a Promise to a Result, catching any errors
 * @param promise - Promise to convert
 * @param errorMessage - Custom error message prefix
 * @returns Promise<Result> containing the resolved value or error
 */
export const fromPromise = async <T>(
  promise: Promise<T>,
  errorMessage = 'Promise rejected'
): Promise<Result<T, Error>> => {
  try {
    const result = await promise;
    return ok(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return err(new Error(`${errorMessage}: ${message}`));
  }
};

/**
 * Creates an error Result with a formatted message
 * @param message - Error message template
 * @param args - Arguments for message formatting
 * @returns Error Result with formatted message
 */
export const createError = (message: string, ...args: unknown[]): Result<never, Error> => {
  const formattedMessage = args.length > 0
    ? message.replace(/\{(\d+)\}/g, (match, index) => String(args[parseInt(index)] ?? match))
    : message;

  return err(new Error(formattedMessage));
};

/**
 * Validates that a value matches a regular expression
 * @param value - String value to test
 * @param regex - Regular expression to match against
 * @param errorMsg - Error message if pattern doesn't match
 * @returns Result containing the value or error
 */
export const validatePattern = (
  value: string,
  regex: RegExp,
  errorMsg = 'Value does not match expected pattern'
): Result<string, Error> => {
  if (!regex.test(value)) {
    return err(new Error(errorMsg));
  }
  return ok(value);
};

/**
 * Retries a function that returns a Result a specified number of times
 * @param fn - Function to retry
 * @param retries - Number of retry attempts
 * @param delay - Delay between retries in milliseconds
 * @returns Result from the last attempt
 */
export const retry = async <T, E>(
  fn: () => Result<T, E> | Promise<Result<T, E>>,
  retries: number,
  delay = 0
): Promise<Result<T, E>> => {
  let lastResult: Result<T, E>;

  for (let i = 0; i <= retries; i++) {
    lastResult = await fn();

    if (lastResult.isOk()) {
      return lastResult;
    }

    if (i < retries && delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  return lastResult!;
};