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

      expect(errorData.message).toContain('Unknown resource URI: invalid://completely/wrong');
      expect(errorData.message).toContain('See \'data\' field for available patterns and suggestions');

      // Check error data structure
      expect(errorData.data.uri).toBe(uri);
      expect(errorData.data.availablePatterns).toBeDefined();
      expect(errorData.data.availablePatterns.length).toBe(4);
      expect(errorData.data.guidance).toBeDefined();
    });

    it('should include pattern suggestions when similar patterns exist', () => {
      const uri = 'chema://list'; // typo: missing 's'
      const errorData = errorGenerator.generateMcpErrorData(uri);

      expect(errorData.data.suggestions).toBeDefined();
      expect(errorData.data.suggestions.length).toBeGreaterThan(0);
      expect(errorData.data.suggestions[0].pattern).toBe('schema://list');
      expect(errorData.data.suggestions[0].similarity).toBeGreaterThan(0.8);
    });

    it('should provide appropriate guidance for different URI types', () => {
      // Test schema URI guidance
      const schemaErrorData = errorGenerator.generateMcpErrorData('schema://invalid');
      expect(schemaErrorData.data.guidance).toContain('schema://[schema_name]/tables');
      expect(schemaErrorData.data.guidance).toContain('schema://list');

      // Test table URI guidance
      const tableErrorData = errorGenerator.generateMcpErrorData('table://invalid');
      expect(tableErrorData.data.guidance).toContain('table://[schema_name]/[table_name]');

      // Test unknown protocol guidance
      const protocolErrorData = errorGenerator.generateMcpErrorData('http://invalid');
      expect(protocolErrorData.data.guidance).toContain('schema://');
      expect(protocolErrorData.data.guidance).toContain('table://');
    });
  });

  describe('Pattern Matching Failure Messages', () => {
    it('should provide specific guidance for schema resource failures', () => {
      const uri = 'schema://nonexistent/tables';
      const message = errorGenerator.generatePatternMatchFailureMessage(uri);

      expect(message).toContain('Resource not found: schema://nonexistent/tables');
      expect(message).toContain('The URI format is correct');
      expect(message).toContain('schema://list');
      expect(message).toContain('available schemas');
    });

    it('should provide specific guidance for table resource failures', () => {
      const uri = 'table://default/nonexistent';
      const message = errorGenerator.generatePatternMatchFailureMessage(uri);

      expect(message).toContain('Resource not found: table://default/nonexistent');
      expect(message).toContain('schema://default/tables');
      expect(message).toContain('available tables in the default schema');
    });

    it('should provide specific guidance for index resource failures', () => {
      const uri = 'table://default/missing/indexes';
      const message = errorGenerator.generatePatternMatchFailureMessage(uri);

      expect(message).toContain('Resource not found: table://default/missing/indexes');
      expect(message).toContain('table://default/missing');
      expect(message).toContain('table exists');
    });
  });

  describe('URI Pattern Similarity Suggestions', () => {
    it('should find high-similarity matches for common typos', () => {
      const testCases = [
        { input: 'schema://ist', expected: 'schema://list', minSimilarity: 0.8 },
        { input: 'chema://list', expected: 'schema://list', minSimilarity: 0.8 },
        { input: 'table://defaut/users', expected: 'table://default/users', minSimilarity: 0.9 },
        { input: 'schema://publik/tables', expected: 'schema://public/tables', minSimilarity: 0.8 },
      ];

      for (const testCase of testCases) {
        const suggestions = suggester.findSimilarPatterns(testCase.input, 3, 0.5);

        expect(suggestions.length).toBeGreaterThan(0);
        const topSuggestion = suggestions.find(s => s.pattern === testCase.expected);
        expect(topSuggestion).toBeDefined();
        expect(topSuggestion!.similarity).toBeGreaterThan(testCase.minSimilarity);
      }
    });

    it('should provide structural similarity for incomplete URIs', () => {
      const suggestions = suggester.findStructurallySimilar('table://default');

      expect(suggestions.length).toBeGreaterThan(0);
      const tablePatterns = suggestions.filter(s => s.pattern.startsWith('table://default/'));
      expect(tablePatterns.length).toBeGreaterThan(0);
    });

    it('should handle case-insensitive matching', () => {
      const suggestions = suggester.findSimilarPatterns('SCHEMA://LIST', 5, 0.5);

      expect(suggestions.length).toBeGreaterThan(0);
      const exactMatch = suggestions.find(s => s.pattern === 'schema://list');
      expect(exactMatch).toBeDefined();
      expect(exactMatch!.similarity).toBe(1.0);
    });
  });

  describe('MCP Error Format Compliance', () => {
    it('should generate MCP-compliant error messages', () => {
      const uri = 'invalid://test';
      const errorData = errorGenerator.generateMcpErrorData(uri);

      // Message should be concise and single-line
      expect(errorData.message.length).toBeLessThan(200);
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
      expect(errorData.data.availablePatterns.length).toBe(4);

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
          uri: 'schema://invalid',
          expectedGuidance: 'Schema resources follow the pattern',
        },
        {
          uri: 'table://invalid',
          expectedGuidance: 'Table resources follow the pattern',
        },
        {
          uri: 'http://invalid',
          expectedGuidance: 'This server only supports schema:// and table://',
        },
        {
          uri: 'invalid-no-protocol',
          expectedGuidance: 'URIs must follow the schema://... or table://...',
        },
      ];

      for (const testCase of testCases) {
        const errorData = errorGenerator.generateMcpErrorData(testCase.uri);
        expect(errorData.data.guidance).toContain(testCase.expectedGuidance);
      }
    });
  });
});