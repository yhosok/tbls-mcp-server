import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  parseJsonFile,
  parseJsonContent,
  parseJsonSchema,
} from '../../src/parsers/json-parser';
import {
  DatabaseTableSchema,
  DatabaseSchemaSchema,
} from '../../src/schemas/database';

describe('Tbls JSON Parser', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `tbls-json-parser-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  // Test fixtures
  const createCompleteSchemaFixture = (): Record<string, unknown> => ({
    name: 'ecommerce_db',
    desc: 'E-commerce database schema with user management and order processing',
    tables: [
      {
        name: 'users',
        type: 'TABLE',
        comment: 'User account information',
        columns: [
          {
            name: 'id',
            type: 'bigint(20) unsigned',
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
            comment: 'Email address',
          },
          {
            name: 'name',
            type: 'varchar(255)',
            nullable: true,
            default: 'NULL',
            comment: 'Full name',
          },
          {
            name: 'created_at',
            type: 'timestamp',
            nullable: false,
            default: 'CURRENT_TIMESTAMP',
            comment: 'Registration time',
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
            name: 'idx_email',
            def: 'UNIQUE KEY idx_email (email)',
            table: 'users',
            columns: ['email'],
            comment: 'Unique email index',
          },
        ],
        constraints: [
          {
            name: 'users_email_unique',
            type: 'UNIQUE',
            def: 'UNIQUE KEY `users_email_unique` (`email`)',
            table: 'users',
            columns: ['email'],
          },
        ],
      },
      {
        name: 'orders',
        type: 'TABLE',
        comment: 'Customer order information',
        columns: [
          {
            name: 'id',
            type: 'bigint(20) unsigned',
            nullable: false,
            default: null,
            extra_def: 'auto_increment',
            comment: 'Primary key',
          },
          {
            name: 'user_id',
            type: 'bigint(20) unsigned',
            nullable: false,
            default: null,
            comment: 'Customer reference',
          },
          {
            name: 'status',
            type: "enum('pending','confirmed','shipped','delivered')",
            nullable: false,
            default: 'pending',
            comment: 'Order status',
          },
          {
            name: 'total',
            type: 'decimal(10,2)',
            nullable: false,
            default: '0.00',
            comment: 'Order total',
          },
          {
            name: 'created_at',
            type: 'timestamp',
            nullable: false,
            default: 'CURRENT_TIMESTAMP',
            comment: 'Order date',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            nullable: false,
            default: 'CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
            comment: 'Last update',
          },
        ],
        indexes: [
          {
            name: 'PRIMARY',
            def: 'PRIMARY KEY (id)',
            table: 'orders',
            columns: ['id'],
          },
          {
            name: 'idx_user_id',
            def: 'KEY idx_user_id (user_id)',
            table: 'orders',
            columns: ['user_id'],
          },
          {
            name: 'idx_status',
            def: 'KEY idx_status (status)',
            table: 'orders',
            columns: ['status'],
          },
          {
            name: 'idx_composite',
            def: 'KEY idx_composite (user_id, status, created_at)',
            table: 'orders',
            columns: ['user_id', 'status', 'created_at'],
          },
        ],
      },
      {
        name: 'products',
        type: 'TABLE',
        comment: 'Product catalog information',
        columns: [
          {
            name: 'id',
            type: 'bigint(20) unsigned',
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
          {
            name: 'description',
            type: 'text',
            nullable: true,
            default: null,
            comment: 'Product description',
          },
          {
            name: 'price',
            type: 'decimal(10,2)',
            nullable: false,
            default: '0.00',
            comment: 'Product price',
          },
          {
            name: 'metadata',
            type: 'json',
            nullable: true,
            default: '{}',
            comment: 'Additional product metadata',
          },
          {
            name: 'created_at',
            type: 'timestamp',
            nullable: false,
            default: 'CURRENT_TIMESTAMP',
            comment: 'Creation time',
          },
        ],
        indexes: [
          {
            name: 'PRIMARY',
            def: 'PRIMARY KEY (id)',
            table: 'products',
            columns: ['id'],
          },
          {
            name: 'idx_name',
            def: 'KEY idx_name (name)',
            table: 'products',
            columns: ['name'],
          },
        ],
      },
    ],
    relations: [
      {
        table: 'orders',
        columns: ['user_id'],
        parent_table: 'users',
        parent_columns: ['id'],
        def: 'FOREIGN KEY (user_id) REFERENCES users (id)',
        virtual: false,
      },
    ],
  });

  const createSingleTableFixture = (): Record<string, unknown> => ({
    tables: [
      {
        name: 'simple_table',
        type: 'TABLE',
        comment: 'A simple table with various column types',
        columns: [
          {
            name: 'id',
            type: 'int(11)',
            nullable: false,
            default: null,
            extra_def: 'auto_increment',
            comment: 'Primary key',
          },
          {
            name: 'name',
            type: 'varchar(100)',
            nullable: false,
            default: null,
            comment: 'Name field',
          },
          {
            name: 'age',
            type: 'int(11)',
            nullable: true,
            default: null,
            comment: 'Age in years',
          },
          {
            name: 'balance',
            type: 'decimal(15,2)',
            nullable: false,
            default: '0.00',
            comment: 'Account balance',
          },
          {
            name: 'active',
            type: 'tinyint(1)',
            nullable: false,
            default: '1',
            comment: 'Active status',
          },
          {
            name: 'created_date',
            type: 'date',
            nullable: true,
            default: null,
            comment: 'Creation date',
          },
          {
            name: 'updated_time',
            type: 'datetime',
            nullable: true,
            default: null,
            comment: 'Last update time',
          },
          {
            name: 'notes',
            type: 'text',
            nullable: true,
            default: null,
            comment: 'Additional notes',
          },
          {
            name: 'config',
            type: 'json',
            nullable: true,
            default: '{}',
            comment: 'Configuration data',
          },
        ],
        indexes: [
          {
            name: 'PRIMARY',
            def: 'PRIMARY KEY (id)',
            table: 'simple_table',
            columns: ['id'],
          },
          {
            name: 'idx_name_unique',
            def: 'UNIQUE KEY idx_name_unique (name)',
            table: 'simple_table',
            columns: ['name'],
          },
          {
            name: 'idx_age_balance',
            def: 'KEY idx_age_balance (age, balance)',
            table: 'simple_table',
            columns: ['age', 'balance'],
          },
        ],
      },
    ],
  });

  const createMinimalSchemaFixture = (): Record<string, unknown> => ({
    tables: [
      {
        name: 'minimal_table',
        type: 'TABLE',
        columns: [
          {
            name: 'id',
            type: 'int(11)',
            nullable: false,
          },
        ],
      },
    ],
  });

  describe('parseJsonSchema', () => {
    it('should parse complete multi-table schema with relations', () => {
      const schemaData = createCompleteSchemaFixture();

      const result = parseJsonSchema(schemaData);
      expect(result.isOk()).toBe(true);

      if (result.isOk()) {
        const schema = result.value;

        // Validate metadata
        expect(schema.metadata.name).toBe('ecommerce_db');
        expect(schema.metadata.description).toBe(
          'E-commerce database schema with user management and order processing'
        );

        // Validate tables
        expect(schema.tables).toHaveLength(3);

        // Validate users table
        const usersTable = schema.tables.find((t) => t.name === 'users');
        expect(usersTable).toBeDefined();
        expect(usersTable?.comment).toBe('User account information');
        expect(usersTable?.columns).toHaveLength(4);
        expect(usersTable?.indexes).toHaveLength(2);
        expect(usersTable?.relations).toHaveLength(1);

        // Validate user columns
        const idColumn = usersTable?.columns.find((c) => c.name === 'id');
        expect(idColumn).toEqual(
          expect.objectContaining({
            name: 'id',
            type: 'bigint(20) unsigned',
            nullable: false,
            defaultValue: null,
            isAutoIncrement: true,
            comment: 'Primary key',
          })
        );

        const emailColumn = usersTable?.columns.find((c) => c.name === 'email');
        expect(emailColumn).toEqual(
          expect.objectContaining({
            name: 'email',
            type: 'varchar(255)',
            nullable: false,
            defaultValue: null,
            comment: 'Email address',
          })
        );

        const nameColumn = usersTable?.columns.find((c) => c.name === 'name');
        expect(nameColumn).toEqual(
          expect.objectContaining({
            name: 'name',
            type: 'varchar(255)',
            nullable: true,
            defaultValue: 'NULL',
            comment: 'Full name',
          })
        );

        // Validate indexes
        const primaryIndex = usersTable?.indexes.find(
          (i) => i.name === 'PRIMARY'
        );
        expect(primaryIndex).toEqual(
          expect.objectContaining({
            name: 'PRIMARY',
            columns: ['id'],
            isPrimary: true,
            isUnique: true,
          })
        );

        const emailIndex = usersTable?.indexes.find(
          (i) => i.name === 'idx_email'
        );
        expect(emailIndex).toEqual(
          expect.objectContaining({
            name: 'idx_email',
            columns: ['email'],
            isPrimary: false,
            isUnique: true,
          })
        );

        // Validate orders table
        const ordersTable = schema.tables.find((t) => t.name === 'orders');
        expect(ordersTable).toBeDefined();
        expect(ordersTable?.columns).toHaveLength(6);
        expect(ordersTable?.indexes).toHaveLength(4);
        expect(ordersTable?.relations).toHaveLength(1);

        // Validate composite index
        const compositeIndex = ordersTable?.indexes.find(
          (i) => i.name === 'idx_composite'
        );
        expect(compositeIndex).toEqual(
          expect.objectContaining({
            name: 'idx_composite',
            columns: ['user_id', 'status', 'created_at'],
            isPrimary: false,
            isUnique: false,
          })
        );

        // Validate relation mapping
        const ordersRelation = ordersTable?.relations.find(
          (r) => r.referencedTable === 'users'
        );
        expect(ordersRelation).toEqual(
          expect.objectContaining({
            type: 'belongsTo',
            table: 'orders',
            columns: ['user_id'],
            referencedTable: 'users',
            referencedColumns: ['id'],
          })
        );

        const usersRelation = usersTable?.relations.find(
          (r) => r.table === 'orders'
        );
        expect(usersRelation).toEqual(
          expect.objectContaining({
            type: 'hasMany',
            table: 'orders',
            columns: ['user_id'],
            referencedTable: 'users',
            referencedColumns: ['id'],
          })
        );

        // Validate table references
        expect(schema.tableReferences).toHaveLength(3);

        // Validate schema compliance
        const validation = DatabaseSchemaSchema.safeParse(schema);
        expect(validation.success).toBe(true);
      }
    });

    it('should parse single table with all column types', () => {
      const schemaData = createSingleTableFixture();

      const result = parseJsonSchema(schemaData);
      expect(result.isOk()).toBe(true);

      if (result.isOk()) {
        const schema = result.value;

        expect(schema.tables).toHaveLength(1);
        const table = schema.tables[0];

        expect(table.name).toBe('simple_table');
        expect(table.comment).toBe('A simple table with various column types');
        expect(table.columns).toHaveLength(9);
        expect(table.indexes).toHaveLength(3);

        // Test different column types and properties
        const columns = table.columns;

        // Auto increment column
        const idCol = columns.find((c) => c.name === 'id');
        expect(idCol?.isAutoIncrement).toBe(true);

        // Nullable column with null default
        const ageCol = columns.find((c) => c.name === 'age');
        expect(ageCol?.nullable).toBe(true);
        expect(ageCol?.defaultValue).toBeNull();

        // Non-nullable with string default
        const balanceCol = columns.find((c) => c.name === 'balance');
        expect(balanceCol?.nullable).toBe(false);
        expect(balanceCol?.defaultValue).toBe('0.00');

        // JSON column with object default
        const configCol = columns.find((c) => c.name === 'config');
        expect(configCol?.type).toBe('json');
        expect(configCol?.defaultValue).toBe('{}');

        // Test unique index
        const uniqueIndex = table.indexes.find(
          (i) => i.name === 'idx_name_unique'
        );
        expect(uniqueIndex?.isUnique).toBe(true);
        expect(uniqueIndex?.isPrimary).toBe(false);

        // Test composite index
        const compositeIndex = table.indexes.find(
          (i) => i.name === 'idx_age_balance'
        );
        expect(compositeIndex?.columns).toEqual(['age', 'balance']);
      }
    });

    it('should parse minimal schema with required fields only', () => {
      const schemaData = createMinimalSchemaFixture();

      const result = parseJsonSchema(schemaData);
      expect(result.isOk()).toBe(true);

      if (result.isOk()) {
        const schema = result.value;

        expect(schema.tables).toHaveLength(1);
        const table = schema.tables[0];

        expect(table.name).toBe('minimal_table');
        expect(table.comment).toBeNull();
        expect(table.columns).toHaveLength(1);
        expect(table.indexes).toHaveLength(0);
        expect(table.relations).toHaveLength(0);

        const column = table.columns[0];
        expect(column.name).toBe('id');
        expect(column.type).toBe('int(11)');
        expect(column.nullable).toBe(false);
        expect(column.defaultValue).toBeNull();
        expect(column.comment).toBeNull();
        expect(column.isAutoIncrement).toBe(false);
      }
    });

    it('should handle various index definitions', () => {
      const schemaData = {
        tables: [
          {
            name: 'index_test',
            type: 'TABLE',
            columns: [
              { name: 'id', type: 'int(11)', nullable: false },
              { name: 'name', type: 'varchar(100)', nullable: false },
              { name: 'email', type: 'varchar(255)', nullable: false },
              { name: 'status', type: 'int(11)', nullable: true },
              { name: 'created_at', type: 'timestamp', nullable: false },
            ],
            indexes: [
              {
                name: 'PRIMARY',
                def: 'PRIMARY KEY (id) USING BTREE',
                table: 'index_test',
                columns: ['id'],
                comment: 'Primary key with explicit algorithm',
              },
              {
                name: 'uk_email',
                def: 'UNIQUE KEY uk_email (email)',
                table: 'index_test',
                columns: ['email'],
              },
              {
                name: 'idx_name',
                def: 'KEY idx_name (name)',
                table: 'index_test',
                columns: ['name'],
              },
              {
                name: 'idx_compound',
                def: 'KEY idx_compound (name, status) USING HASH',
                table: 'index_test',
                columns: ['name', 'status'],
              },
              {
                name: 'idx_partial',
                def: 'UNIQUE KEY idx_partial (name) WHERE status IS NOT NULL',
                table: 'index_test',
                columns: ['name'],
              },
            ],
          },
        ],
      };

      const result = parseJsonSchema(schemaData);
      expect(result.isOk()).toBe(true);

      if (result.isOk()) {
        const table = result.value.tables[0];
        const indexes = table.indexes;

        expect(indexes).toHaveLength(5);

        // Primary key
        const primaryIndex = indexes.find((i) => i.name === 'PRIMARY');
        expect(primaryIndex?.isPrimary).toBe(true);
        expect(primaryIndex?.isUnique).toBe(true);

        // Unique key
        const uniqueIndex = indexes.find((i) => i.name === 'uk_email');
        expect(uniqueIndex?.isPrimary).toBe(false);
        expect(uniqueIndex?.isUnique).toBe(true);

        // Regular index
        const regularIndex = indexes.find((i) => i.name === 'idx_name');
        expect(regularIndex?.isPrimary).toBe(false);
        expect(regularIndex?.isUnique).toBe(false);

        // Compound index
        const compoundIndex = indexes.find((i) => i.name === 'idx_compound');
        expect(compoundIndex?.columns).toEqual(['name', 'status']);

        // Partial unique index
        const partialIndex = indexes.find((i) => i.name === 'idx_partial');
        expect(partialIndex?.isUnique).toBe(true);
      }
    });

    it('should handle complex relations with multiple foreign keys', () => {
      const schemaData = {
        tables: [
          {
            name: 'parent1',
            type: 'TABLE',
            columns: [{ name: 'id', type: 'int(11)', nullable: false }],
          },
          {
            name: 'parent2',
            type: 'TABLE',
            columns: [{ name: 'id', type: 'int(11)', nullable: false }],
          },
          {
            name: 'child',
            type: 'TABLE',
            columns: [
              { name: 'id', type: 'int(11)', nullable: false },
              { name: 'parent1_id', type: 'int(11)', nullable: false },
              { name: 'parent2_id', type: 'int(11)', nullable: false },
            ],
          },
        ],
        relations: [
          {
            table: 'child',
            columns: ['parent1_id'],
            parent_table: 'parent1',
            parent_columns: ['id'],
            def: 'FOREIGN KEY (parent1_id) REFERENCES parent1 (id)',
            virtual: false,
          },
          {
            table: 'child',
            columns: ['parent2_id'],
            parent_table: 'parent2',
            parent_columns: ['id'],
            def: 'FOREIGN KEY (parent2_id) REFERENCES parent2 (id)',
            virtual: false,
          },
        ],
      };

      const result = parseJsonSchema(schemaData);
      expect(result.isOk()).toBe(true);

      if (result.isOk()) {
        const schema = result.value;

        const childTable = schema.tables.find((t) => t.name === 'child');
        expect(childTable?.relations).toHaveLength(2);

        const parent1Relation = childTable?.relations.find(
          (r) => r.referencedTable === 'parent1'
        );
        expect(parent1Relation).toEqual(
          expect.objectContaining({
            type: 'belongsTo',
            table: 'child',
            columns: ['parent1_id'],
            referencedTable: 'parent1',
            referencedColumns: ['id'],
          })
        );

        const parent2Relation = childTable?.relations.find(
          (r) => r.referencedTable === 'parent2'
        );
        expect(parent2Relation).toEqual(
          expect.objectContaining({
            type: 'belongsTo',
            table: 'child',
            columns: ['parent2_id'],
            referencedTable: 'parent2',
            referencedColumns: ['id'],
          })
        );

        // Check reverse relations
        const parent1Table = schema.tables.find((t) => t.name === 'parent1');
        expect(parent1Table?.relations).toHaveLength(1);
        expect(parent1Table?.relations[0].type).toBe('hasMany');

        const parent2Table = schema.tables.find((t) => t.name === 'parent2');
        expect(parent2Table?.relations).toHaveLength(1);
        expect(parent2Table?.relations[0].type).toBe('hasMany');
      }
    });

    it('should handle composite foreign keys', () => {
      const schemaData = {
        tables: [
          {
            name: 'orders',
            type: 'TABLE',
            columns: [
              { name: 'tenant_id', type: 'int(11)', nullable: false },
              { name: 'id', type: 'int(11)', nullable: false },
            ],
          },
          {
            name: 'order_items',
            type: 'TABLE',
            columns: [
              { name: 'id', type: 'int(11)', nullable: false },
              { name: 'tenant_id', type: 'int(11)', nullable: false },
              { name: 'order_id', type: 'int(11)', nullable: false },
            ],
          },
        ],
        relations: [
          {
            table: 'order_items',
            columns: ['tenant_id', 'order_id'],
            parent_table: 'orders',
            parent_columns: ['tenant_id', 'id'],
            def: 'FOREIGN KEY (tenant_id, order_id) REFERENCES orders (tenant_id, id)',
            virtual: false,
          },
        ],
      };

      const result = parseJsonSchema(schemaData);
      expect(result.isOk()).toBe(true);

      if (result.isOk()) {
        const schema = result.value;

        const orderItemsTable = schema.tables.find(
          (t) => t.name === 'order_items'
        );
        expect(orderItemsTable?.relations).toHaveLength(1);

        const relation = orderItemsTable?.relations[0];
        expect(relation).toEqual(
          expect.objectContaining({
            type: 'belongsTo',
            table: 'order_items',
            columns: ['tenant_id', 'order_id'],
            referencedTable: 'orders',
            referencedColumns: ['tenant_id', 'id'],
          })
        );
      }
    });

    it('should detect auto_increment columns correctly', () => {
      const schemaData = {
        tables: [
          {
            name: 'auto_increment_test',
            type: 'TABLE',
            columns: [
              {
                name: 'id',
                type: 'bigint(20) unsigned',
                nullable: false,
                extra_def: 'auto_increment',
                comment: 'Auto increment primary key',
              },
              {
                name: 'serial_id',
                type: 'int(11)',
                nullable: false,
                extra_def: 'auto_increment',
                comment: 'Another auto increment column',
              },
              {
                name: 'regular_id',
                type: 'int(11)',
                nullable: false,
                comment: 'Regular column without auto increment',
              },
            ],
          },
        ],
      };

      const result = parseJsonSchema(schemaData);
      expect(result.isOk()).toBe(true);

      if (result.isOk()) {
        const table = result.value.tables[0];
        const columns = table.columns;

        const idColumn = columns.find((c) => c.name === 'id');
        expect(idColumn?.isAutoIncrement).toBe(true);

        const serialColumn = columns.find((c) => c.name === 'serial_id');
        expect(serialColumn?.isAutoIncrement).toBe(true);

        const regularColumn = columns.find((c) => c.name === 'regular_id');
        expect(regularColumn?.isAutoIncrement).toBe(false);
      }
    });

    it('should handle virtual relations', () => {
      const schemaData = {
        tables: [
          {
            name: 'users',
            type: 'TABLE',
            columns: [{ name: 'id', type: 'int(11)', nullable: false }],
          },
          {
            name: 'posts',
            type: 'TABLE',
            columns: [
              { name: 'id', type: 'int(11)', nullable: false },
              { name: 'author_name', type: 'varchar(255)', nullable: false },
            ],
          },
        ],
        relations: [
          {
            table: 'posts',
            columns: ['author_name'],
            parent_table: 'users',
            parent_columns: ['name'],
            def: 'Virtual relation based on name matching',
            virtual: true,
          },
        ],
      };

      const result = parseJsonSchema(schemaData);
      expect(result.isOk()).toBe(true);

      if (result.isOk()) {
        const schema = result.value;
        const postsTable = schema.tables.find((t) => t.name === 'posts');

        // Virtual relations should still be parsed but could be handled differently
        expect(postsTable?.relations).toHaveLength(1);
        const relation = postsTable?.relations[0];
        expect(relation).toEqual(
          expect.objectContaining({
            type: 'belongsTo',
            table: 'posts',
            columns: ['author_name'],
            referencedTable: 'users',
            referencedColumns: ['name'],
          })
        );
      }
    });
  });

  describe('parseJsonContent', () => {
    it('should parse valid JSON string', () => {
      const schemaData = createCompleteSchemaFixture();
      const jsonContent = JSON.stringify(schemaData, null, 2);

      const result = parseJsonContent(jsonContent);
      expect(result.isOk()).toBe(true);

      if (result.isOk()) {
        const schema = result.value;
        expect(schema.metadata.name).toBe('ecommerce_db');
        expect(schema.tables).toHaveLength(3);
      }
    });

    it('should handle invalid JSON syntax', () => {
      const invalidJson = `{
        "name": "invalid_schema",
        "tables": [
          {
            "name": "test",
            "columns": [
              { "name": "id", "type": "int" }
            }
          }
        // Missing closing bracket
      `;

      const result = parseJsonContent(invalidJson);
      expect(result.isErr()).toBe(true);

      if (result.isErr()) {
        expect(result.error.message).toContain('Failed to parse JSON');
      }
    });

    it('should handle empty JSON content', () => {
      const result = parseJsonContent('');
      expect(result.isErr()).toBe(true);

      if (result.isErr()) {
        expect(result.error.message).toContain('JSON content is empty');
      }
    });

    it('should handle whitespace-only content', () => {
      const result = parseJsonContent('   \n\t  ');
      expect(result.isErr()).toBe(true);

      if (result.isErr()) {
        expect(result.error.message).toContain('JSON content is empty');
      }
    });

    it('should handle null JSON content', () => {
      const result = parseJsonContent('null');
      expect(result.isErr()).toBe(true);

      if (result.isErr()) {
        expect(result.error.message).toContain('Parsed JSON is null');
      }
    });

    it('should parse JSON with extra whitespace', () => {
      const schemaData = createMinimalSchemaFixture();
      const jsonContent = `

        ${JSON.stringify(schemaData)}

        `;

      const result = parseJsonContent(jsonContent);
      expect(result.isOk()).toBe(true);

      if (result.isOk()) {
        expect(result.value.tables).toHaveLength(1);
      }
    });
  });

  describe('parseJsonFile', () => {
    it('should parse valid JSON file', () => {
      const schemaData = createCompleteSchemaFixture();
      const jsonContent = JSON.stringify(schemaData, null, 2);
      const jsonFile = join(testDir, 'schema.json');
      writeFileSync(jsonFile, jsonContent);

      const result = parseJsonFile(jsonFile);
      expect(result.isOk()).toBe(true);

      if (result.isOk()) {
        const schema = result.value;
        expect(schema.metadata.name).toBe('ecommerce_db');
        expect(schema.tables).toHaveLength(3);
        expect(schema.tableReferences).toHaveLength(3);

        // Validate schema compliance
        const validation = DatabaseSchemaSchema.safeParse(schema);
        expect(validation.success).toBe(true);
      }
    });

    it('should handle file not found error', () => {
      const nonExistentFile = join(testDir, 'non-existent.json');

      const result = parseJsonFile(nonExistentFile);
      expect(result.isErr()).toBe(true);

      if (result.isErr()) {
        expect(result.error.message).toContain('Failed to read file');
      }
    });

    it('should handle invalid JSON file', () => {
      const invalidContent = `{
        "invalid": "json",
        "missing": "bracket"
      `;

      const invalidFile = join(testDir, 'invalid.json');
      writeFileSync(invalidFile, invalidContent);

      const result = parseJsonFile(invalidFile);
      expect(result.isErr()).toBe(true);

      if (result.isErr()) {
        expect(result.error.message).toContain('Failed to parse JSON');
      }
    });

    it('should handle empty file', () => {
      const emptyFile = join(testDir, 'empty.json');
      writeFileSync(emptyFile, '');

      const result = parseJsonFile(emptyFile);
      expect(result.isErr()).toBe(true);

      if (result.isErr()) {
        expect(result.error.message).toContain('JSON content is empty');
      }
    });

    it('should parse single table file', () => {
      const schemaData = createSingleTableFixture();
      const jsonContent = JSON.stringify(schemaData, null, 2);
      const jsonFile = join(testDir, 'single-table.json');
      writeFileSync(jsonFile, jsonContent);

      const result = parseJsonFile(jsonFile);
      expect(result.isOk()).toBe(true);

      if (result.isOk()) {
        const schema = result.value;
        expect(schema.tables).toHaveLength(1);
        expect(schema.tables[0].name).toBe('simple_table');
        expect(schema.tables[0].columns).toHaveLength(9);
      }
    });
  });

  describe('Error Cases and Data Validation', () => {
    it('should fail when tables array is missing', () => {
      const invalidSchema = {
        name: 'invalid_schema',
        desc: 'Schema without tables',
        // Missing tables array
      };

      const result = parseJsonSchema(invalidSchema);
      expect(result.isErr()).toBe(true);

      if (result.isErr()) {
        expect(result.error.message).toMatch(
          /tables.*required|must contain.*tables/i
        );
      }
    });

    it('should fail when table has no columns', () => {
      const invalidSchema = {
        tables: [
          {
            name: 'empty_table',
            type: 'TABLE',
            // Missing columns array
          },
        ],
      };

      const result = parseJsonSchema(invalidSchema);
      expect(result.isErr()).toBe(true);

      if (result.isErr()) {
        expect(result.error.message).toMatch(
          /columns.*required|must have.*column/i
        );
      }
    });

    it('should fail when table has empty columns array', () => {
      const invalidSchema = {
        tables: [
          {
            name: 'no_columns_table',
            type: 'TABLE',
            columns: [],
          },
        ],
      };

      const result = parseJsonSchema(invalidSchema);
      expect(result.isErr()).toBe(true);

      if (result.isErr()) {
        expect(result.error.message).toMatch(/must have at least one column/i);
      }
    });

    it('should fail when column has empty name', () => {
      const invalidSchema = {
        tables: [
          {
            name: 'invalid_column_table',
            type: 'TABLE',
            columns: [
              {
                name: '',
                type: 'int(11)',
                nullable: false,
              },
            ],
          },
        ],
      };

      const result = parseJsonSchema(invalidSchema);
      expect(result.isErr()).toBe(true);

      if (result.isErr()) {
        expect(result.error.message).toMatch(/name.*required|name.*empty/i);
      }
    });

    it('should fail when column has empty type', () => {
      const invalidSchema = {
        tables: [
          {
            name: 'invalid_type_table',
            type: 'TABLE',
            columns: [
              {
                name: 'id',
                type: '',
                nullable: false,
              },
            ],
          },
        ],
      };

      const result = parseJsonSchema(invalidSchema);
      expect(result.isErr()).toBe(true);

      if (result.isErr()) {
        expect(result.error.message).toMatch(/type.*required|type.*empty/i);
      }
    });

    it('should fail when table has empty name', () => {
      const invalidSchema = {
        tables: [
          {
            name: '',
            type: 'TABLE',
            columns: [
              {
                name: 'id',
                type: 'int(11)',
                nullable: false,
              },
            ],
          },
        ],
      };

      const result = parseJsonSchema(invalidSchema);
      expect(result.isErr()).toBe(true);

      if (result.isErr()) {
        expect(result.error.message).toMatch(
          /table.*name.*required|name.*empty/i
        );
      }
    });

    it('should fail when index has no columns', () => {
      const invalidSchema = {
        tables: [
          {
            name: 'invalid_index_table',
            type: 'TABLE',
            columns: [{ name: 'id', type: 'int(11)', nullable: false }],
            indexes: [
              {
                name: 'empty_index',
                def: 'KEY empty_index ()',
                table: 'invalid_index_table',
                columns: [],
              },
            ],
          },
        ],
      };

      const result = parseJsonSchema(invalidSchema);
      expect(result.isErr()).toBe(true);

      if (result.isErr()) {
        expect(result.error.message).toMatch(/index.*must have.*column/i);
      }
    });

    it('should fail when relation has mismatched column counts', () => {
      const invalidSchema = {
        tables: [
          {
            name: 'parent',
            type: 'TABLE',
            columns: [
              { name: 'id', type: 'int(11)', nullable: false },
              { name: 'secondary_id', type: 'int(11)', nullable: false },
            ],
          },
          {
            name: 'child',
            type: 'TABLE',
            columns: [
              { name: 'id', type: 'int(11)', nullable: false },
              { name: 'parent_id', type: 'int(11)', nullable: false },
            ],
          },
        ],
        relations: [
          {
            table: 'child',
            columns: ['parent_id'],
            parent_table: 'parent',
            parent_columns: ['id', 'secondary_id'], // Mismatch: 1 vs 2 columns
            def: 'FOREIGN KEY (parent_id) REFERENCES parent (id, secondary_id)',
            virtual: false,
          },
        ],
      };

      const result = parseJsonSchema(invalidSchema);
      expect(result.isErr()).toBe(true);

      if (result.isErr()) {
        expect(result.error.message).toMatch(
          /columns.*count.*mismatch|relation.*column.*mismatch/i
        );
      }
    });

    it('should handle malformed JSON gracefully', () => {
      const malformedJsonContent = `{
        "name": "test",
        "tables": [
          {
            "name": "test_table",
            "columns": [
              { "name": "id", "type": "int" },
              { "name": "data", "type": "varchar(255)" }
            ]
          }
        ]
        // This comment makes it invalid JSON
      }`;

      const result = parseJsonContent(malformedJsonContent);
      expect(result.isErr()).toBe(true);

      if (result.isErr()) {
        expect(result.error.message).toContain('Failed to parse JSON');
        expect(result.error.message.toLowerCase()).toMatch(/json|parse|syntax/);
      }
    });

    it('should validate final schema structure', () => {
      const schemaData = createCompleteSchemaFixture();

      const result = parseJsonSchema(schemaData);
      expect(result.isOk()).toBe(true);

      if (result.isOk()) {
        // The parsed schema should pass our Zod validation
        const validation = DatabaseSchemaSchema.safeParse(result.value);
        expect(validation.success).toBe(true);

        // Each table should also pass validation individually
        result.value.tables.forEach((table) => {
          const tableValidation = DatabaseTableSchema.safeParse(table);
          expect(tableValidation.success).toBe(true);
        });
      }
    });
  });

  describe('Edge Cases and Special Handling', () => {
    it('should handle special characters in table and column names', () => {
      const schemaData = {
        tables: [
          {
            name: 'special_chars_2024',
            type: 'TABLE',
            columns: [
              {
                name: 'id',
                type: 'int(11)',
                nullable: false,
              },
              {
                name: 'field_with_underscore',
                type: 'varchar(255)',
                nullable: true,
              },
              {
                name: 'CamelCaseField',
                type: 'text',
                nullable: true,
              },
            ],
          },
        ],
      };

      const result = parseJsonSchema(schemaData);
      expect(result.isOk()).toBe(true);

      if (result.isOk()) {
        const table = result.value.tables[0];
        expect(table.name).toBe('special_chars_2024');
        expect(table.columns[1].name).toBe('field_with_underscore');
        expect(table.columns[2].name).toBe('CamelCaseField');
      }
    });

    it('should handle NULL and empty string defaults correctly', () => {
      const schemaData = {
        tables: [
          {
            name: 'default_test',
            type: 'TABLE',
            columns: [
              {
                name: 'null_default',
                type: 'varchar(255)',
                nullable: true,
                default: null,
              },
              {
                name: 'string_null_default',
                type: 'varchar(255)',
                nullable: true,
                default: 'NULL',
              },
              {
                name: 'empty_string_default',
                type: 'varchar(255)',
                nullable: false,
                default: '',
              },
              {
                name: 'no_default',
                type: 'varchar(255)',
                nullable: false,
              },
            ],
          },
        ],
      };

      const result = parseJsonSchema(schemaData);
      expect(result.isOk()).toBe(true);

      if (result.isOk()) {
        const columns = result.value.tables[0].columns;

        expect(columns[0].defaultValue).toBeNull();
        expect(columns[1].defaultValue).toBe('NULL');
        expect(columns[2].defaultValue).toBe('');
        expect(columns[3].defaultValue).toBeNull();
      }
    });

    it('should handle schema with no name or description', () => {
      const schemaData = {
        tables: [
          {
            name: 'anonymous_table',
            type: 'TABLE',
            columns: [
              {
                name: 'id',
                type: 'int(11)',
                nullable: false,
              },
            ],
          },
        ],
      };

      const result = parseJsonSchema(schemaData);
      expect(result.isOk()).toBe(true);

      if (result.isOk()) {
        const schema = result.value;
        expect(schema.metadata.name).toBe('database_schema');
        expect(schema.metadata.description).toBeNull();
        expect(schema.tables).toHaveLength(1);
      }
    });

    it('should handle mixed index types in single table', () => {
      const schemaData = {
        tables: [
          {
            name: 'mixed_indexes',
            type: 'TABLE',
            columns: [
              { name: 'id', type: 'int(11)', nullable: false },
              { name: 'unique_field', type: 'varchar(100)', nullable: false },
              { name: 'indexed_field', type: 'varchar(100)', nullable: true },
              { name: 'compound_field1', type: 'int(11)', nullable: true },
              { name: 'compound_field2', type: 'varchar(50)', nullable: true },
            ],
            indexes: [
              {
                name: 'PRIMARY',
                def: 'PRIMARY KEY (id)',
                table: 'mixed_indexes',
                columns: ['id'],
              },
              {
                name: 'uk_unique',
                def: 'UNIQUE KEY uk_unique (unique_field)',
                table: 'mixed_indexes',
                columns: ['unique_field'],
              },
              {
                name: 'idx_regular',
                def: 'KEY idx_regular (indexed_field)',
                table: 'mixed_indexes',
                columns: ['indexed_field'],
              },
              {
                name: 'idx_compound',
                def: 'KEY idx_compound (compound_field1, compound_field2)',
                table: 'mixed_indexes',
                columns: ['compound_field1', 'compound_field2'],
              },
            ],
          },
        ],
      };

      const result = parseJsonSchema(schemaData);
      expect(result.isOk()).toBe(true);

      if (result.isOk()) {
        const indexes = result.value.tables[0].indexes;
        expect(indexes).toHaveLength(4);

        const primary = indexes.find((i) => i.name === 'PRIMARY');
        expect(primary?.isPrimary).toBe(true);
        expect(primary?.isUnique).toBe(true);

        const unique = indexes.find((i) => i.name === 'uk_unique');
        expect(unique?.isPrimary).toBe(false);
        expect(unique?.isUnique).toBe(true);

        const regular = indexes.find((i) => i.name === 'idx_regular');
        expect(regular?.isPrimary).toBe(false);
        expect(regular?.isUnique).toBe(false);

        const compound = indexes.find((i) => i.name === 'idx_compound');
        expect(compound?.columns).toHaveLength(2);
      }
    });
  });
});
