import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { ADMIN, app, as, create, reset } from './helpers.js';

beforeEach(reset);
const patch = (id: string, status: unknown, h: Record<string, string> = ADMIN) =>
  request(app).patch(`/admin/practitioners/${id}/status`).set(h).send({ status });

describe('access control', () => {
  it('401 for missing/invalid headers, 403 for wrong role', async () => {
    const id = await create();
    const bad = [{}, { 'x-role': 'admin' }, { 'x-user-id': ADMIN['x-user-id'] },
      { 'x-user-id': 'nope', 'x-role': 'admin' }, { 'x-user-id': ADMIN['x-user-id'], 'x-role': 'Admin' }];
    for (const h of bad) {
      expect((await request(app).get(`/admin/practitioners/${id}/identity`).set(h)).status).toBe(401);
      expect((await request(app).get('/practitioners/me/payouts').set(h)).status).toBe(401);
    }
    expect((await request(app).get(`/admin/practitioners/${id}/identity`).set(as(id))).status).toBe(403);
    expect((await patch(id, 'under_review', as(id))).status).toBe(403);
    expect((await request(app).post('/admin/payouts/run?week=2026-01-05').set(as(id))).status).toBe(403);
    expect((await request(app).get('/practitioners/me/payouts').set(ADMIN)).status).toBe(403);
  });
});

describe('PATCH status', () => {
  it('happy path + audit log with who/what/from/to', async () => {
    const id = await create();
    expect((await patch(id, 'under_review')).body).toMatchObject({ previousStatus: 'submitted', status: 'under_review' });
    expect((await patch(id, 'approved')).status).toBe(200);

    const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: 'asc' } });
    expect(logs).toHaveLength(2);
    expect(logs[0]).toMatchObject({
      actorId: ADMIN['x-user-id'], actorRole: 'admin', action: 'STATUS_CHANGED',
      resourceId: id, metadata: { from: 'submitted', to: 'under_review' },
    });
  });

  it.each([
    ['submitted', 'approved'], ['submitted', 'rejected'], ['submitted', 'submitted'],
    ['under_review', 'submitted'], ['under_review', 'under_review'],
    ['approved', 'rejected'], ['approved', 'under_review'], ['rejected', 'approved'],
  ] as const)('409 for %s -> %s, status unchanged, nothing logged', async (from, to) => {
    const id = await create(from);
    const res = await patch(id, to);
    expect(res.status).toBe(409);
    expect((await prisma.practitioner.findUniqueOrThrow({ where: { id } })).status).toBe(from);
    expect(await prisma.auditLog.count()).toBe(0);
  });

  it.each(['pending', '', null, 123, undefined])('400 for invalid status %j', async (bad) => {
    expect((await patch(await create('under_review'), bad)).status).toBe(400);
  });

  it('404 unknown id, 400 malformed id', async () => {
    expect((await patch('99999999-9999-4999-8999-999999999999', 'under_review')).status).toBe(404);
    expect((await patch('nope', 'under_review')).status).toBe(400);
  });

  it('race: two admins decide at once -> exactly one wins', async () => {
    const id = await create('under_review');
    const [a, b] = await Promise.all([patch(id, 'approved'), patch(id, 'rejected')]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(await prisma.auditLog.count()).toBe(1);
  });
});

describe('GET identity', () => {
  it('returns decrypted identity and logs EVERY view without secrets', async () => {
    const id = await create('submitted', { name: 'Raj Ranjan', pan: 'ABCDE1234F', phone: '9876543210' });
    for (let i = 0; i < 3; i++) {
      const res = await request(app).get(`/admin/practitioners/${id}/identity`).set(ADMIN);
      expect(res.body).toMatchObject({ name: 'Raj Ranjan', pan: 'ABCDE1234F', phone: '9876543210' });
      expect(res.headers['cache-control']).toBe('no-store');
    }
    const logs = await prisma.auditLog.findMany({ where: { action: 'IDENTITY_VIEWED' } });
    expect(logs).toHaveLength(3);
    expect(logs[0]).toMatchObject({ actorId: ADMIN['x-user-id'], actorRole: 'admin', resourceId: id });
    expect(JSON.stringify(logs)).not.toMatch(/ABCDE1234F|9876543210|Ranjan/);
  });

  it('404 / 400 write no audit row', async () => {
    expect((await request(app).get('/admin/practitioners/99999999-9999-4999-8999-999999999999/identity').set(ADMIN)).status).toBe(404);
    expect((await request(app).get('/admin/practitioners/xyz/identity').set(ADMIN)).status).toBe(400);
    expect(await prisma.auditLog.count()).toBe(0);
  });

  it('if audit cannot be written, NO identity data is returned', async () => {
    const id = await create('submitted', { pan: 'ABCDE1234F' });
    await prisma.$executeRawUnsafe('ALTER TABLE "AuditLog" RENAME TO "AuditLog_x"');
    try {
      const res = await request(app).get(`/admin/practitioners/${id}/identity`).set(ADMIN);
      expect(res.status).toBe(500);
      expect(JSON.stringify(res.body)).not.toContain('ABCDE1234F');
    } finally {
      await prisma.$executeRawUnsafe('ALTER TABLE "AuditLog_x" RENAME TO "AuditLog"');
    }
  });
});