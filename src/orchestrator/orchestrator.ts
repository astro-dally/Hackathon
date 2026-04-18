import { Plan, Step, ExecutionResult, OrchestratorConfig, VerificationResult } from '../types/index.js';
import { StateStore } from '../core/state.js';
import { ToolRegistry } from '../tools/registry.js';
import { Planner } from '../planner/planner.js';
import { Executor } from '../executor/executor.js';
import { Verifier } from '../types/index.js';
import { logger } from '../core/logging.js';

export interface AgentResult {
  success: boolean;
  runId: string;
  goal: string;
  plan?: Plan;
  steps?: ExecutionResult[];
  errors: string[];
  durationMs: number;
}

export class Orchestrator {
  constructor(
    private state: StateStore,
    private planner: Planner,
    private executor: Executor,
    private registry: ToolRegistry,
    private config: OrchestratorConfig,
    private verifier?: Verifier
  ) {}

  async run(): Promise<AgentResult> {
    const startTime = Date.now();
    this.state.setStatus('running');

    try {
      logger.info(`Starting run ${this.state.getRunId()}`);

      const plan = await this.planner.createPlan(this.state.getGoal());
      this.state.setPlan(plan);

      await this.executePlan(plan);

      this.state.setStatus('completed');
      logger.info(`Run ${this.state.getRunId()} completed successfully`);

      return this.buildResult(plan, startTime);
    } catch (error) {
      this.state.setStatus('failed');
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Run ${this.state.getRunId()} failed:`, error as Error);

      return this.buildErrorResult(errorMessage, startTime);
    }
  }

  private async executePlan(plan: Plan): Promise<void> {
    const { steps } = plan;

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];

      if (!this.shouldExecuteStep(step, i, steps)) {
        logger.info(`Skipping step ${step.id} (dependencies not met)`);
        continue;
      }

      this.state.setCurrentStep(i);

      const result = await this.executeStepWithVerification(step);

      if (!result.success && !this.config.enableReplanning) {
        throw new Error(`Step ${step.id} failed: ${result.error}`);
      }

      if (!result.success && this.config.enableReplanning) {
        logger.warn(`Step ${step.id} failed, attempting recovery`);
        await this.handleStepFailure(step, result);
      }
    }
  }

  private shouldExecuteStep(step: Step, index: number, allSteps: Step[]): boolean {
    if (!step.dependsOn || step.dependsOn.length === 0) {
      return true;
    }

    for (const depId of step.dependsOn) {
      const depIndex = allSteps.findIndex(s => s.id === depId);
      if (depIndex === -1 || depIndex >= index) {
        return false;
      }

      const depResult = this.state.getStepResult(depId);
      if (!depResult?.success) {
        return false;
      }
    }

    return true;
  }

  private async executeStepWithVerification(step: Step): Promise<ExecutionResult> {
    const previousResults = this.state.getAllStepResults();
    const result = await this.executor.executeStep(step, previousResults);

    this.state.setStepResult(step.id, result);

    if (result.success && this.verifier) {
      const verification = await this.verifier.verify(step, result.data);
      if (!verification.verified) {
        result.success = false;
        result.error = `Verification failed: ${verification.errors?.join(', ')}`;
      }
    }

    return result;
  }

  private async handleStepFailure(step: Step, result: ExecutionResult): Promise<void> {
    this.state.incrementRetry();

    if (this.state.getRetryCount() >= this.config.maxRetries) {
      throw new Error(`Max retries exceeded for step ${step.id}`);
    }

    logger.info(`Retrying step ${step.id} (attempt ${this.state.getRetryCount()})`);

    const retryResult = await this.executeStepWithVerification(step);

    if (!retryResult.success) {
      throw new Error(`Step ${step.id} failed after retry: ${retryResult.error}`);
    }
  }

  private buildResult(plan: Plan, startTime: number): AgentResult {
    const steps = Array.from(this.state.getAllStepResults().values());
    const errors = steps.filter(s => s.error).map(s => s.error as string);

    return {
      success: errors.length === 0,
      runId: this.state.getRunId(),
      goal: this.state.getGoal(),
      plan,
      steps,
      errors,
      durationMs: Date.now() - startTime,
    };
  }

  private buildErrorResult(errorMessage: string, startTime: number): AgentResult {
    return {
      success: false,
      runId: this.state.getRunId(),
      goal: this.state.getGoal(),
      errors: [errorMessage],
      durationMs: Date.now() - startTime,
    };
  }
}

export interface OrchestratorBuilderConfig {
  registry: ToolRegistry;
  planner?: { model?: string };
  executor?: ConstructorParameters<typeof Executor>[1];
  orchestrator?: OrchestratorConfig;
  verifier?: Verifier;
}

export function createOrchestrator(config: OrchestratorBuilderConfig): Orchestrator {
  const state = new StateStore('');
  const planner = new Planner(config.registry, config.planner);
  const executor = new Executor(config.registry, {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 30000,
    stepTimeout: 120000,
    circuitFailureThreshold: 5,
    circuitResetTimeoutMs: 30000,
  });

  const orchestratorConfig: OrchestratorConfig = {
    maxSteps: config.orchestrator?.maxSteps ?? 20,
    maxRetries: config.orchestrator?.maxRetries ?? 3,
    stepTimeout: config.orchestrator?.stepTimeout ?? 120000,
    enableReplanning: config.orchestrator?.enableReplanning ?? true,
    maxIterations: config.orchestrator?.maxIterations ?? 5,
    confidenceThreshold: config.orchestrator?.confidenceThreshold ?? 0.7,
  };

  return new Orchestrator(
    state,
    planner,
    executor,
    config.registry,
    orchestratorConfig,
    config.verifier
  );
}

export async function runAgent(
  goal: string,
  config: OrchestratorBuilderConfig
): Promise<AgentResult> {
  const state = new StateStore(goal);
  const planner = new Planner(config.registry, config.planner);

  const execConfig = config.executor ?? {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 30000,
    stepTimeout: 120000,
    circuitFailureThreshold: 5,
    circuitResetTimeoutMs: 30000,
  };
  const executor = new Executor(config.registry, execConfig);

  const orchestratorConfig: OrchestratorConfig = {
    maxSteps: config.orchestrator?.maxSteps ?? 20,
    maxRetries: config.orchestrator?.maxRetries ?? 3,
    stepTimeout: config.orchestrator?.stepTimeout ?? 120000,
    enableReplanning: config.orchestrator?.enableReplanning ?? true,
    maxIterations: config.orchestrator?.maxIterations ?? 5,
    confidenceThreshold: config.orchestrator?.confidenceThreshold ?? 0.7,
  };

  const agent = new Orchestrator(
    state,
    planner,
    executor,
    config.registry,
    orchestratorConfig,
    config.verifier
  );

  return agent.run();
}