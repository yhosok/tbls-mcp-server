import { jest } from '@jest/globals';
import { promises as fs, watch, FSWatcher } from 'fs';
import { FileWatcher } from '../../src/cache/file-watcher';

// Mock fs module
jest.mock('fs', () => ({
  promises: {
    stat: jest.fn(),
  },
  watch: jest.fn(),
}));

import { MockFSWatcher, createFileStats, createDirectoryStats, createMockFSWatcher } from '../test-utils';

const mockFs = fs as jest.Mocked<typeof fs>;
// Get the mock watch function after mocking
const mockFsWatch = jest.mocked(watch);

describe('FileWatcher', () => {
  let fileWatcher: FileWatcher;
  let mockWatcher: MockFSWatcher;

  beforeEach((): void => {
    fileWatcher = new FileWatcher();
    mockWatcher = createMockFSWatcher();
    mockFsWatch.mockReturnValue(mockWatcher as FSWatcher);
    jest.clearAllMocks();
  });

  afterEach((): void => {
    fileWatcher.destroy();
  });

  describe('file watching', () => {
    it('should start watching a file and detect changes', async () => {
      // Arrange
      const filePath = '/test/schema.json';
      const changeCallback = jest.fn();
      const initialMtime = new Date('2024-01-01T10:00:00Z');
      const updatedMtime = new Date('2024-01-01T11:00:00Z');

      mockFs.stat
        .mockResolvedValueOnce(createFileStats(initialMtime))
        .mockResolvedValueOnce(createFileStats(updatedMtime));

      // Act
      await fileWatcher.watchFile(filePath, changeCallback);

      // Simulate file change event
      mockWatcher.emit('change', 'change', 'schema.json');

      // Wait for async operations (debounce delay + extra time)
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Assert
      expect(mockFsWatch).toHaveBeenCalledWith(filePath);
      expect(changeCallback).toHaveBeenCalledWith(
        filePath,
        updatedMtime,
        initialMtime
      );
    });

    it('should not trigger callback if mtime has not changed', async () => {
      // Arrange
      const filePath = '/test/schema.json';
      const changeCallback = jest.fn();
      const mtime = new Date('2024-01-01T10:00:00Z');

      mockFs.stat.mockResolvedValue(createFileStats(mtime));

      // Act
      await fileWatcher.watchFile(filePath, changeCallback);

      // Simulate file change event with same mtime
      mockWatcher.emit('change', 'change', 'schema.json');

      // Wait for async operations (debounce delay + extra time)
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Assert
      expect(changeCallback).not.toHaveBeenCalled();
    });

    it('should handle file stat errors gracefully', async () => {
      // Arrange
      const filePath = '/test/nonexistent.json';
      const changeCallback = jest.fn();
      const errorCallback = jest.fn();

      mockFs.stat.mockRejectedValue(new Error('File not found'));

      // Act
      await fileWatcher.watchFile(filePath, changeCallback, errorCallback);

      // Simulate file change event
      mockWatcher.emit('change', 'change', 'nonexistent.json');

      // Wait for async operations (debounce delay + extra time)
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Assert
      expect(errorCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'File not found',
        })
      );
      expect(changeCallback).not.toHaveBeenCalled();
    });
  });

  describe('directory watching', () => {
    it('should watch directory and detect file changes within', async () => {
      // Arrange
      const dirPath = '/test/schemas';
      const changeCallback = jest.fn();
      const initialMtime = new Date('2024-01-01T10:00:00Z');
      const updatedMtime = new Date('2024-01-01T11:00:00Z');

      mockFs.stat
        .mockResolvedValueOnce(createDirectoryStats(initialMtime))
        .mockResolvedValueOnce(createDirectoryStats(updatedMtime));

      // Act
      await fileWatcher.watchDirectory(dirPath, changeCallback);

      // Simulate directory change event
      mockWatcher.emit('change', 'change', null); // filename can be null on some platforms

      // Wait for async operations (debounce delay + extra time)
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Assert
      expect(mockFsWatch).toHaveBeenCalledWith(dirPath, { recursive: true });
      expect(changeCallback).toHaveBeenCalledWith(
        dirPath,
        updatedMtime,
        initialMtime
      );
    });

    it('should watch directory with specific file filter', async () => {
      // Arrange
      const dirPath = '/test/schemas';
      const changeCallback = jest.fn();
      const initialMtime = new Date('2024-01-01T10:00:00Z');
      const updatedMtime = new Date('2024-01-01T11:00:00Z');

      mockFs.stat
        .mockResolvedValueOnce(createDirectoryStats(initialMtime))
        .mockResolvedValueOnce(createDirectoryStats(updatedMtime));

      const fileFilter = (filename: string): boolean =>
        filename.endsWith('.json');

      // Act
      await fileWatcher.watchDirectory(dirPath, changeCallback, undefined, {
        recursive: true,
        fileFilter,
      });

      // Simulate changes for different file types
      mockWatcher.emit('change', 'change', 'schema.json'); // should trigger
      mockWatcher.emit('change', 'change', 'readme.md'); // should not trigger

      // Wait for async operations (debounce delay + extra time)
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Assert
      expect(changeCallback).toHaveBeenCalledTimes(1);
    });
  });

  describe('multiple watchers', () => {
    it('should handle multiple files being watched', async () => {
      // Arrange
      const file1 = '/test/schema1.json';
      const file2 = '/test/schema2.json';
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      const mtime = new Date('2024-01-01T10:00:00Z');
      const newMtime = new Date('2024-01-01T11:00:00Z');

      // Create separate mock watchers for each file
      const mockWatcher1 = createMockFSWatcher();
      const mockWatcher2 = createMockFSWatcher();

      mockFs.stat
        .mockResolvedValueOnce(createFileStats(mtime))
        .mockResolvedValueOnce(createFileStats(mtime))
        .mockResolvedValueOnce(createFileStats(newMtime));

      mockFsWatch
        .mockReturnValueOnce(mockWatcher1 as FSWatcher)
        .mockReturnValueOnce(mockWatcher2 as FSWatcher);

      // Act
      await fileWatcher.watchFile(file1, callback1);
      await fileWatcher.watchFile(file2, callback2);

      // Simulate change only in file1
      mockWatcher1.emit('change', 'change', 'schema1.json');

      // Wait for async operations (debounce delay + extra time)
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Assert
      expect(mockFsWatch).toHaveBeenCalledTimes(2);
      expect(callback1).toHaveBeenCalled();
      expect(callback2).not.toHaveBeenCalled();
    });

    it('should stop watching specific files', async () => {
      // Arrange
      const filePath = '/test/schema.json';
      const changeCallback = jest.fn();
      const mtime = new Date('2024-01-01T10:00:00Z');

      mockFs.stat.mockResolvedValue(createFileStats(mtime));

      mockWatcher.close = jest.fn();

      // Act
      await fileWatcher.watchFile(filePath, changeCallback);
      fileWatcher.stopWatching(filePath);

      // Simulate file change after stopping
      mockWatcher.emit('change', 'change', 'schema.json');

      // Wait for async operations (debounce delay + extra time)
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Assert
      expect(mockWatcher.close).toHaveBeenCalled();
      expect(changeCallback).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle watcher errors', async () => {
      // Arrange
      const filePath = '/test/schema.json';
      const changeCallback = jest.fn();
      const errorCallback = jest.fn();
      const mtime = new Date('2024-01-01T10:00:00Z');

      mockFs.stat.mockResolvedValue(createFileStats(mtime));

      // Act
      await fileWatcher.watchFile(filePath, changeCallback, errorCallback);

      // Simulate watcher error
      const error = new Error('Watcher error');
      mockWatcher.emit('error', error);

      // Assert
      expect(errorCallback).toHaveBeenCalledWith(error);
    });

    it('should handle invalid file paths', async () => {
      // Arrange
      const invalidPath = '';
      const changeCallback = jest.fn();

      // Act & Assert
      await expect(
        fileWatcher.watchFile(invalidPath, changeCallback)
      ).rejects.toThrow('Invalid file path');
    });
  });

  describe('cleanup', () => {
    it('should close all watchers on destroy', async () => {
      // Arrange
      const file1 = '/test/schema1.json';
      const file2 = '/test/schema2.json';
      const callback = jest.fn();
      const mtime = new Date('2024-01-01T10:00:00Z');

      mockFs.stat.mockResolvedValue(createFileStats(mtime));

      const mockWatcher1 = createMockFSWatcher();
      const mockWatcher2 = createMockFSWatcher();

      mockFsWatch
        .mockReturnValueOnce(mockWatcher1 as FSWatcher)
        .mockReturnValueOnce(mockWatcher2 as FSWatcher);

      // Act
      await fileWatcher.watchFile(file1, callback);
      await fileWatcher.watchFile(file2, callback);
      fileWatcher.destroy();

      // Assert
      expect(mockWatcher1.close).toHaveBeenCalled();
      expect(mockWatcher2.close).toHaveBeenCalled();
    });
  });

  describe('performance', () => {
    it('should throttle rapid file change events', async () => {
      // Arrange
      const filePath = '/test/schema.json';
      const changeCallback = jest.fn();
      const mtime = new Date('2024-01-01T10:00:00Z');
      const newMtime1 = new Date('2024-01-01T10:00:01Z');
      const newMtime2 = new Date('2024-01-01T10:00:02Z');

      mockFs.stat
        .mockResolvedValueOnce(createFileStats(mtime))
        .mockResolvedValueOnce(createFileStats(newMtime1))
        .mockResolvedValueOnce(createFileStats(newMtime2));

      // Act
      await fileWatcher.watchFile(filePath, changeCallback);

      // Simulate rapid changes
      mockWatcher.emit('change', 'change', 'schema.json');
      mockWatcher.emit('change', 'change', 'schema.json');

      // Wait for debounce period
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Assert - should only trigger once due to throttling
      expect(changeCallback).toHaveBeenCalledTimes(1);
    });
  });
});
