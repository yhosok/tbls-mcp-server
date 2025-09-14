import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { ServerConfig } from './schemas/config.js';
import { handleSchemaListResource } from './resources/schema-resource.js';
import { handleSchemaTablesResource, handleTableInfoResource } from './resources/table-resource.js';
import { handleTableIndexesResource } from './resources/index-resource.js';
import { createSqlQueryTool, handleSqlQuery } from './tools/sql-query-tool.js';
import { validateSqlQueryRequest } from './schemas/database.js';

/**
 * Main MCP server class for tbls database schema information
 * Provides resource-based access to schema information and SQL query tools
 */
export class TblsMcpServer {
  private server: Server;
  private config: ServerConfig;

  constructor(config: ServerConfig) {
    this.config = config;
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
   * Set up resource handlers for schema information
   */
  private setupResourceHandlers(): void {
    // List all available resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      const resources = [
        {
          uri: 'schema://list',
          mimeType: 'application/json',
          name: 'Database Schemas',
          description: 'List of all available database schemas with metadata',
        },
      ];

      // Add schema-specific table resources (discovered dynamically)
      try {
        const schemaListResult = await handleSchemaListResource(this.config.schemaDir);
        if (schemaListResult.isOk()) {
          const schemas = schemaListResult.value.schemas;

          for (const schema of schemas) {
            // Add tables resource for each schema
            resources.push({
              uri: `schema://${schema.name}/tables`,
              mimeType: 'application/json',
              name: `${schema.name} Schema Tables`,
              description: `List of tables in the ${schema.name} schema`,
            });

            // Note: Individual table and index resources are discovered dynamically
            // when tables are listed, so we don't add them here to avoid pre-scanning
            // all tables, which could be expensive for large schemas
          }
        }
      } catch (error) {
        // Log warning but don't fail - dynamic discovery will still work
        console.warn('Warning: Could not pre-discover schema resources:', error);
      }

      return { resources };
    });

    // Handle resource reading
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;

      try {
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
  private async handleSchemaListResource() {
    const result = await handleSchemaListResource(this.config.schemaDir);

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
  private async handleSchemaTablesResource(uri: string) {
    // Parse schema name from URI: schema://schema_name/tables
    const match = uri.match(/^schema:\/\/([^\/]+)\/tables$/);
    if (!match) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Invalid schema tables URI: ${uri}`
      );
    }

    const schemaName = match[1];
    const result = await handleSchemaTablesResource(this.config.schemaDir, schemaName);

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
  private async handleTableInfoResource(uri: string) {
    // Parse schema and table name from URI: table://schema_name/table_name
    const match = uri.match(/^table:\/\/([^\/]+)\/([^\/]+)$/);
    if (!match) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Invalid table info URI: ${uri}`
      );
    }

    const [, schemaName, tableName] = match;
    const result = await handleTableInfoResource(this.config.schemaDir, schemaName, tableName);

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
  private async handleTableIndexesResource(uri: string) {
    // Parse schema and table name from URI: table://schema_name/table_name/indexes
    const match = uri.match(/^table:\/\/([^\/]+)\/([^\/]+)\/indexes$/);
    if (!match) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Invalid table indexes URI: ${uri}`
      );
    }

    const [, schemaName, tableName] = match;
    const result = await handleTableIndexesResource(this.config.schemaDir, schemaName, tableName);

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
   * Close the server
   */
  public async close(): Promise<void> {
    await this.server.close();
  }
}

/**
 * Create and configure a new tbls MCP server instance
 */
export const createTblsMcpServer = (config: ServerConfig): TblsMcpServer => {
  return new TblsMcpServer(config);
};