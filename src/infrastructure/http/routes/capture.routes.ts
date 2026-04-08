import { Router } from 'express';

import { captureGoogleMapsSchema } from '@application/capture/dtos/CaptureGoogleMapsDTO';
import { authMiddleware } from '../middlewares/auth.middleware';
import { validateBody } from '../middlewares/validate.middleware';
import { container } from '@shared/container';

const router = Router();

// POST /capture/google
// Input:  { query: string, radius?: number }
// Output: { total_collected: number, pages_scanned: number }
router.post(
  '/google',
  authMiddleware,
  validateBody(captureGoogleMapsSchema),
  container.captureController.google,
);

export default router;
