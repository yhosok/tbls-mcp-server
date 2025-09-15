import { readFileSync } from 'fs';
import { Result, ok, err } from 'neverthrow';
import {
  DatabaseColumn,
  DatabaseIndex,
  DatabaseRelation,
  DatabaseTable,
  DatabaseSchema,
  SchemaMetadata,
  TableReference,
  validateSchemaData,
} from '../schemas/database';
import {
  safeExecute,
  validateNotEmpty,
  validateNotEmptyArray,
  createError,
} from '../utils/result';

// Types for tbls JSON structure

// Types removed - using UnknownJsonObject for flexibility

type UnknownJsonObject = Record<string, unknown>;

/**
 * Parses a tbls JSON schema file and returns a complete database schema
 * @param filePath - Path to the JSON file
 * @returns Result containing parsed database schema or error
 */
export const parseJsonFile = (
  filePath: string
): Result<DatabaseSchema, Error> => {
  return safeExecute(
    () => readFileSync(filePath, 'utf-8'),
    'Failed to read file'
  ).andThen((content) => parseJsonContent(content));
};

/**
 * Parses JSON content string and returns a database schema
 * @param content - JSON content string
 * @returns Result containing parsed database schema or error
 */
export const parseJsonContent = (
  content: string
): Result<DatabaseSchema, Error> => {
  // Validate content is not empty
  const trimmedContent = content.trim();
  if (trimmedContent.length === 0) {
    return createError('JSON content is empty');
  }

  // Parse JSON safely
  return safeExecute(
    () => JSON.parse(trimmedContent),
    'Failed to parse JSON'
  ).andThen((data) => {
    if (data === null) {
      return createError('Parsed JSON is null');
    }
    return parseJsonSchema(data);
  });
};

/**
 * Parses tbls JSON schema data and returns a database schema
 * @param schemaData - Parsed JSON schema data
 * @returns Result containing parsed database schema or error
 */
export const parseJsonSchema = (
  schemaData: unknown
): Result<DatabaseSchema, Error> => {
  if (!schemaData || typeof schemaData !== 'object') {
    return createError('Schema data must be an object');
  }

  const schemaObj = schemaData as UnknownJsonObject;

  // Validate tables array exists
  if (!Array.isArray(schemaObj.tables)) {
    return createError('Schema must contain a tables array');
  }

  // Allow empty tables array for schemas with no tables

  // Parse metadata
  const metadata: SchemaMetadata = {
    name:
      (typeof schemaObj.name === 'string' ? schemaObj.name : null) ||
      'database_schema',
    description:
      (typeof schemaObj.desc === 'string' ? schemaObj.desc : null) || null,
    tableCount: schemaObj.tables.length,
    generated: null,
  };

  // Parse all tables
  const tableResults = schemaObj.tables.map((tableData: unknown) =>
    parseTableFromJson(tableData)
  );

  // Combine table results
  const tablesResult = combineTableResults(tableResults);
  if (tablesResult.isErr()) {
    return err(tablesResult.error);
  }

  const tables = tablesResult.value;

  // Parse relations if they exist and map them to tables
  if (Array.isArray(schemaObj.relations)) {
    const relationsResult = parseRelationsFromJson(schemaObj.relations, tables);
    if (relationsResult.isErr()) {
      return err(relationsResult.error);
    }
  }

  // Create table references
  const tableReferences: TableReference[] = tables.map((table) => ({
    name: table.name,
    comment: table.comment || null,
    columnCount: table.columns.length,
  }));

  const schema: DatabaseSchema = {
    metadata,
    tables,
    tableReferences,
  };

  // Validate final schema
  const validationResult = validateSchemaData(schema);
  return validationResult.mapErr((error) => new Error(error));
};

/**
 * Parses a single table from tbls JSON format
 * @param tableData - Table data from tbls JSON
 * @returns Result containing parsed database table or error
 */
