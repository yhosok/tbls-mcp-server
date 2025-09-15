import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { handleSchemaListResource } from '../../src/resources/schema-resource';
import type { SchemaListResource } from '../../src/schemas/database';

describe('Schema Resource Handler', () => {
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

  describe('handleSchemaListResource', () => {
    it('should return schema list for single schema setup (schema.json exists)', async () => {
      // Create a single schema.json file
      const schema = {
        name: 'default',
        desc: 'Default database schema',
        tables: [
          {
            name: 'users',
            type: 'TABLE',
            comment: 'User accounts table',
            columns: [
              {
                name: 'id',
                type: 'int(11)',
                nullable: false,
                extra_def: 'auto_increment primary key',
                comment: 'User ID'
              }
            ]
          },
          {
            name: 'posts',
            type: 'TABLE',
            comment: 'Blog posts table',
            columns: [
              {
                name: 'id',
                type: 'int(11)',
                nullable: false,
                extra_def: 'auto_increment primary key',
                comment: 'Post ID'
              }
            ]
          },
          {
            name: 'comments',
            type: 'TABLE',
            comment: 'Post comments table',
            columns: [
              {
                name: 'id',
                type: 'int(11)',
                nullable: false,
                extra_def: 'auto_increment primary key',
                comment: 'Comment ID'
              }
            ]
          }
        ]
      };

      await fs.writeFile(join(schemaSource, 'schema.json'), JSON.stringify(schema, null, 2));

      const result = await handleSchemaListResource(schemaSource);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const resource: SchemaListResource = result.value;
        expect(resource.schemas).toHaveLength(1);
        expect(resource.schemas[0]).toEqual({
          name: 'default',
          tableCount: 3,
          description: 'Default database schema'
        });
      }
    });

    it('should return schema list for multi-schema setup (subdirectories with schema.json)', async () => {
      // Create multiple schema directories
      const schema1Dir = join(schemaSource, 'public');
      const schema2Dir = join(schemaSource, 'analytics');
      const schema3Dir = join(schemaSource, 'auth');

      await fs.mkdir(schema1Dir);
      await fs.mkdir(schema2Dir);
      await fs.mkdir(schema3Dir);

      // Create schema.json files for each schema
      const publicSchema = {
        name: 'public',
        desc: 'Public Schema',
        tables: [
          {
            name: 'users',
            type: 'TABLE',
            comment: 'User accounts',
            columns: [{ name: 'id', type: 'int(11)', nullable: false, comment: 'User ID' }]
          },
          {
            name: 'products',
            type: 'TABLE',
            comment: 'Product catalog',
            columns: [{ name: 'id', type: 'int(11)', nullable: false, comment: 'Product ID' }]
          }
        ]
      };

      const analyticsSchema = {
        name: 'analytics',
        desc: 'Analytics Schema',
        tables: [
          {
            name: 'events',
            type: 'TABLE',
            comment: 'User events',
            columns: [{ name: 'id', type: 'int(11)', nullable: false, comment: 'Event ID' }]
          },
          {
            name: 'sessions',
            type: 'TABLE',
            comment: 'User sessions',
            columns: [{ name: 'id', type: 'int(11)', nullable: false, comment: 'Session ID' }]
          },
          {
            name: 'conversions',
            type: 'TABLE',
            comment: 'Conversion tracking',
            columns: [{ name: 'id', type: 'int(11)', nullable: false, comment: 'Conversion ID' }]
          }
        ]
      };

      const authSchema = {
        name: 'auth',
        desc: 'Auth Schema',
        tables: [
          {
            name: 'tokens',
            type: 'TABLE',
            comment: 'Authentication tokens',
            columns: [{ name: 'id', type: 'int(11)', nullable: false, comment: 'Token ID' }]
          }
        ]
      };

      await fs.writeFile(join(schema1Dir, 'schema.json'), JSON.stringify(publicSchema, null, 2));
      await fs.writeFile(join(schema2Dir, 'schema.json'), JSON.stringify(analyticsSchema, null, 2));
      await fs.writeFile(join(schema3Dir, 'schema.json'), JSON.stringify(authSchema, null, 2));

      const result = await handleSchemaListResource(schemaSource);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const resource: SchemaListResource = result.value;
        expect(resource.schemas).toHaveLength(3);

        const schemaNames = resource.schemas.map(s => s.name).sort();
        expect(schemaNames).toEqual(['analytics', 'auth', 'public']);

        const publicSchema = resource.schemas.find(s => s.name === 'public');
        const analyticsSchema = resource.schemas.find(s => s.name === 'analytics');
        const authSchema = resource.schemas.find(s => s.name === 'auth');

        expect(publicSchema?.tableCount).toBe(2);
        expect(analyticsSchema?.tableCount).toBe(3);
        expect(authSchema?.tableCount).toBe(1);
      }
    });

    it('should return empty schema list when no schemas found', async () => {
      // Empty schema directory
      const result = await handleSchemaListResource(schemaSource);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const resource: SchemaListResource = result.value;
        expect(resource.schemas).toHaveLength(0);
      }
    });

    it('should handle directory that does not exist', async () => {
      const nonExistentDir = join(tempDir, 'nonexistent');

      const result = await handleSchemaListResource(nonExistentDir);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('Schema source does not exist');
      }
    });

    it('should handle file system permissions error', async () => {
      // Create a directory without read permissions (Unix-like systems)
      const restrictedDir = join(tempDir, 'restricted');
      await fs.mkdir(restrictedDir);

      try {
        await fs.chmod(restrictedDir, 0o000);

        const result = await handleSchemaListResource(restrictedDir);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
          expect(result.error.message).toContain('Failed to read schema directory');
        }
      } finally {
        // Restore permissions for cleanup
        await fs.chmod(restrictedDir, 0o755);
      }
    });

    it('should handle malformed schema.json files gracefully', async () => {
      // Create a schema.json with malformed content
      const malformedContent = `{ "invalid": "json content"`;

      await fs.writeFile(join(schemaSource, 'schema.json'), malformedContent);

      const result = await handleSchemaListResource(schemaSource);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const resource: SchemaListResource = result.value;
        expect(resource.schemas).toHaveLength(1);
        expect(resource.schemas[0]).toEqual({
          name: 'default',
          tableCount: 0, // Should be 0 for malformed files
          description: 'Default schema'
        });
      }
    });

    it('should skip subdirectories without schema.json files', async () => {
      // Create subdirectories with some having README.md and others not
      const validSchemaDir = join(schemaSource, 'valid_schema');
      const invalidSchemaDir = join(schemaSource, 'invalid_schema');
      const emptyDir = join(schemaSource, 'empty_dir');

      await fs.mkdir(validSchemaDir);
      await fs.mkdir(invalidSchemaDir);
      await fs.mkdir(emptyDir);

      // Only create schema.json for valid schema
      const validSchema = {
        name: 'valid_schema',
        desc: 'Valid Schema',
        tables: [
          {
            name: 'test_table',
            type: 'TABLE',
            comment: 'Test table',
            columns: [{ name: 'id', type: 'int(11)', nullable: false, comment: 'Test table ID' }]
          }
        ]
      };

      await fs.writeFile(join(validSchemaDir, 'schema.json'), JSON.stringify(validSchema, null, 2));
      // Create a different file in invalid schema (not schema.json)
      await fs.writeFile(join(invalidSchemaDir, 'other.json'), '{"not": "schema"}');

      const result = await handleSchemaListResource(schemaSource);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const resource: SchemaListResource = result.value;
        expect(resource.schemas).toHaveLength(1);
        expect(resource.schemas[0].name).toBe('valid_schema');
      }
    });

    it('should handle mixed file and directory structure', async () => {
      // Create both single schema.json and subdirectories
      const singleSchema = {
        name: 'default',
        desc: 'Main Schema',
        tables: [
          {
            name: 'main_table',
            type: 'TABLE',
            comment: 'Main table',
            columns: [{ name: 'id', type: 'int(11)', nullable: false, comment: 'Main table ID' }]
          }
        ]
      };

      const subSchemaDir = join(schemaSource, 'sub_schema');
      await fs.mkdir(subSchemaDir);

      const subSchema = {
        name: 'sub_schema',
        desc: 'Sub Schema',
        tables: [
          {
            name: 'sub_table',
            type: 'TABLE',
            comment: 'Sub table',
            columns: [{ name: 'id', type: 'int(11)', nullable: false, comment: 'Sub table ID' }]
          }
        ]
      };

      await fs.writeFile(join(schemaSource, 'schema.json'), JSON.stringify(singleSchema, null, 2));
      await fs.writeFile(join(subSchemaDir, 'schema.json'), JSON.stringify(subSchema, null, 2));

      const result = await handleSchemaListResource(schemaSource);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const resource: SchemaListResource = result.value;
        expect(resource.schemas).toHaveLength(2);

        const schemaNames = resource.schemas.map(s => s.name).sort();
        expect(schemaNames).toEqual(['default', 'sub_schema']);
      }
    });

    it('should handle schema.json files with no tables', async () => {
      // Create schema.json with empty tables array
      const schemaWithoutTables = {
        name: 'default',
        desc: 'Schema without tables',
        tables: []
      };

      await fs.writeFile(join(schemaSource, 'schema.json'), JSON.stringify(schemaWithoutTables, null, 2));

      const result = await handleSchemaListResource(schemaSource);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const resource: SchemaListResource = result.value;
        expect(resource.schemas).toHaveLength(1);
        expect(resource.schemas[0]).toEqual({
          name: 'default',
          tableCount: 0,
          description: 'Schema without tables'
        });
      }
    });

    it('should handle very large schema directories efficiently', async () => {
      // Create many schema directories to test performance
      const schemaPromises = [];

      for (let i = 0; i < 50; i++) {
        const schemaSourcePath = join(schemaSource, `schema_${i}`);
        schemaPromises.push(
          fs.mkdir(schemaSourcePath).then(async () => {
            const schemaContent = {
              name: `schema_${i}`,
              desc: `Schema ${i}`,
              tables: [
                {
                  name: `table_${i}_1`,
                  type: 'TABLE',
                  comment: `Table 1 for schema ${i}`,
                  columns: [{ name: 'id', type: 'int(11)', nullable: false, comment: 'Table ID' }]
                },
                {
                  name: `table_${i}_2`,
                  type: 'TABLE',
                  comment: `Table 2 for schema ${i}`,
                  columns: [{ name: 'id', type: 'int(11)', nullable: false, comment: 'Table ID' }]
                }
              ]
            };
            await fs.writeFile(join(schemaSourcePath, 'schema.json'), JSON.stringify(schemaContent, null, 2));
          })
        );
      }

      await Promise.all(schemaPromises);

      const startTime = Date.now();
      const result = await handleSchemaListResource(schemaSource);
      const endTime = Date.now();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const resource: SchemaListResource = result.value;
        expect(resource.schemas).toHaveLength(50);
        expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds

        // Verify all schemas have correct table counts
        resource.schemas.forEach(schema => {
          expect(schema.tableCount).toBe(2);
        });
      }
    });
  });
});