import { jest } from '@jest/globals';
import { EventEmitter } from 'events';

/**
 * Mock interfaces for file system stats
 * Used in file watcher and resource cache tests
 */
export interface MockStats {
  mtime: Date;
  isFile: () => boolean;
  isDirectory?: () => boolean;
}

/**
 * Mock interface for FSWatcher with Jest mock functions
 * Used in file watcher tests
 */
export interface MockFSWatcher extends EventEmitter {
  close: jest.Mock;
}

/**
 * Mock interface for MCP server with request handlers
 * Used in server tests for progressive discovery and lazy loading
 */
export interface MockServer {
  _requestHandlers: Map<string, Function>;
}

/**
 * Mock request interface for testing server handlers
 */
export interface MockRequest {
  method: string;
  params: Record<string, unknown>;
}

/**
 * Mock response interface for resource list operations
 */
export interface MockResourceListResponse {
  resources: Array<{
    uri: string;
    mimeType: string;
    name: string;
    description: string;
  }>;
}

/**
 * Mock response interface for resource read operations
 */
export interface MockResourceReadResponse {
  contents: Array<{
    uri: string;
    mimeType: string;
    text?: string;
    blob?: Uint8Array;
  }>;
}

/**
 * Utility functions for creating mock file stats
 */
export const createMockStats = (
  mtime: Date,
  isFile: boolean,
  isDirectory?: boolean
): MockStats => ({
  mtime,
  isFile: () => isFile,
  isDirectory: isDirectory !== undefined ? (): boolean => isDirectory : undefined,
});

/**
 * Utility function for creating mock FSWatcher
 */
export const createMockFSWatcher = (): MockFSWatcher => {
  return Object.assign(new EventEmitter(), {
    close: jest.fn(),
  }) as MockFSWatcher;
};

/**
 * Utility function for creating mock file stats for files
 */
export const createFileStats = (mtime: Date): MockStats =>
  createMockStats(mtime, true, false);

/**
 * Utility function for creating mock file stats for directories
 */
export const createDirectoryStats = (mtime: Date): MockStats =>
  createMockStats(mtime, false, true);

/**
 * Additional type exports for complex server tests
 */
export interface MockLazyResourceMetadata {
  uri: string;
  name: string;
  lazy?: boolean;
}

export interface MockLazyResourceResponse {
  resources: MockLazyResourceMetadata[];
}

export interface MockCacheEntry {
  data: MockResourceReadResponse;
  timestamp: number;
}

export interface MockResourceRegistryMetadata {
  discoveryHandler: string;
  cacheStrategy: { ttlMs: number };
}

export type MockDiscoveryHandler = (
  uri: string,
  cache?: unknown // Use unknown to avoid circular imports with ResourceCache
) => Promise<MockResourceReadResponse>;