const parseTableFromJson = (
  tableData: unknown
): Result<DatabaseTable, Error> => {
  if (!tableData || typeof tableData !== 'object') {
    return createError('Table data must be an object');
  }

  const table = tableData as UnknownJsonObject;

  // Validate required fields
  const nameResult = validateNotEmpty(
    table.name as string,
    'Table name is required'
  );
  if (nameResult.isErr()) {
    return err(nameResult.error);
  }
  const name = nameResult.value;

  if (!Array.isArray(table.columns)) {
    return createError('Table must have a columns array');
  }

  if (table.columns.length === 0) {
    return createError('Table must have at least one column');
  }

  // Parse columns
  const columnResults = table.columns.map((columnData: unknown) =>
    parseColumnFromJson(columnData)
  );
  const columnsResult = combineColumnResults(columnResults);
  if (columnsResult.isErr()) {
    return err(columnsResult.error);
  }
  const columns = columnsResult.value;

  // Parse indexes (optional)
  let indexes: DatabaseIndex[] = [];
  if (Array.isArray(table.indexes)) {
    const indexResults = table.indexes.map((indexData: unknown) =>
      parseIndexFromJson(indexData)
    );
    const indexesResult = combineIndexResults(indexResults);
    if (indexesResult.isErr()) {
      return err(indexesResult.error);
    }
    indexes = indexesResult.value;
  }

  // Parse relations (optional)
  let relations: DatabaseRelation[] = [];
  if (Array.isArray(table.relations)) {
    const relationResults = table.relations.map((relationData: unknown) =>
      parseTableRelationFromJson(relationData)
    );
    const relationsResult = combineRelationResults(relationResults);
    if (relationsResult.isErr()) {
      return err(relationsResult.error);
    }
    relations = relationsResult.value;
  }

  const databaseTable: DatabaseTable = {
    name,
    comment: (typeof table.comment === 'string' ? table.comment : null) || null,
    columns,
    indexes,
    relations,
  };

  return ok(databaseTable);
};

/**
 * Parses a column from tbls JSON format
 * @param columnData - Column data from tbls JSON
 * @returns Result containing parsed database column or error
 */
const parseColumnFromJson = (
  columnData: unknown
): Result<DatabaseColumn, Error> => {
  if (!columnData || typeof columnData !== 'object') {
    return createError('Column data must be an object');
  }

  const column = columnData as UnknownJsonObject;

  // Validate required fields
  const nameResult = validateNotEmpty(
    column.name as string,
    'Column name is required'
  );
  if (nameResult.isErr()) {
    return err(nameResult.error);
  }
  const name = nameResult.value;

  const typeResult = validateNotEmpty(
    column.type as string,
    'Column type is required'
  );
  if (typeResult.isErr()) {
    return err(typeResult.error);
  }
  const type = typeResult.value;

  // Parse nullable (default to true if not specified)
  const nullable = column.nullable !== false;

  // Parse default value
  let defaultValue: string | null = null;
  if (column.default !== undefined) {
    defaultValue = column.default === null ? null : String(column.default);
  }

  // Parse auto increment
  const isAutoIncrement =
    typeof column.extra_def === 'string' &&
    column.extra_def.toLowerCase().includes('auto_increment');

  // Parse primary key from indexes or extra_def
  const isPrimaryKey =
    isAutoIncrement ||
    (typeof column.extra_def === 'string' &&
      column.extra_def.toLowerCase().includes('primary key'));

  // Extract length/precision information from type
  let maxLength: number | null = null;
  let precision: number | null = null;
  let scale: number | null = null;

  const precisionMatch = type.match(/\((\d+),\s*(\d+)\)/);
  const lengthMatch = type.match(/\((\d+)\)/);

  if (precisionMatch) {
    precision = parseInt(precisionMatch[1], 10);
    scale = parseInt(precisionMatch[2], 10);
  } else if (
    lengthMatch &&
    (type.includes('varchar') || type.includes('char'))
  ) {
    maxLength = parseInt(lengthMatch[1], 10);
  }

  const databaseColumn: DatabaseColumn = {
    name,
    type,
    nullable,
    defaultValue,
    comment:
      (typeof column.comment === 'string' ? column.comment : null) || null,
    isPrimaryKey,
    isAutoIncrement,
    maxLength,
    precision,
    scale,
  };

  return ok(databaseColumn);
};

