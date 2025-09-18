import {
  handleSqlQuery,
  validateSqlQuery,
  sanitizeQuery,
  createSqlQueryTool,
} from '../../src/tools/sql-query-tool';
import type { DatabaseConfig } from '../../src/schemas/config';
import type { QueryResult } from '../../src/schemas/database';
import { ok, err } from 'neverthrow';

// Mock the database connection and adapters
jest.mock('../../src/database/connection', () => ({
  createConnection: jest.fn(),
  executeQuery: jest.fn(),
  closeConnection: jest.fn(),
  getPooledConnection: jest.fn(),
  ConnectionPool: jest.fn().mockImplementation(() => ({
    getConnection: jest.fn(),
    closeAll: jest.fn(),
  })),
}));

describe('sql query tool', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validateSqlQuery', () => {
    it('should validate SELECT queries', () => {
      const validQueries = [
        'SELECT * FROM users',
        'select id, name from users',
        '  SELECT  id,  name  FROM  users  ',
        'SELECT u.id, u.name FROM users u',
        'SELECT COUNT(*) FROM users WHERE active = 1',
        `SELECT id, name
         FROM users
         WHERE created_at > '2023-01-01'`,
      ];

      validQueries.forEach((query) => {
        const result = validateSqlQuery(query);
        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          expect(result.value).toBe(query);
        }
      });
    });

    it('should reject non-SELECT queries', () => {
      const invalidQueries = [
        'INSERT INTO users (name) VALUES ("test")',
        'UPDATE users SET name = "test" WHERE id = 1',
        'DELETE FROM users WHERE id = 1',
        'DROP TABLE users',
        'CREATE TABLE test (id INT)',
        'ALTER TABLE users ADD COLUMN email VARCHAR(255)',
        'TRUNCATE TABLE users',
        'REPLACE INTO users (id, name) VALUES (1, "test")',
      ];

      invalidQueries.forEach((query) => {
        const result = validateSqlQuery(query);
        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
          expect(result.error.message).toMatch(
            /Only (SELECT, PRAGMA, SHOW, DESCRIBE, and EXPLAIN queries are allowed|read-only queries are allowed)/
          );
        }
      });
    });

    it('should handle empty or whitespace queries', () => {
      const emptyQueries = ['', '   ', '\n\t  ', null, undefined];

      emptyQueries.forEach((query) => {
        const result = validateSqlQuery(query as unknown as string);
        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
          expect(result.error.message).toContain('Query cannot be empty');
        }
      });
    });

    it('should reject queries with multiple statements', () => {
      const maliciousQueries = [
        'SELECT * FROM users; DROP TABLE users;',
        'SELECT * FROM users; INSERT INTO logs (action) VALUES ("hack");',
        'SELECT 1; SELECT 2;',
        `SELECT * FROM users;
         UPDATE users SET admin = 1;`,
      ];

      maliciousQueries.forEach((query) => {
        const result = validateSqlQuery(query);
        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
          expect(result.error.message).toContain(
            'Multiple statements are not allowed'
          );
        }
      });
    });

    it('should handle complex SELECT queries', () => {
      const complexQueries = [
        `SELECT u.id, u.name, p.title, COUNT(c.id) as comment_count
         FROM users u
         JOIN posts p ON u.id = p.user_id
         LEFT JOIN comments c ON p.id = c.post_id
         WHERE u.active = 1
         GROUP BY u.id, p.id
         HAVING COUNT(c.id) > 0
         ORDER BY u.name, p.created_at DESC
         LIMIT 100 OFFSET 20`,
        'SELECT * FROM users WHERE name LIKE "%john%" AND age BETWEEN 18 AND 65',
        'SELECT id, (CASE WHEN active = 1 THEN "Active" ELSE "Inactive" END) as status FROM users',
        'SELECT DATE(created_at) as date, COUNT(*) as count FROM users GROUP BY DATE(created_at)',
      ];

      complexQueries.forEach((query) => {
        const result = validateSqlQuery(query);
        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          expect(result.value).toBe(query);
        }
      });
    });

    it('should handle queries with comments', () => {
      const queriesWithComments = [
        '/* Get all users */ SELECT * FROM users',
        'SELECT * FROM users -- Get all users',
        `SELECT id, name -- User identification
         FROM users /* User table */
         WHERE active = 1 -- Only active users`,
      ];

      queriesWithComments.forEach((query) => {
        const result = validateSqlQuery(query);
        expect(result.isOk()).toBe(true);
      });
    });
  });

  describe('sanitizeQuery', () => {
    it('should trim whitespace from queries', () => {
      const queries = [
        { input: '  SELECT * FROM users  ', expected: 'SELECT * FROM users' },
        {
          input: '\n\t SELECT id FROM users \n',
          expected: 'SELECT id FROM users',
        },
        {
          input: '   \n  SELECT name FROM users   \t  ',
          expected: 'SELECT name FROM users',
        },
      ];

      queries.forEach(({ input, expected }) => {
        const result = sanitizeQuery(input);
        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          expect(result.value).toBe(expected);
        }
      });
    });

    it('should normalize whitespace in queries', () => {
      const queries = [
        {
          input: 'SELECT    id,   name   FROM   users',
          expected: 'SELECT id, name FROM users',
        },
        {
          input: 'SELECT\nid,\nname\nFROM\nusers',
          expected: 'SELECT id, name FROM users',
        },
        {
          input: 'SELECT\t\tid,\t\tname\t\tFROM\t\tusers',
          expected: 'SELECT id, name FROM users',
        },
      ];

      queries.forEach(({ input, expected }) => {
        const result = sanitizeQuery(input);
        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          expect(result.value).toBe(expected);
        }
      });
    });

    it('should preserve string literals', () => {
      const queries = [
        {
          input: `SELECT name FROM users WHERE name = 'John  Doe'`,
          expected: `SELECT name FROM users WHERE name = 'John  Doe'`,
        },
        {
          input: `SELECT * FROM users WHERE comment = "Has   multiple   spaces"`,
          expected: `SELECT * FROM users WHERE comment = "Has   multiple   spaces"`,
        },
      ];

      queries.forEach(({ input, expected }) => {
        const result = sanitizeQuery(input);
        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          expect(result.value).toBe(expected);
        }
      });
    });

    it('should handle empty queries', () => {
      const emptyQueries = ['', '   ', '\n\t'];

      emptyQueries.forEach((query) => {
        const result = sanitizeQuery(query as unknown as string);
        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
          expect(result.error.message).toMatch(
            /Query cannot be (empty after sanitization|null or undefined)/
          );
        }
      });
    });
  });

  describe('handleSqlQuery', () => {
    const mockConnection = {
      type: 'mysql' as const,
      pool: {},
    };

    const mockConfig: DatabaseConfig = {
      type: 'mysql',
      host: 'localhost',
      user: 'test',
      password: 'test',
      database: 'test',
    };

    it('should execute valid SELECT query successfully', async () => {
      const mockQueryResult: QueryResult = {
        columns: ['id', 'name', 'email'],
        rows: [
          [1, 'John Doe', 'john@example.com'],
          [2, 'Jane Smith', 'jane@example.com'],
        ],
        rowCount: 2,
        executionTimeMs: 42.5,
      };

      const {
        getPooledConnection,
        executeQuery,
      } = require('../../src/database/connection');
      getPooledConnection.mockResolvedValue(ok(mockConnection));
      executeQuery.mockResolvedValue(ok(mockQueryResult));

      const request = {
        query: 'SELECT id, name, email FROM users WHERE active = ?',
        parameters: [1],
      };

      const result = await handleSqlQuery(request, mockConfig);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual({
          ...mockQueryResult,
          truncated: false,
        });
      }

      expect(getPooledConnection).toHaveBeenCalledWith(mockConfig);
      expect(executeQuery).toHaveBeenCalledWith(
        mockConnection,
        'SELECT id, name, email FROM users WHERE active = ? LIMIT 20',
        [1],
        30000
      );
    });

    it('should handle query validation errors', async () => {
      const request = {
        query: 'INSERT INTO users (name) VALUES (?)',
        parameters: ['John'],
      };

      const result = await handleSqlQuery(request, mockConfig);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toMatch(
          /Only (SELECT, PRAGMA, SHOW, DESCRIBE, and EXPLAIN queries are allowed|read-only queries are allowed)/
        );
      }

      const { getPooledConnection } = require('../../src/database/connection');
      expect(getPooledConnection).not.toHaveBeenCalled();
    });

    it('should handle connection errors', async () => {
      const { getPooledConnection } = require('../../src/database/connection');
      getPooledConnection.mockResolvedValue(
        err(new Error('Failed to connect to database'))
      );

      const request = {
        query: 'SELECT * FROM users',
        parameters: [],
      };

      const result = await handleSqlQuery(request, mockConfig);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('Failed to connect to database');
      }
    });

    it('should handle query execution errors', async () => {
      const {
        getPooledConnection,
        executeQuery,
      } = require('../../src/database/connection');
      getPooledConnection.mockResolvedValue(ok(mockConnection));
      executeQuery.mockResolvedValue(
        err(new Error('Table "nonexistent" does not exist'))
      );

      const request = {
        query: 'SELECT * FROM nonexistent',
        parameters: [],
      };

      const result = await handleSqlQuery(request, mockConfig);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain(
          'Table "nonexistent" does not exist'
        );
      }
    });

    it('should sanitize query before execution', async () => {
      const mockQueryResult: QueryResult = {
        columns: ['count'],
        rows: [[5]],
        rowCount: 1,
        executionTimeMs: 10.2,
      };

      const {
        getPooledConnection,
        executeQuery,
      } = require('../../src/database/connection');
      getPooledConnection.mockResolvedValue(ok(mockConnection));
      executeQuery.mockResolvedValue(ok(mockQueryResult));

      const request = {
        query: '  SELECT   COUNT(*)   as   count   FROM   users  ',
        parameters: [],
      };

      const result = await handleSqlQuery(request, mockConfig);

      expect(result.isOk()).toBe(true);
      expect(executeQuery).toHaveBeenCalledWith(
        mockConnection,
        'SELECT COUNT(*) as count FROM users LIMIT 20',
        [],
        30000
      );
    });

    it('should handle parameters correctly', async () => {
      const mockQueryResult: QueryResult = {
        columns: ['id', 'name'],
        rows: [[1, 'John']],
        rowCount: 1,
        executionTimeMs: 15.3,
      };

      const {
        getPooledConnection,
        executeQuery,
      } = require('../../src/database/connection');
      getPooledConnection.mockResolvedValue(ok(mockConnection));
      executeQuery.mockResolvedValue(ok(mockQueryResult));

      const request = {
        query: 'SELECT id, name FROM users WHERE age > ? AND city = ?',
        parameters: [25, 'New York'],
      };

      const result = await handleSqlQuery(request, mockConfig);

      expect(result.isOk()).toBe(true);
      expect(executeQuery).toHaveBeenCalledWith(
        mockConnection,
        'SELECT id, name FROM users WHERE age > ? AND city = ? LIMIT 20',
        [25, 'New York'],
        30000
      );
    });

    it('should handle queries without parameters', async () => {
      const mockQueryResult: QueryResult = {
        columns: ['table_name'],
        rows: [['users'], ['posts']],
        rowCount: 2,
        executionTimeMs: 5.1,
      };

      const {
        getPooledConnection,
        executeQuery,
      } = require('../../src/database/connection');
      getPooledConnection.mockResolvedValue(ok(mockConnection));
      executeQuery.mockResolvedValue(ok(mockQueryResult));

      const request = {
        query: 'SHOW TABLES',
        parameters: [],
      };

      const result = await handleSqlQuery(request, mockConfig);

      expect(result.isOk()).toBe(true);
      expect(executeQuery).toHaveBeenCalledWith(
        mockConnection,
        'SHOW TABLES',
        [],
        30000
      );
    });
  });

  describe('createSqlQueryTool', () => {
    const mockConfig: DatabaseConfig = {
      type: 'sqlite',
      path: ':memory:',
    };

    it('should create MCP tool definition', () => {
      const tool = createSqlQueryTool(mockConfig);

      expect(tool.name).toBe('execute-sql');
      expect(tool.description).toContain('Execute SQL SELECT queries');
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.inputSchema.properties).toHaveProperty('query');
      expect(tool.inputSchema.properties).toHaveProperty('parameters');
      expect(tool.inputSchema.required).toContain('query');
    });

    it('should validate tool input schema', () => {
      const tool = createSqlQueryTool(mockConfig);
      const schema = tool.inputSchema;

      // Query property should be required string
      expect(schema.properties.query).toEqual({
        type: 'string',
        description: 'SQL SELECT query to execute',
        minLength: 1,
        maxLength: 50000,
      });

      // Parameters property should be optional array
      expect(schema.properties.parameters).toEqual({
        type: 'array',
        description:
          'Query parameters for prepared statements (use ? placeholders in query)',
        items: { type: ['string', 'number', 'boolean', 'null'] },
        maxItems: 100,
        default: [],
      });

      expect(schema.required).toEqual(['query']);
      expect(schema).toHaveProperty('additionalProperties', false);
    });

    it('should include security warnings in description', () => {
      const tool = createSqlQueryTool(mockConfig);

      expect(tool.description).toContain('SELECT queries only');
      expect(tool.description.toLowerCase()).toContain('parameterized queries');
      expect(tool.description.toLowerCase()).toContain('sql injection');
    });

    it('should handle tool execution', async () => {
      const mockQueryResult: QueryResult = {
        columns: ['id', 'name'],
        rows: [[1, 'Test User']],
        rowCount: 1,
        executionTimeMs: 20.5,
      };

      // Mock handleSqlQuery
      const originalHandleSqlQuery =
        require('../../src/tools/sql-query-tool').handleSqlQuery;
      const mockHandleSqlQuery = jest
        .fn()
        .mockResolvedValue(ok(mockQueryResult));
      require('../../src/tools/sql-query-tool').handleSqlQuery =
        mockHandleSqlQuery;

      const tool = createSqlQueryTool(mockConfig);

      const input = {
        query: 'SELECT id, name FROM users WHERE id = ?',
        parameters: [1],
      };

      const result = await tool.handler(input);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual(mockQueryResult);
      }

      expect(mockHandleSqlQuery).toHaveBeenCalledWith(input, mockConfig, 30000);

      // Restore original function
      require('../../src/tools/sql-query-tool').handleSqlQuery =
        originalHandleSqlQuery;
    });

    it('should handle tool execution errors', async () => {
      // Mock handleSqlQuery to return error
      const originalHandleSqlQuery =
        require('../../src/tools/sql-query-tool').handleSqlQuery;
      const mockHandleSqlQuery = jest
        .fn()
        .mockResolvedValue(err(new Error('Database connection failed')));
      require('../../src/tools/sql-query-tool').handleSqlQuery =
        mockHandleSqlQuery;

      const tool = createSqlQueryTool(mockConfig);

      const input = {
        query: 'SELECT * FROM users',
        parameters: [],
      };

      const result = await tool.handler(input);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('Database connection failed');
      }

      // Restore original function
      require('../../src/tools/sql-query-tool').handleSqlQuery =
        originalHandleSqlQuery;
    });
  });

  describe('security tests', () => {
    describe('dangerous keyword detection', () => {
      it('should reject queries with dangerous keywords', () => {
        const dangerousQueries = [
          'DROP TABLE users',
          'CREATE TABLE test (id INT)',
          'ALTER TABLE users ADD COLUMN email VARCHAR(255)',
          'TRUNCATE TABLE users',
          'RENAME TABLE users TO old_users',
          'GRANT ALL ON users TO public',
          'REVOKE SELECT ON users FROM user1',
          'DENY SELECT ON users TO user1',
          'INSERT INTO users (name) VALUES ("test")',
          'UPDATE users SET name = "test" WHERE id = 1',
          'DELETE FROM users WHERE id = 1',
          'REPLACE INTO users (id, name) VALUES (1, "test")',
          'MERGE INTO users USING source ON condition',
          'UPSERT INTO users VALUES (1, "test")',
          'ATTACH DATABASE "file.db" AS aux',
          'DETACH DATABASE aux',
          'VACUUM',
          'LOAD_EXTENSION("module")',
          'LOAD DATA INFILE "/tmp/file"',
          'SELECT * INTO OUTFILE "/tmp/output"',
          'SELECT * INTO DUMPFILE "/tmp/dump"',
        ];

        dangerousQueries.forEach((query) => {
          const result = validateSqlQuery(query);
          expect(result.isErr()).toBe(true);
          if (result.isErr()) {
            expect(result.error.message).toMatch(
              /dangerous keyword|not allowed|Only (SELECT, PRAGMA, SHOW, DESCRIBE, and EXPLAIN queries are allowed)/i
            );
          }
        });
      });

      it('should accept queries with dangerous keywords in comments', () => {
        const safeQueriesWithComments = [
          '/* This query does not DROP anything */ SELECT * FROM users',
          'SELECT * FROM users -- This is not a DELETE operation',
          '/* CREATE a report */ SELECT COUNT(*) FROM users',
        ];

        safeQueriesWithComments.forEach((query) => {
          const result = validateSqlQuery(query);
          expect(result.isOk()).toBe(true);
        });
      });

      it('should accept queries with dangerous keywords in string literals', () => {
        const safeQueriesWithStrings = [
          "SELECT * FROM users WHERE note = 'Remember to DROP by later'",
          'SELECT * FROM users WHERE comment LIKE "%CREATE%"',
          "SELECT * FROM logs WHERE action = 'DELETE_ATTEMPT'",
        ];

        safeQueriesWithStrings.forEach((query) => {
          const result = validateSqlQuery(query);
          expect(result.isOk()).toBe(true);
        });
      });
    });

    describe('PRAGMA restrictions', () => {
      it('should allow safe PRAGMA statements', () => {
        const safePragmas = [
          'PRAGMA table_info(users)',
          'PRAGMA index_list(users)',
          'PRAGMA index_info(idx_users_email)',
          'PRAGMA foreign_key_list(users)',
          'PRAGMA schema_version',
          'PRAGMA compile_options',
        ];

        safePragmas.forEach((query) => {
          const result = validateSqlQuery(query);
          expect(result.isOk()).toBe(true);
        });
      });

      it('should reject dangerous PRAGMA statements', () => {
        const dangerousPragmas = [
          'PRAGMA writable_schema = ON',
          'PRAGMA writable_schema(main, 1)',
          'PRAGMA load_extension("module.so")',
          'PRAGMA load_extension("module")',
        ];

        dangerousPragmas.forEach((query) => {
          const result = validateSqlQuery(query);
          expect(result.isErr()).toBe(true);
          if (result.isErr()) {
            expect(result.error.message).toMatch(
              /pragma.*not allowed|dangerous keyword.*LOAD_EXTENSION/i
            );
          }
        });
      });
    });

    describe('EXPLAIN statement restrictions', () => {
      it('should allow EXPLAIN with SELECT queries', () => {
        const validExplainQueries = [
          'EXPLAIN SELECT * FROM users',
          'EXPLAIN QUERY PLAN SELECT * FROM users JOIN posts ON users.id = posts.user_id',
          'explain select count(*) from users',
        ];

        validExplainQueries.forEach((query) => {
          const result = validateSqlQuery(query);
          expect(result.isOk()).toBe(true);
        });
      });

      it('should reject EXPLAIN with non-SELECT queries', () => {
        const invalidExplainQueries = [
          'EXPLAIN INSERT INTO users (name) VALUES ("test")',
          'EXPLAIN UPDATE users SET name = "test"',
          'EXPLAIN DELETE FROM users',
          'EXPLAIN DROP TABLE users',
        ];

        invalidExplainQueries.forEach((query) => {
          const result = validateSqlQuery(query);
          expect(result.isErr()).toBe(true);
          if (result.isErr()) {
            expect(result.error.message).toMatch(
              /explain.*select.*only|dangerous keyword/i
            );
          }
        });
      });
    });

    it('should prevent SQL injection through query validation', () => {
      const maliciousQueries = [
        'SELECT * FROM users WHERE id = 1; DROP TABLE users; --',
        'SELECT * FROM users UNION SELECT * FROM sensitive_table',
        'SELECT * FROM users WHERE 1=1; UPDATE users SET admin=1; --',
        "'; DROP TABLE users; SELECT * FROM users WHERE '1'='1",
      ];

      maliciousQueries.forEach((query) => {
        const result = validateSqlQuery(query);
        if (query.includes(';')) {
          expect(result.isErr()).toBe(true);
        } else {
          // UNION queries are valid SELECT statements
          expect(result.isOk()).toBe(true);
        }
      });
    });

    it('should handle parameterized queries safely', async () => {
      const mockConnection = {
        type: 'mysql' as const,
        pool: {},
      };

      const mockConfig: DatabaseConfig = {
        type: 'mysql',
        host: 'localhost',
        user: 'test',
        password: 'test',
        database: 'test',
      };

      const mockQueryResult: QueryResult = {
        columns: ['id', 'name'],
        rows: [],
        rowCount: 0,
        executionTimeMs: 10,
      };

      const {
        getPooledConnection,
        executeQuery,
      } = require('../../src/database/connection');
      getPooledConnection.mockResolvedValue(ok(mockConnection));
      executeQuery.mockResolvedValue(ok(mockQueryResult));

      // Parameters with potential SQL injection
      const request = {
        query: 'SELECT * FROM users WHERE name = ? AND id = ?',
        parameters: ["'; DROP TABLE users; --", '1 OR 1=1'],
      };

      const result = await handleSqlQuery(request, mockConfig);

      expect(result.isOk()).toBe(true);
      expect(executeQuery).toHaveBeenCalledWith(
        mockConnection,
        'SELECT * FROM users WHERE name = ? AND id = ? LIMIT 20',
        ["'; DROP TABLE users; --", '1 OR 1=1'],
        30000
      );
    });

    it('should enforce query timeout limits', async () => {
      const mockConnection = {
        type: 'sqlite' as const,
        database: {},
      };

      const mockConfig: DatabaseConfig = {
        type: 'sqlite',
        path: ':memory:',
      };

      const {
        getPooledConnection,
        executeQuery,
      } = require('../../src/database/connection');
      getPooledConnection.mockResolvedValue(ok(mockConnection));
      executeQuery.mockResolvedValue(
        err(new Error('Query execution timeout after 30000ms'))
      );

      const request = {
        query: 'SELECT * FROM users',
        parameters: [],
      };

      const result = await handleSqlQuery(request, mockConfig);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('timeout');
      }
    });
  });

  describe('integration scenarios', () => {
    it('should handle complex analytical queries', async () => {
      const complexQuery = `
        SELECT
          DATE(created_at) as date,
          COUNT(*) as user_count,
          AVG(age) as avg_age,
          MAX(last_login) as latest_login
        FROM users
        WHERE created_at >= ?
          AND status = 'active'
        GROUP BY DATE(created_at)
        HAVING COUNT(*) > 10
        ORDER BY date DESC
        LIMIT 30
      `;

      const result = validateSqlQuery(complexQuery);
      expect(result.isOk()).toBe(true);

      const sanitized = sanitizeQuery(complexQuery);
      expect(sanitized.isOk()).toBe(true);
      if (sanitized.isOk()) {
        expect(sanitized.value).toContain('SELECT');
        expect(sanitized.value).toContain('GROUP BY');
        expect(sanitized.value).toContain('HAVING');
      }
    });

    it('should handle database schema queries', async () => {
      const schemaQueries = [
        'SELECT table_name FROM information_schema.tables WHERE table_schema = ?',
        'SELECT column_name, data_type FROM information_schema.columns WHERE table_name = ?',
        'PRAGMA table_info(users)',
        'SELECT name FROM sqlite_master WHERE type = "table"',
      ];

      schemaQueries.forEach((query) => {
        const result = validateSqlQuery(query);
        expect(result.isOk()).toBe(true);
      });
    });
  });

  describe('result limitation and truncation', () => {
    const mockConnection = {
      type: 'mysql' as const,
      pool: {},
    };

    const mockConfig: DatabaseConfig = {
      type: 'mysql',
      host: 'localhost',
      user: 'test',
      password: 'test',
      database: 'test',
    };

    beforeEach(() => {
      const {
        getPooledConnection,
      } = require('../../src/database/connection');
      getPooledConnection.mockResolvedValue(ok(mockConnection));
    });

    it('should enforce maxRows parameter', async () => {
      const largeResultSet: QueryResult = {
        columns: ['id', 'name'],
        rows: Array.from({ length: 1500 }, (_, i) => [i + 1, `User ${i + 1}`]),
        rowCount: 1500,
        executionTimeMs: 100,
      };

      const { executeQuery } = require('../../src/database/connection');
      executeQuery.mockResolvedValue(ok(largeResultSet));

      const request = {
        query: 'SELECT id, name FROM users',
        parameters: [],
        maxRows: 100,
      };

      const result = await handleSqlQuery(request, mockConfig);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.rows.length).toBe(100);
        expect(result.value.truncated).toBe(true);
        expect(result.value.totalRows).toBe(1500);
        expect(result.value.rowCount).toBe(100);
      }
    });

    it('should not truncate when result is smaller than maxRows', async () => {
      const smallResultSet: QueryResult = {
        columns: ['id', 'name'],
        rows: [[1, 'User 1'], [2, 'User 2']],
        rowCount: 2,
        executionTimeMs: 50,
      };

      const { executeQuery } = require('../../src/database/connection');
      executeQuery.mockResolvedValue(ok(smallResultSet));

      const request = {
        query: 'SELECT id, name FROM users LIMIT 2',
        parameters: [],
        maxRows: 100,
      };

      const result = await handleSqlQuery(request, mockConfig);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.rows.length).toBe(2);
        expect(result.value.truncated).toBe(false);
        expect(result.value.totalRows).toBeUndefined();
        expect(result.value.rowCount).toBe(2);
      }
    });

    it('should enforce LIMIT automatically when not present', async () => {
      const request = {
        query: 'SELECT * FROM users',
        parameters: [],
        maxRows: 250,
      };

      const { executeQuery } = require('../../src/database/connection');

      await handleSqlQuery(request, mockConfig);

      // Verify that LIMIT was added to the query
      expect(executeQuery).toHaveBeenCalledWith(
        mockConnection,
        'SELECT * FROM users LIMIT 250',
        [],
        30000
      );
    });

    it('should respect existing LIMIT when smaller than maxRows', async () => {
      const request = {
        query: 'SELECT * FROM users LIMIT 100',
        parameters: [],
        maxRows: 250,
      };

      const { executeQuery } = require('../../src/database/connection');

      await handleSqlQuery(request, mockConfig);

      // Verify that existing LIMIT is preserved
      expect(executeQuery).toHaveBeenCalledWith(
        mockConnection,
        'SELECT * FROM users LIMIT 100',
        [],
        30000
      );
    });

    it('should replace LIMIT when larger than maxRows', async () => {
      const request = {
        query: 'SELECT * FROM users LIMIT 2000',
        parameters: [],
        maxRows: 250,
      };

      const { executeQuery } = require('../../src/database/connection');

      await handleSqlQuery(request, mockConfig);

      // Verify that LIMIT was replaced with maxRows
      expect(executeQuery).toHaveBeenCalledWith(
        mockConnection,
        'SELECT * FROM users LIMIT 250',
        [],
        30000
      );
    });

    it('should enforce parameter count limits', async () => {
      const tooManyParams = Array.from({ length: 150 }, (_, i) => i);

      const request = {
        query: 'SELECT * FROM users WHERE id IN (' + tooManyParams.map(() => '?').join(',') + ')',
        parameters: tooManyParams,
      };

      const result = await handleSqlQuery(request, mockConfig);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toMatch(
          /too many parameters|parameter.*limit|Array must contain at most 100 element/i
        );
      }
    });
  });

  describe('enhanced createSqlQueryTool', () => {
    const mockConfig: DatabaseConfig = {
      type: 'sqlite',
      path: ':memory:',
    };

    it('should include maxRows in input schema', () => {
      const tool = createSqlQueryTool(mockConfig);
      const schema = tool.inputSchema;

      expect(schema.properties.maxRows).toEqual({
        type: 'number',
        description: 'Maximum rows to return (1-500, default 20)',
        minimum: 1,
        maximum: 500,
        default: 20,
      });
    });

    it('should limit parameters array size', () => {
      const tool = createSqlQueryTool(mockConfig);
      const schema = tool.inputSchema;

      expect(schema.properties.parameters).toHaveProperty('maxItems', 100);
    });

    it('should handle maxRows parameter in tool execution', async () => {
      const mockQueryResult: QueryResult = {
        columns: ['id', 'name'],
        rows: [[1, 'Test User']],
        rowCount: 1,
        executionTimeMs: 20.5,
        truncated: false,
      };

      const originalHandleSqlQuery = require('../../src/tools/sql-query-tool').handleSqlQuery;
      const mockHandleSqlQuery = jest.fn().mockResolvedValue(ok(mockQueryResult));
      require('../../src/tools/sql-query-tool').handleSqlQuery = mockHandleSqlQuery;

      const tool = createSqlQueryTool(mockConfig);

      const input = {
        query: 'SELECT id, name FROM users',
        parameters: [],
        maxRows: 250,
      };

      const result = await tool.handler(input);

      expect(result.isOk()).toBe(true);
      expect(mockHandleSqlQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'SELECT id, name FROM users',
          parameters: [],
          maxRows: 250,
        }),
        mockConfig,
        30000
      );

      // Restore original function
      require('../../src/tools/sql-query-tool').handleSqlQuery = originalHandleSqlQuery;
    });
  });
});
