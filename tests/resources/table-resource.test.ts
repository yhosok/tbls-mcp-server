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
  let schemaDir: string;

  beforeEach(async () => {
    // Create a temporary directory for tests
    tempDir = await fs.mkdtemp(join(tmpdir(), 'tbls-test-'));
    schemaDir = join(tempDir, 'schemas');
    await fs.mkdir(schemaDir);
  });

  afterEach(async () => {
    // Clean up temporary directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('handleSchemaTablesResource', () => {
    it('should return table list for single schema setup', async () => {
      const readmeContent = `# Database Schema

## Tables

| Name | Columns | Comment |
| ---- | ------- | ------- |
| users | 5 | User accounts table |
| posts | 8 | Blog posts table |
| comments | 6 | Post comments table |

Generated at: 2024-01-15T10:30:00Z
`;

      await fs.writeFile(join(schemaDir, 'README.md'), readmeContent);

      const result = await handleSchemaTablesResource(schemaDir, 'default');

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
      const publicSchemaDir = join(schemaDir, 'public');
      await fs.mkdir(publicSchemaDir);

      const publicReadme = `# Public Schema

## Tables

| Name | Columns | Comment |
| ---- | ------- | ------- |
| users | 5 | User accounts |
| products | 10 | Product catalog |
| orders | 12 | Customer orders |

Generated at: 2024-01-15T10:30:00Z
`;

      await fs.writeFile(join(publicSchemaDir, 'README.md'), publicReadme);

      const result = await handleSchemaTablesResource(schemaDir, 'public');

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
      const result = await handleSchemaTablesResource(schemaDir, 'nonexistent');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('No schema file found');
      }
    });

    it('should handle README.md with no tables section', async () => {
      const readmeWithoutTables = `# Schema

This documentation has no tables.

## Some Other Section

Content here.
`;

      await fs.writeFile(join(schemaDir, 'README.md'), readmeWithoutTables);

      const result = await handleSchemaTablesResource(schemaDir, 'default');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const resource: SchemaTablesResource = result.value;
        expect(resource.schemaName).toBe('default');
        expect(resource.tables).toHaveLength(0);
      }
    });

    it('should handle malformed table section gracefully', async () => {
      const malformedReadme = `# Schema

## Tables

This is not a proper table format.

| Name | Missing columns |
| ---- |
| incomplete_table |

## Other Section
`;

      await fs.writeFile(join(schemaDir, 'README.md'), malformedReadme);

      const result = await handleSchemaTablesResource(schemaDir, 'default');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const resource: SchemaTablesResource = result.value;
        expect(resource.schemaName).toBe('default');
        expect(resource.tables).toHaveLength(0);
      }
    });
  });

  describe('handleTableInfoResource', () => {
    it('should return detailed table information for single schema setup', async () => {
      // Create a detailed table markdown file
      const usersTableContent = `# users

User accounts table

## Description

This table stores user account information including authentication details and profile data.

## Columns

| Name | Type | Default | Nullable | Children | Parents | Comment |
| ---- | ---- | ------- | -------- | -------- | ------- | ------- |
| id | bigint |  | false |  |  | Primary key |
| email | varchar(255) |  | false |  |  | User email address |
| password_hash | varchar(255) |  | false |  |  | Hashed password |
| created_at | timestamp | CURRENT_TIMESTAMP | false |  |  | Record creation time |
| updated_at | timestamp | CURRENT_TIMESTAMP | true |  |  | Record update time |

## Indexes

| Name | Definition | Comment |
| ---- | ---------- | ------- |
| PRIMARY | PRIMARY KEY (id) | Primary key index |
| users_email_unique | UNIQUE (email) | Unique email constraint |
| users_created_at_idx | INDEX (created_at) | Index for date queries |

## Relations

| Column | Cardinality | Related Table | Related Column(s) | Constraint |
| ------ | ----------- | ------------- | ----------------- | ---------- |
| id | Zero or more | posts | user_id | posts_user_id_fkey |
| id | Zero or more | comments | user_id | comments_user_id_fkey |

## Referenced Tables

- posts
- comments

Generated at: 2024-01-15T10:30:00Z by tbls
`;

      await fs.writeFile(join(schemaDir, 'users.md'), usersTableContent);

      const result = await handleTableInfoResource(schemaDir, 'default', 'users');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const resource: TableInfoResource = result.value;
        expect(resource.schemaName).toBe('default');
        expect(resource.table.name).toBe('users');
        expect(resource.table.comment).toBe('User accounts table');
        expect(resource.table.columns).toHaveLength(5);
        expect(resource.table.indexes).toHaveLength(3);
        expect(resource.table.relations).toHaveLength(2);

        // Check specific column details
        const idColumn = resource.table.columns.find(c => c.name === 'id');
        expect(idColumn).toEqual({
          name: 'id',
          type: 'bigint',
          nullable: false,
          defaultValue: null,
          comment: 'Primary key',
          isPrimaryKey: true,
          isAutoIncrement: false,
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

        // Check relation details
        const postsRelation = resource.table.relations.find(r => r.referencedTable === 'posts');
        expect(postsRelation).toEqual({
          type: 'hasMany',
          table: 'users',
          columns: ['id'],
          referencedTable: 'posts',
          referencedColumns: ['user_id'],
          constraintName: 'posts_user_id_fkey'
        });
      }
    });

    it('should return table info for multi-schema setup', async () => {
      const analyticsDir = join(schemaDir, 'analytics');
      await fs.mkdir(analyticsDir);

      const eventsTableContent = `# events

User events tracking table

## Columns

| Name | Type | Default | Nullable | Children | Parents | Comment |
| ---- | ---- | ------- | -------- | -------- | ------- | ------- |
| id | uuid |  | false |  |  | Event ID |
| user_id | bigint |  | true |  | public.users.id | User who triggered event |
| event_type | varchar(100) |  | false |  |  | Type of event |
| timestamp | timestamp |  | false |  |  | When event occurred |

## Indexes

| Name | Definition | Comment |
| ---- | ---------- | ------- |
| events_pkey | PRIMARY KEY (id) | Primary key |
| events_timestamp_idx | INDEX (timestamp) | Time-based queries |

Generated at: 2024-01-15T10:30:00Z by tbls
`;

      await fs.writeFile(join(analyticsDir, 'events.md'), eventsTableContent);

      const result = await handleTableInfoResource(schemaDir, 'analytics', 'events');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const resource: TableInfoResource = result.value;
        expect(resource.schemaName).toBe('analytics');
        expect(resource.table.name).toBe('events');
        expect(resource.table.columns).toHaveLength(4);
        expect(resource.table.indexes).toHaveLength(2);

        const userIdColumn = resource.table.columns.find(c => c.name === 'user_id');
        expect(userIdColumn?.nullable).toBe(true);
        expect(userIdColumn?.comment).toBe('User who triggered event');
      }
    });

    it('should handle table file that does not exist', async () => {
      const result = await handleTableInfoResource(schemaDir, 'default', 'nonexistent_table');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('No schema file found');
      }
    });

    it('should handle malformed table markdown file', async () => {
      const malformedContent = `# invalid_table

This is not a proper table markdown file.

Some random content without proper structure.
`;

      await fs.writeFile(join(schemaDir, 'invalid_table.md'), malformedContent);

      const result = await handleTableInfoResource(schemaDir, 'default', 'invalid_table');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('Failed to parse table');
      }
    });

    it('should handle table with minimal information', async () => {
      const minimalTableContent = `# simple_table

Simple table

## Columns

| Name | Type | Default | Nullable | Children | Parents | Comment |
| ---- | ---- | ------- | -------- | -------- | ------- | ------- |
| id | int |  | false |  |  |  |
| name | varchar(50) |  | true |  |  |  |

Generated at: 2024-01-15T10:30:00Z by tbls
`;

      await fs.writeFile(join(schemaDir, 'simple_table.md'), minimalTableContent);

      const result = await handleTableInfoResource(schemaDir, 'default', 'simple_table');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const resource: TableInfoResource = result.value;
        expect(resource.schemaName).toBe('default');
        expect(resource.table.name).toBe('simple_table');
        expect(resource.table.columns).toHaveLength(2);
        expect(resource.table.indexes).toHaveLength(0);
        expect(resource.table.relations).toHaveLength(0);
      }
    });

    it('should handle file system permissions error', async () => {
      // Create a file without read permissions
      const restrictedFile = join(schemaDir, 'restricted_table.md');
      await fs.writeFile(restrictedFile, 'content');

      try {
        await fs.chmod(restrictedFile, 0o000);

        const result = await handleTableInfoResource(schemaDir, 'default', 'restricted_table');

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
          expect(result.error.message).toContain('Failed to parse table');
        }
      } finally {
        // Restore permissions for cleanup
        await fs.chmod(restrictedFile, 0o644);
      }
    });

    it('should handle table with complex relationships', async () => {
      const complexTableContent = `# order_items

Order line items table

## Columns

| Name | Type | Default | Nullable | Children | Parents | Comment |
| ---- | ---- | ------- | -------- | -------- | ------- | ------- |
| id | bigint |  | false |  |  | Primary key |
| order_id | bigint |  | false |  | orders.id | Order reference |
| product_id | bigint |  | false |  | products.id | Product reference |
| quantity | int | 1 | false |  |  | Item quantity |
| unit_price | decimal(10,2) |  | false |  |  | Price per unit |

## Indexes

| Name | Definition | Comment |
| ---- | ---------- | ------- |
| order_items_pkey | PRIMARY KEY (id) |  |
| order_items_order_id_idx | INDEX (order_id) | Order lookups |
| order_items_product_id_idx | INDEX (product_id) | Product lookups |
| order_items_unique | UNIQUE (order_id, product_id) | Prevent duplicates |

## Relations

| Column | Cardinality | Related Table | Related Column(s) | Constraint |
| ------ | ----------- | ------------- | ----------------- | ---------- |
| order_id | Zero or one | orders | id | order_items_order_id_fkey |
| product_id | Zero or one | products | id | order_items_product_id_fkey |

Generated at: 2024-01-15T10:30:00Z by tbls
`;

      await fs.writeFile(join(schemaDir, 'order_items.md'), complexTableContent);

      const result = await handleTableInfoResource(schemaDir, 'default', 'order_items');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const resource: TableInfoResource = result.value;
        expect(resource.table.relations).toHaveLength(2);
        expect(resource.table.indexes).toHaveLength(4);

        // Check that unique index is properly parsed
        const uniqueIndex = resource.table.indexes.find(i => i.name === 'order_items_unique');
        expect(uniqueIndex).toEqual({
          name: 'order_items_unique',
          columns: ['order_id', 'product_id'],
          isUnique: true,
          isPrimary: false,
          type: 'UNIQUE',
          comment: 'Prevent duplicates'
        });

        // Check decimal column parsing
        const priceColumn = resource.table.columns.find(c => c.name === 'unit_price');
        expect(priceColumn?.type).toBe('decimal(10,2)');
        expect(priceColumn?.precision).toBe(10);
        expect(priceColumn?.scale).toBe(2);
      }
    });
  });
});