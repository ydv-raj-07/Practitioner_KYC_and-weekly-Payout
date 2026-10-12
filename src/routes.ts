import { Router } from 'express';
import { auth, requireRole, upload } from './middleware.js';
import { AppError } from './errors.js';
import { uploadDocument } from './services/document.js';
import { getMyPayouts, runPayouts } from './services/payout.js';
import { apply, changeStatus, viewIdentity } from './services/practitioner.js';
import { applySchema, parse, statusSchema, uuidParam } from './validators.js';

export const routes = Router();

routes.post('/practitioners/apply', async (req, res) => {
  res.status(201).json(await apply(parse(applySchema, req.body))); 
});

routes.get('/practitioners/me/payouts', auth, requireRole('practitioner'), async (req, res) => {
  res.json(await getMyPayouts(req.user!.id));
});

routes.post(
  '/practitioners/:id/documents',
  auth,
  requireRole('practitioner'),
  (req, _res, next) => {
    if (uuidParam(req.params.id) !== req.user!.id) {
      throw new AppError(403, 'FORBIDDEN', 'You can only upload for your own application');
    }
    next();
  },
  upload,
  async (req, res) => {
    res.status(201).json(await uploadDocument(req.params.id as string, req.file));
  },
);

const admin = Router();
admin.use(auth, requireRole('admin'));

admin.patch('/practitioners/:id/status', async (req, res) => {
  const { status } = parse(statusSchema, req.body);
  res.json(await changeStatus(uuidParam(req.params.id), status, req.user!));
});

admin.get('/practitioners/:id/identity', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(await viewIdentity(uuidParam(req.params.id), req.user!));
});

admin.post('/payouts/run', async (req, res) => {
  res.json(await runPayouts(req.query.week));
});

routes.use('/admin', admin);