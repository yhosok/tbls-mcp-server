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
  validateTableData,
  validateSchemaData,
} from '../schemas/database';
import {
  safeExecute,
  validateNotEmptyArray,
  createError,
} from '../utils/result';

/**
 * Parses a tbls markdown file and returns a complete database schema
 * @param filePath - Path to the markdown file
 * @returns Result containing parsed database schema or error
 */
export const parseMarkdownFile = (filePath: string): Result<DatabaseSchema, Error> => {
  return safeExecute(() => readFileSync(filePath, 'utf-8'), 'Failed to read file')
    .andThen(content => parseMarkdownContent(content));
};

/**
 * Parses markdown content and returns a database schema
 * @param content - Markdown content string
 * @returns Result containing parsed database schema or error
 */
export const parseMarkdownContent = (content: string): Result<DatabaseSchema, Error> => {

  // Check if this is a schema overview or single table file
  const isSchemaOverview = content.includes('# Database Schema:') || content.includes('## Tables');

  if (isSchemaOverview) {
    return parseFullSchemaMarkdown(content);
  } else {
    return parseSingleTableMarkdown(content);
  }
};

/**
 * Parses a full schema markdown with overview and multiple tables
 * @param content - Full schema markdown content
 * @returns Result containing complete database schema
 */
const parseFullSchemaMarkdown = (content: string): Result<DatabaseSchema, Error> => {
  // Split content into sections
  const sections = content.split(/^---\s*$/m);
  const overviewSection = sections[0] || '';
  const tableSections = sections.slice(1);

  return parseSchemaOverview(overviewSection)
    .andThen(metadata => {
      // Parse table references from overview
      const tableReferencesResult = parseTableReferences(overviewSection);

      // Parse individual tables
      const tableResults = tableSections
        .filter(section => section.trim().length > 0)
        .map(section => parseTableMarkdown(section));

      // Combine all table results
      const tablesResult = combineTableResults(tableResults);

      return tablesResult.andThen(tables => {
        const tableRefs = tableReferencesResult.unwrapOr([]);
        const schema = {
          metadata,
          tables,
          tableReferences: tableRefs,
        };

        const validationResult = validateSchemaData(schema);
        return validationResult.mapErr(error => new Error(error));
      });
    });
};

/**
 * Parses a single table markdown file
 * @param content - Single table markdown content
 * @returns Result containing database schema with one table
 */
export const parseSingleTableMarkdown = (content: string): Result<DatabaseSchema, Error> => {
  return parseTableMarkdown(content)
    .andThen(table => {
      const metadata: SchemaMetadata = {
        name: table.name,
        tableCount: 1,
        generated: null,
        description: table.comment,
      };

      const schema = {
        metadata,
        tables: [table],
        tableReferences: [],
      };

      const validationResult = validateSchemaData(schema);
      return validationResult.mapErr(error => new Error(error));
    });
};

/**
 * Parses schema overview section to extract metadata
 * @param content - Overview section content
 * @returns Result containing schema metadata
 */
export const parseSchemaOverview = (content: string): Result<SchemaMetadata, Error> => {
  const lines = content.split('\n');

  // Extract schema name from title
  const titleLine = lines.find(line => line.startsWith('# Database Schema:'));
  const nameMatch = titleLine?.match(/# Database Schema:\s*(.+)$/);
  const name = nameMatch?.[1]?.trim();

  if (!name) {
    return createError('Schema name not found in title');
  }

  // Extract description (lines between title and first ## or metadata)
  let description: string | null = null;
  const titleIndex = lines.findIndex(line => line.startsWith('# Database Schema:'));
  if (titleIndex !== -1) {
    const descriptionLines: string[] = [];
    for (let i = titleIndex + 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('##') || line.startsWith('Generated on:') || line.startsWith('Tables:')) {
        break;
      }
      if (line.length > 0) {
        descriptionLines.push(line);
      }
    }
    description = descriptionLines.length > 0 ? descriptionLines.join(' ').trim() : null;
  }

  // Extract generated timestamp
  const generatedLine = lines.find(line => line.startsWith('Generated on:'));
  const generatedMatch = generatedLine?.match(/Generated on:\s*(.+)$/);
  const generatedRaw = generatedMatch?.[1]?.trim();

  // Try to convert to ISO format if it looks like a date
  let generated: string | null = null;
  if (generatedRaw) {
    try {
      // If it's already ISO format, use as-is
      if (generatedRaw.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)) {
        generated = generatedRaw;
      } else {
        // Try to parse common formats and convert to ISO
        const date = new Date(generatedRaw);
        if (!isNaN(date.getTime())) {
          generated = date.toISOString();
        } else {
          // Keep as string if conversion fails - schema will validate
          generated = generatedRaw;
        }
      }
    } catch {
      generated = generatedRaw; // Keep original if parsing fails
    }
  }

  // Extract table count
  const tableCountLine = lines.find(line => line.startsWith('Tables:'));
  const tableCountMatch = tableCountLine?.match(/Tables:\s*(\d+)/);
  const tableCount = tableCountMatch ? parseInt(tableCountMatch[1], 10) : null;

  return ok({
    name,
    tableCount,
    generated,
    description,
  });
};

