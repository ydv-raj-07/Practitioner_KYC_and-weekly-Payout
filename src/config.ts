import 'dotenv/config';

const need = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`Missing env: ${k}`);
  return v;
};
const key = (k: string) => {
  const v = need(k);
  if (!/^[0-9a-f]{64}$/i.test(v)) throw new Error(`${k} must be 64 hex chars`);
  return Buffer.from(v, 'hex');
};

export const config = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: need('DATABASE_URL'),
  encKey: key('ENCRYPTION_KEY'),
  panKey: key('PAN_HASH_KEY'),
  uploadDir: process.env.UPLOAD_DIR ?? './uploads',
  maxFileBytes: 5 * 1024 * 1024,
};