import { Router } from 'express';

import { normalizeLeadsSchema } from '@application/lead/dtos/NormalizeLeadDTO';
import { authMiddleware } from '../middlewares/auth.middleware';
import { validateBody } from '../middlewares/validate.middleware';
import { container } from '@shared/container';

const router = Router();

// POST /leads/normalize
// Input:  { batch_size?: number }
// Output: 202 { status: 'queued', batch_size }
router.post(
  '/normalize',
  authMiddleware,
  validateBody(normalizeLeadsSchema),
  container.leadController.normalize,
);

// GET /leads/stats
// Output: { raw: N, normalized: N, ... }
router.get('/stats', authMiddleware, container.leadController.stats);

export default router;
