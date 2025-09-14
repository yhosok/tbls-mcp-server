import {
  DatabaseColumn,
  DatabaseIndex,
  DatabaseTable,
  DatabaseSchema,
  DatabaseRelation,
  TableReference,
  SchemaMetadata,
  validateTableData,
  validateSchemaData,
} from '../../src/schemas/database';

describe('database schemas', () => {
  describe('DatabaseColumn', () => {
    it('should validate complete column definition', () => {
      const column = {
        name: 'user_id',
        type: 'BIGINT',
        nullable: false,
        defaultValue: null,
        comment: 'User identifier',
        isPrimaryKey: true,
        isAutoIncrement: true,
        maxLength: null,
        precision: null,
        scale: null,
      };
      expect(DatabaseColumn.parse(column)).toEqual(column);
    });

    it('should validate minimal column definition', () => {
      const column = {
        name: 'username',
        type: 'VARCHAR',
      };
      const parsed = DatabaseColumn.parse(column);
      expect(parsed.name).toBe('username');
      expect(parsed.type).toBe('VARCHAR');
      expect(parsed.nullable).toBe(true); // default
      expect(parsed.isPrimaryKey).toBe(false); // default
      expect(parsed.isAutoIncrement).toBe(false); // default
    });

    it('should validate VARCHAR column with maxLength', () => {
      const column = {
        name: 'username',
        type: 'VARCHAR',
        maxLength: 255,
        nullable: false,
      };
      expect(DatabaseColumn.parse(column)).toEqual({
        ...column,
        defaultValue: null,
        comment: null,
        isPrimaryKey: false,
        isAutoIncrement: false,
        precision: null,
        scale: null,
      });
    });

    it('should validate DECIMAL column with precision and scale', () => {
      const column = {
        name: 'price',
        type: 'DECIMAL',
        precision: 10,
        scale: 2,
        nullable: false,
        defaultValue: '0.00',
      };
      expect(DatabaseColumn.parse(column)).toMatchObject(column);
    });

    it('should require name and type', () => {
      expect(() => DatabaseColumn.parse({})).toThrow();
      expect(() => DatabaseColumn.parse({ name: 'test' })).toThrow();
      expect(() => DatabaseColumn.parse({ type: 'VARCHAR' })).toThrow();
    });
  });

  describe('DatabaseIndex', () => {
    it('should validate complete index definition', () => {
      const index = {
        name: 'idx_user_email',
        columns: ['email'],
        isUnique: true,
        isPrimary: false,
        type: 'BTREE',
        comment: 'Unique index on user email',
      };
      expect(DatabaseIndex.parse(index)).toEqual(index);
    });

    it('should validate minimal index definition', () => {
      const index = {
        name: 'idx_created_at',
        columns: ['created_at'],
      };
      const parsed = DatabaseIndex.parse(index);
      expect(parsed.name).toBe('idx_created_at');
      expect(parsed.columns).toEqual(['created_at']);
      expect(parsed.isUnique).toBe(false); // default
      expect(parsed.isPrimary).toBe(false); // default
    });

    it('should validate composite index', () => {
      const index = {
        name: 'idx_user_status',
        columns: ['user_id', 'status'],
        isUnique: false,
      };
      expect(DatabaseIndex.parse(index)).toMatchObject(index);
    });

    it('should require name and columns', () => {
      expect(() => DatabaseIndex.parse({})).toThrow();
      expect(() => DatabaseIndex.parse({ name: 'test' })).toThrow();
      expect(() => DatabaseIndex.parse({ columns: ['id'] })).toThrow();
    });

    it('should require at least one column', () => {
      const index = {
        name: 'idx_test',
        columns: [],
      };
      expect(() => DatabaseIndex.parse(index)).toThrow();
    });
  });

  describe('DatabaseRelation', () => {
    it('should validate foreign key relation', () => {
      const relation = {
        type: 'belongsTo',
        table: 'users',
        columns: ['user_id'],
        referencedTable: 'users',
        referencedColumns: ['id'],
        constraintName: 'fk_posts_user_id',
      };
      expect(DatabaseRelation.parse(relation)).toEqual(relation);
    });

    it('should validate hasMany relation', () => {
      const relation = {
        type: 'hasMany',
        table: 'posts',
        columns: ['user_id'],
        referencedTable: 'users',
        referencedColumns: ['id'],
      };
      expect(DatabaseRelation.parse(relation)).toMatchObject(relation);
    });

    it('should require all relation fields', () => {
      expect(() => DatabaseRelation.parse({})).toThrow();
      expect(() =>
        DatabaseRelation.parse({
          type: 'belongsTo',
          table: 'posts',
        })
      ).toThrow();
    });
  });

  describe('DatabaseTable', () => {
    it('should validate complete table definition', () => {
      const table = {
        name: 'users',
        comment: 'User accounts table',
        columns: [
          {
            name: 'id',
            type: 'BIGINT',
            nullable: false,
            isPrimaryKey: true,
            isAutoIncrement: true,
          },
          {
            name: 'email',
            type: 'VARCHAR',
            maxLength: 255,
            nullable: false,
          },
        ],
        indexes: [
          {
            name: 'PRIMARY',
            columns: ['id'],
            isPrimary: true,
            isUnique: true,
          },
          {
            name: 'idx_users_email',
            columns: ['email'],
            isUnique: true,
          },
        ],
        relations: [
          {
            type: 'hasMany',
            table: 'posts',
            columns: ['id'],
            referencedTable: 'posts',
            referencedColumns: ['user_id'],
          },
        ],
      };
      expect(DatabaseTable.parse(table)).toMatchObject(table);
    });

    it('should validate minimal table definition', () => {
      const table = {
        name: 'simple_table',
        columns: [
          {
            name: 'id',
            type: 'INTEGER',
          },
        ],
      };
      const parsed = DatabaseTable.parse(table);
      expect(parsed.name).toBe('simple_table');
      expect(parsed.columns).toHaveLength(1);
      expect(parsed.indexes).toEqual([]); // default
      expect(parsed.relations).toEqual([]); // default
    });

    it('should require name and at least one column', () => {
      expect(() => DatabaseTable.parse({})).toThrow();
      expect(() => DatabaseTable.parse({ name: 'test' })).toThrow();
      expect(() =>
        DatabaseTable.parse({ name: 'test', columns: [] })
      ).toThrow();
    });
  });

  describe('TableReference', () => {
    it('should validate table reference', () => {
      const ref = {
        name: 'users',
        comment: 'User accounts table',
        columnCount: 5,
      };
      expect(TableReference.parse(ref)).toEqual(ref);
    });

    it('should validate minimal table reference', () => {
      const ref = {
        name: 'posts',
      };
      const parsed = TableReference.parse(ref);
      expect(parsed.name).toBe('posts');
      expect(parsed.comment).toBeNull(); // default
      expect(parsed.columnCount).toBeNull(); // default
    });
  });

  describe('SchemaMetadata', () => {
    it('should validate schema metadata', () => {
      const metadata = {
        name: 'blog_db',
        tableCount: 5,
        generated: '2023-12-01T10:00:00Z',
        version: '1.0.0',
        description: 'Blog database schema',
      };
      expect(SchemaMetadata.parse(metadata)).toEqual(metadata);
    });

    it('should validate minimal schema metadata', () => {
      const metadata = {
        name: 'test_db',
      };
      const parsed = SchemaMetadata.parse(metadata);
      expect(parsed.name).toBe('test_db');
      expect(parsed.tableCount).toBeNull(); // default
      expect(parsed.generated).toBeNull(); // default
    });
  });

  describe('DatabaseSchema', () => {
    it('should validate complete database schema', () => {
      const schema = {
        metadata: {
          name: 'blog_schema',
          tableCount: 2,
          generated: '2023-12-01T10:00:00Z',
        },
        tables: [
          {
            name: 'users',
            columns: [
              {
                name: 'id',
                type: 'BIGINT',
                nullable: false,
                isPrimaryKey: true,
              },
            ],
            indexes: [],
            relations: [],
          },
          {
            name: 'posts',
            columns: [
              {
                name: 'id',
                type: 'BIGINT',
                nullable: false,
                isPrimaryKey: true,
              },
              {
                name: 'user_id',
                type: 'BIGINT',
                nullable: false,
              },
            ],
            indexes: [],
            relations: [
              {
                type: 'belongsTo',
                table: 'posts',
                columns: ['user_id'],
                referencedTable: 'users',
                referencedColumns: ['id'],
              },
            ],
          },
        ],
        tableReferences: [
          { name: 'users', columnCount: 1 },
          { name: 'posts', columnCount: 2 },
        ],
      };
      expect(DatabaseSchema.parse(schema)).toMatchObject(schema);
    });

    it('should validate minimal database schema', () => {
      const schema = {
        metadata: {
          name: 'simple_schema',
        },
        tables: [],
        tableReferences: [],
      };
      const parsed = DatabaseSchema.parse(schema);
      expect(parsed.metadata.name).toBe('simple_schema');
      expect(parsed.tables).toEqual([]);
      expect(parsed.tableReferences).toEqual([]);
    });

    it('should require metadata, tables, and tableReferences', () => {
      expect(() => DatabaseSchema.parse({})).toThrow();
      expect(() =>
        DatabaseSchema.parse({
          metadata: { name: 'test' },
        })
      ).toThrow();
    });
  });

  describe('validateTableData', () => {
    it('should return success for valid table data', () => {
      const table = {
        name: 'users',
        columns: [
          {
            name: 'id',
            type: 'BIGINT',
          },
        ],
        indexes: [],
        relations: [],
      };
      const result = validateTableData(table);
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.name).toBe('users');
      }
    });

    it('should return error for invalid table data', () => {
      const table = {
        name: '',
        columns: [],
      };
      const result = validateTableData(table);
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toContain('validation');
      }
    });
  });

  describe('validateSchemaData', () => {
    it('should return success for valid schema data', () => {
      const schema = {
        metadata: {
          name: 'test_schema',
        },
        tables: [
          {
            name: 'users',
            columns: [{ name: 'id', type: 'INTEGER' }],
          },
        ],
        tableReferences: [{ name: 'users' }],
      };
      const result = validateSchemaData(schema);
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.metadata.name).toBe('test_schema');
      }
    });

    it('should return error for invalid schema data', () => {
      const schema = {
        metadata: {
          name: '',
        },
        tables: [],
        tableReferences: [],
      };
      const result = validateSchemaData(schema);
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toContain('validation');
      }
    });
  });
});