/**
 * Parses an index from tbls JSON format
 * @param indexData - Index data from tbls JSON
 * @returns Result containing parsed database index or error
 */
const parseIndexFromJson = (
  indexData: unknown
): Result<DatabaseIndex, Error> => {
  if (!indexData || typeof indexData !== 'object') {
    return createError('Index data must be an object');
  }

  const index = indexData as UnknownJsonObject;

  // Validate required fields
  const nameResult = validateNotEmpty(
    index.name as string,
    'Index name is required'
  );
  if (nameResult.isErr()) {
    return err(nameResult.error);
  }
  const name = nameResult.value;

  if (!Array.isArray(index.columns)) {
    return createError('Index must have a columns array');
  }

  const columnsResult = validateNotEmptyArray(
    index.columns,
    'Index must have at least one column'
  );
  if (columnsResult.isErr()) {
    return err(columnsResult.error);
  }
  const columns = columnsResult.value as string[];

  // Parse index properties from definition
  const definition = (typeof index.def === 'string' ? index.def : '') || '';
  const isPrimary = definition.toLowerCase().includes('primary key');
  const isUnique = definition.toLowerCase().includes('unique') || isPrimary;

  // Extract type from definition
  let type: string | undefined;
  if (isPrimary) {
    type = 'PRIMARY KEY';
  } else if (definition.toLowerCase().includes('unique')) {
    type = 'UNIQUE';
  } else if (definition.toLowerCase().includes('key ')) {
    type = 'KEY';
  } else {
    type = definition || 'INDEX';
  }

  const databaseIndex: DatabaseIndex = {
    name,
    columns,
    isPrimary,
    isUnique,
    type,
    comment: (typeof index.comment === 'string' ? index.comment : null) || null,
  };

  return ok(databaseIndex);
};

/**
 * Parses a table-level relation from tbls JSON format (different structure than schema-level relations)
 * @param relationData - Relation data from table in tbls JSON
 * @returns Result containing parsed database relation or error
 */
const parseTableRelationFromJson = (
  relationData: unknown
): Result<DatabaseRelation, Error> => {
  if (!relationData || typeof relationData !== 'object') {
    return createError('Table relation data must be an object');
  }

  const relation = relationData as UnknownJsonObject;

  // Support both parentTable and parent_table formats
  const parentTable = (relation.parentTable || relation.parent_table) as string;
  const parentColumns = (relation.parentColumns ||
    relation.parent_columns) as string[];
  const columns = relation.columns as string[];
  const table = relation.table as string;

  if (!parentTable || !table) {
    return createError(
      'Table relation must have table and parentTable/parent_table'
    );
  }

  if (!Array.isArray(columns) || !Array.isArray(parentColumns)) {
    return createError(
      'Table relation must have columns and parentColumns/parent_columns arrays'
    );
  }

  if (columns.length !== parentColumns.length) {
    return createError(
      'Table relation columns count mismatch between child and parent columns'
    );
  }

  if (columns.length === 0) {
    return createError('Table relation must have at least one column');
  }

  // Create belongsTo relation for the table
  const databaseRelation: DatabaseRelation = {
    type: 'belongsTo',
    table: table,
    columns: columns,
    referencedTable: parentTable,
    referencedColumns: parentColumns,
  };

  return ok(databaseRelation);
};

/**
 * Parses relations from tbls JSON format and maps them to tables
 * @param relationsData - Relations array from tbls JSON
 * @param tables - Array of parsed tables to update with relations
 * @returns Result indicating success or error
 */
const parseRelationsFromJson = (
  relationsData: unknown[],
  tables: DatabaseTable[]
): Result<void, Error> => {
  if (!Array.isArray(relationsData)) {
    return createError('Relations must be an array');
  }

  for (const relationData of relationsData) {
    const relationResult = parseRelationFromJson(relationData, tables);
    if (relationResult.isErr()) {
      return relationResult;
    }
  }

  return ok(undefined);
};

