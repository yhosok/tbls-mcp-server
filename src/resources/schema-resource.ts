import { Result, ok, err } from 'neverthrow';
import { promises as fs } from 'fs';
import { join } from 'path';
import * as path from 'path';
import { SchemaListResource } from '../schemas/database';
import {
  parseTableReferences,
  parseSchemaOverview,
  parseSchemaWithFallback,
  resolveSchemaSource,
} from '../parsers/schema-adapter';
import { safeExecuteAsync, fromPromise } from '../utils/result';
import { ResourceCache } from '../cache/resource-cache';

/**
 * Handles the schema://list MCP resource
 * Returns a list of all available database schemas with metadata
 *
 * @param schemaSource - Path to schema file or directory containing tbls schema files
 * @param cache - Optional cache instance for performance optimization
 * @returns Result containing schema list resource or error
 */
export const handleSchemaListResource = async (
  schemaSource: string,
  cache?: ResourceCache
): Promise<Result<SchemaListResource, Error>> => {
  // Resolve the schema source to determine if it's a file or directory
  const resolveResult = resolveSchemaSource(schemaSource);
  if (resolveResult.isErr()) {
    // If it's a directory but no JSON files found, treat as empty directory
    if (
      resolveResult.error.message.includes(
        'No JSON schema file found in directory'
      )
    ) {
      return ok({ schemas: [] });
    }
    return err(resolveResult.error);
  }

  const { type: sourceType, path: schemaPath } = resolveResult.value;
  const schemaDir =
    sourceType === 'file' ? path.dirname(schemaPath) : schemaPath;

  // Try to get cached schema list first
  if (cache) {
    const cachedTableRefs = await cache.getTableReferences(schemaDir);
    if (cachedTableRefs) {
      // Build a simple schema list from cached table references
      const schemas = [
        {
          name: 'default',
          tableCount: cachedTableRefs.length,
          description: 'Default schema',
        },
      ];
      return ok({ schemas });
    }
  }

  // For single file sources, handle as default schema
  if (sourceType === 'file') {
    const singleSchemaResult = await parseSingleSchemaInfo(
      schemaDir,
      'default',
      cache
    );
    if (singleSchemaResult.isOk()) {
      return ok({ schemas: [singleSchemaResult.value] });
    } else {
      // Fallback for single file
      return ok({
        schemas: [
          {
            name: 'default',
            tableCount: 0,
            description: 'Default schema',
          },
        ],
      });
    }
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
  const schemas: Array<{
    name: string;
    tableCount?: number;
    description?: string | null;
  }> = [];

  // Check for single schema setup (schema.json in root)
  const hasRootSchemaFile = dirEntries.some(
    (entry) => entry.isFile() && entry.name === 'schema.json'
  );

  if (hasRootSchemaFile) {
    const singleSchemaResult = await parseSingleSchemaInfo(
      schemaDir,
      'default',
      cache
    );
    if (singleSchemaResult.isOk()) {
      schemas.push(singleSchemaResult.value);
    }
  }

  // Check for multi-schema setup (subdirectories with schema files)
  const subdirectories = dirEntries.filter((entry) => entry.isDirectory());

  for (const subdir of subdirectories) {
    const subdirPath = join(schemaDir, subdir.name);
    // Check for schema.json file
    const hasSchemaFileResult = await safeExecuteAsync(async () => {
      await fs.access(join(subdirPath, 'schema.json'));
      return true;
    }, 'No schema file found in subdirectory');

    if (hasSchemaFileResult.isOk()) {
      const schemaResult = await parseSingleSchemaInfo(
        subdirPath,
        subdir.name,
        cache
      );
      if (schemaResult.isOk()) {
        schemas.push(schemaResult.value);
      }
    }
  }

  // Sort schemas by name for consistent ordering
  schemas.sort((a, b) => a.name.localeCompare(b.name));

  const result = { schemas };

  // Cache the result if cache is available
  if (cache && schemas.length > 0) {
    // For single schema setups, cache the table references for faster subsequent calls
    if (schemas.length === 1 && schemas[0].name === 'default') {
      // Try to get table references for the default schema and cache them
      const tableRefsResult = parseTableReferences(schemaDir);
      if (tableRefsResult.isOk()) {
        await cache.setTableReferences(schemaDir, tableRefsResult.value);
      }
    }
  }

  return ok(result);
};

/**
 * Parses schema information from a schema file (JSON format)
 *
 * @param schemaPath - Path to the schema directory
 * @param schemaName - Name of the schema
 * @param cache - Optional cache instance for performance optimization
 * @returns Result containing schema info or error
 */
const parseSingleSchemaInfo = async (
  schemaPath: string,
  schemaName: string,
  cache?: ResourceCache
): Promise<
  Result<
    { name: string; tableCount?: number; description?: string | null },
    Error
  >
> => {
  // Try to get cached schema info first
  if (cache) {
    const cachedSchema = await cache.getSchema(schemaPath);
    if (cachedSchema?.metadata) {
      return ok({
        name: schemaName,
        tableCount:
          cachedSchema.metadata.tableCount ?? cachedSchema.tables?.length ?? 0,
        description: cachedSchema.metadata.description,
      });
    }
  }
  // Try to parse as full schema overview first using the schema adapter
  const overviewResult = parseSchemaOverview(schemaPath);
  if (overviewResult.isOk()) {
    const metadata = overviewResult.value;
    const result = {
      name: metadata.name || schemaName, // Use parsed name from schema.json, fall back to provided name
      tableCount: metadata.tableCount ?? undefined,
      description: metadata.description,
    };

    // Cache the parsed metadata if cache is available
    if (cache) {
      const cacheSchema = {
        metadata: {
          name: metadata.name || schemaName,
          tableCount: metadata.tableCount,
          generated: metadata.generated ?? null,
          version: metadata.version ?? null,
          description: metadata.description,
        },
        tables: [],
        tableReferences: [],
        indexes: [],
        relations: [],
      };
      await cache.setSchema(schemaPath, cacheSchema);
    }

    return ok(result);
  }

  // Fallback: try to parse table references for table count
  const tableRefsResult = parseTableReferences(schemaPath);
  if (tableRefsResult.isOk()) {
    const tableCount = tableRefsResult.value.length;
    const result = {
      name: schemaName,
      tableCount: tableCount > 0 ? tableCount : 0,
      description: schemaName === 'default' ? 'Default schema' : null,
    };

    // Cache the table references if cache is available
    if (cache) {
      await cache.setTableReferences(schemaPath, tableRefsResult.value);
    }

    return ok(result);
  }

  // Final fallback: try parseSchemaWithFallback for comprehensive format detection
  const schemaResult = parseSchemaWithFallback(schemaPath);
  if (schemaResult.isOk()) {
    const schema = schemaResult.value;
    const result = {
      name: schemaName,
      tableCount: schema.tables?.length ?? 0,
      description:
        schema.metadata?.description ??
        (schemaName === 'default' ? 'Default schema' : null),
    };

    // Cache the full schema if cache is available
    if (cache) {
      await cache.setSchema(schemaPath, schema);
    }

    return ok(result);
  }

  // If all parsing fails, still return basic schema info
  return ok({
    name: schemaName,
    tableCount: 0,
    description: schemaName === 'default' ? 'Default schema' : null,
  });
};

// Export parseSingleSchemaInfo for testing
export { parseSingleSchemaInfo };
