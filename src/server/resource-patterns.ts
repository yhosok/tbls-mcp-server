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
  private static patterns: ResourcePattern[] = [
    // Schema list pattern
    {
      id: 'schema-list',
      uriPattern: 'schema://list',
      mimeType: 'application/json',
      namePattern: 'Database Schemas',
      descriptionPattern: 'List of all available database schemas with metadata',
      requiresDiscovery: false,
      matcher: (uri: string): ResourcePatternMatch | null => {
        if (uri === 'schema://list') {
          return {
            pattern: ResourcePatterns.patterns[0],
            params: {}
          };
        }
        return null;
      }
    },

    // Schema tables pattern
    {
      id: 'schema-tables',
      uriPattern: 'schema://{schemaName}/tables',
      mimeType: 'application/json',
      namePattern: '{schemaName} Schema Tables',
      descriptionPattern: 'List of tables in the {schemaName} schema',
      requiresDiscovery: true,
      matcher: (uri: string): ResourcePatternMatch | null => {
        const match = uri.match(/^schema:\/\/([^/]+)\/tables$/);
        if (match) {
          return {
            pattern: ResourcePatterns.patterns[1],
            params: { schemaName: match[1] }
          };
        }
        return null;
      },
      generator: async (context: GenerationContext): Promise<Result<ResourceMetadata[], Error>> => {
        try {
          // Import here to avoid circular dependencies
          const { handleSchemaListResource } = await import('../resources/schema-resource');

          const schemaListResult = await handleSchemaListResource(context.schemaSource);
          if (schemaListResult.isErr()) {
            return err(schemaListResult.error);
          }

          const resources: ResourceMetadata[] = [];
          for (const schema of schemaListResult.value.schemas) {
            resources.push({
              uri: `schema://${schema.name}/tables`,
              mimeType: 'application/json',
              name: `${schema.name} Schema Tables`,
              description: `List of tables in the ${schema.name} schema`
            });
          }

          return ok(resources);
        } catch (error) {
          return err(new Error(`Failed to generate schema tables resources: ${error instanceof Error ? error.message : 'Unknown error'}`));
        }
      }
    },

    // Individual table pattern
    {
      id: 'table-info',
      uriPattern: 'table://{schemaName}/{tableName}',
      mimeType: 'application/json',
      namePattern: '{tableName} table ({schemaName} schema)',
      descriptionPattern: 'Detailed information about the {tableName} table including columns, indexes, and relationships',
      requiresDiscovery: true,
      matcher: (uri: string): ResourcePatternMatch | null => {
        const match = uri.match(/^table:\/\/([^/]+)\/([^/]+)$/);
        if (match) {
          return {
            pattern: ResourcePatterns.patterns[2],
            params: { schemaName: match[1], tableName: match[2] }
          };
        }
        return null;
      },
      generator: async (context: GenerationContext): Promise<Result<ResourceMetadata[], Error>> => {
        try {
          // Import here to avoid circular dependencies
          const { handleSchemaListResource } = await import('../resources/schema-resource');
          const { handleSchemaTablesResource } = await import('../resources/table-resource');

          const schemaListResult = await handleSchemaListResource(context.schemaSource);
          if (schemaListResult.isErr()) {
            return err(schemaListResult.error);
          }

          const resources: ResourceMetadata[] = [];

          // If scope specifies a particular schema, only generate for that schema
          const targetSchemas = context.scope?.schemaName
            ? schemaListResult.value.schemas.filter(s => s.name === context.scope?.schemaName)
            : schemaListResult.value.schemas;

          for (const schema of targetSchemas) {
            const tablesResult = await handleSchemaTablesResource(context.schemaSource, schema.name);
            if (tablesResult.isOk()) {
              for (const table of tablesResult.value.tables) {
                resources.push({
                  uri: `table://${schema.name}/${table.name}`,
                  mimeType: 'application/json',
                  name: `${table.name} table (${schema.name} schema)`,
                  description: `Detailed information about the ${table.name} table including columns, indexes, and relationships`
                });
              }
            }
          }

          return ok(resources);
        } catch (error) {
          return err(new Error(`Failed to generate table info resources: ${error instanceof Error ? error.message : 'Unknown error'}`));
        }
      }
    },

    // Table indexes pattern
    {
      id: 'table-indexes',
      uriPattern: 'table://{schemaName}/{tableName}/indexes',
      mimeType: 'application/json',
      namePattern: '{tableName} table indexes ({schemaName} schema)',
      descriptionPattern: 'Index information for the {tableName} table',
      requiresDiscovery: true,
      matcher: (uri: string): ResourcePatternMatch | null => {
        const match = uri.match(/^table:\/\/([^/]+)\/([^/]+)\/indexes$/);
        if (match) {
          return {
            pattern: ResourcePatterns.patterns[3],
            params: { schemaName: match[1], tableName: match[2] }
          };
        }
        return null;
      },
      generator: async (context: GenerationContext): Promise<Result<ResourceMetadata[], Error>> => {
        try {
          // Import here to avoid circular dependencies
          const { handleSchemaListResource } = await import('../resources/schema-resource');
          const { handleSchemaTablesResource } = await import('../resources/table-resource');

          const schemaListResult = await handleSchemaListResource(context.schemaSource);
          if (schemaListResult.isErr()) {
            return err(schemaListResult.error);
          }

          const resources: ResourceMetadata[] = [];

          // If scope specifies a particular schema, only generate for that schema
          const targetSchemas = context.scope?.schemaName
            ? schemaListResult.value.schemas.filter(s => s.name === context.scope?.schemaName)
            : schemaListResult.value.schemas;

          for (const schema of targetSchemas) {
            const tablesResult = await handleSchemaTablesResource(context.schemaSource, schema.name);
            if (tablesResult.isOk()) {
              for (const table of tablesResult.value.tables) {
                resources.push({
                  uri: `table://${schema.name}/${table.name}/indexes`,
                  mimeType: 'application/json',
                  name: `${table.name} table indexes (${schema.name} schema)`,
                  description: `Index information for the ${table.name} table`
                });
              }
            }
          }

          return ok(resources);
        } catch (error) {
          return err(new Error(`Failed to generate table indexes resources: ${error instanceof Error ? error.message : 'Unknown error'}`));
        }
      }
    }
  ];

  /**
   * Find a pattern that matches the given URI
   */
  static matchUri(uri: string): ResourcePatternMatch | null {
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
    return [...this.patterns];
  }

  /**
   * Get patterns that require discovery for list operations
   */
  static getDiscoveryPatterns(): ResourcePattern[] {
    return this.patterns.filter(p => p.requiresDiscovery && p.generator);
  }

  /**
   * Get static patterns that don't require discovery
   */
  static getStaticPatterns(): ResourcePattern[] {
    return this.patterns.filter(p => !p.requiresDiscovery);
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