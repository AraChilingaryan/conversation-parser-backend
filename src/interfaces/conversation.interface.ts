export * from './conversation.interface';

// tests/setup.ts
import { config } from 'dotenv';

// Load test environment variables
config({ path: '.env.test' });

// Set test environment
process.env.NODE_ENV = 'test';

// Global test setup
beforeAll(async () => {
    console.log('🧪 Setting up tests...');
});

afterAll(async () => {
    console.log('🧹 Cleaning up tests...');
});

// Increase test timeout for integration tests
jest.setTimeout(30000);
