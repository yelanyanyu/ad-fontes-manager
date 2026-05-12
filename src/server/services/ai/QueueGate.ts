export class QueueGate {
  private activeCount = 0;
  private abortControllers = new Map<string, AbortController>();
  private brokenProviders = new Set<string>();
  private providerFailures = new Map<string, number>();
  private pauseFlags = new Set<string>();

  constructor(private maxConcurrency: number) {
    if (maxConcurrency < 1) {
      throw new Error(`maxConcurrency must be >= 1, got ${maxConcurrency}`);
    }
  }

  setMaxConcurrency(maxConcurrency: number): void {
    if (maxConcurrency < 1) {
      throw new Error(`maxConcurrency must be >= 1, got ${maxConcurrency}`);
    }
    this.maxConcurrency = maxConcurrency;
  }

  hasCapacity(): boolean {
    return this.activeCount < this.maxConcurrency;
  }

  reserveSlot(): boolean {
    if (!this.hasCapacity()) return false;
    this.activeCount++;
    return true;
  }

  releaseSlot(): void {
    this.activeCount = Math.max(0, this.activeCount - 1);
  }

  getActiveCount(): number {
    return this.activeCount;
  }

  setAbortController(jobId: string, controller: AbortController): void {
    this.abortControllers.set(jobId, controller);
  }

  getAbortController(jobId: string): AbortController | undefined {
    return this.abortControllers.get(jobId);
  }

  deleteAbortController(jobId: string): void {
    this.abortControllers.delete(jobId);
  }

  abortAll(): void {
    for (const controller of this.abortControllers.values()) {
      if (!controller.signal.aborted) {
        controller.abort();
      }
    }
  }

  abortControllerEntries(): IterableIterator<[string, AbortController]> {
    return this.abortControllers.entries();
  }

  markPaused(jobId: string): void {
    this.pauseFlags.add(jobId);
  }

  isPaused(jobId: string): boolean {
    return this.pauseFlags.has(jobId);
  }

  clearPause(jobId: string): void {
    this.pauseFlags.delete(jobId);
  }

  getExcludedProviders(): string[] {
    return [...this.brokenProviders];
  }

  recordProviderSuccess(providerId: string | undefined): void {
    if (providerId) {
      this.providerFailures.delete(providerId);
    }
  }

  recordProviderFailure(providerId: string | undefined, options: { wasAborted: boolean }): void {
    if (!providerId || options.wasAborted) return;
    const failures = (this.providerFailures.get(providerId) || 0) + 1;
    this.providerFailures.set(providerId, failures);
    if (failures >= 3) {
      this.brokenProviders.add(providerId);
    }
  }

  resetCircuitBreaker(providerId: string): void {
    this.brokenProviders.delete(providerId);
    this.providerFailures.delete(providerId);
  }
}