/**
 * Parses table references from overview section
 * @param content - Overview section content
 * @returns Result containing table references
 */
export const parseTableReferences = (content: string): Result<TableReference[], Error> => {
  const tablesSection = extractSection(content, '## Tables');
  if (!tablesSection) {
    return ok([]); // No tables section found
  }

  return parseTableReferenceTable(tablesSection);
};

/**
 * Parses table reference table from tables section
 * @param content - Tables section content
 * @returns Result containing table references
 */
const parseTableReferenceTable = (content: string): Result<TableReference[], Error> => {
  // Find the table references table using a simpler approach
  const lines = content.split('\n');

  // Find header line
  const headerIndex = lines.findIndex(line =>
    line.includes('Name') && line.includes('Columns') && line.includes('Comment')
  );

  if (headerIndex === -1) {
    return ok([]); // No table references table found
  }

  // Find separator line (contains dashes)
  const separatorIndex = lines.findIndex((line, index) =>
    index > headerIndex && line.includes('----')
  );

  if (separatorIndex === -1) {
    return ok([]); // No valid table structure
  }

  // Get all rows after separator that look like table rows
  const tableRows = lines.slice(separatorIndex + 1)
    .filter(line => line.trim().length > 0 && line.includes('|'));
  const references: TableReference[] = [];

  for (const row of tableRows) {
    const columns = row.split('|').map(col => col.trim()).slice(1, -1); // Remove first and last empty cells
    if (columns.length >= 3) {
      const name = columns[0];
      const columnCountStr = columns[1];
      const comment = columns[2] || null;

      if (name && name !== '----') {
        const columnCount = columnCountStr && !isNaN(parseInt(columnCountStr, 10))
          ? parseInt(columnCountStr, 10)
          : null;

        references.push({
          name,
          comment: comment && comment.length > 0 ? comment : null,
          columnCount,
        });
      }
    }
  }

  return ok(references);
};

/**
 * Parses table markdown content and returns a database table
 * @param content - Table markdown content
 * @returns Result containing parsed database table
 */
