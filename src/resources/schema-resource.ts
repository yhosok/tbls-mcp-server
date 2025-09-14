import { Result, ok, err } from 'neverthrow';
import { promises as fs } from 'fs';
import { join } from 'path';
import { SchemaListResource } from '../schemas/database';
import { parseTableReferences, parseSchemaOverview, parseSchemaWithFallback } from '../parsers/schema-adapter';
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

  // Check for single schema setup (README.md or schema.json in root)
  const hasRootSchemaFile = dirEntries.some(entry => entry.isFile() && (entry.name === 'README.md' || entry.name === 'schema.json'));

  if (hasRootSchemaFile) {
    const singleSchemaResult = await parseSingleSchemaInfo(schemaDir, 'default');
    if (singleSchemaResult.isOk()) {
      schemas.push(singleSchemaResult.value);
    }
  }

  // Check for multi-schema setup (subdirectories with README.md files)
  const subdirectories = dirEntries.filter(entry => entry.isDirectory());

  for (const subdir of subdirectories) {
    const subdirPath = join(schemaDir, subdir.name);
    // Check for either README.md or schema.json files
    const hasSchemaFileResult = await safeExecuteAsync(
      async () => {
        try {
          await fs.access(join(subdirPath, 'README.md'));
          return true;
        } catch {
          await fs.access(join(subdirPath, 'schema.json'));
          return true;
        }
      },
      'No schema file found in subdirectory'
    );

    if (hasSchemaFileResult.isOk()) {
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
 * Parses schema information from a schema file (JSON or Markdown)
 *
 * @param schemaPath - Path to the schema directory
 * @param schemaName - Name of the schema
 * @returns Result containing schema info or error
 */
const parseSingleSchemaInfo = async (
  schemaPath: string,
  schemaName: string
): Promise<Result<{ name: string; tableCount?: number; description?: string | null }, Error>> => {
  // Try to parse as full schema overview first using the schema adapter
  const overviewResult = parseSchemaOverview(schemaPath);
  if (overviewResult.isOk()) {
    const metadata = overviewResult.value;
    return ok({
      name: schemaName, // Use provided name instead of parsed name for consistency
      tableCount: metadata.tableCount ?? undefined,
      description: metadata.description
    });
  }

  // Fallback: try to parse table references for table count
  const tableRefsResult = parseTableReferences(schemaPath);
  if (tableRefsResult.isOk()) {
    const tableCount = tableRefsResult.value.length;
    return ok({
      name: schemaName,
      tableCount: tableCount > 0 ? tableCount : 0,
      description: schemaName === 'default' ? 'Default schema' : null
    });
  }

  // Final fallback: try parseSchemaWithFallback for comprehensive format detection
  const schemaResult = parseSchemaWithFallback(schemaPath);
  if (schemaResult.isOk()) {
    const schema = schemaResult.value;
    return ok({
      name: schemaName,
      tableCount: schema.tables?.length ?? 0,
      description: schema.metadata?.description ?? (schemaName === 'default' ? 'Default schema' : null)
    });
  }

  // If all parsing fails, still return basic schema info
  return ok({
    name: schemaName,
    tableCount: 0,
    description: schemaName === 'default' ? 'Default schema' : null
  });
};