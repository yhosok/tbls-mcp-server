import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  handleSchemaTablesResource,
  handleTableInfoResource
} from '../../src/resources/table-resource';
import type { SchemaTablesResource, TableInfoResource } from '../../src/schemas/database';

describe('Table Resource Handlers', () => {
  let tempDir: string;
  let schemaSource: string;

  beforeEach(async () => {
    // Create a temporary directory for tests
    tempDir = await fs.mkdtemp(join(tmpdir(), 'tbls-test-'));
    schemaSource = join(tempDir, 'schemas');
    await fs.mkdir(schemaSource);
  });

  afterEach(async () => {
    // Clean up temporary directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('handleSchemaTablesResource', () => {
    it('should return table list for single schema setup', async () => {
      const schema = {
        name: 'default',
        desc: 'Database Schema',
        tables: [
          {
            name: 'users',
            type: 'TABLE',
            comment: 'User accounts table',
            columns: [
              { name: 'id', type: 'bigint(20)', nullable: false, comment: 'Primary key' },
              { name: 'email', type: 'varchar(255)', nullable: false, comment: 'Email address' },
              { name: 'name', type: 'varchar(255)', nullable: true, comment: 'Full name' },
              { name: 'created_at', type: 'timestamp', nullable: false, comment: 'Creation time' },
              { name: 'updated_at', type: 'timestamp', nullable: false, comment: 'Update time' }
            ]
          },
          {
            name: 'posts',
            type: 'TABLE',
            comment: 'Blog posts table',
            columns: [
              { name: 'id', type: 'bigint(20)', nullable: false, comment: 'Primary key' },
              { name: 'title', type: 'varchar(255)', nullable: false, comment: 'Post title' },
              { name: 'content', type: 'text', nullable: true, comment: 'Post content' }
            ]
          },
          {
            name: 'comments',
            type: 'TABLE',
            comment: 'Post comments table',
            columns: [
              { name: 'id', type: 'bigint(20)', nullable: false, comment: 'Primary key' },
              { name: 'post_id', type: 'bigint(20)', nullable: false, comment: 'Post reference' },
              { name: 'comment', type: 'text', nullable: false, comment: 'Comment text' }
            ]
          }
        ]
      };

      await fs.writeFile(join(schemaSource, 'schema.json'), JSON.stringify(schema, null, 2));

      const result = await handleSchemaTablesResource(schemaSource, 'default');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const resource: SchemaTablesResource = result.value;
        expect(resource.schemaName).toBe('default');
        expect(resource.tables).toHaveLength(3);

        const tableNames = resource.tables.map(t => t.name).sort();
        expect(tableNames).toEqual(['comments', 'posts', 'users']);

        const usersTable = resource.tables.find(t => t.name === 'users');
        expect(usersTable).toEqual({
          name: 'users',
          comment: 'User accounts table',
          columnCount: 5
        });
      }
    });

    it('should return table list for multi-schema setup', async () => {
      const publicSchemaDir = join(schemaSource, 'public');
      await fs.mkdir(publicSchemaDir);

      const publicSchema = {
        name: 'public',
        desc: 'Public schema with user and product data',
        tables: [
          {
            name: 'users',
            type: 'TABLE',
            comment: 'User accounts',
            columns: [
              { name: 'id', type: 'bigint(20)', nullable: false, comment: 'Primary key' },
              { name: 'email', type: 'varchar(255)', nullable: false, comment: 'Email address' },
              { name: 'name', type: 'varchar(255)', nullable: true, comment: 'Full name' },
              { name: 'created_at', type: 'timestamp', nullable: false, comment: 'Creation time' },
              { name: 'updated_at', type: 'timestamp', nullable: false, comment: 'Update time' }
            ]
          },
          {
            name: 'products',
            type: 'TABLE',
            comment: 'Product catalog',
            columns: [
              { name: 'id', type: 'bigint(20)', nullable: false, comment: 'Primary key' },
              { name: 'name', type: 'varchar(255)', nullable: false, comment: 'Product name' },
              { name: 'description', type: 'text', nullable: true, comment: 'Product description' },
              { name: 'price', type: 'decimal(10,2)', nullable: false, comment: 'Product price' },
              { name: 'category_id', type: 'bigint(20)', nullable: true, comment: 'Category reference' },
              { name: 'stock_quantity', type: 'int(11)', nullable: false, comment: 'Stock quantity' },
              { name: 'is_active', type: 'boolean', nullable: false, comment: 'Product status' },
              { name: 'weight', type: 'decimal(8,3)', nullable: true, comment: 'Product weight' },
              { name: 'created_at', type: 'timestamp', nullable: false, comment: 'Creation time' },
              { name: 'updated_at', type: 'timestamp', nullable: false, comment: 'Update time' }
            ]
          },
          {
            name: 'orders',
            type: 'TABLE',
            comment: 'Customer orders',
            columns: [
              { name: 'id', type: 'bigint(20)', nullable: false, comment: 'Primary key' },
              { name: 'user_id', type: 'bigint(20)', nullable: false, comment: 'Customer reference' },
              { name: 'order_number', type: 'varchar(50)', nullable: false, comment: 'Order number' },
              { name: 'status', type: 'varchar(20)', nullable: false, comment: 'Order status' },
              { name: 'total_amount', type: 'decimal(10,2)', nullable: false, comment: 'Total amount' },
              { name: 'shipping_address', type: 'text', nullable: true, comment: 'Shipping address' },
              { name: 'payment_method', type: 'varchar(50)', nullable: true, comment: 'Payment method' },
              { name: 'payment_status', type: 'varchar(20)', nullable: false, comment: 'Payment status' },
              { name: 'notes', type: 'text', nullable: true, comment: 'Order notes' },
              { name: 'shipped_at', type: 'timestamp', nullable: true, comment: 'Shipping time' },
              { name: 'created_at', type: 'timestamp', nullable: false, comment: 'Creation time' },
              { name: 'updated_at', type: 'timestamp', nullable: false, comment: 'Update time' }
            ]
          }
        ]
      };

      await fs.writeFile(join(publicSchemaDir, 'schema.json'), JSON.stringify(publicSchema, null, 2));

      const result = await handleSchemaTablesResource(schemaSource, 'public');
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const resource: SchemaTablesResource = result.value;
        expect(resource.schemaName).toBe('public');
        expect(resource.tables).toHaveLength(3);

        const ordersTable = resource.tables.find(t => t.name === 'orders');
        expect(ordersTable).toEqual({
          name: 'orders',
          comment: 'Customer orders',
          columnCount: 12
        });
      }
    });

    it('should handle schema that does not exist', async () => {
      const result = await handleSchemaTablesResource(schemaSource, 'nonexistent');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('No JSON schema file found');
      }
    });

    it('should handle schema with no tables', async () => {
      const emptySchema = {
        name: 'empty_schema',
        desc: 'Schema with no tables',
        tables: []
      };

      await fs.writeFile(join(schemaSource, 'schema.json'), JSON.stringify(emptySchema, null, 2));

      const result = await handleSchemaTablesResource(schemaSource, 'default');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const resource: SchemaTablesResource = result.value;
        expect(resource.schemaName).toBe('default');
        expect(resource.tables).toHaveLength(0);
      }
    });

    it('should handle invalid JSON schema gracefully', async () => {
      const invalidJsonContent = `{
        "name": "invalid_schema",
        "desc": "Schema with invalid structure",
        "tables": [
          {
            "name": "incomplete_table"
            // Missing required columns array
          }
        ]
      }`;

      await fs.writeFile(join(schemaSource, 'schema.json'), invalidJsonContent);

      const result = await handleSchemaTablesResource(schemaSource, 'default');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('JSON');
      }
    });
  });

  describe('handleTableInfoResource', () => {
    it('should return detailed table information for single schema setup', async () => {
      // Create a detailed table JSON schema with single table
      const usersTableSchema = {
        name: 'users_table_schema',
        desc: 'Schema containing users table',
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
                comment: 'Primary key'
              },
              {
                name: 'email',
                type: 'varchar(255)',
                nullable: false,
                default: null,
                comment: 'User email address'
              },
              {
                name: 'password_hash',
                type: 'varchar(255)',
                nullable: false,
                default: null,
                comment: 'Hashed password'
              },
              {
                name: 'created_at',
                type: 'timestamp',
                nullable: false,
                default: 'CURRENT_TIMESTAMP',
                comment: 'Record creation time'
              },
              {
                name: 'updated_at',
                type: 'timestamp',
                nullable: true,
                default: 'CURRENT_TIMESTAMP',
                comment: 'Record update time'
              }
            ],
            indexes: [
              {
                name: 'PRIMARY',
                def: 'PRIMARY KEY (id)',
                table: 'users',
                columns: ['id'],
                comment: 'Primary key index'
              },
              {
                name: 'users_email_unique',
                def: 'UNIQUE KEY users_email_unique (email)',
                table: 'users',
                columns: ['email'],
                comment: 'Unique email constraint'
              },
              {
                name: 'users_created_at_idx',
                def: 'KEY users_created_at_idx (created_at)',
                table: 'users',
                columns: ['created_at'],
                comment: 'Index for date queries'
              }
            ]
          }
        ]
      };

      await fs.writeFile(join(schemaSource, 'users.json'), JSON.stringify(usersTableSchema, null, 2));

      const result = await handleTableInfoResource(schemaSource, 'default', 'users');

      if (result.isErr()) {
        console.log('handleTableInfoResource error:', result.error.message);
      }
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const resource: TableInfoResource = result.value;
        expect(resource.schemaName).toBe('default');
        expect(resource.table.name).toBe('users');
        expect(resource.table.comment).toBe('User accounts table');
        expect(resource.table.columns).toHaveLength(5);
        expect(resource.table.indexes).toHaveLength(3);
        expect(resource.table.relations).toHaveLength(0);

        // Check specific column details
        const idColumn = resource.table.columns.find(c => c.name === 'id');
        expect(idColumn).toEqual({
          name: 'id',
          type: 'bigint(20)',
          nullable: false,
          defaultValue: null,
          comment: 'Primary key',
          isPrimaryKey: true,
          isAutoIncrement: true,
          maxLength: null,
          precision: null,
          scale: null
        });

        // Check index details
        const primaryIndex = resource.table.indexes.find(i => i.name === 'PRIMARY');
        expect(primaryIndex).toEqual({
          name: 'PRIMARY',
          columns: ['id'],
          isUnique: true,
          isPrimary: true,
          type: 'PRIMARY KEY',
          comment: 'Primary key index'
        });
      }
    });

    it('should return table info for multi-schema setup', async () => {
      const analyticsDir = join(schemaSource, 'analytics');
      await fs.mkdir(analyticsDir);

      const eventsTableSchema = {
        name: 'events_table_schema',
        desc: 'Analytics events table schema',
        tables: [
          {
            name: 'events',
            type: 'TABLE',
            comment: 'Analytics events tracking',
            columns: [
              { name: 'id', type: 'bigint(20)', nullable: false, comment: 'Primary key' },
              { name: 'event_name', type: 'varchar(255)', nullable: false, comment: 'Event name' },
              { name: 'timestamp', type: 'timestamp', nullable: false, comment: 'Event timestamp' }
            ]
          }
        ]
      };

      await fs.writeFile(join(analyticsDir, 'events.json'), JSON.stringify(eventsTableSchema, null, 2));

      const result = await handleTableInfoResource(schemaSource, 'analytics', 'events');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const resource: TableInfoResource = result.value;
        expect(resource.schemaName).toBe('analytics');
        expect(resource.table.name).toBe('events');
        expect(resource.table.columns).toHaveLength(3);
        expect(resource.table.indexes).toHaveLength(0);

        const eventNameColumn = resource.table.columns.find(c => c.name === 'event_name');
        expect(eventNameColumn?.nullable).toBe(false);
        expect(eventNameColumn?.comment).toBe('Event name');
      }
    });

    it('should handle table file that does not exist', async () => {
      const result = await handleTableInfoResource(schemaSource, 'default', 'nonexistent_table');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('No JSON schema file found');
      }
    });


    it('should handle table with minimal information', async () => {
      const simpleTableSchema = {
        name: 'simple_table_schema',
        desc: 'Simple table schema',
        tables: [
          {
            name: 'simple_table',
            type: 'TABLE',
            comment: 'Simple table',
            columns: [
              { name: 'id', type: 'int(11)', nullable: false, comment: '' }
            ]
          }
        ]
      };

      await fs.writeFile(join(schemaSource, 'simple_table.json'), JSON.stringify(simpleTableSchema, null, 2));

      const result = await handleTableInfoResource(schemaSource, 'default', 'simple_table');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const resource: TableInfoResource = result.value;
        expect(resource.schemaName).toBe('default');
        expect(resource.table.name).toBe('simple_table');
        expect(resource.table.columns).toHaveLength(1);
        expect(resource.table.indexes).toHaveLength(0);
        expect(resource.table.relations).toHaveLength(0);
      }
    });

    it('should handle file system permissions error', async () => {
      // Create a directory and JSON file without read permissions
      const restrictedDir = join(schemaSource, 'restricted_table');
      await fs.mkdir(restrictedDir, { recursive: true });
      const restrictedFile = join(restrictedDir, 'schema.json');
      await fs.writeFile(restrictedFile, JSON.stringify({
        metadata: { name: 'restricted', desc: 'Restricted schema' },
        tables: [],
        relations: [],
        tableReferences: []
      }));

      try {
        await fs.chmod(restrictedFile, 0o000);

        const result = await handleTableInfoResource(schemaSource, 'default', 'restricted_table');

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
          expect(result.error.message).toContain('permission denied');
        }
      } finally {
        // Restore permissions for cleanup
        await fs.chmod(restrictedFile, 0o644);
      }
    });

    it('should handle table with complex relationships', async () => {
      const orderItemsTableSchema = {
        name: 'order_items_schema',
        desc: 'Order line items table schema',
        tables: [
          {
            name: 'order_items',
            type: 'TABLE',
            comment: 'Order line items table',
            columns: [
              { name: 'id', type: 'bigint(20)', nullable: false, comment: 'Primary key' },
              { name: 'order_id', type: 'bigint(20)', nullable: false, comment: 'Order reference' },
              { name: 'product_id', type: 'bigint(20)', nullable: false, comment: 'Product reference' },
              { name: 'quantity', type: 'int(11)', nullable: false, comment: 'Item quantity' },
              { name: 'unit_price', type: 'decimal(10,2)', nullable: false, comment: 'Price per unit' }
            ]
          }
        ]
      };

      await fs.writeFile(join(schemaSource, 'order_items.json'), JSON.stringify(orderItemsTableSchema, null, 2));

      const result = await handleTableInfoResource(schemaSource, 'default', 'order_items');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const resource: TableInfoResource = result.value;
        expect(resource.table.relations).toHaveLength(0);
        expect(resource.table.indexes).toHaveLength(0);
        expect(resource.table.columns).toHaveLength(5);

        // Check decimal column parsing
        const priceColumn = resource.table.columns.find(c => c.name === 'unit_price');
        expect(priceColumn?.type).toBe('decimal(10,2)');
        expect(priceColumn?.precision).toBe(10);
        expect(priceColumn?.scale).toBe(2);
      }
    });
  });
});