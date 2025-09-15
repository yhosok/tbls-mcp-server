import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { ResourceCache } from '../../src/cache/resource-cache';
import { handleTableInfoResource } from '../../src/resources/table-resource';

describe('Table Caching Fix Demonstration', () => {
  let tempDir: string;
  let schemaSource: string;
  let cache: ResourceCache;

  beforeEach(async () => {
    // Create a temporary directory for tests
    tempDir = await fs.mkdtemp(join(tmpdir(), 'tbls-fix-demo-'));
    schemaSource = join(tempDir, 'schemas');
    await fs.mkdir(schemaSource);

    // Create cache instance
    cache = new ResourceCache({
      maxItems: 100,
      ttlMs: 60000, // 1 minute
    });
  });

  afterEach(async () => {
    // Clean up temporary directory and cache
    await fs.rm(tempDir, { recursive: true, force: true });
    cache.clear();
  });

  describe('Fixed Table Caching Behavior', () => {
    it('should demonstrate correct caching behavior with table-specific keys', async () => {
      // Create a schema.json with multiple tables
      const schema = {
        name: 'default',
        desc: 'Multi-table schema for caching demonstration',
        tables: [
          {
            name: 'users',
            type: 'TABLE',
            comment: 'User accounts',
            columns: [
              {
                name: 'id',
                type: 'bigint(20)',
                nullable: false,
                comment: 'User ID',
              },
              {
                name: 'email',
                type: 'varchar(255)',
                nullable: false,
                comment: 'Email address',
              },
            ],
          },
          {
            name: 'products',
            type: 'TABLE',
            comment: 'Product catalog',
            columns: [
              {
                name: 'id',
                type: 'bigint(20)',
                nullable: false,
                comment: 'Product ID',
              },
              {
                name: 'name',
                type: 'varchar(255)',
                nullable: false,
                comment: 'Product name',
              },
              {
                name: 'price',
                type: 'decimal(10,2)',
                nullable: false,
                comment: 'Product price',
              },
            ],
          },
        ],
      };

      await fs.writeFile(
        join(schemaSource, 'schema.json'),
        JSON.stringify(schema, null, 2)
      );

      // Clear cache and get initial stats
      cache.clear();
      const initialStats = cache.getStats();
      expect(initialStats.hits).toBe(0);
      expect(initialStats.misses).toBe(0);
      expect(initialStats.size).toBe(0);

      console.log('Initial cache stats:', initialStats);

      // STEP 1: First request for 'users' table
      const usersResult1 = await handleTableInfoResource(
        schemaSource,
        'default',
        'users',
        cache
      );

      expect(usersResult1.isOk()).toBe(true);
      const users1 = usersResult1.value?.table;
      expect(users1?.name).toBe('users');
      expect(users1?.columns).toHaveLength(2);

      const step1Stats = cache.getStats();
      console.log('After first users request:', step1Stats);
      expect(step1Stats.misses).toBe(1); // First request is a miss
      expect(step1Stats.hits).toBe(0); // No hits yet
      expect(step1Stats.size).toBe(1); // One cached table

      // STEP 2: First request for 'products' table (different table)
      const productsResult1 = await handleTableInfoResource(
        schemaSource,
        'default',
        'products',
        cache
      );

      expect(productsResult1.isOk()).toBe(true);
      const products1 = productsResult1.value?.table;
      expect(products1?.name).toBe('products');
      expect(products1?.columns).toHaveLength(3);

      const step2Stats = cache.getStats();
      console.log('After first products request:', step2Stats);
      expect(step2Stats.misses).toBe(2); // Second table request is also a miss
      expect(step2Stats.hits).toBe(0); // Still no hits
      expect(step2Stats.size).toBe(2); // Two cached tables

      // STEP 3: Second request for 'users' table (should be cache hit)
      const usersResult2 = await handleTableInfoResource(
        schemaSource,
        'default',
        'users',
        cache
      );

      expect(usersResult2.isOk()).toBe(true);
      const users2 = usersResult2.value?.table;
      expect(users2?.name).toBe('users');
      expect(users2?.columns).toHaveLength(2);

      const step3Stats = cache.getStats();
      console.log('After second users request (cache hit):', step3Stats);
      expect(step3Stats.misses).toBe(2); // No new misses
      expect(step3Stats.hits).toBe(1); // First cache hit!
      expect(step3Stats.size).toBe(2); // Still two cached tables

      // STEP 4: Second request for 'products' table (should be cache hit)
      const productsResult2 = await handleTableInfoResource(
        schemaSource,
        'default',
        'products',
        cache
      );

      expect(productsResult2.isOk()).toBe(true);
      const products2 = productsResult2.value?.table;
      expect(products2?.name).toBe('products');
      expect(products2?.columns).toHaveLength(3);

      const step4Stats = cache.getStats();
      console.log('After second products request (cache hit):', step4Stats);
      expect(step4Stats.misses).toBe(2); // Still no new misses
      expect(step4Stats.hits).toBe(2); // Second cache hit!
      expect(step4Stats.size).toBe(2); // Still two cached tables

      // STEP 5: Verify tables are distinct and correct
      expect(users2?.name).toBe('users');
      expect(products2?.name).toBe('products');

      // Users table should have email column
      const emailColumn = users2?.columns.find(c => c.name === 'email');
      expect(emailColumn).toBeDefined();
      expect(emailColumn?.comment).toBe('Email address');

      // Products table should have price column
      const priceColumn = products2?.columns.find(c => c.name === 'price');
      expect(priceColumn).toBeDefined();
      expect(priceColumn?.comment).toBe('Product price');

      // Products table should NOT have email column
      const emailInProducts = products2?.columns.find(c => c.name === 'email');
      expect(emailInProducts).toBeUndefined();

      // Users table should NOT have price column
      const priceInUsers = users2?.columns.find(c => c.name === 'price');
      expect(priceInUsers).toBeUndefined();

      // Final verification: hit rate should be 50% (2 hits out of 4 requests)
      const finalStats = cache.getStats();
      console.log('Final cache stats:', finalStats);
      expect(finalStats.hits).toBe(2);
      expect(finalStats.misses).toBe(2);
      expect(finalStats.hitRate).toBe(0.5);
      expect(finalStats.size).toBe(2);
    });

    it('should maintain separate cache entries for same table name in different schemas', async () => {
      // Create multi-schema setup
      const publicDir = join(schemaSource, 'public');
      const privateDir = join(schemaSource, 'private');
      await fs.mkdir(publicDir);
      await fs.mkdir(privateDir);

      // Create 'users' table in public schema
      const publicSchema = {
        name: 'public',
        desc: 'Public schema',
        tables: [
          {
            name: 'users',
            type: 'TABLE',
            comment: 'Public user accounts',
            columns: [
              {
                name: 'id',
                type: 'bigint(20)',
                nullable: false,
                comment: 'Public user ID',
              },
              {
                name: 'public_field',
                type: 'varchar(255)',
                nullable: false,
                comment: 'Public-specific field',
              },
            ],
          },
        ],
      };

      // Create 'users' table in private schema (different structure)
      const privateSchema = {
        name: 'private',
        desc: 'Private schema',
        tables: [
          {
            name: 'users',
            type: 'TABLE',
            comment: 'Private user accounts',
            columns: [
              {
                name: 'id',
                type: 'bigint(20)',
                nullable: false,
                comment: 'Private user ID',
              },
              {
                name: 'private_field',
                type: 'varchar(255)',
                nullable: false,
                comment: 'Private-specific field',
              },
              {
                name: 'secret_data',
                type: 'text',
                nullable: true,
                comment: 'Secret information',
              },
            ],
          },
        ],
      };

      await fs.writeFile(
        join(publicDir, 'schema.json'),
        JSON.stringify(publicSchema, null, 2)
      );
      await fs.writeFile(
        join(privateDir, 'schema.json'),
        JSON.stringify(privateSchema, null, 2)
      );

      // Clear cache
      cache.clear();

      // Request users from public schema
      const publicUsersResult = await handleTableInfoResource(
        schemaSource,
        'public',
        'users',
        cache
      );

      expect(publicUsersResult.isOk()).toBe(true);
      const publicUsers = publicUsersResult.value?.table;
      expect(publicUsers?.name).toBe('users');
      expect(publicUsers?.comment).toBe('Public user accounts');
      expect(publicUsers?.columns).toHaveLength(2);

      // Request users from private schema
      const privateUsersResult = await handleTableInfoResource(
        schemaSource,
        'private',
        'users',
        cache
      );

      expect(privateUsersResult.isOk()).toBe(true);
      const privateUsers = privateUsersResult.value?.table;
      expect(privateUsers?.name).toBe('users');
      expect(privateUsers?.comment).toBe('Private user accounts');
      expect(privateUsers?.columns).toHaveLength(3);

      // Verify they are different tables
      const publicField = publicUsers?.columns.find(c => c.name === 'public_field');
      const privateField = privateUsers?.columns.find(c => c.name === 'private_field');
      const secretField = privateUsers?.columns.find(c => c.name === 'secret_data');

      expect(publicField).toBeDefined();
      expect(privateField).toBeDefined();
      expect(secretField).toBeDefined();

      // Public users should not have private fields
      const privateInPublic = publicUsers?.columns.find(c => c.name === 'private_field');
      expect(privateInPublic).toBeUndefined();

      // Private users should not have public fields
      const publicInPrivate = privateUsers?.columns.find(c => c.name === 'public_field');
      expect(publicInPrivate).toBeUndefined();

      // Cache should contain 2 separate entries
      const stats = cache.getStats();
      expect(stats.size).toBe(2);
      expect(stats.misses).toBe(2); // Both are first-time requests
      expect(stats.hits).toBe(0);

      console.log('Multi-schema cache stats:', stats);
    });

    it('should demonstrate cache invalidation works correctly', async () => {
      const schema = {
        name: 'default',
        desc: 'Schema for invalidation test',
        tables: [
          {
            name: 'test_table',
            type: 'TABLE',
            comment: 'Test table for invalidation',
            columns: [
              {
                name: 'id',
                type: 'bigint(20)',
                nullable: false,
                comment: 'ID',
              },
            ],
          },
        ],
      };

      const schemaJsonPath = join(schemaSource, 'schema.json');
      await fs.writeFile(schemaJsonPath, JSON.stringify(schema, null, 2));

      // First request - should be cached
      const result1 = await handleTableInfoResource(
        schemaSource,
        'default',
        'test_table',
        cache
      );

      expect(result1.isOk()).toBe(true);
      const stats1 = cache.getStats();
      expect(stats1.misses).toBe(1);
      expect(stats1.hits).toBe(0);
      expect(stats1.size).toBe(1);

      // Second request - should be cache hit
      const result2 = await handleTableInfoResource(
        schemaSource,
        'default',
        'test_table',
        cache
      );

      expect(result2.isOk()).toBe(true);
      const stats2 = cache.getStats();
      expect(stats2.misses).toBe(1);
      expect(stats2.hits).toBe(1);
      expect(stats2.size).toBe(1);

      // Invalidate the cache for this file
      cache.invalidateFile(schemaJsonPath);

      // Check cache is invalidated
      const stats3 = cache.getStats();
      expect(stats3.size).toBe(0); // Cache should be empty

      // Third request - should be cache miss again
      const result3 = await handleTableInfoResource(
        schemaSource,
        'default',
        'test_table',
        cache
      );

      expect(result3.isOk()).toBe(true);
      const stats4 = cache.getStats();
      expect(stats4.misses).toBe(2); // New miss after invalidation
      expect(stats4.hits).toBe(1); // Hit count remains
      expect(stats4.size).toBe(1); // Cached again

      console.log('After invalidation test:', stats4);
    });
  });
});