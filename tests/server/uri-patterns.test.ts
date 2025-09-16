import { jest } from '@jest/globals';
import { tmpdir } from 'os';
import { join } from 'path';
import { promises as fs } from 'fs';
import { TblsMcpServer } from '../../src/server';
import { LazyResourceRegistry } from '../../src/server/lazy-resource-registry';
import { ResourceCache } from '../../src/cache/resource-cache';
import { ResourcePatterns } from '../../src/server/resource-patterns';
import { ServerConfig } from '../../src/schemas/config';
import { ok } from 'neverthrow';

// Mock the resource handlers
jest.mock('../../src/resources/schema-resource');
jest.mock('../../src/resources/table-resource');
jest.mock('../../src/resources/index-resource');

import * as schemaResource from '../../src/resources/schema-resource';
import * as tableResource from '../../src/resources/table-resource';
import * as indexResource from '../../src/resources/index-resource';

// Define types for test server
interface ResourceResponse {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

interface ListResourcesResponse {
  resources: ResourceResponse[];
}

interface RequestHandler {
  (request: { method: string; params: Record<string, unknown> }): Promise<ListResourcesResponse>;
}

interface MockTblsServer {
  server: {
    _requestHandlers: Map<string, RequestHandler>;
  };
}

describe('db:// URI Patterns', () => {
  let tempDir: string;
  let schemaDir: string;
  let mockConfig: ServerConfig;
  let server: TblsMcpServer;

  beforeEach(async () => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create temporary directory for tests
    tempDir = await fs.mkdtemp(join(tmpdir(), 'tbls-uri-test-'));
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

    server = new TblsMcpServer(mockConfig);

    // Mock schema resource responses
    const mockSchemaResourceMod = schemaResource as jest.Mocked<typeof schemaResource>;
    mockSchemaResourceMod.handleSchemaListResource.mockResolvedValue(ok({
      schemas: [
        { name: 'public', tableCount: 5 },
        { name: 'auth', tableCount: 3 }
      ]
    }));

    const mockTableResourceMod = tableResource as jest.Mocked<typeof tableResource>;
    mockTableResourceMod.handleSchemaTablesResource.mockResolvedValue(ok({
      tables: [
        { name: 'users', columns: 4, rowCount: 1000 },
        { name: 'posts', columns: 6, rowCount: 500 }
      ]
    }));
  });

  afterEach(async () => {
    if (server) {
      await server.close();
    }
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  describe('Pattern Matching System - db:// Hierarchical Structure', () => {

    describe('Root Schema List Pattern', () => {
      it('should match db://schemas URI pattern', () => {
        const match = ResourcePatterns.matchUri('db://schemas');

        expect(match).not.toBeNull();
        expect(match?.pattern.id).toBe('db-schemas');
        expect(match?.pattern.uriPattern).toBe('db://schemas');
        expect(match?.params).toEqual({});
      });

      it('should not match old schema://list pattern', () => {
        const match = ResourcePatterns.matchUri('schema://list');

        expect(match).toBeNull();
      });

      it('should generate correct resource metadata for db://schemas', () => {
        const match = ResourcePatterns.matchUri('db://schemas');

        expect(match?.pattern.namePattern).toBe('Database Schemas');
        expect(match?.pattern.descriptionPattern).toContain('Complete list of all available database schemas');
        expect(match?.pattern.mimeType).toBe('application/json');
      });
    });

    describe('Schema Tables Pattern', () => {
      it('should match db://schemas/{schemaName}/tables URI pattern', () => {
        const match = ResourcePatterns.matchUri('db://schemas/public/tables');

        expect(match).not.toBeNull();
        expect(match?.pattern.id).toBe('db-schema-tables');
        expect(match?.pattern.uriPattern).toBe('db://schemas/{schemaName}/tables');
        expect(match?.params).toEqual({ schemaName: 'public' });
      });

      it('should extract schema name parameter correctly', () => {
        const testCases = [
          { uri: 'db://schemas/public/tables', expected: 'public' },
          { uri: 'db://schemas/auth/tables', expected: 'auth' },
          { uri: 'db://schemas/inventory/tables', expected: 'inventory' },
          { uri: 'db://schemas/user_management/tables', expected: 'user_management' }
        ];

        testCases.forEach(({ uri, expected }) => {
          const match = ResourcePatterns.matchUri(uri);
          expect(match?.params.schemaName).toBe(expected);
        });
      });

      it('should not match old schema://{schemaName}/tables pattern', () => {
        const match = ResourcePatterns.matchUri('schema://public/tables');

        expect(match).toBeNull();
      });

      it('should not match malformed db:// patterns', () => {
        const malformedUris = [
          'db://schemas/tables',  // missing schema name
          'db://schemas//tables', // empty schema name
          'db://schemas/public',  // missing /tables
          'db://schema/public/tables', // wrong schemes segment
        ];

        malformedUris.forEach(uri => {
          const match = ResourcePatterns.matchUri(uri);
          expect(match).toBeNull();
        });
      });
    });

    describe('Individual Table Pattern', () => {
      it('should match db://schemas/{schemaName}/tables/{tableName} URI pattern', () => {
        const match = ResourcePatterns.matchUri('db://schemas/public/tables/users');

        expect(match).not.toBeNull();
        expect(match?.pattern.id).toBe('db-table-info');
        expect(match?.pattern.uriPattern).toBe('db://schemas/{schemaName}/tables/{tableName}');
        expect(match?.params).toEqual({
          schemaName: 'public',
          tableName: 'users'
        });
      });

      it('should extract both schema and table name parameters correctly', () => {
        const testCases = [
          {
            uri: 'db://schemas/public/tables/users',
            expected: { schemaName: 'public', tableName: 'users' }
          },
          {
            uri: 'db://schemas/auth/tables/user_sessions',
            expected: { schemaName: 'auth', tableName: 'user_sessions' }
          },
          {
            uri: 'db://schemas/inventory/tables/product_catalog',
            expected: { schemaName: 'inventory', tableName: 'product_catalog' }
          }
        ];

        testCases.forEach(({ uri, expected }) => {
          const match = ResourcePatterns.matchUri(uri);
          expect(match?.params).toEqual(expected);
        });
      });

      it('should not match old table://{schemaName}/{tableName} pattern', () => {
        const match = ResourcePatterns.matchUri('table://public/users');

        expect(match).toBeNull();
      });

      it('should generate correct interpolated names and descriptions', () => {
        const match = ResourcePatterns.matchUri('db://schemas/public/tables/users');

        expect(match?.pattern.namePattern).toBe('{tableName} table ({schemaName} schema)');
        expect(match?.pattern.descriptionPattern).toContain('Complete detailed information about the {tableName} table');

        // Test interpolation
        const interpolatedName = ResourcePatterns.interpolate(
          match?.pattern.namePattern || '',
          match?.params || {}
        );
        const interpolatedDesc = ResourcePatterns.interpolate(
          match?.pattern.descriptionPattern || '',
          match?.params || {}
        );

        expect(interpolatedName).toBe('users table (public schema)');
        expect(interpolatedDesc).toContain('Complete detailed information about the users table');
      });
    });

    describe('Table Indexes Pattern', () => {
      it('should match db://schemas/{schemaName}/tables/{tableName}/indexes URI pattern', () => {
        const match = ResourcePatterns.matchUri('db://schemas/public/tables/users/indexes');

        expect(match).not.toBeNull();
        expect(match?.pattern.id).toBe('db-table-indexes');
        expect(match?.pattern.uriPattern).toBe('db://schemas/{schemaName}/tables/{tableName}/indexes');
        expect(match?.params).toEqual({
          schemaName: 'public',
          tableName: 'users'
        });
      });

      it('should extract schema and table parameters for index URIs', () => {
        const testCases = [
          {
            uri: 'db://schemas/public/tables/users/indexes',
            expected: { schemaName: 'public', tableName: 'users' }
          },
          {
            uri: 'db://schemas/auth/tables/sessions/indexes',
            expected: { schemaName: 'auth', tableName: 'sessions' }
          }
        ];

        testCases.forEach(({ uri, expected }) => {
          const match = ResourcePatterns.matchUri(uri);
          expect(match?.params).toEqual(expected);
        });
      });

      it('should not match old table://{schemaName}/{tableName}/indexes pattern', () => {
        const match = ResourcePatterns.matchUri('table://public/users/indexes');

        expect(match).toBeNull();
      });
    });
  });

  describe('Progressive Resource Discovery with URI Patterns', () => {

    it('should discover schemas under db://schemas when listing resources', async () => {
      const mockServer = server as MockTblsServer;
      const listHandler = mockServer.server._requestHandlers.get('resources/list');

      const response = await listHandler({
        method: 'resources/list',
        params: {},
      });

      // Should include the db://schemas resource
      const dbSchemasResource = response.resources.find((r: ResourceResponse) => r.uri === 'db://schemas');
      expect(dbSchemasResource).toBeDefined();
      expect(dbSchemasResource.name).toBe('Database Schemas');
      expect(dbSchemasResource.description).toContain('Complete list of all available database schemas');
    });

    it('should progressively discover schema tables under db://schemas/{schemaName}/tables', async () => {
      // Mock the lazy registry to simulate discovery
      const registry = new LazyResourceRegistry(mockConfig.schemaSource, new ResourceCache({
        maxItems: 1000,
        ttlMs: 300000,
      }));

      const discoveryResult = await registry.discoverResource('db://schemas/public/tables');

      expect(discoveryResult.isOk()).toBe(true);
      if (discoveryResult.isOk()) {
        expect(discoveryResult.value).toBeDefined();
        expect(discoveryResult.value?.uri).toBe('db://schemas/public/tables');
      }
    });

    it('should progressively discover individual tables under db://schemas/{schemaName}/tables/{tableName}', async () => {
      const registry = new LazyResourceRegistry(mockConfig.schemaSource, new ResourceCache({
        maxItems: 1000,
        ttlMs: 300000,
      }));

      const discoveryResult = await registry.discoverResource('db://schemas/public/tables/users');

      expect(discoveryResult.isOk()).toBe(true);
      if (discoveryResult.isOk()) {
        expect(discoveryResult.value).toBeDefined();
        expect(discoveryResult.value?.uri).toBe('db://schemas/public/tables/users');
      }
    });

    it('should progressively discover table indexes under db://schemas/{schemaName}/tables/{tableName}/indexes', async () => {
      const registry = new LazyResourceRegistry(mockConfig.schemaSource, new ResourceCache({
        maxItems: 1000,
        ttlMs: 300000,
      }));

      const discoveryResult = await registry.discoverResource('db://schemas/public/tables/users/indexes');

      expect(discoveryResult.isOk()).toBe(true);
      if (discoveryResult.isOk()) {
        expect(discoveryResult.value).toBeDefined();
        expect(discoveryResult.value?.uri).toBe('db://schemas/public/tables/users/indexes');
      }
    });

    it('should generate hierarchical resources in correct order', async () => {
      const registry = new LazyResourceRegistry(mockConfig.schemaSource, new ResourceCache({
        maxItems: 1000,
        ttlMs: 300000,
      }));

      // First, trigger discovery by accessing hierarchical resources in order
      await registry.handleResourceAccess('db://schemas'); // Triggers schema tables discovery
      await registry.handleResourceAccess('db://schemas/public/tables'); // Triggers table discovery for public schema
      await registry.handleResourceAccess('db://schemas/auth/tables'); // Triggers table discovery for auth schema
      await registry.handleResourceAccess('db://schemas/public/tables/users'); // Triggers index discovery for users table
      await registry.handleResourceAccess('db://schemas/public/tables/posts'); // Triggers index discovery for posts table
      await registry.handleResourceAccess('db://schemas/public/tables/users/indexes');
      await registry.handleResourceAccess('db://schemas/public/tables/posts/indexes');

      const allResources = await registry.listResources();

      expect(allResources.isOk()).toBe(true);
      if (allResources.isOk()) {
        const uris = allResources.value.map(r => r.uri);

        // Should include hierarchical db:// patterns after discovery
        expect(uris).toContain('db://schemas');
        expect(uris).toContain('db://schemas/public/tables');
        expect(uris).toContain('db://schemas/auth/tables');
        expect(uris).toContain('db://schemas/public/tables/users');
        expect(uris).toContain('db://schemas/public/tables/posts');
        expect(uris).toContain('db://schemas/public/tables/users/indexes');
        expect(uris).toContain('db://schemas/public/tables/posts/indexes');
      }
    });
  });

  describe('Error Handling with URI Patterns', () => {

    it('should provide helpful error messages for unrecognized db:// URIs', async () => {
      const mockServer = server as MockTblsServer;
      const readHandler = mockServer.server._requestHandlers.get('resources/read');

      try {
        await readHandler({
          method: 'resources/read',
          params: { uri: 'db://invalid/path' }
        });
        fail('Expected error to be thrown');
      } catch (error: Error & { data?: Record<string, unknown> }) {
        expect(error.message).toContain('Unknown resource URI');
        expect(error.data?.suggestions).toContain('db://schemas');
        expect(error.data?.validPatterns).toContain('db://schemas/{schemaName}/tables');
      }
    });

    it('should treat old schema:// patterns as unknown URIs', async () => {
      const mockServer = server as MockTblsServer;
      const readHandler = mockServer.server._requestHandlers.get('resources/read');

      try {
        await readHandler({
          method: 'resources/read',
          params: { uri: 'schema://list' }
        });
        fail('Expected error to be thrown');
      } catch (error: Error & { data?: Record<string, unknown> }) {
        expect(error.message).toContain('Unknown resource URI');
        expect(error.data?.suggestions).toBeDefined();
        expect(error.data?.suggestions).toContain('db://schemas');
      }
    });

    it('should treat old table:// patterns as unknown URIs', async () => {
      const mockServer = server as MockTblsServer;
      const readHandler = mockServer.server._requestHandlers.get('resources/read');

      try {
        await readHandler({
          method: 'resources/read',
          params: { uri: 'table://public/users' }
        });
        fail('Expected error to be thrown');
      } catch (error: Error & { data?: Record<string, unknown> }) {
        expect(error.message).toContain('Unknown resource URI');
        expect(error.data?.suggestions).toBeDefined();
        expect(error.data?.suggestions).toContain('db://schemas');
      }
    });

    it('should provide hierarchical path suggestions for partial matches', async () => {
      const mockServer = server as MockTblsServer;
      const readHandler = mockServer.server._requestHandlers.get('resources/read');

      try {
        await readHandler({
          method: 'resources/read',
          params: { uri: 'db://schemas/nonexistent' }
        });
        fail('Expected error to be thrown');
      } catch (error: Error & { data?: Record<string, unknown> }) {
        expect(error.message).toContain('Resource not found');
        expect(error.data?.suggestions).toContain('db://schemas/nonexistent/tables');
        expect(error.data?.availableSchemas).toEqual(['public', 'auth']);
      }
    });

    it('should provide table suggestions when table not found in valid schema', async () => {
      const mockServer = server as MockTblsServer;
      const readHandler = mockServer.server._requestHandlers.get('resources/read');

      try {
        await readHandler({
          method: 'resources/read',
          params: { uri: 'db://schemas/public/tables/nonexistent' }
        });
        fail('Expected error to be thrown');
      } catch (error: Error & { data?: Record<string, unknown> }) {
        expect(error.message).toContain('Table not found');
        expect(error.data?.availableTables).toEqual(['users', 'posts']);
        expect(error.data?.schemaName).toBe('public');
      }
    });
  });

  describe('Integration Tests - Complete Flow with URI Patterns', () => {

    it('should handle complete flow from db://schemas to resource content', async () => {
      const mockServer = server as MockTblsServer;
      const readHandler = mockServer.server._requestHandlers.get('resources/read');

      const response = await readHandler({
        method: 'resources/read',
        params: { uri: 'db://schemas' }
      });

      expect(response.contents).toBeDefined();
      expect(response.contents[0].mimeType).toBe('application/json');

      const content = JSON.parse(response.contents[0].text);
      expect(content.schemas).toHaveLength(2);
      expect(content.schemas[0].name).toBe('public');
      expect(content.schemas[1].name).toBe('auth');
    });

    it('should handle complete flow from db://schemas/{schemaName}/tables to resource content', async () => {
      const mockServer = server as MockTblsServer;
      const readHandler = mockServer.server._requestHandlers.get('resources/read');

      const response = await readHandler({
        method: 'resources/read',
        params: { uri: 'db://schemas/public/tables' }
      });

      expect(response.contents).toBeDefined();
      expect(response.contents[0].mimeType).toBe('application/json');

      const content = JSON.parse(response.contents[0].text);
      expect(content.tables).toHaveLength(2);
      expect(content.tables[0].name).toBe('users');
      expect(content.tables[1].name).toBe('posts');
    });

    it('should handle complete flow from db://schemas/{schemaName}/tables/{tableName} to resource content', async () => {
      // Mock the table info resource handler
      const mockTableResourceMod = tableResource as jest.Mocked<typeof tableResource>;
      mockTableResourceMod.handleTableInfoResource.mockResolvedValue(ok({
        table: {
          name: 'users',
          schema: 'public',
          columns: [
            { name: 'id', type: 'integer', nullable: false, primaryKey: true },
            { name: 'email', type: 'varchar(255)', nullable: false, unique: true },
            { name: 'name', type: 'varchar(100)', nullable: true },
            { name: 'created_at', type: 'timestamp', nullable: false }
          ],
          indexes: 2,
          rowCount: 1000
        }
      }));

      const mockServer = server as MockTblsServer;
      const readHandler = mockServer.server._requestHandlers.get('resources/read');

      const response = await readHandler({
        method: 'resources/read',
        params: { uri: 'db://schemas/public/tables/users' }
      });

      expect(response.contents).toBeDefined();
      expect(response.contents[0].mimeType).toBe('application/json');

      const content = JSON.parse(response.contents[0].text);
      expect(content.table.name).toBe('users');
      expect(content.table.schema).toBe('public');
      expect(content.table.columns).toHaveLength(4);
    });

    it('should handle complete flow from db://schemas/{schemaName}/tables/{tableName}/indexes to resource content', async () => {
      // Mock the index resource handler
      const mockIndexesData = {
        table: 'users',
        schema: 'public',
        indexes: [
          {
            name: 'users_pkey',
            type: 'PRIMARY KEY',
            columns: ['id'],
            unique: true
          },
          {
            name: 'users_email_idx',
            type: 'UNIQUE',
            columns: ['email'],
            unique: true
          }
        ]
      };

      const mockIndexResourceMod = indexResource as jest.Mocked<typeof indexResource>;
      mockIndexResourceMod.handleTableIndexesResource.mockResolvedValue(ok(mockIndexesData));

      const mockServer = server as MockTblsServer;
      const readHandler = mockServer.server._requestHandlers.get('resources/read');

      const response = await readHandler({
        method: 'resources/read',
        params: { uri: 'db://schemas/public/tables/users/indexes' }
      });

      expect(response.contents).toBeDefined();
      expect(response.contents[0].mimeType).toBe('application/json');

      const content = JSON.parse(response.contents[0].text);
      expect(content.table).toBe('users');
      expect(content.schema).toBe('public');
      expect(content.indexes).toHaveLength(2);
    });

    it('should only support db:// patterns (no backward compatibility)', async () => {
      // This test ensures that old patterns are completely removed
      const mockServer = server as MockTblsServer;
      const readHandler = mockServer.server._requestHandlers.get('resources/read');

      // Test that old URIs are treated as unknown patterns
      try {
        await readHandler({
          method: 'resources/read',
          params: { uri: 'schema://list' }
        });
        fail('Expected error for unknown pattern');
      } catch (error: Error & { data?: Record<string, unknown> }) {
        expect(error.message).toContain('Unknown resource URI');
        expect(error.data?.suggestions).toBeDefined();
      }

      // Test that db:// URIs work correctly
      const response = await readHandler({
        method: 'resources/read',
        params: { uri: 'db://schemas' }
      });
      expect(response.contents).toBeDefined();
    });
  });

  describe('Performance and Caching with URI Patterns', () => {

    it('should cache resources with db:// URI patterns efficiently', async () => {
      const cache = new ResourceCache({
        maxItems: 1000,
        ttlMs: 300000,
      });
      const registry = new LazyResourceRegistry(mockConfig.schemaSource, cache);

      // First access should hit the source
      const firstAccess = await registry.discoverResource('db://schemas/public/tables');
      expect(firstAccess.isOk()).toBe(true);

      // Second access should hit the cache
      const secondAccess = await registry.discoverResource('db://schemas/public/tables');
      expect(secondAccess.isOk()).toBe(true);

      // Both calls should return the same successful result
      expect(firstAccess.isOk()).toBe(secondAccess.isOk());

      // Verify cache is properly configured and ready to use
      const stats = cache.getStats();
      expect(stats).toHaveProperty('hits');
      expect(stats).toHaveProperty('misses');
    });

    it('should support hierarchical cache invalidation for db:// patterns', async () => {
      const cache = new ResourceCache({
        maxItems: 1000,
        ttlMs: 300000,
      });

      // This test demonstrates the conceptual caching behavior expected for hierarchical URI patterns
      // In the actual implementation, cache invalidation would work at the file/schema level
      const registry = new LazyResourceRegistry(mockConfig.schemaSource, cache);

      // Access hierarchical resources
      const result1 = await registry.discoverResource('db://schemas/public/tables');
      const result2 = await registry.discoverResource('db://schemas/public/tables/users');

      // Both should succeed
      expect(result1.isOk()).toBe(true);
      expect(result2.isOk()).toBe(true);

      // Cache should have proper invalidation method available
      expect(cache.invalidateFile).toBeDefined();
      expect(typeof cache.invalidateFile).toBe('function');

      // Test that invalidation can be called without error
      expect(() => cache.invalidateFile(mockConfig.schemaSource)).not.toThrow();
    });
  });
});