#!/usr/bin/env node

import { promises as fs } from 'fs';
import { join } from 'path';
import { createTblsMcpServer } from './server.js';
import { ServerConfig, LogLevel, validateServerConfig } from './schemas/config.js';

/**
 * CLI argument interface
 */
interface CliArgs {
  schemaDir?: string;
  databaseUrl?: string;
  databaseType?: 'mysql' | 'sqlite';
  databasePath?: string;
  logLevel?: string;
  configFile?: string;
  help?: boolean;
  version?: boolean;
}

/**
 * Parse command line arguments
 */
const parseCliArgs = (): CliArgs => {
  const args: CliArgs = {};
  const argv = process.argv.slice(2);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const nextArg = argv[i + 1];

    switch (arg) {
      case '--schema-dir':
      case '-s':
        if (!nextArg || nextArg.startsWith('-')) {
          console.error('Error: --schema-dir requires a directory path');
          process.exit(1);
        }
        args.schemaDir = nextArg;
        i++;
        break;

      case '--database-url':
      case '-d':
        if (!nextArg || nextArg.startsWith('-')) {
          console.error('Error: --database-url requires a database URL');
          process.exit(1);
        }
        args.databaseUrl = nextArg;
        i++;
        break;

      case '--database-type':
        if (!nextArg || !['mysql', 'sqlite'].includes(nextArg)) {
          console.error('Error: --database-type must be either mysql or sqlite');
          process.exit(1);
        }
        args.databaseType = nextArg as 'mysql' | 'sqlite';
        i++;
        break;

      case '--database-path':
        if (!nextArg || nextArg.startsWith('-')) {
          console.error('Error: --database-path requires a file path');
          process.exit(1);
        }
        args.databasePath = nextArg;
        i++;
        break;

      case '--log-level':
      case '-l':
        if (!nextArg || nextArg.startsWith('-')) {
          console.error('Error: --log-level requires a log level');
          process.exit(1);
        }
        args.logLevel = nextArg;
        i++;
        break;

      case '--config':
      case '-c':
        if (!nextArg || nextArg.startsWith('-')) {
          console.error('Error: --config requires a config file path');
          process.exit(1);
        }
        args.configFile = nextArg;
        i++;
        break;

      case '--help':
      case '-h':
        args.help = true;
        break;

      case '--version':
      case '-v':
        args.version = true;
        break;

      default:
        if (arg.startsWith('-')) {
          console.error(`Error: Unknown option ${arg}`);
          showUsage();
          process.exit(1);
        }
        // Positional argument - treat as schema directory if not already set
        if (!args.schemaDir) {
          args.schemaDir = arg;
        } else {
          console.error(`Error: Unexpected positional argument: ${arg}`);
          process.exit(1);
        }
        break;
    }
  }

  return args;
};

/**
 * Show usage information
 */
const showUsage = (): void => {
  console.log(`
tbls-mcp-server - MCP server for tbls database schema information

USAGE:
  tbls-mcp-server [OPTIONS] [SCHEMA_DIR]

ARGUMENTS:
  SCHEMA_DIR              Directory containing tbls schema files

OPTIONS:
  -s, --schema-dir DIR    Directory containing tbls schema files
  -d, --database-url URL  Database connection URL (mysql://... or sqlite://...)
      --database-type TYPE Database type: mysql or sqlite
      --database-path PATH Path to SQLite database file (alternative to --database-url)
  -l, --log-level LEVEL   Log level: debug, info, warn, error (default: info)
  -c, --config FILE       Configuration file path (JSON format)
  -h, --help              Show this help message
  -v, --version           Show version information

EXAMPLES:
  # Basic usage with schema directory
  tbls-mcp-server /path/to/tbls/output

  # With MySQL database connection
  tbls-mcp-server --schema-dir /path/to/schema --database-url mysql://user:pass@localhost/db

  # With SQLite database
  tbls-mcp-server --schema-dir /path/to/schema --database-path /path/to/db.sqlite

  # With configuration file
  tbls-mcp-server --config /path/to/config.json

CONFIGURATION FILE FORMAT:
  {
    "schemaDir": "/path/to/tbls/output",
    "logLevel": "info",
    "database": {
      "type": "mysql",
      "connectionString": "mysql://user:pass@localhost/db"
    }
  }

ENVIRONMENT VARIABLES:
  TBLS_SCHEMA_DIR         Schema directory path
  TBLS_DATABASE_URL       Database connection URL
  TBLS_LOG_LEVEL          Log level
  TBLS_CONFIG_FILE        Configuration file path

Note: Command-line arguments take precedence over environment variables and config files.
`);
};

/**
 * Show version information
 */
