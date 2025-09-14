import {
  createSQLiteConnection,
  executeSQLiteQuery,
  closeSQLiteConnection,
  SQLiteConnection,
} from '../../src/database/sqlite-adapter';
import type { DatabaseConfig } from '../../src/schemas/config';

// Mock sqlite3
const mockDatabase = {
  close: jest.fn(),
  run: jest.fn(),
  all: jest.fn(),
  get: jest.fn(),
};

jest.mock('sqlite3', () => {
  const mockConstructor = jest.fn();
  return {
    Database: mockConstructor,
    verbose: jest.fn(() => ({ Database: mockConstructor })),
    OPEN_READONLY: 1,
    OPEN_READWRITE: 2,
    OPEN_CREATE: 4,
  };
});

describe('sqlite adapter', () => {
  let sqlite3: any;

  beforeAll(() => {
    sqlite3 = require('sqlite3');
  });

  beforeEach(() => {
    // Reset mocks before each test
    Object.values(mockDatabase).forEach(fn => (fn as jest.Mock).mockClear());
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createSQLiteConnection', () => {
    it('should create connection with file path', async () => {
      const config: DatabaseConfig = {
        type: 'sqlite',
        path: '/path/to/test.db',
      };

      // Mock the database constructor to call callback asynchronously and return mock database
      sqlite3.Database.mockImplementation((_path: string, mode: any, callback: any) => {
        const actualCallback = typeof mode === 'function' ? mode : callback;
        // Simulate async behavior
        setImmediate(() => actualCallback(null));

        // Mock the validation query
        mockDatabase.get.mockImplementation((_query, cb) => {
          setImmediate(() => cb(null, { version: '3.36.0' }));
        });

        return mockDatabase;
      });

      const result = await createSQLiteConnection(config);

      expect(result.isOk()).toBe(true);
      expect(sqlite3.Database).toHaveBeenCalledWith(
        '/path/to/test.db',
        expect.any(Number),
        expect.any(Function)
      );

      if (result.isOk()) {
        expect(result.value.type).toBe('sqlite');
        expect(result.value.database).toBe(mockDatabase);
      }
    });

    it('should create in-memory connection', async () => {
      const config: DatabaseConfig = {
        type: 'sqlite',
        path: ':memory:',
      };

      // Mock the database constructor to call callback asynchronously
      sqlite3.Database.mockImplementation((_path: string, mode: any, callback: any) => {
        const actualCallback = typeof mode === 'function' ? mode : callback;
        setImmediate(() => actualCallback(null));

        // Mock the validation query
        mockDatabase.get.mockImplementation((_query, cb) => {
          setImmediate(() => cb(null, { version: '3.36.0' }));
        });

        return mockDatabase;
      });

      const result = await createSQLiteConnection(config);

      expect(result.isOk()).toBe(true);
      expect(sqlite3.Database).toHaveBeenCalledWith(
        ':memory:',
        expect.any(Number),
        expect.any(Function)
      );
    });

    it('should return error when database creation fails', async () => {
      const config: DatabaseConfig = {
        type: 'sqlite',
        path: '/invalid/path/test.db',
      };

      sqlite3.Database.mockImplementation((_path: string, mode: any, callback: any) => {
        const actualCallback = typeof mode === 'function' ? mode : callback;
        setImmediate(() => actualCallback(new Error('Failed to open database')));
        return mockDatabase;
      });

      const result = await createSQLiteConnection(config);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('Failed to create SQLite connection');
        expect(result.error.message).toContain('Failed to open SQLite database');
      }
    });

    it('should handle read-only database configuration', async () => {
      const config: DatabaseConfig = {
        type: 'sqlite',
        path: '/path/to/readonly.db',
      };

      sqlite3.Database.mockImplementation((_path: string, mode: any, callback: any) => {
        const actualCallback = typeof mode === 'function' ? mode : callback;
        setImmediate(() => actualCallback(null));

        // Mock the validation query
        mockDatabase.get.mockImplementation((_query, cb) => {
          setImmediate(() => cb(null, { version: '3.36.0' }));
        });

        return mockDatabase;
      });

      const result = await createSQLiteConnection(config, { readonly: true });

      expect(result.isOk()).toBe(true);
      expect(sqlite3.Database).toHaveBeenCalled();
    });

    it('should validate connection after creation', async () => {
      const config: DatabaseConfig = {
        type: 'sqlite',
        path: ':memory:',
      };

      sqlite3.Database.mockImplementation((_path: string, mode: any, callback: any) => {
        const actualCallback = typeof mode === 'function' ? mode : callback;
        setImmediate(() => actualCallback(null));

        // Mock the validation query
        mockDatabase.get.mockImplementation((_query, cb) => {
          setImmediate(() => cb(null, { version: '3.36.0' }));
        });

        return mockDatabase;
      });

      const result = await createSQLiteConnection(config);

      expect(result.isOk()).toBe(true);
      expect(mockDatabase.get).toHaveBeenCalledWith(
        'SELECT sqlite_version() as version',
        expect.any(Function)
      );
    });

    it('should handle validation errors', async () => {
      const config: DatabaseConfig = {
        type: 'sqlite',
        path: ':memory:',
      };

      sqlite3.Database.mockImplementation((_path: string, mode: any, callback: any) => {
        const actualCallback = typeof mode === 'function' ? mode : callback;
        setImmediate(() => actualCallback(null));

        // Mock the validation query to fail
        mockDatabase.get.mockImplementation((_query, cb) => {
          setImmediate(() => cb(new Error('Validation failed')));
        });

        // Mock close for cleanup
        mockDatabase.close.mockImplementation((cb) => {
          setImmediate(() => cb && cb());
        });

        return mockDatabase;
      });

      const result = await createSQLiteConnection(config);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('SQLite connection validation failed');
      }
    });
  });

  describe('executeSQLiteQuery', () => {
    let mockConnection: SQLiteConnection;
    let localMockDatabase: any;

    beforeEach(() => {
      localMockDatabase = {
        close: jest.fn(),
        run: jest.fn(),
        all: jest.fn(),
        get: jest.fn(),
      };

      mockConnection = {
        type: 'sqlite',
        database: localMockDatabase,
      };
    });

    it('should execute SELECT query successfully', async () => {
      const mockRows = [
        { id: 1, name: 'John', email: 'john@example.com' },
        { id: 2, name: 'Jane', email: 'jane@example.com' },
      ];

      localMockDatabase.all.mockImplementation((_query: string, paramsOrCallback: any, callback?: (err: Error | null, rows?: any[]) => void) => {
        const cb = typeof paramsOrCallback === 'function' ? paramsOrCallback : callback;
        if (cb) {
          setImmediate(() => cb(null, mockRows));
        }
      });

      const query = 'SELECT id, name, email FROM users WHERE id > ?';
      const params = [0];

      const result = await executeSQLiteQuery(mockConnection, query, params);

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

      expect(localMockDatabase.all).toHaveBeenCalledWith(
        query,
        params,
        expect.any(Function)
      );
    });

    it('should handle empty result sets', async () => {
      const mockRows: any[] = [];

      localMockDatabase.all.mockImplementation((_query: string, paramsOrCallback: any, callback?: (err: Error | null, rows?: any[]) => void) => {
        const cb = typeof paramsOrCallback === 'function' ? paramsOrCallback : callback;
        if (cb) {
          setImmediate(() => cb(null, mockRows));
        }
      });

      const query = 'SELECT id, name FROM users WHERE id = 999';

      const result = await executeSQLiteQuery(mockConnection, query, []);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.columns).toEqual([]);
        expect(result.value.rows).toEqual([]);
        expect(result.value.rowCount).toBe(0);
      }
    });

    it('should handle query execution errors', async () => {
      localMockDatabase.all.mockImplementation((_query: string, paramsOrCallback: any, callback?: (err: Error | null, rows?: any[]) => void) => {
        const cb = typeof paramsOrCallback === 'function' ? paramsOrCallback : callback;
        if (cb) {
          setImmediate(() => cb(new Error('no such table: non_existent_table')));
        }
      });

      const query = 'SELECT * FROM non_existent_table';

      const result = await executeSQLiteQuery(mockConnection, query, []);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('SQLite query execution failed');
        expect(result.error.message).toContain('no such table');
      }
    });

    it('should handle timeout errors', async () => {
      localMockDatabase.all.mockImplementation((_query: string, _params: any[], _callback: (err: Error | null, rows?: any[]) => void) => {
        // Simulate a long-running query that doesn't call the callback
        // The timeout mechanism should handle this
      });

      const query = 'SELECT * FROM large_table';
      const timeout = 100; // 100ms timeout

      const result = await executeSQLiteQuery(mockConnection, query, [], timeout);

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

      localMockDatabase.all.mockImplementation((_query: string, paramsOrCallback: any, callback?: (err: Error | null, rows?: any[]) => void) => {
        const cb = typeof paramsOrCallback === 'function' ? paramsOrCallback : callback;
        if (cb) {
          setImmediate(() => cb(null, mockRows));
        }
      });

      const query = 'SELECT id, name, description FROM users';

      const result = await executeSQLiteQuery(mockConnection, query, []);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.rows).toEqual([
          [1, 'John', null],
          [2, 'Jane', 'Test description'],
        ]);
      }
    });

    it('should handle various SQLite data types', async () => {
      const mockRows = [
        {
          id: 1,
          name: 'John',
          age: 30,
          salary: 50000.50,
          active: 1, // SQLite uses 1/0 for boolean
          created_at: '2023-12-01 10:00:00',
          data: '{"key":"value"}',
          blob_data: Buffer.from('binary data'),
        },
      ];

      localMockDatabase.all.mockImplementation((_query: string, paramsOrCallback: any, callback?: (err: Error | null, rows?: any[]) => void) => {
        const cb = typeof paramsOrCallback === 'function' ? paramsOrCallback : callback;
        if (cb) {
          setImmediate(() => cb(null, mockRows));
        }
      });

      const query = 'SELECT * FROM users WHERE id = ?';

      const result = await executeSQLiteQuery(mockConnection, query, [1]);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.rows[0]).toEqual([
          1,
          'John',
          30,
          50000.50,
          1,
          '2023-12-01 10:00:00',
          '{"key":"value"}',
          expect.any(Buffer),
        ]);
      }
    });

    it('should measure execution time accurately', async () => {
      const mockRows = [{ id: 1 }];

      localMockDatabase.all.mockImplementation((_query: string, paramsOrCallback: any, callback?: (err: Error | null, rows?: any[]) => void) => {
        const cb = typeof paramsOrCallback === 'function' ? paramsOrCallback : callback;
        if (cb) {
          setTimeout(() => cb(null, mockRows), 100);
        }
      });

      const query = 'SELECT id FROM users';

      const result = await executeSQLiteQuery(mockConnection, query, []);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.executionTimeMs).toBeGreaterThanOrEqual(100);
        expect(result.value.executionTimeMs).toBeLessThan(200);
      }
    });

    it('should extract columns from result set correctly', async () => {
      const mockRows = [
        { user_id: 1, full_name: 'John Doe', email_address: 'john@example.com' },
        { user_id: 2, full_name: 'Jane Doe', email_address: 'jane@example.com' },
      ];

      localMockDatabase.all.mockImplementation((_query: string, paramsOrCallback: any, callback?: (err: Error | null, rows?: any[]) => void) => {
        const cb = typeof paramsOrCallback === 'function' ? paramsOrCallback : callback;
        if (cb) {
          setImmediate(() => cb(null, mockRows));
        }
      });

      const query = 'SELECT user_id, full_name, email_address FROM users';

      const result = await executeSQLiteQuery(mockConnection, query, []);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.columns).toEqual(['user_id', 'full_name', 'email_address']);
      }
    });

    it('should handle queries with no parameters', async () => {
      const mockRows = [{ count: 5 }];

      localMockDatabase.all.mockImplementation((_query: string, params: any, callback?: (err: Error | null, rows?: any[]) => void) => {
        // When no parameters are provided, SQLite callback signature changes
        if (typeof params === 'function') {
          setImmediate(() => params(null, mockRows));
        } else if (callback) {
          setImmediate(() => callback(null, mockRows));
        }
      });

      const query = 'SELECT COUNT(*) as count FROM users';

      const result = await executeSQLiteQuery(mockConnection, query);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.rows).toEqual([[5]]);
        expect(result.value.columns).toEqual(['count']);
      }
    });
  });

  describe('closeSQLiteConnection', () => {
    it('should close connection successfully', async () => {
      const mockDatabase = {
        close: jest.fn().mockImplementation((callback: (err?: Error | null) => void) => callback(null)),
        run: jest.fn(),
        all: jest.fn(),
        get: jest.fn(),
      };

      const connection: SQLiteConnection = {
        type: 'sqlite',
        database: mockDatabase as any,
      };

      const result = await closeSQLiteConnection(connection);

      expect(result.isOk()).toBe(true);
      expect(mockDatabase.close).toHaveBeenCalled();
    });

    it('should handle close errors', async () => {
      const mockDatabase = {
        close: jest.fn().mockImplementation((callback: (err?: Error | null) => void) =>
          callback(new Error('Failed to close database'))
        ),
        run: jest.fn(),
        all: jest.fn(),
        get: jest.fn(),
      };

      const connection: SQLiteConnection = {
        type: 'sqlite',
        database: mockDatabase as any,
      };

      const result = await closeSQLiteConnection(connection);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('Failed to close SQLite connection');
        expect(result.error.message).toContain('Failed to close database');
      }
    });

    it('should handle timeout during close', async () => {
      const mockDatabase = {
        close: jest.fn().mockImplementation((_callback: (err?: Error | null) => void) => {
          // Simulate a close operation that never calls the callback
        }),
        run: jest.fn(),
        all: jest.fn(),
        get: jest.fn(),
      };

      const connection: SQLiteConnection = {
        type: 'sqlite',
        database: mockDatabase as any,
      };

      const result = await closeSQLiteConnection(connection, 100);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('Connection close timeout');
      }
    });
  });

  describe('SQLite-specific features', () => {
    let mockConnection: SQLiteConnection;
    let localMockDatabase: any;

    beforeEach(() => {
      localMockDatabase = {
        close: jest.fn(),
        run: jest.fn(),
        all: jest.fn(),
        get: jest.fn(),
      };

      mockConnection = {
        type: 'sqlite',
        database: localMockDatabase,
      };
    });

    it('should handle pragma queries', async () => {
      const mockRows = [{ foreign_keys: 1 }];

      localMockDatabase.all.mockImplementation((_query: string, paramsOrCallback: any, callback?: (err: Error | null, rows?: any[]) => void) => {
        const cb = typeof paramsOrCallback === 'function' ? paramsOrCallback : callback;
        if (cb) {
          setImmediate(() => cb(null, mockRows));
        }
      });

      const query = 'PRAGMA foreign_keys';

      const result = await executeSQLiteQuery(mockConnection, query, []);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.rows).toEqual([[1]]);
      }
    });

    it('should handle schema information queries', async () => {
      const mockRows = [
        { name: 'users', type: 'table' },
        { name: 'posts', type: 'table' },
        { name: 'idx_users_email', type: 'index' },
      ];

      localMockDatabase.all.mockImplementation((_query: string, paramsOrCallback: any, callback?: (err: Error | null, rows?: any[]) => void) => {
        const cb = typeof paramsOrCallback === 'function' ? paramsOrCallback : callback;
        if (cb) {
          setImmediate(() => cb(null, mockRows));
        }
      });

      const query = 'SELECT name, type FROM sqlite_master WHERE type IN (?, ?)';

      const result = await executeSQLiteQuery(mockConnection, query, ['table', 'index']);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.rowCount).toBe(3);
        expect(result.value.columns).toEqual(['name', 'type']);
      }
    });

    it('should handle JSON operations (SQLite 3.38+)', async () => {
      const mockRows = [
        { id: 1, name: 'John' },
      ];

      localMockDatabase.all.mockImplementation((_query: string, paramsOrCallback: any, callback?: (err: Error | null, rows?: any[]) => void) => {
        const cb = typeof paramsOrCallback === 'function' ? paramsOrCallback : callback;
        if (cb) {
          setImmediate(() => cb(null, mockRows));
        }
      });

      const query = "SELECT id, JSON_EXTRACT(data, '$.name') as name FROM users WHERE JSON_EXTRACT(data, '$.active') = ?";

      const result = await executeSQLiteQuery(mockConnection, query, [true]);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.rows).toEqual([[1, 'John']]);
      }
    });
  });

  describe('error handling edge cases', () => {
    let mockConnection: SQLiteConnection;
    let localMockDatabase: any;

    beforeEach(() => {
      localMockDatabase = {
        close: jest.fn(),
        run: jest.fn(),
        all: jest.fn(),
        get: jest.fn(),
      };

      mockConnection = {
        type: 'sqlite',
        database: localMockDatabase,
      };
    });

    it('should handle database busy errors', async () => {
      localMockDatabase.all.mockImplementation((_query: string, paramsOrCallback: any, callback?: (err: Error | null, rows?: any[]) => void) => {
        const cb = typeof paramsOrCallback === 'function' ? paramsOrCallback : callback;
        if (cb) {
          setImmediate(() => cb(new Error('SQLITE_BUSY: database is locked')));
        }
      });

      const query = 'SELECT * FROM users';

      const result = await executeSQLiteQuery(mockConnection, query, []);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('SQLITE_BUSY');
      }
    });

    it('should handle corrupt database errors', async () => {
      localMockDatabase.all.mockImplementation((_query: string, paramsOrCallback: any, callback?: (err: Error | null, rows?: any[]) => void) => {
        const cb = typeof paramsOrCallback === 'function' ? paramsOrCallback : callback;
        if (cb) {
          setImmediate(() => cb(new Error('SQLITE_CORRUPT: database disk image is malformed')));
        }
      });

      const query = 'SELECT * FROM users';

      const result = await executeSQLiteQuery(mockConnection, query, []);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('SQLITE_CORRUPT');
      }
    });
  });
});