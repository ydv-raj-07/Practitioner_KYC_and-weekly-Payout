import request from 'supertest';
import type { PractitionerStatus } from '../generated/prisma/enums.js';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db.js';

export const app = createApp();
export const ADMIN = { 'x-user-id': '11111111-1111-4111-8111-111111111111', 'x-role': 'admin' };
export const as = (id: string) => ({ 'x-user-id': id, 'x-role': 'practitioner' });

export const reset = () =>
  prisma.$executeRawUnsafe('TRUNCATE "Payout","Earning","Document","AuditLog","Practitioner" CASCADE');

let n = 0;
export const applyBody = (o: Record<string, unknown> = {}) => ({
  name: 'Raj Ranjan', pan: `ABCDE${String(++n).padStart(4, '0')}Z`, phone: '9876543210', skills: ['backend'], ...o,
});

export async function create(status: PractitionerStatus = 'submitted', o: Record<string, unknown> = {}) {
  const res = await request(app).post('/practitioners/apply').send(applyBody(o));
  if (res.status !== 201) throw new Error(`apply failed: ${JSON.stringify(res.body)}`);
  if (status !== 'submitted') await prisma.practitioner.update({ where: { id: res.body.id }, data: { status } });
  return res.body.id as string;
}

export const earn = (practitionerId: string, amountPaise: number, iso: string) =>
  prisma.earning.create({ data: { practitionerId, amountPaise, earnedAt: new Date(iso) } });