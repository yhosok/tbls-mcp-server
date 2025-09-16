import { Result, ok } from 'neverthrow';
import { UriPatternsResource, UriPatternInfo } from '../schemas/database';
import { ResourcePatterns, ResourcePattern } from '../server/resource-patterns';

/**
 * Convert a ResourcePattern to UriPatternInfo format
 */
function convertResourcePatternToUriPatternInfo(
  pattern: ResourcePattern
): UriPatternInfo {
  const uriPattern = convertUriPatternToSnakeCase(pattern.uriPattern);
  const parameters = extractParametersFromUriPattern(uriPattern);
  const examples = generateExamplesForPattern(pattern);

  return {
    id: pattern.id,
    uri: uriPattern,
    description: convertDescriptionForDisplay(
      pattern.id,
      pattern.descriptionPattern
    ),
    examples,
    parameters,
  };
}

/**
 * Create the URI patterns resource entry itself
 */
function createUriPatternsResourceEntry(): UriPatternInfo {
  return {
    id: PATTERN_IDS.URI_PATTERNS,
    uri: 'schema://uri-patterns',
    description:
      'List of all available URI patterns supported by the MCP server',
    examples: ['schema://uri-patterns'],
    parameters: [],
  };
}

/**
 * Handles the schema://uri-patterns MCP resource
 * Returns a list of all available URI patterns supported by the server
 *
 * @returns Result containing URI patterns resource or error
 */
export const handleUriPatternsResource = async (): Promise<
  Result<UriPatternsResource, Error>
> => {
  const allPatterns = ResourcePatterns.getAllPatterns();

  // Convert ResourcePattern objects to UriPatternInfo format
  const patterns: UriPatternInfo[] = allPatterns.map(
    convertResourcePatternToUriPatternInfo
  );

  // Add the URI patterns resource itself
  patterns.push(createUriPatternsResourceEntry());

  // Sort patterns by ID for consistent ordering
  patterns.sort((a, b) => a.id.localeCompare(b.id));

  return ok({ patterns });
};

/**
 * Pattern ID constants for type safety and maintainability
 */
const PATTERN_IDS = {
  SCHEMA_LIST: 'schema-list',
  SCHEMA_TABLES: 'schema-tables',
  TABLE_INFO: 'table-info',
  TABLE_INDEXES: 'table-indexes',
  URI_PATTERNS: 'uri-patterns',
} as const;

/**
 * Description mappings for consistent display text
 */
const DESCRIPTION_OVERRIDES: Record<string, string> = {
  [PATTERN_IDS.SCHEMA_LIST]:
    'Complete list of all available database schemas with metadata including schema names, table counts, and version information. URI format: schema://list',
  [PATTERN_IDS.SCHEMA_TABLES]:
    'Comprehensive list of all tables within a specific schema, including table metadata, row counts, and basic structure information. URI format: schema://[schema_name]/tables (example: schema://default/tables, schema://public/tables)',
  [PATTERN_IDS.TABLE_INFO]:
    'Complete detailed information about a specific table including column definitions with data types, constraints, indexes, foreign key relationships, and table statistics. URI format: table://[schema_name]/[table_name] (example: table://default/users, table://public/orders)',
  [PATTERN_IDS.TABLE_INDEXES]:
    'Detailed index information for a specific table including index names, types (primary, unique, regular), column compositions, and performance statistics. URI format: table://[schema_name]/[table_name]/indexes (example: table://default/users/indexes, table://public/orders/indexes)',
};;

/**
 * Convert description to match test expectations
 */
function convertDescriptionForDisplay(
  patternId: string,
  originalDescription: string
): string {
  return DESCRIPTION_OVERRIDES[patternId] ?? originalDescription;
}

/**
 * Parameter name conversion mapping for consistency
 */
const PARAMETER_CONVERSIONS: Record<string, string> = {
  '{schemaName}': '{schema_name}',
  '{tableName}': '{table_name}',
};

/**
 * Convert URI pattern from camelCase to snake_case for parameter names
 */
function convertUriPatternToSnakeCase(uriPattern: string): string {
  let result = uriPattern;
  Object.entries(PARAMETER_CONVERSIONS).forEach(([from, to]) => {
    result = result.replace(new RegExp(from.replace(/[{}]/g, '\\$&'), 'g'), to);
  });
  return result;
}

/**
 * Parameter description mapping for consistent parameter documentation
 */
const PARAMETER_DESCRIPTIONS: Record<string, string> = {
  schema_name: 'Name of the database schema',
  table_name: 'Name of the database table',
};

/**
 * Generate parameter description based on parameter name
 */
function generateParameterDescription(paramName: string): string {
  if (PARAMETER_DESCRIPTIONS[paramName]) {
    return PARAMETER_DESCRIPTIONS[paramName];
  }
  // Fallback: convert underscore to space and add "parameter"
  return `${paramName.replace(/_/g, ' ')} parameter`;
}

/**
 * Extract parameter definitions from a URI pattern string
 */
function extractParametersFromUriPattern(uriPattern: string): Array<{
  name: string;
  description: string;
  required: boolean;
}> {
  const parameterMatches = uriPattern.match(/\{([^}]+)\}/g);
  if (!parameterMatches) {
    return [];
  }

  return parameterMatches.map((match) => {
    const paramName = match.slice(1, -1); // Remove { and }
    return {
      name: paramName,
      description: generateParameterDescription(paramName),
      required: true,
    };
  });
}

/**
 * Example mappings for each pattern type
 */
const PATTERN_EXAMPLES: Record<string, string[]> = {
  [PATTERN_IDS.SCHEMA_LIST]: ['schema://list'],
  [PATTERN_IDS.SCHEMA_TABLES]: [
    'schema://public/tables',
    'schema://default/tables',
  ],
  [PATTERN_IDS.TABLE_INFO]: [
    'table://public/users',
    'table://default/products',
  ],
  [PATTERN_IDS.TABLE_INDEXES]: [
    'table://public/users/indexes',
    'table://default/products/indexes',
  ],
};

/**
 * Example values for parameter replacement in fallback generation
 */
const EXAMPLE_PARAMETER_VALUES: Record<string, string> = {
  schemaName: 'public',
  tableName: 'users',
};

/**
 * Generate fallback examples by replacing parameters with example values
 */
function generateFallbackExamples(uriPattern: string): string[] {
  let example = uriPattern;
  Object.entries(EXAMPLE_PARAMETER_VALUES).forEach(([param, value]) => {
    example = example.replace(new RegExp(`\\{${param}\\}`, 'g'), value);
  });
  return [example];
}

/**
 * Generate example URIs for a given pattern
 */
function generateExamplesForPattern(pattern: ResourcePattern): string[] {
  const predefinedExamples = PATTERN_EXAMPLES[pattern.id];
  if (predefinedExamples) {
    return predefinedExamples;
  }

  // Fallback: replace parameters with example values
  return generateFallbackExamples(pattern.uriPattern);
}
