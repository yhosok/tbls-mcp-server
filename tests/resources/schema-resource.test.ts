import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { handleSchemaListResource } from '../../src/resources/schema-resource';
import { SchemaListResource } from '../../src/schemas/database';

describe('Schema Resource Handler', () => {
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

  describe('handleSchemaListResource', () => {
    it('should return schema list for single schema setup (README.md exists)', async () => {
      // Create a single schema README.md file
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

      const result = await handleSchemaListResource(schemaDir);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const resource: SchemaListResource = result.value;
        expect(resource.schemas).toHaveLength(1);
        expect(resource.schemas[0]).toEqual({
          name: 'default',
          tableCount: 3,
          description: 'Default schema'
        });
      }
    });

    it('should return schema list for multi-schema setup (subdirectories with README.md)', async () => {
      // Create multiple schema directories
      const schema1Dir = join(schemaDir, 'public');
      const schema2Dir = join(schemaDir, 'analytics');
      const schema3Dir = join(schemaDir, 'auth');

      await fs.mkdir(schema1Dir);
      await fs.mkdir(schema2Dir);
      await fs.mkdir(schema3Dir);

      // Create README.md files for each schema
      const publicReadme = `# Public Schema

## Tables

| Name | Columns | Comment |
| ---- | ------- | ------- |
| users | 5 | User accounts |
| products | 10 | Product catalog |

Generated at: 2024-01-15T10:30:00Z
`;

      const analyticsReadme = `# Analytics Schema

## Tables

| Name | Columns | Comment |
| ---- | ------- | ------- |
| events | 8 | User events |
| sessions | 6 | User sessions |
| conversions | 4 | Conversion tracking |

Generated at: 2024-01-15T10:30:00Z
`;

      const authReadme = `# Auth Schema

## Tables

| Name | Columns | Comment |
| ---- | ------- | ------- |
| tokens | 7 | Authentication tokens |

Generated at: 2024-01-15T10:30:00Z
`;

      await fs.writeFile(join(schema1Dir, 'README.md'), publicReadme);
      await fs.writeFile(join(schema2Dir, 'README.md'), analyticsReadme);
      await fs.writeFile(join(schema3Dir, 'README.md'), authReadme);

      const result = await handleSchemaListResource(schemaDir);

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
      const result = await handleSchemaListResource(schemaDir);

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
        expect(result.error.message).toContain('Schema directory does not exist');
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

    it('should handle malformed README.md files gracefully', async () => {
      // Create a README.md with malformed content
      const malformedContent = `# Invalid Schema

This is not a proper tbls markdown file.
No tables section exists.
`;

      await fs.writeFile(join(schemaDir, 'README.md'), malformedContent);

      const result = await handleSchemaListResource(schemaDir);

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

    it('should skip subdirectories without README.md files', async () => {
      // Create subdirectories with some having README.md and others not
      const validSchemaDir = join(schemaDir, 'valid_schema');
      const invalidSchemaDir = join(schemaDir, 'invalid_schema');
      const emptyDir = join(schemaDir, 'empty_dir');

      await fs.mkdir(validSchemaDir);
      await fs.mkdir(invalidSchemaDir);
      await fs.mkdir(emptyDir);

      // Only create README.md for valid schema
      const validReadme = `# Valid Schema

## Tables

| Name | Columns | Comment |
| ---- | ------- | ------- |
| test_table | 3 | Test table |

Generated at: 2024-01-15T10:30:00Z
`;

      await fs.writeFile(join(validSchemaDir, 'README.md'), validReadme);
      // Create a different file in invalid schema (not README.md)
      await fs.writeFile(join(invalidSchemaDir, 'other.md'), 'Not a README');

      const result = await handleSchemaListResource(schemaDir);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const resource: SchemaListResource = result.value;
        expect(resource.schemas).toHaveLength(1);
        expect(resource.schemas[0].name).toBe('valid_schema');
      }
    });

    it('should handle mixed file and directory structure', async () => {
      // Create both single schema README.md and subdirectories
      const singleSchemaReadme = `# Main Schema

## Tables

| Name | Columns | Comment |
| ---- | ------- | ------- |
| main_table | 5 | Main table |

Generated at: 2024-01-15T10:30:00Z
`;

      const subSchemaDir = join(schemaDir, 'sub_schema');
      await fs.mkdir(subSchemaDir);

      const subSchemaReadme = `# Sub Schema

## Tables

| Name | Columns | Comment |
| ---- | ------- | ------- |
| sub_table | 3 | Sub table |

Generated at: 2024-01-15T10:30:00Z
`;

      await fs.writeFile(join(schemaDir, 'README.md'), singleSchemaReadme);
      await fs.writeFile(join(subSchemaDir, 'README.md'), subSchemaReadme);

      const result = await handleSchemaListResource(schemaDir);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const resource: SchemaListResource = result.value;
        expect(resource.schemas).toHaveLength(2);

        const schemaNames = resource.schemas.map(s => s.name).sort();
        expect(schemaNames).toEqual(['default', 'sub_schema']);
      }
    });

    it('should handle README.md files with no table count information', async () => {
      // Create README.md without proper table structure
      const readmeWithoutTables = `# Schema Without Tables

This schema documentation doesn't have a proper tables section.

## Some Other Section

Content here.
`;

      await fs.writeFile(join(schemaDir, 'README.md'), readmeWithoutTables);

      const result = await handleSchemaListResource(schemaDir);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const resource: SchemaListResource = result.value;
        expect(resource.schemas).toHaveLength(1);
        expect(resource.schemas[0]).toEqual({
          name: 'default',
          tableCount: 0,
          description: 'Default schema'
        });
      }
    });

    it('should handle very large schema directories efficiently', async () => {
      // Create many schema directories to test performance
      const schemaPromises = [];

      for (let i = 0; i < 50; i++) {
        const schemaDirPath = join(schemaDir, `schema_${i}`);
        schemaPromises.push(
          fs.mkdir(schemaDirPath).then(async () => {
            const readmeContent = `# Schema ${i}

## Tables

| Name | Columns | Comment |
| ---- | ------- | ------- |
| table_${i}_1 | 5 | Table 1 for schema ${i} |
| table_${i}_2 | 3 | Table 2 for schema ${i} |

Generated at: 2024-01-15T10:30:00Z
`;
            await fs.writeFile(join(schemaDirPath, 'README.md'), readmeContent);
          })
        );
      }

      await Promise.all(schemaPromises);

      const startTime = Date.now();
      const result = await handleSchemaListResource(schemaDir);
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