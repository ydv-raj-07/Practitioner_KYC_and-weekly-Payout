import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { ADMIN, app, applyBody, reset } from './helpers.js';

beforeEach(reset);
const post = (b: unknown) => request(app).post('/practitioners/apply').send(b as object);

describe('POST /practitioners/apply', () => {
  it('returns only public fields and stores identity encrypted', async () => {
    const res = await post(applyBody({ pan: 'ABCDE1234F' }));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ displayName: 'Raj R.', status: 'submitted' });
    expect(JSON.stringify(res.body)).not.toMatch(/ABCDE1234F|9876543210|Ranjan/);

    const row = await prisma.practitioner.findFirstOrThrow();
    expect(JSON.stringify(row)).not.toMatch(/ABCDE1234F|9876543210|Ranjan/);
  });

  it('normalises PAN and phone', async () => {
    const res = await post(applyBody({ pan: ' abcde1234f ', phone: '+91 98765-43211' }));
    const id = await request(app).get(`/admin/practitioners/${res.body.id}/identity`).set(ADMIN);
    expect(id.body).toMatchObject({ pan: 'ABCDE1234F', phone: '9876543211', name: 'Raj Ranjan' });
  });

  it('ignores client-sent status', async () => {
    expect((await post(applyBody({ status: 'approved' }))).body.status).toBe('submitted');
  });

  it.each([
    ['short name', { name: 'R' }], ['no name', { name: undefined }], ['bad PAN', { pan: 'ABCDE12345' }],
    ['short phone', { phone: '12345' }], ['phone starts with 5', { phone: '5876543210' }],
    ['empty skills', { skills: [] }], ['skills not array', { skills: 'yoga' }], ['blank skill', { skills: [' '] }],
  ])('400 for %s', async (_l, o) => {
    const res = await post(applyBody(o));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('never echoes the submitted PAN/phone in errors', async () => {
    const res = await post(applyBody({ pan: 'LEAKME99', phone: '5555555555' }));
    expect(JSON.stringify(res.body)).not.toMatch(/LEAKME99|5555555555/);
  });

  it('400 for bad JSON, 413 for huge body', async () => {
    const bad = await request(app).post('/practitioners/apply').set('content-type', 'application/json').send('{"a":');
    expect(bad.status).toBe(400);
    expect((await post(applyBody({ name: 'x'.repeat(20000) }))).status).toBe(413);
  });

  it('409 for duplicate PAN, even when two requests race', async () => {
    const body = applyBody();
    const results = await Promise.all(Array.from({ length: 5 }, () => post(body)));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(4);
  });
});