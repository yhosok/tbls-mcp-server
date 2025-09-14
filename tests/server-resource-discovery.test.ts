import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { handleSchemaListResource } from '../src/resources/schema-resource';
import { handleSchemaTablesResource } from '../src/resources/table-resource';

/**
 * Enhanced Resource Discovery Function (TDD - This function should be implemented)
 * This function should discover all individual table and table index resources
 * for comprehensive resource discovery in the tbls-mcp-server
 */
async function discoverAllResources(schemaDir: string): Promise<{ resources: Array<{ uri: string; mimeType: string; name: string; description: string }> }> {
  const resources = [
    {
      uri: 'schema://list',
      mimeType: 'application/json',
      name: 'Database Schemas',
      description: 'List of all available database schemas with metadata',
    },
  ];

  try {
    const schemaListResult = await handleSchemaListResource(schemaDir);
    if (schemaListResult.isOk()) {
      const schemas = schemaListResult.value.schemas;

      for (const schema of schemas) {
        // Add tables resource for each schema
        resources.push({
          uri: `schema://${schema.name}/tables`,
          mimeType: 'application/json',
          name: `${schema.name} Schema Tables`,
          description: `List of tables in the ${schema.name} schema`,
        });

        // GREEN PHASE IMPLEMENTATION: Discover individual table and index resources
        try {
          const tablesResult = await handleSchemaTablesResource(schemaDir, schema.name);
          if (tablesResult.isOk()) {
            const tables = tablesResult.value.tables;
            for (const table of tables) {
              resources.push({
                uri: `table://${schema.name}/${table.name}`,
                mimeType: 'application/json',
                name: `${table.name} table (${schema.name} schema)`,
                description: `Detailed information about the ${table.name} table including columns, indexes, and relationships`,
              });
              resources.push({
                uri: `table://${schema.name}/${table.name}/indexes`,
                mimeType: 'application/json',
                name: `${table.name} table indexes (${schema.name} schema)`,
                description: `Index information for the ${table.name} table`,
              });
            }
          }
        } catch (tableError) {
          // Log warning but continue processing other schemas
          console.warn(`Warning: Could not discover tables for schema ${schema.name}:`, tableError);
        }
      }
    }
  } catch (error) {
    console.warn('Warning: Could not discover all resources:', error);
  }

  return { resources };
}

describe('Enhanced Resource Discovery (TDD - RED Phase)', () => {
  let tempDir: string;
  let schemaDir: string;

  beforeEach(async () => {
    // Create a temporary directory for tests
    tempDir = await fs.mkdtemp(join(tmpdir(), 'tbls-tdd-test-'));
    schemaDir = join(tempDir, 'schemas');
    await fs.mkdir(schemaDir);
  });

  afterEach(async () => {
    // Clean up temporary directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('Enhanced Resource Discovery', () => {
    it('should discover all individual table and table index resources for multi-schema setup', async () => {
      // Set up multi-schema test data with 2 schemas and 2 tables per schema
      await setupMultiSchemaTestData(schemaDir);

      // Get the resources from the enhanced discovery function
      const result = await discoverAllResources(schemaDir);
      const resources = result.resources;

      // Verify that all expected resource types are discovered
      const resourceUris = resources.map(r => r.uri).sort();

      const expectedResources = [
        // Base schema list resource
        'schema://list',

        // Schema table list resources
        'schema://analytics/tables',
        'schema://public/tables',

        // Individual table resources (these should fail with current implementation)
        'table://analytics/events',
        'table://analytics/sessions',
        'table://public/products',
        'table://public/users',

        // Individual table index resources (these should fail with current implementation)
        'table://analytics/events/indexes',
        'table://analytics/sessions/indexes',
        'table://public/products/indexes',
        'table://public/users/indexes',
      ].sort();

      // This assertion should FAIL in the RED phase because current implementation
      // doesn't include individual table resources in discovery
      expect(resourceUris).toEqual(expectedResources);

      // Verify resource metadata for individual table resources
      const usersTableResource = resources.find(r => r.uri === 'table://public/users');
      expect(usersTableResource).toEqual({
        uri: 'table://public/users',
        mimeType: 'application/json',
        name: 'users table (public schema)',
        description: 'Detailed information about the users table including columns, indexes, and relationships',
      });

      const eventsTableResource = resources.find(r => r.uri === 'table://analytics/events');
      expect(eventsTableResource).toEqual({
        uri: 'table://analytics/events',
        mimeType: 'application/json',
        name: 'events table (analytics schema)',
        description: 'Detailed information about the events table including columns, indexes, and relationships',
      });

      // Verify resource metadata for table index resources
      const usersIndexesResource = resources.find(r => r.uri === 'table://public/users/indexes');
      expect(usersIndexesResource).toEqual({
        uri: 'table://public/users/indexes',
        mimeType: 'application/json',
        name: 'users table indexes (public schema)',
        description: 'Index information for the users table',
      });

      const eventsIndexesResource = resources.find(r => r.uri === 'table://analytics/events/indexes');
      expect(eventsIndexesResource).toEqual({
        uri: 'table://analytics/events/indexes',
        mimeType: 'application/json',
        name: 'events table indexes (analytics schema)',
        description: 'Index information for the events table',
      });
    });

    it('should discover individual table resources for single schema setup', async () => {
      // Set up single schema test data
      await setupSingleSchemaTestData(schemaDir);

      const result = await discoverAllResources(schemaDir);
      const resources = result.resources;
      const resourceUris = resources.map(r => r.uri).sort();

      const expectedResources = [
        'schema://list',
        'schema://default/tables',
        'table://default/comments',
        'table://default/comments/indexes',
        'table://default/posts',
        'table://default/posts/indexes',
        'table://default/users',
        'table://default/users/indexes',
      ].sort();

      // This should FAIL in the RED phase
      expect(resourceUris).toEqual(expectedResources);
    });

    it('should handle empty schema directory gracefully', async () => {
      // Empty schema directory - should only return base schema list resource
      const result = await discoverAllResources(schemaDir);
      const resources = result.resources;
      const resourceUris = resources.map(r => r.uri);

      expect(resourceUris).toEqual(['schema://list']);
    });

    it('should handle schemas with no tables gracefully', async () => {
      // Create schema directories with README files but no tables
      await setupEmptySchemaTestData(schemaDir);

      const result = await discoverAllResources(schemaDir);
      const resources = result.resources;
      const resourceUris = resources.map(r => r.uri).sort();

      const expectedResources = [
        'schema://list',
        'schema://empty1/tables',
        'schema://empty2/tables',
      ].sort();

      expect(resourceUris).toEqual(expectedResources);
    });
  });
});

