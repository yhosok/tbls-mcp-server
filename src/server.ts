import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
  ReadResourceResult,
} from '@modelcontextprotocol/sdk/types.js';

import { ServerConfig } from './schemas/config.js';
import { handleSchemaListResource } from './resources/schema-resource.js';
import { handleSchemaTablesResource, handleTableInfoResource } from './resources/table-resource.js';
import { handleTableIndexesResource } from './resources/index-resource.js';
import { createSqlQueryTool, handleSqlQuery } from './tools/sql-query-tool.js';
import { validateSqlQueryRequest } from './schemas/database.js';
import { ResourceCache, ResourceCacheOptions } from './cache/resource-cache.js';
import { LazyResourceRegistry } from './server/lazy-resource-registry.js';

/**
 * Main MCP server class for tbls database schema information
 * Provides resource-based access to schema information and SQL query tools
 */
export class TblsMcpServer {
  private server: Server;
  private config: ServerConfig;
  private cache?: ResourceCache;
  private lazyRegistry: LazyResourceRegistry;

  constructor(config: ServerConfig) {
    this.config = config;

    // Initialize cache if enabled
    if (config.cache?.enabled !== false) {
      const cacheOptions: ResourceCacheOptions = {
        maxItems: config.cache?.maxItems ?? 1000,
        ttlMs: config.cache?.ttlMs ?? 300000, // 5 minutes default
      };
      this.cache = new ResourceCache(cacheOptions);
    }

    // Initialize lazy resource registry
    this.lazyRegistry = new LazyResourceRegistry({
      schemaDir: this.config.schemaDir,
      cache: this.cache,
      discoveryTtl: config.cache?.ttlMs ?? 300000
    });

    this.server = new Server(
      {
        name: 'tbls-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          resources: {},
          tools: this.config.database ? {} : undefined,
        },
      }
    );

