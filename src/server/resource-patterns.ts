/**
 * Resource pattern system for lazy loading of MCP resources
 *
 * This module defines patterns for different resource types and provides
 * matching and generation utilities for dynamic resource discovery.
 */

import { Result, ok, err } from 'neverthrow';

/**
 * Represents a resource pattern with metadata
 */
export interface ResourcePattern {
  /** Pattern identifier */
  id: string;
  /** URI pattern with placeholders (e.g., "schema://{schemaName}/tables") */
  uriPattern: string;
  /** MIME type for the resource */
  mimeType: string;
  /** Human-readable name pattern */
  namePattern: string;
  /** Description pattern */
  descriptionPattern: string;
  /** Whether this pattern requires dynamic discovery */
  requiresDiscovery: boolean;
  /** Function to check if a URI matches this pattern */
  matcher: (uri: string) => ResourcePatternMatch | null;
  /** Function to generate resource metadata for discovery */
  generator?: ResourceGenerator;
}

/**
 * Result of pattern matching
 */
export interface ResourcePatternMatch {
  /** The pattern that matched */
  pattern: ResourcePattern;
  /** Extracted parameters from the URI */
  params: Record<string, string>;
}

/**
 * Context for resource generation
 */
export interface GenerationContext {
  /** Schema source path (file or directory) */
  schemaSource: string;
  /** Optional parameters for scoped generation */
  scope?: Record<string, string>;
}

/**
 * Function type for generating resources dynamically
 */
export type ResourceGenerator = (
  context: GenerationContext
) => Promise<Result<ResourceMetadata[], Error>>;

/**
 * Resource metadata for MCP resource lists
 */
export interface ResourceMetadata {
  uri: string;
  mimeType: string;
  name: string;
  description: string;
}

/**
 * Predefined resource patterns for the tbls MCP server
 */
export class ResourcePatterns {
  private static patterns: ResourcePattern[] = [];

