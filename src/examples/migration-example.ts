/**
 * Migration Example: Schema Resource Handler
 *
 * This example shows how to migrate existing resource handlers
 * from using specific parsers to using the unified schema adapter.
 */

import { Result, ok, err } from 'neverthrow';
import { promises as fs } from 'fs';
import { join } from 'path';
import { SchemaListResource } from '../schemas/database';
import { safeExecuteAsync, fromPromise } from '../utils/result';

// NEW: Import the unified adapter functions
import {
  parseSchemaOverview,
  parseTableReferences,
  parseSchemaWithFallback,
} from '../parsers/schema-adapter';

// OLD: Import specific parser functions (these would be replaced)
// import {
//   parseSchemaOverview as parseMarkdownSchemaOverview,
//   parseTableReferences as parseMarkdownTableReferences
// } from '../parsers/markdown-parser';

/**
 * BEFORE: Original schema resource handler using direct markdown parser
 */
export const handleSchemaListResourceOld = async (schemaDir: string): Promise<Result<SchemaListResource, Error>> => {
  const dirExistsResult = await safeExecuteAsync(
    async () => {
      const stat = await fs.stat(schemaDir);
      if (!stat.isDirectory()) {
        throw new Error('Path is not a directory');
      }
      return true;
    },
    'Schema directory does not exist'
  );

  if (dirExistsResult.isErr()) {
    return err(dirExistsResult.error);
  }

  const readDirResult = await fromPromise(
    fs.readdir(schemaDir, { withFileTypes: true }),
    'Failed to read schema directory'
  );

  if (readDirResult.isErr()) {
    return err(readDirResult.error);
  }

  const dirEntries = readDirResult.value;
  const schemas: Array<{ name: string; tableCount?: number; description?: string | null }> = [];

  // OLD: Only look for README.md files
  const hasRootReadme = dirEntries.some(entry => entry.isFile() && entry.name === 'README.md');

  if (hasRootReadme) {
    const singleSchemaResult = await parseSingleSchemaInfoOld(schemaDir, 'default');
    if (singleSchemaResult.isOk()) {
      schemas.push(singleSchemaResult.value);
    }
  }

  const subdirectories = dirEntries.filter(entry => entry.isDirectory());

  for (const subdir of subdirectories) {
    const subdirPath = join(schemaDir, subdir.name);
    // OLD: Only check for README.md
    const readmeResult = await safeExecuteAsync(
      async () => {
        await fs.access(join(subdirPath, 'README.md'));
        return true;
      },
      'README.md not found in subdirectory'
    );

    if (readmeResult.isOk()) {
      const schemaResult = await parseSingleSchemaInfoOld(subdirPath, subdir.name);
      if (schemaResult.isOk()) {
        schemas.push(schemaResult.value);
      }
    }
  }

  schemas.sort((a, b) => a.name.localeCompare(b.name));
  return ok({ schemas });
};

/**
 * BEFORE: Original helper function using markdown-specific parsing
 */
const parseSingleSchemaInfoOld = async (
  schemaPath: string,
  schemaName: string
): Promise<Result<{ name: string; tableCount?: number; description?: string | null }, Error>> => {
  // OLD: Hardcoded to README.md
  const readmeResult = await fromPromise(
    fs.readFile(join(schemaPath, 'README.md'), 'utf8'),
    'Failed to read README.md'
  );

  if (readmeResult.isErr()) {
    return err(readmeResult.error);
  }

  // OLD: Import specific markdown parser functions
  // const content = readmeResult.value;
  // const overviewResult = parseMarkdownSchemaOverview(content);
  // if (overviewResult.isOk()) { ... }

  // For this example, we'll simulate the old behavior
  return ok({
    name: schemaName,
    tableCount: 0,
    description: null
  });
};

/**
 * AFTER: Updated schema resource handler using the unified adapter
 */
export const handleSchemaListResourceNew = async (schemaDir: string): Promise<Result<SchemaListResource, Error>> => {
  const dirExistsResult = await safeExecuteAsync(
    async () => {
      const stat = await fs.stat(schemaDir);
      if (!stat.isDirectory()) {
        throw new Error('Path is not a directory');
      }
      return true;
    },
    'Schema directory does not exist'
  );

  if (dirExistsResult.isErr()) {
    return err(dirExistsResult.error);
  }

  const readDirResult = await fromPromise(
    fs.readdir(schemaDir, { withFileTypes: true }),
    'Failed to read schema directory'
  );

  if (readDirResult.isErr()) {
    return err(readDirResult.error);
  }

  const dirEntries = readDirResult.value;
  const schemas: Array<{ name: string; tableCount?: number; description?: string | null }> = [];

  // NEW: Check for both JSON and Markdown files
  const hasSchemaFile = dirEntries.some(entry =>
    entry.isFile() && (entry.name === 'README.md' || entry.name === 'schema.json')
  );

  if (hasSchemaFile) {
    const singleSchemaResult = await parseSingleSchemaInfoNew(schemaDir, 'default');
    if (singleSchemaResult.isOk()) {
      schemas.push(singleSchemaResult.value);
    }
  }

  const subdirectories = dirEntries.filter(entry => entry.isDirectory());

  for (const subdir of subdirectories) {
    const subdirPath = join(schemaDir, subdir.name);

    // NEW: Use adapter's fallback parsing instead of hardcoded file check
    const schemaResult = await parseSingleSchemaInfoNew(subdirPath, subdir.name);
    if (schemaResult.isOk()) {
      schemas.push(schemaResult.value);
    }
  }

  schemas.sort((a, b) => a.name.localeCompare(b.name));
  return ok({ schemas });
};

