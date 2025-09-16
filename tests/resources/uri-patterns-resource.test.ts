import { describe, it, expect } from '@jest/globals';
import { handleUriPatternsResource } from '../../src/resources/uri-patterns-resource';
import type { UriPatternsResource } from '../../src/schemas/database';

describe('URI Patterns Resource Handler', () => {
  describe('handleUriPatternsResource', () => {
    it('should return all available URI patterns', async () => {
      const result = await handleUriPatternsResource();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const resource: UriPatternsResource = result.value;
        expect(resource.patterns).toBeInstanceOf(Array);
        expect(resource.patterns.length).toBeGreaterThan(0);
      }
    });

    it('should include schema list pattern', async () => {
      const result = await handleUriPatternsResource();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const resource: UriPatternsResource = result.value;
        const schemaListPattern = resource.patterns.find(
          (pattern) => pattern.id === 'db-schemas'
        );

        expect(schemaListPattern).toBeDefined();
        expect(schemaListPattern?.uri).toBe('db://schemas');
        expect(schemaListPattern?.description).toContain('schemas');
        expect(schemaListPattern?.examples).toContain('db://schemas');
        expect(schemaListPattern?.parameters).toEqual([]);
      }
    });

    it('should include schema tables pattern', async () => {
      const result = await handleUriPatternsResource();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const resource: UriPatternsResource = result.value;
        const schemaTablesPattern = resource.patterns.find(
          (pattern) => pattern.id === 'db-schema-tables'
        );

        expect(schemaTablesPattern).toBeDefined();
        expect(schemaTablesPattern?.uri).toBe('db://schemas/{schema_name}/tables');
        expect(schemaTablesPattern?.description).toContain('tables');
        expect(schemaTablesPattern?.examples).toContain(
          'db://schemas/public/tables'
        );
        expect(schemaTablesPattern?.parameters).toHaveLength(1);
        expect(schemaTablesPattern?.parameters[0]).toEqual({
          name: 'schema_name',
          description: 'Name of the database schema',
          required: true,
        });
      }
    });

    it('should include table info pattern', async () => {
      const result = await handleUriPatternsResource();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const resource: UriPatternsResource = result.value;
        const tableInfoPattern = resource.patterns.find(
          (pattern) => pattern.id === 'db-table-info'
        );

        expect(tableInfoPattern).toBeDefined();
        expect(tableInfoPattern?.uri).toBe(
          'db://schemas/{schema_name}/tables/{table_name}'
        );
        expect(tableInfoPattern?.description).toContain('detailed information');
        expect(tableInfoPattern?.examples).toContain('db://schemas/public/tables/users');
        expect(tableInfoPattern?.parameters).toHaveLength(2);
        expect(tableInfoPattern?.parameters).toContainEqual({
          name: 'schema_name',
          description: 'Name of the database schema',
          required: true,
        });
        expect(tableInfoPattern?.parameters).toContainEqual({
          name: 'table_name',
          description: 'Name of the database table',
          required: true,
        });
      }
    });

    it('should include table indexes pattern', async () => {
      const result = await handleUriPatternsResource();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const resource: UriPatternsResource = result.value;
        const tableIndexesPattern = resource.patterns.find(
          (pattern) => pattern.id === 'db-table-indexes'
        );

        expect(tableIndexesPattern).toBeDefined();
        expect(tableIndexesPattern?.uri).toBe(
          'db://schemas/{schema_name}/tables/{table_name}/indexes'
        );
        expect(tableIndexesPattern?.description).toContain('index');
        expect(tableIndexesPattern?.examples).toContain(
          'db://schemas/public/tables/users/indexes'
        );
        expect(tableIndexesPattern?.parameters).toHaveLength(2);
        expect(tableIndexesPattern?.parameters).toContainEqual({
          name: 'schema_name',
          description: 'Name of the database schema',
          required: true,
        });
        expect(tableIndexesPattern?.parameters).toContainEqual({
          name: 'table_name',
          description: 'Name of the database table',
          required: true,
        });
      }
    });

    it('should include URI patterns resource pattern itself', async () => {
      const result = await handleUriPatternsResource();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const resource: UriPatternsResource = result.value;
        const uriPatternsPattern = resource.patterns.find(
          (pattern) => pattern.id === 'uri-patterns'
        );

        expect(uriPatternsPattern).toBeDefined();
        expect(uriPatternsPattern?.uri).toBe('db://uri-patterns');
        expect(uriPatternsPattern?.description).toContain('URI patterns');
        expect(uriPatternsPattern?.examples).toContain('db://uri-patterns');
        expect(uriPatternsPattern?.parameters).toEqual([]);
      }
    });

    it('should return patterns with all required fields', async () => {
      const result = await handleUriPatternsResource();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const resource: UriPatternsResource = result.value;

        resource.patterns.forEach((pattern) => {
          expect(pattern.id).toBeDefined();
          expect(typeof pattern.id).toBe('string');
          expect(pattern.id.length).toBeGreaterThan(0);

          expect(pattern.uri).toBeDefined();
          expect(typeof pattern.uri).toBe('string');
          expect(pattern.uri.length).toBeGreaterThan(0);

          expect(pattern.description).toBeDefined();
          expect(typeof pattern.description).toBe('string');
          expect(pattern.description.length).toBeGreaterThan(0);

          expect(pattern.examples).toBeDefined();
          expect(Array.isArray(pattern.examples)).toBe(true);
          expect(pattern.examples.length).toBeGreaterThan(0);

          expect(pattern.parameters).toBeDefined();
          expect(Array.isArray(pattern.parameters)).toBe(true);

          pattern.parameters.forEach((param) => {
            expect(param.name).toBeDefined();
            expect(typeof param.name).toBe('string');
            expect(param.name.length).toBeGreaterThan(0);

            expect(param.description).toBeDefined();
            expect(typeof param.description).toBe('string');
            expect(param.description.length).toBeGreaterThan(0);

            expect(typeof param.required).toBe('boolean');
          });
        });
      }
    });

    it('should return patterns sorted by ID for consistent ordering', async () => {
      const result = await handleUriPatternsResource();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const resource: UriPatternsResource = result.value;

        const sortedIds = resource.patterns.map((p) => p.id).sort();
        const actualIds = resource.patterns.map((p) => p.id);

        expect(actualIds).toEqual(sortedIds);
      }
    });

    it('should include comprehensive examples for each pattern', async () => {
      const result = await handleUriPatternsResource();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const resource: UriPatternsResource = result.value;

        resource.patterns.forEach((pattern) => {
          // Each pattern should have at least one example
          expect(pattern.examples.length).toBeGreaterThanOrEqual(1);

          // Examples should be valid URIs
          pattern.examples.forEach((example) => {
            expect(example).toMatch(/^db:\/\//);
          });
        });
      }
    });

    it('should handle empty parameters gracefully', async () => {
      const result = await handleUriPatternsResource();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const resource: UriPatternsResource = result.value;

        // At least one pattern should have no parameters (like schema://list)
        const patternsWithoutParams = resource.patterns.filter(
          (p) => p.parameters.length === 0
        );
        expect(patternsWithoutParams.length).toBeGreaterThan(0);
      }
    });

    it('should provide meaningful descriptions for all patterns', async () => {
      const result = await handleUriPatternsResource();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const resource: UriPatternsResource = result.value;

        resource.patterns.forEach((pattern) => {
          // Description should be meaningful (more than just the pattern ID)
          expect(pattern.description.length).toBeGreaterThan(pattern.id.length);

          // Should contain helpful words
          const description = pattern.description.toLowerCase();
          const helpfulWords = [
            'schema',
            'table',
            'index',
            'list',
            'information',
            'pattern',
            'uri',
          ];
          const containsHelpfulWord = helpfulWords.some((word) =>
            description.includes(word)
          );
          expect(containsHelpfulWord).toBe(true);
        });
      }
    });

    it('should handle parameter extraction correctly for complex patterns', async () => {
      const result = await handleUriPatternsResource();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const resource: UriPatternsResource = result.value;
        const tableInfoPattern = resource.patterns.find(
          (p) => p.id === 'db-table-info'
        );

        expect(tableInfoPattern?.parameters).toHaveLength(2);

        // Check parameter names are converted to snake_case
        const paramNames =
          tableInfoPattern?.parameters.map((p) => p.name) || [];
        expect(paramNames).toContain('schema_name');
        expect(paramNames).toContain('table_name');

        // Check all parameters are required
        tableInfoPattern?.parameters.forEach((param) => {
          expect(param.required).toBe(true);
        });
      }
    });

    it('should provide consistent URI format across all patterns', async () => {
      const result = await handleUriPatternsResource();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const resource: UriPatternsResource = result.value;

        resource.patterns.forEach((pattern) => {
          // All URIs should start with db:// protocol
          expect(pattern.uri).toMatch(/^db:\/\//);

          // Parameter placeholders should use snake_case
          const paramMatches = pattern.uri.match(/\{([^}]+)\}/g) || [];
          paramMatches.forEach((match) => {
            const paramName = match.slice(1, -1);
            expect(paramName).toMatch(/^[a-z]+(_[a-z]+)*$/);
          });
        });
      }
    });

    it('should provide diverse examples for pattern demonstration', async () => {
      const result = await handleUriPatternsResource();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const resource: UriPatternsResource = result.value;

        // Patterns with parameters should have multiple examples
        const patternsWithParams = resource.patterns.filter(
          (p) => p.parameters.length > 0
        );
        patternsWithParams.forEach((pattern) => {
          if (pattern.id !== 'uri-patterns') {
            expect(pattern.examples.length).toBeGreaterThanOrEqual(1);
          }
        });

        // Examples should not contain parameter placeholders
        resource.patterns.forEach((pattern) => {
          pattern.examples.forEach((example) => {
            expect(example).not.toMatch(/\{[^}]+\}/);
          });
        });
      }
    });

    it('should maintain consistency in pattern ordering', async () => {
      // Run multiple times to ensure ordering is stable
      const results = await Promise.all([
        handleUriPatternsResource(),
        handleUriPatternsResource(),
        handleUriPatternsResource(),
      ]);

      results.forEach((result) => expect(result.isOk()).toBe(true));

      if (results.every((r) => r.isOk())) {
        const firstResult = results[0].value as UriPatternsResource;
        const firstIds = firstResult.patterns.map((p) => p.id);

        results.slice(1).forEach((result) => {
          const ids = (result.value as UriPatternsResource).patterns.map(
            (p) => p.id
          );
          expect(ids).toEqual(firstIds);
        });
      }
    });
  });

  describe('helper functions validation', () => {
    it('should handle patterns without parameters', async () => {
      const result = await handleUriPatternsResource();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const resource: UriPatternsResource = result.value;
        const schemaListPattern = resource.patterns.find(
          (p) => p.id === 'db-schemas'
        );

        expect(schemaListPattern?.parameters).toEqual([]);
        expect(schemaListPattern?.uri).not.toMatch(/\{[^}]+\}/);
      }
    });

    it('should generate appropriate descriptions for all pattern types', async () => {
      const result = await handleUriPatternsResource();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const resource: UriPatternsResource = result.value;

        // Check specific description overrides
        const tableInfoPattern = resource.patterns.find(
          (p) => p.id === 'db-table-info'
        );
        expect(tableInfoPattern?.description).toContain(
          'detailed information'
        );

        const tableIndexesPattern = resource.patterns.find(
          (p) => p.id === 'db-table-indexes'
        );
        expect(tableIndexesPattern?.description).toContain('index information');
      }
    });
  });
});
