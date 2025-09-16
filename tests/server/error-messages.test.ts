import { describe, it, expect, beforeEach } from '@jest/globals';
import { ErrorMessageGenerator } from '../../src/server/error-message-generator';
import { UriPatternSuggester } from '../../src/server/uri-pattern-suggester';
// ResourcePatterns is used via ErrorMessageGenerator

describe('ErrorMessageGenerator', () => {
  let errorGenerator: ErrorMessageGenerator;

  beforeEach(() => {
    errorGenerator = new ErrorMessageGenerator();
  });

  describe('generateInvalidUriMessage', () => {
    it('should generate error message with pattern examples for unknown URI', () => {
      const uri = 'unknown://invalid/path';
      const message = errorGenerator.generateInvalidUriMessage(uri);

      expect(message).toContain('Unknown resource URI: unknown://invalid/path');
      expect(message).toContain('Available URI patterns:');
      expect(message).toContain('schema://list');
      expect(message).toContain('schema://[schema_name]/tables');
      expect(message).toContain('table://[schema_name]/[table_name]');
      expect(message).toContain('table://[schema_name]/[table_name]/indexes');
    });

    it('should include pattern examples in error message', () => {
      const uri = 'schema://invalid';
      const message = errorGenerator.generateInvalidUriMessage(uri);

      expect(message).toContain('Examples:');
      expect(message).toContain('schema://default/tables');
      expect(message).toContain('table://default/users');
      expect(message).toContain('table://public/orders/indexes');
    });

    it('should include format descriptions for each pattern', () => {
      const uri = 'invalid://path';
      const message = errorGenerator.generateInvalidUriMessage(uri);

      expect(message).toContain('Complete list of all available database schemas');
      expect(message).toContain('Comprehensive list of all tables');
      expect(message).toContain('Complete detailed information about the');
      expect(message).toContain('Detailed index information');
    });
  });

  describe('generatePatternMatchFailureMessage', () => {
    it('should provide guidance when URI pattern matches but resource not found', () => {
      const uri = 'schema://nonexistent/tables';
      const message = errorGenerator.generatePatternMatchFailureMessage(uri);

      expect(message).toContain('Resource not found: schema://nonexistent/tables');
      expect(message).toContain('The URI format is correct');
      expect(message).toContain('schema://list');
      expect(message).toContain('available schemas');
    });

    it('should handle table resource not found', () => {
      const uri = 'table://default/nonexistent';
      const message = errorGenerator.generatePatternMatchFailureMessage(uri);

      expect(message).toContain('Resource not found: table://default/nonexistent');
      expect(message).toContain('schema://default/tables');
      expect(message).toContain('available tables in the default schema');
    });

    it('should handle table indexes resource not found', () => {
      const uri = 'table://default/nonexistent/indexes';
      const message = errorGenerator.generatePatternMatchFailureMessage(uri);

      expect(message).toContain('Resource not found: table://default/nonexistent/indexes');
      expect(message).toContain('table://default/nonexistent');
      expect(message).toContain('table exists');
    });
  });

  describe('generateSimilarPatternsMessage', () => {
    it('should suggest similar patterns for typos', () => {
      const uri = 'schema://ist'; // typo of 'list'
      const suggestions = errorGenerator.generateSimilarPatternsMessage(uri);

      expect(suggestions).toContain('Did you mean:');
      expect(suggestions).toContain('schema://list');
    });

    it('should suggest similar patterns for partial matches', () => {
      const uri = 'table://user'; // incomplete URI
      const suggestions = errorGenerator.generateSimilarPatternsMessage(uri);

      expect(suggestions).toContain('Did you mean:');
      expect(suggestions).toContain('table://default/users');
    });

    it('should return empty string when no similar patterns found', () => {
      const uri = 'completely-unrelated://path';
      const suggestions = errorGenerator.generateSimilarPatternsMessage(uri);

      expect(suggestions).toBe('');
    });
  });

  describe('generateDetailedErrorMessage', () => {
    it('should combine invalid URI message with suggestions', () => {
      const uri = 'schema://ist';
      const message = errorGenerator.generateDetailedErrorMessage(uri);

      expect(message).toContain('Unknown resource URI: schema://ist');
      expect(message).toContain('Available URI patterns:');
      expect(message).toContain('Did you mean:');
      expect(message).toContain('schema://list');
    });

    it('should only show suggestions when available', () => {
      const uri = 'completely-unrelated://path';
      const message = errorGenerator.generateDetailedErrorMessage(uri);

      expect(message).toContain('Unknown resource URI');
      expect(message).toContain('Available URI patterns:');
      expect(message).not.toContain('Did you mean:');
    });
  });
});

