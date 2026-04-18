import { Step, ExecutionResult, ExecutorConfig, ToolResult, Plan } from '../types/index.js';
import { ToolRegistry } from '../tools/registry.js';
import { CircuitBreaker } from '../tools/circuit.js';
import { withSmartRetry } from '../tools/retry.js';
import { logger } from '../core/logging.js';

export class Executor {
  private circuitBreakers = new Map<string, CircuitBreaker>();

  constructor(
    private registry: ToolRegistry,
    private config: ExecutorConfig
  ) {}

  async executeStep(step: Step, previousResults: Map<string, ExecutionResult>): Promise<ExecutionResult> {
    const startTime = Date.now();
    const { id: stepId, objective, inputs } = step;

    logger.info(`Executing step ${stepId}: ${objective}`);

    const dependencyResolvedInputs = this.resolveInputs(inputs, previousResults);

    const attempts = 0;

    try {
      const result = await withSmartRetry(
        () => this.executeWithCircuitBreaker(step.tool, dependencyResolvedInputs),
        {
          maxRetries: this.config.maxRetries,
          baseDelayMs: this.config.baseDelayMs,
          maxDelayMs: this.config.maxDelayMs,
        }
      );

      if (!result.success) {
        return {
          stepId,
          success: false,
          error: result.error,
          attempts: attempts + 1,
          durationMs: Date.now() - startTime,
        };
      }

      return {
        stepId,
        success: true,
        data: result.data,
        attempts: attempts + 1,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        stepId,
        success: false,
        error: errorMessage,
        attempts: attempts + 1,
        durationMs: Date.now() - startTime,
      };
    }
  }

  private async executeWithCircuitBreaker(toolName: string, inputs: Record<string, unknown>): Promise<ToolResult> {
    let breaker = this.circuitBreakers.get(toolName);

    if (!breaker) {
      breaker = new CircuitBreaker(toolName, {
        failureThreshold: this.config.circuitFailureThreshold,
        resetTimeoutMs: this.config.circuitResetTimeoutMs,
        halfOpenMaxAttempts: 3,
        monitorWindowMs: 60000,
      });
      this.circuitBreakers.set(toolName, breaker);
    }

    const tool = this.registry.get(toolName);
    if (!tool) {
      throw new Error(`Tool "${toolName}" not found`);
    }

    return breaker.execute(() => tool.execute(inputs));
  }

  private resolveInputs(
    inputs: Record<string, unknown>,
    previousResults: Map<string, ExecutionResult>
  ): Record<string, unknown> {
    const resolved: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(inputs)) {
      if (typeof value === 'string' && value.startsWith('$')) {
        const refStepId = value.slice(1);
        const prevResult = previousResults.get(refStepId);

        if (prevResult?.success && prevResult.data) {
          resolved[key] = prevResult.data;
        } else {
          resolved[key] = value;
        }
      } else {
        resolved[key] = value;
      }
    }

    return resolved;
  }

  getCircuitBreakerState(toolName: string): string | undefined {
    return this.circuitBreakers.get(toolName)?.getState();
  }

  reset(): void {
    this.circuitBreakers.forEach(cb => cb.reset());
  }
}

export function createExecutor(registry: ToolRegistry, config?: Partial<ExecutorConfig>): Executor {
  const defaultConfig: ExecutorConfig = {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 30000,
    stepTimeout: 120000,
    circuitFailureThreshold: 5,
    circuitResetTimeoutMs: 30000,
  };

  return new Executor(registry, { ...defaultConfig, ...config });
}