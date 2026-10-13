import { describe, expect, it } from 'vitest';
import { decrypt, encrypt, hashPan } from '../src/crypto.js';
import { detectFileType } from '../src/filetype.js';
import { calculatePayout } from '../src/money.js';
import { ALLOWED } from '../src/services/practitioner.js';
import { parseWeek } from '../src/week.js';

describe('payout maths', () => {
  it('100000 -> 30000 / 1000 / 69000', () => {
    expect(calculatePayout(100000)).toEqual({ grossPaise: 100000, platformSharePaise: 30000, tdsPaise: 1000, netPaise: 69000 });
  });
  it('rounding 10001 -> 3000 / 100 / 6901', () => {
    const r = calculatePayout(10001);
    expect([r.platformSharePaise, r.tdsPaise, r.netPaise]).toEqual([3000, 100, 6901]);
  });
  it('rounds half up: 10050 -> TDS 101', () => expect(calculatePayout(10050).tdsPaise).toBe(101));
  it('zero stays zero', () => expect(calculatePayout(0).netPaise).toBe(0));
  it('parts always add up to gross', () => {
    for (let i = 0; i < 5000; i++) {
      const g = Math.floor(Math.random() * 2_000_000_000);
      const r = calculatePayout(g);
      expect(r.platformSharePaise + r.tdsPaise + r.netPaise).toBe(g);
    }
  });
  it('rejects negative, float, NaN and above Int limit', () => {
    for (const bad of [-1, 10.5, NaN, 2_147_483_648]) expect(() => calculatePayout(bad)).toThrow();
  });
});

describe('encryption', () => {
  it('round-trips and uses a fresh IV', () => {
    expect(decrypt(encrypt('ABCDE1234F'))).toBe('ABCDE1234F');
    expect(encrypt('x')).not.toBe(encrypt('x'));
  });
  it('detects tampering', () => {
    const raw = Buffer.from(encrypt('secret'), 'base64');
    raw[raw.length - 1] ^= 1;
    expect(() => decrypt(raw.toString('base64'))).toThrow();
  });
  it('PAN hash is deterministic', () => expect(hashPan('ABCDE1234F')).toBe(hashPan('ABCDE1234F')));
});

describe('week parsing', () => {
  const NOW = new Date('2026-10-13T10:00:00Z');
  it('returns the IST range for a finished Monday', () => {
    const w = parseWeek('2026-10-05', NOW);
    expect(w.start.toISOString()).toBe('2026-10-04T18:30:00.000Z');
    expect(w.end.toISOString()).toBe('2026-10-11T18:30:00.000Z');
  });
  it.each([undefined, '', '2026-W41', '05-10-2026', '2026-02-31', '2026-10-06', '2026-10-12', '2099-01-05'])(
    'rejects %j',
    (bad) => expect(() => parseWeek(bad, NOW)).toThrow(),
  );
});

describe('file type', () => {
  it('detects by content only', () => {
    expect(detectFileType(Buffer.from('%PDF-1.4'))?.ext).toBe('pdf');
    expect(detectFileType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))?.ext).toBe('jpg');
    expect(detectFileType(Buffer.from('MZ\x90\x00'))).toBeNull();
    expect(detectFileType(Buffer.alloc(0))).toBeNull();
  });
});

describe('status transition table', () => {
  const all = ['submitted', 'under_review', 'approved', 'rejected'] as const;
  const valid = new Set(['submitted>under_review', 'under_review>approved', 'under_review>rejected']);
  for (const from of all)
    for (const to of all)
      it(`${from} -> ${to}`, () => expect(ALLOWED[from].includes(to)).toBe(valid.has(`${from}>${to}`)));
});