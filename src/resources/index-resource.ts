import { Result, ok, err } from 'neverthrow';
import { promises as fs } from 'fs';
import { join } from 'path';
import { TableIndexesResource } from '../schemas/database';
import { parseSingleTableMarkdown } from '../parsers/markdown-parser';
import { safeExecuteAsync, fromPromise } from '../utils/result';

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
  // Determine the path to the table markdown file
  let tablePath: string;
  if (schemaName === 'default') {
    // Single schema setup - table files in root
    tablePath = join(schemaDir, `${tableName}.md`);
  } else {
    // Multi-schema setup - table files in subdirectory
    tablePath = join(schemaDir, schemaName, `${tableName}.md`);
  }

  // Check if table file exists
  const fileExistsResult = await safeExecuteAsync(
    async () => {
      await fs.access(tablePath);
      return true;
    },
    'Table file not found'
  );

  if (fileExistsResult.isErr()) {
    return err(fileExistsResult.error);
  }

  // Read the table markdown file
  const readFileResult = await fromPromise(
    fs.readFile(tablePath, 'utf8'),
    'Failed to read table file'
  );

  if (readFileResult.isErr()) {
    return err(readFileResult.error);
  }

  const content = readFileResult.value;

  // Parse the table markdown content
  const parseResult = parseSingleTableMarkdown(content);
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