// src/shared/jobs/jobRegistry.ts
// In-memory store for background job status. Survives within the process lifetime.
// Keeps the last MAX_JOBS entries; oldest are pruned automatically.

export type JobStatus = 'running' | 'done' | 'failed';

export interface Job {
  id: string;
  name: string;
  status: JobStatus;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  result?: unknown;
  error?: string;
}

class JobRegistry {
  private readonly jobs = new Map<string, Job>();
  private readonly MAX_JOBS = 100;

  start(name: string): string {
    const id = `${name}:${Date.now()}`;
    this.jobs.set(id, { id, name, status: 'running', startedAt: new Date().toISOString() });

    // Prune oldest entry when limit is exceeded
    if (this.jobs.size > this.MAX_JOBS) {
      this.jobs.delete(this.jobs.keys().next().value as string);
    }

    return id;
  }

  complete(id: string, result: unknown): void {
    const job = this.jobs.get(id);
    if (!job) return;
    const finishedAt = new Date();
    job.status = 'done';
    job.finishedAt = finishedAt.toISOString();
    job.durationMs = finishedAt.getTime() - new Date(job.startedAt).getTime();
    job.result = result;
  }

  fail(id: string, error: unknown): void {
    const job = this.jobs.get(id);
    if (!job) return;
    const finishedAt = new Date();
    job.status = 'failed';
    job.finishedAt = finishedAt.toISOString();
    job.durationMs = finishedAt.getTime() - new Date(job.startedAt).getTime();
    job.error = error instanceof Error ? error.message : String(error);
  }

  list(): Job[] {
    return [...this.jobs.values()].reverse(); // newest first
  }
}

export const jobRegistry = new JobRegistry();
