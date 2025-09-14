# Schema Adapter Pattern

The Schema Adapter provides a unified interface for parsing database schema information from both JSON and Markdown formats, enabling seamless migration and backward compatibility while maintaining a consistent API.

## Overview

The adapter pattern abstracts away the differences between JSON and Markdown schema formats, allowing resource handlers and other components to work with either format without modification. This is particularly useful for migrating from Markdown-based tbls schemas to JSON-based schemas while maintaining backward compatibility.

## Key Features

- **Automatic Format Detection**: Detects file format based on extension (.json, .md)
- **Intelligent Fallback**: Tries multiple file patterns when no extension is provided
- **Unified API**: Same function signatures for all operations regardless of format
- **Backward Compatibility**: Existing Markdown files continue to work unchanged
- **Forward Compatibility**: New JSON files are automatically supported
- **Consistent Error Handling**: Uniform error patterns across all formats
- **Type Safety**: Full TypeScript support with Result types for error handling

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                Schema Adapter                       │
├─────────────────────────────────────────────────────┤
│  parseSchemaFile()                                  │
│  parseSingleTableFile()                             │
│  parseSchemaOverview()                              │
│  parseTableReferences()                             │
│  parseSchemaWithFallback()                          │
└─────────────────┬───────────────────────────────────┘
                  │
    ┌─────────────┴─────────────┐
    │                           │
    ▼                           ▼
┌─────────────────┐         ┌─────────────────┐
│  JSON Parser    │         │ Markdown Parser │
│                 │         │                 │
│ - parseJsonFile │         │ - parseMarkdownFile │
│ - parseJsonSchema│        │ - parseSingleTableMarkdown │
│ - JSON specific │         │ - parseSchemaOverview │
│   functions     │         │ - parseTableReferences │
└─────────────────┘         └─────────────────┘
```

## Usage Examples

### Basic Schema Parsing

```typescript
import { parseSchemaFile } from './parsers/schema-adapter';

// Works with both JSON and Markdown automatically
const result = parseSchemaFile('./schema/database.json');
// or
const result = parseSchemaFile('./schema/README.md');

if (result.isOk()) {
  const schema = result.value;
  console.log(`Found ${schema.tables.length} tables`);
} else {
  console.error(`Parse error: ${result.error.message}`);
}
```

### Directory-Based Discovery

```typescript
import { parseSchemaWithFallback } from './parsers/schema-adapter';

// Automatically tries multiple file patterns
const result = parseSchemaWithFallback('./schema-directory', true); // Prefer JSON

if (result.isOk()) {
  console.log('Schema found and parsed successfully');
} else {
  console.log('Detailed error with all attempts:', result.error.message);
}
```

### Metadata Extraction Only

```typescript
import { parseSchemaOverview } from './parsers/schema-adapter';

const result = parseSchemaOverview('./database-schema');

if (result.isOk()) {
  const metadata = result.value;
  console.log(`Schema: ${metadata.name}`);
  console.log(`Tables: ${metadata.tableCount}`);
  console.log(`Generated: ${metadata.generated}`);
}
```

### Using the Parser Factory

```typescript
import { getSchemaParser } from './parsers/schema-adapter';

const parserResult = getSchemaParser('./schema.json');

if (parserResult.isOk()) {
  const parser = parserResult.value;

  // Use parser for multiple operations
  const schema = parser.parseSchemaFile('./schema.json');
  const overview = parser.parseSchemaOverview('./schema.json');
  const tables = parser.parseTableReferences('./schema.json');
}
```

## API Reference

### Core Functions

#### `parseSchemaFile(filePath: string): Result<DatabaseSchema, Error>`
Parses a complete database schema from JSON or Markdown format.

**Parameters:**
- `filePath`: Path to schema file or directory

**Returns:**
- `Result<DatabaseSchema, Error>` - Complete database schema with tables, indexes, and relations

#### `parseSingleTableFile(filePath: string): Result<DatabaseSchema, Error>`
Parses a single table definition into a schema structure.

**Parameters:**
- `filePath`: Path to single table file

**Returns:**
- `Result<DatabaseSchema, Error>` - Schema containing one table

#### `parseSchemaOverview(filePath: string): Result<SchemaMetadata, Error>`
Extracts only the metadata/overview information from a schema file.

**Parameters:**
- `filePath`: Path to schema file

**Returns:**
- `Result<SchemaMetadata, Error>` - Schema metadata (name, table count, etc.)

#### `parseTableReferences(filePath: string): Result<TableReference[], Error>`
Extracts table reference information (summary of tables).

**Parameters:**
- `filePath`: Path to schema file

**Returns:**
- `Result<TableReference[], Error>` - Array of table references with basic info

### Advanced Functions

#### `parseSchemaWithFallback(basePath: string, preferJson?: boolean): Result<DatabaseSchema, Error>`
Tries multiple file patterns and formats with detailed error reporting.

**Parameters:**
- `basePath`: Base directory or file path to search
- `preferJson`: Whether to prefer JSON over Markdown (default: true)

**Returns:**
- `Result<DatabaseSchema, Error>` - Parsed schema or detailed error with all attempts

#### `getSchemaParser(filePath: string): Result<SchemaParser, Error>`
Returns a parser instance for multiple operations on the same file.

**Parameters:**
- `filePath`: Path to determine parser type

**Returns:**
- `Result<SchemaParser, Error>` - Parser instance

#### `validateParsedSchema(schema: unknown): Result<DatabaseSchema, Error>`
Validates a parsed schema object against the expected structure.

**Parameters:**
- `schema`: Schema object to validate

**Returns:**
- `Result<DatabaseSchema, Error>` - Validated schema or validation errors

## File Resolution Logic

The adapter uses intelligent file resolution with the following priority:

1. **Explicit Extension**: If file has .json or .md extension, use directly
2. **Directory Search**: If directory provided, try in order:
   - `schema.json`
   - `README.md`
   - `database.json`
   - `database.md`
3. **Extension Addition**: If no extension, try adding .json and .md
4. **Preference Handling**: With `parseSchemaWithFallback`, respect format preference

## Migration Guide

### From Direct Parser Usage

**Before:**
```typescript
import { parseJsonFile } from './json-parser';
import { parseMarkdownFile } from './markdown-parser';

