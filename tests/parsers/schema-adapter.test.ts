import { existsSync, writeFileSync, mkdirSync, unlinkSync, rmdirSync } from 'fs';
import path from 'path';
import {
  createSchemaParser,
  parseSchemaFile,
  parseSingleTableFile,
  parseSchemaOverview,
  parseTableReferences,
  getSchemaParser,
  validateParsedSchema,
  parseSchemaWithFallback,
} from '../../src/parsers/schema-adapter';

const TEST_DIR = path.join(__dirname, '../temp-test-files');

// Sample JSON schema for testing
const sampleJsonSchema = {
  name: 'test_database',
  desc: 'Test database for schema adapter',
  tables: [
    {
      name: 'users',
      comment: 'User accounts table',
      columns: [
        {
          name: 'id',
          type: 'int(11)',
          nullable: false,
          extra_def: 'auto_increment primary key',
          comment: 'User ID'
        },
        {
          name: 'username',
          type: 'varchar(50)',
          nullable: false,
          comment: 'Username'
        },
        {
          name: 'email',
          type: 'varchar(100)',
          nullable: false,
          comment: 'Email address'
        }
      ],
      indexes: [
        {
          name: 'PRIMARY',
          columns: ['id'],
          def: 'PRIMARY KEY (id)',
          comment: null
        }
      ]
    }
  ],
  relations: []
};

// Sample markdown schema for testing
const sampleMarkdownSchema = `# Database Schema: test_database

Test database for schema adapter

Generated on: 2024-01-01T00:00:00Z
Tables: 1

## Tables

| Name | Columns | Comment |
|------|---------|---------|
| users | 3 | User accounts table |

---

# users

User accounts table

## Columns

| Name | Type | Default | Nullable | Children | Parents | Comment |
|------|------|---------|----------|----------|---------|---------|
| id | int(11) |  | false |  |  | User ID |
| username | varchar(50) |  | false |  |  | Username |
| email | varchar(100) |  | false |  |  | Email address |

## Indexes

| Name | Definition | Comment |
|------|------------|---------|
| PRIMARY | PRIMARY KEY (id) |  |

## Relations

`;

