import { jest } from '@jest/globals';
import { tmpdir } from 'os';
import { join } from 'path';
import { promises as fs } from 'fs';
import { TblsMcpServer } from '../../src/server';
import { LazyResourceRegistry } from '../../src/server/lazy-resource-registry';
import { ResourceCache } from '../../src/cache/resource-cache';
import { ServerConfig } from '../../src/schemas/config';
import { ok, err } from 'neverthrow';

// Mock the resource handlers
jest.mock('../../src/resources/schema-resource');
jest.mock('../../src/resources/table-resource');
jest.mock('../../src/resources/index-resource');

import * as schemaResource from '../../src/resources/schema-resource';
import * as tableResource from '../../src/resources/table-resource';

import { MockServer } from '../test-utils';

describe('Progressive Discovery Implementation', () => {
  let tempDir: string;
  let schemaDir: string;
  let mockConfig: ServerConfig;

  beforeEach(async () => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create temporary directory for tests
    tempDir = await fs.mkdtemp(join(tmpdir(), 'tbls-progressive-test-'));
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
  });

  afterEach(async () => {
    // Clean up temporary directory
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  describe('LazyResourceRegistry Progressive Discovery', () => {
    let registry: LazyResourceRegistry;
    let cache: ResourceCache;

    beforeEach(() => {
      cache = new ResourceCache({
        maxItems: 1000,
        ttlMs: 300000,
      });

      registry = new LazyResourceRegistry({
        schemaSource: schemaDir,
        cache,
        discoveryTtl: 300000,
      });
    });

    it('should initially return only static patterns and URI patterns resource', async () => {
      const result = await registry.listResources();

      expect(result.isOk()).toBe(true);
      const resources = result._unsafeUnwrap();

      // Should include static patterns and URI patterns
      expect(resources).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            uri: 'db://schemas',
            name: 'Database Schemas',
          }),
          expect.objectContaining({
            uri: 'db://uri-patterns',
            name: 'Available URI Patterns',
          }),
        ])
      );

      // Should not include dynamically discovered resources initially
      const tableResources = resources.filter((r) =>
        r.uri.includes('/tables/')
      );
      expect(tableResources).toHaveLength(0);
    });

    it('should provide URI patterns information', async () => {
      const result = await registry.getUriPatterns();

      expect(result.isOk()).toBe(true);
      const patterns = result._unsafeUnwrap();

      expect(patterns).toHaveProperty('patterns');
      expect(patterns).toHaveProperty('discovery');
      expect(patterns.discovery.progressive).toBe(true);

      expect(patterns.patterns).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'db-schemas',
            uriPattern: 'db://schemas',
            requiresDiscovery: false,
          }),
          expect.objectContaining({
            id: 'db-schema-tables',
            uriPattern: 'db://schemas/{schemaName}/tables',
            requiresDiscovery: true,
          }),
          expect.objectContaining({
            id: 'db-table-info',
            uriPattern: 'db://schemas/{schemaName}/tables/{tableName}',
            requiresDiscovery: true,
          }),
          expect.objectContaining({
            id: 'db-table-indexes',
            uriPattern: 'db://schemas/{schemaName}/tables/{tableName}/indexes',
            requiresDiscovery: true,
          }),
        ])
      );
    });

    it('should progressively discover schema tables resources after schema list access', async () => {
      // Mock schema list to return test schemas
      const mockSchemas = [
        { name: 'schema1', tableCount: 2, description: 'First schema' },
        { name: 'schema2', tableCount: 3, description: 'Second schema' },
      ];

      const handleSchemaListResourceSpy = jest.spyOn(
        schemaResource,
        'handleSchemaListResource'
      );
      handleSchemaListResourceSpy.mockResolvedValue(
        ok({ schemas: mockSchemas })
      );

      // Initially, no schema tables resources
      let result = await registry.listResources();
      expect(result.isOk()).toBe(true);
      let resources = result._unsafeUnwrap();

      const schemaTablesResources = resources.filter(
        (r) => r.uri.startsWith('db://schemas/') && r.uri.endsWith('/tables')
      );
      expect(schemaTablesResources).toHaveLength(0);

      // Access schema list - this should trigger progressive discovery
      const accessResult = await registry.handleResourceAccess('db://schemas');
      expect(accessResult.isOk()).toBe(true);

      // Now schema tables resources should be discovered
      result = await registry.listResources();
      expect(result.isOk()).toBe(true);
      resources = result._unsafeUnwrap();

      const discoveredSchemaTablesResources = resources.filter(
        (r) => r.uri.startsWith('db://schemas/') && r.uri.endsWith('/tables')
      );
      expect(discoveredSchemaTablesResources).toHaveLength(2);
      expect(discoveredSchemaTablesResources).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            uri: 'db://schemas/schema1/tables',
          }),
          expect.objectContaining({
            uri: 'db://schemas/schema2/tables',
          }),
        ])
      );
    });

    it('should progressively discover table resources after schema tables access', async () => {
      // Mock schema list and schema tables
      const mockSchemas = [
        { name: 'testschema', tableCount: 2, description: 'Test schema' },
      ];
      const mockTables = [
        { name: 'users', type: 'table' as const, comment: null },
        { name: 'orders', type: 'table' as const, comment: null },
      ];

      const handleSchemaListResourceSpy = jest.spyOn(
        schemaResource,
        'handleSchemaListResource'
      );
      const handleSchemaTablesResourceSpy = jest.spyOn(
        tableResource,
        'handleSchemaTablesResource'
      );

      handleSchemaListResourceSpy.mockResolvedValue(
        ok({ schemas: mockSchemas })
      );
      handleSchemaTablesResourceSpy.mockResolvedValue(
        ok({ schemaName: 'testschema', tables: mockTables })
      );

      // Access schema tables - this should trigger table resource discovery
      const accessResult = await registry.handleResourceAccess(
        'db://schemas/testschema/tables'
      );
      expect(accessResult.isOk()).toBe(true);

      // Now table resources should be discovered
      const result = await registry.listResources();
      expect(result.isOk()).toBe(true);
      const resources = result._unsafeUnwrap();

      const tableResources = resources.filter(
        (r) => r.uri.includes('/tables/') && !r.uri.endsWith('/indexes')
      );
      expect(tableResources).toHaveLength(2);
      expect(tableResources).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            uri: 'db://schemas/testschema/tables/users',
          }),
          expect.objectContaining({
            uri: 'db://schemas/testschema/tables/orders',
          }),
        ])
      );
    });

    it('should progressively discover index resources after table access', async () => {
      // Mock required resources
      const mockSchemas = [
        { name: 'testschema', tableCount: 1, description: 'Test schema' },
      ];
      const mockTables = [
        { name: 'users', type: 'table' as const, comment: null },
      ];

      const handleSchemaListResourceSpy = jest.spyOn(
        schemaResource,
        'handleSchemaListResource'
      );
      const handleSchemaTablesResourceSpy = jest.spyOn(
        tableResource,
        'handleSchemaTablesResource'
      );

      handleSchemaListResourceSpy.mockResolvedValue(
        ok({ schemas: mockSchemas })
      );
      handleSchemaTablesResourceSpy.mockResolvedValue(
        ok({ schemaName: 'testschema', tables: mockTables })
      );

      // Access table - this should trigger index resource discovery
      const accessResult = await registry.handleResourceAccess(
        'db://schemas/testschema/tables/users'
      );
      expect(accessResult.isOk()).toBe(true);

      // Now index resources should be discovered
      const result = await registry.listResources();
      expect(result.isOk()).toBe(true);
      const resources = result._unsafeUnwrap();

      const indexResources = resources.filter(
        (r) => r.uri.includes('/tables/') && r.uri.endsWith('/indexes')
      );
      expect(indexResources).toHaveLength(1);
      expect(indexResources).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            uri: 'db://schemas/testschema/tables/users/indexes',
          }),
        ])
      );
    });

    it('should handle context extraction correctly', async () => {
      // Test schema list context
      const schemaListResult =
        await registry.handleResourceAccess('db://schemas');
      expect(schemaListResult.isOk()).toBe(true);

      // Test schema tables context
      const schemaTablesResult = await registry.handleResourceAccess(
        'db://schemas/test/tables'
      );
      expect(schemaTablesResult.isOk()).toBe(true);

      // Test table context
      const tableResult = await registry.handleResourceAccess(
        'db://schemas/test/tables/users'
      );
      expect(tableResult.isOk()).toBe(true);

      // Test invalid URI
      const invalidResult =
        await registry.handleResourceAccess('invalid://uri');
      expect(invalidResult.isOk()).toBe(true); // Should return ok with no action

      // Verify accessed contexts are tracked
      const stats = registry.getCacheStats();
      expect(stats.progressiveCache.accessedContexts).toBeGreaterThan(0);
    });

    it('should cache progressive discovery results', async () => {
      const mockSchemas = [
        { name: 'testschema', tableCount: 1, description: 'Test schema' },
      ];

      const handleSchemaListResourceSpy = jest.spyOn(
        schemaResource,
        'handleSchemaListResource'
      );
      handleSchemaListResourceSpy.mockResolvedValue(
        ok({ schemas: mockSchemas })
      );

      // First access
      await registry.handleResourceAccess('db://schemas');

      // Second access - should use cache
      await registry.handleResourceAccess('db://schemas');

      // Schema list handler should only be called once for generation
      expect(handleSchemaListResourceSpy).toHaveBeenCalledTimes(1);

      // Verify cache statistics
      const stats = registry.getCacheStats();
      expect(stats.progressiveCache.size).toBeGreaterThan(0);
      expect(stats.progressiveCache.accessedContexts).toBe(1);
    });

    it('should clear progressive cache correctly', () => {
      registry.clearCaches();

      const stats = registry.getCacheStats();
      expect(stats.progressiveCache.size).toBe(0);
      expect(stats.progressiveCache.accessedContexts).toBe(0);
      expect(stats.discoveryCache.size).toBe(0);
    });
  });

  describe('TblsMcpServer Progressive Discovery Integration', () => {
    let server: TblsMcpServer;

    beforeEach(() => {
      server = new TblsMcpServer(mockConfig);
    });

    it('should include URI patterns resource in list responses', async () => {
      const listHandler = (
        server as unknown as { server: MockServer }
      ).server._requestHandlers.get('resources/list');
      expect(listHandler).toBeDefined();

      const result = await listHandler({
        method: 'resources/list',
        params: {},
      });

      expect(result.resources).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            uri: 'db://uri-patterns',
            name: 'Available URI Patterns',
          }),
        ])
      );
    });

    it('should handle URI patterns resource requests', async () => {
      const readHandler = (
        server as unknown as { server: MockServer }
      ).server._requestHandlers.get('resources/read');
      expect(readHandler).toBeDefined();

      const result = await readHandler({
        method: 'resources/read',
        params: { uri: 'db://uri-patterns' },
      });

      expect(result.contents).toBeDefined();
      expect(result.contents[0].uri).toBe('db://uri-patterns');
      expect(result.contents[0].mimeType).toBe('application/json');

      // Parse content to verify structure
      const content = JSON.parse(result.contents[0].text);
      expect(content).toHaveProperty('patterns');
      expect(content).toHaveProperty('discovery');
      expect(content.discovery.progressive).toBe(true);
    });

    it('should trigger progressive discovery during resource access', async () => {
      const handleSchemaListResourceSpy = jest.spyOn(
        schemaResource,
        'handleSchemaListResource'
      );
      handleSchemaListResourceSpy.mockResolvedValue(
        ok({ schemas: [{ name: 'test', tableCount: 1, description: 'Test' }] })
      );

      const readHandler = (
        server as unknown as { server: MockServer }
      ).server._requestHandlers.get('resources/read');

      // Access schema list - should trigger progressive discovery
      await readHandler({
        method: 'resources/read',
        params: { uri: 'db://schemas' },
      });

      // Verify the server's lazy registry has been updated
      const stats = server.getCacheStats();
      expect(
        stats.lazyRegistry.progressiveCache.accessedContexts
      ).toBeGreaterThan(0);
    });

    it('should handle fallback gracefully when progressive discovery fails', async () => {
      const listHandler = (
        server as unknown as { server: MockServer }
      ).server._requestHandlers.get('resources/list');

      // Mock the lazy registry to fail
      const originalListResources = server['lazyRegistry'].listResources;
      server['lazyRegistry'].listResources = jest
        .fn()
        .mockResolvedValue(err(new Error('Mock discovery failure')));

      const result = await listHandler({
        method: 'resources/list',
        params: {},
      });

      // Should fallback to basic resources including URI patterns
      expect(result.resources).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            uri: 'db://schemas',
          }),
          expect.objectContaining({
            uri: 'db://uri-patterns',
          }),
        ])
      );

      // Restore original method
      server['lazyRegistry'].listResources = originalListResources;
    });
  });

  describe('Progressive Discovery Performance', () => {
    let registry: LazyResourceRegistry;

    beforeEach(() => {
      registry = new LazyResourceRegistry({
        schemaSource: schemaDir,
        discoveryTtl: 300000,
      });
    });

    it('should demonstrate performance improvement with progressive discovery', async () => {
      // Mock large dataset
      const mockSchemas = Array.from({ length: 10 }, (_, i) => ({
        name: `schema${i}`,
        tableCount: 20,
        description: `Schema ${i}`,
      }));

      const mockTables = Array.from({ length: 20 }, (_, i) => ({
        name: `table${i}`,
        type: 'table' as const,
        comment: null,
      }));

      const handleSchemaListResourceSpy = jest.spyOn(
        schemaResource,
        'handleSchemaListResource'
      );
      const handleSchemaTablesResourceSpy = jest.spyOn(
        tableResource,
        'handleSchemaTablesResource'
      );

      handleSchemaListResourceSpy.mockResolvedValue(
        ok({ schemas: mockSchemas })
      );
      handleSchemaTablesResourceSpy.mockResolvedValue(
        ok({ schemaName: 'test', tables: mockTables })
      );

      // Measure initial listResources performance
      const start = Date.now();
      const result = await registry.listResources();
      const initialTime = Date.now() - start;

      expect(result.isOk()).toBe(true);

      // Initial response should be fast (no discovery)
      expect(initialTime).toBeLessThan(50); // Should be very fast

      // Should only contain static resources initially
      const resources = result._unsafeUnwrap();
      const dynamicResources = resources.filter(
        (r) => r.uri.includes('default') || r.uri.includes('schema')
      );
      expect(dynamicResources.length).toBeLessThan(mockSchemas.length * 2); // Much less than full discovery

      console.log(`Progressive Discovery Performance:
        - Initial listResources time: ${initialTime}ms
        - Initial resource count: ${resources.length}
        - Mock schemas: ${mockSchemas.length}
        - Total possible table resources: ${mockSchemas.length * mockTables.length}
        - Performance improvement: Resources discovered on-demand instead of upfront`);
    });

    it('should measure progressive discovery trigger performance', async () => {
      const mockSchemas = [
        { name: 'test', tableCount: 5, description: 'Test schema' },
      ];

      const handleSchemaListResourceSpy = jest.spyOn(
        schemaResource,
        'handleSchemaListResource'
      );
      handleSchemaListResourceSpy.mockResolvedValue(
        ok({ schemas: mockSchemas })
      );

      // Measure progressive discovery trigger
      const start = Date.now();
      await registry.handleResourceAccess('db://schemas');
      const discoveryTime = Date.now() - start;

      // Verify discovery happened
      const stats = registry.getCacheStats();
      expect(stats.progressiveCache.accessedContexts).toBe(1);

      console.log(`Progressive Discovery Trigger Performance:
        - Discovery trigger time: ${discoveryTime}ms
        - Accessed contexts: ${stats.progressiveCache.accessedContexts}
        - Progressive cache size: ${stats.progressiveCache.size}`);
    });
  });

  describe('Progressive Discovery Error Handling', () => {
    let registry: LazyResourceRegistry;

    beforeEach(() => {
      registry = new LazyResourceRegistry({
        schemaSource: schemaDir,
        discoveryTtl: 300000,
      });
    });

    it('should handle schema discovery errors gracefully', async () => {
      const handleSchemaListResourceSpy = jest.spyOn(
        schemaResource,
        'handleSchemaListResource'
      );
      handleSchemaListResourceSpy.mockResolvedValue(
        err(new Error('Schema discovery failed'))
      );

      // Progressive discovery should handle errors
      const result = await registry.handleResourceAccess('db://schemas');
      expect(result.isOk()).toBe(true); // Should not fail the access

      // List resources should still work
      const listResult = await registry.listResources();
      expect(listResult.isOk()).toBe(true);
    });

    it('should handle table discovery errors gracefully', async () => {
      const handleSchemaTablesResourceSpy = jest.spyOn(
        tableResource,
        'handleSchemaTablesResource'
      );
      handleSchemaTablesResourceSpy.mockResolvedValue(
        err(new Error('Table discovery failed'))
      );

      // Progressive discovery should handle errors
      const result = await registry.handleResourceAccess(
        'db://schemas/test/tables'
      );
      expect(result.isOk()).toBe(true); // Should not fail the access

      // List resources should still work
      const listResult = await registry.listResources();
      expect(listResult.isOk()).toBe(true);
    });

    it('should handle pattern not found errors', async () => {
      // Test with non-existent pattern
      const result = await registry.discoverResourcesOnDemand(
        'non-existent-pattern'
      );
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toContain(
        'Pattern non-existent-pattern not found'
      );
    });
  });
});
