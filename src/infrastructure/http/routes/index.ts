// src/infrastructure/http/routes/index.ts

import { Router, Request, Response } from 'express';

import { prisma } from '@infrastructure/database/prisma/client';
import leadRoutes     from './lead.routes';
import jobRoutes      from './job.routes';
import webhookRoutes  from './webhook.routes';
import messageRoutes  from './message.routes';
import campaignRoutes from './campaign.routes';

const router = Router();

router.get('/health', async (_req: Request, res: Response) => {
  await prisma.$queryRaw`SELECT 1`;

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

router.get('/health/dead-letter', async (_req: Request, res: Response) => {
  const alertHours = Number(process.env.DEAD_LETTER_ALERT_HOURS ?? 4);

  const stuck = await prisma.message.findMany({
    where: {
      status:    'pending',
      createdAt: { lt: new Date(Date.now() - alertHours * 60 * 60 * 1000) },
      deletedAt: null,
    },
    select: { id: true, contactId: true, channel: true, createdAt: true, retryCount: true, errorReason: true },
    orderBy: { createdAt: 'asc' },
  });

  res.json({
    alert:      stuck.length > 0,
    count:      stuck.length,
    thresholdH: alertHours,
    messages:   stuck,
  });
});

router.use('/leads',     leadRoutes);
router.use('/jobs',      jobRoutes);
router.use('/webhook',   webhookRoutes);
router.use('/messages',  messageRoutes);
router.use('/campaigns', campaignRoutes);

export default router;
