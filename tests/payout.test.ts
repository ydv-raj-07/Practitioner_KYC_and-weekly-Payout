import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { ADMIN, app, as, create, earn, reset } from './helpers.js';

// Week of Mon 2026-01-05 IST = 2026-01-04T18:30:00Z .. 2026-01-11T18:30:00Z
const WEEK = '2026-01-05';
const IN = '2026-01-07T06:00:00Z';
const run = (week?: string, h: Record<string, string> = ADMIN) =>
  request(app).post(`/admin/payouts/run${week === undefined ? '' : `?week=${week}`}`).set(h);

beforeEach(reset);

describe('POST /admin/payouts/run', () => {
  it('100000 paise -> 30000 / 1000 / 69000 (earnings are summed)', async () => {
    const id = await create('approved');
    await earn(id, 60000, IN);
    await earn(id, 40000, '2026-01-08T10:00:00Z');
    const res = await run(WEEK);
    expect(res.body).toEqual({ week: WEEK, created: 1, skipped: 0, totalNetPaise: 69000 });
    expect(await prisma.payout.findFirstOrThrow()).toMatchObject({
      grossPaise: 100000, platformSharePaise: 30000, tdsPaise: 1000, netPaise: 69000, weekLabel: WEEK,
    });
  });

  it('rounding: 10001 -> 3000 / 100 / 6901', async () => {
    await earn(await create('approved'), 10001, IN);
    await run(WEEK);
    expect(await prisma.payout.findFirstOrThrow()).toMatchObject({ platformSharePaise: 3000, tdsPaise: 100, netPaise: 6901 });
  });

  it('re-running does not pay twice', async () => {
    await earn(await create('approved'), 100000, IN);
    expect((await run(WEEK)).body.created).toBe(1);
    expect((await run(WEEK)).body).toEqual({ week: WEEK, created: 0, skipped: 1, totalNetPaise: 0 });
    expect(await prisma.payout.count()).toBe(1);
  });

  it('8 parallel runs create each payout exactly once', async () => {
    for (let i = 0; i < 3; i++) await earn(await create('approved'), 100000 + i, IN);
    const results = await Promise.all(Array.from({ length: 8 }, () => run(WEEK)));
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(results.reduce((s, r) => s + r.body.created, 0)).toBe(3);
    expect(await prisma.payout.count()).toBe(3);
  });

  it('only approved practitioners are paid', async () => {
    for (const s of ['submitted', 'under_review', 'rejected'] as const) await earn(await create(s), 500000, IN);
    expect((await run(WEEK)).body.created).toBe(0);
  });

  it('IST week boundaries are exact', async () => {
    const id = await create('approved');
    await earn(id, 1111, '2026-01-04T18:29:59.999Z'); // previous week
    await earn(id, 2000, '2026-01-04T18:30:00.000Z'); // first instant
    await earn(id, 3000, '2026-01-11T18:29:59.999Z'); // last instant
    await earn(id, 9999, '2026-01-11T18:30:00.000Z'); // next week
    await run(WEEK);
    expect((await prisma.payout.findFirstOrThrow()).grossPaise).toBe(5000);
  });

  it('zero earnings and no earnings -> no payout', async () => {
    await earn(await create('approved'), 0, IN);
    await create('approved');
    expect((await run(WEEK)).body.created).toBe(0);
  });

  it('late earnings after a run are not paid retroactively (documented)', async () => {
    const id = await create('approved');
    await earn(id, 100000, IN);
    await run(WEEK);
    await earn(id, 50000, '2026-01-09T00:00:00Z');
    await run(WEEK);
    expect((await prisma.payout.findFirstOrThrow()).grossPaise).toBe(100000);
  });

  it.each([undefined, '', '05-01-2026', '2026-W02', '2026-01-06', '2026-02-30', "2026-01-05'; DROP TABLE x;--", '2099-01-05'])(
    '400 for week %j', async (w) => expect((await run(w)).status).toBe(400));

  it('400 for ?week=a&week=b', async () => {
    expect((await request(app).post('/admin/payouts/run?week=2026-01-05&week=2026-01-12').set(ADMIN)).status).toBe(400);
  });
});

describe('GET /practitioners/me/payouts', () => {
  it('shows my payouts with breakdown, newest first, and nothing else', async () => {
    const a = await create('approved', { pan: 'ABCDE1234F' });
    const b = await create('approved');
    await earn(a, 100000, IN);
    await earn(a, 10001, '2026-01-14T06:00:00Z');
    await earn(b, 200000, IN);
    await run(WEEK);
    await run('2026-01-12');

    const res = await request(app).get('/practitioners/me/payouts').set(as(a));
    expect(res.body.payouts).toHaveLength(2);
    expect(res.body.payouts[0]).toMatchObject({ week: '2026-01-12', grossPaise: 10001, netPaise: 6901 });
    expect(res.body.payouts[1]).toMatchObject({
      week: WEEK, grossPaise: 100000, platformSharePaise: 30000, tdsPaise: 1000, netPaise: 69000,
    });
    expect(JSON.stringify(res.body)).not.toMatch(/ABCDE1234F|9876543210|Ranjan/);
  });

  it('empty list when no payouts', async () => {
    const id = await create('approved');
    expect((await request(app).get('/practitioners/me/payouts').set(as(id))).body).toEqual({ payouts: [] });
  });
});