/**
 * Schema Adapter Usage Examples
 *
 * This file demonstrates how to use the schema adapter pattern to work
 * seamlessly with both JSON and Markdown schema formats.
 */

import {
  parseSchemaFile,
  parseSingleTableFile,
  parseSchemaOverview,
  parseTableReferences,
  getSchemaParser,
  parseSchemaWithFallback,
  validateParsedSchema,
} from '../parsers/schema-adapter';

/**
 * Example 1: Basic schema parsing with automatic format detection
 */
export const parseAnySchemaFormat = async (filePath: string) => {
  console.log(`\n=== Example 1: Parsing schema from ${filePath} ===`);

  const result = parseSchemaFile(filePath);

  if (result.isOk()) {
    const schema = result.value;
    console.log(`✅ Successfully parsed schema: ${schema.metadata.name}`);
    console.log(`   Tables found: ${schema.tables.length}`);
    console.log(`   Table references: ${schema.tableReferences.length}`);

    // List all table names
    const tableNames = schema.tables.map(t => t.name).join(', ');
    console.log(`   Table names: ${tableNames}`);

    return schema;
  } else {
    console.error(`❌ Failed to parse schema: ${result.error.message}`);
    return null;
  }
};

/**
 * Example 2: Directory-based schema discovery
 */
export const discoverSchemaInDirectory = async (directoryPath: string) => {
  console.log(`\n=== Example 2: Discovering schema in ${directoryPath} ===`);

  // Try with JSON preference first
  const jsonFirstResult = parseSchemaWithFallback(directoryPath, true);

  if (jsonFirstResult.isOk()) {
    const schema = jsonFirstResult.value;
    console.log(`✅ Found schema (JSON preferred): ${schema.metadata.name}`);
    return schema;
  }

  // Try with Markdown preference
  const markdownFirstResult = parseSchemaWithFallback(directoryPath, false);

  if (markdownFirstResult.isOk()) {
    const schema = markdownFirstResult.value;
    console.log(`✅ Found schema (Markdown preferred): ${schema.metadata.name}`);
    return schema;
  }

  console.error(`❌ No schema found in directory: ${markdownFirstResult.error.message}`);
  return null;
};

/**
 * Example 3: Single table parsing
 */
export const parseSingleTable = async (filePath: string) => {
  console.log(`\n=== Example 3: Parsing single table from ${filePath} ===`);

  const result = parseSingleTableFile(filePath);

  if (result.isOk()) {
    const schema = result.value;
    const table = schema.tables[0];

    console.log(`✅ Successfully parsed table: ${table.name}`);
    console.log(`   Columns: ${table.columns.length}`);
    console.log(`   Indexes: ${table.indexes.length}`);
    console.log(`   Relations: ${table.relations.length}`);

    // Show column details
    console.log('   Column details:');
    table.columns.forEach(col => {
      const pk = col.isPrimaryKey ? ' [PK]' : '';
      const nullable = col.nullable ? ' NULL' : ' NOT NULL';
      console.log(`     - ${col.name}: ${col.type}${nullable}${pk}`);
    });

    return table;
  } else {
    console.error(`❌ Failed to parse table: ${result.error.message}`);
    return null;
  }
};

/**
 * Example 4: Extract metadata only
 */
export const extractSchemaMetadata = async (filePath: string) => {
  console.log(`\n=== Example 4: Extracting metadata from ${filePath} ===`);

  const result = parseSchemaOverview(filePath);

  if (result.isOk()) {
    const metadata = result.value;
    console.log(`✅ Schema metadata:`);
    console.log(`   Name: ${metadata.name}`);
    console.log(`   Description: ${metadata.description || 'None'}`);
    console.log(`   Table count: ${metadata.tableCount || 'Unknown'}`);
    console.log(`   Generated: ${metadata.generated || 'Unknown'}`);
    console.log(`   Version: ${metadata.version || 'Unknown'}`);

    return metadata;
  } else {
    console.error(`❌ Failed to extract metadata: ${result.error.message}`);
    return null;
  }
};

/**
 * Example 5: Extract table references/summary
 */