export const parseTableMarkdown = (content: string): Result<DatabaseTable, Error> => {
  const lines = content.split('\n');

  // Extract table name from title (first # heading)
  const titleLine = lines.find(line => line.match(/^#\s+[^#]/));
  if (!titleLine) {
    return createError('Table name not found');
  }

  const nameMatch = titleLine.match(/^#\s+(.+)$/);
  const name = nameMatch?.[1]?.trim();

  if (!name) {
    return createError('Invalid table name');
  }

  // Extract table comment (description after title, before first ##)
  let comment: string | null = null;
  const titleIndex = lines.findIndex(line => line === titleLine);
  if (titleIndex !== -1) {
    const commentLines: string[] = [];
    for (let i = titleIndex + 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('##')) {
        break;
      }
      if (line.length > 0) {
        commentLines.push(line);
      }
    }
    comment = commentLines.length > 0 ? commentLines.join(' ').trim() : null;
  }

  // Parse sections
  const columnsSection = extractSection(content, '## Columns');
  const indexesSection = extractSection(content, '## Indexes');
  const relationsSection = extractSection(content, '## Relations');

  // Parse columns (required)
  if (!columnsSection) {
    return createError('Columns section not found');
  }

  return parseColumnsSection(columnsSection)
    .andThen(columns => {
      // Parse indexes (optional)
      const indexesResult = indexesSection
        ? parseIndexesSection(indexesSection)
        : ok([]);

      return indexesResult.andThen(indexes => {
        // Parse relations (optional)
        const relationsResult = relationsSection
          ? parseRelationsSection(relationsSection)
          : ok([]);

        return relationsResult.andThen(relations => {
          // Update relations to have the correct table name
          const updatedRelations = relations.map(relation => ({
            ...relation,
            table: name
          }));

          const table = {
            name,
            comment,
            columns,
            indexes,
            relations: updatedRelations,
          };

          const validationResult = validateTableData(table);
          return validationResult.mapErr(error => new Error(error));
        });
      });
    });
};

/**
 * Parses columns section and returns column definitions
 * @param content - Columns section content
 * @returns Result containing parsed columns
 */
export const parseColumnsSection = (content: string): Result<DatabaseColumn[], Error> => {
  // Find the columns table using a simpler approach
  const lines = content.split('\n');

  // Find header line
  const headerIndex = lines.findIndex(line =>
    line.includes('Name') && line.includes('Type') && line.includes('Comment')
  );

  if (headerIndex === -1) {
    return createError('No columns table found');
  }

  // Find separator line (contains dashes)
  const separatorIndex = lines.findIndex((line, index) =>
    index > headerIndex && line.includes('----')
  );

  if (separatorIndex === -1) {
    return createError('No table separator found');
  }

  // Get all rows after separator that look like table rows
  const tableRows = lines.slice(separatorIndex + 1)
    .filter(line => line.trim().length > 0 && line.includes('|'));
  const columns: DatabaseColumn[] = [];

  for (const row of tableRows) {
    const cells = row.split('|').map(cell => cell.trim()).slice(1, -1); // Remove first and last empty cells from | boundaries

    if (cells.length >= 7 && cells[0] !== '----') {
      const name = cells[0];
      const type = cells[1];
      const defaultValue = cells[2] && cells[2] !== '' ? cells[2] : null;
      const nullableCell = cells[3];
      const nullable = nullableCell !== 'false';
      const comment = cells[6] && cells[6] !== '' ? cells[6] : null;

      // Validate required fields
      if (!name || !type) {
        continue; // Skip invalid rows instead of returning error
      }

      // Parse additional information from type and other fields
      const isPrimaryKey = type.includes('auto_increment') || comment?.toLowerCase().includes('primary key') === true;
      const isAutoIncrement = type.includes('auto_increment');

      // Extract length/precision information
      let maxLength: number | null = null;
      let precision: number | null = null;
      let scale: number | null = null;

      const lengthMatch = type.match(/\((\d+)\)/);
      const precisionMatch = type.match(/\((\d+),\s*(\d+)\)/);

      if (precisionMatch) {
        precision = parseInt(precisionMatch[1], 10);
        scale = parseInt(precisionMatch[2], 10);
      } else if (lengthMatch && (type.includes('varchar') || type.includes('char'))) {
        maxLength = parseInt(lengthMatch[1], 10);
      }

      const column: DatabaseColumn = {
        name,
        type,
        nullable,
        defaultValue,
        comment,
        isPrimaryKey,
        isAutoIncrement,
        maxLength,
        precision,
        scale,
      };

      columns.push(column);
    }
  }

  return validateNotEmptyArray(columns, 'Table must have at least one column');
};

/**
 * Parses indexes section and returns index definitions
 * @param content - Indexes section content
 * @returns Result containing parsed indexes
 */
export const parseIndexesSection = (content: string): Result<DatabaseIndex[], Error> => {
  // Find the indexes table using a simpler approach
  const lines = content.split('\n');

  // Find header line
  const headerIndex = lines.findIndex(line =>
    line.includes('Name') && line.includes('Definition')
  );

  if (headerIndex === -1) {
    return ok([]); // No indexes section found
  }

  // Find separator line (contains dashes)
  const separatorIndex = lines.findIndex((line, index) =>
    index > headerIndex && line.includes('----')
  );

  if (separatorIndex === -1) {
    return ok([]); // No valid table structure
  }

  // Get all rows after separator that look like table rows
  const tableRows = lines.slice(separatorIndex + 1)
    .filter(line => line.trim().length > 0 && line.includes('|'));
  const indexes: DatabaseIndex[] = [];

  for (const row of tableRows) {
    const cells = row.split('|').map(cell => cell.trim()).slice(1, -1); // Remove first and last empty cells from | boundaries

    if (cells.length >= 2 && cells[0] !== '----') {
      const name = cells[0];
      const definition = cells[1];

      if (!name || !definition) {
        continue;
      }

      // Parse index definition to extract columns and properties
      const isPrimary = definition.includes('PRIMARY KEY');
      const isUnique = definition.includes('UNIQUE') || isPrimary; // Both UNIQUE and PRIMARY KEY are unique

      // Extract columns from definition
      const columnsMatch = definition.match(/\(([^)]+)\)/);
      if (!columnsMatch) {
        continue;
      }

      const columnsStr = columnsMatch[1];
      const columns = columnsStr.split(',').map(col => col.trim().replace(/`/g, '').replace(/\s+(ASC|DESC)/i, ''));

      // Extract index type from the beginning of definition
      let type: string | undefined;
      if (isPrimary) {
        type = 'PRIMARY KEY';
      } else if (definition.startsWith('UNIQUE')) {
        type = 'UNIQUE';
      } else if (definition.match(/^(BTREE|GIN|GIST|HASH)\s*\(/i)) {
        const typeMatch = definition.match(/^(\w+)\s*\(/i);
        type = typeMatch ? typeMatch[1].toUpperCase() : 'INDEX';
      } else {
        type = 'INDEX';
      }

      // Extract comment if present (third column in the table)
      const comment = cells.length >= 3 && cells[2] && cells[2].trim() !== '' ? cells[2] : null;

      const index: DatabaseIndex = {
        name,
        columns,
        isUnique,
        isPrimary,
        type,
        comment,
      };

      indexes.push(index);
    }
  }

  return ok(indexes);
};

/**
 * Parses relations section and returns relation definitions
 * @param content - Relations section content
 * @returns Result containing parsed relations
 */
export const parseRelationsSection = (content: string): Result<DatabaseRelation[], Error> => {
  const relations: DatabaseRelation[] = [];
  const lines = content.split('\n');

  // Check for tbls format first: Column | Cardinality | Related Table | Related Column(s) | Constraint
  const tblsHeaderIndex = lines.findIndex(line =>
    line.includes('Column') && line.includes('Cardinality') && line.includes('Related Table')
  );

  if (tblsHeaderIndex !== -1) {
    // Handle tbls format
    const separatorIndex = lines.findIndex((line, index) =>
      index > tblsHeaderIndex && line.includes('----')
    );

    if (separatorIndex !== -1) {
      const tableRows = lines.slice(separatorIndex + 1)
        .filter(line => line.trim().length > 0 && line.includes('|'));

      for (const row of tableRows) {
        const cells = row.split('|').map(cell => cell.trim()).slice(1, -1);

        if (cells.length >= 5 && cells[0] !== '----') {
          const columnStr = cells[0];
          const cardinalityStr = cells[1];
          const referencedTable = cells[2];
          const referencedColumnStr = cells[3];
          const constraintName = cells[4] || undefined;

          if (!columnStr || !referencedTable || !referencedColumnStr) {
            continue;
          }

          const columns = columnStr.split(',').map(col => col.trim());
          const referencedColumns = referencedColumnStr.split(',').map(col => col.trim());

          let relationType: 'belongsTo' | 'hasMany' | 'hasOne';
          switch (cardinalityStr.toLowerCase()) {
            case 'zero or one':
              relationType = 'belongsTo';
              break;
            case 'zero or more':
              relationType = 'hasMany';
              break;
            case 'one':
              relationType = 'hasOne';
              break;
            case 'one or more':
              relationType = 'hasMany';
              break;
            default:
              relationType = 'hasMany';
          }

          const relation: DatabaseRelation = {
            type: relationType,
            table: 'current_table', // Will be set by the calling function
            columns,
            referencedTable,
            referencedColumns,
            constraintName: constraintName && constraintName.trim() !== '' ? constraintName : undefined,
          };

          relations.push(relation);
        }
      }
    }
    return ok(relations);
  }

  // Handle legacy format with ### subsections
  const relationMatches = content.match(/###\s+([^\n]+)\s*\n([\s\S]*?)(?=###|$)/g);

  if (!relationMatches) {
    return ok([]); // No relations found
  }

  for (const relationMatch of relationMatches) {
    const lines = relationMatch.split('\n');
    const headerLine = lines[0];
    const tableNameMatch = headerLine.match(/###\s+(.+)$/);

    if (!tableNameMatch) {
      continue;
    }

    const tableName = tableNameMatch[1].trim();
    const sectionLines = relationMatch.split('\n');

    const headerIndex = sectionLines.findIndex(line =>
      line.includes('Column') && line.includes('Table') && line.includes('Parent Key') && line.includes('Type')
    );

    if (headerIndex === -1) {
      continue;
    }

    const separatorIndex = sectionLines.findIndex((line, index) =>
      index > headerIndex && line.includes('----')
    );

    if (separatorIndex === -1) {
      continue;
    }

    const tableRows = sectionLines.slice(separatorIndex + 1)
      .filter(line => line.trim().length > 0 && line.includes('|'));

    for (const row of tableRows) {
      const cells = row.split('|').map(cell => cell.trim()).slice(1, -1);

      if (cells.length >= 4 && cells[0] !== '----') {
        const columnStr = cells[0];
        const referencedTable = cells[1];
        const referencedColumnStr = cells[2];
        const relationTypeStr = cells[3];

        if (!columnStr || !referencedTable || !referencedColumnStr || !relationTypeStr) {
          continue;
        }

        const columns = columnStr.split(',').map(col => col.trim());
        const referencedColumns = referencedColumnStr.split(',').map(col => col.trim());

        let relationType: 'belongsTo' | 'hasMany' | 'hasOne';
        switch (relationTypeStr.toLowerCase()) {
          case 'one-to-one':
            relationType = 'hasOne';
            break;
          case 'one-to-many':
            relationType = 'hasMany';
            break;
          case 'many-to-one':
            relationType = 'belongsTo';
            break;
          default:
            relationType = 'belongsTo';
        }

        const relation: DatabaseRelation = {
          type: relationType,
          table: tableName,
          columns,
          referencedTable,
          referencedColumns,
        };

        relations.push(relation);
      }
    }
  }

  return ok(relations);
};

/**
 * Extracts a section from markdown content based on heading
 * @param content - Full markdown content
 * @param heading - Section heading to find (e.g., "## Columns")
 * @returns Section content or null if not found
 */
const extractSection = (content: string, heading: string): string | null => {
  const lines = content.split('\n');
  const startIndex = lines.findIndex(line => line.trim() === heading);

  if (startIndex === -1) {
    return null;
  }

  // Find next section or end of content
  let endIndex = lines.length;
  for (let i = startIndex + 1; i < lines.length; i++) {
    if (lines[i].match(/^##\s+/) && lines[i].trim() !== heading) {
      endIndex = i;
      break;
    }
    // Stop at table separator
    if (lines[i].trim() === '---') {
      endIndex = i;
      break;
    }
  }

  return lines.slice(startIndex, endIndex).join('\n');
};

/**
 * Combines multiple table parse results into a single result
 * @param tableResults - Array of table parse results
 * @returns Result containing array of tables or first error
 */
const combineTableResults = (tableResults: Result<DatabaseTable, Error>[]): Result<DatabaseTable[], Error> => {
  const tables: DatabaseTable[] = [];

  for (const result of tableResults) {
    if (result.isErr()) {
      return err(result.error);
    }
    tables.push(result.value);
  }

  return ok(tables);
};