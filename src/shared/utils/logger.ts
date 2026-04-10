// src/shared/utils/logger.ts
// This file sets up a logger using the Winston library for consistent logging across the application.

import { createLogger, format, transports } from 'winston';

export const logger = createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.json(),
  ),
  transports: [new transports.Console()],
});
