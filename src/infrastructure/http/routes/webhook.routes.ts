// src/infrastructure/http/routes/webhook.routes.ts

import { Router } from 'express';
import { container } from '@shared/container';

const router = Router();

const ctrl = container.webhookController;

// GET  /webhook/meta — Meta verification handshake
router.get('/meta', ctrl.verify);

// POST /webhook/meta — incoming events (messages + status updates)
router.post('/meta', ctrl.receive);

export default router;
