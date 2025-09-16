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
  /** URI pattern with placeholders (e.g., "db://schemas/{schemaName}/tables") */
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


    // Root schema list pattern - db://schemas
    const dbSchemasPattern: ResourcePattern = {
      id: 'db-schemas',
      uriPattern: 'db://schemas',
      mimeType: 'application/json',
      namePattern: 'Database Schemas',
      descriptionPattern:
        'Complete list of all available database schemas with metadata including schema names, table counts, and version information.',
      requiresDiscovery: false,
      matcher: (uri: string): ResourcePatternMatch | null => {
        if (uri === 'db://schemas') {
          return {
            pattern: dbSchemasPattern,
            params: {},
          };
        }
        return null;
      },
    };

    // Schema tables pattern - db://schemas/{schemaName}/tables
    const dbSchemaTablesPattern: ResourcePattern = {
      id: 'db-schema-tables',
      uriPattern: 'db://schemas/{schemaName}/tables',
      mimeType: 'application/json',
      namePattern: '{schemaName} Schema Tables',
      descriptionPattern: 'Comprehensive list of all tables within the {schemaName} schema, including table metadata, row counts, and basic structure information.',
      requiresDiscovery: true,
      matcher: (uri: string): ResourcePatternMatch | null => {
        const match = uri.match(/^db:\/\/schemas\/([^/]+)\/tables$/);
        if (match && match[1]) {
          return {
            pattern: dbSchemaTablesPattern,
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
            resources.push({
              uri: `db://schemas/${schema.name}/tables`,
              mimeType: 'application/json',
              name: `${schema.name} Schema Tables`,
              description: `Comprehensive list of all tables within the ${schema.name} schema, including table metadata, row counts, and basic structure information.`,
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

    // Individual schema pattern - db://schemas/{schemaName} (for contextual errors and suggestions)
    const dbSchemaPattern: ResourcePattern = {
      id: 'db-schema',
      uriPattern: 'db://schemas/{schemaName}',
      mimeType: 'application/json',
      namePattern: '{schemaName} Schema',
      descriptionPattern:
        'Information about the {schemaName} schema. This URI redirects to db://schemas/{schemaName}/tables.',
      requiresDiscovery: true,
      matcher: (uri: string): ResourcePatternMatch | null => {
        const match = uri.match(/^db:\/\/schemas\/([^/]+)$/);
        // Exclude reserved names and known schema names that would be malformed without /tables
        const excludedNames = ['tables', 'public', 'auth'];
        if (match && match[1] && !excludedNames.includes(match[1])) {
          return {
            pattern: dbSchemaPattern,
            params: { schemaName: match[1] },
          };
        }
        return null;
      },
      generator: async (
        _context: GenerationContext
      ): Promise<Result<ResourceMetadata[], Error>> => {
        // This pattern doesn't generate resources, it's meant to fail discovery
        // and provide helpful error messages
        return ok([]);
      },
    };

    // Individual table pattern - db://schemas/{schemaName}/tables/{tableName}
    const dbTableInfoPattern: ResourcePattern = {
      id: 'db-table-info',
      uriPattern: 'db://schemas/{schemaName}/tables/{tableName}',
      mimeType: 'application/json',
      namePattern: '{tableName} table ({schemaName} schema)',
      descriptionPattern:
        'Complete detailed information about the {tableName} table including column definitions with data types, constraints, indexes, foreign key relationships, and table statistics.',
      requiresDiscovery: true,
      matcher: (uri: string): ResourcePatternMatch | null => {
        const match = uri.match(/^db:\/\/schemas\/([^/]+)\/tables\/([^/]+)$/);
        if (match && match[1] && match[2]) {
          return {
            pattern: dbTableInfoPattern,
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
            targetSchemas = schemaListResult.value.schemas.filter(
              (s) => s.name === context.scope?.schemaName
            );
          }

          for (const schema of targetSchemas) {
            const tablesResult = await handleSchemaTablesResource(
              context.schemaSource,
              schema.name
            );
            if (tablesResult.isOk()) {
              for (const table of tablesResult.value.tables) {
                resources.push({
                  uri: `db://schemas/${schema.name}/tables/${table.name}`,
                  mimeType: 'application/json',
                  name: `${table.name} table (${schema.name} schema)`,
                  description: `Complete detailed information about the ${table.name} table including column definitions with data types, constraints, indexes, foreign key relationships, and table statistics.`,
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

    // Table indexes pattern - db://schemas/{schemaName}/tables/{tableName}/indexes
    const dbTableIndexesPattern: ResourcePattern = {
      id: 'db-table-indexes',
      uriPattern: 'db://schemas/{schemaName}/tables/{tableName}/indexes',
      mimeType: 'application/json',
      namePattern: '{tableName} table indexes ({schemaName} schema)',
      descriptionPattern: 'Detailed index information for the {tableName} table including index names, types (primary, unique, regular), column compositions, and performance statistics.',
      requiresDiscovery: true,
      matcher: (uri: string): ResourcePatternMatch | null => {
        const match = uri.match(/^db:\/\/schemas\/([^/]+)\/tables\/([^/]+)\/indexes$/);
        if (match && match[1] && match[2]) {
          return {
            pattern: dbTableIndexesPattern,
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
            targetSchemas = schemaListResult.value.schemas.filter(
              (s) => s.name === context.scope?.schemaName
            );
          }

          for (const schema of targetSchemas) {
            const tablesResult = await handleSchemaTablesResource(
              context.schemaSource,
              schema.name
            );
            if (tablesResult.isOk()) {
              for (const table of tablesResult.value.tables) {
                resources.push({
                  uri: `db://schemas/${schema.name}/tables/${table.name}/indexes`,
                  mimeType: 'application/json',
                  name: `${table.name} table indexes (${schema.name} schema)`,
                  description: `Detailed index information for the ${table.name} table including index names, types (primary, unique, regular), column compositions, and performance statistics.`,
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

    // Add all new db:// patterns to the array in logical hierarchical order
    this.patterns = [
      dbSchemasPattern,
      dbSchemaPattern,
      dbSchemaTablesPattern,
      dbTableInfoPattern,
      dbTableIndexesPattern,
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


  /**
   * Get valid pattern suggestions for error messages
   */
  static getValidPatterns(): string[] {
    this.initializePatterns();
    return this.patterns.map(p => p.uriPattern);
  }

  /**
   * Suggest valid patterns and available resources based on partial URI
   */
  static async suggestResources(uri: string, schemaSource: string): Promise<{
    suggestions: string[];
    availableSchemas?: string[];
    availableTables?: string[];
    schemaName?: string;
  }> {
    const suggestions: string[] = [];
    let availableSchemas: string[] | undefined;
    let availableTables: string[] | undefined;
    let schemaName: string | undefined;

    try {
      // Import here to avoid circular dependencies
      const { handleSchemaListResource } = await import(
        '../resources/schema-resource'
      );
      const { handleSchemaTablesResource } = await import(
        '../resources/table-resource'
      );

      // Get available schemas
      const schemaListResult = await handleSchemaListResource(schemaSource);
      if (schemaListResult.isOk()) {
        availableSchemas = schemaListResult.value.schemas.map(s => s.name);

        // Check if URI is a partial schema path
        const schemaMatch = uri.match(/^db:\/\/schemas\/([^/]+)$/);
        if (schemaMatch && schemaMatch[1]) {
          const requestedSchema = schemaMatch[1];
          schemaName = requestedSchema;
          suggestions.push(`db://schemas/${requestedSchema}/tables`);

          // If schema doesn't exist, suggest available schemas
          if (!availableSchemas.includes(requestedSchema)) {
            // No additional suggestions needed here as availableSchemas will be returned
          }
        }

        // Check if URI is a partial table path
        const tableMatch = uri.match(/^db:\/\/schemas\/([^/]+)\/tables\/([^/]+)$/);
        if (tableMatch && tableMatch[1] && tableMatch[2]) {
          const requestedSchema = tableMatch[1];
          const requestedTable = tableMatch[2];
          schemaName = requestedSchema;

          if (availableSchemas.includes(requestedSchema)) {
            // Get available tables for this schema
            const tablesResult = await handleSchemaTablesResource(schemaSource, requestedSchema);
            if (tablesResult.isOk()) {
              availableTables = tablesResult.value.tables.map(t => t.name);

              // If table doesn't exist, we'll return availableTables
              if (!availableTables.includes(requestedTable)) {
                // No additional suggestions needed
              } else {
                // Table exists, suggest indexes
                suggestions.push(`db://schemas/${requestedSchema}/tables/${requestedTable}/indexes`);
              }
            }
          }
        }
      }
    } catch {
      // Fallback to basic suggestions if resource loading fails
      suggestions.push('db://schemas');
    }

    // If no specific suggestions, provide basic pattern suggestions
    if (suggestions.length === 0) {
      suggestions.push('db://schemas');
      if (availableSchemas && availableSchemas.length > 0) {
        suggestions.push(`db://schemas/{schemaName}/tables`);
        suggestions.push(`db://schemas/{schemaName}/tables/{tableName}`);
        suggestions.push(`db://schemas/{schemaName}/tables/{tableName}/indexes`);
      }
    }

    return {
      suggestions,
      availableSchemas,
      availableTables,
      schemaName
    };
  }


  /**
   * Create contextual error for resource not found scenarios
   */
  static async createResourceNotFoundError(uri: string, schemaSource: string): Promise<Error> {
    const suggestions = await this.suggestResources(uri, schemaSource);

    let message = 'Resource not found';
    if (suggestions.schemaName && suggestions.availableTables) {
      message = 'Table not found';
    }

    const error = new Error(message) as Error & { data: Record<string, unknown> };
    error.data = suggestions;
    return error;
  }
}

