import { z } from 'zod';
import { Result, ok, err } from 'neverthrow';

/**
 * Log level enumeration
 */
export const LogLevelSchema = z.enum(['debug', 'info', 'warn', 'error']);
export type LogLevel = z.infer<typeof LogLevelSchema>;

/**
 * MySQL database configuration schema
 */
const MySQLConfig = z.object({
  type: z.literal('mysql'),
  // Either connection string or individual connection parameters
  connectionString: z.string().url().optional(),
  host: z.string().min(1).optional(),
  port: z.number().int().positive().max(65535).optional(),
  user: z.string().min(1).optional(),
  password: z.string().optional(),
  database: z.string().min(1).optional(),
}).refine(
  (data) => {
    // Must have either connectionString or individual connection params
    const hasConnectionString = Boolean(data.connectionString);
    const hasIndividualParams = Boolean(data.host && data.user && data.database);
    return hasConnectionString || hasIndividualParams;
  },
  {
    message: 'Must provide either connectionString or host, user, and database',
  }
).refine(
  (data) => {
    // If connectionString is provided, it must be a valid MySQL URL
    if (data.connectionString) {
      return data.connectionString.startsWith('mysql://');
    }
    return true;
  },
  {
    message: 'MySQL connection string must start with mysql://',
  }
);

/**
 * SQLite database configuration schema
 */
const SQLiteConfig = z.object({
  type: z.literal('sqlite'),
  path: z.string().min(1),
});

/**
 * Database configuration schema (union of MySQL and SQLite)
 */
export const DatabaseConfigSchema = z.union([MySQLConfig, SQLiteConfig]);
export type DatabaseConfig = z.infer<typeof DatabaseConfigSchema>;

/**
 * Server configuration schema
 */
export const ServerConfigSchema = z.object({
  schemaDir: z.string().min(1, 'Schema directory path cannot be empty'),
  logLevel: LogLevelSchema.default('info'),
  database: DatabaseConfigSchema.optional(),
});
export type ServerConfig = z.infer<typeof ServerConfigSchema>;

/**
 * Validates server configuration using neverthrow Result
 * @param config - Configuration object to validate
 * @returns Result containing validated config or error message
 */
export const validateServerConfig = (
  config: unknown
): Result<ServerConfig, string> => {
  try {
    const validated = ServerConfigSchema.parse(config);
    return ok(validated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessage = `Server configuration validation failed: ${error.errors
        .map(e => `${e.path.join('.')}: ${e.message}`)
        .join(', ')}`;
      return err(errorMessage);
    }
    return err('Unknown validation error occurred');
  }
};

/**
 * Validates database configuration using neverthrow Result
 * @param config - Database configuration object to validate
 * @returns Result containing validated config or error message
 */
export const validateDatabaseConfig = (
  config: unknown
): Result<DatabaseConfig, string> => {
  try {
    const validated = DatabaseConfigSchema.parse(config);
    return ok(validated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessage = `Database configuration validation failed: ${error.errors
        .map(e => `${e.path.join('.')}: ${e.message}`)
        .join(', ')}`;
      return err(errorMessage);
    }
    return err('Unknown validation error occurred');
  }
};