import { ResourcePatterns } from './resource-patterns';

/**
 * Represents a URI pattern suggestion with similarity score
 */
export interface PatternSuggestion {
  pattern: string;
  similarity: number;
  description?: string;
}

/**
 * Provides URI pattern suggestions using similarity calculations
 */
export class UriPatternSuggester {
  /**
   * Find similar URI patterns for the given input URI
   */
  findSimilarPatterns(
    uri: string,
    maxSuggestions: number = 5,
    minSimilarity: number = 0.3
  ): PatternSuggestion[] {
    const allPatterns = this.getAllAvailablePatterns();
    const suggestions: PatternSuggestion[] = [];

    for (const pattern of allPatterns) {
      const similarity = this.calculateSimilarity(uri.toLowerCase(), pattern.toLowerCase());

      if (similarity >= minSimilarity) {
        suggestions.push({
          pattern,
          similarity,
        });
      }
    }

    // Sort by similarity (highest first) and limit results
    return suggestions
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, maxSuggestions);
  }

  /**
   * Calculate similarity between two strings using Levenshtein distance
   * Returns a value between 0.0 (completely different) and 1.0 (identical)
   */
  calculateSimilarity(str1: string, str2: string): number {
    if (str1 === str2) {
      return 1.0;
    }

    if (str1.length === 0) {
      return str2.length === 0 ? 1.0 : 0.0;
    }

    if (str2.length === 0) {
      return 0.0;
    }

    const maxLength = Math.max(str1.length, str2.length);
    const distance = this.calculateLevenshteinDistance(str1, str2);

    // Convert distance to similarity score
    return (maxLength - distance) / maxLength;
  }

  /**
   * Generate example URIs for all available patterns
   */
  generateExampleUris(): string[] {
    const examples: Set<string> = new Set();

    // Add static examples for each pattern
    examples.add('schema://list');
    examples.add('schema://default/tables');
    examples.add('schema://public/tables');
    examples.add('schema://main/tables');

    examples.add('table://default/users');
    examples.add('table://public/orders');
    examples.add('table://main/products');

    examples.add('table://default/users/indexes');
    examples.add('table://public/orders/indexes');
    examples.add('table://main/products/indexes');

    return Array.from(examples);
  }

  /**
   * Generate examples for a specific pattern ID
   */
  generateExamplesForPattern(patternId: string): string[] {
    switch (patternId) {
      case 'schema-list':
        return ['schema://list'];

      case 'schema-tables':
        return [
          'schema://default/tables',
          'schema://public/tables',
          'schema://main/tables',
        ];

      case 'table-info':
        return [
          'table://default/users',
          'table://public/orders',
          'table://main/products',
        ];

      case 'table-indexes':
        return [
          'table://default/users/indexes',
          'table://public/orders/indexes',
          'table://main/products/indexes',
        ];

      default:
        return [];
    }
  }

  /**
   * Calculate Levenshtein distance between two strings
   * This is the minimum number of single-character edits required to transform one string into another
   */
  private calculateLevenshteinDistance(str1: string, str2: string): number {
    const len1 = str1.length;
    const len2 = str2.length;

    // Create a 2D array to store distances
    const matrix: number[][] = [];

    // Initialize the matrix
    for (let i = 0; i <= len1; i++) {
      matrix[i] = [];
      matrix[i][0] = i;
    }

    for (let j = 0; j <= len2; j++) {
      matrix[0][j] = j;
    }

    // Fill the matrix using dynamic programming
    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;

        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,     // deletion
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j - 1] + cost // substitution
        );
      }
    }

    return matrix[len1][len2];
  }

  /**
   * Get all available URI patterns including static patterns and common examples
   */
  private getAllAvailablePatterns(): string[] {
    const patterns: Set<string> = new Set();

    // Get patterns from ResourcePatterns
    const resourcePatterns = ResourcePatterns.getAllPatterns();
    for (const pattern of resourcePatterns) {
      patterns.add(pattern.uriPattern);
    }

    // Add common example patterns that users might try
    const examples = this.generateExampleUris();
    for (const example of examples) {
      patterns.add(example);
    }

    // Add variations that users might try
    patterns.add('schema://uri-patterns');
    patterns.add('schemas://list');          // common typo
    patterns.add('table://list');            // incorrect pattern
    patterns.add('tables://list');           // common typo

    return Array.from(patterns);
  }

  /**
   * Find patterns that are structurally similar (same URI scheme and path structure)
   */
  findStructurallySimilar(uri: string): PatternSuggestion[] {
    const allPatterns = this.getAllAvailablePatterns();
    const suggestions: PatternSuggestion[] = [];

    // Extract URI components
    const uriParts = this.parseUri(uri);
    if (!uriParts) {
      return [];
    }

    for (const pattern of allPatterns) {
      const patternParts = this.parseUri(pattern);
      if (!patternParts) {
        continue;
      }

      // Calculate structural similarity
      const structuralSimilarity = this.calculateStructuralSimilarity(uriParts, patternParts);

      if (structuralSimilarity > 0.5) {
        suggestions.push({
          pattern,
          similarity: structuralSimilarity,
          description: `Structural match (${Math.round(structuralSimilarity * 100)}%)`,
        });
      }
    }

    return suggestions.sort((a, b) => b.similarity - a.similarity);
  }

  /**
   * Parse URI into components for structural comparison
   */
  private parseUri(uri: string): { scheme: string; path: string; segments: string[] } | null {
    const match = uri.match(/^([^:]+):\/\/(.*)$/);
    if (!match) {
      return null;
    }

    const [, scheme, path] = match;
    const segments = path.split('/').filter(s => s.length > 0);

    return { scheme, path, segments };
  }

  /**
   * Calculate structural similarity between two parsed URIs
   */
  private calculateStructuralSimilarity(
    uri1: { scheme: string; path: string; segments: string[] },
    uri2: { scheme: string; path: string; segments: string[] }
  ): number {
    let score = 0;
    let maxScore = 0;

    // Scheme similarity (30% weight)
    maxScore += 0.3;
    if (uri1.scheme === uri2.scheme) {
      score += 0.3;
    } else {
      // Partial credit for similar schemes
      const schemeSimilarity = this.calculateSimilarity(uri1.scheme, uri2.scheme);
      score += 0.3 * schemeSimilarity;
    }

    // Segment count similarity (20% weight)
    maxScore += 0.2;
    const segmentCountDiff = Math.abs(uri1.segments.length - uri2.segments.length);
    const maxSegments = Math.max(uri1.segments.length, uri2.segments.length);
    if (maxSegments > 0) {
      score += 0.2 * (1 - segmentCountDiff / maxSegments);
    } else {
      score += 0.2; // Both have no segments
    }

    // Segment content similarity (50% weight)
    maxScore += 0.5;
    const minSegments = Math.min(uri1.segments.length, uri2.segments.length);
    if (minSegments > 0) {
      let segmentScore = 0;
      for (let i = 0; i < minSegments; i++) {
        segmentScore += this.calculateSimilarity(uri1.segments[i], uri2.segments[i]);
      }
      score += 0.5 * (segmentScore / minSegments);
    }

    return maxScore > 0 ? score / maxScore : 0;
  }
}