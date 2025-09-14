import { Result, ok, err } from 'neverthrow';
import { join } from 'path';
import { TableIndexesResource } from '../schemas/database';
import { parseSingleTableFile } from '../parsers/schema-adapter';

/**
 * Handles the table://{schema_name}/{table_name}/indexes MCP resource
 * Returns index information for a specific table
 *
 * @param schemaDir - Directory containing tbls schema files
 * @param schemaName - Name of the schema containing the table
 * @param tableName - Name of the table to get indexes for
 * @returns Result containing table indexes resource or error
 */
export const handleTableIndexesResource = async (
  schemaDir: string,
  schemaName: string,
  tableName: string
): Promise<Result<TableIndexesResource, Error>> => {
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
    tableName,
    indexes: table.indexes
  });
};