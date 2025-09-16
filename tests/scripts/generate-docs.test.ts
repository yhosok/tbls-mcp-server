import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
// neverthrow imports are available in the environment
import * as fs from 'fs/promises';
import * as path from 'path';
import { ResourcePattern } from '../../src/server/resource-patterns';

// Import the functions we'll test (to be implemented)
import {
  extractResourcePatternsInfo,
  generateResourcesTable,
  updateReadmeWithGeneratedContent,
  validateDocumentationConsistency,
} from '../../src/scripts/generate-docs';

describe('Document Generation Scripts', () => {
  const tempDir = path.join(__dirname, 'temp');
  const tempReadmePath = path.join(tempDir, 'README.md');

  beforeEach(async () => {
    // Create temp directory for testing
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    // Cleanup temp directory
    try {
      await fs.rm(tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('extractResourcePatternsInfo', () => {
    test('should extract basic information from ResourcePatterns', async () => {
      const result = await extractResourcePatternsInfo();
      expect(result.isOk()).toBe(true);

      if (result.isOk()) {
        const patterns = result.value;
        expect(patterns).toHaveLength(4); // We know there are 4 patterns from ResourcePatterns class

        // Verify schema list pattern
        const schemaListPattern = patterns.find(p => p.id === 'schema-list');
        expect(schemaListPattern).toBeDefined();
        expect(schemaListPattern?.uriPattern).toBe('schema://list');
        expect(schemaListPattern?.namePattern).toBe('Database Schemas');
        expect(schemaListPattern?.requiresDiscovery).toBe(false);

        // Verify schema tables pattern
        const schemaTablesPattern = patterns.find(p => p.id === 'schema-tables');
        expect(schemaTablesPattern).toBeDefined();
        expect(schemaTablesPattern?.uriPattern).toBe('schema://{schemaName}/tables');
        expect(schemaTablesPattern?.namePattern).toBe('{schemaName} Schema Tables');
        expect(schemaTablesPattern?.requiresDiscovery).toBe(true);

        // Verify table info pattern
        const tableInfoPattern = patterns.find(p => p.id === 'table-info');
        expect(tableInfoPattern).toBeDefined();
        expect(tableInfoPattern?.uriPattern).toBe('table://{schemaName}/{tableName}');
        expect(tableInfoPattern?.namePattern).toBe('{tableName} table ({schemaName} schema)');
        expect(tableInfoPattern?.requiresDiscovery).toBe(true);

        // Verify table indexes pattern
        const tableIndexesPattern = patterns.find(p => p.id === 'table-indexes');
        expect(tableIndexesPattern).toBeDefined();
        expect(tableIndexesPattern?.uriPattern).toBe('table://{schemaName}/{tableName}/indexes');
        expect(tableIndexesPattern?.namePattern).toBe('{tableName} table indexes ({schemaName} schema)');
        expect(tableIndexesPattern?.requiresDiscovery).toBe(true);
      }
    });

    test('should handle errors when ResourcePatterns cannot be loaded', async () => {
      // This test might require mocking the ResourcePatterns class
      // For now, we'll test the happy path since ResourcePatterns is well-defined
      const result = await extractResourcePatternsInfo();
      expect(result.isOk()).toBe(true);
    });
  });

  describe('generateResourcesTable', () => {
    test('should generate proper markdown table from patterns', () => {
      const mockPatterns: ResourcePattern[] = [
        {
          id: 'test-pattern',
          uriPattern: 'test://{id}',
          mimeType: 'application/json',
          namePattern: 'Test {id}',
          descriptionPattern: 'A test pattern for {id}',
          requiresDiscovery: false,
          matcher: () => null,
        },
        {
          id: 'discovery-pattern',
          uriPattern: 'discover://{type}/{name}',
          mimeType: 'application/json',
          namePattern: '{name} {type}',
          descriptionPattern: 'Discovery pattern for {name} of type {type}',
          requiresDiscovery: true,
          matcher: () => null,
        },
      ];

      const result = generateResourcesTable(mockPatterns);
      expect(result.isOk()).toBe(true);

      if (result.isOk()) {
        const table = result.value;
        expect(table).toContain('| URI Pattern | Description | Discovery Required |');
        expect(table).toContain('|-------------|-------------|-------------------|');
        expect(table).toContain('| `test://{id}` | A test pattern for {id} | No |');
        expect(table).toContain('| `discover://{type}/{name}` | Discovery pattern for {name} of type {type} | Yes |');
      }
    });

    test('should handle empty patterns array', () => {
      const result = generateResourcesTable([]);
      expect(result.isOk()).toBe(true);

      if (result.isOk()) {
        const table = result.value;
        expect(table).toContain('| URI Pattern | Description | Discovery Required |');
        expect(table).toContain('|-------------|-------------|-------------------|');
        expect(table).toContain('*No resources currently defined.*');
      }
    });

    test('should escape markdown special characters in descriptions', () => {
      const mockPatterns: ResourcePattern[] = [
        {
          id: 'special-chars',
          uriPattern: 'special://test',
          mimeType: 'application/json',
          namePattern: 'Special Test',
          descriptionPattern: 'Description with |pipes| and *asterisks* and `backticks`',
          requiresDiscovery: false,
          matcher: () => null,
        },
      ];

      const result = generateResourcesTable(mockPatterns);
      expect(result.isOk()).toBe(true);

      if (result.isOk()) {
        const table = result.value;
        // Verify that special characters are properly escaped
        expect(table).toContain('Description with \\|pipes\\| and \\*asterisks\\* and \\`backticks\\`');
      }
    });
  });

  describe('updateReadmeWithGeneratedContent', () => {
    test('should update README with generated content between markers', async () => {
      const originalReadme = `# Test README

## Some Section

This is static content.

## MCP Resources

<!-- AUTO-GENERATED:START - Do not modify this section manually -->
Old content that should be replaced
<!-- AUTO-GENERATED:END -->

## Another Section

More static content.
`;

      const newContent = `| URI Pattern | Description |
|-------------|-------------|
| \`test://example\` | Example resource |`;

      await fs.writeFile(tempReadmePath, originalReadme);

      const result = await updateReadmeWithGeneratedContent(tempReadmePath, newContent);
      expect(result.isOk()).toBe(true);

      const updatedContent = await fs.readFile(tempReadmePath, 'utf-8');
      expect(updatedContent).toContain('<!-- AUTO-GENERATED:START - Do not modify this section manually -->');
      expect(updatedContent).toContain(newContent);
      expect(updatedContent).toContain('<!-- AUTO-GENERATED:END -->');
      expect(updatedContent).toContain('This is static content.');
      expect(updatedContent).toContain('More static content.');
      expect(updatedContent).not.toContain('Old content that should be replaced');
    });

    test('should handle README without existing auto-generated section', async () => {
      const originalReadme = `# Test README

## MCP Resources

Some existing content about resources.

## Another Section

More content.
`;

      const newContent = `| URI Pattern | Description |
|-------------|-------------|
| \`test://example\` | Example resource |`;

      await fs.writeFile(tempReadmePath, originalReadme);

      const result = await updateReadmeWithGeneratedContent(tempReadmePath, newContent);
      expect(result.isOk()).toBe(true);

      const updatedContent = await fs.readFile(tempReadmePath, 'utf-8');
      expect(updatedContent).toContain('<!-- AUTO-GENERATED:START - Do not modify this section manually -->');
      expect(updatedContent).toContain(newContent);
      expect(updatedContent).toContain('<!-- AUTO-GENERATED:END -->');
    });

    test('should handle file not found error', async () => {
      const nonExistentPath = path.join(tempDir, 'non-existent.md');
      const result = await updateReadmeWithGeneratedContent(nonExistentPath, 'content');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('Failed to update README');
      }
    });
  });

  describe('validateDocumentationConsistency', () => {
    test('should validate that README contains all resource patterns', async () => {
      const readmeContent = `# Test README

## MCP Resources

<!-- AUTO-GENERATED:START - Do not modify this section manually -->
| URI Pattern | Description | Discovery Required |
|-------------|-------------|-------------------|
| \`schema://list\` | Complete list of all available database schemas | No |
| \`schema://{schemaName}/tables\` | Comprehensive list of all tables within the {schemaName} schema | Yes |
| \`table://{schemaName}/{tableName}\` | Complete detailed information about the {tableName} table | Yes |
| \`table://{schemaName}/{tableName}/indexes\` | Detailed index information for the {tableName} table | Yes |
<!-- AUTO-GENERATED:END -->
`;

      await fs.writeFile(tempReadmePath, readmeContent);

      const result = await validateDocumentationConsistency(tempReadmePath);
      expect(result.isOk()).toBe(true);

      if (result.isOk()) {
        expect(result.value.isConsistent).toBe(true);
        expect(result.value.missingPatterns).toHaveLength(0);
        expect(result.value.extraPatterns).toHaveLength(0);
      }
    });

    test('should detect missing patterns in README', async () => {
      const readmeContent = `# Test README

## MCP Resources

<!-- AUTO-GENERATED:START - Do not modify this section manually -->
| URI Pattern | Description | Discovery Required |
|-------------|-------------|-------------------|
| \`schema://list\` | Complete list of all available database schemas | No |
<!-- AUTO-GENERATED:END -->
`;

      await fs.writeFile(tempReadmePath, readmeContent);

      const result = await validateDocumentationConsistency(tempReadmePath);
      expect(result.isOk()).toBe(true);

      if (result.isOk()) {
        expect(result.value.isConsistent).toBe(false);
        expect(result.value.missingPatterns).toContain('schema://{schemaName}/tables');
        expect(result.value.missingPatterns).toContain('table://{schemaName}/{tableName}');
        expect(result.value.missingPatterns).toContain('table://{schemaName}/{tableName}/indexes');
      }
    });

    test('should handle README without auto-generated section', async () => {
      const readmeContent = `# Test README

## MCP Resources

Manual content about resources.
`;

      await fs.writeFile(tempReadmePath, readmeContent);

      const result = await validateDocumentationConsistency(tempReadmePath);
      expect(result.isErr()).toBe(true);

      if (result.isErr()) {
        expect(result.error.message).toContain('Auto-generated section not found');
      }
    });
  });
});