  /**
   * Initialize patterns with proper references
   */
  private static initializePatterns(): void {
    if (this.patterns.length > 0) {
      return; // Already initialized
    }

    // Schema list pattern
    const schemaListPattern: ResourcePattern = {
      id: 'schema-list',
      uriPattern: 'schema://list',
      mimeType: 'application/json',
      namePattern: 'Database Schemas',
      descriptionPattern:
        'Complete list of all available database schemas with metadata including schema names, table counts, and version information. URI format: schema://list',
      requiresDiscovery: false,
      matcher: (uri: string): ResourcePatternMatch | null => {
        if (uri === 'schema://list') {
          return {
            pattern: schemaListPattern,
            params: {},
          };
        }
        return null;
      },
    };

    // Schema tables pattern
    const schemaTablesPattern: ResourcePattern = {
      id: 'schema-tables',
      uriPattern: 'schema://{schemaName}/tables',
      mimeType: 'application/json',
      namePattern: '{schemaName} Schema Tables',
      descriptionPattern: 'Comprehensive list of all tables within the {schemaName} schema, including table metadata, row counts, and basic structure information. URI format: schema://[schema_name]/tables (example: schema://default/tables, schema://public/tables)',
      requiresDiscovery: true,
      matcher: (uri: string): ResourcePatternMatch | null => {
        const match = uri.match(/^schema:\/\/([^/]+)\/tables$/);
        if (match) {
          return {
            pattern: schemaTablesPattern,
            params: { schemaName: match[1] },
          };
        }
        return null;
      },
      generator: async (
        context: GenerationContext
      ): Promise<Result<ResourceMetadata[], Error>> => {
        try {
          // Import here to avoid circular dependencies
          const { handleSchemaListResource } = await import(
            '../resources/schema-resource'
          );

          const schemaListResult = await handleSchemaListResource(
            context.schemaSource
          );
          if (schemaListResult.isErr()) {
            return err(schemaListResult.error);
          }

          const resources: ResourceMetadata[] = [];
          for (const schema of schemaListResult.value.schemas) {
            // For backward compatibility, use "default" in URIs only for single-schema setups
            // when no specific schema name is provided in context
            const uriSchemaName =
              schemaListResult.value.schemas.length === 1 && !context.scope?.schemaName
                ? 'default'
                : schema.name;

            resources.push({
              uri: `schema://${uriSchemaName}/tables`,
              mimeType: 'application/json',
              name: `${schema.name} Schema Tables`,
              description: `Comprehensive list of all tables within the ${schema.name} schema, including table metadata, row counts, and basic structure information. URI format: schema://[schema_name]/tables (example: schema://default/tables, schema://public/tables)`,
            });
          }

          return ok(resources);
        } catch (error) {
          return err(
            new Error(
              `Failed to generate schema tables resources: ${error instanceof Error ? error.message : 'Unknown error'}`
            )
          );
        }
      },
    };

    // Individual table pattern
    const tableInfoPattern: ResourcePattern = {
      id: 'table-info',
      uriPattern: 'table://{schemaName}/{tableName}',
      mimeType: 'application/json',
      namePattern: '{tableName} table ({schemaName} schema)',
      descriptionPattern:
        'Complete detailed information about the {tableName} table including column definitions with data types, constraints, indexes, foreign key relationships, and table statistics. URI format: table://[schema_name]/[table_name] (example: table://default/users, table://public/orders)',
      requiresDiscovery: true,
      matcher: (uri: string): ResourcePatternMatch | null => {
        const match = uri.match(/^table:\/\/([^/]+)\/([^/]+)$/);
        if (match) {
          return {
            pattern: tableInfoPattern,
            params: { schemaName: match[1], tableName: match[2] },
          };
        }
        return null;
      },
      generator: async (
        context: GenerationContext
      ): Promise<Result<ResourceMetadata[], Error>> => {
        try {
          // Import here to avoid circular dependencies
          const { handleSchemaListResource } = await import(
            '../resources/schema-resource'
          );
          const { handleSchemaTablesResource } = await import(
            '../resources/table-resource'
          );

          const schemaListResult = await handleSchemaListResource(
            context.schemaSource
          );
          if (schemaListResult.isErr()) {
            return err(schemaListResult.error);
          }

          const resources: ResourceMetadata[] = [];

          // If scope specifies a particular schema, only generate for that schema
          let targetSchemas = schemaListResult.value.schemas;
          if (context.scope?.schemaName) {
            // Handle "default" schema name resolution for single-schema setups
            if (
              context.scope.schemaName === 'default' &&
              schemaListResult.value.schemas.length === 1
            ) {
              // For single-schema setup, "default" should resolve to the only schema
              targetSchemas = schemaListResult.value.schemas;
            } else {
              // For multi-schema setup or named schema request, filter by exact name
              targetSchemas = schemaListResult.value.schemas.filter(
                (s) => s.name === context.scope?.schemaName
              );
            }
          }

          for (const schema of targetSchemas) {
            // Use the requested schema name for resolution (important for "default" handling)
            const requestedSchemaName =
              context.scope?.schemaName || schema.name;

            const tablesResult = await handleSchemaTablesResource(
              context.schemaSource,
              requestedSchemaName
            );
            if (tablesResult.isOk()) {
              // Determine URI schema name based on request context
              // For backward compatibility, use "default" only when specifically requested
              // or when it's a single-schema setup accessed via "default"
              const uriSchemaName =
                context.scope?.schemaName === 'default' && schemaListResult.value.schemas.length === 1
                  ? 'default'
                  : requestedSchemaName;

              for (const table of tablesResult.value.tables) {
                resources.push({
                  uri: `table://${uriSchemaName}/${table.name}`,
                  mimeType: 'application/json',
                  name: `${table.name} table (${schema.name} schema)`,
                  description: `Complete detailed information about the ${table.name} table including column definitions with data types, constraints, indexes, foreign key relationships, and table statistics. URI format: table://[schema_name]/[table_name] (example: table://default/users, table://public/orders)`,
                });
              }
            }
          }

          return ok(resources);
        } catch (error) {
          return err(
            new Error(
              `Failed to generate table info resources: ${error instanceof Error ? error.message : 'Unknown error'}`
            )
          );
        }
      },
    };

    // Table indexes pattern
    const tableIndexesPattern: ResourcePattern = {
      id: 'table-indexes',
      uriPattern: 'table://{schemaName}/{tableName}/indexes',
      mimeType: 'application/json',
      namePattern: '{tableName} table indexes ({schemaName} schema)',
      descriptionPattern: 'Detailed index information for the {tableName} table including index names, types (primary, unique, regular), column compositions, and performance statistics. URI format: table://[schema_name]/[table_name]/indexes (example: table://default/users/indexes, table://public/orders/indexes)',
      requiresDiscovery: true,
      matcher: (uri: string): ResourcePatternMatch | null => {
        const match = uri.match(/^table:\/\/([^/]+)\/([^/]+)\/indexes$/);
        if (match) {
          return {
            pattern: tableIndexesPattern,
            params: { schemaName: match[1], tableName: match[2] },
          };
        }
        return null;
      },
      generator: async (
        context: GenerationContext
      ): Promise<Result<ResourceMetadata[], Error>> => {
        try {
          // Import here to avoid circular dependencies
          const { handleSchemaListResource } = await import(
            '../resources/schema-resource'
          );
          const { handleSchemaTablesResource } = await import(
            '../resources/table-resource'
          );

          const schemaListResult = await handleSchemaListResource(
            context.schemaSource
          );
          if (schemaListResult.isErr()) {
            return err(schemaListResult.error);
          }

          const resources: ResourceMetadata[] = [];

          // If scope specifies a particular schema, only generate for that schema
          let targetSchemas = schemaListResult.value.schemas;
          if (context.scope?.schemaName) {
            // Handle "default" schema name resolution for single-schema setups
            if (
              context.scope.schemaName === 'default' &&
              schemaListResult.value.schemas.length === 1
            ) {
              // For single-schema setup, "default" should resolve to the only schema
              targetSchemas = schemaListResult.value.schemas;
            } else {
              // For multi-schema setup or named schema request, filter by exact name
              targetSchemas = schemaListResult.value.schemas.filter(
                (s) => s.name === context.scope?.schemaName
              );
            }
          }

          for (const schema of targetSchemas) {
            // Use the requested schema name for resolution (important for "default" handling)
            const requestedSchemaName =
              context.scope?.schemaName || schema.name;

            const tablesResult = await handleSchemaTablesResource(
              context.schemaSource,
              requestedSchemaName
            );
            if (tablesResult.isOk()) {
              // Determine URI schema name based on request context
              // For backward compatibility, use "default" only when specifically requested
              // or when it's a single-schema setup accessed via "default"
              const uriSchemaName =
                context.scope?.schemaName === 'default' && schemaListResult.value.schemas.length === 1
                  ? 'default'
                  : requestedSchemaName;

              for (const table of tablesResult.value.tables) {
                resources.push({
                  uri: `table://${uriSchemaName}/${table.name}/indexes`,
                  mimeType: 'application/json',
                  name: `${table.name} table indexes (${schema.name} schema)`,
                  description: `Detailed index information for the ${table.name} table including index names, types (primary, unique, regular), column compositions, and performance statistics. URI format: table://[schema_name]/[table_name]/indexes (example: table://default/users/indexes, table://public/orders/indexes)`,
                });
              }
            }
          }

          return ok(resources);
        } catch (error) {
          return err(
            new Error(
              `Failed to generate table indexes resources: ${error instanceof Error ? error.message : 'Unknown error'}`
            )
          );
        }
      },
    };

    // Add all patterns to the array
    this.patterns = [
      schemaListPattern,
      schemaTablesPattern,
      tableInfoPattern,
      tableIndexesPattern,
    ];
  }