// Removed getDiscoveredResources helper function as we're now testing the discoverAllResources function directly

/**
 * Set up multi-schema test data with 2 schemas and 2 tables per schema
 */
async function setupMultiSchemaTestData(schemaDir: string): Promise<void> {
  // Create public schema
  const publicSchemaDir = join(schemaDir, 'public');
  await fs.mkdir(publicSchemaDir);

  const publicReadme = `# Public Schema

## Tables

| Name | Columns | Comment |
| ---- | ------- | ------- |
| users | 5 | User accounts |
| products | 8 | Product catalog |

Generated at: 2024-01-15T10:30:00Z
`;

  await fs.writeFile(join(publicSchemaDir, 'README.md'), publicReadme);

  // Create detailed table files for public schema
  const usersTableContent = `# users

User accounts table

## Columns

| Name | Type | Default | Nullable | Children | Parents | Comment |
| ---- | ---- | ------- | -------- | -------- | ------- | ------- |
| id | bigint |  | false |  |  | Primary key |
| email | varchar(255) |  | false |  |  | User email |
| name | varchar(100) |  | false |  |  | User name |
| created_at | timestamp | CURRENT_TIMESTAMP | false |  |  | Creation time |
| updated_at | timestamp | CURRENT_TIMESTAMP | true |  |  | Update time |

## Indexes

| Name | Definition | Comment |
| ---- | ---------- | ------- |
| PRIMARY | PRIMARY KEY (id) |  |
| users_email_unique | UNIQUE (email) |  |

Generated at: 2024-01-15T10:30:00Z
`;

  const productsTableContent = `# products

Product catalog table

## Columns

| Name | Type | Default | Nullable | Children | Parents | Comment |
| ---- | ---- | ------- | -------- | -------- | ------- | ------- |
| id | bigint |  | false |  |  | Primary key |
| name | varchar(200) |  | false |  |  | Product name |
| price | decimal(10,2) |  | false |  |  | Product price |
| description | text |  | true |  |  | Product description |
| category_id | bigint |  | true |  |  | Category reference |
| created_at | timestamp | CURRENT_TIMESTAMP | false |  |  | Creation time |
| updated_at | timestamp | CURRENT_TIMESTAMP | true |  |  | Update time |
| is_active | boolean | true | false |  |  | Active status |

## Indexes

| Name | Definition | Comment |
| ---- | ---------- | ------- |
| PRIMARY | PRIMARY KEY (id) |  |
| products_name_idx | INDEX (name) |  |
| products_category_idx | INDEX (category_id) |  |

Generated at: 2024-01-15T10:30:00Z
`;

  await fs.writeFile(join(publicSchemaDir, 'users.md'), usersTableContent);
  await fs.writeFile(join(publicSchemaDir, 'products.md'), productsTableContent);

  // Create analytics schema
  const analyticsSchemaDir = join(schemaDir, 'analytics');
  await fs.mkdir(analyticsSchemaDir);

  const analyticsReadme = `# Analytics Schema

## Tables

| Name | Columns | Comment |
| ---- | ------- | ------- |
| events | 6 | User events tracking |
| sessions | 4 | User sessions |

Generated at: 2024-01-15T10:30:00Z
`;

  await fs.writeFile(join(analyticsSchemaDir, 'README.md'), analyticsReadme);

  // Create detailed table files for analytics schema
  const eventsTableContent = `# events

User events tracking table

## Columns

| Name | Type | Default | Nullable | Children | Parents | Comment |
| ---- | ---- | ------- | -------- | -------- | ------- | ------- |
| id | uuid |  | false |  |  | Event ID |
| user_id | bigint |  | true |  | public.users.id | User reference |
| event_type | varchar(50) |  | false |  |  | Event type |
| event_data | jsonb |  | true |  |  | Event payload |
| timestamp | timestamp | CURRENT_TIMESTAMP | false |  |  | Event timestamp |
| session_id | uuid |  | true |  |  | Session reference |

## Indexes

| Name | Definition | Comment |
| ---- | ---------- | ------- |
| events_pkey | PRIMARY KEY (id) |  |
| events_timestamp_idx | INDEX (timestamp) |  |
| events_user_id_idx | INDEX (user_id) |  |

Generated at: 2024-01-15T10:30:00Z
`;

  const sessionsTableContent = `# sessions

User sessions table

## Columns

| Name | Type | Default | Nullable | Children | Parents | Comment |
| ---- | ---- | ------- | -------- | -------- | ------- | ------- |
| id | uuid |  | false |  |  | Session ID |
| user_id | bigint |  | true |  | public.users.id | User reference |
| started_at | timestamp | CURRENT_TIMESTAMP | false |  |  | Session start |
| ended_at | timestamp |  | true |  |  | Session end |

## Indexes

| Name | Definition | Comment |
| ---- | ---------- | ------- |
| sessions_pkey | PRIMARY KEY (id) |  |
| sessions_user_id_idx | INDEX (user_id) |  |

Generated at: 2024-01-15T10:30:00Z
`;

  await fs.writeFile(join(analyticsSchemaDir, 'events.md'), eventsTableContent);
  await fs.writeFile(join(analyticsSchemaDir, 'sessions.md'), sessionsTableContent);
}

