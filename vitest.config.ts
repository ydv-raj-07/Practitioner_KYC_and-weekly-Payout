import { defineConfig } from 'vitest/config';

const url = process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/kyc_test';

export default defineConfig({
  test: {
    env: { DATABASE_URL: url, ENCRYPTION_KEY: 'a'.repeat(64), PAN_HASH_KEY: 'b'.repeat(64), UPLOAD_DIR: './uploads-test' },
    globalSetup: ['./tests/globalSetup.ts'],
    setupFiles: ['./tests/setup.ts'],
    fileParallelism: false, 
    testTimeout: 20000,
  },
});