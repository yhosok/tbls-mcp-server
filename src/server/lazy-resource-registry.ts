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

  constructor(options: LazyResourceRegistryOptions) {
    this.schemaSource = options.schemaSource;
    this.cache = options.cache;
    this.discoveryTtl = options.discoveryTtl ?? 300000; // 5 minutes default
  }

  /**
   * List all available resources using lazy discovery
   *
   * For true lazy loading, this method only returns static patterns and does NOT
   * perform any discovery. Discovery happens only when resources are actually accessed.
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

      // For lazy loading, we do NOT perform discovery here
      // Resources will be discovered on-demand when they are accessed via readResource()

      // We could add cached discovered resources if they exist, but for true lazy loading,
      // we should minimize work during listResources()
      const discoveryPatterns = ResourcePatterns.getDiscoveryPatterns();
      for (const pattern of discoveryPatterns) {
        const cachedResources = this.getCachedDiscovery(pattern.id);
        if (cachedResources) {
          // Only add cached resources if they're still valid
          resources.push(...cachedResources);
        }
        // Do NOT perform discovery here - that's the key to lazy loading
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

    return {
      discoveryCache: {
        size: this.discoveryCache.size,
        entries: discoveryEntries,
      },
      resourceCache: this.cache?.getStats() || undefined,
    };
  }

  /**
   * Clear all caches
   */
  clearCaches(): void {
    this.discoveryCache.clear();
    this.cache?.clear();
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
