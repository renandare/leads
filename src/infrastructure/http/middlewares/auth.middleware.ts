import { NextFunction, Request, Response } from 'express';

import { AppError } from '@shared/errors/AppError';

export function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const token = req.headers['authorization']?.replace('Bearer ', '');

  if (!token || token !== process.env.API_SECRET_KEY) {
    throw new AppError('Unauthorized', 401);
  }

  next();
}
