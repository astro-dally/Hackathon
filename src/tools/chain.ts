import { Tool, ToolResult, CircuitBreakerConfig } from '../types/index.js';
import { ToolRegistry } from './registry.js';
import { CircuitBreaker } from './circuit.js';

export interface ToolChainConfig {
  primary: Tool;
  fallbacks: Tool[];
  retryConfig?: {
    maxRetries: number;
    baseDelayMs: number;
  };
  circuitBreakerConfig?: CircuitBreakerConfig;
}

export class ToolWithFallback {
  private circuitBreaker: CircuitBreaker;

  constructor(
    private config: ToolChainConfig
  ) {
    this.circuitBreaker = new CircuitBreaker(config.primary.name, config.circuitBreakerConfig);
  }

  async execute(params: unknown): Promise<ToolResult> {
    const { primary, fallbacks, retryConfig } = this.config;
    const tools = [primary, ...fallbacks];

    let lastError: Error | undefined;

    for (const tool of tools) {
      try {
        const result = await this.circuitBreaker.execute(
          () => this.executeWithRetry(tool, params, retryConfig),
          async () => ({ success: false, error: 'Circuit breaker open' })
        );

        if (result.success) {
          return result;
        }

        lastError = new Error(result.error);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }

    return {
      success: false,
      error: lastError?.message || 'All tools in chain failed',
    };
  }

  private async executeWithRetry(
    tool: Tool,
    params: unknown,
    retryConfig?: ToolChainConfig['retryConfig']
  ): Promise<ToolResult> {
    const maxRetries = retryConfig?.maxRetries ?? 2;
    const baseDelayMs = retryConfig?.baseDelayMs ?? 1000;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await tool.execute(params);
        if (result.success || attempt === maxRetries) {
          return result;
        }
      } catch (error) {
        if (attempt === maxRetries) {
          throw error;
        }
      }

      if (attempt < maxRetries) {
        await this.sleep(baseDelayMs * Math.pow(2, attempt));
      }
    }

    throw new Error('Unreachable');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getCircuitState() {
    return this.circuitBreaker.getState();
  }
}

export class FallbackToolRegistry {
  constructor(
    private registry: ToolRegistry,
    private breakerConfigs: Map<string, CircuitBreakerConfig> = new Map()
  ) {}

  getWithFallback(toolName: string, fallbackNames: string[] = []): ToolWithFallback | null {
    const primary = this.registry.get(toolName);
    if (!primary) return null;

    const fallbacks = fallbackNames
      .map(name => this.registry.get(name))
      .filter((t): t is Tool => t !== undefined);

    const breakerConfig = this.breakerConfigs.get(toolName);

    return new ToolWithFallback({
      primary,
      fallbacks,
      circuitBreakerConfig: breakerConfig,
    });
  }
}