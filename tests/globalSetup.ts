import 'dotenv/config';
import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';

export default function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL missing in .env');
  execSync('npx prisma migrate deploy', { stdio: 'inherit', env: { ...process.env, DATABASE_URL: url } });
  return () => rmSync('./uploads-test', { recursive: true, force: true });
}