// src/infrastructure/http/routes/job.routes.ts

import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.middleware';
import { container } from '@shared/container';

const router = Router();

// GET /jobs — list all background jobs and their status
router.get('/', authMiddleware, container.jobController.list);

export default router;
