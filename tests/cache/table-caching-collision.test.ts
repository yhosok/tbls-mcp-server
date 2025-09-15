import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { ResourceCache } from '../../src/cache/resource-cache';
import { handleTableInfoResource } from '../../src/resources/table-resource';
import type { TableInfoResource } from '../../src/schemas/database';

describe('Table Caching Collision Issue', () => {
  let tempDir: string;
  let schemaSource: string;
  let cache: ResourceCache;

  beforeEach(async () => {
    // Create a temporary directory for tests
    tempDir = await fs.mkdtemp(join(tmpdir(), 'tbls-cache-test-'));
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

  describe('Caching Collision Issue (FIXED)', () => {
    it('should cache different tables from same schema separately - FIXED', async () => {
      // Create a schema.json with multiple tables
      const fullSchema = {
        name: 'default',
        desc: 'Database with multiple tables',
        tables: [
          {
            name: 'users',
            type: 'TABLE',
            comment: 'User accounts table',
            columns: [
              {
                name: 'id',
                type: 'bigint(20)',
                nullable: false,
                default: null,
                extra_def: 'auto_increment',
                comment: 'User ID',
              },
              {
                name: 'email',
                type: 'varchar(255)',
                nullable: false,
                default: null,
                comment: 'User email address',
              },
              {
                name: 'name',
                type: 'varchar(255)',
                nullable: true,
                default: null,
                comment: 'User full name',
              },
            ],
            indexes: [
              {
                name: 'PRIMARY',
                def: 'PRIMARY KEY (id)',
                table: 'users',
                columns: ['id'],
                comment: 'Primary key index',
              },
            ],
          },
          {
            name: 'products',
            type: 'TABLE',
            comment: 'Product catalog table',
            columns: [
              {
                name: 'id',
                type: 'bigint(20)',
                nullable: false,
                default: null,
                extra_def: 'auto_increment',
                comment: 'Product ID',
              },
              {
                name: 'product_name',
                type: 'varchar(255)',
                nullable: false,
                default: null,
                comment: 'Product name',
              },
              {
                name: 'price',
                type: 'decimal(10,2)',
                nullable: false,
                default: null,
                comment: 'Product price',
              },
              {
                name: 'category_id',
                type: 'bigint(20)',
                nullable: true,
                default: null,
                comment: 'Category reference',
              },
            ],
            indexes: [
              {
                name: 'PRIMARY',
                def: 'PRIMARY KEY (id)',
                table: 'products',
                columns: ['id'],
                comment: 'Primary key index',
              },
              {
                name: 'idx_category',
                def: 'KEY idx_category (category_id)',
                table: 'products',
                columns: ['category_id'],
                comment: 'Category index',
              },
            ],
          },
          {
            name: 'orders',
            type: 'TABLE',
            comment: 'Customer orders table',
            columns: [
              {
                name: 'id',
                type: 'bigint(20)',
                nullable: false,
                default: null,
                extra_def: 'auto_increment',
                comment: 'Order ID',
              },
              {
                name: 'user_id',
                type: 'bigint(20)',
                nullable: false,
                default: null,
                comment: 'Customer reference',
              },
              {
                name: 'total_amount',
                type: 'decimal(10,2)',
                nullable: false,
                default: null,
                comment: 'Total order amount',
              },
              {
                name: 'status',
                type: 'enum("pending","confirmed","shipped","delivered","cancelled")',
                nullable: false,
                default: 'pending',
                comment: 'Order status',
              },
            ],
          },
        ],
      };

      await fs.writeFile(
        join(schemaSource, 'schema.json'),
        JSON.stringify(fullSchema, null, 2)
      );

      // STEP 1: Request 'users' table - should cache 'users' table
      const usersResult = await handleTableInfoResource(
        schemaSource,
        'default',
        'users',
        cache
      );

      if (usersResult.isErr()) {
        console.log('Users result error:', usersResult.error.message);
      }
      expect(usersResult.isOk()).toBe(true);
      if (usersResult.isOk()) {
        const usersResource: TableInfoResource = usersResult.value;
        expect(usersResource.table.name).toBe('users');
        expect(usersResource.table.comment).toBe('User accounts table');
        expect(usersResource.table.columns).toHaveLength(3);

        // Verify it's actually the users table
        const emailColumn = usersResource.table.columns.find(c => c.name === 'email');
        expect(emailColumn).toBeDefined();
        expect(emailColumn?.comment).toBe('User email address');
      }

      // STEP 2: Request 'products' table - THIS WILL CAUSE CACHE COLLISION
      // The current cache implementation uses same key for both tables!
      const productsResult = await handleTableInfoResource(
        schemaSource,
        'default',
        'products',
        cache
      );

      expect(productsResult.isOk()).toBe(true);
      if (productsResult.isOk()) {
        const productsResource: TableInfoResource = productsResult.value;

        // THIS SHOULD PASS and now DOES PASS due to cache collision fix
        // The cache will return correct 'products' table, not 'users' table
        expect(productsResource.table.name).toBe('products');
        expect(productsResource.table.comment).toBe('Product catalog table');
        expect(productsResource.table.columns).toHaveLength(4);

        // Verify it's actually the products table, not users
        const productNameColumn = productsResource.table.columns.find(c => c.name === 'product_name');
        expect(productNameColumn).toBeDefined();
        expect(productNameColumn?.comment).toBe('Product name');

        const priceColumn = productsResource.table.columns.find(c => c.name === 'price');
        expect(priceColumn).toBeDefined();
        expect(priceColumn?.comment).toBe('Product price');

        // Should NOT have user-specific columns
        const emailColumn = productsResource.table.columns.find(c => c.name === 'email');
        expect(emailColumn).toBeUndefined();
      }

      // STEP 3: Request 'orders' table - should also have collision
      const ordersResult = await handleTableInfoResource(
        schemaSource,
        'default',
        'orders',
        cache
      );

      expect(ordersResult.isOk()).toBe(true);
      if (ordersResult.isOk()) {
        const ordersResource: TableInfoResource = ordersResult.value;

        // THIS SHOULD PASS and now DOES PASS due to cache collision fix
        expect(ordersResource.table.name).toBe('orders');
        expect(ordersResource.table.comment).toBe('Customer orders table');
        expect(ordersResource.table.columns).toHaveLength(4);

        // Verify it's actually the orders table
        const statusColumn = ordersResource.table.columns.find(c => c.name === 'status');
        expect(statusColumn).toBeDefined();
        expect(statusColumn?.type).toBe('enum("pending","confirmed","shipped","delivered","cancelled")');

        const totalAmountColumn = ordersResource.table.columns.find(c => c.name === 'total_amount');
        expect(totalAmountColumn).toBeDefined();
        expect(totalAmountColumn?.comment).toBe('Total order amount');
      }

      // STEP 4: Request 'users' table again - should return cached users, not other tables
      const usersResult2 = await handleTableInfoResource(
        schemaSource,
        'default',
        'users',
        cache
      );

      expect(usersResult2.isOk()).toBe(true);
      if (usersResult2.isOk()) {
        const usersResource2: TableInfoResource = usersResult2.value;

        // Should still be users table, not overwritten by products/orders
        expect(usersResource2.table.name).toBe('users');
        expect(usersResource2.table.comment).toBe('User accounts table');
        expect(usersResource2.table.columns).toHaveLength(3);
      }
    });

    it('should demonstrate that cache keys are now table-specific (FIXED)', async () => {
      // Create schema with two different tables
      const schema = {
        name: 'default',
        desc: 'Schema to test cache collisions',
        tables: [
          {
            name: 'table_a',
            type: 'TABLE',
            comment: 'First table',
            columns: [
              {
                name: 'id',
                type: 'bigint(20)',
                nullable: false,
                comment: 'ID for table A',
              },
              {
                name: 'field_a',
                type: 'varchar(255)',
                nullable: false,
                comment: 'Field specific to table A',
              },
            ],
          },
          {
            name: 'table_b',
            type: 'TABLE',
            comment: 'Second table',
            columns: [
              {
                name: 'id',
                type: 'bigint(20)',
                nullable: false,
                comment: 'ID for table B',
              },
              {
                name: 'field_b',
                type: 'varchar(255)',
                nullable: false,
                comment: 'Field specific to table B',
              },
            ],
          },
        ],
      };

      const schemaJsonPath = join(schemaSource, 'schema.json');
      await fs.writeFile(schemaJsonPath, JSON.stringify(schema, null, 2));

      // First request: table_a
      const tableAResult = await handleTableInfoResource(
        schemaSource,
        'default',
        'table_a',
        cache
      );

      expect(tableAResult.isOk()).toBe(true);
      const tableA = tableAResult.value?.table;
      expect(tableA?.name).toBe('table_a');
      expect(tableA?.comment).toBe('First table');

      // Check cache statistics - should have 1 miss (no cache hit)
      let stats = cache.getStats();
      expect(stats.misses).toBeGreaterThan(0);
      const missesAfterTableA = stats.misses;

      // Second request: table_b (different table, same schema file)
      const tableBResult = await handleTableInfoResource(
        schemaSource,
        'default',
        'table_b',
        cache
      );

      expect(tableBResult.isOk()).toBe(true);
      const tableB = tableBResult.value?.table;

      // THIS NOW WORKS: No cache collision, table_b request returns correct table_b data
      expect(tableB?.name).toBe('table_b');
      expect(tableB?.comment).toBe('Second table');

      // Should have field_b, not field_a
      const fieldB = tableB?.columns.find(c => c.name === 'field_b');
      expect(fieldB).toBeDefined();
      expect(fieldB?.comment).toBe('Field specific to table B');

      // Should NOT have field_a from table_a
      const fieldA = tableB?.columns.find(c => c.name === 'field_a');
      expect(fieldA).toBeUndefined();

      // Check cache statistics - should show cache hit (collision evidence)
      stats = cache.getStats();

      // Working correctly: should be another miss since it's different table
      // No collision now: cache key is table-specific
      expect(stats.misses).toBe(missesAfterTableA + 1); // Should be new miss, not hit
    });

    it('should show that cache hit rate is correct with no artificial inflation (FIXED)', async () => {
      const schema = {
        name: 'default',
        desc: 'Schema to test artificial hit rate inflation',
        tables: [
          {
            name: 'customers',
            type: 'TABLE',
            comment: 'Customer data',
            columns: [
              { name: 'id', type: 'bigint(20)', nullable: false, comment: 'Customer ID' },
              { name: 'customer_name', type: 'varchar(255)', nullable: false, comment: 'Customer name' },
            ],
          },
          {
            name: 'suppliers',
            type: 'TABLE',
            comment: 'Supplier data',
            columns: [
              { name: 'id', type: 'bigint(20)', nullable: false, comment: 'Supplier ID' },
              { name: 'supplier_name', type: 'varchar(255)', nullable: false, comment: 'Supplier name' },
            ],
          },
          {
            name: 'inventory',
            type: 'TABLE',
            comment: 'Inventory data',
            columns: [
              { name: 'id', type: 'bigint(20)', nullable: false, comment: 'Inventory ID' },
              { name: 'item_name', type: 'varchar(255)', nullable: false, comment: 'Item name' },
            ],
          },
        ],
      };

      await fs.writeFile(
        join(schemaSource, 'schema.json'),
        JSON.stringify(schema, null, 2)
      );

      // Clear cache to start fresh
      cache.clear();
      const initialStats = cache.getStats();
      expect(initialStats.hits).toBe(0);
      expect(initialStats.misses).toBe(0);

      // Request different tables sequentially
      await handleTableInfoResource(schemaSource, 'default', 'customers', cache);
      await handleTableInfoResource(schemaSource, 'default', 'suppliers', cache);
      await handleTableInfoResource(schemaSource, 'default', 'inventory', cache);

      const finalStats = cache.getStats();

      // Without collision bug: should show correct hit rate (each table is different, so mostly misses)
      // With the fix: hit rate should be low for different tables
      // No artificial inflation due to collision
      console.log('Cache stats after requesting 3 different tables:', finalStats);

      // Expected behavior: Each table request should be a cache miss initially
      // So we expect 3 misses, 0 hits for first-time requests
      expect(finalStats.misses).toBe(3);
      expect(finalStats.hits).toBe(0);
      expect(finalStats.hitRate).toBe(0);
    });
  });

  describe('Cache Key Structure Analysis', () => {
    it('should demonstrate that cache keys are now table-specific (FIXED)', async () => {
      const schema = {
        name: 'default',
        desc: 'Schema for analyzing cache keys',
        tables: [
          {
            name: 'analytics_events',
            type: 'TABLE',
            comment: 'Analytics events table',
            columns: [
              { name: 'id', type: 'bigint(20)', nullable: false, comment: 'Event ID' },
              { name: 'event_type', type: 'varchar(100)', nullable: false, comment: 'Type of event' },
            ],
          },
          {
            name: 'user_sessions',
            type: 'TABLE',
            comment: 'User sessions table',
            columns: [
              { name: 'id', type: 'bigint(20)', nullable: false, comment: 'Session ID' },
              { name: 'session_data', type: 'text', nullable: true, comment: 'Session data' },
            ],
          },
        ],
      };

      const schemaJsonPath = join(schemaSource, 'schema.json');
      await fs.writeFile(schemaJsonPath, JSON.stringify(schema, null, 2));

      // The fix: Both table requests now use different cache keys
      // Fixed implementation uses: `table:${schemaJsonPath}:${tableName}`

      // Request first table
      await handleTableInfoResource(schemaSource, 'default', 'analytics_events', cache);

      // Request second table - this now creates a DIFFERENT cache entry
      // with fixed implementation, it uses DIFFERENT cache keys
      await handleTableInfoResource(schemaSource, 'default', 'user_sessions', cache);

      // The cache now uses keys like:
      // - "table:/path/to/schema.json:analytics_events"
      // - "table:/path/to/schema.json:user_sessions"

      // This structural fix resolves the collision problem

      // We can verify this by checking that subsequent requests have correct cache behavior
      const stats = cache.getStats();

      // With fix: hits should be 0 for different tables (each is a different cache entry)
      console.log('Cache stats showing fix works:', stats);

      // This demonstrates that cache keys are now table-specific
      expect(stats.hits).toBe(0); // No collision - each table gets its own cache entry
      expect(stats.misses).toBeGreaterThan(0); // Each table request is a miss (correct behavior)
    });
  });
});