import { Result, ok, err } from 'neverthrow';
import * as path from 'path';
import { existsSync } from 'fs';
import {
  SchemaTablesResource,
  TableInfoResource,
  TableReference,
} from '../schemas/database';
import {
  parseTableReferences,
  resolveSchemaName,
  createSchemaParser,
} from '../parsers/schema-adapter';
import { ResourceCache } from '../cache/resource-cache';
import {
  handleTableResource,
  ResourceResolutionConfig,
} from '../utils/resource-handlers';

/**
 * Handles the db://schemas/{schema_name}/tables MCP resource
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
  // Resolve schema name
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
        const schemaResult = parser.value.parseSchemaByName(
          schemaPath,
          resolvedSchemaName
        );
        if (schemaResult.isOk()) {
          tableRefsResult = ok(schemaResult.value.tableReferences);
        } else {
          // Fall back to parsing all and filtering
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
 * Handles the db://schemas/{schema_name}/tables/{table_name} MCP resource
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
  // Configuration for schema name resolution with byName caching
  const config: ResourceResolutionConfig = {
    useSchemaNameResolution: true, // Use advanced schema name resolution
    cacheStrategy: 'byName', // Use modern getTableByName/setTableByName cache methods
  };

  // Use generic resource handler with full table extraction function
  return handleTableResource(
    schemaSource,
    schemaName,
    tableName,
    config,
    cache,
    (table, resolvedSchemaName) => ({
      schemaName: resolvedSchemaName,
      table,
    })
  );
};
