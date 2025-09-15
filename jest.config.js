const { createDefaultPreset } = require('ts-jest');

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/?(*.)+(spec|test).ts'
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: [
    'text',
    'lcov',
    'html'
  ],
  coverageProvider: 'v8',
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  maxWorkers: '75%',
  watchman: false,
  cache: true,
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      useESM: true,
      tsconfig: 'tsconfig.test.json'
    }]
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testTimeout: 10000,
  // Configure fake timers to handle setTimeout, setImmediate, etc.
  fakeTimers: {
    enableGlobally: false,
    doNotFake: [
      'performance',
      'Date',
      'hrtime',
      'nextTick'
    ],
    advanceTimers: false,
    now: 0
  },
  // Force exit to prevent hanging
  forceExit: true,
  // Handle open handles detection
  detectOpenHandles: true,
  // Ensure proper cleanup
  clearMocks: true,
  restoreMocks: true
};