/**
 * AFTER: Updated helper function using the unified adapter
 */
const parseSingleSchemaInfoNew = async (
  schemaPath: string,
  schemaName: string
): Promise<Result<{ name: string; tableCount?: number; description?: string | null }, Error>> => {
  // NEW: Use the unified adapter with fallback support
  // This automatically detects and handles both JSON and Markdown formats
  const schemaResult = parseSchemaWithFallback(schemaPath, true); // Prefer JSON

  if (schemaResult.isOk()) {
    const schema = schemaResult.value;
    return ok({
      name: schemaName, // Use provided name for consistency
      tableCount: schema.metadata.tableCount ?? schema.tables.length,
      description: schema.metadata.description
    });
  }

  // NEW: Fallback to overview parsing if full schema parsing fails
  const overviewResult = parseSchemaOverview(schemaPath);
  if (overviewResult.isOk()) {
    const metadata = overviewResult.value;
    return ok({
      name: schemaName,
      tableCount: metadata.tableCount ?? undefined,
      description: metadata.description
    });
  }

  // NEW: Final fallback to table references for table count
  const tableRefsResult = parseTableReferences(schemaPath);
  if (tableRefsResult.isOk()) {
    const tableCount = tableRefsResult.value.length;
    return ok({
      name: schemaName,
      tableCount: tableCount > 0 ? tableCount : 0,
      description: schemaName === 'default' ? 'Default schema' : null
    });
  }

  // Still return basic info if all parsing fails
  return ok({
    name: schemaName,
    tableCount: 0,
    description: schemaName === 'default' ? 'Default schema' : null
  });
};

/**
 * Migration Summary and Benefits
 */
export const migrationGuide = {
  summary: `
## Migration Guide: From Direct Parsers to Schema Adapter

### Key Changes:

1. **Import Changes:**
   - OLD: Import specific parser functions from json-parser or markdown-parser
   - NEW: Import unified functions from schema-adapter

2. **File Detection:**
   - OLD: Hardcoded file extension checks (README.md only)
   - NEW: Automatic format detection and fallback logic

3. **Error Handling:**
   - OLD: Different error patterns for different formats
   - NEW: Consistent error handling across all formats

4. **Format Support:**
   - OLD: Single format per handler
   - NEW: Both JSON and Markdown supported automatically

### Benefits:

✅ **Backward Compatibility**: Existing Markdown files continue to work
✅ **Forward Compatibility**: New JSON files are automatically supported
✅ **Reduced Code Duplication**: One set of functions for all formats
✅ **Consistent API**: Same function signatures regardless of format
✅ **Intelligent Fallback**: Tries multiple file patterns and formats
✅ **Better Error Messages**: Detailed information about what was tried
✅ **Format Migration**: Seamless migration from Markdown to JSON
`,

  steps: [
    '1. Replace direct parser imports with schema-adapter imports',
    '2. Replace format-specific parsing calls with unified adapter calls',
    '3. Remove file extension checks - adapter handles detection',
    '4. Update error handling to use consistent Result patterns',
    '5. Test with both JSON and Markdown files',
    '6. Update documentation to mention multi-format support'
  ],

  codeChanges: {
    before: `
// OLD: Format-specific imports
import { parseJsonFile } from './json-parser';
import { parseMarkdownFile } from './markdown-parser';

// OLD: Manual format detection
if (filePath.endsWith('.json')) {
  result = parseJsonFile(filePath);
} else if (filePath.endsWith('.md')) {
  result = parseMarkdownFile(filePath);
} else {
  return err(new Error('Unsupported format'));
}`,

    after: `
// NEW: Unified adapter import
import { parseSchemaFile } from './schema-adapter';

// NEW: Automatic format detection
result = parseSchemaFile(filePath);`
  }
};

/**
 * Example of testing both old and new implementations
 */
export const compareImplementations = async (schemaDir: string) => {
  console.log('🔄 Comparing old vs new implementation');

  console.time('Old Implementation');
  const oldResult = await handleSchemaListResourceOld(schemaDir);
  console.timeEnd('Old Implementation');

  console.time('New Implementation');
  const newResult = await handleSchemaListResourceNew(schemaDir);
  console.timeEnd('New Implementation');

  console.log('📊 Results comparison:');
  console.log(`Old result success: ${oldResult.isOk()}`);
  console.log(`New result success: ${newResult.isOk()}`);

  if (oldResult.isOk() && newResult.isOk()) {
    const oldSchemas = oldResult.value.schemas.length;
    const newSchemas = newResult.value.schemas.length;
    console.log(`Schemas found - Old: ${oldSchemas}, New: ${newSchemas}`);
  }

  return { old: oldResult, new: newResult };
};