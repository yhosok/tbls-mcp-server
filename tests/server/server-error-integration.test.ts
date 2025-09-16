import { describe, it, expect, beforeEach } from '@jest/globals';
import { ErrorMessageGenerator } from '../../src/server/error-message-generator';
import { UriPatternSuggester } from '../../src/server/uri-pattern-suggester';

describe('Enhanced Error Message Components Integration', () => {
  let errorGenerator: ErrorMessageGenerator;
  let suggester: UriPatternSuggester;

  beforeEach(() => {
    errorGenerator = new ErrorMessageGenerator();
    suggester = new UriPatternSuggester();
  });

  describe('Error Message Generation Integration', () => {
    it('should generate comprehensive error data for MCP responses', () => {
      const uri = 'invalid://completely/wrong';
      const errorData = errorGenerator.generateMcpErrorData(uri);

      expect(errorData.message).toContain(
        'Unknown resource URI: invalid://completely/wrong'
      );
      expect(errorData.message).toContain(
        "See 'data' field for available patterns and suggestions"
      );

      // Check error data structure
      expect(errorData.data.uri).toBe(uri);
      expect(errorData.data.availablePatterns).toBeDefined();
      expect(errorData.data.availablePatterns.length).toBe(5);
      expect(errorData.data.guidance).toBeDefined();
    });

    it('should include pattern suggestions when similar patterns exist', () => {
      const uri = 'chema://list'; // typo: missing 's'
      const errorData = errorGenerator.generateMcpErrorData(uri);

      expect(errorData.data.suggestions).toBeDefined();
      expect(errorData.data.suggestions.length).toBeGreaterThan(0);
      expect(errorData.data.suggestions).toContain('db://schemas');
    });

    it('should provide appropriate guidance for different URI types', () => {
      // Test schema URI guidance
      const schemaErrorData = errorGenerator.generateMcpErrorData(
        'db://schemas/invalid'
      );
      expect(schemaErrorData.data.guidance).toContain(
        'db://schemas/[schema_name]/tables'
      );
      expect(schemaErrorData.data.guidance).toContain('db://schemas');

      // Test table URI guidance
      const tableErrorData = errorGenerator.generateMcpErrorData(
        'db://schemas/schema/tables/invalid'
      );
      expect(tableErrorData.data.guidance).toContain(
        'db://schemas/[schema_name]/tables/[table_name]'
      );

      // Test unknown protocol guidance
      const protocolErrorData =
        errorGenerator.generateMcpErrorData('http://invalid');
      expect(protocolErrorData.data.guidance).toContain('db://schemas');
    });
  });

  describe('Pattern Matching Failure Messages', () => {
    it('should provide specific guidance for schema resource failures', () => {
      const uri = 'db://schemas/nonexistent/tables';
      const message = errorGenerator.generatePatternMatchFailureMessage(uri);

      expect(message).toContain(
        'Resource not found: db://schemas/nonexistent/tables'
      );
      expect(message).toContain('The URI format is correct');
      expect(message).toContain('db://schemas');
      expect(message).toContain('available schemas');
    });

    it('should provide specific guidance for table resource failures', () => {
      const uri = 'db://schemas/default/tables/nonexistent';
      const message = errorGenerator.generatePatternMatchFailureMessage(uri);

      expect(message).toContain(
        'Resource not found: db://schemas/default/tables/nonexistent'
      );
      expect(message).toContain('db://schemas/default/tables');
      expect(message).toContain('available tables in the default schema');
    });

    it('should provide specific guidance for index resource failures', () => {
      const uri = 'db://schemas/default/tables/missing/indexes';
      const message = errorGenerator.generatePatternMatchFailureMessage(uri);

      expect(message).toContain(
        'Resource not found: db://schemas/default/tables/missing/indexes'
      );
      expect(message).toContain('db://schemas/default/tables/missing');
      expect(message).toContain('table exists');
    });
  });

  describe('URI Pattern Similarity Suggestions', () => {
    it('should find high-similarity matches for common typos', () => {
      const testCases = [
        { input: 'db://schema', expected: 'db://schemas', minSimilarity: 0.8 },
        { input: 'db://schemes', expected: 'db://schemas', minSimilarity: 0.8 },
        {
          input: 'db://schemas/defaut/tables/users',
          expected: 'db://schemas/default/tables/users',
          minSimilarity: 0.9,
        },
        {
          input: 'db://schemas/publik/tables',
          expected: 'db://schemas/public/tables',
          minSimilarity: 0.8,
        },
      ];

      for (const testCase of testCases) {
        const suggestions = suggester.findSimilarPatterns(
          testCase.input,
          3,
          0.5
        );

        expect(suggestions.length).toBeGreaterThan(0);
        const topSuggestion = suggestions.find(
          (s) => s.pattern === testCase.expected
        );
        expect(topSuggestion).toBeDefined();
        expect(topSuggestion!.similarity).toBeGreaterThan(
          testCase.minSimilarity
        );
      }
    });

    it('should provide structural similarity for incomplete URIs', () => {
      const suggestions = suggester.findStructurallySimilar(
        'db://schemas/default'
      );

      expect(suggestions.length).toBeGreaterThan(0);
      const tablePatterns = suggestions.filter((s) =>
        s.pattern.startsWith('db://schemas/default/')
      );
      expect(tablePatterns.length).toBeGreaterThan(0);
    });

    it('should handle case-insensitive matching', () => {
      const suggestions = suggester.findSimilarPatterns('DB://SCHEMAS', 5, 0.5);

      expect(suggestions.length).toBeGreaterThan(0);
      const exactMatch = suggestions.find((s) => s.pattern === 'db://schemas');
      expect(exactMatch).toBeDefined();
      expect(exactMatch!.similarity).toBe(1.0);
    });
  });

  describe('MCP Error Format Compliance', () => {
    it('should generate MCP-compliant error messages', () => {
      const uri = 'invalid://test';
      const errorData = errorGenerator.generateMcpErrorData(uri);

      // Message should be reasonably sized and single-line
      expect(errorData.message.length).toBeLessThan(2000);
      expect(errorData.message).not.toContain('\n');

      // Data should contain detailed information
      expect(errorData.data).toBeDefined();
      expect(typeof errorData.data).toBe('object');
      expect(errorData.data.uri).toBe(uri);
    });

    it('should include all required pattern information in error data', () => {
      const uri = 'unknown://pattern';
      const errorData = errorGenerator.generateMcpErrorData(uri);

      expect(errorData.data.availablePatterns).toBeDefined();
      expect(errorData.data.availablePatterns.length).toBe(5);

      for (const pattern of errorData.data.availablePatterns) {
        expect(pattern.pattern).toBeDefined();
        expect(pattern.description).toBeDefined();
        expect(pattern.examples).toBeDefined();
        expect(Array.isArray(pattern.examples)).toBe(true);
        expect(pattern.examples.length).toBeGreaterThan(0);
      }
    });

    it('should provide contextual guidance based on URI structure', () => {
      const testCases = [
        {
          uri: 'db://schemas/invalid',
          expectedGuidance: 'Schema resources follow the pattern',
        },
        {
          uri: 'db://schemas/schema/tables/invalid',
          expectedGuidance: 'Table resources follow the pattern',
        },
        {
          uri: 'http://invalid',
          expectedGuidance: 'This server only supports the db:// URI scheme',
        },
        {
          uri: 'invalid-no-protocol',
          expectedGuidance: 'URIs must follow the db://... pattern',
        },
      ];

      for (const testCase of testCases) {
        const errorData = errorGenerator.generateMcpErrorData(testCase.uri);
        expect(errorData.data.guidance).toContain(testCase.expectedGuidance);
      }
    });
  });
});
