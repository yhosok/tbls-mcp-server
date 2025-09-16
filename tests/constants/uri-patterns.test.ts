// Import the constants module
import {
  PATTERN_IDS,
  URI_PATTERNS,
  URI_TEMPLATES
} from '../../src/constants/uri-patterns';

describe('URI Patterns Constants', () => {

  describe('PATTERN_IDS Constants', () => {
    it('should have correct pattern ID for schema list', () => {
      expect(PATTERN_IDS.SCHEMA_LIST).toBe('db-schemas');
    });

    it('should have correct pattern ID for schema tables', () => {
      expect(PATTERN_IDS.SCHEMA_TABLES).toBe('db-schema-tables');
    });

    it('should have correct pattern ID for table info', () => {
      expect(PATTERN_IDS.TABLE_INFO).toBe('db-table-info');
    });

    it('should have correct pattern ID for table indexes', () => {
      expect(PATTERN_IDS.TABLE_INDEXES).toBe('db-table-indexes');
    });

    it('should have type-safe constant values (as const)', () => {
      // This test ensures TypeScript treats these as literal types, not just string
      const schemaList: 'db-schemas' = PATTERN_IDS.SCHEMA_LIST;
      const schemaTables: 'db-schema-tables' = PATTERN_IDS.SCHEMA_TABLES;
      const tableInfo: 'db-table-info' = PATTERN_IDS.TABLE_INFO;
      const tableIndexes: 'db-table-indexes' = PATTERN_IDS.TABLE_INDEXES;

      expect(schemaList).toBe('db-schemas');
      expect(schemaTables).toBe('db-schema-tables');
      expect(tableInfo).toBe('db-table-info');
      expect(tableIndexes).toBe('db-table-indexes');
    });
  });

  describe('URI_PATTERNS Regular Expressions', () => {

    describe('SCHEMA_LIST Pattern', () => {
      it('should match valid db://schemas URI', () => {
        const match = 'db://schemas'.match(URI_PATTERNS.SCHEMA_LIST);
        expect(match).not.toBeNull();
        expect(match?.[0]).toBe('db://schemas');
      });

      it('should not match invalid schema URIs', () => {
        const invalidUris = [
          'db://schema',          // missing 's'
          'db://schemas/',        // trailing slash
          'schema://schemas',     // wrong protocol
          'db://schemas/public',  // extra path
          'DB://schemas',         // case sensitive
          'db://SCHEMAS'          // case sensitive
        ];

        invalidUris.forEach(uri => {
          const match = uri.match(URI_PATTERNS.SCHEMA_LIST);
          expect(match).toBeNull();
        });
      });

      it('should be case-sensitive', () => {
        expect('DB://schemas'.match(URI_PATTERNS.SCHEMA_LIST)).toBeNull();
        expect('db://SCHEMAS'.match(URI_PATTERNS.SCHEMA_LIST)).toBeNull();
      });
    });

    describe('SCHEMA_TABLES Pattern', () => {
      it('should match valid db://schemas/{schemaName}/tables URI', () => {
        const testCases = [
          'db://schemas/public/tables',
          'db://schemas/auth/tables',
          'db://schemas/user_management/tables',
          'db://schemas/inventory_2024/tables'
        ];

        testCases.forEach(uri => {
          const match = uri.match(URI_PATTERNS.SCHEMA_TABLES);
          expect(match).not.toBeNull();
          expect(match?.[0]).toBe(uri);
        });
      });

      it('should capture schema name parameter correctly', () => {
        const testCases = [
          { uri: 'db://schemas/public/tables', expected: 'public' },
          { uri: 'db://schemas/auth/tables', expected: 'auth' },
          { uri: 'db://schemas/user_management/tables', expected: 'user_management' },
          { uri: 'db://schemas/inventory_2024/tables', expected: 'inventory_2024' }
        ];

        testCases.forEach(({ uri, expected }) => {
          const match = uri.match(URI_PATTERNS.SCHEMA_TABLES);
          expect(match?.[1]).toBe(expected);
        });
      });

      it('should not match invalid schema tables URIs', () => {
        const invalidUris = [
          'db://schemas/tables',           // missing schema name
          'db://schemas//tables',          // empty schema name
          'db://schemas/public',           // missing /tables
          'db://schema/public/tables',     // wrong schemes segment
          'db://schemas/public/table',     // wrong table segment
          'schema://public/tables',        // wrong protocol
          'db://schemas/public/tables/'    // trailing slash
        ];

        invalidUris.forEach(uri => {
          const match = uri.match(URI_PATTERNS.SCHEMA_TABLES);
          expect(match).toBeNull();
        });
      });
    });

    describe('TABLE_INFO Pattern', () => {
      it('should match valid db://schemas/{schemaName}/tables/{tableName} URI', () => {
        const testCases = [
          'db://schemas/public/tables/users',
          'db://schemas/auth/tables/user_sessions',
          'db://schemas/inventory/tables/product_catalog',
          'db://schemas/sales_2024/tables/orders_q1'
        ];

        testCases.forEach(uri => {
          const match = uri.match(URI_PATTERNS.TABLE_INFO);
          expect(match).not.toBeNull();
          expect(match?.[0]).toBe(uri);
        });
      });

      it('should capture both schema and table name parameters correctly', () => {
        const testCases = [
          {
            uri: 'db://schemas/public/tables/users',
            expectedSchema: 'public',
            expectedTable: 'users'
          },
          {
            uri: 'db://schemas/auth/tables/user_sessions',
            expectedSchema: 'auth',
            expectedTable: 'user_sessions'
          },
          {
            uri: 'db://schemas/inventory/tables/product_catalog',
            expectedSchema: 'inventory',
            expectedTable: 'product_catalog'
          }
        ];

        testCases.forEach(({ uri, expectedSchema, expectedTable }) => {
          const match = uri.match(URI_PATTERNS.TABLE_INFO);
          expect(match?.[1]).toBe(expectedSchema);
          expect(match?.[2]).toBe(expectedTable);
        });
      });

      it('should not match invalid table info URIs', () => {
        const invalidUris = [
          'db://schemas/public/tables',        // missing table name
          'db://schemas/public/tables/',       // empty table name
          'db://schemas//tables/users',        // empty schema name
          'db://schemas/public/table/users',   // wrong table segment
          'table://public/users',              // wrong protocol
          'db://schemas/public/tables/users/'  // trailing slash
        ];

        invalidUris.forEach(uri => {
          const match = uri.match(URI_PATTERNS.TABLE_INFO);
          expect(match).toBeNull();
        });
      });
    });

    describe('TABLE_INDEXES Pattern', () => {
      it('should match valid db://schemas/{schemaName}/tables/{tableName}/indexes URI', () => {
        const testCases = [
          'db://schemas/public/tables/users/indexes',
          'db://schemas/auth/tables/sessions/indexes',
          'db://schemas/inventory/tables/products/indexes',
          'db://schemas/sales_2024/tables/orders/indexes'
        ];

        testCases.forEach(uri => {
          const match = uri.match(URI_PATTERNS.TABLE_INDEXES);
          expect(match).not.toBeNull();
          expect(match?.[0]).toBe(uri);
        });
      });

      it('should capture both schema and table name parameters correctly for indexes', () => {
        const testCases = [
          {
            uri: 'db://schemas/public/tables/users/indexes',
            expectedSchema: 'public',
            expectedTable: 'users'
          },
          {
            uri: 'db://schemas/auth/tables/sessions/indexes',
            expectedSchema: 'auth',
            expectedTable: 'sessions'
          },
          {
            uri: 'db://schemas/inventory/tables/products/indexes',
            expectedSchema: 'inventory',
            expectedTable: 'products'
          }
        ];

        testCases.forEach(({ uri, expectedSchema, expectedTable }) => {
          const match = uri.match(URI_PATTERNS.TABLE_INDEXES);
          expect(match?.[1]).toBe(expectedSchema);
          expect(match?.[2]).toBe(expectedTable);
        });
      });

      it('should not match invalid table indexes URIs', () => {
        const invalidUris = [
          'db://schemas/public/tables/users',          // missing /indexes
          'db://schemas/public/tables/users/index',    // wrong index segment
          'db://schemas/public/tables/users/indexes/', // trailing slash
          'db://schemas//tables/users/indexes',        // empty schema name
          'db://schemas/public/tables//indexes',       // empty table name
          'table://public/users/indexes'               // wrong protocol
        ];

        invalidUris.forEach(uri => {
          const match = uri.match(URI_PATTERNS.TABLE_INDEXES);
          expect(match).toBeNull();
        });
      });
    });

    describe('Pattern Specificity and Order', () => {
      it('should have patterns with correct precedence for matching', () => {
        // More specific patterns should match before less specific ones
        const uri = 'db://schemas/public/tables/users/indexes';

        // Should match the most specific pattern
        expect(uri.match(URI_PATTERNS.TABLE_INDEXES)).not.toBeNull();

        // Should not match less specific patterns
        expect(uri.match(URI_PATTERNS.TABLE_INFO)).toBeNull();
        expect(uri.match(URI_PATTERNS.SCHEMA_TABLES)).toBeNull();
        expect(uri.match(URI_PATTERNS.SCHEMA_LIST)).toBeNull();
      });

      it('should distinguish between similar URI patterns', () => {
        const uris = {
          schemaList: 'db://schemas',
          schemaTables: 'db://schemas/public/tables',
          tableInfo: 'db://schemas/public/tables/users',
          tableIndexes: 'db://schemas/public/tables/users/indexes'
        };

        // Each URI should only match its intended pattern
        expect(uris.schemaList.match(URI_PATTERNS.SCHEMA_LIST)).not.toBeNull();
        expect(uris.schemaList.match(URI_PATTERNS.SCHEMA_TABLES)).toBeNull();
        expect(uris.schemaList.match(URI_PATTERNS.TABLE_INFO)).toBeNull();
        expect(uris.schemaList.match(URI_PATTERNS.TABLE_INDEXES)).toBeNull();

        expect(uris.schemaTables.match(URI_PATTERNS.SCHEMA_TABLES)).not.toBeNull();
        expect(uris.schemaTables.match(URI_PATTERNS.SCHEMA_LIST)).toBeNull();
        expect(uris.schemaTables.match(URI_PATTERNS.TABLE_INFO)).toBeNull();
        expect(uris.schemaTables.match(URI_PATTERNS.TABLE_INDEXES)).toBeNull();

        expect(uris.tableInfo.match(URI_PATTERNS.TABLE_INFO)).not.toBeNull();
        expect(uris.tableInfo.match(URI_PATTERNS.SCHEMA_LIST)).toBeNull();
        expect(uris.tableInfo.match(URI_PATTERNS.SCHEMA_TABLES)).toBeNull();
        expect(uris.tableInfo.match(URI_PATTERNS.TABLE_INDEXES)).toBeNull();

        expect(uris.tableIndexes.match(URI_PATTERNS.TABLE_INDEXES)).not.toBeNull();
        expect(uris.tableIndexes.match(URI_PATTERNS.SCHEMA_LIST)).toBeNull();
        expect(uris.tableIndexes.match(URI_PATTERNS.SCHEMA_TABLES)).toBeNull();
        expect(uris.tableIndexes.match(URI_PATTERNS.TABLE_INFO)).toBeNull();
      });
    });
  });

  describe('URI_TEMPLATES Constants', () => {
    it('should have correct template for schema list', () => {
      expect(URI_TEMPLATES.SCHEMA_LIST).toBe('db://schemas');
    });

    it('should have correct template for schema tables', () => {
      expect(URI_TEMPLATES.SCHEMA_TABLES).toBe('db://schemas/{schemaName}/tables');
    });

    it('should have correct template for table info', () => {
      expect(URI_TEMPLATES.TABLE_INFO).toBe('db://schemas/{schemaName}/tables/{tableName}');
    });

    it('should have correct template for table indexes', () => {
      expect(URI_TEMPLATES.TABLE_INDEXES).toBe('db://schemas/{schemaName}/tables/{tableName}/indexes');
    });

    it('should have type-safe template values (as const)', () => {
      // This test ensures TypeScript treats these as literal types
      const schemaListTemplate: 'db://schemas' = URI_TEMPLATES.SCHEMA_LIST;
      const schemaTablesTemplate: 'db://schemas/{schemaName}/tables' = URI_TEMPLATES.SCHEMA_TABLES;
      const tableInfoTemplate: 'db://schemas/{schemaName}/tables/{tableName}' = URI_TEMPLATES.TABLE_INFO;
      const tableIndexesTemplate: 'db://schemas/{schemaName}/tables/{tableName}/indexes' = URI_TEMPLATES.TABLE_INDEXES;

      expect(schemaListTemplate).toBe('db://schemas');
      expect(schemaTablesTemplate).toBe('db://schemas/{schemaName}/tables');
      expect(tableInfoTemplate).toBe('db://schemas/{schemaName}/tables/{tableName}');
      expect(tableIndexesTemplate).toBe('db://schemas/{schemaName}/tables/{tableName}/indexes');
    });

    it('should use consistent parameter naming across templates', () => {
      // Verify that parameter names are consistent
      expect(URI_TEMPLATES.SCHEMA_TABLES).toContain('{schemaName}');
      expect(URI_TEMPLATES.TABLE_INFO).toContain('{schemaName}');
      expect(URI_TEMPLATES.TABLE_INFO).toContain('{tableName}');
      expect(URI_TEMPLATES.TABLE_INDEXES).toContain('{schemaName}');
      expect(URI_TEMPLATES.TABLE_INDEXES).toContain('{tableName}');
    });

    it('should follow hierarchical URI structure', () => {
      // Verify templates follow logical hierarchy
      expect(URI_TEMPLATES.SCHEMA_LIST).toBe('db://schemas');
      expect(URI_TEMPLATES.SCHEMA_TABLES.startsWith('db://schemas/')).toBe(true);
      expect(URI_TEMPLATES.TABLE_INFO.startsWith('db://schemas/')).toBe(true);
      expect(URI_TEMPLATES.TABLE_INFO.includes('/tables/')).toBe(true);
      expect(URI_TEMPLATES.TABLE_INDEXES.startsWith('db://schemas/')).toBe(true);
      expect(URI_TEMPLATES.TABLE_INDEXES.includes('/tables/')).toBe(true);
      expect(URI_TEMPLATES.TABLE_INDEXES.endsWith('/indexes')).toBe(true);
    });
  });

  describe('Type Safety and Constants Structure', () => {
    it('should export all required constant objects', () => {
      expect(PATTERN_IDS).toBeDefined();
      expect(URI_PATTERNS).toBeDefined();
      expect(URI_TEMPLATES).toBeDefined();

      expect(typeof PATTERN_IDS).toBe('object');
      expect(typeof URI_PATTERNS).toBe('object');
      expect(typeof URI_TEMPLATES).toBe('object');
    });

    it('should have all required properties in PATTERN_IDS', () => {
      expect(PATTERN_IDS).toHaveProperty('SCHEMA_LIST');
      expect(PATTERN_IDS).toHaveProperty('SCHEMA_TABLES');
      expect(PATTERN_IDS).toHaveProperty('TABLE_INFO');
      expect(PATTERN_IDS).toHaveProperty('TABLE_INDEXES');
    });

    it('should have all required properties in URI_PATTERNS', () => {
      expect(URI_PATTERNS).toHaveProperty('SCHEMA_LIST');
      expect(URI_PATTERNS).toHaveProperty('SCHEMA_TABLES');
      expect(URI_PATTERNS).toHaveProperty('TABLE_INFO');
      expect(URI_PATTERNS).toHaveProperty('TABLE_INDEXES');

      // Verify they are RegExp objects
      expect(URI_PATTERNS.SCHEMA_LIST).toBeInstanceOf(RegExp);
      expect(URI_PATTERNS.SCHEMA_TABLES).toBeInstanceOf(RegExp);
      expect(URI_PATTERNS.TABLE_INFO).toBeInstanceOf(RegExp);
      expect(URI_PATTERNS.TABLE_INDEXES).toBeInstanceOf(RegExp);
    });

    it('should have all required properties in URI_TEMPLATES', () => {
      expect(URI_TEMPLATES).toHaveProperty('SCHEMA_LIST');
      expect(URI_TEMPLATES).toHaveProperty('SCHEMA_TABLES');
      expect(URI_TEMPLATES).toHaveProperty('TABLE_INFO');
      expect(URI_TEMPLATES).toHaveProperty('TABLE_INDEXES');

      // Verify they are strings
      expect(typeof URI_TEMPLATES.SCHEMA_LIST).toBe('string');
      expect(typeof URI_TEMPLATES.SCHEMA_TABLES).toBe('string');
      expect(typeof URI_TEMPLATES.TABLE_INFO).toBe('string');
      expect(typeof URI_TEMPLATES.TABLE_INDEXES).toBe('string');
    });

    it('should have consistent naming between PATTERN_IDS and other objects', () => {
      // Verify that all objects have the same property names
      const patternIdsKeys = Object.keys(PATTERN_IDS).sort();
      const uriPatternsKeys = Object.keys(URI_PATTERNS).sort();
      const uriTemplatesKeys = Object.keys(URI_TEMPLATES).sort();

      expect(patternIdsKeys).toEqual(uriPatternsKeys);
      expect(patternIdsKeys).toEqual(uriTemplatesKeys);
      expect(uriPatternsKeys).toEqual(uriTemplatesKeys);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle special characters in schema and table names', () => {
      // Test with underscores, numbers, and other valid identifier characters
      const specialCases = [
        {
          uri: 'db://schemas/user_management_2024/tables/user_sessions_v2',
          pattern: URI_PATTERNS.TABLE_INFO,
          expectedSchema: 'user_management_2024',
          expectedTable: 'user_sessions_v2'
        },
        {
          uri: 'db://schemas/test123/tables/table_with_numbers_456',
          pattern: URI_PATTERNS.TABLE_INFO,
          expectedSchema: 'test123',
          expectedTable: 'table_with_numbers_456'
        }
      ];

      specialCases.forEach(({ uri, pattern, expectedSchema, expectedTable }) => {
        const match = uri.match(pattern);
        expect(match).not.toBeNull();
        expect(match?.[1]).toBe(expectedSchema);
        expect(match?.[2]).toBe(expectedTable);
      });
    });

    it('should not match URIs with invalid characters', () => {
      const invalidChars = [
        'db://schemas/public!/tables/users',     // exclamation mark
        'db://schemas/public@domain/tables/users', // @ symbol
        'db://schemas/public schema/tables/users', // space
        'db://schemas/public-schema/tables/users', // hyphen (if not allowed)
      ];

      invalidChars.forEach(uri => {
        expect(uri.match(URI_PATTERNS.SCHEMA_TABLES)).toBeNull();
        expect(uri.match(URI_PATTERNS.TABLE_INFO)).toBeNull();
      });
    });

    it('should be performant with regex matching', () => {
      // Simple performance check - patterns should match quickly
      const uri = 'db://schemas/public/tables/users/indexes';
      const iterations = 1000;

      const start = Date.now();
      for (let i = 0; i < iterations; i++) {
        uri.match(URI_PATTERNS.TABLE_INDEXES);
      }
      const duration = Date.now() - start;

      // Should complete 1000 matches in reasonable time (< 100ms)
      expect(duration).toBeLessThan(100);
    });
  });
});