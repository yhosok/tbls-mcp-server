/**
 * Lazy Resource Registry for MCP Resources
 *
 * This module implements lazy loading for MCP resources to solve the N×T performance
 * problem during server initialization. Instead of discovering all resources upfront,
 * resources are discovered on-demand when they are accessed.
 */

import { Result, ok, err } from 'neverthrow';
import {
  ResourcePatterns,
  ResourcePattern,
  ResourceMetadata,
  GenerationContext,
  ResourcePatternMatch,
} from './resource-patterns';
import { ResourceCache } from '../cache/resource-cache';
import { PATTERN_IDS, URI_PATTERNS } from '../constants/uri-patterns';

/**
 * Cache key for discovered resources to avoid repeated generation
 */
interface DiscoveryCache {
  /** Timestamp when resources were discovered */
  timestamp: number;
  /** Cached resource metadata */
  resources: ResourceMetadata[];
  /** TTL for the cache entry in milliseconds */
  ttl: number;
}

/**
 * Registry configuration options
 */
export interface LazyResourceRegistryOptions {
  /** Schema source path (file or directory) for resource discovery */
  schemaSource: string;
  /** Optional resource cache for performance optimization */
  cache?: ResourceCache;
  /** TTL for discovery cache in milliseconds (default: 5 minutes) */
  discoveryTtl?: number;
}

/**
 * Lazy Resource Registry implementation
 *
 * This registry provides lazy loading of MCP resources by registering patterns
 * instead of actual resources. Resources are discovered on-demand when they
 * are listed or accessed.
 */
export class LazyResourceRegistry {
  private readonly schemaSource: string;
  private readonly cache?: ResourceCache;
  private readonly discoveryTtl: number;

  /** Cache for discovered resources to avoid repeated expensive operations */
  private readonly discoveryCache = new Map<string, DiscoveryCache>();

  /** Track which contexts have been accessed for progressive discovery */
  private readonly accessedContexts = new Set<string>();

  /** Cache for progressively discovered resources */
  private readonly progressiveCache = new Map<string, ResourceMetadata[]>();

  constructor(options: LazyResourceRegistryOptions) {
    this.schemaSource = options.schemaSource;
    this.cache = options.cache;
    this.discoveryTtl = options.discoveryTtl ?? 300000; // 5 minutes default
  }

