import { resolveSchemaSource } from '../../src/parsers/schema-adapter';
import * as fs from 'fs';

// Mock file system functions
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  statSync: jest.fn(),
}));

const mockExistsSync = fs.existsSync as jest.MockedFunction<
  typeof fs.existsSync
>;
const mockStatSync = fs.statSync as jest.MockedFunction<typeof fs.statSync>;

describe('resolveSchemaSource', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('file input', () => {
    it('should resolve direct JSON file path', () => {
      const filePath = '/path/to/schema.json';
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({ isFile: () => true } as fs.Stats);

      const result = resolveSchemaSource(filePath);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual({
          type: 'file',
          path: filePath,
        });
      }
    });

    it('should handle file that does not exist', () => {
      const filePath = '/path/to/nonexistent.json';
      mockExistsSync.mockReturnValue(false);

      const result = resolveSchemaSource(filePath);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toBe(
          'Schema source does not exist: /path/to/nonexistent.json'
        );
      }
    });

    it('should reject non-JSON file extensions', () => {
      const filePath = '/path/to/schema.txt';
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({ isFile: () => true } as fs.Stats);

      const result = resolveSchemaSource(filePath);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toBe(
          'Schema file must have .json extension, got: .txt'
        );
      }
    });

    it('should reject markdown files', () => {
      const filePath = '/path/to/schema.md';
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({ isFile: () => true } as fs.Stats);

      const result = resolveSchemaSource(filePath);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain(
          'Markdown files are no longer supported'
        );
      }
    });
  });

  describe('directory input', () => {
    it('should resolve directory without file resolution', () => {
      const dirPath = '/path/to/schemas';
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({
        isFile: () => false,
        isDirectory: () => true,
      } as fs.Stats);

      const result = resolveSchemaSource(dirPath);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual({
          type: 'directory',
          path: dirPath,
        });
      }
    });

    it('should fail when directory does not exist', () => {
      const dirPath = '/path/to/nonexistent';
      mockExistsSync.mockReturnValue(false);

      const result = resolveSchemaSource(dirPath);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toBe(
          'Schema source does not exist: /path/to/nonexistent'
        );
      }
    });

    it('should fail when path is neither file nor directory', () => {
      const sourcePath = '/dev/null';
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({
        isFile: () => false,
        isDirectory: () => false,
      } as fs.Stats);

      const result = resolveSchemaSource(sourcePath);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toBe(
          'Schema source is neither a file nor directory: /dev/null'
        );
      }
    });
  });

  describe('edge cases', () => {
    it('should handle empty string input', () => {
      const result = resolveSchemaSource('');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toBe(
          'Schema source must be a non-empty string'
        );
      }
    });

    it('should handle null input', () => {
      const result = resolveSchemaSource(null as unknown as string);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toBe(
          'Schema source must be a non-empty string'
        );
      }
    });

    it('should handle undefined input', () => {
      const result = resolveSchemaSource(undefined as unknown as string);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toBe(
          'Schema source must be a non-empty string'
        );
      }
    });

    it('should handle whitespace-only string', () => {
      const result = resolveSchemaSource('   ');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toBe('Schema source cannot be empty');
      }
    });

    it('should handle file system errors', () => {
      const filePath = '/path/to/schema.json';
      mockExistsSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const result = resolveSchemaSource(filePath);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toBe(
          'Error accessing schema source /path/to/schema.json: Permission denied'
        );
      }
    });
  });
});
