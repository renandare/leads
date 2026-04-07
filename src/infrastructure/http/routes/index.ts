import { Router, Request, Response } from 'express';

import { prisma } from '@infrastructure/database/prisma/client';

const router = Router();

router.get('/health', async (_req: Request, res: Response) => {
  await prisma.$queryRaw`SELECT 1`;

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

export default router;
