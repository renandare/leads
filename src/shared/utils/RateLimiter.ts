// src/shared/utils/RateLimiter.ts
// Simple sequential rate limiter ensures a minimum interval between calls

export class RateLimiter {
  private lastCallAt = 0;

  constructor(private readonly minIntervalMs: number) {}

  async throttle(): Promise<void> {
    const now     = Date.now();
    const elapsed = now - this.lastCallAt;
    if (elapsed < this.minIntervalMs) {
      await new Promise<void>(resolve => setTimeout(resolve, this.minIntervalMs - elapsed));
    }
    this.lastCallAt = Date.now();
  }

  // Reset the internal clock useful between test cases
  reset(): void {
    this.lastCallAt = 0;
  }
}