/**
 * Parses a single relation from tbls JSON format and adds it to appropriate tables
 * @param relationData - Single relation data from tbls JSON
 * @param tables - Array of tables to update with relation
 * @returns Result indicating success or error
 */
const parseRelationFromJson = (
  relationData: unknown,
  tables: DatabaseTable[]
): Result<void, Error> => {
  if (!relationData || typeof relationData !== 'object') {
    return createError('Relation data must be an object');
  }

  const relation = relationData as UnknownJsonObject;

  // Validate required fields
  const table = relation.table as string;
  const parentTable = relation.parent_table as string;

  if (!table || !parentTable) {
    return createError('Relation must have table and parent_table');
  }

  if (
    !Array.isArray(relation.columns) ||
    !Array.isArray(relation.parent_columns)
  ) {
    return createError('Relation must have columns and parent_columns arrays');
  }

  if (relation.columns.length !== relation.parent_columns.length) {
    return createError(
      'Relation columns count mismatch between child and parent columns'
    );
  }

  if (relation.columns.length === 0) {
    return createError('Relation must have at least one column');
  }

  // Find the child and parent tables
  const childTable = tables.find((t) => t.name === table);
  const parentTableRef = tables.find((t) => t.name === parentTable);

  if (!childTable) {
    return createError(`Child table '${table}' not found in schema`);
  }

  if (!parentTableRef) {
    return createError(`Parent table '${parentTable}' not found in schema`);
  }

  // Create belongsTo relation for child table
  const childRelation: DatabaseRelation = {
    type: 'belongsTo',
    table: table,
    columns: relation.columns as string[],
    referencedTable: parentTable,
    referencedColumns: relation.parent_columns as string[],
  };

  // Create hasMany relation for parent table
  const parentRelation: DatabaseRelation = {
    type: 'hasMany',
    table: table,
    columns: relation.columns as string[],
    referencedTable: parentTable,
    referencedColumns: relation.parent_columns as string[],
  };

  // Add relations to respective tables
  childTable.relations.push(childRelation);
  parentTableRef.relations.push(parentRelation);

  return ok(undefined);
};

/**
 * Combines multiple table parse results into a single result
 * @param tableResults - Array of table parse results
 * @returns Result containing array of tables or first error
 */
const combineTableResults = (
  tableResults: Result<DatabaseTable, Error>[]
): Result<DatabaseTable[], Error> => {
  const tables: DatabaseTable[] = [];

  for (const result of tableResults) {
    if (result.isErr()) {
      return err(result.error);
    }
    tables.push(result.value);
  }

  return ok(tables);
};

/**
 * Combines multiple column parse results into a single result
 * @param columnResults - Array of column parse results
 * @returns Result containing array of columns or first error
 */
const combineColumnResults = (
  columnResults: Result<DatabaseColumn, Error>[]
): Result<DatabaseColumn[], Error> => {
  const columns: DatabaseColumn[] = [];

  for (const result of columnResults) {
    if (result.isErr()) {
      return err(result.error);
    }
    columns.push(result.value);
  }

  return ok(columns);
};

/**
 * Combines multiple index parse results into a single result
 * @param indexResults - Array of index parse results
 * @returns Result containing array of indexes or first error
 */
const combineIndexResults = (
  indexResults: Result<DatabaseIndex, Error>[]
): Result<DatabaseIndex[], Error> => {
  const indexes: DatabaseIndex[] = [];

  for (const result of indexResults) {
    if (result.isErr()) {
      return err(result.error);
    }
    indexes.push(result.value);
  }

  return ok(indexes);
};

/**
 * Combines multiple relation parse results into a single result
 * @param relationResults - Array of relation parse results
 * @returns Result containing array of relations or first error
 */
const combineRelationResults = (
  relationResults: Result<DatabaseRelation, Error>[]
): Result<DatabaseRelation[], Error> => {
  const relations: DatabaseRelation[] = [];

  for (const result of relationResults) {
    if (result.isErr()) {
      return err(result.error);
    }
    relations.push(result.value);
  }

  return ok(relations);
};
