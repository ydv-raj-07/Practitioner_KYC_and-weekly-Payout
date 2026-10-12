import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { config } from './config.js';

export function encrypt(plain: string, key = config.encKey): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), data]).toString('base64');
}

export function decrypt(payload: string, key = config.encKey): string {
  const raw = Buffer.from(payload, 'base64');
  if (raw.length < 28) throw new Error('Invalid payload');
  const d = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(12, 28)); 
  return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
}

export const hashPan = (pan: string) => createHmac('sha256', config.panKey).update(pan).digest('hex');