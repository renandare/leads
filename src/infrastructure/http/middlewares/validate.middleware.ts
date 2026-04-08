// src/infrastructure/http/middlewares/validate.middleware.ts
// This middleware validates the request body against a Zod schema and throws an error if validation fails.

import { NextFunction, Request, Response } from 'express';
import { ZodSchema } from 'zod';

import { AppError } from '@shared/errors/AppError';

export function validateBody(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      throw new AppError(result.error.issues[0].message, 422);
    }

    req.body = result.data;
    next();
  };
}