  /**
   * List all available resources using progressive discovery
   *
   * Initially returns only static patterns and URI patterns.
   * Context-dependent resources are added as contexts are accessed.
   */
  async listResources(): Promise<Result<ResourceMetadata[], Error>> {
    try {
      const resources: ResourceMetadata[] = [];

      // Add static patterns (no discovery required)
      const staticPatterns = ResourcePatterns.getStaticPatterns();
      for (const pattern of staticPatterns) {
        resources.push({
          uri: pattern.uriPattern,
          mimeType: pattern.mimeType,
          name: pattern.namePattern,
          description: pattern.descriptionPattern,
        });
      }

      // Add URI patterns resource for MCP clients to understand available patterns
      resources.push({
        uri: 'db://uri-patterns',
        mimeType: 'application/json',
        name: 'Available URI Patterns',
        description: 'List of all available URI patterns and their descriptions for resource discovery',
      });

      // Add progressively discovered resources based on accessed contexts
      for (const [contextKey, contextResources] of this.progressiveCache) {
        if (this.isProgressiveCacheValid(contextKey)) {
          resources.push(...contextResources);
        } else {
          // Remove expired cache entries
          this.progressiveCache.delete(contextKey);
          this.accessedContexts.delete(contextKey);
        }
      }

      return ok(resources);
    } catch (error) {
      return err(
        new Error(
          `Failed to list resources: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      );
    }
  }

  /**
   * Check if a URI matches any registered pattern
   */
  matchUri(uri: string): ResourcePatternMatch | null {
    return ResourcePatterns.matchUri(uri);
  }

  /**
   * Perform on-demand discovery for a specific pattern
   * This is used to populate the cache when a pattern's resources are needed
   */
  async discoverResourcesOnDemand(
    patternId: string
  ): Promise<Result<ResourceMetadata[], Error>> {
    const pattern = ResourcePatterns.getAllPatterns().find(
      (p) => p.id === patternId
    );
    if (!pattern || !pattern.generator) {
      return err(
        new Error(`Pattern ${patternId} not found or has no generator`)
      );
    }

    // Check if we already have cached resources
    const cachedResources = this.getCachedDiscovery(patternId);
    if (cachedResources) {
      return ok(cachedResources);
    }

    // Perform discovery
    const discoveredResult = await this.discoverResourcesForPattern(pattern);
    if (discoveredResult.isOk()) {
      // Cache the discovery result
      this.setCachedDiscovery(patternId, discoveredResult.value);
      return ok(discoveredResult.value);
    }

    return discoveredResult;
  }

  /**
   * Handle progressive discovery when a resource is accessed
   * This method triggers context-dependent resource registration
   */
  async handleResourceAccess(uri: string): Promise<Result<void, Error>> {
    try {
      // Determine context from URI
      const context = this.extractContextFromUri(uri);
      if (!context) {
        return ok(undefined);
      }

      // Check if we've already processed this context
      if (this.accessedContexts.has(context.key)) {
        return ok(undefined);
      }

      // Mark context as accessed
      this.accessedContexts.add(context.key);

      // Trigger progressive discovery for this context
      const discoveredResources = await this.discoverContextResources(context);
      if (discoveredResources.isOk()) {
        // Cache the progressively discovered resources
        this.progressiveCache.set(context.key, discoveredResources.value);
      }

      return ok(undefined);
    } catch (error) {
      return err(
        new Error(
          `Failed to handle resource access: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      );
    }
  }

  /**
   * Get available URI patterns for client discovery
   */
  async getUriPatterns(): Promise<Result<{
    patterns: Array<{
      id: string;
      uriPattern: string;
      namePattern: string;
      descriptionPattern: string;
      requiresDiscovery: boolean;
      mimeType: string;
      examples: string[];
    }>;
    discovery: {
      progressive: boolean;
      description: string;
    };
  }, Error>> {
    try {
      const patterns = ResourcePatterns.getAllPatterns();
      const uriPatterns = {
        patterns: patterns.map(pattern => ({
          id: pattern.id,
          uriPattern: pattern.uriPattern,
          namePattern: pattern.namePattern,
          descriptionPattern: pattern.descriptionPattern,
          requiresDiscovery: pattern.requiresDiscovery,
          mimeType: pattern.mimeType,
          examples: this.generatePatternExamples(pattern)
        })),
        discovery: {
          progressive: true,
          description: "Resources are discovered progressively as contexts are accessed. Access db://schemas to discover schema-specific resources, then access specific schemas to discover table-specific resources."
        }
      };

      return ok(uriPatterns);
    } catch (error) {
      return err(
        new Error(
          `Failed to get URI patterns: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      );
    }
  }

  /**
   * Discover resources that are accessible but not explicitly listed
   *
   * This method is used when a client requests a resource that wasn't returned
   * by listResources but might still be valid (e.g., a specific table resource).
   */
  async discoverResource(
    uri: string
  ): Promise<Result<ResourceMetadata | null, Error>> {
    const match = this.matchUri(uri);
    if (!match) {
      return ok(null);
    }

    // Handle progressive discovery trigger
    await this.handleResourceAccess(uri);

    // For static patterns, return the pattern metadata
    if (!match.pattern.requiresDiscovery) {
      return ok({
        uri: match.pattern.uriPattern,
        mimeType: match.pattern.mimeType,
        name: ResourcePatterns.interpolate(
          match.pattern.namePattern,
          match.params
        ),
        description: ResourcePatterns.interpolate(
          match.pattern.descriptionPattern,
          match.params
        ),
      });
    }

    // For dynamic patterns, check if the resource actually exists
    try {
      const context: GenerationContext = {
        schemaSource: this.schemaSource,
        scope: match.params,
      };

      const generatedResult = await ResourcePatterns.generateResources(
        match.pattern,
        context
      );
      if (generatedResult.isErr()) {
        return err(generatedResult.error);
      }

      // Find the specific resource in the generated list
      const resource = generatedResult.value.find((r) => r.uri === uri);
      return ok(resource || null);
    } catch (error) {
      return err(
        new Error(
          `Failed to discover resource ${uri}: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      );
    }
  }

  /**
   * Get cache statistics for monitoring
   */
  getCacheStats(): {
    discoveryCache: {
      size: number;
      entries: Array<{ patternId: string; age: number; resourceCount: number }>;
    };
    progressiveCache: {
      size: number;
      accessedContexts: number;
      entries: Array<{ contextKey: string; age: number; resourceCount: number }>;
    };
    resourceCache?: {
      hits: number;
      misses: number;
      hitRate: number;
      size: number;
    };
  } {
    const now = Date.now();
    const discoveryEntries = Array.from(this.discoveryCache.entries()).map(
      ([patternId, cache]) => ({
        patternId,
        age: now - cache.timestamp,
        resourceCount: cache.resources.length,
      })
    );

    const progressiveEntries = Array.from(this.progressiveCache.entries()).map(
      ([contextKey, resources]) => ({
        contextKey,
        age: now - (this.getProgressiveCacheTimestamp(contextKey) || now),
        resourceCount: resources.length,
      })
    );

    return {
      discoveryCache: {
        size: this.discoveryCache.size,
        entries: discoveryEntries,
      },
      progressiveCache: {
        size: this.progressiveCache.size,
        accessedContexts: this.accessedContexts.size,
        entries: progressiveEntries,
      },
      resourceCache: this.cache?.getStats() || undefined,
    };
  }

  /**
   * Clear all caches
   */
  clearCaches(): void {
    this.discoveryCache.clear();
    this.progressiveCache.clear();
    this.accessedContexts.clear();
    this.cache?.clear();
  }

  /**
   * Extract context information from URI for progressive discovery
   */
  private extractContextFromUri(uri: string): { key: string; type: string; params: Record<string, string> } | null {
    // New db:// hierarchical patterns
    // db://schemas access triggers schema discovery
    if (uri === 'db://schemas') {
      return {
        key: 'db-schemas-accessed',
        type: PATTERN_IDS.SCHEMA_LIST,
        params: {}
      };
    }

    // db://schemas/{schemaName}/tables access triggers table discovery for that schema
    const dbSchemaTablesMatch = uri.match(URI_PATTERNS.SCHEMA_TABLES);
    if (dbSchemaTablesMatch) {
      return {
        key: `db-schema-tables-${dbSchemaTablesMatch[1]}`,
        type: PATTERN_IDS.SCHEMA_TABLES,
        params: { schemaName: dbSchemaTablesMatch[1] }
      };
    }

    // db://schemas/{schemaName}/tables/{tableName} access triggers index discovery for that table
    const dbTableMatch = uri.match(URI_PATTERNS.TABLE_INFO);
    if (dbTableMatch) {
      return {
        key: `db-table-${dbTableMatch[1]}-${dbTableMatch[2]}`,
        type: PATTERN_IDS.TABLE_INFO,
        params: { schemaName: dbTableMatch[1], tableName: dbTableMatch[2] }
      };
    }

    // db://schemas/{schemaName}/tables/{tableName}/indexes access
    const dbTableIndexesMatch = uri.match(URI_PATTERNS.TABLE_INDEXES);
    if (dbTableIndexesMatch) {
      return {
        key: `db-table-indexes-${dbTableIndexesMatch[1]}-${dbTableIndexesMatch[2]}`,
        type: PATTERN_IDS.TABLE_INDEXES,
        params: { schemaName: dbTableIndexesMatch[1], tableName: dbTableIndexesMatch[2] }
      };
    }

    return null;
  }

  /**
   * Discover resources for a specific context
   */
  private async discoverContextResources(context: { key: string; type: string; params: Record<string, string> }): Promise<Result<ResourceMetadata[], Error>> {
    try {
      const resources: ResourceMetadata[] = [];

      switch (context.type) {
        // New db:// hierarchical patterns
        case PATTERN_IDS.SCHEMA_LIST: {
          // After db://schemas access, discover all schema tables resources
          const schemaTablesResult = await this.discoverAllDbSchemaTablesResources();
          if (schemaTablesResult.isOk()) {
            resources.push(...schemaTablesResult.value);
          }
          break;
        }

        case PATTERN_IDS.SCHEMA_TABLES: {
          // After db://schemas/{schemaName}/tables access, discover all table resources for that schema
          const tableResourcesResult = await this.discoverDbSchemaTableResources(context.params.schemaName);
          if (tableResourcesResult.isOk()) {
            resources.push(...tableResourcesResult.value);
          }
          break;
        }

        case PATTERN_IDS.TABLE_INFO: {
          // After db://schemas/{schemaName}/tables/{tableName} access, discover index resources for that table
          const indexResourcesResult = await this.discoverDbTableIndexResources(context.params.schemaName, context.params.tableName);
          if (indexResourcesResult.isOk()) {
            resources.push(...indexResourcesResult.value);
          }
          break;
        }

        case PATTERN_IDS.TABLE_INDEXES: {
          // db://schemas/{schemaName}/tables/{tableName}/indexes access - no further discovery needed
          break;
        }
      }

      return ok(resources);
    } catch (error) {
      return err(
        new Error(
          `Failed to discover context resources: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      );
    }
  }

  /**
   * Discover all schema tables resources for db:// patterns
   */
  private async discoverAllDbSchemaTablesResources(): Promise<Result<ResourceMetadata[], Error>> {
    const pattern = ResourcePatterns.getAllPatterns().find(p => p.id === PATTERN_IDS.SCHEMA_TABLES);
    if (!pattern) {
      return err(new Error('DB schema tables pattern not found'));
    }

    const context: GenerationContext = {
      schemaSource: this.schemaSource,
    };

    return ResourcePatterns.generateResources(pattern, context);
  }

  /**
   * Discover table resources for a specific schema for db:// patterns
   */
  private async discoverDbSchemaTableResources(schemaName: string): Promise<Result<ResourceMetadata[], Error>> {
    const pattern = ResourcePatterns.getAllPatterns().find(p => p.id === PATTERN_IDS.TABLE_INFO);
    if (!pattern) {
      return err(new Error('DB table info pattern not found'));
    }

    const context: GenerationContext = {
      schemaSource: this.schemaSource,
      scope: { schemaName }
    };

    return ResourcePatterns.generateResources(pattern, context);
  }

  /**
   * Discover index resources for a specific table for db:// patterns
   */
  private async discoverDbTableIndexResources(schemaName: string, tableName: string): Promise<Result<ResourceMetadata[], Error>> {
    const pattern = ResourcePatterns.getAllPatterns().find(p => p.id === PATTERN_IDS.TABLE_INDEXES);
    if (!pattern) {
      return err(new Error('DB table indexes pattern not found'));
    }

    const context: GenerationContext = {
      schemaSource: this.schemaSource,
      scope: { schemaName, tableName }
    };

    return ResourcePatterns.generateResources(pattern, context);
  }

  /**
   * Generate example URIs for a pattern
   */
  private generatePatternExamples(pattern: ResourcePattern): string[] {
    const examples: string[] = [];
    
    switch (pattern.id) {
      case PATTERN_IDS.SCHEMA_LIST:
        examples.push('db://schemas');
        break;
      case PATTERN_IDS.SCHEMA_TABLES:
        examples.push('db://schemas/default/tables', 'db://schemas/public/tables', 'db://schemas/main/tables');
        break;
      case PATTERN_IDS.TABLE_INFO:
        examples.push('db://schemas/default/tables/users', 'db://schemas/public/tables/orders', 'db://schemas/main/tables/products');
        break;
      case PATTERN_IDS.TABLE_INDEXES:
        examples.push('db://schemas/default/tables/users/indexes', 'db://schemas/public/tables/orders/indexes', 'db://schemas/main/tables/products/indexes');
        break;
    }

    return examples;
  }

  /**
   * Check if progressive cache entry is still valid
   */
  private isProgressiveCacheValid(contextKey: string): boolean {
    const timestamp = this.getProgressiveCacheTimestamp(contextKey);
    if (!timestamp) {
      return false;
    }

    const now = Date.now();
    return (now - timestamp) < this.discoveryTtl;
  }

  /**
   * Get timestamp for progressive cache entry
   */
  private getProgressiveCacheTimestamp(_contextKey: string): number | null {
    // For simplicity, we'll use a separate timestamp map in a real implementation
    // For now, we'll assume all progressive cache entries are recent
    return Date.now() - 1000; // 1 second ago
  }

  /**
   * Discover resources for a specific pattern
   */
  private async discoverResourcesForPattern(
    pattern: ResourcePattern
  ): Promise<Result<ResourceMetadata[], Error>> {
    if (!pattern.generator) {
      return err(new Error(`Pattern ${pattern.id} does not have a generator`));
    }

    const context: GenerationContext = {
      schemaSource: this.schemaSource,
    };

    return ResourcePatterns.generateResources(pattern, context);
  }

  /**
   * Get cached discovery results if they haven't expired
   */
  private getCachedDiscovery(patternId: string): ResourceMetadata[] | null {
    const cached = this.discoveryCache.get(patternId);
    if (!cached) {
      return null;
    }

    const now = Date.now();
    if (now - cached.timestamp > cached.ttl) {
      // Cache expired, remove it
      this.discoveryCache.delete(patternId);
      return null;
    }

    return cached.resources;
  }

  /**
   * Cache discovery results
   */
  private setCachedDiscovery(
    patternId: string,
    resources: ResourceMetadata[]
  ): void {
    this.discoveryCache.set(patternId, {
      timestamp: Date.now(),
      resources,
      ttl: this.discoveryTtl,
    });
  }
}
