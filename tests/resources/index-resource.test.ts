import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { handleTableIndexesResource } from '../../src/resources/index-resource';
import type { TableIndexesResource } from '../../src/schemas/database';

describe('Index Resource Handler', () => {
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

  describe('handleTableIndexesResource', () => {
    it('should return index information for table in single schema setup', async () => {
      const usersTableContent = {
        name: 'users',
        desc: 'User accounts table',
        tables: [
          {
            name: 'users',
            type: 'TABLE',
            comment: 'User accounts table',
            columns: [
              {
                name: 'id',
                type: 'bigint',
                nullable: false,
                extra_def: 'auto_increment primary key',
                comment: 'Primary key',
              },
              {
                name: 'email',
                type: 'varchar(255)',
                nullable: false,
                comment: 'User email',
              },
              {
                name: 'username',
                type: 'varchar(100)',
                nullable: false,
                comment: 'Username',
              },
              {
                name: 'created_at',
                type: 'timestamp',
                nullable: false,
                default: 'CURRENT_TIMESTAMP',
                comment: 'Created timestamp',
              },
            ],
            indexes: [
              {
                name: 'PRIMARY',
                columns: ['id'],
                def: 'PRIMARY KEY (id)',
                comment: 'Primary key index',
              },
              {
                name: 'users_email_unique',
                columns: ['email'],
                def: 'UNIQUE (email)',
                comment: 'Unique email constraint',
              },
              {
                name: 'users_username_unique',
                columns: ['username'],
                def: 'UNIQUE (username)',
                comment: 'Unique username constraint',
              },
              {
                name: 'users_created_at_idx',
                columns: ['created_at'],
                def: 'INDEX (created_at)',
                comment: 'Index for date-based queries',
              },
              {
                name: 'users_email_username_idx',
                columns: ['email', 'username'],
                def: 'INDEX (email, username)',
                comment: 'Composite index for searches',
              },
            ],
          },
        ],
      };

      await fs.writeFile(
        join(schemaSource, 'users.json'),
        JSON.stringify(usersTableContent, null, 2)
      );

      const result = await handleTableIndexesResource(
        schemaSource,
        'default',
        'users'
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const resource: TableIndexesResource = result.value;
        expect(resource.schemaName).toBe('default');
        expect(resource.tableName).toBe('users');
        expect(resource.indexes).toHaveLength(5);

        // Check primary key index
        const primaryIndex = resource.indexes.find((i) => i.name === 'PRIMARY');
        expect(primaryIndex).toEqual({
          name: 'PRIMARY',
          columns: ['id'],
          isUnique: true,
          isPrimary: true,
          type: 'PRIMARY KEY',
          comment: 'Primary key index',
        });

        // Check unique index
        const emailIndex = resource.indexes.find(
          (i) => i.name === 'users_email_unique'
        );
        expect(emailIndex).toEqual({
          name: 'users_email_unique',
          columns: ['email'],
          isUnique: true,
          isPrimary: false,
          type: 'UNIQUE',
          comment: 'Unique email constraint',
        });

        // Check regular index
        const dateIndex = resource.indexes.find(
          (i) => i.name === 'users_created_at_idx'
        );
        expect(dateIndex).toEqual({
          name: 'users_created_at_idx',
          columns: ['created_at'],
          isUnique: false,
          isPrimary: false,
          type: 'INDEX (created_at)',
          comment: 'Index for date-based queries',
        });

        // Check composite index
        const compositeIndex = resource.indexes.find(
          (i) => i.name === 'users_email_username_idx'
        );
        expect(compositeIndex).toEqual({
          name: 'users_email_username_idx',
          columns: ['email', 'username'],
          isUnique: false,
          isPrimary: false,
          type: 'INDEX (email, username)',
          comment: 'Composite index for searches',
        });
      }
    });

    it('should return index information for table in multi-schema setup', async () => {
      const reportingDir = join(schemaSource, 'reporting');
      await fs.mkdir(reportingDir);

      const eventsTableContent = {
        name: 'events',
        desc: 'Analytics events table',
        tables: [
          {
            name: 'events',
            type: 'TABLE',
            comment: 'Analytics events table',
            columns: [
              {
                name: 'id',
                type: 'uuid',
                nullable: false,
                extra_def: 'primary key',
                comment: 'Event ID',
              },
              {
                name: 'user_id',
                type: 'bigint',
                nullable: true,
                comment: 'User reference',
              },
              {
                name: 'event_type',
                type: 'varchar(100)',
                nullable: false,
                comment: 'Event type',
              },
              {
                name: 'timestamp',
                type: 'timestamp',
                nullable: false,
                comment: 'Event timestamp',
              },
              {
                name: 'session_id',
                type: 'varchar(255)',
                nullable: true,
                comment: 'Session ID',
              },
            ],
            indexes: [
              {
                name: 'events_pkey',
                columns: ['id'],
                def: 'PRIMARY KEY (id)',
                comment: 'Primary key',
              },
              {
                name: 'events_user_id_idx',
                columns: ['user_id'],
                def: 'INDEX (user_id)',
                comment: 'User lookups',
              },
              {
                name: 'events_timestamp_idx',
                columns: ['timestamp DESC'],
                def: 'INDEX (timestamp DESC)',
                comment: 'Time-based queries',
              },
              {
                name: 'events_session_event_idx',
                columns: ['session_id', 'event_type'],
                def: 'INDEX (session_id, event_type)',
                comment: 'Session event lookups',
              },
              {
                name: 'events_type_timestamp_idx',
                columns: ['event_type', 'timestamp'],
                def: 'INDEX (event_type, timestamp)',
                comment: 'Event type with time',
              },
            ],
          },
        ],
      };

      await fs.writeFile(
        join(reportingDir, 'events.json'),
        JSON.stringify(eventsTableContent, null, 2)
      );

      const result = await handleTableIndexesResource(
        schemaSource,
        'reporting',
        'events'
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const resource: TableIndexesResource = result.value;
        expect(resource.schemaName).toBe('reporting');
        expect(resource.tableName).toBe('events');
        expect(resource.indexes).toHaveLength(5);

        // Check index with DESC order
        const timestampIndex = resource.indexes.find(
          (i) => i.name === 'events_timestamp_idx'
        );
        expect(timestampIndex).toEqual({
          name: 'events_timestamp_idx',
          columns: ['timestamp DESC'],
          isUnique: false,
          isPrimary: false,
          type: 'INDEX (timestamp DESC)',
          comment: 'Time-based queries',
        });

        // Check composite indexes
        const sessionEventIndex = resource.indexes.find(
          (i) => i.name === 'events_session_event_idx'
        );
        expect(sessionEventIndex).toEqual({
          name: 'events_session_event_idx',
          columns: ['session_id', 'event_type'],
          isUnique: false,
          isPrimary: false,
          type: 'INDEX (session_id, event_type)',
          comment: 'Session event lookups',
        });
      }
    });

    it('should return empty indexes list for table with no indexes', async () => {
      const simpleTableSchema = {
        metadata: {
          name: 'simple_table_schema',
          desc: 'Simple table with no indexes',
          version: '1.0.0',
          generated: '2024-01-15T10:30:00Z',
        },
        tables: [
          {
            name: 'simple_table',
            type: 'BASE TABLE',
            comment: 'Simple table with no indexes',
            columns: [
              {
                name: 'id',
                type: 'int',
                nullable: false,
                default: null,
                comment: 'ID',
              },
              {
                name: 'name',
                type: 'varchar(100)',
                nullable: true,
                default: null,
                comment: 'Name',
              },
            ],
            indexes: [], // No indexes
            constraints: [],
            triggers: [],
          },
        ],
        relations: [],
        tableReferences: [
          {
            name: 'simple_table',
            columnCount: 2,
            indexCount: 0,
            comment: 'Simple table with no indexes',
          },
        ],
      };

      const simpleTableDir = join(schemaSource, 'simple_table');
      await fs.mkdir(simpleTableDir, { recursive: true });
      await fs.writeFile(
        join(simpleTableDir, 'schema.json'),
        JSON.stringify(simpleTableSchema, null, 2)
      );

      const result = await handleTableIndexesResource(
        schemaSource,
        'default',
        'simple_table'
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const resource: TableIndexesResource = result.value;
        expect(resource.schemaName).toBe('default');
        expect(resource.tableName).toBe('simple_table');
        expect(resource.indexes).toHaveLength(0);
      }
    });

    it('should handle table file that does not exist', async () => {
      const result = await handleTableIndexesResource(
        schemaSource,
        'default',
        'nonexistent_table'
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('No JSON schema file found');
      }
    });

    it('should handle schema that does not exist', async () => {
      const result = await handleTableIndexesResource(
        schemaSource,
        'nonexistent_schema',
        'some_table'
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('No JSON schema file found');
      }
    });

    it('should handle malformed indexes section gracefully', async () => {
      const malformedIndexSchema = {
        metadata: {
          name: 'bad_indexes_schema',
          desc: 'Table with malformed indexes',
          version: '1.0.0',
          generated: '2024-01-15T10:30:00Z',
        },
        tables: [
          {
            name: 'table_with_bad_indexes',
            type: 'BASE TABLE',
            comment: 'Table with malformed indexes section',
            columns: [
              {
                name: 'id',
                type: 'int',
                nullable: false,
                default: null,
                comment: 'ID',
              },
            ],
            indexes: [
              // Incomplete index with missing fields to test graceful handling
              {
                name: 'incomplete_index',
                columns: [], // Empty columns array
                // Missing other required fields like isUnique, isPrimary, etc.
              },
            ],
            constraints: [],
            triggers: [],
          },
        ],
        relations: [],
        tableReferences: [
          {
            name: 'table_with_bad_indexes',
            columnCount: 1,
            indexCount: 1,
            comment: 'Table with malformed indexes section',
          },
        ],
      };

      const badIndexesDir = join(schemaSource, 'table_with_bad_indexes');
      await fs.mkdir(badIndexesDir, { recursive: true });
      await fs.writeFile(
        join(badIndexesDir, 'schema.json'),
        JSON.stringify(malformedIndexSchema, null, 2)
      );

      const result = await handleTableIndexesResource(
        schemaSource,
        'default',
        'table_with_bad_indexes'
      );

      // JSON validation should now catch malformed indexes and return an error
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain(
          'Index must have at least one column'
        );
      }
    });

    it('should handle complex index definitions with various types', async () => {
      const complexIndexesContent = {
        name: 'products',
        desc: 'Products table with complex indexes',
        tables: [
          {
            name: 'products',
            type: 'TABLE',
            comment: 'Products table with complex indexes',
            columns: [
              {
                name: 'id',
                type: 'bigint',
                nullable: false,
                extra_def: 'auto_increment primary key',
                comment: 'Product ID',
              },
              {
                name: 'sku',
                type: 'varchar(100)',
                nullable: false,
                comment: 'Stock keeping unit',
              },
              {
                name: 'name',
                type: 'varchar(255)',
                nullable: false,
                comment: 'Product name',
              },
              {
                name: 'category_id',
                type: 'int',
                nullable: true,
                comment: 'Category',
              },
              {
                name: 'price',
                type: 'decimal(10,2)',
                nullable: false,
                comment: 'Product price',
              },
              {
                name: 'created_at',
                type: 'timestamp',
                nullable: false,
                default: 'CURRENT_TIMESTAMP',
                comment: 'Created date',
              },
              {
                name: 'updated_at',
                type: 'timestamp',
                nullable: true,
                comment: 'Updated date',
              },
            ],
            indexes: [
              {
                name: 'products_pkey',
                columns: ['id'],
                def: 'PRIMARY KEY (id)',
                comment: 'Primary key',
              },
              {
                name: 'products_sku_unique',
                columns: ['sku'],
                def: 'UNIQUE (sku)',
                comment: 'SKU must be unique',
              },
              {
                name: 'products_category_idx',
                columns: ['category_id'],
                def: 'INDEX (category_id)',
                comment: 'Category lookups',
              },
              {
                name: 'products_price_idx',
                columns: ['price DESC'],
                def: 'INDEX (price DESC)',
                comment: 'Price sorting',
              },
              {
                name: 'products_name_gin',
                columns: ['name'],
                def: 'INDEX',
                comment: 'Full text search',
              },
              {
                name: 'products_category_price_idx',
                columns: ['category_id', 'price DESC'],
                def: 'INDEX (category_id, price DESC)',
                comment: 'Category price sorting',
              },
              {
                name: 'products_created_btree',
                columns: ['created_at'],
                def: 'INDEX',
                comment: 'Time range queries',
              },
              {
                name: 'products_partial_idx',
                columns: ['price'],
                def: 'INDEX (price) WHERE price > 0',
                comment: 'Partial index for valid prices',
              },
            ],
          },
        ],
      };

      await fs.writeFile(
        join(schemaSource, 'products.json'),
        JSON.stringify(complexIndexesContent, null, 2)
      );

      const result = await handleTableIndexesResource(
        schemaSource,
        'default',
        'products'
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const resource: TableIndexesResource = result.value;
        expect(resource.schemaName).toBe('default');
        expect(resource.tableName).toBe('products');
        expect(resource.indexes).toHaveLength(8);

        // Check GIN index (simplified to INDEX due to JSON parser limitations)
        const ginIndex = resource.indexes.find(
          (i) => i.name === 'products_name_gin'
        );
        expect(ginIndex?.type).toBe('INDEX');
        expect(ginIndex?.comment).toBe('Full text search');

        // Check BTREE index (simplified to INDEX due to JSON parser limitations)
        const btreeIndex = resource.indexes.find(
          (i) => i.name === 'products_created_btree'
        );
        expect(btreeIndex?.type).toBe('INDEX');
        expect(btreeIndex?.columns).toEqual(['created_at']);

        // Check partial index
        const partialIndex = resource.indexes.find(
          (i) => i.name === 'products_partial_idx'
        );
        expect(partialIndex?.type).toBe('INDEX (price) WHERE price > 0');
        expect(partialIndex?.comment).toBe('Partial index for valid prices');
      }
    });

    it('should handle file system permissions error', async () => {
      // Create a directory and JSON file without read permissions
      const restrictedDir = join(schemaSource, 'restricted_table');
      await fs.mkdir(restrictedDir, { recursive: true });
      const restrictedFile = join(restrictedDir, 'schema.json');
      await fs.writeFile(
        restrictedFile,
        JSON.stringify({
          metadata: { name: 'restricted', desc: 'Restricted schema' },
          tables: [],
          relations: [],
          tableReferences: [],
        })
      );

      try {
        await fs.chmod(restrictedFile, 0o000);

        const result = await handleTableIndexesResource(
          schemaSource,
          'default',
          'restricted_table'
        );

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
          expect(result.error.message).toContain('permission denied');
        }
      } finally {
        // Restore permissions for cleanup
        await fs.chmod(restrictedFile, 0o644);
      }
    });

    it('should handle indexes with no comments', async () => {
      const noCommentsSchema = {
        metadata: {
          name: 'no_comments_schema',
          desc: 'Table with indexes but no comments',
          version: '1.0.0',
          generated: '2024-01-15T10:30:00Z',
        },
        tables: [
          {
            name: 'table_no_comments',
            type: 'BASE TABLE',
            comment: 'Table with indexes but no comments',
            columns: [
              {
                name: 'id',
                type: 'int',
                nullable: false,
                default: null,
                comment: '',
              },
              {
                name: 'code',
                type: 'varchar(50)',
                nullable: false,
                default: null,
                comment: '',
              },
            ],
            indexes: [
              {
                name: 'table_no_comments_pkey',
                type: 'PRIMARY KEY (id)',
                columns: ['id'],
                isUnique: true,
                isPrimary: true,
                comment: '',
              },
              {
                name: 'table_no_comments_code_idx',
                type: 'INDEX (code)',
                columns: ['code'],
                isUnique: false,
                isPrimary: false,
                comment: '',
              },
              {
                name: 'table_no_comments_code_unique',
                type: 'UNIQUE (code)',
                columns: ['code'],
                isUnique: true,
                isPrimary: false,
                comment: '',
              },
            ],
            constraints: [],
            triggers: [],
          },
        ],
        relations: [],
        tableReferences: [
          {
            name: 'table_no_comments',
            columnCount: 2,
            indexCount: 3,
            comment: 'Table with indexes but no comments',
          },
        ],
      };

      const noCommentsDir = join(schemaSource, 'table_no_comments');
      await fs.mkdir(noCommentsDir, { recursive: true });
      await fs.writeFile(
        join(noCommentsDir, 'schema.json'),
        JSON.stringify(noCommentsSchema, null, 2)
      );

      const result = await handleTableIndexesResource(
        schemaSource,
        'default',
        'table_no_comments'
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const resource: TableIndexesResource = result.value;
        expect(resource.indexes).toHaveLength(3);

        resource.indexes.forEach((index) => {
          expect(index.comment).toBe(null);
        });
      }
    });

    it('should handle very large number of indexes efficiently', async () => {
      // Generate table with many indexes
      const indexes = [
        {
          name: 'test_table_pkey',
          type: 'PRIMARY KEY (id)',
          columns: ['id'],
          isUnique: true,
          isPrimary: true,
          comment: 'Primary key',
        },
      ];

      // Add 100 regular indexes
      for (let i = 1; i <= 100; i++) {
        indexes.push({
          name: `test_table_idx_${i}`,
          type: `INDEX (col_${i})`,
          columns: [`col_${i}`],
          isUnique: false,
          isPrimary: false,
          comment: `Index ${i}`,
        });
      }

      const largeIndexesSchema = {
        metadata: {
          name: 'large_indexes_schema',
          desc: 'Test table with many indexes',
          version: '1.0.0',
          generated: '2024-01-15T10:30:00Z',
        },
        tables: [
          {
            name: 'test_table',
            type: 'BASE TABLE',
            comment: 'Test table with many indexes',
            columns: [
              {
                name: 'id',
                type: 'bigint',
                nullable: false,
                default: null,
                comment: 'ID',
              },
            ],
            indexes,
            constraints: [],
            triggers: [],
          },
        ],
        relations: [],
        tableReferences: [
          {
            name: 'test_table',
            columnCount: 1,
            indexCount: 101,
            comment: 'Test table with many indexes',
          },
        ],
      };

      const largeIndexesDir = join(schemaSource, 'test_table');
      await fs.mkdir(largeIndexesDir, { recursive: true });
      await fs.writeFile(
        join(largeIndexesDir, 'schema.json'),
        JSON.stringify(largeIndexesSchema, null, 2)
      );

      const startTime = Date.now();
      const result = await handleTableIndexesResource(
        schemaSource,
        'default',
        'test_table'
      );
      const endTime = Date.now();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const resource: TableIndexesResource = result.value;
        expect(resource.indexes).toHaveLength(101); // Primary + 100 regular indexes
        expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
      }
    });

    it('should handle table with only primary key index', async () => {
      const primaryOnlyContent = {
        name: 'simple_pk_table',
        desc: 'Table with only primary key',
        tables: [
          {
            name: 'simple_pk_table',
            type: 'TABLE',
            comment: 'Table with only primary key',
            columns: [
              {
                name: 'id',
                type: 'serial',
                nullable: false,
                extra_def: 'auto_increment primary key',
                comment: 'Auto-incrementing ID',
              },
              {
                name: 'data',
                type: 'text',
                nullable: true,
                comment: 'Some data',
              },
            ],
            indexes: [
              {
                name: 'simple_pk_table_pkey',
                columns: ['id'],
                def: 'PRIMARY KEY (id)',
                comment: 'Auto-generated primary key',
              },
            ],
          },
        ],
      };

      await fs.writeFile(
        join(schemaSource, 'simple_pk_table.json'),
        JSON.stringify(primaryOnlyContent, null, 2)
      );

      const result = await handleTableIndexesResource(
        schemaSource,
        'default',
        'simple_pk_table'
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const resource: TableIndexesResource = result.value;
        expect(resource.indexes).toHaveLength(1);

        const primaryIndex = resource.indexes[0];
        expect(primaryIndex.name).toBe('simple_pk_table_pkey');
        expect(primaryIndex.isPrimary).toBe(true);
        expect(primaryIndex.isUnique).toBe(true);
        expect(primaryIndex.columns).toEqual(['id']);
      }
    });
  });
});
