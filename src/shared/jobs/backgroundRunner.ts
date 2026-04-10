// src/shared/jobs/backgroundRunner.ts
// This file implements a utility function to run asynchronous jobs in the background without blocking the main thread.

import { logger } from '@shared/utils/logger';

/**
 * Executes an async job in the background via setImmediate.
 * The caller responds 202 immediately;
 * All errors are caught and logged so they never surface as unhandled rejections.
 */
export function runInBackground(jobName: string, job: () => Promise<unknown>): void {
  setImmediate(async () => {
    try {
      await job();
    } catch (err) {
      logger.error(`${jobName} background error`, { error: err });
    }
  });
}
