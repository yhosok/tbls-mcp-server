import { Result, ok, err } from 'neverthrow';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ResourcePattern, ResourcePatterns } from '../server/resource-patterns';

/**
 * Interface for extracted resource pattern information
 */
export interface ResourcePatternInfo {
  id: string;
  uriPattern: string;
  namePattern: string;
  descriptionPattern: string;
  requiresDiscovery: boolean;
  mimeType: string;
}

/**
 * Interface for documentation consistency validation result
 */
export interface DocumentationConsistencyResult {
  isConsistent: boolean;
  missingPatterns: string[];
  extraPatterns: string[];
  totalPatterns: number;
  documentedPatterns: number;
}

/**
 * Extract resource pattern information from the ResourcePatterns class
 */
export async function extractResourcePatternsInfo(): Promise<Result<ResourcePatternInfo[], Error>> {
  try {
    const patterns = ResourcePatterns.getAllPatterns();

    const patternInfos: ResourcePatternInfo[] = patterns.map(pattern => ({
      id: pattern.id,
      uriPattern: pattern.uriPattern,
      namePattern: pattern.namePattern,
      descriptionPattern: pattern.descriptionPattern,
      requiresDiscovery: pattern.requiresDiscovery,
      mimeType: pattern.mimeType,
    }));

    return ok(patternInfos);
  } catch (error) {
    return err(new Error(`Failed to extract resource patterns info: ${error instanceof Error ? error.message : 'Unknown error'}`));
  }
}

/**
 * Generate markdown table from resource patterns
 */
