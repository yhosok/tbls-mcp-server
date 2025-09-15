import { Result, ok, err } from 'neverthrow';
import { join } from 'path';
import * as path from 'path';
import { SchemaTablesResource, TableInfoResource } from '../schemas/database';
import { parseTableReferences, parseSingleTableFile, resolveSchemaSource } from '../parsers/schema-adapter';
import { ResourceCache } from '../cache/resource-cache';

/**
 * Handles the schema://{schema_name}/tables MCP resource
 * Returns a list of all tables in a specific schema
 *
 * @param schemaSource - Path to schema file or directory containing tbls schema files
 * @param schemaName - Name of the schema to get tables for
 * @param cache - Optional cache instance for performance optimization
 * @returns Result containing schema tables resource or error
 */
export const handleSchemaTablesResource = async (
  schemaSource: string,
  schemaName: string,
  cache?: ResourceCache
): Promise<Result<SchemaTablesResource, Error>> => {
  // Resolve the schema source
  const resolveResult = resolveSchemaSource(schemaSource);
  if (resolveResult.isErr()) {
    return err(resolveResult.error);
  }

  const { type: sourceType, path: schemaPath } = resolveResult.value;

  // Determine the path to the schema directory/file
  let targetPath: string;
  if (sourceType === 'file') {
    // Single file - use the directory containing the file
    targetPath = path.dirname(schemaPath);
  } else {
    // Directory - determine subdirectory for multi-schema setup
    if (schemaName === 'default') {
      targetPath = schemaPath;
    } else {
      targetPath = join(schemaPath, schemaName);
    }
  }

  // Try to get cached table references first
  if (cache) {
    const cachedTableRefs = await cache.getTableReferences(targetPath);
    if (cachedTableRefs) {
      return ok({
        schemaName,
        tables: cachedTableRefs
      });
    }
  }

  // Parse table references using the schema adapter
  const tableRefsResult = parseTableReferences(targetPath);
  if (tableRefsResult.isErr()) {
    return err(tableRefsResult.error);
  }

  const tables = tableRefsResult.value;

  // Cache the table references if cache is available
  if (cache) {
    await cache.setTableReferences(targetPath, tables);
  }

  return ok({
    schemaName,
    tables
  });
};

/**
 * Handles the table://{schema_name}/{table_name} MCP resource
 * Returns detailed information about a specific table
 *
 * @param schemaSource - Path to schema file or directory containing tbls schema files
 * @param schemaName - Name of the schema containing the table
 * @param tableName - Name of the table to get info for
 * @param cache - Optional cache instance for performance optimization
 * @returns Result containing table info resource or error
 */
export const handleTableInfoResource = async (
  schemaSource: string,
  schemaName: string,
  tableName: string,
  cache?: ResourceCache
): Promise<Result<TableInfoResource, Error>> => {
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
        table: cachedTable
      });
    }
  }

  // Parse the table file using schema adapter (JSON format)
  const parseResult = parseSingleTableFile(tableBasePath);
  if (parseResult.isErr()) {
    return err(new Error(`Failed to parse table: ${parseResult.error.message}`));
  }

  const schema = parseResult.value;
  if (schema.tables.length === 0) {
    return err(new Error('No table found in schema file'));
  }

  const table = schema.tables[0];

  // Cache the individual table if cache is available
  if (cache) {
    await cache.setTable(tableBasePath, table);
  }

  return ok({
    schemaName,
    table
  });
};