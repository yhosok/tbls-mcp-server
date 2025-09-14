import {
  createMySQLConnection,
  executeMySQLQuery,
  closeMySQLConnection,
  MySQLConnection,
} from '../../src/database/mysql-adapter';
import type { DatabaseConfig } from '../../src/schemas/config';

// Mock mysql2
jest.mock('mysql2', () => ({
  createPool: jest.fn(),
}));

describe('mysql adapter', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createMySQLConnection', () => {
    it('should create connection with connection string', async () => {
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

      const result = await createMySQLConnection(config);

      expect(result.isOk()).toBe(true);
      expect(mysql2.createPool).toHaveBeenCalledWith({
        uri: 'mysql://user:pass@localhost:3306/testdb',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        multipleStatements: false,
      });

      if (result.isOk()) {
        expect(result.value.type).toBe('mysql');
        expect(result.value.pool).toBe(mockPool);
      }
    });

    it('should create connection with individual parameters', async () => {
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

      const result = await createMySQLConnection(config);

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

    it('should use default port when not specified', async () => {
      const config: DatabaseConfig = {
        type: 'mysql',
        host: 'localhost',
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

      const result = await createMySQLConnection(config);

      expect(result.isOk()).toBe(true);
      expect(mysql2.createPool).toHaveBeenCalledWith({
        host: 'localhost',
        port: 3306, // default port
        user: 'testuser',
        password: 'testpass',
        database: 'testdb',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        multipleStatements: false,
      });
    });

    it('should return error when pool creation fails', async () => {
      const config: DatabaseConfig = {
        type: 'mysql',
        connectionString: 'mysql://user:pass@localhost:3306/testdb',
      };

      const mysql2 = require('mysql2');
      mysql2.createPool.mockImplementation(() => {
        throw new Error('Pool creation failed');
      });

      const result = await createMySQLConnection(config);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('Failed to create MySQL connection');
        expect(result.error.message).toContain('Pool creation failed');
      }
    });

    it('should handle connection validation errors', async () => {
      const config: DatabaseConfig = {
        type: 'mysql',
        connectionString: 'mysql://user:pass@localhost:3306/testdb',
      };

      const mockPool = {
        promise: jest.fn(() => ({
          execute: jest.fn().mockRejectedValue(new Error('Connection validation failed')),
        })),
        end: jest.fn(),
      };

      const mysql2 = require('mysql2');
      mysql2.createPool.mockReturnValue(mockPool);

      const result = await createMySQLConnection(config);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('MySQL connection validation failed');
      }
    });
  });

  describe('executeMySQLQuery', () => {
    let mockConnection: MySQLConnection;

    beforeEach(() => {
      mockConnection = {
        type: 'mysql',
        pool: {
          promise: jest.fn(),
          end: jest.fn(),
        } as any,
      };
    });

    it('should execute SELECT query successfully', async () => {
      const mockRows = [
        { id: 1, name: 'John', email: 'john@example.com' },
        { id: 2, name: 'Jane', email: 'jane@example.com' },
      ];

      const mockFields = [
        { name: 'id' },
        { name: 'name' },
        { name: 'email' },
      ];

      (mockConnection.pool.promise as jest.Mock).mockReturnValue({
        execute: jest.fn().mockResolvedValue([mockRows, mockFields]),
      });

      const query = 'SELECT id, name, email FROM users WHERE id > ?';
      const params = [0];

      const result = await executeMySQLQuery(mockConnection, query, params);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.columns).toEqual(['id', 'name', 'email']);
        expect(result.value.rows).toEqual([
          [1, 'John', 'john@example.com'],
          [2, 'Jane', 'jane@example.com'],
        ]);
        expect(result.value.rowCount).toBe(2);
        expect(result.value.executionTimeMs).toBeGreaterThanOrEqual(0);
      }
    });

    it('should handle empty result sets', async () => {
      const mockRows: any[] = [];
      const mockFields = [
        { name: 'id' },
        { name: 'name' },
      ];

      (mockConnection.pool.promise as jest.Mock).mockReturnValue({
        execute: jest.fn().mockResolvedValue([mockRows, mockFields]),
      });

      const query = 'SELECT id, name FROM users WHERE id = 999';

      const result = await executeMySQLQuery(mockConnection, query, []);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.columns).toEqual(['id', 'name']);
        expect(result.value.rows).toEqual([]);
        expect(result.value.rowCount).toBe(0);
      }
    });

    it('should handle query execution errors', async () => {
      (mockConnection.pool.promise as jest.Mock).mockReturnValue({
        execute: jest.fn().mockRejectedValue(new Error('Table not found')),
      });

      const query = 'SELECT * FROM non_existent_table';

      const result = await executeMySQLQuery(mockConnection, query, []);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('MySQL query execution failed');
        expect(result.error.message).toContain('Table not found');
      }
    });

    it('should handle timeout errors', async () => {
      (mockConnection.pool.promise as jest.Mock).mockReturnValue({
        execute: jest.fn().mockImplementation(() => {
          return new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Query timeout')), 100);
          });
        }),
      });

      const query = 'SELECT * FROM large_table';
      const timeout = 50; // 50ms timeout

      const result = await executeMySQLQuery(mockConnection, query, [], timeout);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('Query execution timeout');
      }
    });

    it('should convert NULL values correctly', async () => {
      const mockRows = [
        { id: 1, name: 'John', description: null },
        { id: 2, name: 'Jane', description: 'Test description' },
      ];

      const mockFields = [
        { name: 'id' },
        { name: 'name' },
        { name: 'description' },
      ];

      (mockConnection.pool.promise as jest.Mock).mockReturnValue({
        execute: jest.fn().mockResolvedValue([mockRows, mockFields]),
      });

      const query = 'SELECT id, name, description FROM users';

      const result = await executeMySQLQuery(mockConnection, query, []);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.rows).toEqual([
          [1, 'John', null],
          [2, 'Jane', 'Test description'],
        ]);
      }
    });

    it('should handle various MySQL data types', async () => {
      const now = new Date();
      const mockRows = [
        {
          id: 1,
          name: 'John',
          age: 30,
          salary: 50000.50,
          active: true,
          created_at: now,
          data: JSON.stringify({ key: 'value' }),
        },
      ];

      const mockFields = [
        { name: 'id' },
        { name: 'name' },
        { name: 'age' },
        { name: 'salary' },
        { name: 'active' },
        { name: 'created_at' },
        { name: 'data' },
      ];

      (mockConnection.pool.promise as jest.Mock).mockReturnValue({
        execute: jest.fn().mockResolvedValue([mockRows, mockFields]),
      });

      const query = 'SELECT * FROM users WHERE id = ?';

      const result = await executeMySQLQuery(mockConnection, query, [1]);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.rows[0]).toEqual([
          1,
          'John',
          30,
          50000.50,
          true,
          now,
          '{"key":"value"}',
        ]);
      }
    });

    it('should measure execution time accurately', async () => {
      const mockRows = [{ id: 1 }];
      const mockFields = [{ name: 'id' }];

      (mockConnection.pool.promise as jest.Mock).mockReturnValue({
        execute: jest.fn().mockImplementation(() => {
          return new Promise((resolve) => {
            setTimeout(() => resolve([mockRows, mockFields]), 100);
          });
        }),
      });

      const query = 'SELECT id FROM users';

      const result = await executeMySQLQuery(mockConnection, query, []);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.executionTimeMs).toBeGreaterThanOrEqual(100);
        expect(result.value.executionTimeMs).toBeLessThan(200);
      }
    });
  });

  describe('closeMySQLConnection', () => {
    it('should close connection successfully', async () => {
      const mockPool = {
        end: jest.fn().mockImplementation((callback: (error?: Error) => void) => {
          setImmediate(() => callback());
        }),
      };

      const connection: MySQLConnection = {
        type: 'mysql',
        pool: mockPool as any,
      };

      const result = await closeMySQLConnection(connection);

      expect(result.isOk()).toBe(true);
      expect(mockPool.end).toHaveBeenCalled();
    });

    it('should handle close errors', async () => {
      const mockPool = {
        end: jest.fn().mockImplementation((callback: (error?: Error) => void) => {
          setImmediate(() => callback(new Error('Failed to close pool')));
        }),
      };

      const connection: MySQLConnection = {
        type: 'mysql',
        pool: mockPool as any,
      };

      const result = await closeMySQLConnection(connection);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('Failed to close MySQL connection');
        expect(result.error.message).toContain('Failed to close pool');
      }
    });

    it('should handle close operation that resolves after delay', async () => {
      const mockPool = {
        end: jest.fn().mockImplementation((callback: (error?: Error) => void) => {
          // Simulate a close operation that takes some time but eventually succeeds
          setTimeout(() => callback(), 50);
        }),
      };

      const connection: MySQLConnection = {
        type: 'mysql',
        pool: mockPool as any,
      };

      const result = await closeMySQLConnection(connection);

      expect(result.isOk()).toBe(true);
      expect(mockPool.end).toHaveBeenCalled();
    });
  });

  describe('connection string parsing', () => {
    it('should parse complex connection strings', async () => {
      const config: DatabaseConfig = {
        type: 'mysql',
        connectionString: 'mysql://user:complex%40pass@db.example.com:3307/prod_db?charset=utf8mb4&timezone=Z',
      };

      const mockPool = {
        promise: jest.fn(() => ({
          execute: jest.fn().mockResolvedValue([[], []]),
        })),
        end: jest.fn(),
      };

      const mysql2 = require('mysql2');
      mysql2.createPool.mockReturnValue(mockPool);

      const result = await createMySQLConnection(config);

      expect(result.isOk()).toBe(true);
      expect(mysql2.createPool).toHaveBeenCalledWith({
        uri: config.connectionString,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        multipleStatements: false,
      });
    });
  });

  describe('connection pooling configuration', () => {
    it('should configure pool with custom limits', async () => {
      const config: DatabaseConfig = {
        type: 'mysql',
        host: 'localhost',
        user: 'test',
        password: 'test',
        database: 'test',
      };

      const mockPool = {
        promise: jest.fn(() => ({
          execute: jest.fn().mockResolvedValue([[], []]),
        })),
        end: jest.fn(),
      };

      const mysql2 = require('mysql2');
      mysql2.createPool.mockReturnValue(mockPool);

      const result = await createMySQLConnection(config, {
        connectionLimit: 20,
        queueLimit: 10,
      });

      expect(result.isOk()).toBe(true);
      expect(mysql2.createPool).toHaveBeenCalledWith({
        host: 'localhost',
        port: 3306,
        user: 'test',
        password: 'test',
        database: 'test',
        waitForConnections: true,
        connectionLimit: 20,
        queueLimit: 10,
        multipleStatements: false,
      });
    });
  });
});