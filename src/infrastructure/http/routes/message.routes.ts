// src/infrastructure/http/routes/message.routes.ts

import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.middleware';
import { container } from '@shared/container';

const router = Router();

// POST /messages/send-template — send a WhatsApp template (works inside and outside conversation window)
router.post('/send-template', authMiddleware, container.messageController.sendTemplate);

// POST /messages/send-text — send free-form text (only within 24h conversation window)
router.post('/send-text', authMiddleware, container.messageController.sendText);

export default router;
