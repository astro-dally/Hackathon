import { RetryConfig } from '../types/index.js';

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  jitterFactor: 0.5,
  retryableErrors: new Set(['rate_limit_exceeded', 'server_error', 'timeout', 'network_error']),
  sameErrorThreshold: 3,
};

export class Retrier {
  constructor(private config: RetryConfig = DEFAULT_RETRY_CONFIG) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    let lastErrorCode = '';
    let sameErrorCount = 0;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error: unknown) {
        const err = error as Error & { code?: string };
        const errorCode = err.code || 'unknown';

        if (!this.config.retryableErrors.has(errorCode)) {
          throw error;
        }

        if (errorCode === lastErrorCode) {
          sameErrorCount++;
          if (sameErrorCount >= this.config.sameErrorThreshold) {
            throw new Error(`Repeated failure: ${errorCode} after ${sameErrorCount} attempts`);
          }
        } else {
          sameErrorCount = 1;
          lastErrorCode = errorCode;
        }

        if (attempt === this.config.maxRetries) {
          throw error;
        }

        const delay = this.calculateDelay(attempt);
        await this.sleep(delay);
      }
    }

    throw new Error('Unreachable code reached in Retrier');
  }

  private calculateDelay(attempt: number): number {
    const exponentialDelay = this.config.baseDelayMs * Math.pow(2, attempt);
    const jitter = exponentialDelay * this.config.jitterFactor * Math.random();
    return Math.min(exponentialDelay + jitter, this.config.maxDelayMs);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export async function withSmartRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const mergedConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  const retrier = new Retrier(mergedConfig);
  return retrier.execute(fn);
}