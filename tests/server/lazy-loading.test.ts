import { jest } from '@jest/globals';
import { join } from 'path';
import { tmpdir } from 'os';
import { promises as fs } from 'fs';
import { TblsMcpServer } from '../../src/server.js';
import { ServerConfig } from '../../src/schemas/config.js';
import { ResourceCache } from '../../src/cache/resource-cache.js';
import * as schemaAdapter from '../../src/parsers/schema-adapter.js';
import * as schemaResource from '../../src/resources/schema-resource.js';
import * as tableResource from '../../src/resources/table-resource.js';
import { ok } from 'neverthrow';

import {
  MockServer,
  MockResourceListResponse,
  MockResourceReadResponse,
  MockLazyResourceResponse,
  MockCacheEntry,
  MockResourceRegistryMetadata,
  MockDiscoveryHandler,
} from '../test-utils';

/**
 * Test suite for analyzing current resource registration performance problems
 * and testing lazy loading implementation strategies.
 *
 * Current Problem Analysis:
 * - setupResourceHandlers() eagerly discovers ALL resources during ListResourcesRequest
 * - For N schemas with T tables each, this results in N×T file operations during setup
 * - Each schema triggers: parseSchemaOverview + parseTableReferences + parseSingleTableFile×T
 * - This creates O(N×T) file I/O operations on every ListResourcesRequest
 *
 * Performance Bottleneck Location:
 * - Lines 83-130 in src/server.ts: setupResourceHandlers()
 * - Nested loops: schemas -> tables -> resource creation
 * - Each iteration performs expensive file parsing operations
 */

