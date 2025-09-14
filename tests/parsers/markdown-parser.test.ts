import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  parseMarkdownFile,
  parseTableMarkdown,
  parseColumnsSection,
  parseIndexesSection,
  parseRelationsSection,
  parseSchemaOverview,
} from '../../src/parsers/markdown-parser';
import { DatabaseTableSchema, DatabaseSchemaSchema } from '../../src/schemas/database';

describe('Tbls Markdown Parser', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `tbls-parser-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('parseColumnsSection', () => {
    it('should parse basic column information', () => {
      const columnMarkdown = `
| Name | Type | Default | Nullable | Children | Parents | Comment |
| ---- | ---- | ------- | -------- | -------- | ------- | ------- |
| id | int(11) | | false | | | Primary key |
| name | varchar(255) | NULL | true | | | User name |
| email | varchar(255) | | false | | | Email address |
| created_at | timestamp | CURRENT_TIMESTAMP | false | | | Record creation time |
      `.trim();

      const result = parseColumnsSection(columnMarkdown);
      expect(result.isOk()).toBe(true);

      if (result.isOk()) {
        const columns = result.value;
        expect(columns).toHaveLength(4);

        expect(columns[0]).toEqual(expect.objectContaining({
          name: 'id',
          type: 'int(11)',
          nullable: false,
          defaultValue: null,
          comment: 'Primary key'
        }));

        expect(columns[1]).toEqual(expect.objectContaining({
          name: 'name',
          type: 'varchar(255)',
          nullable: true,
          defaultValue: 'NULL',
          comment: 'User name'
        }));

        expect(columns[2]).toEqual(expect.objectContaining({
          name: 'email',
          type: 'varchar(255)',
          nullable: false,
          defaultValue: null,
          comment: 'Email address'
        }));

        expect(columns[3]).toEqual(expect.objectContaining({
          name: 'created_at',
          type: 'timestamp',
          nullable: false,
          defaultValue: 'CURRENT_TIMESTAMP',
          comment: 'Record creation time'
        }));
      }
    });

    it('should handle columns with complex types and constraints', () => {
      const columnMarkdown = `
| Name | Type | Default | Nullable | Children | Parents | Comment |
| ---- | ---- | ------- | -------- | -------- | ------- | ------- |
| id | bigint(20) unsigned auto_increment | | false | users.id | | Primary key with auto increment |
| balance | decimal(10,2) | 0.00 | false | | | Account balance |
| metadata | json | {} | true | | | Additional metadata |
      `.trim();

      const result = parseColumnsSection(columnMarkdown);
      expect(result.isOk()).toBe(true);

      if (result.isOk()) {
        const columns = result.value;
        expect(columns).toHaveLength(3);

        expect(columns[0]).toEqual(expect.objectContaining({
          name: 'id',
          type: 'bigint(20) unsigned auto_increment',
          nullable: false,
          defaultValue: null,
          comment: 'Primary key with auto increment'
        }));

        expect(columns[1]).toEqual(expect.objectContaining({
          name: 'balance',
          type: 'decimal(10,2)',
          nullable: false,
          defaultValue: '0.00',
          comment: 'Account balance'
        }));
      }
    });

    it('should handle empty column section', () => {
      const result = parseColumnsSection('');
      expect(result.isErr()).toBe(true);

      if (result.isErr()) {
        expect(result.error.message).toContain('No columns table found');
      }
    });

    it('should handle malformed column table', () => {
      const malformedMarkdown = `
| Name | Type |
| ---- | ---- |
| id |
      `.trim();

      const result = parseColumnsSection(malformedMarkdown);
      expect(result.isErr()).toBe(true);
    });
  });

  describe('parseIndexesSection', () => {
    it('should parse basic index information', () => {
      const indexMarkdown = `
| Name | Definition |
| ---- | ---------- |
| PRIMARY | PRIMARY KEY (id) |
| idx_email | KEY idx_email (email) |
| idx_name_email | UNIQUE KEY idx_name_email (name, email) |
      `.trim();

      const result = parseIndexesSection(indexMarkdown);
      expect(result.isOk()).toBe(true);

      if (result.isOk()) {
        const indexes = result.value;
        expect(indexes).toHaveLength(3);

        expect(indexes[0]).toEqual(expect.objectContaining({
          name: 'PRIMARY',
          columns: ['id'],
          isPrimary: true,
          isUnique: true
        }));

        expect(indexes[1]).toEqual(expect.objectContaining({
          name: 'idx_email',
          columns: ['email'],
          isPrimary: false,
          isUnique: false
        }));

        expect(indexes[2]).toEqual(expect.objectContaining({
          name: 'idx_name_email',
          columns: ['name', 'email'],
          isPrimary: false,
          isUnique: true
        }));
      }
    });

    it('should handle complex index definitions', () => {
      const indexMarkdown = `
| Name | Definition |
| ---- | ---------- |
| PRIMARY | PRIMARY KEY (id) USING BTREE |
| idx_composite | KEY idx_composite (tenant_id, status, created_at) USING BTREE |
| idx_partial | UNIQUE KEY idx_partial (email) WHERE deleted_at IS NULL |
      `.trim();

      const result = parseIndexesSection(indexMarkdown);
      expect(result.isOk()).toBe(true);

      if (result.isOk()) {
        const indexes = result.value;
        expect(indexes).toHaveLength(3);

        expect(indexes[1]).toEqual(expect.objectContaining({
          name: 'idx_composite',
          columns: ['tenant_id', 'status', 'created_at'],
          isPrimary: false,
          isUnique: false
        }));
      }
    });

    it('should handle empty index section', () => {
      const result = parseIndexesSection('');
      expect(result.isOk()).toBe(true);

      if (result.isOk()) {
        expect(result.value).toEqual([]);
      }
    });
  });

  describe('parseRelationsSection', () => {
    it('should parse foreign key relationships', () => {
      const relationMarkdown = `
## Relations

### user_profiles

| Column | Table | Parent Key | Type |
| ------ | ----- | ---------- | ---- |
| user_id | users | id | one-to-one |

### user_posts

| Column | Table | Parent Key | Type |
| ------ | ----- | ---------- | ---- |
| user_id | users | id | one-to-many |

### user_roles

| Column | Table | Parent Key | Type |
| ------ | ----- | ---------- | ---- |
| role_id | roles | id | many-to-one |
      `.trim();

      const result = parseRelationsSection(relationMarkdown);
      expect(result.isOk()).toBe(true);

      if (result.isOk()) {
        const relations = result.value;
        expect(relations).toHaveLength(3);

        expect(relations[0]).toEqual(expect.objectContaining({
          type: 'hasOne',
          table: 'user_profiles',
          columns: ['user_id'],
          referencedTable: 'users',
          referencedColumns: ['id']
        }));

        expect(relations[1]).toEqual(expect.objectContaining({
          type: 'hasMany',
          table: 'user_posts',
          columns: ['user_id'],
          referencedTable: 'users',
          referencedColumns: ['id']
        }));

        expect(relations[2]).toEqual(expect.objectContaining({
          type: 'belongsTo',
          table: 'user_roles',
          columns: ['role_id'],
          referencedTable: 'roles',
          referencedColumns: ['id']
        }));
      }
    });

    it('should handle composite foreign keys', () => {
      const relationMarkdown = `
## Relations

### order_items

| Column | Table | Parent Key | Type |
| ------ | ----- | ---------- | ---- |
| tenant_id, order_id | orders | tenant_id, id | many-to-one |
      `.trim();

      const result = parseRelationsSection(relationMarkdown);
      expect(result.isOk()).toBe(true);

      if (result.isOk()) {
        const relations = result.value;
        expect(relations).toHaveLength(1);

        expect(relations[0]).toEqual(expect.objectContaining({
          type: 'belongsTo',
          table: 'order_items',
          columns: ['tenant_id', 'order_id'],
          referencedTable: 'orders',
          referencedColumns: ['tenant_id', 'id']
        }));
      }
    });

    it('should handle empty relations section', () => {
      const result = parseRelationsSection('');
      expect(result.isOk()).toBe(true);

      if (result.isOk()) {
        expect(result.value).toEqual([]);
      }
    });
  });

  describe('parseTableMarkdown', () => {
    it('should parse complete table information', () => {
      const tableMarkdown = `
# users

User account information

## Columns

| Name | Type | Default | Nullable | Children | Parents | Comment |
| ---- | ---- | ------- | -------- | -------- | ------- | ------- |
| id | bigint(20) unsigned auto_increment | | false | user_profiles.user_id<br>user_posts.user_id | | Primary key |
| email | varchar(255) | | false | | | Email address |
| name | varchar(255) | NULL | true | | | Full name |
| created_at | timestamp | CURRENT_TIMESTAMP | false | | | |

## Indexes

| Name | Definition |
| ---- | ---------- |
| PRIMARY | PRIMARY KEY (id) |
| idx_email | UNIQUE KEY idx_email (email) |

## Relations

### user_profiles

| Column | Table | Parent Key | Type |
| ------ | ----- | ---------- | ---- |
| user_id | users | id | one-to-one |

### user_posts

| Column | Table | Parent Key | Type |
| ------ | ----- | ---------- | ---- |
| user_id | users | id | one-to-many |
      `.trim();

      const result = parseTableMarkdown(tableMarkdown);
      expect(result.isOk()).toBe(true);

      if (result.isOk()) {
        const table = result.value;
        expect(table.name).toBe('users');
        expect(table.comment).toBe('User account information');
        expect(table.columns).toHaveLength(4);
        expect(table.indexes).toHaveLength(2);
        expect(table.relations).toHaveLength(2);

        // Validate schema compliance
        const validation = DatabaseTableSchema.safeParse(table);
        expect(validation.success).toBe(true);
      }
    });

    it('should parse table without comment', () => {
      const tableMarkdown = `
# products

## Columns

| Name | Type | Default | Nullable | Children | Parents | Comment |
| ---- | ---- | ------- | -------- | -------- | ------- | ------- |
| id | int(11) | | false | | | |
| name | varchar(255) | | false | | | |
      `.trim();

      const result = parseTableMarkdown(tableMarkdown);
      expect(result.isOk()).toBe(true);

      if (result.isOk()) {
        const table = result.value;
        expect(table.name).toBe('products');
        expect(table.comment).toBeNull();
        expect(table.columns).toHaveLength(2);
      }
    });

    it('should handle table without indexes or relations', () => {
      const tableMarkdown = `
# simple_table

A simple table with just columns

## Columns

| Name | Type | Default | Nullable | Children | Parents | Comment |
| ---- | ---- | ------- | -------- | -------- | ------- | ------- |
| id | int(11) | | false | | | Primary key |
| value | varchar(100) | | false | | | Some value |
      `.trim();

      const result = parseTableMarkdown(tableMarkdown);
      expect(result.isOk()).toBe(true);

      if (result.isOk()) {
        const table = result.value;
        expect(table.name).toBe('simple_table');
        expect(table.comment).toBe('A simple table with just columns');
        expect(table.columns).toHaveLength(2);
        expect(table.indexes).toEqual([]);
        expect(table.relations).toEqual([]);
      }
    });

    it('should fail on invalid table structure', () => {
      const invalidMarkdown = `
# invalid_table

## No columns section here
      `.trim();

      const result = parseTableMarkdown(invalidMarkdown);
      expect(result.isErr()).toBe(true);
    });
  });

  describe('parseSchemaOverview', () => {
    it('should parse schema overview with table list', () => {
      const overviewMarkdown = `
# Database Schema: test_db

Generated on: 2024-01-15 10:30:00
Tables: 5

## Tables

| Name | Columns | Comment |
| ---- | ------- | ------- |
| users | 4 | User accounts |
| posts | 6 | Blog posts |
| comments | 5 | Post comments |
| categories | 3 | Content categories |
| tags | 2 | Content tags |
      `.trim();

      const result = parseSchemaOverview(overviewMarkdown);
      expect(result.isOk()).toBe(true);

      if (result.isOk()) {
        const metadata = result.value;
        expect(metadata.name).toBe('test_db');
        expect(metadata.tableCount).toBe(5);
        expect(metadata.generated).toContain('2024-01-15');
      }
    });

    it('should handle minimal schema overview', () => {
      const overviewMarkdown = `
# Database Schema: minimal_db

## Tables

| Name | Columns | Comment |
| ---- | ------- | ------- |
| users | 3 | |
      `.trim();

      const result = parseSchemaOverview(overviewMarkdown);
      expect(result.isOk()).toBe(true);

      if (result.isOk()) {
        const metadata = result.value;
        expect(metadata.name).toBe('minimal_db');
        expect(metadata.tableCount).toBeNull();
        expect(metadata.generated).toBeNull();
      }
    });
  });

  describe('parseMarkdownFile', () => {
    it('should parse complete schema markdown file', () => {
      const schemaContent = `
# Database Schema: ecommerce

E-commerce database schema with user management and order processing

Generated on: 2024-01-15 10:30:00
Tables: 3

## Tables

| Name | Columns | Comment |
| ---- | ------- | ------- |
| users | 4 | User accounts |
| orders | 6 | Customer orders |
| products | 5 | Product catalog |

---

# users

User account information and authentication data

## Columns

| Name | Type | Default | Nullable | Children | Parents | Comment |
| ---- | ---- | ------- | -------- | -------- | ------- | ------- |
| id | bigint(20) unsigned auto_increment | | false | orders.user_id | | Primary key |
| email | varchar(255) | | false | | | Email address |
| name | varchar(255) | NULL | true | | | Full name |
| created_at | timestamp | CURRENT_TIMESTAMP | false | | | Registration time |

## Indexes

| Name | Definition |
| ---- | ---------- |
| PRIMARY | PRIMARY KEY (id) |
| idx_email | UNIQUE KEY idx_email (email) |

## Relations

### orders

| Column | Table | Parent Key | Type |
| ------ | ----- | ---------- | ---- |
| user_id | users | id | one-to-many |

---

# orders

Customer order information

## Columns

| Name | Type | Default | Nullable | Children | Parents | Comment |
| ---- | ---- | ------- | -------- | -------- | ------- | ------- |
| id | bigint(20) unsigned auto_increment | | false | | | Primary key |
| user_id | bigint(20) unsigned | | false | | users.id | Customer reference |
| status | enum('pending','confirmed','shipped','delivered') | pending | false | | | Order status |
| total | decimal(10,2) | 0.00 | false | | | Order total |
| created_at | timestamp | CURRENT_TIMESTAMP | false | | | Order date |
| updated_at | timestamp | CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP | false | | | Last update |

## Indexes

| Name | Definition |
| ---- | ---------- |
| PRIMARY | PRIMARY KEY (id) |
| idx_user_id | KEY idx_user_id (user_id) |
| idx_status | KEY idx_status (status) |

## Relations

### users

| Column | Table | Parent Key | Type |
| ------ | ----- | ---------- | ---- |
| user_id | users | id | many-to-one |

---

# products

Product catalog information

## Columns

| Name | Type | Default | Nullable | Children | Parents | Comment |
| ---- | ---- | ------- | -------- | -------- | ------- | ------- |
| id | bigint(20) unsigned auto_increment | | false | | | Primary key |
| name | varchar(255) | | false | | | Product name |
| description | text | NULL | true | | | Product description |
| price | decimal(10,2) | 0.00 | false | | | Product price |
| created_at | timestamp | CURRENT_TIMESTAMP | false | | | Creation time |

## Indexes

| Name | Definition |
| ---- | ---------- |
| PRIMARY | PRIMARY KEY (id) |
| idx_name | KEY idx_name (name) |
      `.trim();

      const schemaFile = join(testDir, 'schema.md');
      writeFileSync(schemaFile, schemaContent);

      const result = parseMarkdownFile(schemaFile);
      expect(result.isOk()).toBe(true);

      if (result.isOk()) {
        const schema = result.value;

        // Validate metadata
        expect(schema.metadata.name).toBe('ecommerce');
        expect(schema.metadata.tableCount).toBe(3);
        expect(schema.metadata.description).toBe('E-commerce database schema with user management and order processing');

        // Validate tables
        expect(schema.tables).toHaveLength(3);

        const usersTable = schema.tables.find(t => t.name === 'users');
        expect(usersTable).toBeDefined();
        expect(usersTable?.columns).toHaveLength(4);
        expect(usersTable?.indexes).toHaveLength(2);
        expect(usersTable?.relations).toHaveLength(1);

        const ordersTable = schema.tables.find(t => t.name === 'orders');
        expect(ordersTable).toBeDefined();
        expect(ordersTable?.columns).toHaveLength(6);
        expect(ordersTable?.indexes).toHaveLength(3);
        expect(ordersTable?.relations).toHaveLength(1);

        const productsTable = schema.tables.find(t => t.name === 'products');
        expect(productsTable).toBeDefined();
        expect(productsTable?.columns).toHaveLength(5);
        expect(productsTable?.indexes).toHaveLength(2);
        expect(productsTable?.relations).toHaveLength(0);

        // Validate table references
        expect(schema.tableReferences).toHaveLength(3);
        const usersRef = schema.tableReferences.find(ref => ref.name === 'users');
        expect(usersRef?.comment).toBe('User accounts');
        expect(usersRef?.columnCount).toBe(4);

        // Validate schema compliance
        const validation = DatabaseSchemaSchema.safeParse(schema);
        expect(validation.success).toBe(true);
      }
    });

    it('should handle file not found error', () => {
      const nonExistentFile = join(testDir, 'non-existent.md');

      const result = parseMarkdownFile(nonExistentFile);
      expect(result.isErr()).toBe(true);

      if (result.isErr()) {
        expect(result.error.message).toContain('Failed to read file');
      }
    });

    it('should handle invalid markdown structure', () => {
      const invalidContent = `
This is not a valid tbls markdown file
      `.trim();

      const invalidFile = join(testDir, 'invalid.md');
      writeFileSync(invalidFile, invalidContent);

      const result = parseMarkdownFile(invalidFile);
      expect(result.isErr()).toBe(true);
    });

    it('should parse single table file', () => {
      const singleTableContent = `
# users

User account information

## Columns

| Name | Type | Default | Nullable | Children | Parents | Comment |
| ---- | ---- | ------- | -------- | -------- | ------- | ------- |
| id | int(11) | | false | | | Primary key |
| email | varchar(255) | | false | | | Email address |

## Indexes

| Name | Definition |
| ---- | ---------- |
| PRIMARY | PRIMARY KEY (id) |
      `.trim();

      const tableFile = join(testDir, 'users.md');
      writeFileSync(tableFile, singleTableContent);

      const result = parseMarkdownFile(tableFile);
      expect(result.isOk()).toBe(true);

      if (result.isOk()) {
        const schema = result.value;

        // Should create minimal metadata
        expect(schema.metadata.name).toBe('users');
        expect(schema.tables).toHaveLength(1);
        expect(schema.tables[0].name).toBe('users');
        expect(schema.tableReferences).toHaveLength(0);
      }
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle tables with special characters in names', () => {
      const tableMarkdown = `
# user_accounts_2024

## Columns

| Name | Type | Default | Nullable | Children | Parents | Comment |
| ---- | ---- | ------- | -------- | -------- | ------- | ------- |
| id | int(11) | | false | | | |
      `.trim();

      const result = parseTableMarkdown(tableMarkdown);
      expect(result.isOk()).toBe(true);

      if (result.isOk()) {
        expect(result.value.name).toBe('user_accounts_2024');
      }
    });

    it('should handle columns with empty comments', () => {
      const columnMarkdown = `
| Name | Type | Default | Nullable | Children | Parents | Comment |
| ---- | ---- | ------- | -------- | -------- | ------- | ------- |
| id | int(11) | | false | | | |
| name | varchar(255) | | false | | | |
      `.trim();

      const result = parseColumnsSection(columnMarkdown);
      expect(result.isOk()).toBe(true);

      if (result.isOk()) {
        const columns = result.value;
        expect(columns[0].comment).toBeNull();
        expect(columns[1].comment).toBeNull();
      }
    });

    it('should handle malformed table separators', () => {
      const content = `
# Database Schema: test

## Tables

| Name | Columns | Comment |
| ---- | ------- | ------- |
| users | 2 | |

====

# users

## Columns

| Name | Type | Default | Nullable | Children | Parents | Comment |
| ---- | ---- | ------- | -------- | -------- | ------- | ------- |
| id | int(11) | | false | | | |
      `.trim();

      const file = join(testDir, 'malformed.md');
      writeFileSync(file, content);

      const result = parseMarkdownFile(file);
      // Should still parse successfully, just might not detect table separator correctly
      expect(result.isOk()).toBe(true);
    });

    it('should validate parsed data against schemas', () => {
      const invalidTableMarkdown = `
# invalid_table

## Columns

| Name | Type | Default | Nullable | Children | Parents | Comment |
| ---- | ---- | ------- | -------- | -------- | ------- | ------- |
| | int(11) | | false | | | Empty name |
      `.trim();

      const result = parseTableMarkdown(invalidTableMarkdown);
      expect(result.isErr()).toBe(true);

      if (result.isErr()) {
        expect(result.error.message).toMatch(/validation|required|must have/i);
      }
    });
  });
});