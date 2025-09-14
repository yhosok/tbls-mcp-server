import {
  createConnection,
  executeQuery,
  closeConnection,
  ConnectionPool,
} from '../../src/database/connection';
import type { DatabaseConfig } from '../../src/schemas/config';

// Mock implementations for testing
jest.mock('mysql2', () => ({
  createPool: jest.fn(),
}));

jest.mock('sqlite3', () => ({
  Database: jest.fn(),
}));

describe('database connection', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createConnection', () => {
    it('should create MySQL connection with connection string', async () => {
      const config: DatabaseConfig = {
        type: 'mysql',
        connectionString: 'mysql://user:pass@localhost:3306/testdb',
      };

      const mockPromisePool = {
        execute: jest.fn().mockResolvedValue([[], []]),
      };

      const mockPool = {
        promise: jest.fn().mockReturnValue(mockPromisePool),
        end: jest.fn(),
      };

      const mysql2 = require('mysql2');
      mysql2.createPool.mockReturnValue(mockPool);

      const result = await createConnection(config);

      expect(result.isOk()).toBe(true);
      expect(mysql2.createPool).toHaveBeenCalledWith({
        uri: 'mysql://user:pass@localhost:3306/testdb',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        multipleStatements: false,
      });
    });

    it('should create MySQL connection with individual parameters', async () => {
      const config: DatabaseConfig = {
        type: 'mysql',
        host: 'localhost',
        port: 3306,
        user: 'testuser',
        password: 'testpass',
        database: 'testdb',
      };

      const mockPromisePool = {
        execute: jest.fn().mockResolvedValue([[], []]),
      };

      const mockPool = {
        promise: jest.fn().mockReturnValue(mockPromisePool),
        end: jest.fn(),
      };

      const mysql2 = require('mysql2');
      mysql2.createPool.mockReturnValue(mockPool);

      const result = await createConnection(config);

      expect(result.isOk()).toBe(true);
      expect(mysql2.createPool).toHaveBeenCalledWith({
        host: 'localhost',
        port: 3306,
        user: 'testuser',
        password: 'testpass',
        database: 'testdb',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        multipleStatements: false,
      });
    });

    it('should create SQLite connection with file path', async () => {
      const config: DatabaseConfig = {
        type: 'sqlite',
        path: '/path/to/test.db',
      };

      const mockDatabase = {
        close: jest.fn(),
        run: jest.fn(),
        all: jest.fn(),
        get: jest.fn(),
      };

      const sqlite3 = require('sqlite3');
      sqlite3.Database.mockImplementation((_path: string, mode: any, callback: any) => {
        const actualCallback = typeof mode === 'function' ? mode : callback;
        setImmediate(() => actualCallback(null));

        // Mock the validation query
        mockDatabase.get = jest.fn().mockImplementation((_query, cb) => {
          setImmediate(() => cb(null, { version: '3.36.0' }));
        });

        return mockDatabase;
      });

      const result = await createConnection(config);

      expect(result.isOk()).toBe(true);
      expect(sqlite3.Database).toHaveBeenCalledWith(
        '/path/to/test.db',
        expect.any(Number),
        expect.any(Function)
      );
    });

    it('should create SQLite in-memory connection', async () => {
      const config: DatabaseConfig = {
        type: 'sqlite',
        path: ':memory:',
      };

      const mockDatabase = {
        close: jest.fn(),
        run: jest.fn(),
        all: jest.fn(),
        get: jest.fn(),
      };

      const sqlite3 = require('sqlite3');
      sqlite3.Database.mockImplementation((_path: string, mode: any, callback: any) => {
        const actualCallback = typeof mode === 'function' ? mode : callback;
        setImmediate(() => actualCallback(null));

        // Mock the validation query
        mockDatabase.get = jest.fn().mockImplementation((_query, cb) => {
          setImmediate(() => cb(null, { version: '3.36.0' }));
        });

        return mockDatabase;
      });

      const result = await createConnection(config);

      expect(result.isOk()).toBe(true);
      expect(sqlite3.Database).toHaveBeenCalledWith(
        ':memory:',
        expect.any(Number),
        expect.any(Function)
      );
    });

    it('should return error for MySQL connection failure', async () => {
      const config: DatabaseConfig = {
        type: 'mysql',
        connectionString: 'mysql://user:pass@localhost:3306/testdb',
      };

      const mysql2 = require('mysql2');
      mysql2.createPool.mockImplementation(() => {
        throw new Error('Connection failed');
      });

      const result = await createConnection(config);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('Connection failed');
      }
    });

    it('should return error for SQLite connection failure', async () => {
      const config: DatabaseConfig = {
        type: 'sqlite',
        path: '/invalid/path/test.db',
      };

      const sqlite3 = require('sqlite3');
      sqlite3.Database.mockImplementation((_path: string, mode: any, callback: any) => {
        const actualCallback = typeof mode === 'function' ? mode : callback;
        setImmediate(() => actualCallback(new Error('Failed to open database')));
        return {
          close: jest.fn(),
          run: jest.fn(),
          all: jest.fn(),
          get: jest.fn(),
        };
      });

      const result = await createConnection(config);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('Failed to open SQLite database');
      }
    });
  });

  describe('executeQuery', () => {
    it('should execute SELECT query on MySQL connection', async () => {
      const mockRows = [
        { id: 1, name: 'John' },
        { id: 2, name: 'Jane' },
      ];

      const mockFields = [
        { name: 'id' },
        { name: 'name' },
      ];

      const mockConnection = {
        type: 'mysql' as const,
        pool: {
          promise: () => ({
            execute: jest.fn().mockResolvedValue([mockRows, mockFields]),
          }),
        } as any,
      };

      const query = 'SELECT * FROM users WHERE id > ?';
      const params = [0];

      const result = await executeQuery(mockConnection, query, params);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.rows).toEqual([
          [1, 'John'],
          [2, 'Jane'],
        ]);
        expect(result.value.columns).toEqual(['id', 'name']);
        expect(result.value.rowCount).toBe(2);
        expect(result.value.executionTimeMs).toBeGreaterThanOrEqual(0);
      }
    });

    it('should execute SELECT query on SQLite connection', async () => {
      const mockRows = [
        { id: 1, name: 'John' },
        { id: 2, name: 'Jane' },
      ];

      const mockConnection = {
        type: 'sqlite' as const,
        database: {
          all: jest.fn().mockImplementation((_query: string, _params: any[], callback: (err: Error | null, rows?: any[]) => void) => {
            callback(null, mockRows);
          }),
        } as any,
      };

      const query = 'SELECT * FROM users WHERE id > ?';
      const params = [0];

      const result = await executeQuery(mockConnection, query, params);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.rows).toEqual([
          [1, 'John'],
          [2, 'Jane'],
        ]);
        expect(result.value.columns).toEqual(['id', 'name']);
        expect(result.value.rowCount).toBe(2);
        expect(result.value.executionTimeMs).toBeGreaterThanOrEqual(0);
      }
    });

    it('should reject non-SELECT queries', async () => {
      const mockConnection = {
        type: 'mysql' as const,
        pool: {
          promise: () => ({
            execute: jest.fn(),
          }),
        } as any,
      };

      const query = 'INSERT INTO users (name) VALUES (?)';
      const params = ['John'];

      const result = await executeQuery(mockConnection, query, params);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('Only SELECT, PRAGMA, SHOW, DESCRIBE, and EXPLAIN queries are allowed');
      }
    });

    it('should handle SQL injection attempts', async () => {
      const mockConnection = {
        type: 'mysql' as const,
        pool: {
          promise: () => ({
            execute: jest.fn(),
          }),
        } as any,
      };

      const maliciousQuery = "SELECT * FROM users WHERE id = 1; DROP TABLE users; --";

      const result = await executeQuery(mockConnection, maliciousQuery, []);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('Multiple statements are not allowed');
      }
    });

    it('should handle query timeout', async () => {
      const mockConnection = {
        type: 'mysql' as const,
        pool: {
          promise: () => ({
            execute: jest.fn().mockImplementation(() => {
              return new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Query timeout')), 100);
              });
            }),
          }),
        } as any,
      };

      const query = 'SELECT * FROM users';

      const result = await executeQuery(mockConnection, query, [], 50);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('Query execution timeout');
      }
    });

    it('should handle database errors', async () => {
      const mockConnection = {
        type: 'mysql' as const,
        pool: {
          promise: () => ({
            execute: jest.fn().mockRejectedValue(new Error('Database error')),
          }),
        } as any,
      };

      const query = 'SELECT * FROM non_existent_table';

      const result = await executeQuery(mockConnection, query, []);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('Database error');
      }
    });

    it('should handle empty result sets', async () => {
      const mockConnection = {
        type: 'mysql' as const,
        pool: {
          promise: () => ({
            execute: jest.fn().mockResolvedValue([[], []]),
          }),
        } as any,
      };

      const query = 'SELECT * FROM users WHERE id = 999';

      const result = await executeQuery(mockConnection, query, []);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.rows).toEqual([]);
        expect(result.value.rowCount).toBe(0);
      }
    });

    it('should sanitize query parameters', async () => {
      const mockRows = [{ id: 1, name: 'John' }];
      const mockFields = [{ name: 'id' }, { name: 'name' }];

      const mockExecute = jest.fn().mockResolvedValue([mockRows, mockFields]);
      const mockPromisePool = {
        execute: mockExecute,
      };

      const mockConnection = {
        type: 'mysql' as const,
        pool: {
          promise: () => mockPromisePool,
        } as any,
      };

      const query = 'SELECT * FROM users WHERE name = ?';
      const params = ["'; DROP TABLE users; --"];

      const result = await executeQuery(mockConnection, query, params);

      expect(result.isOk()).toBe(true);
      // Parameters should be safely handled by the database driver
      expect(mockExecute).toHaveBeenCalledWith(query, params);
    });
  });

  describe('closeConnection', () => {
    it('should close MySQL connection', async () => {
      const mockPool = {
        end: jest.fn().mockImplementation((callback: (error?: Error) => void) => {
          setImmediate(() => callback());
        }),
      };

      const connection = {
        type: 'mysql' as const,
        pool: mockPool as any,
      };

      const result = await closeConnection(connection);

      expect(result.isOk()).toBe(true);
      expect(mockPool.end).toHaveBeenCalled();
    });

    it('should close SQLite connection', async () => {
      const mockDatabase = {
        close: jest.fn().mockImplementation((callback: (err?: Error | null) => void) => callback()),
      };

      const connection = {
        type: 'sqlite' as const,
        database: mockDatabase as any,
      };

      const result = await closeConnection(connection);

      expect(result.isOk()).toBe(true);
      expect(mockDatabase.close).toHaveBeenCalled();
    });

    it('should handle MySQL connection close errors', async () => {
      const mockPool = {
        end: jest.fn().mockImplementation((callback: (error?: Error) => void) => {
          setImmediate(() => callback(new Error('Failed to close')));
        }),
      };

      const connection = {
        type: 'mysql' as const,
        pool: mockPool as any,
      };

      const result = await closeConnection(connection);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('Failed to close');
      }
    });

    it('should handle SQLite connection close errors', async () => {
      const mockDatabase = {
        close: jest.fn().mockImplementation((callback: (err?: Error | null) => void) =>
          callback(new Error('Failed to close'))
        ),
      };

      const connection = {
        type: 'sqlite' as const,
        database: mockDatabase as any,
      };

      const result = await closeConnection(connection);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('Failed to close');
      }
    });
  });

  describe('ConnectionPool', () => {
    it('should manage connection lifecycle', async () => {
      const config: DatabaseConfig = {
        type: 'sqlite',
        path: ':memory:',
      };

      const mockDatabase = {
        close: jest.fn(),
        run: jest.fn(),
        all: jest.fn(),
        get: jest.fn(),
      };

      const sqlite3 = require('sqlite3');
      sqlite3.Database.mockImplementation((_path: string, mode: any, callback: any) => {
        const actualCallback = typeof mode === 'function' ? mode : callback;
        setImmediate(() => actualCallback(null));

        // Mock the validation query
        mockDatabase.get = jest.fn().mockImplementation((_query, cb) => {
          setImmediate(() => cb(null, { version: '3.36.0' }));
        });

        return mockDatabase;
      });

      const pool = new ConnectionPool();

      const connection1 = await pool.getConnection(config);
      const connection2 = await pool.getConnection(config);

      expect(connection1.isOk()).toBe(true);
      expect(connection2.isOk()).toBe(true);

      // Should reuse the same connection for the same config
      if (connection1.isOk() && connection2.isOk()) {
        expect(connection1.value).toBe(connection2.value);
      }

      await pool.closeAll();
      expect(mockDatabase.close).toHaveBeenCalled();
    });

    it('should create separate connections for different configs', async () => {
      const config1: DatabaseConfig = {
        type: 'sqlite',
        path: ':memory:',
      };

      const config2: DatabaseConfig = {
        type: 'sqlite',
        path: '/tmp/test.db',
      };

      const mockDatabase1 = { close: jest.fn(), run: jest.fn(), all: jest.fn(), get: jest.fn() };
      const mockDatabase2 = { close: jest.fn(), run: jest.fn(), all: jest.fn(), get: jest.fn() };

      const sqlite3 = require('sqlite3');
      sqlite3.Database
        .mockImplementationOnce((_path: string, mode: any, callback: any) => {
          const actualCallback = typeof mode === 'function' ? mode : callback;
          setImmediate(() => actualCallback(null));

          mockDatabase1.get = jest.fn().mockImplementation((_query, cb) => {
            setImmediate(() => cb(null, { version: '3.36.0' }));
          });

          return mockDatabase1;
        })
        .mockImplementationOnce((_path: string, mode: any, callback: any) => {
          const actualCallback = typeof mode === 'function' ? mode : callback;
          setImmediate(() => actualCallback(null));

          mockDatabase2.get = jest.fn().mockImplementation((_query, cb) => {
            setImmediate(() => cb(null, { version: '3.36.0' }));
          });

          return mockDatabase2;
        });

      const pool = new ConnectionPool();

      const connection1 = await pool.getConnection(config1);
      const connection2 = await pool.getConnection(config2);

      expect(connection1.isOk()).toBe(true);
      expect(connection2.isOk()).toBe(true);

      if (connection1.isOk() && connection2.isOk()) {
        expect(connection1.value).not.toBe(connection2.value);
      }

      await pool.closeAll();
      expect(mockDatabase1.close).toHaveBeenCalled();
      expect(mockDatabase2.close).toHaveBeenCalled();
    });
  });
});