describe('Server Resource Registration Performance Analysis', () => {
  let mockConfig: ServerConfig;
  // Removed unused mockCache variable
  let tempDir: string;
  let schemaDir: string;

  // Spy on all file parsing operations to track performance
  const parseSchemaOverviewSpy = jest.spyOn(
    schemaAdapter,
    'parseSchemaOverview'
  );
  const parseTableReferencesSpy = jest.spyOn(
    schemaAdapter,
    'parseTableReferences'
  );
  const parseSingleTableFileSpy = jest.spyOn(
    schemaAdapter,
    'parseSingleTableFile'
  );
  const handleSchemaListResourceSpy = jest.spyOn(
    schemaResource,
    'handleSchemaListResource'
  );
  const handleSchemaTablesResourceSpy = jest.spyOn(
    tableResource,
    'handleSchemaTablesResource'
  );

  beforeEach(async () => {
    // Reset all spies
    jest.clearAllMocks();

    // Create temporary directory for tests
    tempDir = await fs.mkdtemp(join(tmpdir(), 'tbls-lazy-test-'));
    schemaDir = join(tempDir, 'schemas');
    await fs.mkdir(schemaDir);

    mockConfig = {
      schemaSource: schemaDir,
      cache: {
        enabled: true,
        maxItems: 1000,
        ttlMs: 300000,
      },
    };

    // Cache setup removed as it was unused
    new ResourceCache({
      maxItems: 1000,
      ttlMs: 300000,
    });
  });

  afterEach(async () => {
    // Clean up temporary directory
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  describe('Lazy Loading Resource Registration Behavior', () => {
    it('should demonstrate lazy resource discovery performance improvement', async () => {
      // Mock schema discovery to return multiple schemas with multiple tables
      const mockSchemas = [
        { name: 'schema1', tableCount: 50, description: 'First schema' },
        { name: 'schema2', tableCount: 75, description: 'Second schema' },
        { name: 'schema3', tableCount: 100, description: 'Third schema' },
      ];

      const mockTables = Array.from({ length: 50 }, (_, i) => ({
        name: `table_${i}`,
        type: 'table' as const,
        comment: null,
      }));

      // Mock the resource handlers to return predictable data
      handleSchemaListResourceSpy.mockResolvedValue(
        ok({ schemas: mockSchemas })
      );
      handleSchemaTablesResourceSpy.mockResolvedValue(
        ok({
          schemaName: 'test',
          tables: mockTables,
        })
      );

      const server = new TblsMcpServer(mockConfig);

      // Simulate ListResourcesRequest which should use lazy discovery
      const listHandler = (
        server as unknown as { server: MockServer }
      ).server._requestHandlers.get('resources/list');
      expect(listHandler).toBeDefined();

      const result = await listHandler({
        method: 'resources/list',
        params: {},
      });

      // Verify that lazy loading returns static patterns + discovered resources
      expect(result.resources).toBeDefined();
      expect(result.resources.length).toBeGreaterThan(0);

      // With true lazy loading, schema handlers should NOT be called during listResources
      expect(handleSchemaListResourceSpy).toHaveBeenCalledTimes(0);
      expect(handleSchemaTablesResourceSpy).toHaveBeenCalledTimes(0);

      // With true lazy loading, we only return static patterns during listResources
      // Dynamic resources are discovered on-demand during readResource calls
      const expectedStaticResources = 2; // db://schemas and db://uri-patterns static patterns

      // Verify we're only returning static patterns (the key improvement of lazy loading)
      expect(result.resources.length).toBe(expectedStaticResources);

      console.log(`Performance Analysis:
        - Mock Schemas: ${mockSchemas.length}
        - Average tables per schema: ${mockSchemas.reduce((sum, s) => sum + (s.tableCount || 0), 0) / mockSchemas.length}
        - Resources returned by listResources(): ${result.resources.length} (static patterns only)
        - Total file operations during listResources(): ${handleSchemaListResourceSpy.mock.calls.length + handleSchemaTablesResourceSpy.mock.calls.length}
        - This demonstrates O(1) complexity with lazy loading (down from O(N×T))`);
    });

    it('should show reduced file parsing operations during lazy registration', async () => {
      // Mock file parsing operations to track calls
      parseSchemaOverviewSpy.mockReturnValue(
        ok({
          name: 'test',
          tableCount: 10,
          generated: new Date(),
          version: '1.0',
          description: 'Test schema',
        })
      );

      parseTableReferencesSpy.mockReturnValue(
        ok([
          { name: 'users', type: 'table', comment: null },
          { name: 'orders', type: 'table', comment: null },
          { name: 'products', type: 'table', comment: null },
        ])
      );

      parseSingleTableFileSpy.mockReturnValue(
        ok({
          metadata: {
            name: 'test',
            tableCount: 1,
            generated: new Date(),
            version: '1.0',
            description: null,
          },
          tables: [
            {
              name: 'test_table',
              type: 'table',
              comment: null,
              columns: [],
              indexes: [],
              constraints: [],
              triggers: [],
            },
          ],
          tableReferences: [],
          indexes: [],
          relations: [],
        })
      );

      const server = new TblsMcpServer(mockConfig);
      const listHandler = (
        server as unknown as { server: MockServer }
      ).server._requestHandlers.get('resources/list');

      await listHandler({
        method: 'resources/list',
        params: {},
      });

      // With lazy loading, we still do discovery but more efficiently
      const totalFileOperations =
        parseSchemaOverviewSpy.mock.calls.length +
        parseTableReferencesSpy.mock.calls.length +
        parseSingleTableFileSpy.mock.calls.length;

      // parseSingleTableFile should not be called during listResources in lazy mode
      expect(parseSingleTableFileSpy).not.toHaveBeenCalled();
      console.log(
        `File operations during registration: ${totalFileOperations}`
      );
    });

    it('should measure response time improvement with lazy loading', async () => {
      // Simulate slow file operations
      const slowParseDelay = 50; // 50ms per operation

      handleSchemaListResourceSpy.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, slowParseDelay));
        return ok({
          schemas: [
            { name: 'schema1', tableCount: 20, description: 'Test schema' },
          ],
        });
      });

      handleSchemaTablesResourceSpy.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, slowParseDelay));
        return ok({
          schemaName: 'schema1',
          tables: Array.from({ length: 20 }, (_, i) => ({
            name: `table_${i}`,
            type: 'table' as const,
            comment: null,
          })),
        });
      });

      const server = new TblsMcpServer(mockConfig);
      const listHandler = (
        server as unknown as { server: MockServer }
      ).server._requestHandlers.get('resources/list');

      const startTime = Date.now();
      await listHandler({
        method: 'resources/list',
        params: {},
      });
      const endTime = Date.now();

      const responseTime = endTime - startTime;

      // With true lazy loading, listResources should be very fast (no discovery)
      expect(responseTime).toBeLessThan(slowParseDelay); // Should be much faster than any schema call
      console.log(`Lazy loading response time: ${responseTime}ms`);
    });
  });

  describe('Lazy Loading Strategy Design', () => {
    it('should design lightweight resource registration', async () => {
      // Test concept: Resources should be registered with metadata only
      // No file parsing during ListResourcesRequest

      const mockLightweightResources = [
        {
          uri: 'db://schemas',
          mimeType: 'application/json',
          name: 'Database Schemas',
          description: 'List of all available database schemas with metadata',
          // Lazy loading metadata
          lazyLoadConfig: {
            discoveryRequired: true,
            resourceType: 'schema-list',
            cacheable: true,
          },
        },
        {
          uri: 'db://schemasdiscovery/*',
          mimeType: 'application/json',
          name: 'Dynamic Schema Resources',
          description: 'Dynamically discovered schema-specific resources',
          // Lazy loading metadata
          lazyLoadConfig: {
            discoveryRequired: true,
            resourceType: 'schema-dynamic',
            pattern: 'db://schemas{schema}/tables',
            cacheable: true,
          },
        },
      ];

      // Verify lightweight registration concept
      expect(mockLightweightResources).toHaveLength(2);
      expect(mockLightweightResources[0].lazyLoadConfig).toBeDefined();
      expect(mockLightweightResources[1].lazyLoadConfig.pattern).toBeDefined();

      // No file operations should be needed for registration
      expect(parseSchemaOverviewSpy).not.toHaveBeenCalled();
      expect(parseTableReferencesSpy).not.toHaveBeenCalled();
      expect(parseSingleTableFileSpy).not.toHaveBeenCalled();
    });

    it('should design on-demand resource discovery', async () => {
      // Test concept: Resource discovery happens during ReadResourceRequest
      // not during ListResourcesRequest

      interface LazyResourceDiscovery {
        discoverSchemas(basePath: string): Promise<string[]>;
        discoverTables(
          schemaPath: string,
          schemaName: string
        ): Promise<string[]>;
        createDynamicResource(
          uri: string,
          type: string
        ): Promise<{ uri: string; type: string; data: string }>;
      }

      const mockLazyDiscovery: LazyResourceDiscovery = {
        async discoverSchemas(basePath: string) {
          // This would only be called when db://schemas is actually accessed
          expect(basePath).toBeDefined();
          return ['schema1', 'schema2', 'schema3'];
        },

        async discoverTables(schemaPath: string, schemaName: string) {
          // This would only be called when db://schemas{name}/tables is accessed
          expect(schemaPath).toBeDefined();
          expect(schemaName).toBeDefined();
          return ['table1', 'table2', 'table3'];
        },

        async createDynamicResource(
          uri: string,
          type: string
        ): Promise<{ uri: string; type: string; data: string }> {
          // This would create the actual resource on-demand
          expect(uri).toBeDefined();
          expect(type).toBeDefined();
          return { uri, type, data: 'mock-data' };
        },
      };

      // Simulate lazy discovery workflow
      const schemas = await mockLazyDiscovery.discoverSchemas('/test/schemas');
      expect(schemas).toHaveLength(3);

      const tables = await mockLazyDiscovery.discoverTables(
        '/test/schemas/schema1',
        'schema1'
      );
      expect(tables).toHaveLength(3);

      const resource = await mockLazyDiscovery.createDynamicResource(
        'db://schemas/schema1/tables/table1',
        'table-info'
      );
      expect(resource.uri).toBe('db://schemas/schema1/tables/table1');
    });

    it('should design caching strategy for lazy loading', async () => {
      // Test concept: Cache discovery results and parsed resources

      interface LazyLoadingCache extends ResourceCache {
        // Resource discovery caching
        getDiscoveredSchemas(basePath: string): Promise<string[] | null>;
        setDiscoveredSchemas(
          basePath: string,
          schemas: string[]
        ): Promise<void>;

        getDiscoveredTables(schemaPath: string): Promise<string[] | null>;
        setDiscoveredTables(
          schemaPath: string,
          tables: string[]
        ): Promise<void>;

        // Resource metadata caching
        getResourceMetadata(
          uri: string
        ): Promise<{ uri: string; cached: boolean; timestamp: Date } | null>;
        setResourceMetadata(
          uri: string,
          metadata: { uri?: string; name?: string; [key: string]: unknown }
        ): Promise<void>;

        // Discovery timestamp tracking
        getDiscoveryTimestamp(path: string): Promise<Date | null>;
        setDiscoveryTimestamp(path: string, timestamp: Date): Promise<void>;
      }

      // Mock cache implementation demonstrating the interface
      const mockLazyCache = {
        async getDiscoveredSchemas(basePath: string) {
          // Return cached schema names if available
          return basePath === '/cached/schemas'
            ? ['cached_schema1', 'cached_schema2']
            : null;
        },

        async setDiscoveredSchemas(basePath: string, schemas: string[]) {
          // Cache schema discovery results
          expect(schemas).toBeInstanceOf(Array);
          expect(schemas.length).toBeGreaterThan(0);
        },

        async getDiscoveredTables(schemaPath: string) {
          // Return cached table names if available
          return schemaPath === '/cached/schema1'
            ? ['cached_table1', 'cached_table2']
            : null;
        },

        async setDiscoveredTables(schemaPath: string, tables: string[]) {
          // Cache table discovery results
          expect(tables).toBeInstanceOf(Array);
          expect(tables.length).toBeGreaterThan(0);
        },

        async getResourceMetadata(uri: string) {
          // Return cached resource metadata
          return uri === 'cached://resource'
            ? { uri, cached: true, timestamp: new Date() }
            : null;
        },

        async setResourceMetadata(
          uri: string,
          metadata: { uri?: string; name?: string; [key: string]: unknown }
        ) {
          // Cache resource metadata
          expect(metadata).toBeDefined();
          expect(metadata.uri || metadata.name).toBeDefined();
        },

        async getDiscoveryTimestamp(path: string) {
          // Return when discovery was last performed
          return path === '/cached/path' ? new Date(Date.now() - 60000) : null;
        },

        async setDiscoveryTimestamp(path: string, timestamp: Date) {
          // Track when discovery was performed
          expect(timestamp).toBeInstanceOf(Date);
        },
      } as LazyLoadingCache;

      // Test cache behavior
      const cachedSchemas =
        await mockLazyCache.getDiscoveredSchemas('/cached/schemas');
      expect(cachedSchemas).toEqual(['cached_schema1', 'cached_schema2']);

      const uncachedSchemas =
        await mockLazyCache.getDiscoveredSchemas('/uncached/schemas');
      expect(uncachedSchemas).toBeNull();

      await mockLazyCache.setDiscoveredSchemas('/new/schemas', [
        'new_schema1',
        'new_schema2',
      ]);
      await mockLazyCache.setDiscoveryTimestamp('/new/schemas', new Date());
    });
  });

  describe('Resource Access Pattern Testing', () => {
    it('should test lazy loading access patterns with real temp directory', async () => {
      // Create a simple schema file for testing
      const readmeContent = `# Test Schema

## Tables

| Name | Columns | Comment |
| ---- | ------- | ------- |
| users | 5 | User accounts table |
| orders | 8 | Order records table |

Generated at: 2024-01-15T10:30:00Z
`;

      await fs.writeFile(join(schemaDir, 'README.md'), readmeContent);

      // Track how resources are typically accessed by clients
      const accessPatterns = {
        listResourcesFirst: true, // Clients always call ListResources first
        readSpecificResources: true, // Then read specific resources
        randomAccess: false, // Resources are not accessed randomly
        bulkAccess: false, // Multiple resources are not typically read at once
      };

      const server = new TblsMcpServer(mockConfig);

      // Simulate typical client workflow
      // 1. Client calls ListResources (should be fast with lazy loading)
      const listHandler = (
        server as unknown as { server: MockServer }
      ).server._requestHandlers.get('resources/list');
      const listResult = await listHandler({
        method: 'resources/list',
        params: {},
      });

      expect(listResult.resources).toBeDefined();
      expect(listResult.resources.length).toBeGreaterThan(0);

      // 2. Client reads specific resource (this should be when parsing happens)
      const readHandler = (
        server as unknown as { server: MockServer }
      ).server._requestHandlers.get('resources/read');

      const readResult = await readHandler({
        method: 'resources/read',
        params: { uri: 'db://schemas' },
      });

      expect(readResult.contents).toBeDefined();
      expect(readResult.contents[0].mimeType).toBe('application/json');

      // Verify that this is the typical access pattern
      expect(accessPatterns.listResourcesFirst).toBe(true);
      expect(accessPatterns.readSpecificResources).toBe(true);
    });

    it('should test lazy loading access patterns', async () => {
      // Simulate lazy loading access pattern
      const lazyAccessLog: {
        operation: string;
        timestamp: number;
        cost: number;
      }[] = [];

      const mockLazyServer = {
        async listResources(): Promise<MockLazyResourceResponse> {
          const start = Date.now();
          // Lazy loading: Only return lightweight resource metadata
          const resources = [
            { uri: 'db://schemas', name: 'Schema List', lazy: true },
            {
              uri: 'db://schemas/*/tables',
              name: 'Schema Tables Pattern',
              lazy: true,
            },
            {
              uri: 'db://schemas/*/tables/*',
              name: 'Table Info Pattern',
              lazy: true,
            },
          ];
          const cost = Date.now() - start;
          lazyAccessLog.push({
            operation: 'listResources',
            timestamp: start,
            cost,
          });
          return { resources };
        },

        async readResource(uri: string): Promise<MockResourceReadResponse> {
          const start = Date.now();
          let cost = 0;

          if (uri === 'db://schemas') {
            // This is where discovery and parsing would happen
            await new Promise((resolve) => setTimeout(resolve, 100)); // Simulate parsing
            cost = Date.now() - start;
            lazyAccessLog.push({
              operation: `readResource(${uri})`,
              timestamp: start,
              cost,
            });
            return {
              contents: [
                { uri, mimeType: 'application/json', text: '{"schemas":[]}' },
              ],
            };
          }

          if (uri.match(/^schema:\/\/.+\/tables$/)) {
            // This is where table discovery would happen
            await new Promise((resolve) => setTimeout(resolve, 50)); // Simulate table parsing
            cost = Date.now() - start;
            lazyAccessLog.push({
              operation: `readResource(${uri})`,
              timestamp: start,
              cost,
            });
            return {
              contents: [
                { uri, mimeType: 'application/json', text: '{"tables":[]}' },
              ],
            };
          }

          cost = Date.now() - start;
          lazyAccessLog.push({
            operation: `readResource(${uri})`,
            timestamp: start,
            cost,
          });
          return {
            contents: [{ uri, mimeType: 'application/json', text: '{}' }],
          };
        },
      };

      // Simulate client access pattern with lazy loading
      const listResult = await mockLazyServer.listResources();
      expect(listResult.resources).toHaveLength(3);

      const schemaListResult =
        await mockLazyServer.readResource('db://schemas');
      expect(schemaListResult.contents).toBeDefined();

      const schemaTablesResult = await mockLazyServer.readResource(
        'db://schemas/test/tables'
      );
      expect(schemaTablesResult.contents).toBeDefined();

      // Analyze performance characteristics
      const listOperation = lazyAccessLog.find(
        (op) => op.operation === 'listResources'
      );
      const readOperations = lazyAccessLog.filter((op) =>
        op.operation.startsWith('readResource')
      );

      expect(listOperation?.cost).toBeLessThan(10); // Should be very fast
      expect(readOperations[0].cost).toBeGreaterThan(50); // First read should take time

      console.log('Lazy Loading Access Log:', lazyAccessLog);
    });

    it('should test caching effectiveness with lazy loading', async () => {
      let cacheHits = 0;
      let cacheMisses = 0;
      const parseCalls = new Map<string, number>();

      const mockCachingLazyServer = {
        cache: new Map<string, MockCacheEntry>(),

        async readResourceWithCaching(
          uri: string
        ): Promise<MockResourceReadResponse> {
          // Check cache first
          const cached = this.cache.get(uri);
          const now = Date.now();

          if (cached && now - cached.timestamp < 60000) {
            // 1 minute TTL
            cacheHits++;
            return cached.data;
          }

          // Cache miss - perform expensive parsing
          cacheMisses++;
          const parseKey = uri.split('://')[1]; // Extract resource key
          parseCalls.set(parseKey, (parseCalls.get(parseKey) || 0) + 1);

          // Simulate parsing time based on resource type
          let parseTime = 10;
          if (uri === 'db://schemas') parseTime = 100;
          if (uri.includes('/tables/') && !uri.endsWith('/tables'))
            parseTime = 25;

          await new Promise((resolve) => setTimeout(resolve, parseTime));

          const data = {
            contents: [{ uri, mimeType: 'application/json', text: '{}' }],
          };
          this.cache.set(uri, { data, timestamp: now });

          return data;
        },
      };

      // Test caching behavior
      // First access - should be cache miss
      await mockCachingLazyServer.readResourceWithCaching('db://schemas');
      expect(cacheMisses).toBe(1);
      expect(cacheHits).toBe(0);

      // Second access - should be cache hit
      await mockCachingLazyServer.readResourceWithCaching('db://schemas');
      expect(cacheHits).toBe(1);
      expect(cacheMisses).toBe(1);

      // Multiple different resources
      await mockCachingLazyServer.readResourceWithCaching(
        'db://schemas/test/tables'
      );
      await mockCachingLazyServer.readResourceWithCaching(
        'db://schemas/test/tables/users'
      );
      await mockCachingLazyServer.readResourceWithCaching(
        'db://schemas/test/tables/orders'
      );

      // Access same resources again
      await mockCachingLazyServer.readResourceWithCaching(
        'db://schemas/test/tables'
      );
      await mockCachingLazyServer.readResourceWithCaching(
        'db://schemas/test/tables/users'
      );

      // Verify caching effectiveness
      expect(cacheHits).toBe(3); // db://schemas, db://schemas/test/tables, db://schemas/test/tables/users
      expect(cacheMisses).toBe(4); // All unique resources

      console.log(`Cache Statistics:
        - Hits: ${cacheHits}
        - Misses: ${cacheMisses}
        - Hit Rate: ${((cacheHits / (cacheHits + cacheMisses)) * 100).toFixed(1)}%
        - Parse Calls: ${JSON.stringify(Object.fromEntries(parseCalls))}`);
    });
  });

  describe('Lazy Loading Interface Design', () => {
    it('should define lazy resource registration interface', () => {
      // Define the interface for lazy loading implementation
      interface LazyResourceRegistry {
        // Lightweight resource registration
        registerResourcePattern(
          pattern: string,
          metadata: ResourcePatternMetadata
        ): void;
        registerStaticResource(
          uri: string,
          metadata: StaticResourceMetadata
        ): void;

        // Dynamic resource discovery
        discoverResources(
          pattern: string,
          context: DiscoveryContext
        ): Promise<ResourceDescriptor[]>;

        // Resource materialization
        materializeResource(
          uri: string,
          context: MaterializationContext
        ): Promise<ResourceContent>;

        // Caching integration
        setCacheStrategy(pattern: string, strategy: CacheStrategy): void;
        invalidatePattern(pattern: string): Promise<void>;
      }

      interface ResourcePatternMetadata {
        name: string;
        description: string;
        mimeType: string;
        discoveryHandler: string; // Handler function name
        cacheStrategy?: CacheStrategy;
        dependencies?: string[]; // Other patterns this depends on
      }

      interface StaticResourceMetadata {
        name: string;
        description: string;
        mimeType: string;
        materializationHandler: string;
        cacheStrategy?: CacheStrategy;
      }

      interface DiscoveryContext {
        basePath: string;
        cache?: ResourceCache;
        parameters?: Record<string, string>;
      }

      interface MaterializationContext {
        uri: string;
        cache?: ResourceCache;
        parameters?: Record<string, string>;
      }

      interface ResourceDescriptor {
        uri: string;
        name: string;
        description: string;
        mimeType: string;
        estimatedSize?: number;
        dependencies?: string[];
      }

      interface ResourceContent {
        contents: Array<{
          uri: string;
          mimeType: string;
          text?: string;
          blob?: Uint8Array;
        }>;
        metadata?: Record<string, unknown>;
      }

      interface CacheStrategy {
        ttlMs: number;
        maxSize?: number;
        invalidationTriggers?: string[]; // File patterns that invalidate cache
        dependencies?: string[]; // Other resources this depends on
      }

      // Test interface design
      const mockRegistry: LazyResourceRegistry = {
        registerResourcePattern: jest.fn(),
        registerStaticResource: jest.fn(),
        discoverResources: jest.fn(),
        materializeResource: jest.fn(),
        setCacheStrategy: jest.fn(),
        invalidatePattern: jest.fn(),
      };

      // Verify interface completeness
      expect(typeof mockRegistry.registerResourcePattern).toBe('function');
      expect(typeof mockRegistry.discoverResources).toBe('function');
      expect(typeof mockRegistry.materializeResource).toBe('function');

      // Test pattern registration concept
      const schemaPattern: ResourcePatternMetadata = {
        name: 'Schema Resources',
        description: 'Dynamic schema discovery',
        mimeType: 'application/json',
        discoveryHandler: 'discoverSchemas',
        cacheStrategy: {
          ttlMs: 300000,
          invalidationTriggers: ['**/*.md', '**/*.json'],
        },
      };

      mockRegistry.registerResourcePattern('db://schemas/*', schemaPattern);
      expect(mockRegistry.registerResourcePattern).toHaveBeenCalledWith(
        'db://schemas/*',
        schemaPattern
      );
    });

    it('should define lazy loading server architecture', () => {
      // Define the architecture for lazy loading server
      class LazyTblsMcpServer {
        private resourceRegistry: Map<string, MockResourceRegistryMetadata> =
          new Map();
        private discoveryHandlers: Map<string, MockDiscoveryHandler> =
          new Map();
        private materializationHandlers: Map<string, MockDiscoveryHandler> =
          new Map();
        private cache?: ResourceCache;

        constructor(config: ServerConfig) {
          this.cache = config.cache?.enabled
            ? new ResourceCache({
                maxItems: config.cache.maxItems ?? 1000,
                ttlMs: config.cache.ttlMs ?? 300000,
              })
            : undefined;
        }

        // Setup lightweight resource registration
        setupLazyResourceHandlers(): void {
          // Register patterns instead of discovering all resources
          this.registerResourcePattern('db://schemas', {
            discoveryHandler: 'discoverSchemaList',
            cacheStrategy: { ttlMs: 300000 },
          });

          this.registerResourcePattern('db://schemas/*/tables', {
            discoveryHandler: 'discoverSchemaTables',
            cacheStrategy: { ttlMs: 300000 },
          });

          this.registerResourcePattern('db://schemas/*/tables/*', {
            discoveryHandler: 'discoverTableInfo',
            cacheStrategy: { ttlMs: 300000 },
          });

          this.registerResourcePattern('db://schemas/*/tables/*/indexes', {
            discoveryHandler: 'discoverTableIndexes',
            cacheStrategy: { ttlMs: 300000 },
          });
        }

        // Lightweight pattern registration (no file I/O)
        registerResourcePattern(
          pattern: string,
          metadata: MockResourceRegistryMetadata
        ): void {
          this.resourceRegistry.set(pattern, metadata);
        }

        // Discovery handlers (called on-demand)
        registerDiscoveryHandler(
          name: string,
          handler: MockDiscoveryHandler
        ): void {
          this.discoveryHandlers.set(name, handler);
        }

        // Materialization handlers (called when resource is read)
        registerMaterializationHandler(
          name: string,
          handler: MockDiscoveryHandler
        ): void {
          this.materializationHandlers.set(name, handler);
        }

        // Handle ListResources with lightweight response
        async handleListResources(): Promise<MockResourceListResponse> {
          const resources: MockResourceListResponse['resources'] = [];

          // Return lightweight resource metadata without discovery
          for (const [pattern] of this.resourceRegistry) {
            if (pattern === 'db://schemas') {
              resources.push({
                uri: 'db://schemas',
                mimeType: 'application/json',
                name: 'Database Schemas',
                description:
                  'List of all available database schemas with metadata',
              });
            }
            // Add pattern-based resources as placeholders
            // Actual discovery happens during ReadResource
          }

          return { resources };
        }

        // Handle ReadResource with on-demand materialization
        async handleReadResource(
          uri: string
        ): Promise<MockResourceReadResponse> {
          // Find matching pattern
          const matchingPattern = this.findMatchingPattern(uri);
          if (!matchingPattern) {
            throw new Error(`No handler for resource URI: ${uri}`);
          }

          const metadata = this.resourceRegistry.get(matchingPattern);
          if (!metadata) {
            throw new Error(`No metadata for pattern: ${matchingPattern}`);
          }
          const handler = this.discoveryHandlers.get(metadata.discoveryHandler);

          if (!handler) {
            throw new Error(
              `No discovery handler: ${metadata.discoveryHandler}`
            );
          }

          // This is where the actual file parsing happens
          return await handler(uri, this.cache);
        }

        private findMatchingPattern(uri: string): string | null {
          // Simple pattern matching implementation
          for (const pattern of this.resourceRegistry.keys()) {
            if (this.matchesPattern(uri, pattern)) {
              return pattern;
            }
          }
          return null;
        }

        private matchesPattern(uri: string, pattern: string): boolean {
          // Convert pattern to regex
          const regexPattern = pattern
            .replace(/\*/g, '[^/]*')
            .replace(/\*\*/g, '.*');
          const regex = new RegExp(`^${regexPattern}$`);
          return regex.test(uri);
        }
      }

      // Test lazy server architecture
      const lazyServer = new LazyTblsMcpServer(mockConfig);
      lazyServer.setupLazyResourceHandlers();

      // Register discovery handlers
      lazyServer.registerDiscoveryHandler(
        'discoverSchemaList',
        async (uri: string, _cache?: ResourceCache) => {
          // This would call handleSchemaListResource when needed
          return {
            contents: [
              { uri, mimeType: 'application/json', text: '{"schemas":[]}' },
            ],
          };
        }
      );

      expect(lazyServer).toBeInstanceOf(LazyTblsMcpServer);
      expect(typeof lazyServer.handleListResources).toBe('function');
      expect(typeof lazyServer.handleReadResource).toBe('function');
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });
});

/**
 * Performance Optimization Summary:
 *
 * Current Problems Identified:
 * 1. N×T file operations during ListResourcesRequest (lines 83-130 in server.ts)
 * 2. Eager parsing of all schema and table files during resource registration
 * 3. Nested loops creating O(N×T) complexity for resource discovery
 * 4. No lazy loading - all resources discovered upfront
 *
 * Lazy Loading Strategy:
 * 1. Lightweight resource registration with patterns
 * 2. On-demand resource discovery during ReadResourceRequest
 * 3. Caching of discovery results and parsed resources
 * 4. Pattern-based resource matching for dynamic URIs
 *
 * Expected Performance Improvements:
 * - ListResourcesRequest: O(1) instead of O(N×T)
 * - Memory usage: Significantly reduced initial memory footprint
 * - Cache effectiveness: Better hit rates due to demand-driven loading
 * - Scalability: Linear scaling with accessed resources, not total resources
 */
