import { Result, ok, err } from 'neverthrow';
import * as path from 'path';
import { existsSync } from 'fs';
import { SchemaTablesResource, TableInfoResource, TableReference } from '../schemas/database';
import {
  parseTableReferences,
  parseSingleTableFile,
  resolveSchemaName,
  createSchemaParser,
} from '../parsers/schema-adapter';
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
  // Resolve schema name with backward compatibility support
  const schemaResolveResult = resolveSchemaName(
    schemaSource,
    schemaName,
    cache
  );
  if (schemaResolveResult.isErr()) {
    return err(schemaResolveResult.error);
  }

  const { resolvedSchemaName, schemaPath, sourceType } =
    schemaResolveResult.value;

  // Determine the target path for parsing table references
  let targetPath: string;
  if (sourceType === 'file') {
    // Single file - use the schema file directly for parsing
    targetPath = schemaPath;
  } else {
    // Directory - use the appropriate subdirectory or root
    if (
      schemaName === 'default' &&
      existsSync(path.join(path.dirname(schemaPath), 'schema.json'))
    ) {
      // Single schema setup in directory root
      targetPath = path.dirname(schemaPath);
    } else {
      // Multi-schema setup or named schema
      targetPath = path.dirname(schemaPath);
    }
  }

  // Try to get cached table references first
  if (cache) {
    const cachedTableRefs = await cache.getTableReferences(targetPath);
    if (cachedTableRefs) {
      return ok({
        schemaName: resolvedSchemaName,
        tables: cachedTableRefs,
      });
    }
  }

  // Parse table references using the schema adapter
  let tableRefsResult: Result<TableReference[], Error>;

  // Check if we need to parse a specific schema from a multi-schema file
  if (sourceType === 'file') {
    // For file sources, we might need to extract a specific schema
    try {
      const parser = createSchemaParser(schemaPath);
      if (parser.isOk() && resolvedSchemaName !== 'default') {
        // Try to parse the specific schema by name
        const schemaResult = parser.value.parseSchemaByName(schemaPath, resolvedSchemaName);
        if (schemaResult.isOk()) {
          tableRefsResult = ok(schemaResult.value.tableReferences);
        } else {
          // Fall back to parsing all and filtering (for backward compatibility)
          tableRefsResult = parseTableReferences(targetPath);
        }
      } else {
        // Use default parsing for 'default' schema or fallback
        tableRefsResult = parseTableReferences(targetPath);
      }
    } catch {
      // Fall back to regular parsing
      tableRefsResult = parseTableReferences(targetPath);
    }
  } else {
    // Directory source - use regular parsing
    tableRefsResult = parseTableReferences(targetPath);
  }

  if (tableRefsResult.isErr()) {
    return err(tableRefsResult.error);
  }

  const tables = tableRefsResult.value;

  // Cache the table references if cache is available
  if (cache) {
    await cache.setTableReferences(targetPath, tables);
  }

  return ok({
    schemaName: resolvedSchemaName,
    tables,
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
  // Resolve schema name with backward compatibility support
  const schemaResolveResult = resolveSchemaName(
    schemaSource,
    schemaName,
    cache
  );
  if (schemaResolveResult.isErr()) {
    return err(schemaResolveResult.error);
  }

  const { resolvedSchemaName, schemaPath, sourceType } =
    schemaResolveResult.value;

  // Determine the path to the schema.json file
  let schemaJsonPath: string;

  if (sourceType === 'file') {
    // Single schema.json file - use directly
    schemaJsonPath = schemaPath;
  } else {
    // Directory - use the resolved schema path
    schemaJsonPath = schemaPath;

    // Verify schema.json exists in directory
    if (!existsSync(schemaJsonPath)) {
      return err(
        new Error(
          `Schema file not found: ${schemaJsonPath}. Only JSON schema files are supported.`
        )
      );
    }
  }

  // Try to get cached table first using table-specific cache key
  if (cache) {
    const cachedTable = await cache.getTableByName(schemaJsonPath, tableName);
    if (cachedTable) {
      return ok({
        schemaName: resolvedSchemaName,
        table: cachedTable,
      });
    }
  }

  // Parse the table from the schema.json file
  const parseResult = parseSingleTableFile(schemaJsonPath, tableName, cache);

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

  // Cache the individual table using table-specific cache key if cache is available
  if (cache) {
    await cache.setTableByName(schemaJsonPath, tableName, table);
  }

  return ok({
    schemaName: resolvedSchemaName,
    table,
  });
};
