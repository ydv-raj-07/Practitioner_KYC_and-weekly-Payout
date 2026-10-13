import 'dotenv/config';
import { defineConfig } from 'vitest/config';

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('TEST_DATABASE_URL missing in .env');

export default defineConfig({
  test: {
    env: {
      DATABASE_URL: url,
      ENCRYPTION_KEY: 'a'.repeat(64),
      PAN_HASH_KEY: 'b'.repeat(64),
      UPLOAD_DIR: './uploads-test',
    },
    globalSetup: ['./tests/globalSetup.ts'],
    setupFiles: ['./tests/setup.ts'],
    fileParallelism: false,
    testTimeout: 20000,
  },
});