import { Result, ok, err } from 'neverthrow';
import { join } from 'path';
import { SchemaTablesResource, TableInfoResource } from '../schemas/database';
import { parseTableReferences, parseSingleTableFile } from '../parsers/schema-adapter';

/**
 * Handles the schema://{schema_name}/tables MCP resource
 * Returns a list of all tables in a specific schema
 *
 * @param schemaDir - Directory containing tbls schema files
 * @param schemaName - Name of the schema to get tables for
 * @returns Result containing schema tables resource or error
 */
export const handleSchemaTablesResource = async (
  schemaDir: string,
  schemaName: string
): Promise<Result<SchemaTablesResource, Error>> => {
  // Determine the path to the schema directory
  let schemaPath: string;
  if (schemaName === 'default') {
    // Single schema setup - schema file in root
    schemaPath = schemaDir;
  } else {
    // Multi-schema setup - schema file in subdirectory
    schemaPath = join(schemaDir, schemaName);
  }

  // Parse table references using the schema adapter
  const tableRefsResult = parseTableReferences(schemaPath);
  if (tableRefsResult.isErr()) {
    return err(tableRefsResult.error);
  }

  const tables = tableRefsResult.value;

  return ok({
    schemaName,
    tables
  });
};

/**
 * Handles the table://{schema_name}/{table_name} MCP resource
 * Returns detailed information about a specific table
 *
 * @param schemaDir - Directory containing tbls schema files
 * @param schemaName - Name of the schema containing the table
 * @param tableName - Name of the table to get info for
 * @returns Result containing table info resource or error
 */
export const handleTableInfoResource = async (
  schemaDir: string,
  schemaName: string,
  tableName: string
): Promise<Result<TableInfoResource, Error>> => {
  // Determine the path to the table file (supports both .md and .json)
  let tableBasePath: string;
  if (schemaName === 'default') {
    // Single schema setup - table files in root
    tableBasePath = join(schemaDir, tableName);
  } else {
    // Multi-schema setup - table files in subdirectory
    tableBasePath = join(schemaDir, schemaName, tableName);
  }

  // Parse the table file using schema adapter (handles both JSON and Markdown)
  const parseResult = parseSingleTableFile(tableBasePath);
  if (parseResult.isErr()) {
    return err(new Error(`Failed to parse table: ${parseResult.error.message}`));
  }

  const schema = parseResult.value;
  if (schema.tables.length === 0) {
    return err(new Error('No table found in markdown file'));
  }

  const table = schema.tables[0];

  return ok({
    schemaName,
    table
  });
};