describe('UriPatternSuggester', () => {
  let suggester: UriPatternSuggester;

  beforeEach(() => {
    suggester = new UriPatternSuggester();
  });

  describe('findSimilarPatterns', () => {
    it('should find exact matches with high score', () => {
      const suggestions = suggester.findSimilarPatterns('schema://list', 5, 0.99);

      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].pattern).toBe('schema://list');
      expect(suggestions[0].similarity).toBe(1.0);
    });

    it('should find similar patterns for typos', () => {
      const suggestions = suggester.findSimilarPatterns('schema://ist'); // missing 'l'

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0].pattern).toBe('schema://list');
      expect(suggestions[0].similarity).toBeGreaterThan(0.8);
    });

    it('should handle partial URI patterns', () => {
      const suggestions = suggester.findSimilarPatterns('table://default');

      expect(suggestions.length).toBeGreaterThan(0);
      const tablePatterns = suggestions.filter(s => s.pattern.startsWith('table://default/'));
      expect(tablePatterns.length).toBeGreaterThan(0);
    });

    it('should return suggestions sorted by similarity', () => {
      const suggestions = suggester.findSimilarPatterns('table://');

      expect(suggestions.length).toBeGreaterThan(1);
      for (let i = 1; i < suggestions.length; i++) {
        expect(suggestions[i].similarity).toBeLessThanOrEqual(suggestions[i-1].similarity);
      }
    });

    it('should limit number of suggestions', () => {
      const suggestions = suggester.findSimilarPatterns('t', 2);

      expect(suggestions.length).toBeLessThanOrEqual(2);
    });

    it('should filter by minimum similarity threshold', () => {
      const suggestions = suggester.findSimilarPatterns('completely-unrelated', 5, 0.9);

      expect(suggestions.length).toBe(0);
    });
  });

  describe('calculateSimilarity', () => {
    it('should return 1.0 for identical strings', () => {
      const similarity = suggester.calculateSimilarity('schema://list', 'schema://list');
      expect(similarity).toBe(1.0);
    });

    it('should return 0.0 for completely different strings', () => {
      const similarity = suggester.calculateSimilarity('a', 'xyz');
      expect(similarity).toBe(0.0);
    });

    it('should handle single character differences', () => {
      const similarity = suggester.calculateSimilarity('schema://list', 'schema://ist');
      expect(similarity).toBeGreaterThan(0.8);
      expect(similarity).toBeLessThan(1.0);
    });

    it('should handle empty strings', () => {
      const similarity1 = suggester.calculateSimilarity('', '');
      const similarity2 = suggester.calculateSimilarity('test', '');
      const similarity3 = suggester.calculateSimilarity('', 'test');

      expect(similarity1).toBe(1.0);
      expect(similarity2).toBe(0.0);
      expect(similarity3).toBe(0.0);
    });
  });

  describe('generateExampleUris', () => {
    it('should generate example URIs for schema patterns', () => {
      const examples = suggester.generateExampleUris();

      expect(examples).toContain('schema://list');
      expect(examples).toContain('schema://default/tables');
      expect(examples).toContain('schema://public/tables');
    });

    it('should generate example URIs for table patterns', () => {
      const examples = suggester.generateExampleUris();

      expect(examples).toContain('table://default/users');
      expect(examples).toContain('table://public/orders');
      expect(examples).toContain('table://default/users/indexes');
    });

    it('should not generate duplicate examples', () => {
      const examples = suggester.generateExampleUris();
      const uniqueExamples = new Set(examples);

      expect(examples.length).toBe(uniqueExamples.size);
    });
  });
});

describe('Integration: Error Message Generation with Pattern Suggestions', () => {
  let errorGenerator: ErrorMessageGenerator;

  beforeEach(() => {
    errorGenerator = new ErrorMessageGenerator();
  });

  it('should provide comprehensive error message for schema typo', () => {
    const uri = 'chema://list'; // missing 's'
    const message = errorGenerator.generateDetailedErrorMessage(uri);

    expect(message).toContain('Unknown resource URI: chema://list');
    expect(message).toContain('Did you mean:');
    expect(message).toContain('schema://list');
    expect(message).toContain('Available URI patterns:');
  });

  it('should provide specific guidance for incomplete table URI', () => {
    const uri = 'table://default';
    const message = errorGenerator.generateDetailedErrorMessage(uri);

    expect(message).toContain('Unknown resource URI: table://default');
    expect(message).toContain('Did you mean:');
    expect(message).toContain('table://default/');
    expect(message).toContain('table://[schema_name]/[table_name]');
  });

  it('should handle case-sensitive URI patterns', () => {
    const uri = 'SCHEMA://LIST';
    const message = errorGenerator.generateDetailedErrorMessage(uri);

    expect(message).toContain('Unknown resource URI: SCHEMA://LIST');
    expect(message).toContain('Did you mean:');
    expect(message).toContain('schema://list');
  });

  it('should provide helpful error for wrong protocol', () => {
    const uri = 'http://schema/list';
    const message = errorGenerator.generateDetailedErrorMessage(uri);

    expect(message).toContain('Unknown resource URI: http://schema/list');
    expect(message).toContain('Available URI patterns:');
    expect(message).toContain('schema://');
    expect(message).toContain('table://');
  });
});