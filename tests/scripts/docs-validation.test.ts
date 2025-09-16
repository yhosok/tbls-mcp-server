import { describe, test, expect } from '@jest/globals';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';

const execAsync = promisify(exec);

describe('Documentation Validation (Integration)', () => {
  const tempDir = path.join(__dirname, 'temp-validation');

  afterEach(async () => {
    // Cleanup temp directory
    try {
      await fs.rm(tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  test('should validate consistent documentation via CLI', async () => {
    // Create a test README with consistent documentation
    const readmeContent = `# Test README

## MCP Resources

<!-- AUTO-GENERATED:START - Do not modify this section manually -->
| URI Pattern | Description | Discovery Required |
|-------------|-------------|-------------------|
| \`db://schemas\` | Complete list of all available database schemas with metadata including schema names, table counts, and version information. URI format: db://schemas | No |
| \`db://schemas/{schemaName}/tables\` | Comprehensive list of all tables within the {schemaName} schema, including table metadata, row counts, and basic structure information. URI format: db://schemas[schema_name]/tables (example: db://schemas/default/tables, db://schemas/public/tables) | Yes |
| \`db://schemas/{schemaName}\` | Information about the {schemaName} schema. This URI redirects to db://schemas/{schemaName}/tables. URI format: db://schemas/[schema_name] (example: db://schemas/default, db://schemas/public) | Yes |
| \`db://schemas/{schemaName}/tables/{tableName}\` | Complete detailed information about the {tableName} table including column definitions with data types, constraints, indexes, foreign key relationships, and table statistics. URI format: db://schemas/[schema_name]/tables/[table_name] (example: db://schemas/default/tables/users, db://schemas/public/tables/orders) | Yes |
| \`db://schemas/{schemaName}/tables/{tableName}/indexes\` | Detailed index information for the {tableName} table including index names, types (primary, unique, regular), column compositions, and performance statistics. URI format: db://schemas/[schema_name]/tables/[table_name]/indexes (example: db://schemas/default/tables/users/indexes, db://schemas/public/tables/orders/indexes) | Yes |
<!-- AUTO-GENERATED:END -->
`;

    await fs.mkdir(tempDir, { recursive: true });
    const tempReadmePath = path.join(tempDir, 'README.md');
    await fs.writeFile(tempReadmePath, readmeContent);

    // Run validation and expect success
    try {
      const { stdout, stderr } = await execAsync(`npx tsx src/scripts/generate-docs.ts --validate "${tempReadmePath}"`);

      expect(stderr).toBe('');
      expect(stdout).toContain('✅ Documentation is consistent with resource patterns');
      expect(stdout).toContain('Patterns documented: 5/5');
    } catch (error: unknown) {
      // CLI should exit with code 0 on success
      expect(error).toBeNull();
    }
  }, 15000); // 15 second timeout for CLI execution

  test('should detect inconsistent documentation via CLI', async () => {
    // Create a test README with missing patterns
    const readmeContent = `# Test README

## MCP Resources

<!-- AUTO-GENERATED:START - Do not modify this section manually -->
| URI Pattern | Description | Discovery Required |
|-------------|-------------|-------------------|
| \`db://schemas\` | Complete list of all available database schemas | No |
<!-- AUTO-GENERATED:END -->
`;

    await fs.mkdir(tempDir, { recursive: true });
    const tempReadmePath = path.join(tempDir, 'README.md');
    await fs.writeFile(tempReadmePath, readmeContent);

    // Run validation and expect failure
    try {
      await execAsync(`npx tsx src/scripts/generate-docs.ts --validate "${tempReadmePath}"`);

      // Should not reach here - validation should fail
      expect(true).toBe(false);
    } catch (error: unknown) {
      // CLI should exit with non-zero code on validation failure
      expect(error.code).toBe(1);
      expect(error.stderr).toContain('❌ Documentation is inconsistent with resource patterns');
      expect(error.stderr).toContain('Patterns documented: 1/5');
      expect(error.stderr).toContain('Missing patterns:');
    }
  }, 15000); // 15 second timeout for CLI execution

  test('should handle missing README file via CLI', async () => {
    const nonExistentPath = path.join(tempDir, 'non-existent.md');

    try {
      await execAsync(`npx tsx src/scripts/generate-docs.ts --validate "${nonExistentPath}"`);

      // Should not reach here - validation should fail
      expect(true).toBe(false);
    } catch (error: unknown) {
      // CLI should exit with non-zero code on error
      expect(error.code).toBe(1);
      expect(error.stderr).toContain('❌ Validation error:');
    }
  }, 15000);

  test('should generate documentation via CLI', async () => {
    // Create a test README without auto-generated section
    const readmeContent = `# Test README

## MCP Resources

Some existing content about resources.
`;

    await fs.mkdir(tempDir, { recursive: true });
    const tempReadmePath = path.join(tempDir, 'README.md');
    await fs.writeFile(tempReadmePath, readmeContent);

    // Run generation and expect success
    try {
      const { stdout, stderr } = await execAsync(`npx tsx src/scripts/generate-docs.ts "${tempReadmePath}"`);

      expect(stderr).toBe('');
      expect(stdout).toContain('✅ Documentation updated successfully');
      expect(stdout).toContain('✅ Documentation is consistent with resource patterns');

      // Verify the file was updated
      const updatedContent = await fs.readFile(tempReadmePath, 'utf-8');
      expect(updatedContent).toContain('<!-- AUTO-GENERATED:START - Do not modify this section manually -->');
      expect(updatedContent).toContain('db://schemas');
      expect(updatedContent).toContain('<!-- AUTO-GENERATED:END -->');
    } catch (error: unknown) {
      // Generation should succeed
      expect(error).toBeNull();
    }
  }, 15000);
});