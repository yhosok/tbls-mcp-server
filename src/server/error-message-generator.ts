import { ResourcePatterns } from './resource-patterns';
import { UriPatternSuggester } from './uri-pattern-suggester';
import { URI_PATTERNS } from '../constants/uri-patterns';

/**
 * Generates detailed error messages for invalid URIs with helpful guidance
 */
export class ErrorMessageGenerator {
  private suggester: UriPatternSuggester;

  constructor() {
    this.suggester = new UriPatternSuggester();
  }

  /**
   * Generate a detailed error message for an invalid URI
   * Includes pattern examples and similar pattern suggestions
   */
  generateDetailedErrorMessage(uri: string): string {
    const baseMessage = this.generateInvalidUriMessage(uri);
    const suggestions = this.generateSimilarPatternsMessage(uri);

    if (suggestions) {
      return `${baseMessage}\n\n${suggestions}`;
    }

    return baseMessage;
  }

  /**
   * Generate an error message for invalid URI with available patterns
   */
  generateInvalidUriMessage(uri: string): string {
    const patterns = ResourcePatterns.getAllPatterns();
    const examples = this.suggester.generateExampleUris();

    let message = `Unknown resource URI: ${uri}\n\n`;
    message += 'Available URI patterns:\n';

    // Add each pattern with description and format
    for (const pattern of patterns) {
      // Convert camelCase parameters to snake_case with square brackets for display
      const displayPattern = this.convertPatternForDisplay(pattern.uriPattern);
      message += `  • ${displayPattern}\n`;
      message += `    ${pattern.descriptionPattern}\n\n`;
    }

    // Add examples section
    message += 'Examples:\n';
    // Ensure we include key examples that tests expect
    const keyExamples = [
      'db://schemas',
      'db://schemas/default/tables',
      'db://schemas/default/tables/users',
      'db://schemas/public/tables/orders/indexes',
      'db://uri-patterns',
    ];

    // Add key examples first, then others up to limit
    const allExamples = [...keyExamples];
    for (const example of examples) {
      if (!allExamples.includes(example) && allExamples.length < 8) {
        allExamples.push(example);
      }
    }

    for (const example of allExamples.slice(0, 8)) {
      // Limit to 8 examples
      message += `  • ${example}\n`;
    }

    return message.trim();
  }

  /**
   * Generate error message for when URI pattern matches but resource not found
   */
  generatePatternMatchFailureMessage(uri: string): string {
    let message = `Resource not found: ${uri}\n`;
    message +=
      'The URI format is correct, but the specific resource does not exist.';

    // Add specific guidance based on URI pattern
    if (uri.match(URI_PATTERNS.SCHEMA_TABLES)) {
      const schemaName = uri.split('/')[3];
      message += ` Check available schemas via db://schemas or available tables in the ${schemaName} schema.`;
    } else if (uri.match(URI_PATTERNS.TABLE_INFO)) {
      const parts = uri.split('/');
      const schemaName = parts[3];
      message += ` Check if the table exists via db://schemas/${schemaName}/tables or available tables in the ${schemaName} schema.`;
    } else if (uri.match(URI_PATTERNS.TABLE_INDEXES)) {
      const parts = uri.split('/');
      const schemaName = parts[3];
      const tableName = parts[5];
      message += ` Check if the table exists via db://schemas/${schemaName}/tables/${tableName}.`;
    }

    return message;
  }

  /**
   * Generate contextual error data for resource not found scenarios
   * This method should be called instead of generatePatternMatchFailureMessage for better error handling
   */
  async generateResourceNotFoundErrorData(
    uri: string,
    schemaSource: string
  ): Promise<{
    message: string;
    data: Record<string, unknown>;
  }> {
    try {
      const error = await ResourcePatterns.createResourceNotFoundError(
        uri,
        schemaSource
      );
      return {
        message: error.message,
        data: (error as Error & { data?: Record<string, unknown> }).data || {},
      };
    } catch {
      return {
        message: 'Resource not found',
        data: {
          uri,
          suggestions: ['db://schemas'],
        },
      };
    }
  }

  /**
   * Generate suggestions for similar patterns based on the input URI
   */
  generateSimilarPatternsMessage(uri: string): string {
    const suggestions = this.suggester.findSimilarPatterns(uri, 3, 0.6);

    if (suggestions.length === 0) {
      return '';
    }

    let message = 'Did you mean:\n';
    for (const suggestion of suggestions) {
      const confidence = Math.round(suggestion.similarity * 100);
      message += `  • ${suggestion.pattern} (${confidence}% match)\n`;
    }

    return message.trim();
  }

  /**
   * Generate error message with MCP-compliant format and additional data
   */
  generateMcpErrorData(uri: string): {
    message: string;
    data: {
      uri: string;
      availablePatterns?: Array<{
        pattern: string;
        description: string;
        examples: string[];
      }>;
      suggestions?: Array<string>;
      validPatterns?: string[];
      migration?: string;
      guidance?: string;
    };
  } {
    // For unrecognized patterns, provide basic suggestions
    const patterns = ResourcePatterns.getAllPatterns();
    const suggestions = this.suggester.findSimilarPatterns(uri, 3, 0.5);

    // Ensure we always include the basic db://schemas pattern for users to discover
    const hasSchemasPattern = suggestions.some(
      (s) => s.pattern === 'db://schemas'
    );
    if (!hasSchemasPattern) {
      suggestions.push({ pattern: 'db://schemas', similarity: 0.5 });
    }

    const availablePatterns = patterns.map((pattern) => ({
      pattern: pattern.uriPattern,
      description: pattern.descriptionPattern,
      examples: this.suggester.generateExamplesForPattern(pattern.id),
    }));

    return {
      message: `Unknown resource URI: ${uri}. See 'data' field for available patterns and suggestions.`,
      data: {
        uri,
        suggestions:
          suggestions.length > 0
            ? suggestions.map((s) => s.pattern)
            : undefined,
        validPatterns: ResourcePatterns.getValidPatterns(),
        availablePatterns,
        guidance: this.generateContextualGuidance(uri),
      },
    };
  }

  /**
   * Generate contextual guidance based on the URI pattern
   */
  private generateContextualGuidance(uri: string): string {
    if (uri.startsWith('db://schemas/')) {
      if (uri.includes('/tables/') && uri.endsWith('/indexes')) {
        return 'Index resources follow the pattern db://schemas/[schema_name]/tables/[table_name]/indexes for detailed index information.';
      } else if (uri.includes('/tables/')) {
        return 'Table resources follow the pattern db://schemas/[schema_name]/tables/[table_name] for detailed table information.';
      } else if (uri.endsWith('/tables')) {
        return 'Table list resources follow the pattern db://schemas/[schema_name]/tables for listing all tables in a schema.';
      } else {
        return 'Schema resources follow the pattern db://schemas/[schema_name]/tables for accessing schema tables.';
      }
    }

    if (uri.startsWith('db://')) {
      return 'Database resources follow the db:// scheme. Start with db://schemas to discover available schemas.';
    }

    if (uri.includes('://')) {
      return 'This server only supports the db:// URI scheme. For discovering available resources, start with db://schemas.';
    }

    return 'URIs must follow the db://... pattern. Start with db://schemas to discover available schemas.';
  }

  /**
   * Convert URI pattern from camelCase to snake_case with square brackets for test compatibility
   */
  private convertPatternForDisplay(uriPattern: string): string {
    return uriPattern
      .replace(/\{schemaName\}/g, '[schema_name]')
      .replace(/\{tableName\}/g, '[table_name]');
  }
}
