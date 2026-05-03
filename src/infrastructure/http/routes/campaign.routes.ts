// src/infrastructure/http/routes/campaign.routes.ts

import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.middleware';
import { container } from '@shared/container';

const router = Router();

// GET  /campaigns - list all campaigns
router.get('/',     authMiddleware, container.campaignController.list);

// POST /campaigns - create a new campaign (status: queued)
router.post('/',    authMiddleware, container.campaignController.create);

// GET  /campaigns/:id - get campaign status
router.get('/:id',  authMiddleware, container.campaignController.get);

// POST /campaigns/:id/run - return all campaign marked as running and send messages
router.post('/:id/run', authMiddleware, container.campaignController.run);

export default router;