  /**
   * Find a pattern that matches the given URI
   */
  static matchUri(uri: string): ResourcePatternMatch | null {
    this.initializePatterns();
    for (const pattern of this.patterns) {
      const match = pattern.matcher(uri);
      if (match) {
        return match;
      }
    }
    return null;
  }

  /**
   * Get all registered patterns
   */
  static getAllPatterns(): ResourcePattern[] {
    this.initializePatterns();
    return [...this.patterns];
  }

  /**
   * Get patterns that require discovery for list operations
   */
  static getDiscoveryPatterns(): ResourcePattern[] {
    this.initializePatterns();
    return this.patterns.filter((p) => p.requiresDiscovery && p.generator);
  }

  /**
   * Get static patterns that don't require discovery
   */
  static getStaticPatterns(): ResourcePattern[] {
    this.initializePatterns();
    return this.patterns.filter((p) => !p.requiresDiscovery);
  }

  /**
   * Generate resource metadata using the pattern's generator
   */
  static async generateResources(
    pattern: ResourcePattern,
    context: GenerationContext
  ): Promise<Result<ResourceMetadata[], Error>> {
    if (!pattern.generator) {
      return err(new Error(`Pattern ${pattern.id} does not have a generator`));
    }

    return pattern.generator(context);
  }

  /**
   * Interpolate placeholders in a pattern string with actual values
   */
  static interpolate(pattern: string, params: Record<string, string>): string {
    let result = pattern;
    for (const [key, value] of Object.entries(params)) {
      result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }
    return result;
  }
}
