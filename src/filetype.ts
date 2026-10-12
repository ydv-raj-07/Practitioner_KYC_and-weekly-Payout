const SIGS = [
  { ext: 'pdf', mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] },
  { ext: 'png', mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { ext: 'jpg', mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
];

export const detectFileType = (buf: Buffer) =>
  SIGS.find((s) => buf.length >= s.bytes.length && s.bytes.every((b, i) => buf[i] === b)) ?? null;