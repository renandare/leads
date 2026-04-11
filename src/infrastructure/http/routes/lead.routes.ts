import { Router } from 'express';

import { normalizeLeadsSchema } from '@application/lead/dtos/NormalizeLeadDTO';
import { deduplicateLeadsSchema } from '@application/lead/dtos/DeduplicateLeadDTO';
import { authMiddleware } from '../middlewares/auth.middleware';
import { validateBody } from '../middlewares/validate.middleware';
import { container } from '@shared/container';

const router = Router();

// POST /leads/normalize
router.post('/normalize', authMiddleware, validateBody(normalizeLeadsSchema), container.leadController.normalize);

// POST /leads/deduplicate
router.post(
  '/deduplicate',
  authMiddleware,
  validateBody(deduplicateLeadsSchema),
  container.leadController.deduplicate,
);

// GET /leads/stats
router.get('/stats', authMiddleware, container.leadController.stats);

export default router;
