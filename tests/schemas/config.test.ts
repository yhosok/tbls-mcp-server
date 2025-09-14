import {
  DatabaseConfig,
  ServerConfig,
  LogLevel,
  validateServerConfig,
  validateDatabaseConfig,
} from '../../src/schemas/config';

describe('config schemas', () => {
  describe('LogLevel', () => {
    it('should accept valid log levels', () => {
      expect(LogLevel.parse('debug')).toBe('debug');
      expect(LogLevel.parse('info')).toBe('info');
      expect(LogLevel.parse('warn')).toBe('warn');
      expect(LogLevel.parse('error')).toBe('error');
    });

    it('should reject invalid log levels', () => {
      expect(() => LogLevel.parse('invalid')).toThrow();
      expect(() => LogLevel.parse('trace')).toThrow();
    });
  });

  describe('DatabaseConfig', () => {
    describe('MySQL configuration', () => {
      it('should validate MySQL connection string', () => {
        const config = {
          type: 'mysql' as const,
          connectionString: 'mysql://user:pass@localhost:3306/testdb',
        };
        expect(DatabaseConfig.parse(config)).toEqual(config);
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
        expect(DatabaseConfig.parse(config)).toEqual(config);
      });

      it('should require either connectionString or individual connection params', () => {
        const configWithoutConnection = {
          type: 'mysql' as const,
        };
        expect(() => DatabaseConfig.parse(configWithoutConnection)).toThrow();
      });

      it('should reject invalid MySQL connection string format', () => {
        const config = {
          type: 'mysql' as const,
          connectionString: 'invalid-connection-string',
        };
        expect(() => DatabaseConfig.parse(config)).toThrow();
      });
    });

    describe('SQLite configuration', () => {
      it('should validate SQLite file path', () => {
        const config = {
          type: 'sqlite' as const,
          path: '/path/to/database.db',
        };
        expect(DatabaseConfig.parse(config)).toEqual(config);
      });

      it('should validate SQLite with :memory: path', () => {
        const config = {
          type: 'sqlite' as const,
          path: ':memory:',
        };
        expect(DatabaseConfig.parse(config)).toEqual(config);
      });

      it('should require path for SQLite', () => {
        const config = {
          type: 'sqlite' as const,
        };
        expect(() => DatabaseConfig.parse(config)).toThrow();
      });
    });
  });

  describe('ServerConfig', () => {
    it('should validate complete server configuration', () => {
      const config = {
        schemaDir: '/path/to/schemas',
        logLevel: 'info' as const,
        database: {
          type: 'mysql' as const,
          connectionString: 'mysql://user:pass@localhost:3306/testdb',
        },
      };
      expect(ServerConfig.parse(config)).toEqual(config);
    });

    it('should validate minimal server configuration', () => {
      const config = {
        schemaDir: '/path/to/schemas',
      };
      const parsed = ServerConfig.parse(config);
      expect(parsed.schemaDir).toBe('/path/to/schemas');
      expect(parsed.logLevel).toBe('info'); // default value
    });

    it('should set default log level to info', () => {
      const config = {
        schemaDir: '/path/to/schemas',
      };
      const parsed = ServerConfig.parse(config);
      expect(parsed.logLevel).toBe('info');
    });

    it('should require schemaDir', () => {
      const config = {};
      expect(() => ServerConfig.parse(config)).toThrow();
    });

    it('should validate schemaDir as non-empty string', () => {
      const config = {
        schemaDir: '',
      };
      expect(() => ServerConfig.parse(config)).toThrow();
    });
  });

  describe('validateServerConfig', () => {
    it('should return success for valid configuration', () => {
      const config = {
        schemaDir: '/path/to/schemas',
        logLevel: 'debug' as const,
      };
      const result = validateServerConfig(config);
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual(config);
      }
    });

    it('should return error for invalid configuration', () => {
      const config = {
        schemaDir: '',
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
        type: 'invalid' as any,
      };
      const result = validateDatabaseConfig(config);
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toContain('validation');
      }
    });
  });
});