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
async function discoverAllResources(schemaDir: string): Promise<{
  resources: Array<{
    uri: string;
    mimeType: string;
    name: string;
    description: string;
  }>;
}> {
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
          const tablesResult = await handleSchemaTablesResource(
            schemaDir,
            schema.name
          );
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
          console.warn(
            `Warning: Could not discover tables for schema ${schema.name}:`,
            tableError
          );
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
      const resourceUris = resources.map((r) => r.uri).sort();

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
      const usersTableResource = resources.find(
        (r) => r.uri === 'table://public/users'
      );
      expect(usersTableResource).toEqual({
        uri: 'table://public/users',
        mimeType: 'application/json',
        name: 'users table (public schema)',
        description:
          'Detailed information about the users table including columns, indexes, and relationships',
      });

      const eventsTableResource = resources.find(
        (r) => r.uri === 'table://analytics/events'
      );
      expect(eventsTableResource).toEqual({
        uri: 'table://analytics/events',
        mimeType: 'application/json',
        name: 'events table (analytics schema)',
        description:
          'Detailed information about the events table including columns, indexes, and relationships',
      });

      // Verify resource metadata for table index resources
      const usersIndexesResource = resources.find(
        (r) => r.uri === 'table://public/users/indexes'
      );
      expect(usersIndexesResource).toEqual({
        uri: 'table://public/users/indexes',
        mimeType: 'application/json',
        name: 'users table indexes (public schema)',
        description: 'Index information for the users table',
      });

      const eventsIndexesResource = resources.find(
        (r) => r.uri === 'table://analytics/events/indexes'
      );
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
      const resourceUris = resources.map((r) => r.uri).sort();

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
      const resourceUris = resources.map((r) => r.uri);

      expect(resourceUris).toEqual(['schema://list']);
    });

    it('should handle schemas with no tables gracefully', async () => {
      // Create schema directories with README files but no tables
      await setupEmptySchemaTestData(schemaDir);

      const result = await discoverAllResources(schemaDir);
      const resources = result.resources;
      const resourceUris = resources.map((r) => r.uri).sort();

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

  const publicSchema = {
    name: 'public',
    desc: 'Public schema with user and product management',
    tables: [
      {
        name: 'users',
        type: 'TABLE',
        comment: 'User accounts',
        columns: [
          {
            name: 'id',
            type: 'bigint',
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
            extra_def: '',
            comment: 'User email',
          },
          {
            name: 'name',
            type: 'varchar(100)',
            nullable: false,
            default: null,
            extra_def: '',
            comment: 'User name',
          },
          {
            name: 'created_at',
            type: 'timestamp',
            nullable: false,
            default: 'CURRENT_TIMESTAMP',
            extra_def: '',
            comment: 'Creation time',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            nullable: true,
            default: 'CURRENT_TIMESTAMP',
            extra_def: 'on update CURRENT_TIMESTAMP',
            comment: 'Update time',
          },
        ],
        indexes: [
          {
            name: 'PRIMARY',
            def: 'PRIMARY KEY (id)',
            table: 'users',
            columns: ['id'],
            comment: '',
          },
          {
            name: 'users_email_unique',
            def: 'UNIQUE (email)',
            table: 'users',
            columns: ['email'],
            comment: '',
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
            type: 'bigint',
            nullable: false,
            default: null,
            extra_def: 'auto_increment',
            comment: 'Primary key',
          },
          {
            name: 'name',
            type: 'varchar(200)',
            nullable: false,
            default: null,
            extra_def: '',
            comment: 'Product name',
          },
          {
            name: 'price',
            type: 'decimal(10,2)',
            nullable: false,
            default: null,
            extra_def: '',
            comment: 'Product price',
          },
          {
            name: 'description',
            type: 'text',
            nullable: true,
            default: null,
            extra_def: '',
            comment: 'Product description',
          },
          {
            name: 'category_id',
            type: 'bigint',
            nullable: true,
            default: null,
            extra_def: '',
            comment: 'Category reference',
          },
          {
            name: 'created_at',
            type: 'timestamp',
            nullable: false,
            default: 'CURRENT_TIMESTAMP',
            extra_def: '',
            comment: 'Creation time',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            nullable: true,
            default: 'CURRENT_TIMESTAMP',
            extra_def: 'on update CURRENT_TIMESTAMP',
            comment: 'Update time',
          },
          {
            name: 'is_active',
            type: 'boolean',
            nullable: false,
            default: 'true',
            extra_def: '',
            comment: 'Active status',
          },
        ],
        indexes: [
          {
            name: 'PRIMARY',
            def: 'PRIMARY KEY (id)',
            table: 'products',
            columns: ['id'],
            comment: '',
          },
          {
            name: 'products_name_idx',
            def: 'INDEX (name)',
            table: 'products',
            columns: ['name'],
            comment: '',
          },
          {
            name: 'products_category_idx',
            def: 'INDEX (category_id)',
            table: 'products',
            columns: ['category_id'],
            comment: '',
          },
        ],
      },
    ],
  };

  await fs.writeFile(
    join(publicSchemaDir, 'schema.json'),
    JSON.stringify(publicSchema, null, 2)
  );

  // Create analytics schema
  const analyticsSchemaDir = join(schemaDir, 'analytics');
  await fs.mkdir(analyticsSchemaDir);

  const analyticsSchema = {
    name: 'analytics',
    desc: 'Analytics schema with event tracking and sessions',
    tables: [
      {
        name: 'events',
        type: 'TABLE',
        comment: 'User events tracking',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            nullable: false,
            default: null,
            extra_def: '',
            comment: 'Event ID',
          },
          {
            name: 'user_id',
            type: 'bigint',
            nullable: true,
            default: null,
            extra_def: '',
            comment: 'User reference',
            parent_relations: [
              {
                table: 'public.users',
                columns: ['id'],
              },
            ],
          },
          {
            name: 'event_type',
            type: 'varchar(50)',
            nullable: false,
            default: null,
            extra_def: '',
            comment: 'Event type',
          },
          {
            name: 'event_data',
            type: 'jsonb',
            nullable: true,
            default: null,
            extra_def: '',
            comment: 'Event payload',
          },
          {
            name: 'timestamp',
            type: 'timestamp',
            nullable: false,
            default: 'CURRENT_TIMESTAMP',
            extra_def: '',
            comment: 'Event timestamp',
          },
          {
            name: 'session_id',
            type: 'uuid',
            nullable: true,
            default: null,
            extra_def: '',
            comment: 'Session reference',
          },
        ],
        indexes: [
          {
            name: 'events_pkey',
            def: 'PRIMARY KEY (id)',
            table: 'events',
            columns: ['id'],
            comment: '',
          },
          {
            name: 'events_timestamp_idx',
            def: 'INDEX (timestamp)',
            table: 'events',
            columns: ['timestamp'],
            comment: '',
          },
          {
            name: 'events_user_id_idx',
            def: 'INDEX (user_id)',
            table: 'events',
            columns: ['user_id'],
            comment: '',
          },
        ],
      },
      {
        name: 'sessions',
        type: 'TABLE',
        comment: 'User sessions',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            nullable: false,
            default: null,
            extra_def: '',
            comment: 'Session ID',
          },
          {
            name: 'user_id',
            type: 'bigint',
            nullable: true,
            default: null,
            extra_def: '',
            comment: 'User reference',
            parent_relations: [
              {
                table: 'public.users',
                columns: ['id'],
              },
            ],
          },
          {
            name: 'started_at',
            type: 'timestamp',
            nullable: false,
            default: 'CURRENT_TIMESTAMP',
            extra_def: '',
            comment: 'Session start',
          },
          {
            name: 'ended_at',
            type: 'timestamp',
            nullable: true,
            default: null,
            extra_def: '',
            comment: 'Session end',
          },
        ],
        indexes: [
          {
            name: 'sessions_pkey',
            def: 'PRIMARY KEY (id)',
            table: 'sessions',
            columns: ['id'],
            comment: '',
          },
          {
            name: 'sessions_user_id_idx',
            def: 'INDEX (user_id)',
            table: 'sessions',
            columns: ['user_id'],
            comment: '',
          },
        ],
      },
    ],
  };

  await fs.writeFile(
    join(analyticsSchemaDir, 'schema.json'),
    JSON.stringify(analyticsSchema, null, 2)
  );
}

