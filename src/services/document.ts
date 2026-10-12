import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { AppError } from '../errors.js';
import { detectFileType } from '../filetype.js';

export async function uploadDocument(practitionerId: string, file?: Express.Multer.File) {
  if (!file) throw new AppError(400, 'NO_FILE', 'Attach a file in the "file" field');
  if (file.size === 0) throw new AppError(400, 'EMPTY_FILE', 'The file is empty');

  const type = detectFileType(file.buffer);
  if (!type) throw new AppError(415, 'UNSUPPORTED_FILE_TYPE', 'Only PDF, JPG and PNG are allowed');

  const p = await prisma.practitioner.findUnique({ where: { id: practitionerId }, select: { status: true } });
  if (!p) throw new AppError(404, 'NOT_FOUND', 'Practitioner not found');
  if (p.status === 'rejected') throw new AppError(409, 'PRACTITIONER_REJECTED', 'Application was rejected');

  const storedName = `${randomUUID()}.${type.ext}`;
  const dir = path.resolve(config.uploadDir);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, storedName), file.buffer, { flag: 'wx' });

  try {
    return await prisma.document.create({
      data: {
        practitionerId, storedName, mimeType: type.mime, sizeBytes: file.size,
        originalName: path.basename(file.originalname).slice(0, 255),
      },
      select: { id: true, practitionerId: true, originalName: true, mimeType: true, sizeBytes: true, createdAt: true },
    });
  } catch (e) {
    await unlink(path.join(dir, storedName)).catch(() => {}); 
    throw e;
  }
}