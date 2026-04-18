import { CircuitBreakerConfig, CircuitState } from '../types/index.js';
import { logger } from '../core/logging.js';

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failures: number[] = [];
  private lastOpenTime = 0;
  private halfOpenAttempts = 0;
  private consecutiveSuccesses = 0;

  constructor(
    private name: string,
    private config: CircuitBreakerConfig = {
      failureThreshold: 5,
      resetTimeoutMs: 30000,
      halfOpenMaxAttempts: 3,
      monitorWindowMs: 60000,
    }
  ) {}

  async execute<T>(
    operation: () => Promise<T>,
    fallback?: () => Promise<T>
  ): Promise<T> {
    const now = Date.now();
    this.cleanupStaleFailures(now);

    if (this.shouldAttemptHalfOpen(now)) {
      this.state = 'HALF_OPEN';
      this.halfOpenAttempts = 0;
      logger.debug(`Circuit "${this.name}" entering HALF_OPEN`);
    }

    if (this.state === 'OPEN' && !this.shouldAttemptHalfOpen(now)) {
      if (fallback) {
        logger.debug(`Circuit "${this.name}" OPEN, executing fallback`);
        return fallback();
      }
      throw new Error(`Circuit "${this.name}" is OPEN`);
    }

    if (this.state === 'HALF_OPEN' && this.halfOpenAttempts >= this.config.halfOpenMaxAttempts) {
      throw new Error(`Circuit "${this.name}" half-open attempts exhausted`);
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      if (this.state === 'OPEN' && fallback) {
        return fallback();
      }
      throw error;
    }
  }

  private cleanupStaleFailures(now: number): void {
    this.failures = this.failures.filter(f => now - f < this.config.monitorWindowMs);
  }

  private shouldAttemptHalfOpen(now: number): boolean {
    return this.state === 'OPEN' && now - this.lastOpenTime >= this.config.resetTimeoutMs;
  }

  private onSuccess(): void {
    this.failures = [];
    if (this.state === 'HALF_OPEN') {
      this.consecutiveSuccesses++;
      if (this.consecutiveSuccesses >= 2) {
        this.state = 'CLOSED';
        this.consecutiveSuccesses = 0;
        logger.debug(`Circuit "${this.name}" CLOSED`);
      }
    }
  }

  private onFailure(): void {
    this.failures.push(Date.now());
    this.consecutiveSuccesses = 0;
    const wasHalfOpen = this.state === 'HALF_OPEN';

    if (wasHalfOpen) {
      this.state = 'OPEN';
      this.lastOpenTime = Date.now();
    } else if (this.failures.length >= this.config.failureThreshold) {
      this.state = 'OPEN';
      this.lastOpenTime = Date.now();
      logger.warn(`Circuit "${this.name}" OPEN after ${this.failures.length} failures`);
    }

    if (wasHalfOpen && this.halfOpenAttempts < this.config.halfOpenMaxAttempts) {
      this.halfOpenAttempts++;
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  reset(): void {
    this.state = 'CLOSED';
    this.failures = [];
    this.halfOpenAttempts = 0;
    this.consecutiveSuccesses = 0;
  }
}