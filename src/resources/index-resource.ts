import { Result } from 'neverthrow';
import { TableIndexesResource } from '../schemas/database';
import { ResourceCache } from '../cache/resource-cache';
import {
  handleTableResource,
  ResourceResolutionConfig,
} from '../utils/resource-handlers';

/**
 * Handles the db://schemas/{schema_name}/tables/{table_name}/indexes MCP resource
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
  // Configuration for basic schema source resolution with legacy caching
  const config: ResourceResolutionConfig = {
    useSchemaNameResolution: false, // Use basic schema source resolution
    cacheStrategy: 'legacy', // Use deprecated getTable/setTable cache methods
  };

  // Use generic resource handler with index extraction function
  return handleTableResource(
    schemaSource,
    schemaName,
    tableName,
    config,
    cache,
    (table, resolvedSchemaName) => ({
      schemaName: resolvedSchemaName,
      tableName,
      indexes: table.indexes,
    })
  );
};