let result;
if (filePath.endsWith('.json')) {
  result = parseJsonFile(filePath);
} else if (filePath.endsWith('.md')) {
  result = parseMarkdownFile(filePath);
} else {
  throw new Error('Unsupported format');
}
```

**After:**
```typescript
import { parseSchemaFile } from './schema-adapter';

const result = parseSchemaFile(filePath); // Handles both formats automatically
```

### Updating Resource Handlers

1. **Replace Imports**: Change from specific parser imports to adapter imports
2. **Remove Format Checks**: Delete file extension checking code
3. **Update Function Calls**: Use unified adapter functions
4. **Enhanced Error Handling**: Leverage improved error messages
5. **Test Both Formats**: Verify functionality with JSON and Markdown files

## Error Handling

The adapter provides comprehensive error handling with detailed messages:

```typescript
const result = parseSchemaWithFallback('./nonexistent');

if (result.isErr()) {
  console.log(result.error.message);
  // Output: "Failed to parse schema from any candidate file:
  // ./nonexistent/schema.json: file not found
  // ./nonexistent/README.md: file not found
  // ./nonexistent.json: file not found
  // ./nonexistent.md: file not found"
}
```

## Type Safety

All functions return `Result<T, Error>` types from the neverthrow library, ensuring:

- **No Exceptions**: Errors are captured in Result types
- **Explicit Error Handling**: Must handle both success and error cases
- **Type Safety**: Full TypeScript support with proper type inference
- **Composability**: Results can be chained with `.andThen()` and `.map()`

## Testing

The adapter includes comprehensive tests covering:

- Format detection and parser creation
- File resolution with various patterns
- Error handling for missing/corrupted files
- Schema validation
- Migration scenarios
- Edge cases and fallback behavior

Run tests with:
```bash
npm test -- --testPathPatterns=schema-adapter
```

## Performance Considerations

- **Lazy Loading**: Parsers are created only when needed
- **File Caching**: Files are read once per operation
- **Format Detection**: Minimal overhead for format detection
- **Fallback Efficiency**: Stops at first successful parse attempt

## Future Enhancements

Potential future improvements:

1. **Additional Formats**: Support for YAML, XML schema formats
2. **Caching Layer**: Cache parsed schemas for repeated access
3. **Stream Processing**: Support for large schema files
4. **Schema Transformation**: Convert between formats (Markdown ↔ JSON)
5. **Validation Levels**: Configurable validation strictness
6. **Plugin Architecture**: Custom parser plugins

## Best Practices

1. **Use Fallback Functions**: For robust file discovery in production
2. **Handle Errors Explicitly**: Always check Result types before using values
3. **Prefer Specific Functions**: Use specific functions when you know the operation needed
4. **Validate External Data**: Always validate schemas from external sources
5. **Log Detailed Errors**: Use the detailed error messages for debugging
6. **Test Both Formats**: Ensure your application works with JSON and Markdown

## Contributing

When extending the schema adapter:

1. **Maintain Interface Compatibility**: Don't break existing function signatures
2. **Add Comprehensive Tests**: Test both success and failure cases
3. **Update Documentation**: Keep this guide and examples current
4. **Follow Patterns**: Use Result types and functional programming patterns
5. **Consider Backward Compatibility**: Don't break existing file formats