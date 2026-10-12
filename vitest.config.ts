import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Tests use a separate database so they can TRUNCATE tables freely.
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/kyc_test',
      ENCRYPTION_KEY: 'a'.repeat(64),
      PAN_HASH_KEY: 'b'.repeat(64),
      UPLOAD_DIR: './uploads-test',
    },
    globalSetup: ['./tests/globalSetup.ts'],
    setupFiles: ['./tests/setup.ts'],
    // API tests share one database, so run test files one after another.
    fileParallelism: false,
    testTimeout: 20000,
  },
});