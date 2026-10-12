import { z } from 'zod';
import { AppError } from './errors.js';

export const isUuid = (v: unknown): v is string => z.uuid().safeParse(v).success;

export const applySchema = z.object({
  name: z.string().trim().min(2, 'name must be 2-100 chars').max(100, 'name must be 2-100 chars'),
  displayName: z.string().trim().min(2, 'displayName must be 2-50 chars').max(50, 'displayName must be 2-50 chars').optional(),
  pan: z.string().trim().transform((s) => s.toUpperCase())
    .pipe(z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, 'pan must look like ABCDE1234F')),
  phone: z.string().trim().transform((s) => s.replace(/[\s-]/g, ''))
    .pipe(z.string().regex(/^(\+91|91)?[6-9]\d{9}$/, 'phone must be a valid Indian mobile number'))
    .transform((s) => s.slice(-10)),
  skills: z.array(z.string().trim().min(1, 'skill cannot be empty').max(50, 'skill too long'))
    .min(1, 'at least 1 skill required').max(20, 'max 20 skills')
    .transform((a) => [...new Set(a)]),
});

export const statusSchema = z.object({
  status: z.enum(['submitted', 'under_review', 'approved', 'rejected'], { error: 'invalid status' }),
});

// Returns field + OUR message only. The user's value (PAN/phone) is never echoed back.
export function parse<T extends z.ZodType>(schema: T, body: unknown): z.output<T> {
  const r = schema.safeParse(body);
  if (!r.success) {
    const details = r.error.issues.map((i) => ({ field: i.path.join('.') || 'body', message: i.message }));
    throw new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', details);
  }
  return r.data;
}

export function uuidParam(v: unknown): string {
  if (!isUuid(v)) throw new AppError(400, 'INVALID_ID', 'id must be a valid UUID');
  return v;
}