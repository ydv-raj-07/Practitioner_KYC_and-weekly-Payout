import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { config } from './config.js';
import { AppError } from './errors.js';
import { isUuid } from './validators.js';

type Role = 'admin' | 'practitioner';
declare module 'express-serve-static-core' {
  interface Request {
    user?: { id: string; role: Role };
  }
}


export function auth(req: Request, _res: Response, next: NextFunction) {
  const id = req.header('x-user-id');
  const role = req.header('x-role');
  if (!isUuid(id) || (role !== 'admin' && role !== 'practitioner')) {
    throw new AppError(401, 'UNAUTHORIZED', 'x-user-id (uuid) and x-role (admin|practitioner) headers are required');
  }
  req.user = { id, role };
  next();
}

export const requireRole = (role: Role) => (req: Request, _res: Response, next: NextFunction) => {
  if (req.user?.role !== role) throw new AppError(403, 'FORBIDDEN', `Requires role: ${role}`);
  next();
};


export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxFileBytes, files: 1 },
}).single('file');

export const notFound = (req: Request, _res: Response, next: NextFunction) =>
  next(new AppError(404, 'ROUTE_NOT_FOUND', `${req.method} ${req.path} does not exist`));


export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  const send = (status: number, code: string, message: string, details?: unknown) =>
    res.status(status).json({ error: { code, message, ...(details ? { details } : {}) } });

  if (err instanceof AppError) return send(err.status, err.code, err.message, err.details);
  if (err instanceof multer.MulterError) {
    return err.code === 'LIMIT_FILE_SIZE'
      ? send(413, 'FILE_TOO_LARGE', 'File must be 5 MB or smaller')
      : send(400, 'INVALID_UPLOAD', 'Send exactly one file in the "file" field');
  }
  if (err?.type === 'entity.parse.failed') return send(400, 'INVALID_JSON', 'Body is not valid JSON');
  if (err?.type === 'entity.too.large') return send(413, 'BODY_TOO_LARGE', 'Body is too large');

  console.error('Unexpected error:', err?.code ?? err?.name, err?.message); 
  send(500, 'INTERNAL_ERROR', 'Something went wrong');
}