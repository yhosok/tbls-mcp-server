import { jest } from '@jest/globals';
import { promises as fs } from 'fs';
import { ResourceCache } from '../../src/cache/resource-cache';
import {
  DatabaseSchema,
  TableReference,
  DatabaseTable,
} from '../../src/schemas/database';

// Mock fs module
jest.mock('fs', () => ({
  promises: {
    stat: jest.fn(),
  },
}));

// Type-safe mock interfaces
interface MockStats {
  mtime: Date;
  isFile: () => boolean;
  isDirectory?: () => boolean;
}

const mockFs = fs as jest.Mocked<typeof fs>;

describe('ResourceCache', () => {
  let cache: ResourceCache;

  beforeEach((): void => {
    cache = new ResourceCache({
      maxItems: 100,
      ttlMs: 5 * 60 * 1000, // 5 minutes
    });
    jest.clearAllMocks();
  });

  afterEach((): void => {
    cache.clear();
  });

  describe('file content caching', () => {
    it('should cache file content with mtime-based key', async () => {
      // Arrange
      const filePath = '/test/schema.json';
      const content = '{"name": "test_schema"}';
      const mtime = new Date('2024-01-01T10:00:00Z');

      mockFs.stat.mockResolvedValue({
        mtime,
        isFile: (): boolean => true,
      } as MockStats);

      // Act
      await cache.setFileContent(filePath, content);
      const cached = await cache.getFileContent(filePath);

      // Assert
      expect(cached).toBe(content);
      expect(mockFs.stat).toHaveBeenCalledWith(filePath);
    });

    it('should return null for cached content when file is modified', async () => {
      // Arrange
      const filePath = '/test/schema.json';
      const content = '{"name": "test_schema"}';
      const oldMtime = new Date('2024-01-01T10:00:00Z');
      const newMtime = new Date('2024-01-01T11:00:00Z');

      // Cache with old mtime
      mockFs.stat.mockResolvedValueOnce({
        mtime: oldMtime,
        isFile: (): boolean => true,
      } as MockStats);
      await cache.setFileContent(filePath, content);

      // Check with new mtime
      mockFs.stat.mockResolvedValueOnce({
        mtime: newMtime,
        isFile: (): boolean => true,
      } as MockStats);

      // Act
      const cached = await cache.getFileContent(filePath);

      // Assert
      expect(cached).toBeNull();
    });

    it('should handle file stat errors gracefully', async () => {
      // Arrange
      const filePath = '/test/nonexistent.json';
      mockFs.stat.mockRejectedValue(new Error('File not found'));

      // Act
      const result = await cache.getFileContent(filePath);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('parsed schema caching', () => {
    it('should cache and retrieve parsed schema', async () => {
      // Arrange
      const schemaPath = '/test/schema';
      const schema: DatabaseSchema = {
        name: 'test_db',
        tables: [],
        relations: [],
        metadata: {
          name: 'test_db',
          tableCount: 0,
          description: 'Test database',
          generated: '2024-01-01T10:00:00Z',
        },
        tableReferences: [],
      };
      const mtime = new Date('2024-01-01T10:00:00Z');

      mockFs.stat.mockResolvedValue({
        mtime,
        isFile: (): boolean => false,
        isDirectory: (): boolean => true,
      } as MockStats);

      // Act
      await cache.setSchema(schemaPath, schema);
      const cached = await cache.getSchema(schemaPath);

      // Assert
      expect(cached).toEqual(schema);
    });

    it('should invalidate cached schema when directory is modified', async () => {
      // Arrange
      const schemaPath = '/test/schema';
      const schema: DatabaseSchema = {
        name: 'test_db',
        tables: [],
        relations: [],
        metadata: {
          name: 'test_db',
          tableCount: 0,
          description: 'Test database',
          generated: '2024-01-01T10:00:00Z',
        },
        tableReferences: [],
      };
      const oldMtime = new Date('2024-01-01T10:00:00Z');
      const newMtime = new Date('2024-01-01T11:00:00Z');

      // Cache with old mtime
      mockFs.stat.mockResolvedValueOnce({
        mtime: oldMtime,
        isFile: (): boolean => false,
        isDirectory: (): boolean => true,
      } as MockStats);
      await cache.setSchema(schemaPath, schema);

      // Check with new mtime
      mockFs.stat.mockResolvedValueOnce({
        mtime: newMtime,
        isFile: (): boolean => false,
        isDirectory: (): boolean => true,
      } as MockStats);

      // Act
      const cached = await cache.getSchema(schemaPath);

      // Assert
      expect(cached).toBeNull();
    });
  });

  describe('table references caching', () => {
    it('should cache and retrieve table references', async () => {
      // Arrange
      const schemaPath = '/test/schema';
      const tableReferences: TableReference[] = [
        { name: 'users', comment: 'User table' },
        { name: 'posts', comment: 'Post table' },
      ];
      const mtime = new Date('2024-01-01T10:00:00Z');

      mockFs.stat.mockResolvedValue({
        mtime,
        isFile: (): boolean => false,
        isDirectory: (): boolean => true,
      } as MockStats);

      // Act
      await cache.setTableReferences(schemaPath, tableReferences);
      const cached = await cache.getTableReferences(schemaPath);

      // Assert
      expect(cached).toEqual(tableReferences);
    });
  });

  describe('individual table caching', () => {
    it('should cache and retrieve individual table', async () => {
      // Arrange
      const tablePath = '/test/schema/users.md';
      const table: DatabaseTable = {
        name: 'users',
        comment: 'User table',
        columns: [
          {
            name: 'id',
            type: 'bigint',
            nullable: false,
            isPrimaryKey: true,
            comment: 'User ID',
          },
        ],
        indexes: [],
        relations: [],
      };
      const mtime = new Date('2024-01-01T10:00:00Z');

      mockFs.stat.mockResolvedValue({
        mtime,
        isFile: (): boolean => true,
      } as MockStats);

      // Act
      await cache.setTable(tablePath, table);
      const cached = await cache.getTable(tablePath);

      // Assert
      expect(cached).toEqual(table);
    });
  });

  describe('cache statistics', () => {
    it('should track cache hits and misses', async () => {
      // Arrange
      const filePath = '/test/schema.json';
      const content = '{"name": "test"}';
      const mtime = new Date('2024-01-01T10:00:00Z');

      mockFs.stat.mockResolvedValue({
        mtime,
        isFile: (): boolean => true,
      } as MockStats);

      // Act
      await cache.getFileContent(filePath); // miss
      await cache.setFileContent(filePath, content);
      await cache.getFileContent(filePath); // hit
      await cache.getFileContent(filePath); // hit

      const stats = cache.getStats();

      // Assert
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBe(2 / 3);
    });

    it('should track cache size', async () => {
      // Arrange
      const mtime = new Date('2024-01-01T10:00:00Z');
      mockFs.stat.mockResolvedValue({
        mtime,
        isFile: (): boolean => true,
      } as MockStats);

      // Act
      await cache.setFileContent('/test/file1.json', 'content1');
      await cache.setFileContent('/test/file2.json', 'content2');

      const stats = cache.getStats();

      // Assert
      expect(stats.size).toBe(2);
    });
  });

  describe('cache limits and eviction', () => {
    it('should respect max items limit', async () => {
      // Arrange
      const smallCache = new ResourceCache({ maxItems: 2, ttlMs: 60000 });
      const mtime = new Date('2024-01-01T10:00:00Z');

      mockFs.stat.mockResolvedValue({
        mtime,
        isFile: (): boolean => true,
      } as MockStats);

      // Act - add 3 items to cache with max 2
      await smallCache.setFileContent('/test/file1.json', 'content1');
      await smallCache.setFileContent('/test/file2.json', 'content2');
      await smallCache.setFileContent('/test/file3.json', 'content3');

      // Assert
      const stats = smallCache.getStats();
      expect(stats.size).toBe(2);

      // First item should be evicted (LRU)
      const file1 = await smallCache.getFileContent('/test/file1.json');
      expect(file1).toBeNull();

      // Last two items should still be cached
      const file2 = await smallCache.getFileContent('/test/file2.json');
      const file3 = await smallCache.getFileContent('/test/file3.json');
      expect(file2).toBe('content2');
      expect(file3).toBe('content3');
    });
  });

  describe('explicit cache invalidation', () => {
    it('should invalidate specific cache entries', async () => {
      // Arrange
      const filePath = '/test/schema.json';
      const content = '{"name": "test"}';
      const mtime = new Date('2024-01-01T10:00:00Z');

      mockFs.stat.mockResolvedValue({
        mtime,
        isFile: (): boolean => true,
      } as MockStats);

      await cache.setFileContent(filePath, content);
      expect(await cache.getFileContent(filePath)).toBe(content);

      // Act
      cache.invalidateFile(filePath);

      // Assert
      const cached = await cache.getFileContent(filePath);
      expect(cached).toBeNull();
    });

    it('should invalidate all cache entries', (): void => {
      // Arrange - cache is populated from previous tests

      // Act
      cache.clear();

      // Assert
      const stats = cache.getStats();
      expect(stats.size).toBe(0);
    });
  });
});
