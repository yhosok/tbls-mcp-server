// Jest setup file for test configuration
// This file is run before each test suite

import { closeAllPooledConnections } from '../src/database/connection';

beforeAll(() => {
  // Global test setup
  // Clear any existing timers
  jest.clearAllTimers();
});

beforeEach(() => {
  // Clear any existing mocks before each test
  jest.clearAllMocks();
  // Note: We don't enable fake timers globally - individual tests should enable them as needed
});

afterEach(() => {
  // Clean up any timers to prevent hanging
  jest.useRealTimers();
  jest.clearAllTimers();
});

afterAll(async () => {
  // Global test cleanup - close all database connections
  await closeAllPooledConnections();

  // Final timer cleanup
  jest.clearAllTimers();
  jest.useRealTimers();

  // Force garbage collection if available
  if (global.gc) {
    global.gc();
  }
});
