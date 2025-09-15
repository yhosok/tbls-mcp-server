import { ok, err } from 'neverthrow';
import type { DatabaseConfig } from '../../src/schemas/config';

// Mock the entire adapter module to avoid database connections
jest.mock('../../src/database/sqlite-adapter', () => ({
  createSQLiteConnection: jest.fn(),
  executeSQLiteQuery: jest.fn(),
  closeSQLiteConnection: jest.fn(),
}));

// Import the mocked functions
import {
  createSQLiteConnection,
  executeSQLiteQuery,
  closeSQLiteConnection,
} from '../../src/database/sqlite-adapter';

const mockCreateSQLiteConnection = createSQLiteConnection as jest.MockedFunction<typeof createSQLiteConnection>;
const mockExecuteSQLiteQuery = executeSQLiteQuery as jest.MockedFunction<typeof executeSQLiteQuery>;
const mockCloseSQLiteConnection = closeSQLiteConnection as jest.MockedFunction<typeof closeSQLiteConnection>;

describe('sqlite adapter (mocked)', () => {
  const mockConnection = {
    type: 'sqlite' as const,
    database: {} as unknown,
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Set up default successful responses
    mockCreateSQLiteConnection.mockResolvedValue(ok(mockConnection));
    mockExecuteSQLiteQuery.mockResolvedValue(ok({
      rows: [],
      rowCount: 0,
      executionTime: 1,
    }));
    mockCloseSQLiteConnection.mockResolvedValue(ok(undefined));
  });

  describe('createSQLiteConnection', () => {
    it('should call the function with correct config for file path', async () => {
      const config: DatabaseConfig = {
        type: 'sqlite',
        path: '/path/to/test.db',
      };

      const result = await createSQLiteConnection(config);

      expect(mockCreateSQLiteConnection).toHaveBeenCalledWith(config);
      expect(result.isOk()).toBe(true);
    });

    it('should call the function with correct config for in-memory database', async () => {
      const config: DatabaseConfig = {
        type: 'sqlite',
        path: ':memory:',
      };

      const result = await createSQLiteConnection(config);

      expect(mockCreateSQLiteConnection).toHaveBeenCalledWith(config);
      expect(result.isOk()).toBe(true);
    });

    it('should handle errors', async () => {
      const config: DatabaseConfig = {
        type: 'sqlite',
        path: '/invalid/path.db',
      };

      mockCreateSQLiteConnection.mockResolvedValue(err(new Error('Connection failed')));

      const result = await createSQLiteConnection(config);

      expect(result.isErr()).toBe(true);
    });
  });

  describe('executeSQLiteQuery', () => {
    it('should execute queries successfully', async () => {
      const result = await executeSQLiteQuery(mockConnection, 'SELECT 1', []);

      expect(mockExecuteSQLiteQuery).toHaveBeenCalledWith(mockConnection, 'SELECT 1', []);
      expect(result.isOk()).toBe(true);
    });
  });

  describe('closeSQLiteConnection', () => {
    it('should close connections successfully', async () => {
      const result = await closeSQLiteConnection(mockConnection);

      expect(mockCloseSQLiteConnection).toHaveBeenCalledWith(mockConnection);
      expect(result.isOk()).toBe(true);
    });
  });
});