export const extractTableReferences = async (filePath: string) => {
  console.log(`\n=== Example 5: Extracting table references from ${filePath} ===`);

  const result = parseTableReferences(filePath);

  if (result.isOk()) {
    const references = result.value;
    console.log(`✅ Found ${references.length} table references:`);

    references.forEach(ref => {
      const columnInfo = ref.columnCount ? ` (${ref.columnCount} columns)` : '';
      const comment = ref.comment ? ` - ${ref.comment}` : '';
      console.log(`   - ${ref.name}${columnInfo}${comment}`);
    });

    return references;
  } else {
    console.error(`❌ Failed to extract table references: ${result.error.message}`);
    return null;
  }
};

/**
 * Example 6: Using the parser factory directly
 */
export const useParserFactory = async (filePath: string) => {
  console.log(`\n=== Example 6: Using parser factory for ${filePath} ===`);

  const parserResult = getSchemaParser(filePath);

  if (parserResult.isOk()) {
    const parser = parserResult.value;
    console.log(`✅ Created parser for file`);

    // Use the parser for multiple operations
    const schemaResult = parser.parseSchemaFile(filePath);
    if (schemaResult.isOk()) {
      console.log(`   Schema parsing: ✅ ${schemaResult.value.metadata.name}`);
    }

    const overviewResult = parser.parseSchemaOverview(filePath);
    if (overviewResult.isOk()) {
      console.log(`   Overview extraction: ✅ ${overviewResult.value.name}`);
    }

    const referencesResult = parser.parseTableReferences(filePath);
    if (referencesResult.isOk()) {
      console.log(`   References extraction: ✅ ${referencesResult.value.length} tables`);
    }

    return parser;
  } else {
    console.error(`❌ Failed to create parser: ${parserResult.error.message}`);
    return null;
  }
};

/**
 * Example 7: Schema validation
 */
export const validateSchema = (schema: unknown) => {
  console.log(`\n=== Example 7: Validating schema structure ===`);

  const result = validateParsedSchema(schema);

  if (result.isOk()) {
    const validSchema = result.value;
    console.log(`✅ Schema validation passed`);
    console.log(`   Valid schema with ${validSchema.tables.length} tables`);
    return validSchema;
  } else {
    console.error(`❌ Schema validation failed: ${result.error.message}`);
    return null;
  }
};

/**
 * Example 8: Migration helper - migrating from direct parser usage
 */
export const migrateFromDirectParser = async (filePath: string) => {
  console.log(`\n=== Example 8: Migration from direct parser usage ===`);

  // OLD WAY: Import and use specific parsers
  // import { parseJsonFile } from './json-parser';
  // import { parseMarkdownFile } from './markdown-parser';
  //
  // if (filePath.endsWith('.json')) {
  //   result = parseJsonFile(filePath);
  // } else if (filePath.endsWith('.md')) {
  //   result = parseMarkdownFile(filePath);
  // }

  // NEW WAY: Use the unified adapter
  const result = parseSchemaFile(filePath);

  if (result.isOk()) {
    console.log(`✅ Migrated code now handles both formats seamlessly`);
    return result.value;
  } else {
    console.error(`❌ Migration failed: ${result.error.message}`);
    return null;
  }
};

/**
 * Example usage runner
 */
export const runExamples = async () => {
  console.log('🚀 Schema Adapter Examples');
  console.log('='.repeat(50));

  // These examples would work with actual files
  // For demonstration purposes, you would need to provide real file paths

  const examplePaths = {
    jsonSchema: './examples/schema.json',
    markdownSchema: './examples/README.md',
    singleTable: './examples/users.md',
    directory: './examples/',
  };

  console.log('📝 Example file paths (replace with actual paths):');
  Object.entries(examplePaths).forEach(([key, path]) => {
    console.log(`   ${key}: ${path}`);
  });

  console.log('\n🔍 To run these examples with real files:');
  console.log('   1. Create schema files in JSON and/or Markdown format');
  console.log('   2. Update the file paths in this function');
  console.log('   3. Run: node -r ts-node/register src/examples/schema-adapter-usage.ts');

  // Uncomment and modify these lines to run with real files:
  // await parseAnySchemaFormat(examplePaths.jsonSchema);
  // await discoverSchemaInDirectory(examplePaths.directory);
  // await parseSingleTable(examplePaths.singleTable);
  // await extractSchemaMetadata(examplePaths.markdownSchema);
  // await extractTableReferences(examplePaths.markdownSchema);
  // await useParserFactory(examplePaths.jsonSchema);

  console.log('\n✨ Schema Adapter provides seamless format compatibility!');
};

// Run examples if this file is executed directly
if (require.main === module) {
  runExamples().catch(console.error);
}