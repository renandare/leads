// src/shared/jobs/backgroundRunner.ts
// This file implements a utility function to run asynchronous jobs in the background without blocking the main thread.

import { logger } from '@shared/utils/logger';
import { jobRegistry } from './jobRegistry';

/**
 * Executes an async job in the background via setImmediate.
 * Registers the job in jobRegistry so its status can be queried via GET /jobs.
 * Returns the jobId immediately so it can be included in the 202 response.
 */
export function runInBackground(jobName: string, job: () => Promise<unknown>): string {
  const jobId = jobRegistry.start(jobName);

  setImmediate(async () => {
    try {
      const result = await job();
      jobRegistry.complete(jobId, result);
    } catch (err) {
      logger.error(`${jobName} background error`, { error: err });
      jobRegistry.fail(jobId, err);
    }
  });

  return jobId;
}
