import { Result, ok, err } from 'neverthrow';
import { promises as fs } from 'fs';
import { join } from 'path';
import { SchemaListResource } from '../schemas/database';
import { parseTableReferences, parseSchemaOverview } from '../parsers/markdown-parser';
import { safeExecuteAsync, fromPromise } from '../utils/result';

/**
 * Handles the schema://list MCP resource
 * Returns a list of all available database schemas with metadata
 *
 * @param schemaDir - Directory containing tbls schema files
 * @returns Result containing schema list resource or error
 */
export const handleSchemaListResource = async (schemaDir: string): Promise<Result<SchemaListResource, Error>> => {
  // Check if schema directory exists
  const dirExistsResult = await safeExecuteAsync(
    async () => {
      const stat = await fs.stat(schemaDir);
      if (!stat.isDirectory()) {
        throw new Error('Path is not a directory');
      }
      return true;
    },
    'Schema directory does not exist'
  );

  if (dirExistsResult.isErr()) {
    return err(dirExistsResult.error);
  }

  // Read directory contents
  const readDirResult = await fromPromise(
    fs.readdir(schemaDir, { withFileTypes: true }),
    'Failed to read schema directory'
  );

  if (readDirResult.isErr()) {
    return err(readDirResult.error);
  }

  const dirEntries = readDirResult.value;
  const schemas: Array<{ name: string; tableCount?: number; description?: string | null }> = [];

  // Check for single schema setup (README.md in root)
  const hasRootReadme = dirEntries.some(entry => entry.isFile() && entry.name === 'README.md');

  if (hasRootReadme) {
    const singleSchemaResult = await parseSingleSchemaInfo(schemaDir, 'default');
    if (singleSchemaResult.isOk()) {
      schemas.push(singleSchemaResult.value);
    }
  }

  // Check for multi-schema setup (subdirectories with README.md files)
  const subdirectories = dirEntries.filter(entry => entry.isDirectory());

  for (const subdir of subdirectories) {
    const subdirPath = join(schemaDir, subdir.name);
    const readmeResult = await safeExecuteAsync(
      async () => {
        await fs.access(join(subdirPath, 'README.md'));
        return true;
      },
      'README.md not found in subdirectory'
    );

    if (readmeResult.isOk()) {
      const schemaResult = await parseSingleSchemaInfo(subdirPath, subdir.name);
      if (schemaResult.isOk()) {
        schemas.push(schemaResult.value);
      }
    }
  }

  // Sort schemas by name for consistent ordering
  schemas.sort((a, b) => a.name.localeCompare(b.name));

  return ok({ schemas });
};

/**
 * Parses schema information from a single README.md file
 *
 * @param schemaPath - Path to the schema directory
 * @param schemaName - Name of the schema
 * @returns Result containing schema info or error
 */
const parseSingleSchemaInfo = async (
  schemaPath: string,
  schemaName: string
): Promise<Result<{ name: string; tableCount?: number; description?: string | null }, Error>> => {
  const readmeResult = await fromPromise(
    fs.readFile(join(schemaPath, 'README.md'), 'utf8'),
    'Failed to read README.md'
  );

  if (readmeResult.isErr()) {
    return err(readmeResult.error);
  }

  const content = readmeResult.value;

  // Try to parse as full schema overview first
  const overviewResult = parseSchemaOverview(content);
  if (overviewResult.isOk()) {
    const metadata = overviewResult.value;
    return ok({
      name: schemaName, // Use provided name instead of parsed name for consistency
      tableCount: metadata.tableCount ?? undefined,
      description: metadata.description
    });
  }

  // Fallback: try to parse table references for table count
  const tableRefsResult = parseTableReferences(content);
  if (tableRefsResult.isOk()) {
    const tableCount = tableRefsResult.value.length;
    return ok({
      name: schemaName,
      tableCount: tableCount > 0 ? tableCount : 0,
      description: schemaName === 'default' ? 'Default schema' : null
    });
  }

  // If parsing fails, still return basic schema info
  return ok({
    name: schemaName,
    tableCount: 0,
    description: schemaName === 'default' ? 'Default schema' : null
  });
};