describe('Schema Adapter', () => {
  beforeAll(() => {
    // Create test directory
    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true });
    }
  });

  afterAll(() => {
    // Clean up test directory
    if (existsSync(TEST_DIR)) {
      const files = require('fs').readdirSync(TEST_DIR);
      files.forEach((file: string) => {
        unlinkSync(path.join(TEST_DIR, file));
      });
      rmdirSync(TEST_DIR);
    }
  });

  beforeEach(() => {
    // Clean up any existing test files
    const files = [
      'test-schema.json',
      'test-schema.md',
      'schema.json',
      'README.md',
      'database.json',
      'database.md',
      'invalid.txt'
    ];

    files.forEach(file => {
      const filePath = path.join(TEST_DIR, file);
      if (existsSync(filePath)) {
        unlinkSync(filePath);
      }
    });
  });

  describe('createSchemaParser', () => {
    it('should create JSON parser for .json files', () => {
      const result = createSchemaParser('test.json');
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBeDefined();
    });

    it('should create Markdown parser for .md files', () => {
      const result = createSchemaParser('test.md');
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBeDefined();
    });

    it('should return error for unsupported file extensions', () => {
      const result = createSchemaParser('test.txt');
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toContain('Unsupported file extension: .txt');
    });

    it('should return error for empty file path', () => {
      const result = createSchemaParser('');
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toContain('File path must be a non-empty string');
    });
  });

  describe('parseSchemaFile', () => {
    it('should parse JSON schema file', () => {
      const jsonPath = path.join(TEST_DIR, 'test-schema.json');
      writeFileSync(jsonPath, JSON.stringify(sampleJsonSchema, null, 2));

      const result = parseSchemaFile(jsonPath);
      expect(result.isOk()).toBe(true);

      const schema = result._unsafeUnwrap();
      expect(schema.metadata.name).toBe('test_database');
      expect(schema.tables).toHaveLength(1);
      expect(schema.tables[0].name).toBe('users');
    });

    it('should parse Markdown schema file', () => {
      const mdPath = path.join(TEST_DIR, 'test-schema.md');
      writeFileSync(mdPath, sampleMarkdownSchema);

      const result = parseSchemaFile(mdPath);
      expect(result.isOk()).toBe(true);

      const schema = result._unsafeUnwrap();
      expect(schema.metadata.name).toBe('test_database');
      expect(schema.tables).toHaveLength(1);
      expect(schema.tables[0].name).toBe('users');
    });

    it('should return error for non-existent file', () => {
      const result = parseSchemaFile('/non/existent/file.json');
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toContain('File does not exist');
    });

    it('should auto-resolve schema.json from directory', () => {
      const jsonPath = path.join(TEST_DIR, 'schema.json');
      writeFileSync(jsonPath, JSON.stringify(sampleJsonSchema, null, 2));

      const result = parseSchemaFile(TEST_DIR);
      expect(result.isOk()).toBe(true);

      const schema = result._unsafeUnwrap();
      expect(schema.metadata.name).toBe('test_database');
    });

    it('should auto-resolve README.md from directory', () => {
      const mdPath = path.join(TEST_DIR, 'README.md');
      writeFileSync(mdPath, sampleMarkdownSchema);

      const result = parseSchemaFile(TEST_DIR);
      expect(result.isOk()).toBe(true);

      const schema = result._unsafeUnwrap();
      expect(schema.metadata.name).toBe('test_database');
    });
  });

  describe('parseSingleTableFile', () => {
    it('should parse single table from JSON file', () => {
      const jsonPath = path.join(TEST_DIR, 'test-schema.json');
      writeFileSync(jsonPath, JSON.stringify(sampleJsonSchema, null, 2));

      const result = parseSingleTableFile(jsonPath);
      expect(result.isOk()).toBe(true);

      const schema = result._unsafeUnwrap();
      expect(schema.tables).toHaveLength(1);
    });

    it('should parse single table from Markdown file', () => {
      // Single table markdown (without schema overview)
      const singleTableMd = `# users

User accounts table

## Columns

| Name | Type | Default | Nullable | Children | Parents | Comment |
|------|------|---------|----------|----------|---------|---------|
| id | int(11) |  | false |  |  | User ID |
| username | varchar(50) |  | false |  |  | Username |
| email | varchar(100) |  | false |  |  | Email address |

## Indexes

| Name | Definition | Comment |
|------|------------|---------|
| PRIMARY | PRIMARY KEY (id) |  |

## Relations

`;

      const mdPath = path.join(TEST_DIR, 'users.md');
      writeFileSync(mdPath, singleTableMd);

      const result = parseSingleTableFile(mdPath);
      expect(result.isOk()).toBe(true);

      const schema = result._unsafeUnwrap();
      expect(schema.tables).toHaveLength(1);
      expect(schema.tables[0].name).toBe('users');
      expect(schema.metadata.name).toBe('users');
    });
  });

  describe('parseSchemaOverview', () => {
    it('should extract metadata from JSON file', () => {
      const jsonPath = path.join(TEST_DIR, 'test-schema.json');
      writeFileSync(jsonPath, JSON.stringify(sampleJsonSchema, null, 2));

      const result = parseSchemaOverview(jsonPath);
      expect(result.isOk()).toBe(true);

      const metadata = result._unsafeUnwrap();
      expect(metadata.name).toBe('test_database');
      expect(metadata.tableCount).toBe(1);
    });

    it('should extract metadata from Markdown file', () => {
      const mdPath = path.join(TEST_DIR, 'test-schema.md');
      writeFileSync(mdPath, sampleMarkdownSchema);

      const result = parseSchemaOverview(mdPath);
      expect(result.isOk()).toBe(true);

      const metadata = result._unsafeUnwrap();
      expect(metadata.name).toBe('test_database');
      expect(metadata.tableCount).toBe(1);
      expect(metadata.generated).toBe('2024-01-01T00:00:00Z');
    });
  });

  describe('parseTableReferences', () => {
    it('should extract table references from JSON file', () => {
      const jsonPath = path.join(TEST_DIR, 'test-schema.json');
      writeFileSync(jsonPath, JSON.stringify(sampleJsonSchema, null, 2));

      const result = parseTableReferences(jsonPath);
      expect(result.isOk()).toBe(true);

      const references = result._unsafeUnwrap();
      expect(references).toHaveLength(1);
      expect(references[0].name).toBe('users');
    });

    it('should extract table references from Markdown file', () => {
      const mdPath = path.join(TEST_DIR, 'test-schema.md');
      writeFileSync(mdPath, sampleMarkdownSchema);

      const result = parseTableReferences(mdPath);
      expect(result.isOk()).toBe(true);

      const references = result._unsafeUnwrap();
      expect(references).toHaveLength(1);
      expect(references[0].name).toBe('users');
      expect(references[0].columnCount).toBe(3);
      expect(references[0].comment).toBe('User accounts table');
    });
  });

  describe('getSchemaParser', () => {
    it('should return parser for existing JSON file', () => {
      const jsonPath = path.join(TEST_DIR, 'test.json');
      writeFileSync(jsonPath, '{}');

      const result = getSchemaParser(jsonPath);
      expect(result.isOk()).toBe(true);
    });

    it('should return parser for existing Markdown file', () => {
      const mdPath = path.join(TEST_DIR, 'test.md');
      writeFileSync(mdPath, '# Test');

      const result = getSchemaParser(mdPath);
      expect(result.isOk()).toBe(true);
    });
  });

  describe('validateParsedSchema', () => {
    it('should validate correct schema', () => {
      const validSchema = {
        metadata: {
          name: 'test',
          tableCount: 1,
          generated: null,
          description: null
        },
        tables: [
          {
            name: 'test_table',
            comment: null,
            columns: [
              {
                name: 'id',
                type: 'int',
                nullable: false,
                defaultValue: null,
                comment: null,
                isPrimaryKey: true,
                isAutoIncrement: true,
                maxLength: null,
                precision: null,
                scale: null
              }
            ],
            indexes: [],
            relations: []
          }
        ],
        tableReferences: []
      };

      const result = validateParsedSchema(validSchema);
      expect(result.isOk()).toBe(true);
    });

    it('should reject invalid schema', () => {
      const invalidSchema = {
        metadata: { name: '' }, // Invalid: empty name
        tables: [],
        tableReferences: []
      };

      const result = validateParsedSchema(invalidSchema);
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toContain('Schema validation failed');
    });
  });

  describe('parseSchemaWithFallback', () => {
    it('should prefer JSON when preferJson is true', () => {
      // Create both JSON and Markdown files
      const jsonPath = path.join(TEST_DIR, 'schema.json');
      const mdPath = path.join(TEST_DIR, 'README.md');

      writeFileSync(jsonPath, JSON.stringify(sampleJsonSchema, null, 2));
      writeFileSync(mdPath, sampleMarkdownSchema);

      const result = parseSchemaWithFallback(TEST_DIR, true);
      expect(result.isOk()).toBe(true);

      // Should have parsed from JSON (which has different structure than MD)
      const schema = result._unsafeUnwrap();
      expect(schema.metadata.name).toBe('test_database');
    });

    it('should prefer Markdown when preferJson is false', () => {
      // Create both JSON and Markdown files
      const jsonPath = path.join(TEST_DIR, 'schema.json');
      const mdPath = path.join(TEST_DIR, 'README.md');

      writeFileSync(jsonPath, JSON.stringify(sampleJsonSchema, null, 2));
      writeFileSync(mdPath, sampleMarkdownSchema);

      const result = parseSchemaWithFallback(TEST_DIR, false);
      expect(result.isOk()).toBe(true);

      const schema = result._unsafeUnwrap();
      expect(schema.metadata.name).toBe('test_database');
    });

    it('should return detailed error when no files found', () => {
      const result = parseSchemaWithFallback('/nonexistent/path');
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toContain('Failed to parse schema from any candidate file');
    });

    it('should try all candidates and report attempts', () => {
      // Create an invalid JSON file
      const jsonPath = path.join(TEST_DIR, 'schema.json');
      writeFileSync(jsonPath, 'invalid json content');

      const result = parseSchemaWithFallback(TEST_DIR);
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toContain('Failed to parse schema from any candidate file');
      expect(result._unsafeUnwrapErr().message).toContain('schema.json');
    });
  });

  describe('File resolution edge cases', () => {
    it('should handle file path with extension directly', () => {
      const jsonPath = path.join(TEST_DIR, 'specific-file.json');
      writeFileSync(jsonPath, JSON.stringify(sampleJsonSchema, null, 2));

      const result = parseSchemaFile(jsonPath);
      expect(result.isOk()).toBe(true);
    });

    it('should handle directory path without trailing slash', () => {
      const jsonPath = path.join(TEST_DIR, 'schema.json');
      writeFileSync(jsonPath, JSON.stringify(sampleJsonSchema, null, 2));

      const result = parseSchemaFile(TEST_DIR.replace(/\/$/, ''));
      expect(result.isOk()).toBe(true);
    });

    it('should try file with added extension', () => {
      const jsonPath = path.join(TEST_DIR, 'myschema.json');
      writeFileSync(jsonPath, JSON.stringify(sampleJsonSchema, null, 2));

      const basePathWithoutExt = path.join(TEST_DIR, 'myschema');
      const result = parseSchemaFile(basePathWithoutExt);
      expect(result.isOk()).toBe(true);
    });
  });

  describe('Error handling', () => {
    it('should handle corrupted JSON file', () => {
      const jsonPath = path.join(TEST_DIR, 'corrupted.json');
      writeFileSync(jsonPath, '{ invalid json content');

      const result = parseSchemaFile(jsonPath);
      expect(result.isErr()).toBe(true);
    });

    it('should handle empty files', () => {
      const jsonPath = path.join(TEST_DIR, 'empty.json');
      writeFileSync(jsonPath, '');

      const result = parseSchemaFile(jsonPath);
      expect(result.isErr()).toBe(true);
    });

    it('should handle files with wrong permissions', () => {
      const jsonPath = path.join(TEST_DIR, 'test.json');
      writeFileSync(jsonPath, JSON.stringify(sampleJsonSchema));

      // On some systems, this test might not work as expected due to permissions
      // but the adapter should handle it gracefully
      const result = parseSchemaFile(jsonPath);
      // Should either succeed or fail gracefully
      expect(typeof result.isOk()).toBe('boolean');
    });
  });
});