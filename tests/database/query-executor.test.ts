import { jest } from '@jest/globals';
import {
  withTimeout,
  buildQueryResult,
  transformRowsToArrayFormat,
  executeTimedQuery,
  applyQueryTimeout,
  createEmptyQueryResult,
} from '../../src/database/query-executor';

describe('query-executor utilities', () => {
  beforeEach(() => {
    jest.clearAllTimers();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('withTimeout', () => {
    it('should resolve when promise completes before timeout', async () => {
      const promise = Promise.resolve('success');
      const result = withTimeout(promise, 1000, 'timeout error');

      await expect(result).resolves.toBe('success');
    });

    it('should reject with timeout error when promise takes too long', async () => {
      const promise = new Promise((resolve) => {
        setTimeout(() => resolve('late'), 2000);
      });

      const resultPromise = withTimeout(promise, 1000, 'Query timeout');

      // Fast-forward time to trigger timeout
      jest.advanceTimersByTime(1000);

      await expect(resultPromise).rejects.toThrow('Query timeout');
    });

    it('should clean up timeout when promise resolves', async () => {
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
      const promise = Promise.resolve('success');

      await withTimeout(promise, 1000, 'timeout error');

      expect(clearTimeoutSpy).toHaveBeenCalled();
    });
  });

  describe('buildQueryResult', () => {
    it('should create correct QueryResult structure', () => {
      const columns = ['id', 'name', 'email'];
      const rows = [
        [1, 'John', 'john@example.com'],
        [2, 'Jane', 'jane@example.com'],
      ];
      const startTime = Date.now() - 100;

      const result = buildQueryResult(columns, rows, startTime);

      expect(result).toMatchObject({
        columns,
        rows,
        rowCount: 2,
        executionTimeMs: expect.any(Number),
      });
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(100);
    });

    it('should handle empty results', () => {
      const startTime = Date.now() - 50;
      const result = buildQueryResult([], [], startTime);

      expect(result).toMatchObject({
        columns: [],
        rows: [],
        rowCount: 0,
        executionTimeMs: expect.any(Number),
      });
    });
  });

  describe('transformRowsToArrayFormat', () => {
    it('should convert object rows to array format', () => {
      const rows = [
        { id: 1, name: 'John', email: 'john@example.com' },
        { id: 2, name: 'Jane', email: 'jane@example.com' },
      ];
      const columns = ['id', 'name', 'email'];

      const result = transformRowsToArrayFormat(rows, columns);

      expect(result).toEqual([
        [1, 'John', 'john@example.com'],
        [2, 'Jane', 'jane@example.com'],
      ]);
    });

    it('should handle empty rows', () => {
      const result = transformRowsToArrayFormat([], ['id', 'name']);
      expect(result).toEqual([]);
    });

    it('should handle partial column data', () => {
      const rows = [
        { id: 1, name: 'John' },
        { id: 2, email: 'jane@example.com' },
      ];
      const columns = ['id', 'name', 'email'];

      const result = transformRowsToArrayFormat(rows, columns);

      expect(result).toEqual([
        [1, 'John', undefined],
        [2, undefined, 'jane@example.com'],
      ]);
    });
  });

  describe('executeTimedQuery', () => {
    it('should execute operation and transform result', async () => {
      const mockOperation = jest.fn().mockResolvedValue('raw-data');
      const mockTransformer = jest.fn().mockReturnValue({
        columns: ['col1'],
        rows: [['val1']],
        rowCount: 1,
        executionTimeMs: 10,
      });

      const result = await executeTimedQuery(
        mockOperation,
        mockTransformer,
        undefined,
        undefined,
        'test operation'
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(mockOperation).toHaveBeenCalledTimes(1);
        expect(mockTransformer).toHaveBeenCalledWith(
          'raw-data',
          expect.any(Number)
        );
        expect(result.value).toMatchObject({
          columns: ['col1'],
          rows: [['val1']],
          rowCount: 1,
          executionTimeMs: 10,
        });
      }
    });

    it('should apply timeout when specified', async () => {
      const mockOperation = jest
        .fn()
        .mockImplementation(
          () =>
            new Promise((resolve) => setTimeout(() => resolve('data'), 2000))
        );
      const mockTransformer = jest.fn();

      const resultPromise = executeTimedQuery(
        mockOperation,
        mockTransformer,
        1000,
        'Custom timeout message',
        'test operation'
      );

      jest.advanceTimersByTime(1000);

      const result = await resultPromise;

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('Custom timeout message');
      }
    });

    it('should handle operation errors', async () => {
      const mockOperation = jest
        .fn()
        .mockRejectedValue(new Error('Operation failed'));
      const mockTransformer = jest.fn();

      const result = await executeTimedQuery(
        mockOperation,
        mockTransformer,
        undefined,
        undefined,
        'test operation'
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('test operation');
      }
    });
  });

  describe('applyQueryTimeout', () => {
    it('should resolve when promise completes before timeout', async () => {
      const promise = Promise.resolve('success');

      const result = await applyQueryTimeout(promise, 1000);

      expect(result).toBe('success');
    });

    it('should reject with standard timeout message', async () => {
      const promise = new Promise((resolve) => {
        setTimeout(() => resolve('late'), 2000);
      });

      const resultPromise = applyQueryTimeout(promise, 1000);

      jest.advanceTimersByTime(1000);

      await expect(resultPromise).rejects.toThrow(
        'Query execution timeout after 1000ms'
      );
    });
  });

  describe('createEmptyQueryResult', () => {
    it('should create empty QueryResult with timing', () => {
      const startTime = Date.now() - 25;

      const result = createEmptyQueryResult(startTime);

      expect(result).toMatchObject({
        columns: [],
        rows: [],
        rowCount: 0,
        executionTimeMs: expect.any(Number),
      });
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(25);
    });
  });
});
