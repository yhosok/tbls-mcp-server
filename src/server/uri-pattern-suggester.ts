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
      let similarity = this.calculateSimilarity(uri.toLowerCase(), pattern.toLowerCase());

      // Boost similarity for semantic matches and prefix matches
      similarity = this.boostSimilarityForSemanticMatches(uri.toLowerCase(), pattern.toLowerCase(), similarity);

      // Boost valid db:// patterns to ensure they're prioritized (but not for exact matches)
      // Only boost if there's already some baseline similarity
      if (pattern.startsWith('db://') && similarity < 1.0 && similarity >= 0.3) {
        // Extra boost for basic patterns that users should discover first
        if (pattern === 'db://schemas' || pattern === 'db://uri-patterns') {
          similarity = Math.min(0.98, similarity + 0.3);
        } else {
          similarity = Math.min(0.95, similarity + 0.15);
        }
      }


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

    // Convert distance to similarity score with adjustment for typos
    let similarity = (maxLength - distance) / maxLength;

    // Boost similarity for common typo patterns, but don't make non-exact matches equal to 1.0
    if (this.isLikelyTypo(str1, str2, distance)) {
      similarity = Math.min(0.95, similarity + 0.1);
    }

    return similarity;
  }

  /**
   * Generate example URIs for all available patterns
   */
  generateExampleUris(): string[] {
    const examples: Set<string> = new Set();

    // Add static examples for each pattern using new db:// scheme
    examples.add('db://schemas');
    examples.add('db://schemas/default/tables');
    examples.add('db://schemas/public/tables');
    examples.add('db://schemas/main/tables');

    examples.add('db://schemas/default/tables/users');
    examples.add('db://schemas/public/tables/orders');
    examples.add('db://schemas/main/tables/products');

    examples.add('db://schemas/default/tables/users/indexes');
    examples.add('db://schemas/public/tables/orders/indexes');
    examples.add('db://schemas/main/tables/products/indexes');

    // Also include URI patterns resource
    examples.add('db://uri-patterns');

    return Array.from(examples);
  }

  /**
   * Generate examples for a specific pattern ID
   */
  generateExamplesForPattern(patternId: string): string[] {
    switch (patternId) {
      // New db:// patterns
      case 'db-schemas':
        return ['db://schemas'];

      case 'db-schema-tables':
        return [
          'db://schemas/default/tables',
          'db://schemas/public/tables',
          'db://schemas/main/tables',
        ];

      case 'db-schema':
        return [
          'db://schemas/default',
          'db://schemas/public',
          'db://schemas/main',
        ];

      case 'db-table-info':
        return [
          'db://schemas/default/tables/users',
          'db://schemas/public/tables/orders',
          'db://schemas/main/tables/products',
        ];

      case 'db-table-indexes':
        return [
          'db://schemas/default/tables/users/indexes',
          'db://schemas/public/tables/orders/indexes',
          'db://schemas/main/tables/products/indexes',
        ];

      case 'uri-patterns':
        return ['db://uri-patterns'];


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
    patterns.add('db://uri-patterns');
    patterns.add('schemas://list');          // common typo
    patterns.add('tables://list');           // common typo
    patterns.add('db://schema');             // incomplete pattern
    patterns.add('db://tables');             // incomplete pattern

    return Array.from(patterns);
  }

  /**
   * Boost similarity scores for semantic and structural matches
   */
  private boostSimilarityForSemanticMatches(inputUri: string, candidatePattern: string, baseSimilarity: number): number {
    // Don't boost if we already have an exact match
    if (baseSimilarity >= 1.0) {
      return baseSimilarity;
    }

    let boostedSimilarity = baseSimilarity;

    // Boost for prefix matches (candidate contains input as prefix)
    // Only boost if it's a meaningful prefix (not just different by a few characters)
    if (candidatePattern.startsWith(inputUri) && candidatePattern.length > inputUri.length + 3) {
      boostedSimilarity = Math.min(0.95, boostedSimilarity + 0.3); // Cap below 1.0 for non-exact matches
    }

    // Boost for partial path matches (input looks like it could extend to candidate)
    if (this.isPartialPathMatch(inputUri, candidatePattern)) {
      boostedSimilarity = Math.min(0.95, boostedSimilarity + 0.2); // Cap below 1.0 for non-exact matches
    }

    // Boost for semantic similarity (user -> users, etc.)
    if (this.hasSemanticSimilarity(inputUri, candidatePattern)) {
      boostedSimilarity = Math.min(0.95, boostedSimilarity + 0.15); // Cap below 1.0 for non-exact matches
    }

    return boostedSimilarity;
  }

  /**
   * Check if input URI is a partial path that could extend to candidate
   */
  private isPartialPathMatch(inputUri: string, candidatePattern: string): boolean {
    const inputParts = inputUri.split('/');
    const candidateParts = candidatePattern.split('/');

    // Check if input path components are a prefix of candidate path components
    if (inputParts.length >= candidateParts.length) {
      return false;
    }

    for (let i = 0; i < inputParts.length; i++) {
      if (inputParts[i] !== candidateParts[i]) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check for semantic similarity between words
   */
  private hasSemanticSimilarity(inputUri: string, candidatePattern: string): boolean {
    // Extract the last component for comparison
    const inputLastPart = inputUri.split('/').pop() || '';
    const candidateLastPart = candidatePattern.split('/').pop() || '';

    // Check for plural/singular matches
    if (inputLastPart === 'user' && candidateLastPart === 'users') return true;
    if (inputLastPart === 'users' && candidateLastPart === 'user') return true;
    if (inputLastPart === 'table' && candidateLastPart === 'tables') return true;
    if (inputLastPart === 'tables' && candidateLastPart === 'table') return true;
    if (inputLastPart === 'schema' && candidateLastPart === 'schemas') return true;
    if (inputLastPart === 'schemas' && candidateLastPart === 'schema') return true;

    return false;
  }

  /**
   * Check if the difference between two strings looks like a typo
   */
  private isLikelyTypo(str1: string, str2: string, distance: number): boolean {
    // If distance is small relative to string length, it's likely a typo
    const maxLength = Math.max(str1.length, str2.length);
    const minLength = Math.min(str1.length, str2.length);

    // Small distance relative to string length
    if (distance <= Math.max(2, maxLength * 0.25)) {
      return true;
    }

    // Length difference is small (insertion/deletion of a few characters)
    if (Math.abs(str1.length - str2.length) <= 3 && minLength >= 5) {
      return true;
    }

    // Check for specific patterns like substitution of similar characters
    if (distance <= 4 && this.hasSimilarPattern(str1, str2)) {
      return true;
    }

    return false;
  }

  /**
   * Check if two strings have similar patterns (suggesting typos)
   */
  private hasSimilarPattern(str1: string, str2: string): boolean {
    // Convert to lowercase for comparison
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();

    // Common character substitutions
    const substitutions = [
      ['l', '1'], ['i', '1'], ['o', '0'], ['s', '$'],
      ['a', '@'], ['e', '3'], ['l', '_'], ['_', '-']
    ];

    for (const [char1, char2] of substitutions) {
      if ((s1.includes(char1) && s2.includes(char2)) ||
          (s1.includes(char2) && s2.includes(char1))) {
        return true;
      }
    }

    return false;
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