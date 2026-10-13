import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { ADMIN, app, as, create, reset } from './helpers.js';

beforeEach(reset);

const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(100)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100)]);
const EXE = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(100)]);

const up = (id: string, h: Record<string, string>, buf: Buffer, filename = 'id.pdf', ct = 'application/pdf', field = 'file') =>
  request(app).post(`/practitioners/${id}/documents`).set(h).attach(field, buf, { filename, contentType: ct });

describe('POST /practitioners/:id/documents', () => {
  it.each([[PDF, 'a.pdf', 'application/pdf'], [PNG, 'a.png', 'image/png'], [JPG, 'a.jpg', 'image/jpeg']])(
    'accepts valid %#', async (buf, name, mime) => {
      const id = await create();
      const res = await up(id, as(id), buf, name, mime);
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ practitionerId: id, mimeType: mime });
    });

  it('stores under a random name, strips client path', async () => {
    const id = await create();
    await up(id, as(id), PDF, '../../etc/passwd.pdf');
    const d = await prisma.document.findFirstOrThrow();
    expect(d.storedName).toMatch(/^[0-9a-f-]{36}\.pdf$/);
    expect(d.originalName).toBe('passwd.pdf');
  });

  it('accepts exactly 5 MB, rejects 5 MB + 1 byte with 413', async () => {
    const id = await create();
    const MB5 = 5 * 1024 * 1024;
    expect((await up(id, as(id), Buffer.concat([PDF, Buffer.alloc(MB5 - PDF.length)]))).status).toBe(201);
    expect((await up(id, as(id), Buffer.concat([PDF, Buffer.alloc(MB5 - PDF.length + 1)]))).status).toBe(413);
  });

  it('415 for .exe renamed to .pdf, text and html', async () => {
    const id = await create();
    for (const buf of [EXE, Buffer.from('hello there'), Buffer.from('<html></html>')]) {
      expect((await up(id, as(id), buf)).status).toBe(415);
    }
  });

  it('400 for empty file, no file, wrong field name', async () => {
    const id = await create();
    expect((await up(id, as(id), Buffer.alloc(0))).status).toBe(400);
    expect((await request(app).post(`/practitioners/${id}/documents`).set(as(id))).status).toBe(400);
    expect((await up(id, as(id), PDF, 'a.pdf', 'application/pdf', 'document')).status).toBe(400);
  });

  it('403 for someone else\'s id or admin role; nothing saved', async () => {
    const me = await create();
    const other = await create();
    expect((await up(other, as(me), PDF)).status).toBe(403);
    expect((await up(me, ADMIN, PDF)).status).toBe(403);
    expect(await prisma.document.count()).toBe(0);
  });

  it('401 no headers, 400 bad id, 404 unknown practitioner, 409 rejected', async () => {
    const id = await create();
    expect((await up(id, {}, PDF)).status).toBe(401);
    expect((await up('bad', as(id), PDF)).status).toBe(400);
    const ghost = '99999999-9999-4999-8999-999999999999';
    expect((await up(ghost, as(ghost), PDF)).status).toBe(404);
    const rejected = await create('rejected');
    expect((await up(rejected, as(rejected), PDF)).status).toBe(409);
  });
});