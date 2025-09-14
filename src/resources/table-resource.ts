import { Result, ok, err } from 'neverthrow';
import { promises as fs } from 'fs';
import { join } from 'path';
import { SchemaTablesResource, TableInfoResource } from '../schemas/database';
import { parseTableReferences, parseSingleTableMarkdown } from '../parsers/markdown-parser';
import { safeExecuteAsync, fromPromise } from '../utils/result';

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
  // Determine the path to the README.md file
  let readmePath: string;
  if (schemaName === 'default') {
    // Single schema setup - README.md in root
    readmePath = join(schemaDir, 'README.md');
  } else {
    // Multi-schema setup - README.md in subdirectory
    readmePath = join(schemaDir, schemaName, 'README.md');
  }

  // Check if README.md exists
  const fileExistsResult = await safeExecuteAsync(
    async () => {
      await fs.access(readmePath);
      return true;
    },
    'Schema directory or README.md not found'
  );

  if (fileExistsResult.isErr()) {
    return err(fileExistsResult.error);
  }

  // Read the README.md file
  const readFileResult = await fromPromise(
    fs.readFile(readmePath, 'utf8'),
    'Failed to read README.md file'
  );

  if (readFileResult.isErr()) {
    return err(readFileResult.error);
  }

  const content = readFileResult.value;

  // Parse table references from the content
  const tableRefsResult = parseTableReferences(content);
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
    table
  });
};