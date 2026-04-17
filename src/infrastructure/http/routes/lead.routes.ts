import { Router } from 'express';

import { enrichLeadsSchema } from '@application/lead/dtos/EnrichLeadDTO';
import { authMiddleware } from '../middlewares/auth.middleware';
import { validateBody } from '../middlewares/validate.middleware';
import { container } from '@shared/container';

const router = Router();

// POST /leads/enrich
router.post('/enrich', authMiddleware, validateBody(enrichLeadsSchema), container.leadController.enrich);

// GET /leads/stats
router.get('/stats', authMiddleware, container.leadController.stats);

export default router;
