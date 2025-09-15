import {
  DatabaseConfigSchema,
  ServerConfigSchema,
  LogLevelSchema,
  validateServerConfig,
  validateDatabaseConfig,
} from '../../src/schemas/config';

describe('config schemas', () => {
  describe('LogLevel', () => {
    it('should accept valid log levels', () => {
      expect(LogLevelSchema.parse('debug')).toBe('debug');
      expect(LogLevelSchema.parse('info')).toBe('info');
      expect(LogLevelSchema.parse('warn')).toBe('warn');
      expect(LogLevelSchema.parse('error')).toBe('error');
    });

    it('should reject invalid log levels', () => {
      expect(() => LogLevelSchema.parse('invalid')).toThrow();
      expect(() => LogLevelSchema.parse('trace')).toThrow();
    });
  });

  describe('DatabaseConfig', () => {
    describe('MySQL configuration', () => {
      it('should validate MySQL connection string', () => {
        const config = {
          type: 'mysql' as const,
          connectionString: 'mysql://user:pass@localhost:3306/testdb',
        };
        expect(DatabaseConfigSchema.parse(config)).toEqual(config);
      });

      it('should validate MySQL with host, port, user, password, database', () => {
        const config = {
          type: 'mysql' as const,
          host: 'localhost',
          port: 3306,
          user: 'testuser',
          password: 'testpass',
          database: 'testdb',
        };
        expect(DatabaseConfigSchema.parse(config)).toEqual(config);
      });

      it('should require either connectionString or individual connection params', () => {
        const configWithoutConnection = {
          type: 'mysql' as const,
        };
        expect(() => DatabaseConfigSchema.parse(configWithoutConnection)).toThrow();
      });

      it('should reject invalid MySQL connection string format', () => {
        const config = {
          type: 'mysql' as const,
          connectionString: 'invalid-connection-string',
        };
        expect(() => DatabaseConfigSchema.parse(config)).toThrow();
      });
    });

    describe('SQLite configuration', () => {
      it('should validate SQLite file path', () => {
        const config = {
          type: 'sqlite' as const,
          path: '/path/to/database.db',
        };
        expect(DatabaseConfigSchema.parse(config)).toEqual(config);
      });

      it('should validate SQLite with :memory: path', () => {
        const config = {
          type: 'sqlite' as const,
          path: ':memory:',
        };
        expect(DatabaseConfigSchema.parse(config)).toEqual(config);
      });

      it('should require path for SQLite', () => {
        const config = {
          type: 'sqlite' as const,
        };
        expect(() => DatabaseConfigSchema.parse(config)).toThrow();
      });
    });
  });

  describe('ServerConfig', () => {
    describe('schemaSource support', () => {
      it('should validate complete server configuration with schemaSource', () => {
        const config = {
          schemaSource: '/path/to/schemas',
          logLevel: 'info' as const,
          database: {
            type: 'mysql' as const,
            connectionString: 'mysql://user:pass@localhost:3306/testdb',
          },
        };
        expect(ServerConfigSchema.parse(config)).toEqual(config);
      });

      it('should accept schemaSource as file path', () => {
        const config = {
          schemaSource: '/path/to/schema.json',
        };
        const parsed = ServerConfigSchema.parse(config);
        expect(parsed.schemaSource).toBe('/path/to/schema.json');
      });

      it('should accept schemaSource as directory path', () => {
        const config = {
          schemaSource: '/path/to/schemas/',
        };
        const parsed = ServerConfigSchema.parse(config);
        expect(parsed.schemaSource).toBe('/path/to/schemas/');
      });

      it('should require schemaSource to be non-empty', () => {
        const config = {
          schemaSource: '',
        };
        expect(() => ServerConfigSchema.parse(config)).toThrow();
      });

      it('should set default log level to info with schemaSource', () => {
        const config = {
          schemaSource: '/path/to/schemas',
        };
        const parsed = ServerConfigSchema.parse(config);
        expect(parsed.logLevel).toBe('info');
      });

      it('should require schemaSource', () => {
        const config = {};
        expect(() => ServerConfigSchema.parse(config)).toThrow();
      });
    });
  });

  describe('validateServerConfig', () => {
    it('should return success for valid configuration', () => {
      const config = {
        schemaSource: '/path/to/schemas',
        logLevel: 'debug' as const,
      };
      const result = validateServerConfig(config);
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.schemaSource).toBe('/path/to/schemas');
        expect(result.value.logLevel).toBe('debug');
      }
    });

    it('should return error for invalid configuration', () => {
      const config = {
        schemaSource: '',
      };
      const result = validateServerConfig(config);
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toContain('validation');
      }
    });
  });

  describe('validateDatabaseConfig', () => {
    it('should return success for valid MySQL configuration', () => {
      const config = {
        type: 'mysql' as const,
        connectionString: 'mysql://user:pass@localhost:3306/testdb',
      };
      const result = validateDatabaseConfig(config);
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual(config);
      }
    });

    it('should return success for valid SQLite configuration', () => {
      const config = {
        type: 'sqlite' as const,
        path: '/path/to/database.db',
      };
      const result = validateDatabaseConfig(config);
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual(config);
      }
    });

    it('should return error for invalid configuration', () => {
      const config = {
        type: 'invalid' as unknown,
      };
      const result = validateDatabaseConfig(config);
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toContain('validation');
      }
    });
  });
});