const showVersion = async (): Promise<void> => {
  try {
    const packagePath = join(process.cwd(), 'package.json');
    const packageJson = JSON.parse(await fs.readFile(packagePath, 'utf-8'));
    console.log(`tbls-mcp-server v${packageJson.version}`);
  } catch {
    console.log('tbls-mcp-server v1.0.0');
  }
};

/**
 * Load configuration from file
 */
const loadConfigFile = async (configPath: string): Promise<Partial<ServerConfig> | null> => {
  try {
    const configContent = await fs.readFile(configPath, 'utf-8');
    return JSON.parse(configContent);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      console.warn(`Warning: Configuration file not found: ${configPath}`);
    } else {
      console.error(`Error loading configuration file: ${error instanceof Error ? error.message : error}`);
    }
    return null;
  }
};

/**
 * Get configuration from environment variables
 */
const getEnvConfig = (): Partial<ServerConfig> => {
  const config: Partial<ServerConfig> = {};

  if (process.env.TBLS_SCHEMA_DIR) {
    config.schemaDir = process.env.TBLS_SCHEMA_DIR;
  }

  if (process.env.TBLS_LOG_LEVEL) {
    config.logLevel = process.env.TBLS_LOG_LEVEL as LogLevel;
  }

  // Handle database configuration from environment
  if (process.env.TBLS_DATABASE_URL) {
    const url = process.env.TBLS_DATABASE_URL;
    if (url.startsWith('mysql://')) {
      config.database = {
        type: 'mysql',
        connectionString: url,
      };
    } else if (url.startsWith('sqlite://')) {
      config.database = {
        type: 'sqlite',
        path: url.replace('sqlite://', ''),
      };
    }
  }

  return config;
};

/**
 * Build server configuration from all sources
 */
const buildServerConfig = async (cliArgs: CliArgs): Promise<ServerConfig> => {
  // Start with defaults
  let config: Partial<ServerConfig> = {
    logLevel: 'info',
  };

  // Load configuration file if specified
  const configFilePath = cliArgs.configFile || process.env.TBLS_CONFIG_FILE || '.tbls-mcp-server.json';
  const fileConfig = await loadConfigFile(configFilePath);
  if (fileConfig) {
    config = { ...config, ...fileConfig };
  }

  // Apply environment variables
  const envConfig = getEnvConfig();
  config = { ...config, ...envConfig };

  // Apply CLI arguments (highest priority)
  if (cliArgs.schemaDir) {
    config.schemaDir = cliArgs.schemaDir;
  }

  if (cliArgs.logLevel) {
    config.logLevel = cliArgs.logLevel as LogLevel;
  }

  // Handle database configuration from CLI
  if (cliArgs.databaseUrl) {
    const url = cliArgs.databaseUrl;
    if (url.startsWith('mysql://')) {
      config.database = {
        type: 'mysql',
        connectionString: url,
      };
    } else if (url.startsWith('sqlite://')) {
      config.database = {
        type: 'sqlite',
        path: url.replace('sqlite://', ''),
      };
    } else {
      console.error('Error: Database URL must start with mysql:// or sqlite://');
      process.exit(1);
    }
  } else if (cliArgs.databaseType && cliArgs.databasePath) {
    if (cliArgs.databaseType === 'sqlite') {
      config.database = {
        type: 'sqlite',
        path: cliArgs.databasePath,
      };
    } else {
      console.error('Error: --database-path can only be used with --database-type sqlite');
      process.exit(1);
    }
  } else if (cliArgs.databaseType || cliArgs.databasePath) {
    console.error('Error: --database-type and --database-path must be used together, or use --database-url');
    process.exit(1);
  }

  // Validate the configuration
  const validationResult = validateServerConfig(config);
  if (validationResult.isErr()) {
    console.error('Configuration validation failed:');
    console.error(validationResult.error);
    process.exit(1);
  }

  return validationResult.value;
};

/**
 * Main entry point
 */
const main = async (): Promise<void> => {
  try {
    // Parse CLI arguments
    const cliArgs = parseCliArgs();

    // Handle help and version flags
    if (cliArgs.help) {
      showUsage();
      return;
    }

    if (cliArgs.version) {
      await showVersion();
      return;
    }

    // Build configuration
    const config = await buildServerConfig(cliArgs);

    // Set up logging level
    if (config.logLevel === 'debug') {
      console.error('Debug logging enabled');
      console.error('Configuration:', JSON.stringify(config, null, 2));
    }

    // Create and run the server
    const server = createTblsMcpServer(config);

    // Handle graceful shutdown
    const shutdown = async (): Promise<void> => {
      console.error('Shutting down tbls-mcp-server...');
      try {
        await server.close();
        process.exit(0);
      } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // Start the server
    await server.run();
  } catch (error) {
    console.error('Failed to start tbls-mcp-server:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
};

// Run the main function
main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});