/**
 * Set up single schema test data
 */
async function setupSingleSchemaTestData(schemaDir: string): Promise<void> {
  const schema = {
    name: 'default',
    desc: 'Default database schema with blog functionality',
    tables: [
      {
        name: 'users',
        type: 'TABLE',
        comment: 'User accounts',
        columns: [
          {
            name: 'id',
            type: 'int',
            nullable: false,
            default: null,
            extra_def: 'auto_increment',
            comment: '',
          },
          {
            name: 'email',
            type: 'varchar(255)',
            nullable: false,
            default: null,
            extra_def: '',
            comment: '',
          },
          {
            name: 'name',
            type: 'varchar(100)',
            nullable: false,
            default: null,
            extra_def: '',
            comment: '',
          },
        ],
        indexes: [
          {
            name: 'PRIMARY',
            def: 'PRIMARY KEY (id)',
            table: 'users',
            columns: ['id'],
            comment: '',
          },
        ],
      },
      {
        name: 'posts',
        type: 'TABLE',
        comment: 'Blog posts',
        columns: [
          {
            name: 'id',
            type: 'int',
            nullable: false,
            default: null,
            extra_def: 'auto_increment',
            comment: '',
          },
          {
            name: 'user_id',
            type: 'int',
            nullable: false,
            default: null,
            extra_def: '',
            comment: '',
            parent_relations: [
              {
                table: 'users',
                columns: ['id'],
              },
            ],
          },
          {
            name: 'title',
            type: 'varchar(200)',
            nullable: false,
            default: null,
            extra_def: '',
            comment: '',
          },
          {
            name: 'content',
            type: 'text',
            nullable: true,
            default: null,
            extra_def: '',
            comment: '',
          },
        ],
        indexes: [
          {
            name: 'PRIMARY',
            def: 'PRIMARY KEY (id)',
            table: 'posts',
            columns: ['id'],
            comment: '',
          },
        ],
      },
      {
        name: 'comments',
        type: 'TABLE',
        comment: 'Post comments',
        columns: [
          {
            name: 'id',
            type: 'int',
            nullable: false,
            default: null,
            extra_def: 'auto_increment',
            comment: '',
          },
          {
            name: 'post_id',
            type: 'int',
            nullable: false,
            default: null,
            extra_def: '',
            comment: '',
            parent_relations: [
              {
                table: 'posts',
                columns: ['id'],
              },
            ],
          },
          {
            name: 'content',
            type: 'text',
            nullable: false,
            default: null,
            extra_def: '',
            comment: '',
          },
        ],
        indexes: [
          {
            name: 'PRIMARY',
            def: 'PRIMARY KEY (id)',
            table: 'comments',
            columns: ['id'],
            comment: '',
          },
        ],
      },
    ],
  };

  await fs.writeFile(
    join(schemaDir, 'schema.json'),
    JSON.stringify(schema, null, 2)
  );
}

/**
 * Set up empty schemas test data
 */
async function setupEmptySchemaTestData(schemaDir: string): Promise<void> {
  const emptySchema1Dir = join(schemaDir, 'empty1');
  const emptySchema2Dir = join(schemaDir, 'empty2');
  await fs.mkdir(emptySchema1Dir);
  await fs.mkdir(emptySchema2Dir);

  const emptySchema1 = {
    name: 'empty1',
    desc: 'Empty schema with no tables defined',
    tables: [],
  };

  const emptySchema2 = {
    name: 'empty2',
    desc: 'Empty schema with no tables defined',
    tables: [],
  };

  await fs.writeFile(
    join(emptySchema1Dir, 'schema.json'),
    JSON.stringify(emptySchema1, null, 2)
  );
  await fs.writeFile(
    join(emptySchema2Dir, 'schema.json'),
    JSON.stringify(emptySchema2, null, 2)
  );
}
