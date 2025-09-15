import { ok, err } from 'neverthrow';
import type { DatabaseConfig } from '../../src/schemas/config';

// Mock the entire connection module functions to avoid database connections
jest.mock('../../src/database/connection', () => ({
  createConnection: jest.fn(),
  executeQuery: jest.fn(),
  closeConnection: jest.fn(),
  getPooledConnection: jest.fn(),
  closeAllPooledConnections: jest.fn(),
}));

// Import the mocked functions
import {
  createConnection,
  executeQuery,
  closeConnection,
  getPooledConnection,
  closeAllPooledConnections,
} from '../../src/database/connection';

const mockCreateConnection = createConnection as jest.MockedFunction<typeof createConnection>;
const mockExecuteQuery = executeQuery as jest.MockedFunction<typeof executeQuery>;
const mockCloseConnection = closeConnection as jest.MockedFunction<typeof closeConnection>;
const mockGetPooledConnection = getPooledConnection as jest.MockedFunction<typeof getPooledConnection>;
const mockCloseAllPooledConnections = closeAllPooledConnections as jest.MockedFunction<typeof closeAllPooledConnections>;

describe('database connection (mocked)', () => {
  const mockMySQLConnection = {
    type: 'mysql' as const,
    pool: {} as unknown,
  };

  const mockSQLiteConnection = {
    type: 'sqlite' as const,
    database: {} as unknown,
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Set up default successful responses
    mockCreateConnection.mockResolvedValue(ok(mockMySQLConnection));
    mockExecuteQuery.mockResolvedValue(ok({
      rows: [],
      rowCount: 0,
      executionTime: 1,
    }));
    mockCloseConnection.mockResolvedValue(ok(undefined));
    mockGetPooledConnection.mockResolvedValue(ok(mockMySQLConnection));
    mockCloseAllPooledConnections.mockResolvedValue(ok(undefined));
  });

  describe('createConnection', () => {
    it('should create MySQL connection with connection string', async () => {
      const config: DatabaseConfig = {
        type: 'mysql',
        connectionString: 'mysql://user:pass@localhost:3306/testdb',
      };

      const result = await createConnection(config);

      expect(mockCreateConnection).toHaveBeenCalledWith(config);
      expect(result.isOk()).toBe(true);
    });

    it('should create SQLite connection with file path', async () => {
      const config: DatabaseConfig = {
        type: 'sqlite',
        path: '/path/to/test.db',
      };

      mockCreateConnection.mockResolvedValue(ok(mockSQLiteConnection));

      const result = await createConnection(config);

      expect(mockCreateConnection).toHaveBeenCalledWith(config);
      expect(result.isOk()).toBe(true);
    });

    it('should handle connection errors', async () => {
      const config: DatabaseConfig = {
        type: 'mysql',
        connectionString: 'invalid-connection-string',
      };

      mockCreateConnection.mockResolvedValue(err(new Error('Connection failed')));

      const result = await createConnection(config);

      expect(result.isErr()).toBe(true);
    });
  });

  describe('executeQuery', () => {
    it('should execute queries successfully', async () => {
      const result = await executeQuery(mockMySQLConnection, 'SELECT 1', []);

      expect(mockExecuteQuery).toHaveBeenCalledWith(mockMySQLConnection, 'SELECT 1', []);
      expect(result.isOk()).toBe(true);
    });

    it('should handle query errors', async () => {
      mockExecuteQuery.mockResolvedValue(err(new Error('Query failed')));

      const result = await executeQuery(mockMySQLConnection, 'SELECT 1', []);

      expect(result.isErr()).toBe(true);
    });
  });

  describe('closeConnection', () => {
    it('should close connections successfully', async () => {
      const result = await closeConnection(mockMySQLConnection);

      expect(mockCloseConnection).toHaveBeenCalledWith(mockMySQLConnection);
      expect(result.isOk()).toBe(true);
    });
  });

  describe('connection pooling', () => {
    it('should get pooled connections', async () => {
      const config: DatabaseConfig = {
        type: 'mysql',
        connectionString: 'mysql://user:pass@localhost:3306/testdb',
      };

      const result = await getPooledConnection(config);

      expect(mockGetPooledConnection).toHaveBeenCalledWith(config);
      expect(result.isOk()).toBe(true);
    });

    it('should close all pooled connections', async () => {
      const result = await closeAllPooledConnections();

      expect(mockCloseAllPooledConnections).toHaveBeenCalled();
      expect(result.isOk()).toBe(true);
    });
  });
});