import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { handleTableIndexesResource } from '../../src/resources/index-resource';
import type { TableIndexesResource } from '../../src/schemas/database';

describe('Index Resource Handler', () => {
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

  describe('handleTableIndexesResource', () => {
    it('should return index information for table in single schema setup', async () => {
      const usersTableContent = `# users

User accounts table

## Columns

| Name | Type | Default | Nullable | Children | Parents | Comment |
| ---- | ---- | ------- | -------- | -------- | ------- | ------- |
| id | bigint |  | false |  |  | Primary key |
| email | varchar(255) |  | false |  |  | User email |
| username | varchar(100) |  | false |  |  | Username |
| created_at | timestamp | CURRENT_TIMESTAMP | false |  |  | Created timestamp |

## Indexes

| Name | Definition | Comment |
| ---- | ---------- | ------- |
| PRIMARY | PRIMARY KEY (id) | Primary key index |
| users_email_unique | UNIQUE (email) | Unique email constraint |
| users_username_unique | UNIQUE (username) | Unique username constraint |
| users_created_at_idx | INDEX (created_at) | Index for date-based queries |
| users_email_username_idx | INDEX (email, username) | Composite index for searches |

Generated at: 2024-01-15T10:30:00Z by tbls
`;

      await fs.writeFile(join(schemaDir, 'users.md'), usersTableContent);

      const result = await handleTableIndexesResource(schemaDir, 'default', 'users');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const resource: TableIndexesResource = result.value;
        expect(resource.schemaName).toBe('default');
        expect(resource.tableName).toBe('users');
        expect(resource.indexes).toHaveLength(5);

        // Check primary key index
        const primaryIndex = resource.indexes.find(i => i.name === 'PRIMARY');
        expect(primaryIndex).toEqual({
          name: 'PRIMARY',
          columns: ['id'],
          isUnique: true,
          isPrimary: true,
          type: 'PRIMARY KEY',
          comment: 'Primary key index'
        });

        // Check unique index
        const emailIndex = resource.indexes.find(i => i.name === 'users_email_unique');
        expect(emailIndex).toEqual({
          name: 'users_email_unique',
          columns: ['email'],
          isUnique: true,
          isPrimary: false,
          type: 'UNIQUE',
          comment: 'Unique email constraint'
        });

        // Check regular index
        const dateIndex = resource.indexes.find(i => i.name === 'users_created_at_idx');
        expect(dateIndex).toEqual({
          name: 'users_created_at_idx',
          columns: ['created_at'],
          isUnique: false,
          isPrimary: false,
          type: 'INDEX',
          comment: 'Index for date-based queries'
        });

        // Check composite index
        const compositeIndex = resource.indexes.find(i => i.name === 'users_email_username_idx');
        expect(compositeIndex).toEqual({
          name: 'users_email_username_idx',
          columns: ['email', 'username'],
          isUnique: false,
          isPrimary: false,
          type: 'INDEX',
          comment: 'Composite index for searches'
        });
      }
    });

    it('should return index information for table in multi-schema setup', async () => {
      const analyticsDir = join(schemaDir, 'analytics');
      await fs.mkdir(analyticsDir);

      const eventsTableContent = `# events

Analytics events table

## Columns

| Name | Type | Default | Nullable | Children | Parents | Comment |
| ---- | ---- | ------- | -------- | -------- | ------- | ------- |
| id | uuid |  | false |  |  | Event ID |
| user_id | bigint |  | true |  |  | User reference |
| event_type | varchar(100) |  | false |  |  | Event type |
| timestamp | timestamp |  | false |  |  | Event timestamp |
| session_id | varchar(255) |  | true |  |  | Session ID |

## Indexes

| Name | Definition | Comment |
| ---- | ---------- | ------- |
| events_pkey | PRIMARY KEY (id) | Primary key |
| events_user_id_idx | INDEX (user_id) | User lookups |
| events_timestamp_idx | INDEX (timestamp DESC) | Time-based queries |
| events_session_event_idx | INDEX (session_id, event_type) | Session event lookups |
| events_type_timestamp_idx | INDEX (event_type, timestamp) | Event type with time |

Generated at: 2024-01-15T10:30:00Z by tbls
`;

      await fs.writeFile(join(analyticsDir, 'events.md'), eventsTableContent);

      const result = await handleTableIndexesResource(schemaDir, 'analytics', 'events');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const resource: TableIndexesResource = result.value;
        expect(resource.schemaName).toBe('analytics');
        expect(resource.tableName).toBe('events');
        expect(resource.indexes).toHaveLength(5);

        // Check index with DESC order
        const timestampIndex = resource.indexes.find(i => i.name === 'events_timestamp_idx');
        expect(timestampIndex).toEqual({
          name: 'events_timestamp_idx',
          columns: ['timestamp'],
          isUnique: false,
          isPrimary: false,
          type: 'INDEX',
          comment: 'Time-based queries'
        });

        // Check composite indexes
        const sessionEventIndex = resource.indexes.find(i => i.name === 'events_session_event_idx');
        expect(sessionEventIndex).toEqual({
          name: 'events_session_event_idx',
          columns: ['session_id', 'event_type'],
          isUnique: false,
          isPrimary: false,
          type: 'INDEX',
          comment: 'Session event lookups'
        });
      }
    });

    it('should return empty indexes list for table with no indexes', async () => {
      const simpleTableContent = `# simple_table

Simple table with no indexes

## Columns

| Name | Type | Default | Nullable | Children | Parents | Comment |
| ---- | ---- | ------- | -------- | -------- | ------- | ------- |
| id | int |  | false |  |  | ID |
| name | varchar(100) |  | true |  |  | Name |

Generated at: 2024-01-15T10:30:00Z by tbls
`;

      await fs.writeFile(join(schemaDir, 'simple_table.md'), simpleTableContent);

      const result = await handleTableIndexesResource(schemaDir, 'default', 'simple_table');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const resource: TableIndexesResource = result.value;
        expect(resource.schemaName).toBe('default');
        expect(resource.tableName).toBe('simple_table');
        expect(resource.indexes).toHaveLength(0);
      }
    });

    it('should handle table file that does not exist', async () => {
      const result = await handleTableIndexesResource(schemaDir, 'default', 'nonexistent_table');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('No schema file found');
      }
    });

    it('should handle schema that does not exist', async () => {
      const result = await handleTableIndexesResource(schemaDir, 'nonexistent_schema', 'some_table');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('No schema file found');
      }
    });

    it('should handle malformed indexes section gracefully', async () => {
      const malformedContent = `# table_with_bad_indexes

Table with malformed indexes section

## Columns

| Name | Type | Default | Nullable | Children | Parents | Comment |
| ---- | ---- | ------- | -------- | -------- | ------- | ------- |
| id | int |  | false |  |  | ID |

## Indexes

This is not a proper indexes table format.

| Name | Missing definition |
| ---- |
| incomplete_index |

Generated at: 2024-01-15T10:30:00Z by tbls
`;

      await fs.writeFile(join(schemaDir, 'table_with_bad_indexes.md'), malformedContent);

      const result = await handleTableIndexesResource(schemaDir, 'default', 'table_with_bad_indexes');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const resource: TableIndexesResource = result.value;
        expect(resource.schemaName).toBe('default');
        expect(resource.tableName).toBe('table_with_bad_indexes');
        expect(resource.indexes).toHaveLength(0);
      }
    });

    it('should handle complex index definitions with various types', async () => {
      const complexIndexesContent = `# products

Products table with complex indexes

## Columns

| Name | Type | Default | Nullable | Children | Parents | Comment |
| ---- | ---- | ------- | -------- | -------- | ------- | ------- |
| id | bigint |  | false |  |  | Product ID |
| sku | varchar(100) |  | false |  |  | Stock keeping unit |
| name | varchar(255) |  | false |  |  | Product name |
| category_id | int |  | true |  | categories.id | Category |
| price | decimal(10,2) |  | false |  |  | Product price |
| created_at | timestamp | CURRENT_TIMESTAMP | false |  |  | Created date |
| updated_at | timestamp |  | true |  |  | Updated date |

## Indexes

| Name | Definition | Comment |
| ---- | ---------- | ------- |
| products_pkey | PRIMARY KEY (id) | Primary key |
| products_sku_unique | UNIQUE (sku) | SKU must be unique |
| products_category_idx | INDEX (category_id) | Category lookups |
| products_price_idx | INDEX (price DESC) | Price sorting |
| products_name_gin | GIN (to_tsvector('english', name)) | Full text search |
| products_category_price_idx | INDEX (category_id, price DESC) | Category price sorting |
| products_created_btree | BTREE (created_at) | Time range queries |
| products_partial_idx | INDEX (price) WHERE price > 0 | Partial index for valid prices |

Generated at: 2024-01-15T10:30:00Z by tbls
`;

      await fs.writeFile(join(schemaDir, 'products.md'), complexIndexesContent);

      const result = await handleTableIndexesResource(schemaDir, 'default', 'products');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const resource: TableIndexesResource = result.value;
        expect(resource.schemaName).toBe('default');
        expect(resource.tableName).toBe('products');
        expect(resource.indexes).toHaveLength(8);

        // Check GIN index
        const ginIndex = resource.indexes.find(i => i.name === 'products_name_gin');
        expect(ginIndex?.type).toBe('GIN');
        expect(ginIndex?.comment).toBe('Full text search');

        // Check BTREE index
        const btreeIndex = resource.indexes.find(i => i.name === 'products_created_btree');
        expect(btreeIndex?.type).toBe('BTREE');
        expect(btreeIndex?.columns).toEqual(['created_at']);

        // Check partial index
        const partialIndex = resource.indexes.find(i => i.name === 'products_partial_idx');
        expect(partialIndex?.type).toBe('INDEX');
        expect(partialIndex?.comment).toBe('Partial index for valid prices');
      }
    });

    it('should handle file system permissions error', async () => {
      // Create a file without read permissions
      const restrictedFile = join(schemaDir, 'restricted_table.md');
      await fs.writeFile(restrictedFile, 'content');

      try {
        await fs.chmod(restrictedFile, 0o000);

        const result = await handleTableIndexesResource(schemaDir, 'default', 'restricted_table');

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
          expect(result.error.message).toContain('Failed to parse table');
        }
      } finally {
        // Restore permissions for cleanup
        await fs.chmod(restrictedFile, 0o644);
      }
    });

    it('should handle indexes with no comments', async () => {
      const noCommentsContent = `# table_no_comments

Table with indexes but no comments

## Columns

| Name | Type | Default | Nullable | Children | Parents | Comment |
| ---- | ---- | ------- | -------- | -------- | ------- | ------- |
| id | int |  | false |  |  |  |
| code | varchar(50) |  | false |  |  |  |

## Indexes

| Name | Definition | Comment |
| ---- | ---------- | ------- |
| table_no_comments_pkey | PRIMARY KEY (id) |  |
| table_no_comments_code_idx | INDEX (code) |  |
| table_no_comments_code_unique | UNIQUE (code) |  |

Generated at: 2024-01-15T10:30:00Z by tbls
`;

      await fs.writeFile(join(schemaDir, 'table_no_comments.md'), noCommentsContent);

      const result = await handleTableIndexesResource(schemaDir, 'default', 'table_no_comments');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const resource: TableIndexesResource = result.value;
        expect(resource.indexes).toHaveLength(3);

        resource.indexes.forEach(index => {
          expect(index.comment).toBe(null);
        });
      }
    });

    it('should handle very large number of indexes efficiently', async () => {
      // Generate table with many indexes
      let indexesSection = `## Indexes

| Name | Definition | Comment |
| ---- | ---------- | ------- |
| test_table_pkey | PRIMARY KEY (id) | Primary key |
`;

      for (let i = 1; i <= 100; i++) {
        indexesSection += `| test_table_idx_${i} | INDEX (col_${i}) | Index ${i} |\n`;
      }

      const largeIndexesContent = `# test_table

Test table with many indexes

## Columns

| Name | Type | Default | Nullable | Children | Parents | Comment |
| ---- | ---- | ------- | -------- | -------- | ------- | ------- |
| id | bigint |  | false |  |  | ID |

${indexesSection}

Generated at: 2024-01-15T10:30:00Z by tbls
`;

      await fs.writeFile(join(schemaDir, 'test_table.md'), largeIndexesContent);

      const startTime = Date.now();
      const result = await handleTableIndexesResource(schemaDir, 'default', 'test_table');
      const endTime = Date.now();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const resource: TableIndexesResource = result.value;
        expect(resource.indexes).toHaveLength(101); // Primary + 100 regular indexes
        expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
      }
    });

    it('should handle table with only primary key index', async () => {
      const primaryOnlyContent = `# simple_pk_table

Table with only primary key

## Columns

| Name | Type | Default | Nullable | Children | Parents | Comment |
| ---- | ---- | ------- | -------- | -------- | ------- | ------- |
| id | serial |  | false |  |  | Auto-incrementing ID |
| data | text |  | true |  |  | Some data |

## Indexes

| Name | Definition | Comment |
| ---- | ---------- | ------- |
| simple_pk_table_pkey | PRIMARY KEY (id) | Auto-generated primary key |

Generated at: 2024-01-15T10:30:00Z by tbls
`;

      await fs.writeFile(join(schemaDir, 'simple_pk_table.md'), primaryOnlyContent);

      const result = await handleTableIndexesResource(schemaDir, 'default', 'simple_pk_table');

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