/**
 * Set up single schema test data
 */
async function setupSingleSchemaTestData(schemaDir: string): Promise<void> {
  const readmeContent = `# Database Schema

## Tables

| Name | Columns | Comment |
| ---- | ------- | ------- |
| users | 3 | User accounts |
| posts | 4 | Blog posts |
| comments | 3 | Post comments |

Generated at: 2024-01-15T10:30:00Z
`;

  await fs.writeFile(join(schemaDir, 'README.md'), readmeContent);

  // Create table detail files
  const usersContent = `# users

User accounts

## Columns

| Name | Type | Default | Nullable | Children | Parents | Comment |
| ---- | ---- | ------- | -------- | -------- | ------- | ------- |
| id | int |  | false |  |  |  |
| email | varchar(255) |  | false |  |  |  |
| name | varchar(100) |  | false |  |  |  |

## Indexes

| Name | Definition | Comment |
| ---- | ---------- | ------- |
| PRIMARY | PRIMARY KEY (id) |  |

Generated at: 2024-01-15T10:30:00Z
`;

  const postsContent = `# posts

Blog posts

## Columns

| Name | Type | Default | Nullable | Children | Parents | Comment |
| ---- | ---- | ------- | -------- | -------- | ------- | ------- |
| id | int |  | false |  |  |  |
| user_id | int |  | false |  | users.id |  |
| title | varchar(200) |  | false |  |  |  |
| content | text |  | true |  |  |  |

## Indexes

| Name | Definition | Comment |
| ---- | ---------- | ------- |
| PRIMARY | PRIMARY KEY (id) |  |

Generated at: 2024-01-15T10:30:00Z
`;

  const commentsContent = `# comments

Post comments

## Columns

| Name | Type | Default | Nullable | Children | Parents | Comment |
| ---- | ---- | ------- | -------- | -------- | ------- | ------- |
| id | int |  | false |  |  |  |
| post_id | int |  | false |  | posts.id |  |
| content | text |  | false |  |  |  |

## Indexes

| Name | Definition | Comment |
| ---- | ---------- | ------- |
| PRIMARY | PRIMARY KEY (id) |  |

Generated at: 2024-01-15T10:30:00Z
`;

  await fs.writeFile(join(schemaDir, 'users.md'), usersContent);
  await fs.writeFile(join(schemaDir, 'posts.md'), postsContent);
  await fs.writeFile(join(schemaDir, 'comments.md'), commentsContent);
}

/**
 * Set up empty schemas test data
 */
async function setupEmptySchemaTestData(schemaDir: string): Promise<void> {
  const emptySchema1Dir = join(schemaDir, 'empty1');
  const emptySchema2Dir = join(schemaDir, 'empty2');
  await fs.mkdir(emptySchema1Dir);
  await fs.mkdir(emptySchema2Dir);

  const emptyReadme = `# Empty Schema

## Tables

(No tables defined)

Generated at: 2024-01-15T10:30:00Z
`;

  await fs.writeFile(join(emptySchema1Dir, 'README.md'), emptyReadme);
  await fs.writeFile(join(emptySchema2Dir, 'README.md'), emptyReadme);
}