    this.setupHandlers();
  }

  /**
   * Set up all MCP protocol handlers
   */
  private setupHandlers(): void {
    this.setupResourceHandlers();
    if (this.config.database) {
      this.setupToolHandlers();
    }
  }

  /**
   * Set up resource handlers for schema information using lazy loading
   */
  private setupResourceHandlers(): void {
    // List all available resources using lazy discovery
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      try {
        const resourcesResult = await this.lazyRegistry.listResources();
        if (resourcesResult.isErr()) {
          console.warn('Warning: Failed to list resources via lazy loading:', resourcesResult.error.message);
          // Fallback to basic static resources
          return {
            resources: [
              {
                uri: 'schema://list',
                mimeType: 'application/json',
                name: 'Database Schemas',
                description: 'List of all available database schemas with metadata',
              }
            ]
          };
        }

        return { resources: resourcesResult.value };
      } catch (error) {
        console.error('Error in ListResourcesRequest handler:', error);
        // Return minimal fallback resources
        return {
          resources: [
            {
              uri: 'schema://list',
              mimeType: 'application/json',
              name: 'Database Schemas',
              description: 'List of all available database schemas with metadata',
            }
          ]
        };
      }
    });

    // Handle resource reading with lazy discovery
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;

      try {
        // First, check if the URI matches any known pattern
        const match = this.lazyRegistry.matchUri(uri);
        if (!match) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            `Unknown resource URI: ${uri}`
          );
        }

        // For resources that aren't in the initial list, discover them on-demand
        const discoveredResource = await this.lazyRegistry.discoverResource(uri);
        if (discoveredResource.isErr()) {
          throw new McpError(
            ErrorCode.InternalError,
            `Failed to discover resource: ${discoveredResource.error.message}`
          );
        }

        // If resource doesn't exist, return appropriate error
        if (!discoveredResource.value) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            `Resource not found: ${uri}`
          );
        }

        // Now handle the actual resource content retrieval
        if (uri === 'schema://list') {
          return await this.handleSchemaListResource();
        }

        if (uri.startsWith('schema://') && uri.endsWith('/tables')) {
          return await this.handleSchemaTablesResource(uri);
        }

        if (uri.startsWith('table://') && !uri.endsWith('/indexes')) {
          return await this.handleTableInfoResource(uri);
        }

        if (uri.startsWith('table://') && uri.endsWith('/indexes')) {
          return await this.handleTableIndexesResource(uri);
        }

        throw new McpError(
          ErrorCode.InvalidRequest,
          `Unknown resource URI: ${uri}`
        );
      } catch (error) {
        if (error instanceof McpError) {
          throw error;
        }

        console.error('Error handling resource request:', error);
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to handle resource: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    });
  }

  /**
   * Set up tool handlers for SQL query execution
   */
  private setupToolHandlers(): void {
    if (!this.config.database) {
      return;
    }

    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const sqlTool = createSqlQueryTool(this.config.database!);
      return {
        tools: [sqlTool],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      if (name !== 'execute-sql') {
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${name}`
        );
      }

      if (!this.config.database) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          'SQL query tool is not available - no database configuration provided'
        );
      }

      try {
        // Validate the SQL query request
        const validationResult = validateSqlQueryRequest(args);
        if (validationResult.isErr()) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Invalid SQL query request: ${validationResult.error}`
          );
        }

        const sqlRequest = validationResult.value;

        // Execute the query
        const result = await handleSqlQuery(sqlRequest, this.config.database);

        if (result.isErr()) {
          throw new McpError(
            ErrorCode.InternalError,
            `SQL query failed: ${result.error.message}`
          );
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result.value, null, 2),
            },
          ],
        };
      } catch (error) {
        if (error instanceof McpError) {
          throw error;
        }

        console.error('Error executing SQL query:', error);
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to execute SQL query: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    });
  }

  /**
   * Handle schema://list resource
   */
  private async handleSchemaListResource(): Promise<ReadResourceResult> {
    const result = await handleSchemaListResource(this.config.schemaDir, this.cache);

    if (result.isErr()) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to list schemas: ${result.error.message}`
      );
    }

    return {
      contents: [
        {
          uri: 'schema://list',
          mimeType: 'application/json',
          text: JSON.stringify(result.value, null, 2),
        },
      ],
    };
  }

  /**
   * Handle schema://{schema_name}/tables resource
   */
  private async handleSchemaTablesResource(uri: string): Promise<ReadResourceResult> {
    // Parse schema name from URI: schema://schema_name/tables
    const match = uri.match(/^schema:\/\/([^/]+)\/tables$/);
    if (!match) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Invalid schema tables URI: ${uri}`
      );
    }

    const schemaName = match[1];
    const result = await handleSchemaTablesResource(this.config.schemaDir, schemaName, this.cache);

    if (result.isErr()) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get tables for schema ${schemaName}: ${result.error.message}`
      );
    }

    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(result.value, null, 2),
        },
      ],
    };
  }

  /**
   * Handle table://{schema}/{table} resource
   */
  private async handleTableInfoResource(uri: string): Promise<ReadResourceResult> {
    // Parse schema and table name from URI: table://schema_name/table_name
    const match = uri.match(/^table:\/\/([^/]+)\/([^/]+)$/);
    if (!match) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Invalid table info URI: ${uri}`
      );
    }

    const [, schemaName, tableName] = match;
    const result = await handleTableInfoResource(this.config.schemaDir, schemaName, tableName, this.cache);

    if (result.isErr()) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get table info for ${schemaName}.${tableName}: ${result.error.message}`
      );
    }

    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(result.value, null, 2),
        },
      ],
    };
  }

  /**
   * Handle table://{schema}/{table}/indexes resource
   */
  private async handleTableIndexesResource(uri: string): Promise<ReadResourceResult> {
    // Parse schema and table name from URI: table://schema_name/table_name/indexes
    const match = uri.match(/^table:\/\/([^/]+)\/([^/]+)\/indexes$/);
    if (!match) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Invalid table indexes URI: ${uri}`
      );
    }

    const [, schemaName, tableName] = match;
    const result = await handleTableIndexesResource(this.config.schemaDir, schemaName, tableName, this.cache);

    if (result.isErr()) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get indexes for table ${schemaName}.${tableName}: ${result.error.message}`
      );
    }

    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(result.value, null, 2),
        },
      ],
    };
  }

  /**
   * Connect and run the server
   */
  public async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    // Log successful startup
    console.error('tbls-mcp-server started successfully');
    if (this.config.database) {
      console.error('SQL query tool enabled');
    } else {
      console.error('SQL query tool disabled (no database configuration)');
    }
  }

  /**
   * Get cache statistics for monitoring
   * @returns Cache statistics object or null if cache is disabled
   */
  public getCacheStats(): { 
    resourceCache: { hits: number; misses: number; hitRate: number; size: number } | null;
    lazyRegistry: {
      discoveryCache: {
        size: number;
        entries: Array<{ patternId: string; age: number; resourceCount: number }>;
      };
      resourceCache?: {
        hits: number;
        misses: number;
        hitRate: number;
        size: number;
      };
    };
  } {
    return {
      resourceCache: this.cache?.getStats() ?? null,
      lazyRegistry: this.lazyRegistry.getCacheStats()
    };
  }

  /**
   * Close the server
   */
  public async close(): Promise<void> {
    // Clear cache before closing
    if (this.cache) {
      this.cache.clear();
    }

    // Clear lazy registry caches
    this.lazyRegistry.clearCaches();

    await this.server.close();
  }
}

/**
 * Create and configure a new tbls MCP server instance
 */
export const createTblsMcpServer = (config: ServerConfig): TblsMcpServer => {
  return new TblsMcpServer(config);
};