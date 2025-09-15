import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  handleSchemaTablesResource,
  handleTableInfoResource,
} from '../../src/resources/table-resource';
import type {
  SchemaTablesResource,
  TableInfoResource,
} from '../../src/schemas/database';

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
              {
                name: 'id',
                type: 'bigint(20)',
                nullable: false,
                comment: 'Primary key',
              },
              {
                name: 'email',
                type: 'varchar(255)',
                nullable: false,
                comment: 'Email address',
              },
              {
                name: 'name',
                type: 'varchar(255)',
                nullable: true,
                comment: 'Full name',
              },
              {
                name: 'created_at',
                type: 'timestamp',
                nullable: false,
                comment: 'Creation time',
              },
              {
                name: 'updated_at',
                type: 'timestamp',
                nullable: false,
                comment: 'Update time',
              },
            ],
          },
          {
            name: 'posts',
            type: 'TABLE',
            comment: 'Blog posts table',
            columns: [
              {
                name: 'id',
                type: 'bigint(20)',
                nullable: false,
                comment: 'Primary key',
              },
              {
                name: 'title',
                type: 'varchar(255)',
                nullable: false,
                comment: 'Post title',
              },
              {
                name: 'content',
                type: 'text',
                nullable: true,
                comment: 'Post content',
              },
            ],
          },
          {
            name: 'comments',
            type: 'TABLE',
            comment: 'Post comments table',
            columns: [
              {
                name: 'id',
                type: 'bigint(20)',
                nullable: false,
                comment: 'Primary key',
              },
              {
                name: 'post_id',
                type: 'bigint(20)',
                nullable: false,
                comment: 'Post reference',
              },
              {
                name: 'comment',
                type: 'text',
                nullable: false,
                comment: 'Comment text',
              },
            ],
          },
        ],
      };

      await fs.writeFile(
        join(schemaSource, 'schema.json'),
        JSON.stringify(schema, null, 2)
      );

      const result = await handleSchemaTablesResource(schemaSource, 'default');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const resource: SchemaTablesResource = result.value;
        expect(resource.schemaName).toBe('default');
        expect(resource.tables).toHaveLength(3);

        const tableNames = resource.tables.map((t) => t.name).sort();
        expect(tableNames).toEqual(['comments', 'posts', 'users']);

        const usersTable = resource.tables.find((t) => t.name === 'users');
        expect(usersTable).toEqual({
          name: 'users',
          comment: 'User accounts table',
          columnCount: 5,
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
              {
                name: 'id',
                type: 'bigint(20)',
                nullable: false,
                comment: 'Primary key',
              },
              {
                name: 'email',
                type: 'varchar(255)',
                nullable: false,
                comment: 'Email address',
              },
              {
                name: 'name',
                type: 'varchar(255)',
                nullable: true,
                comment: 'Full name',
              },
              {
                name: 'created_at',
                type: 'timestamp',
                nullable: false,
                comment: 'Creation time',
              },
              {
                name: 'updated_at',
                type: 'timestamp',
                nullable: false,
                comment: 'Update time',
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
                comment: 'Primary key',
              },
              {
                name: 'name',
                type: 'varchar(255)',
                nullable: false,
                comment: 'Product name',
              },
              {
                name: 'description',
                type: 'text',
                nullable: true,
                comment: 'Product description',
              },
              {
                name: 'price',
                type: 'decimal(10,2)',
                nullable: false,
                comment: 'Product price',
              },
              {
                name: 'category_id',
                type: 'bigint(20)',
                nullable: true,
                comment: 'Category reference',
              },
              {
                name: 'stock_quantity',
                type: 'int(11)',
                nullable: false,
                comment: 'Stock quantity',
              },
              {
                name: 'is_active',
                type: 'boolean',
                nullable: false,
                comment: 'Product status',
              },
              {
                name: 'weight',
                type: 'decimal(8,3)',
                nullable: true,
                comment: 'Product weight',
              },
              {
                name: 'created_at',
                type: 'timestamp',
                nullable: false,
                comment: 'Creation time',
              },
              {
                name: 'updated_at',
                type: 'timestamp',
                nullable: false,
                comment: 'Update time',
              },
            ],
          },
          {
            name: 'orders',
            type: 'TABLE',
            comment: 'Customer orders',
            columns: [
              {
                name: 'id',
                type: 'bigint(20)',
                nullable: false,
                comment: 'Primary key',
              },
              {
                name: 'user_id',
                type: 'bigint(20)',
                nullable: false,
                comment: 'Customer reference',
              },
              {
                name: 'order_number',
                type: 'varchar(50)',
                nullable: false,
                comment: 'Order number',
              },
              {
                name: 'status',
                type: 'varchar(20)',
                nullable: false,
                comment: 'Order status',
              },
              {
                name: 'total_amount',
                type: 'decimal(10,2)',
                nullable: false,
                comment: 'Total amount',
              },
              {
                name: 'shipping_address',
                type: 'text',
                nullable: true,
                comment: 'Shipping address',
              },
              {
                name: 'payment_method',
                type: 'varchar(50)',
                nullable: true,
                comment: 'Payment method',
              },
              {
                name: 'payment_status',
                type: 'varchar(20)',
                nullable: false,
                comment: 'Payment status',
              },
              {
                name: 'notes',
                type: 'text',
                nullable: true,
                comment: 'Order notes',
              },
              {
                name: 'shipped_at',
                type: 'timestamp',
                nullable: true,
                comment: 'Shipping time',
              },
              {
                name: 'created_at',
                type: 'timestamp',
                nullable: false,
                comment: 'Creation time',
              },
              {
                name: 'updated_at',
                type: 'timestamp',
                nullable: false,
                comment: 'Update time',
              },
            ],
          },
        ],
      };

      await fs.writeFile(
        join(publicSchemaDir, 'schema.json'),
        JSON.stringify(publicSchema, null, 2)
      );

      const result = await handleSchemaTablesResource(schemaSource, 'public');
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const resource: SchemaTablesResource = result.value;
        expect(resource.schemaName).toBe('public');
        expect(resource.tables).toHaveLength(3);

        const ordersTable = resource.tables.find((t) => t.name === 'orders');
        expect(ordersTable).toEqual({
          name: 'orders',
          comment: 'Customer orders',
          columnCount: 12,
        });
      }
    });

    it('should handle schema that does not exist', async () => {
      const result = await handleSchemaTablesResource(
        schemaSource,
        'nonexistent'
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('No JSON schema file found');
      }
    });

    it('should handle schema with no tables', async () => {
      const emptySchema = {
        name: 'empty_schema',
        desc: 'Schema with no tables',
        tables: [],
      };

      await fs.writeFile(
        join(schemaSource, 'schema.json'),
        JSON.stringify(emptySchema, null, 2)
      );

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
    // RED PHASE: Tests that should FAIL until we implement lazy loading from single schema.json
    describe('Single schema.json file - Lazy Loading (FAILING TESTS)', () => {
      it('should extract specific table from single schema.json file', async () => {
        // Create a single schema.json file with multiple tables (tbls standard format)
        const fullSchema = {
          name: 'openlogi_local',
          desc: 'Full database schema with multiple tables',
          tables: [
            {
              name: 'accounting_updated_logs',
              type: 'TABLE',
              comment: 'Tracks accounting record updates',
              columns: [
                {
                  name: 'id',
                  type: 'bigint(20)',
                  nullable: false,
                  default: null,
                  extra_def: 'auto_increment',
                  comment: 'Primary key',
                },
                {
                  name: 'table_name',
                  type: 'varchar(255)',
                  nullable: false,
                  default: null,
                  comment: 'Name of the updated table',
                },
                {
                  name: 'record_id',
                  type: 'bigint(20)',
                  nullable: false,
                  default: null,
                  comment: 'ID of the updated record',
                },
                {
                  name: 'updated_at',
                  type: 'timestamp',
                  nullable: false,
                  default: 'CURRENT_TIMESTAMP',
                  comment: 'When the update occurred',
                },
                {
                  name: 'updated_by',
                  type: 'varchar(255)',
                  nullable: true,
                  default: null,
                  comment: 'User who made the update',
                },
              ],
              indexes: [
                {
                  name: 'PRIMARY',
                  def: 'PRIMARY KEY (id)',
                  table: 'accounting_updated_logs',
                  columns: ['id'],
                  comment: 'Primary key index',
                },
                {
                  name: 'idx_table_record',
                  def: 'KEY idx_table_record (table_name, record_id)',
                  table: 'accounting_updated_logs',
                  columns: ['table_name', 'record_id'],
                  comment: 'Composite index for lookups',
                },
                {
                  name: 'idx_updated_at',
                  def: 'KEY idx_updated_at (updated_at)',
                  table: 'accounting_updated_logs',
                  columns: ['updated_at'],
                  comment: 'Index for date-based queries',
                },
              ],
            },
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
                  comment: 'Primary key',
                },
                {
                  name: 'email',
                  type: 'varchar(255)',
                  nullable: false,
                  default: null,
                  comment: 'User email address',
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
              comment: 'Product catalog',
              columns: [
                {
                  name: 'id',
                  type: 'bigint(20)',
                  nullable: false,
                  default: null,
                  extra_def: 'auto_increment',
                  comment: 'Primary key',
                },
                {
                  name: 'name',
                  type: 'varchar(255)',
                  nullable: false,
                  default: null,
                  comment: 'Product name',
                },
              ],
            },
          ],
        };

        // Write the single schema.json file
        await fs.writeFile(
          join(schemaSource, 'schema.json'),
          JSON.stringify(fullSchema, null, 2)
        );

        // THIS SHOULD WORK: Extract accounting_updated_logs table from the single schema.json
        const result = await handleTableInfoResource(
          schemaSource,
          'default',
          'accounting_updated_logs'
        );

        // Currently this will FAIL because the system looks for individual files
        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          const resource: TableInfoResource = result.value;
          expect(resource.schemaName).toBe('default');
          expect(resource.table.name).toBe('accounting_updated_logs');
          expect(resource.table.comment).toBe(
            'Tracks accounting record updates'
          );
          expect(resource.table.columns).toHaveLength(5);
          expect(resource.table.indexes).toHaveLength(3);

          // Verify specific column details
          const idColumn = resource.table.columns.find((c) => c.name === 'id');
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
            scale: null,
          });

          const tableNameColumn = resource.table.columns.find(
            (c) => c.name === 'table_name'
          );
          expect(tableNameColumn).toEqual({
            name: 'table_name',
            type: 'varchar(255)',
            nullable: false,
            defaultValue: null,
            comment: 'Name of the updated table',
            isPrimaryKey: false,
            isAutoIncrement: false,
            maxLength: 255,
            precision: null,
            scale: null,
          });

          // Verify index details
          const primaryIndex = resource.table.indexes.find(
            (i) => i.name === 'PRIMARY'
          );
          expect(primaryIndex).toEqual({
            name: 'PRIMARY',
            columns: ['id'],
            isUnique: true,
            isPrimary: true,
            type: 'PRIMARY KEY',
            comment: 'Primary key index',
          });

          const compositeIndex = resource.table.indexes.find(
            (i) => i.name === 'idx_table_record'
          );
          expect(compositeIndex).toEqual({
            name: 'idx_table_record',
            columns: ['table_name', 'record_id'],
            isUnique: false,
            isPrimary: false,
            type: 'KEY',
            comment: 'Composite index for lookups',
          });
        }
      });

      it('should extract different table from same schema.json file', async () => {
        // Use the same schema.json from previous test
        const fullSchema = {
          name: 'openlogi_local',
          desc: 'Full database schema with multiple tables',
          tables: [
            {
              name: 'accounting_updated_logs',
              type: 'TABLE',
              comment: 'Tracks accounting record updates',
              columns: [
                {
                  name: 'id',
                  type: 'bigint(20)',
                  nullable: false,
                  comment: 'Primary key',
                },
              ],
            },
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
                  comment: 'Primary key',
                },
                {
                  name: 'email',
                  type: 'varchar(255)',
                  nullable: false,
                  default: null,
                  comment: 'User email address',
                },
                {
                  name: 'password_hash',
                  type: 'varchar(255)',
                  nullable: false,
                  default: null,
                  comment: 'Hashed password',
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
                {
                  name: 'users_email_unique',
                  def: 'UNIQUE KEY users_email_unique (email)',
                  table: 'users',
                  columns: ['email'],
                  comment: 'Unique email constraint',
                },
              ],
            },
          ],
        };

        await fs.writeFile(
          join(schemaSource, 'schema.json'),
          JSON.stringify(fullSchema, null, 2)
        );

        // THIS SHOULD WORK: Extract users table from the same schema.json
        const result = await handleTableInfoResource(
          schemaSource,
          'default',
          'users'
        );

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          const resource: TableInfoResource = result.value;
          expect(resource.table.name).toBe('users');
          expect(resource.table.comment).toBe('User accounts table');
          expect(resource.table.columns).toHaveLength(3);
          expect(resource.table.indexes).toHaveLength(2);

          // Verify email column with varchar type
          const emailColumn = resource.table.columns.find(
            (c) => c.name === 'email'
          );
          expect(emailColumn?.type).toBe('varchar(255)');
          expect(emailColumn?.maxLength).toBe(255);

          // Verify unique index
          const uniqueIndex = resource.table.indexes.find(
            (i) => i.name === 'users_email_unique'
          );
          expect(uniqueIndex?.isUnique).toBe(true);
          expect(uniqueIndex?.isPrimary).toBe(false);
        }
      });

      it('should handle non-existent table name in schema.json file', async () => {
        const fullSchema = {
          name: 'openlogi_local',
          desc: 'Full database schema',
          tables: [
            {
              name: 'existing_table',
              type: 'TABLE',
              comment: 'This table exists',
              columns: [
                {
                  name: 'id',
                  type: 'bigint(20)',
                  nullable: false,
                  comment: 'Primary key',
                },
              ],
            },
          ],
        };

        await fs.writeFile(
          join(schemaSource, 'schema.json'),
          JSON.stringify(fullSchema, null, 2)
        );

        // THIS SHOULD FAIL GRACEFULLY: Try to get non-existent table
        const result = await handleTableInfoResource(
          schemaSource,
          'default',
          'non_existent_table'
        );

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
          expect(result.error.message).toContain(
            'Table "non_existent_table" not found'
          );
        }
      });

      it('should handle empty schema.json file gracefully', async () => {
        const emptySchema = {
          name: 'empty_schema',
          desc: 'Schema with no tables',
          tables: [],
        };

        await fs.writeFile(
          join(schemaSource, 'schema.json'),
          JSON.stringify(emptySchema, null, 2)
        );

        const result = await handleTableInfoResource(
          schemaSource,
          'default',
          'any_table'
        );

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
          expect(result.error.message).toContain('Table "any_table" not found');
        }
      });

      it('should preserve all table metadata when extracting from schema.json', async () => {
        const fullSchema = {
          name: 'metadata_test',
          desc: 'Schema for testing metadata preservation',
          tables: [
            {
              name: 'complex_table',
              type: 'TABLE',
              comment: 'Table with complex metadata',
              columns: [
                {
                  name: 'id',
                  type: 'bigint(20)',
                  nullable: false,
                  default: null,
                  extra_def: 'auto_increment',
                  comment: 'Auto-incrementing primary key',
                },
                {
                  name: 'price',
                  type: 'decimal(10,2)',
                  nullable: true,
                  default: '0.00',
                  comment: 'Price with precision and scale',
                },
                {
                  name: 'description',
                  type: 'text',
                  nullable: true,
                  default: null,
                  comment: 'Long text description',
                },
                {
                  name: 'status',
                  type: 'enum("active","inactive","pending")',
                  nullable: false,
                  default: 'pending',
                  comment: 'Status enumeration',
                },
              ],
              indexes: [
                {
                  name: 'PRIMARY',
                  def: 'PRIMARY KEY (id)',
                  table: 'complex_table',
                  columns: ['id'],
                  comment: 'Primary key constraint',
                },
                {
                  name: 'idx_status_price',
                  def: 'KEY idx_status_price (status, price)',
                  table: 'complex_table',
                  columns: ['status', 'price'],
                  comment: 'Composite index for filtering',
                },
              ],
              relations: [
                {
                  table: 'complex_table',
                  columns: ['id'],
                  parentTable: 'parent_table',
                  parentColumns: ['complex_id'],
                  def: 'FOREIGN KEY (id) REFERENCES parent_table(complex_id)',
                  virtual: false,
                },
              ],
            },
          ],
        };

        await fs.writeFile(
          join(schemaSource, 'schema.json'),
          JSON.stringify(fullSchema, null, 2)
        );

        const result = await handleTableInfoResource(
          schemaSource,
          'default',
          'complex_table'
        );

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          const resource: TableInfoResource = result.value;

          // Check decimal column with precision/scale
          const priceColumn = resource.table.columns.find(
            (c) => c.name === 'price'
          );
          expect(priceColumn).toEqual({
            name: 'price',
            type: 'decimal(10,2)',
            nullable: true,
            defaultValue: '0.00',
            comment: 'Price with precision and scale',
            isPrimaryKey: false,
            isAutoIncrement: false,
            maxLength: null,
            precision: 10,
            scale: 2,
          });

          // Check enum column
          const statusColumn = resource.table.columns.find(
            (c) => c.name === 'status'
          );
          expect(statusColumn?.type).toBe(
            'enum("active","inactive","pending")'
          );
          expect(statusColumn?.defaultValue).toBe('pending');

          // Check text column
          const descColumn = resource.table.columns.find(
            (c) => c.name === 'description'
          );
          expect(descColumn?.type).toBe('text');
          expect(descColumn?.maxLength).toBeNull();

          // Check composite index
          const compositeIndex = resource.table.indexes.find(
            (i) => i.name === 'idx_status_price'
          );
          expect(compositeIndex?.columns).toEqual(['status', 'price']);

          // Check relations are preserved
          expect(resource.table.relations).toHaveLength(1);
          const relation = resource.table.relations[0];
          expect(relation.referencedTable).toBe('parent_table');
          expect(relation.referencedColumns).toEqual(['complex_id']);
        }
      });
    });

    // BACKWARD COMPATIBILITY: Tests for individual table files (should still work)
    describe('Individual table files - Backward Compatibility', () => {
      it('should prioritize single schema.json over individual files when both exist', async () => {
        // Create both: single schema.json AND individual table file
        const fullSchema = {
          name: 'openlogi_local',
          desc: 'Full database schema',
          tables: [
            {
              name: 'priority_test_table',
              type: 'TABLE',
              comment:
                'Table from single schema.json file (should be prioritized)',
              columns: [
                {
                  name: 'id',
                  type: 'bigint(20)',
                  nullable: false,
                  comment: 'Primary key from schema.json',
                },
                {
                  name: 'schema_json_field',
                  type: 'varchar(255)',
                  nullable: false,
                  comment: 'Field only in schema.json',
                },
              ],
            },
          ],
        };

        const individualTableSchema = {
          name: 'individual_table_schema',
          desc: 'Individual table file',
          tables: [
            {
              name: 'priority_test_table',
              type: 'TABLE',
              comment: 'Table from individual file (should be ignored)',
              columns: [
                {
                  name: 'id',
                  type: 'bigint(20)',
                  nullable: false,
                  comment: 'Primary key from individual file',
                },
                {
                  name: 'individual_field',
                  type: 'varchar(255)',
                  nullable: false,
                  comment: 'Field only in individual file',
                },
              ],
            },
          ],
        };

        // Create both files
        await fs.writeFile(
          join(schemaSource, 'schema.json'),
          JSON.stringify(fullSchema, null, 2)
        );
        await fs.writeFile(
          join(schemaSource, 'priority_test_table.json'),
          JSON.stringify(individualTableSchema, null, 2)
        );

        // When both exist, should prioritize schema.json content
        const result = await handleTableInfoResource(
          schemaSource,
          'default',
          'priority_test_table'
        );

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          const resource: TableInfoResource = result.value;
          expect(resource.table.comment).toBe(
            'Table from single schema.json file (should be prioritized)'
          );
          expect(resource.table.columns).toHaveLength(2);

          // Should have field from schema.json, not from individual file
          const schemaJsonField = resource.table.columns.find(
            (c) => c.name === 'schema_json_field'
          );
          expect(schemaJsonField).toBeDefined();
          expect(schemaJsonField?.comment).toBe('Field only in schema.json');

          // Should NOT have field from individual file
          const individualField = resource.table.columns.find(
            (c) => c.name === 'individual_field'
          );
          expect(individualField).toBeUndefined();
        }
      });

      it('should return error when schema.json does not exist (no fallback to individual files)', async () => {
        // Create ONLY individual table file (no schema.json)
        const usersTableSchema = {
          name: 'users_table_schema',
          desc: 'Schema containing users table',
          tables: [
            {
              name: 'users',
              type: 'TABLE',
              comment: 'User accounts table from individual file',
              columns: [
                {
                  name: 'id',
                  type: 'bigint(20)',
                  nullable: false,
                  default: null,
                  extra_def: 'auto_increment',
                  comment: 'Primary key',
                },
                {
                  name: 'fallback_field',
                  type: 'varchar(255)',
                  nullable: false,
                  default: null,
                  comment: 'Field from individual file',
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
          ],
        };

        // Create only individual file (no schema.json)
        await fs.writeFile(
          join(schemaSource, 'users.json'),
          JSON.stringify(usersTableSchema, null, 2)
        );

        // Should return error since individual files are no longer supported
        const result = await handleTableInfoResource(
          schemaSource,
          'default',
          'users'
        );

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
          expect(result.error.message).toContain('Schema file not found');
          expect(result.error.message).toContain(
            'Only JSON schema files are supported'
          );
        }
      });

      it('should handle multi-schema setup with schema.json extraction', async () => {
        // Create multi-schema directory structure with schema.json files
        const publicDir = join(schemaSource, 'public');
        const analyticsDir = join(schemaSource, 'analytics');
        await fs.mkdir(publicDir);
        await fs.mkdir(analyticsDir);

        // Create schema.json for public schema
        const publicSchema = {
          name: 'public',
          desc: 'Public schema',
          tables: [
            {
              name: 'users',
              type: 'TABLE',
              comment: 'Users in public schema',
              columns: [
                {
                  name: 'id',
                  type: 'bigint(20)',
                  nullable: false,
                  comment: 'Primary key',
                },
                {
                  name: 'public_field',
                  type: 'varchar(255)',
                  nullable: false,
                  comment: 'Public field',
                },
              ],
            },
          ],
        };

        // Create schema.json for analytics schema
        const analyticsSchema = {
          name: 'analytics',
          desc: 'Analytics schema',
          tables: [
            {
              name: 'events',
              type: 'TABLE',
              comment: 'Events in analytics schema',
              columns: [
                {
                  name: 'id',
                  type: 'bigint(20)',
                  nullable: false,
                  comment: 'Primary key',
                },
                {
                  name: 'analytics_field',
                  type: 'varchar(255)',
                  nullable: false,
                  comment: 'Analytics field',
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
          join(analyticsDir, 'schema.json'),
          JSON.stringify(analyticsSchema, null, 2)
        );

        // Should extract table from public schema.json
        const publicResult = await handleTableInfoResource(
          schemaSource,
          'public',
          'users'
        );
        expect(publicResult.isOk()).toBe(true);
        if (publicResult.isOk()) {
          const resource = publicResult.value;
          expect(resource.schemaName).toBe('public');
          expect(resource.table.comment).toBe('Users in public schema');
          const publicField = resource.table.columns.find(
            (c) => c.name === 'public_field'
          );
          expect(publicField).toBeDefined();
        }

        // Should extract table from analytics schema.json
        const analyticsResult = await handleTableInfoResource(
          schemaSource,
          'analytics',
          'events'
        );
        expect(analyticsResult.isOk()).toBe(true);
        if (analyticsResult.isOk()) {
          const resource = analyticsResult.value;
          expect(resource.schemaName).toBe('analytics');
          expect(resource.table.comment).toBe('Events in analytics schema');
          const analyticsField = resource.table.columns.find(
            (c) => c.name === 'analytics_field'
          );
          expect(analyticsField).toBeDefined();
        }
      });
    });
  });
});
