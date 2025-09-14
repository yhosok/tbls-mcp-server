import {
  validateSqlQuery,
  isSelectQuery,
  sanitizeTableName,
  sanitizeColumnName,
  validateConnectionString,
  parseConnectionString,
  ValidationError,
} from '../../src/schemas/validation';

describe('validation utilities', () => {
  describe('isSelectQuery', () => {
    it('should return true for valid SELECT queries', () => {
      expect(isSelectQuery('SELECT * FROM users')).toBe(true);
      expect(isSelectQuery('select id, name from users')).toBe(true);
      expect(isSelectQuery('  SELECT COUNT(*) FROM posts WHERE status = ?')).toBe(true);
      expect(isSelectQuery('\n\tSELECT u.name FROM users u JOIN posts p ON u.id = p.user_id')).toBe(true);
    });

    it('should return false for non-SELECT queries', () => {
      expect(isSelectQuery('INSERT INTO users (name) VALUES (?)')).toBe(false);
      expect(isSelectQuery('UPDATE users SET name = ? WHERE id = ?')).toBe(false);
      expect(isSelectQuery('DELETE FROM users WHERE id = ?')).toBe(false);
      expect(isSelectQuery('DROP TABLE users')).toBe(false);
      expect(isSelectQuery('CREATE TABLE users (id INT)')).toBe(false);
      expect(isSelectQuery('ALTER TABLE users ADD COLUMN email VARCHAR(255)')).toBe(false);
    });

    it('should return false for potentially malicious queries', () => {
      expect(isSelectQuery('SELECT * FROM users; DROP TABLE users;')).toBe(false);
      expect(isSelectQuery('SELECT * FROM users UNION SELECT * FROM admin')).toBe(true); // UNION is allowed in SELECT
      expect(isSelectQuery('TRUNCATE TABLE users')).toBe(false);
    });

    it('should handle empty or invalid input', () => {
      expect(isSelectQuery('')).toBe(false);
      expect(isSelectQuery('   ')).toBe(false);
      expect(isSelectQuery('INVALID SQL')).toBe(false);
    });
  });

  describe('validateSqlQuery', () => {
    it('should return success for valid SELECT queries', () => {
      const queries = [
        'SELECT * FROM users',
        'SELECT id, name, email FROM users WHERE status = ?',
        'SELECT COUNT(*) as total FROM posts',
        'SELECT u.name, COUNT(p.id) FROM users u LEFT JOIN posts p ON u.id = p.user_id GROUP BY u.id',
      ];

      queries.forEach(query => {
        const result = validateSqlQuery(query);
        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          expect(result.value).toBe(query);
        }
      });
    });

    it('should return error for non-SELECT queries', () => {
      const queries = [
        'INSERT INTO users (name) VALUES (?)',
        'UPDATE users SET name = ?',
        'DELETE FROM users',
        'DROP TABLE users',
        'CREATE TABLE test (id INT)',
      ];

      queries.forEach(query => {
        const result = validateSqlQuery(query);
        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
          expect(result.error).toContain('Only SELECT queries are allowed');
        }
      });
    });

    it('should return error for empty queries', () => {
      const result = validateSqlQuery('');
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toContain('SQL query must be a non-empty string');
      }
    });

    it('should return error for whitespace-only queries', () => {
      const result = validateSqlQuery('   \n\t  ');
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toContain('SQL query cannot be empty');
      }
    });
  });

  describe('sanitizeTableName', () => {
    it('should return success for valid table names', () => {
      const validNames = [
        'users',
        'user_posts',
        'UserTable',
        'table123',
        'my_table_name',
        'TABLE_NAME',
      ];

      validNames.forEach(name => {
        const result = sanitizeTableName(name);
        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          expect(result.value).toBe(name);
        }
      });
    });

    it('should return error for invalid table names', () => {
      const invalidNames = [
        'table-name',
        'table name',
        'table.name',
        '123table',
        'select',
        'drop',
        'from',
        'where',
      ];

      invalidNames.forEach(name => {
        const result = sanitizeTableName(name);
        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
          expect(result.error).toContain('Invalid table name');
        }
      });
    });

    it('should return error for empty table name', () => {
      const result = sanitizeTableName('');
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toContain('Table name must be a non-empty string');
      }
    });

    it('should return error for SQL keywords', () => {
      const sqlKeywords = ['SELECT', 'FROM', 'WHERE', 'DROP', 'CREATE', 'INSERT', 'UPDATE', 'DELETE'];

      sqlKeywords.forEach(keyword => {
        const result = sanitizeTableName(keyword.toLowerCase());
        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
          expect(result.error).toContain('Invalid table name');
        }
      });
    });
  });

  describe('sanitizeColumnName', () => {
    it('should return success for valid column names', () => {
      const validNames = [
        'id',
        'user_id',
        'firstName',
        'created_at',
        'column123',
        'MY_COLUMN',
      ];

      validNames.forEach(name => {
        const result = sanitizeColumnName(name);
        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          expect(result.value).toBe(name);
        }
      });
    });

    it('should return error for invalid column names', () => {
      const invalidNames = [
        'column-name',
        'column name',
        'column.name',
        '123column',
        'select',
        'from',
        'where',
      ];

      invalidNames.forEach(name => {
        const result = sanitizeColumnName(name);
        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
          expect(result.error).toContain('Invalid column name');
        }
      });
    });

    it('should return error for empty column name', () => {
      const result = sanitizeColumnName('');
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toContain('Column name must be a non-empty string');
      }
    });
  });

  describe('validateConnectionString', () => {
    describe('MySQL connection strings', () => {
      it('should return success for valid MySQL connection strings', () => {
        const validStrings = [
          'mysql://user:pass@localhost:3306/testdb',
          'mysql://user@localhost/testdb',
          'mysql://user:pass@192.168.1.1:3306/testdb',
          'mysql://root:password@127.0.0.1/myapp',
        ];

        validStrings.forEach(str => {
          const result = validateConnectionString(str);
          expect(result.isOk()).toBe(true);
          if (result.isOk()) {
            expect(result.value).toBe(str);
          }
        });
      });

      it('should return error for invalid MySQL connection strings', () => {
        const invalidStrings = [
          'mysql://user@/testdb', // missing host
          'mysql://user@localhost/', // missing database
          'mysql://user@localhost:invalid/testdb', // invalid port
        ];

        invalidStrings.forEach(str => {
          const result = validateConnectionString(str);
          expect(result.isErr()).toBe(true);
        });
      });

      it('should reject URLs with protocols in SQLite validation', () => {
        // These strings start with mysql:// but fail MySQL regex,
        // so they should also be rejected by SQLite validation
        const invalidProtocolStrings = [
          'mysql://localhost/testdb', // missing user - fails both MySQL and SQLite
          'invalid://user@localhost/testdb', // wrong protocol - should be rejected by SQLite validation
        ];

        invalidProtocolStrings.forEach(str => {
          const result = validateConnectionString(str);
          expect(result.isErr()).toBe(true);
        });
      });
    });

    describe('SQLite connection strings', () => {
      it('should return success for valid SQLite paths', () => {
        const validPaths = [
          '/path/to/database.db',
          './relative/path.db',
          '../another/path.sqlite',
          ':memory:',
          'file:test.db',
        ];

        validPaths.forEach(path => {
          const result = validateConnectionString(path);
          expect(result.isOk()).toBe(true);
          if (result.isOk()) {
            expect(result.value).toBe(path);
          }
        });
      });

      it('should return error for invalid SQLite paths', () => {
        const invalidPaths = [
          '',
          '   ',
          'invalid<>path',
          'path|with|pipes',
        ];

        invalidPaths.forEach(path => {
          const result = validateConnectionString(path);
          expect(result.isErr()).toBe(true);
        });
      });
    });
  });

  describe('parseConnectionString', () => {
    it('should parse MySQL connection strings correctly', () => {
      const connectionString = 'mysql://testuser:testpass@localhost:3306/testdb';
      const result = parseConnectionString(connectionString);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual({
          type: 'mysql',
          host: 'localhost',
          port: 3306,
          user: 'testuser',
          password: 'testpass',
          database: 'testdb',
        });
      }
    });

    it('should parse MySQL connection strings without port', () => {
      const connectionString = 'mysql://user@localhost/testdb';
      const result = parseConnectionString(connectionString);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual({
          type: 'mysql',
          host: 'localhost',
          port: 3306, // default port
          user: 'user',
          password: undefined,
          database: 'testdb',
        });
      }
    });

    it('should detect SQLite paths', () => {
      const paths = ['/path/to/db.db', ':memory:', 'file:test.db'];

      paths.forEach(path => {
        const result = parseConnectionString(path);
        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          expect(result.value).toEqual({
            type: 'sqlite',
            path: path,
          });
        }
      });
    });

    it('should return error for invalid connection strings', () => {
      const invalidStrings = [
        'invalid://connection',
        'mysql://',
        '',
        '   ',
      ];

      invalidStrings.forEach(str => {
        const result = parseConnectionString(str);
        expect(result.isErr()).toBe(true);
      });
    });
  });

  describe('ValidationError', () => {
    it('should create error with message', () => {
      const error = new ValidationError('Test validation error');
      expect(error.message).toBe('Test validation error');
      expect(error.name).toBe('ValidationError');
      expect(error).toBeInstanceOf(Error);
    });

    it('should create error with context', () => {
      const context = { field: 'email', value: 'invalid-email' };
      const error = new ValidationError('Invalid email format', context);
      expect(error.message).toBe('Invalid email format');
      expect(error.context).toEqual(context);
    });
  });
});