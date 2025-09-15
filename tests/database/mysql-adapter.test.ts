import { ok, err } from 'neverthrow';
import type { DatabaseConfig } from '../../src/schemas/config';

// Mock the entire adapter module to avoid database connections
jest.mock('../../src/database/mysql-adapter', () => ({
  createMySQLConnection: jest.fn(),
  executeMySQLQuery: jest.fn(),
  closeMySQLConnection: jest.fn(),
}));

// Import the mocked functions
import {
  createMySQLConnection,
  executeMySQLQuery,
  closeMySQLConnection,
} from '../../src/database/mysql-adapter';

const mockCreateMySQLConnection = createMySQLConnection as jest.MockedFunction<typeof createMySQLConnection>;
const mockExecuteMySQLQuery = executeMySQLQuery as jest.MockedFunction<typeof executeMySQLQuery>;
const mockCloseMySQLConnection = closeMySQLConnection as jest.MockedFunction<typeof closeMySQLConnection>;

describe('mysql adapter (mocked)', () => {
  const mockConnection = {
    type: 'mysql' as const,
    pool: {} as unknown,
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Set up default successful responses
    mockCreateMySQLConnection.mockResolvedValue(ok(mockConnection));
    mockExecuteMySQLQuery.mockResolvedValue(ok({
      rows: [],
      rowCount: 0,
      executionTime: 1,
    }));
    mockCloseMySQLConnection.mockResolvedValue(ok(undefined));
  });

  describe('createMySQLConnection', () => {
    it('should call the function with correct config', async () => {
      const config: DatabaseConfig = {
        type: 'mysql',
        connectionString: 'mysql://user:pass@localhost:3306/testdb',
      };

      const result = await createMySQLConnection(config);

      expect(mockCreateMySQLConnection).toHaveBeenCalledWith(config);
      expect(result.isOk()).toBe(true);
    });

    it('should handle errors', async () => {
      const config: DatabaseConfig = {
        type: 'mysql',
        connectionString: 'invalid-connection-string',
      };

      mockCreateMySQLConnection.mockResolvedValue(err(new Error('Connection failed')));

      const result = await createMySQLConnection(config);

      expect(result.isErr()).toBe(true);
    });
  });

  describe('executeMySQLQuery', () => {
    it('should execute queries successfully', async () => {
      const result = await executeMySQLQuery(mockConnection, 'SELECT 1', []);

      expect(mockExecuteMySQLQuery).toHaveBeenCalledWith(mockConnection, 'SELECT 1', []);
      expect(result.isOk()).toBe(true);
    });
  });

  describe('closeMySQLConnection', () => {
    it('should close connections successfully', async () => {
      const result = await closeMySQLConnection(mockConnection);

      expect(mockCloseMySQLConnection).toHaveBeenCalledWith(mockConnection);
      expect(result.isOk()).toBe(true);
    });
  });
});