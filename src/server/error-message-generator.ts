import { ResourcePatterns } from './resource-patterns';
import { UriPatternSuggester } from './uri-pattern-suggester';

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
      message += `  • ${pattern.uriPattern}\n`;
      message += `    ${pattern.descriptionPattern}\n\n`;
    }

    // Add examples section
    message += 'Examples:\n';
    for (const example of examples.slice(0, 6)) { // Limit to 6 examples
      message += `  • ${example}\n`;
    }

    return message.trim();
  }

  /**
   * Generate error message for when URI pattern matches but resource not found
   */
  generatePatternMatchFailureMessage(uri: string): string {
    let message = `Resource not found: ${uri}\n\n`;
    message += 'The URI format is correct, but the specific resource does not exist.\n\n';

    // Provide specific guidance based on URI type
    if (uri.includes('/tables')) {
      const schemaMatch = uri.match(/^schema:\/\/([^/]+)\/tables$/);
      if (schemaMatch) {
        const schemaName = schemaMatch[1];
        message += `To see available schemas, try: schema://list\n`;
        message += `To verify the "${schemaName}" schema exists, check the schemas list first.`;
      }
    } else if (uri.match(/^table:\/\/[^/]+\/[^/]+$/)) {
      const match = uri.match(/^table:\/\/([^/]+)\/([^/]+)$/);
      if (match) {
        const [, schemaName, tableName] = match;
        message += `To see available tables in the ${schemaName} schema, try: schema://${schemaName}/tables\n`;
        message += `To verify the "${tableName}" table exists, check the tables list for the schema first.`;
      }
    } else if (uri.includes('/indexes')) {
      const match = uri.match(/^table:\/\/([^/]+)\/([^/]+)\/indexes$/);
      if (match) {
        const [, schemaName, tableName] = match;
        message += `To verify the table exists, try: table://${schemaName}/${tableName}\n`;
        message += `Index information is only available for existing tables.`;
      }
    }

    return message.trim();
  }

  /**
   * Generate suggestions for similar patterns based on the input URI
   */
  generateSimilarPatternsMessage(uri: string): string {
    const suggestions = this.suggester.findSimilarPatterns(uri, 3, 0.5);

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
      availablePatterns: Array<{
        pattern: string;
        description: string;
        examples: string[];
      }>;
      suggestions?: Array<{
        pattern: string;
        similarity: number;
      }>;
      guidance?: string;
    };
  } {
    const patterns = ResourcePatterns.getAllPatterns();
    const suggestions = this.suggester.findSimilarPatterns(uri, 3, 0.5);

    const availablePatterns = patterns.map(pattern => ({
      pattern: pattern.uriPattern,
      description: pattern.descriptionPattern,
      examples: this.suggester.generateExamplesForPattern(pattern.id),
    }));

    const data: {
      uri: string;
      availablePatterns: Array<{
        pattern: string;
        description: string;
        examples: string[];
      }>;
      suggestions?: Array<{
        pattern: string;
        similarity: number;
      }>;
      guidance?: string;
    } = {
      uri,
      availablePatterns,
    };

    if (suggestions.length > 0) {
      data.suggestions = suggestions;
    }

    // Add specific guidance based on URI pattern
    data.guidance = this.generateContextualGuidance(uri);

    return {
      message: `Unknown resource URI: ${uri}. See 'data' field for available patterns and suggestions.`,
      data,
    };
  }

  /**
   * Generate contextual guidance based on the URI pattern
   */
  private generateContextualGuidance(uri: string): string {
    if (uri.startsWith('schema://')) {
      return 'Schema resources follow the pattern schema://[schema_name]/tables or schema://list for all schemas.';
    }

    if (uri.startsWith('table://')) {
      return 'Table resources follow the pattern table://[schema_name]/[table_name] or table://[schema_name]/[table_name]/indexes for index information.';
    }

    if (uri.includes('://')) {
      return 'This server only supports schema:// and table:// URI schemes. For discovering available resources, start with schema://list.';
    }

    return 'URIs must follow the schema://... or table://... patterns. Start with schema://list to discover available schemas.';
  }
}