export function generateResourcesTable(patterns: ResourcePattern[]): Result<string, Error> {
  try {
    if (patterns.length === 0) {
      return ok(`| URI Pattern | Description | Discovery Required |
|-------------|-------------|-------------------|
*No resources currently defined.*`);
    }

    const header = `| URI Pattern | Description | Discovery Required |
|-------------|-------------|-------------------|`;

    const rows = patterns.map(pattern => {
      // Escape markdown special characters in description
      const escapedDescription = pattern.descriptionPattern
        .replace(/\|/g, '\\|')
        .replace(/\*/g, '\\*')
        .replace(/`/g, '\\`')
        .replace(/_/g, '\\_');

      const discoveryRequired = pattern.requiresDiscovery ? 'Yes' : 'No';

      return `| \`${pattern.uriPattern}\` | ${escapedDescription} | ${discoveryRequired} |`;
    });

    return ok([header, ...rows].join('\n'));
  } catch (error) {
    return err(new Error(`Failed to generate resources table: ${error instanceof Error ? error.message : 'Unknown error'}`));
  }
}

/**
 * Update README.md with generated content between markers
 */
export async function updateReadmeWithGeneratedContent(
  readmePath: string,
  newContent: string
): Promise<Result<void, Error>> {
  try {
    const readmeContent = await fs.readFile(readmePath, 'utf-8');

    const startMarker = '<!-- AUTO-GENERATED:START - Do not modify this section manually -->';
    const endMarker = '<!-- AUTO-GENERATED:END -->';

    const startIndex = readmeContent.indexOf(startMarker);
    const endIndex = readmeContent.indexOf(endMarker);

    let updatedContent: string;

    if (startIndex !== -1 && endIndex !== -1) {
      // Replace existing auto-generated section
      const beforeSection = readmeContent.substring(0, startIndex + startMarker.length);
      const afterSection = readmeContent.substring(endIndex);
      updatedContent = `${beforeSection}\n${newContent}\n${afterSection}`;
    } else if (readmeContent.includes('## MCP Resources')) {
      // Find MCP Resources section and add auto-generated markers
      const mcpSectionIndex = readmeContent.indexOf('## MCP Resources');
      const nextSectionIndex = readmeContent.indexOf('\n## ', mcpSectionIndex + 1);

      const beforeMcpSection = readmeContent.substring(0, mcpSectionIndex);
      const mcpSectionHeader = '## MCP Resources\n\nThe server exposes tbls-generated schema information through the following MCP resources:\n\n';
      const afterMcpSection = nextSectionIndex !== -1 ? readmeContent.substring(nextSectionIndex) : '';

      updatedContent = `${beforeMcpSection}${mcpSectionHeader}${startMarker}\n${newContent}\n${endMarker}\n\n${afterMcpSection}`;
    } else {
      // Add new MCP Resources section at the end
      updatedContent = `${readmeContent}\n\n## MCP Resources\n\nThe server exposes tbls-generated schema information through the following MCP resources:\n\n${startMarker}\n${newContent}\n${endMarker}\n`;
    }

    await fs.writeFile(readmePath, updatedContent, 'utf-8');
    return ok(undefined);
  } catch (error) {
    return err(new Error(`Failed to update README: ${error instanceof Error ? error.message : 'Unknown error'}`));
  }
}

/**
 * Validate that documentation is consistent with current resource patterns
 */
export async function validateDocumentationConsistency(
  readmePath: string
): Promise<Result<DocumentationConsistencyResult, Error>> {
  try {
    const readmeContent = await fs.readFile(readmePath, 'utf-8');
    const startMarker = '<!-- AUTO-GENERATED:START - Do not modify this section manually -->';
    const endMarker = '<!-- AUTO-GENERATED:END -->';

    const startIndex = readmeContent.indexOf(startMarker);
    const endIndex = readmeContent.indexOf(endMarker);

    if (startIndex === -1 || endIndex === -1) {
      return err(new Error('Auto-generated section not found in README'));
    }

    const autoGeneratedSection = readmeContent.substring(
      startIndex + startMarker.length,
      endIndex
    );

    // Extract URI patterns from the auto-generated section
    const uriPatternRegex = /\| `([^`]+)` \|/g;
    const documentedPatterns: string[] = [];
    let match;

    while ((match = uriPatternRegex.exec(autoGeneratedSection)) !== null) {
      documentedPatterns.push(match[1]);
    }

    // Get current resource patterns
    const patternsResult = await extractResourcePatternsInfo();
    if (patternsResult.isErr()) {
      return err(patternsResult.error);
    }

    const currentPatterns = patternsResult.value.map(p => p.uriPattern);

    // Find missing and extra patterns
    const missingPatterns = currentPatterns.filter(p => !documentedPatterns.includes(p));
    const extraPatterns = documentedPatterns.filter(p => !currentPatterns.includes(p));

    return ok({
      isConsistent: missingPatterns.length === 0 && extraPatterns.length === 0,
      missingPatterns,
      extraPatterns,
      totalPatterns: currentPatterns.length,
      documentedPatterns: documentedPatterns.length,
    });
  } catch (error) {
    return err(new Error(`Failed to validate documentation consistency: ${error instanceof Error ? error.message : 'Unknown error'}`));
  }
}

/**
 * Main function to generate and update documentation
 */
export async function generateDocumentation(readmePath?: string): Promise<Result<void, Error>> {
  try {
    const targetReadmePath = readmePath || path.join(process.cwd(), 'README.md');

    // Extract resource patterns information
    const patternsResult = await extractResourcePatternsInfo();
    if (patternsResult.isErr()) {
      return err(patternsResult.error);
    }

    // Generate markdown table
    const tableResult = generateResourcesTable(ResourcePatterns.getAllPatterns());
    if (tableResult.isErr()) {
      return err(tableResult.error);
    }

    // Update README with generated content
    const updateResult = await updateReadmeWithGeneratedContent(targetReadmePath, tableResult.value);
    if (updateResult.isErr()) {
      return err(updateResult.error);
    }

    console.log(`✅ Documentation updated successfully: ${targetReadmePath}`);

    // Validate consistency
    const validationResult = await validateDocumentationConsistency(targetReadmePath);
    if (validationResult.isOk()) {
      const validation = validationResult.value;
      if (validation.isConsistent) {
        console.log('✅ Documentation is consistent with resource patterns');
      } else {
        console.warn('⚠️  Documentation inconsistencies detected:');
        if (validation.missingPatterns.length > 0) {
          console.warn(`  Missing patterns: ${validation.missingPatterns.join(', ')}`);
        }
        if (validation.extraPatterns.length > 0) {
          console.warn(`  Extra patterns: ${validation.extraPatterns.join(', ')}`);
        }
      }
    }

    return ok(undefined);
  } catch (error) {
    return err(new Error(`Failed to generate documentation: ${error instanceof Error ? error.message : 'Unknown error'}`));
  }
}

/**
 * CLI entry point for document generation
 */
if (require.main === module) {
  const args = process.argv.slice(2);
  const validateFlag = args.includes('--validate') || args.includes('-v');
  const readmePath = args.find(arg => !arg.startsWith('--') && !arg.startsWith('-'));

  if (validateFlag) {
    // Validation mode - check if documentation is consistent
    const targetReadmePath = readmePath || path.join(process.cwd(), 'README.md');

    validateDocumentationConsistency(targetReadmePath)
      .then(result => {
        if (result.isErr()) {
          console.error('❌ Validation error:', result.error.message);
          process.exit(1);
        }

        const validation = result.value;
        if (validation.isConsistent) {
          console.log('✅ Documentation is consistent with resource patterns');
          console.log(`   Patterns documented: ${validation.documentedPatterns}/${validation.totalPatterns}`);
          process.exit(0);
        } else {
          console.error('❌ Documentation is inconsistent with resource patterns');
          console.error(`   Patterns documented: ${validation.documentedPatterns}/${validation.totalPatterns}`);

          if (validation.missingPatterns.length > 0) {
            console.error('   Missing patterns:', validation.missingPatterns.join(', '));
          }
          if (validation.extraPatterns.length > 0) {
            console.error('   Extra patterns:', validation.extraPatterns.join(', '));
          }

          console.error('   Run "npm run docs:generate" to update documentation');
          process.exit(1);
        }
      })
      .catch(error => {
        console.error('❌ Unexpected validation error:', error);
        process.exit(1);
      });
  } else {
    // Generation mode
    generateDocumentation(readmePath)
      .then(result => {
        if (result.isErr()) {
          console.error('❌ Error generating documentation:', result.error.message);
          process.exit(1);
        }
      })
      .catch(error => {
        console.error('❌ Unexpected error:', error);
        process.exit(1);
      });
  }
}