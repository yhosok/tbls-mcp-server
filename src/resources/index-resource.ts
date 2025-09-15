import { Result, ok, err } from 'neverthrow';
import { join } from 'path';
import * as path from 'path';
import { TableIndexesResource } from '../schemas/database';
import {
  parseSingleTableFile,
  resolveSchemaSource,
} from '../parsers/schema-adapter';
import { ResourceCache } from '../cache/resource-cache';

/**
 * Handles the table://{schema_name}/{table_name}/indexes MCP resource
 * Returns index information for a specific table
 *
 * @param schemaSource - Path to schema file or directory containing tbls schema files
 * @param schemaName - Name of the schema containing the table
 * @param tableName - Name of the table to get indexes for
 * @param cache - Optional cache instance for performance optimization
 * @returns Result containing table indexes resource or error
 */
export const handleTableIndexesResource = async (
  schemaSource: string,
  schemaName: string,
  tableName: string,
  cache?: ResourceCache
): Promise<Result<TableIndexesResource, Error>> => {
  // Resolve the schema source
  const resolveResult = resolveSchemaSource(schemaSource);
  if (resolveResult.isErr()) {
    return err(resolveResult.error);
  }

  const { type: sourceType, path: schemaPath } = resolveResult.value;

  // Determine the path to the table file (JSON format)
  let tableBasePath: string;
  if (sourceType === 'file') {
    // Single file - use the directory containing the file
    const schemaDir = path.dirname(schemaPath);
    tableBasePath = join(schemaDir, tableName);
  } else {
    // Directory - determine subdirectory for multi-schema setup
    if (schemaName === 'default') {
      tableBasePath = join(schemaPath, tableName);
    } else {
      tableBasePath = join(schemaPath, schemaName, tableName);
    }
  }

  // Try to get cached table first
  if (cache) {
    const cachedTable = await cache.getTable(tableBasePath);
    if (cachedTable) {
      return ok({
        schemaName,
        tableName,
        indexes: cachedTable.indexes,
      });
    }
  }

  // Parse the table file using schema adapter (JSON format)
  const parseResult = parseSingleTableFile(tableBasePath);
  if (parseResult.isErr()) {
    return err(
      new Error(`Failed to parse table: ${parseResult.error.message}`)
    );
  }

  const schema = parseResult.value;
  if (schema.tables.length === 0) {
    return err(new Error('No table found in schema file'));
  }

  const table = schema.tables[0];

  // Cache the table if cache is available
  if (cache) {
    await cache.setTable(tableBasePath, table);
  }

  return ok({
    schemaName,
    tableName,
    indexes: table.indexes,
  });
};
