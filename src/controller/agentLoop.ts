import { Step, Plan, AgentLoopConfig, IterationResult, StepExecution, ReflectionResult, VerificationResult, FixSuggestion } from '../types/index.js';
import { ToolRegistry } from '../tools/registry.js';
import { StateStore } from '../core/state.js';
import { Logger } from '../core/logging.js';
import { memoryStore } from '../core/memory.js';
import { Planner } from '../planner/planner.js';
import { Executor } from '../executor/executor.js';
import { createLLMVerifier } from '../verifier/llm.js';
import { createSchemaVerifier } from '../verifier/schema.js';
import { createPlanRefiner } from '../planner/refiner.js';
import { createRepairEngine, RepairEngine } from '../verifier/repair.js';
import { 
  createDecisionEngine, 
  DecisionEngine,
  DecisionAction,
  createDecisionContext,
  classifyFailure,
  computeConfidence,
  DecisionResult 
} from './decisionEngine.js';

export type AgentEvent =
  | { type: 'plan:created'; plan: any }
  | { type: 'step:start'; step: any }
  | { type: 'step:complete'; execution: StepExecution }
  | { type: 'step:failed'; execution: StepExecution }
  | { type: 'step:repaired'; execution: StepExecution }
  | { type: 'hitl:pending'; stepId: string; data: any; question: string }
  | { type: 'run:complete'; success: boolean; steps: StepExecution[]; iterations: number; errors: string[] };

export class AgentLoop {
  private state: StateStore;
  private planner: Planner;
  private executor: Executor;
  private registry: ToolRegistry;
  private config: AgentLoopConfig;
  private logger: Logger;
  private refiner: ReturnType<typeof createPlanRefiner>;
  private repairEngine: RepairEngine;
  private decisionEngine: DecisionEngine;
  private completedSteps: StepExecution[] = [];
  private iteration: number = 0;
  private stepVersions: Map<string, number> = new Map();
  private decisionHistory: DecisionResult[] = [];
  private onEvent?: (event: AgentEvent) => void;
  private hitlApprovals: Map<string, Promise<boolean>> = new Map();
  private hitlResolvers: Map<string, (approved: boolean) => void> = new Map();

  constructor(
    goal: string,
    registry: ToolRegistry,
    config: Partial<AgentLoopConfig> = {},
    onEvent?: (event: AgentEvent) => void
  ) {
    this.registry = registry;
    this.onEvent = onEvent;
    this.config = {
      maxIterations: config.maxIterations ?? 10,
      confidenceThreshold: config.confidenceThreshold ?? 0.7,
      enablePartialRefinement: config.enablePartialRefinement ?? true,
      enableRepair: config.enableRepair ?? true,
      enableReflection: config.enableReflection ?? true,
      maxRepairsPerStep: config.maxRepairsPerStep ?? 3,
      maxRetriesPerStep: config.maxRetriesPerStep ?? 2,
    };

    this.state = new StateStore(goal);
    this.logger = new Logger();
    this.planner = new Planner(registry);
    this.executor = new Executor(registry, {
      maxRetries: this.config.maxRetriesPerStep,
      baseDelayMs: 2000,
      maxDelayMs: 30000,
      stepTimeout: 60000,
      circuitFailureThreshold: 3,
      circuitResetTimeoutMs: 30000,
    });
    this.refiner = createPlanRefiner();
    this.repairEngine = createRepairEngine(registry, this.config.maxRepairsPerStep);
    this.decisionEngine = createDecisionEngine({
      confidenceThreshold: this.config.confidenceThreshold,
      maxRetries: this.config.maxRetriesPerStep,
      maxRepairs: this.config.maxRepairsPerStep
    });
  }

  /** Emit a structured SSE event to the consumer */
  private emit(event: AgentEvent): void {
    this.onEvent?.(event);
  }

  /** Register a HITL approval response (called by the SSE route) */
  resolveHITL(stepId: string, approved: boolean): void {
    this.hitlResolvers.get(stepId)?.(approved);
  }

  async run(): Promise<{
    success: boolean;
    steps: StepExecution[];
    iterations: number;
    errors: string[];
  }> {
    this.logger.info(`Starting agent loop for goal: ${this.state.getGoal()}`);
    this.state.setStatus('running');

    let currentPlan = await this.createInitialPlan();
    this.state.setPlan(currentPlan);

    while (this.iteration < this.config.maxIterations) {
      this.iteration++;
      this.logger.info(`=== Iteration ${this.iteration}/${this.config.maxIterations} ===`);

      const result = await this.executeIteration(currentPlan);

      if (!result.shouldContinue) {
        if (result.shouldReplan && this.iteration < this.config.maxIterations) {
          this.logger.info('Need to replan, generating new plan...');
          currentPlan = await this.replan(currentPlan, result);
          this.state.setPlan(currentPlan);
          continue;
        }
        break;
      }

      if (result.pendingSteps.length === 0) {
        this.logger.info('All steps completed successfully');
        break;
      }
    }

    const success = this.completedSteps.every(s => s.status === 'completed' || s.status === 'repaired');
    
    memoryStore.addEntry({
      runId: this.state.getRunId(),
      goal: this.state.getGoal(),
      plan: currentPlan,
      steps: this.completedSteps,
      success,
      errors: this.completedSteps.filter(s => s.error).map(s => s.error as string),
      timestamp: new Date().toISOString(),
    });

    this.state.setStatus(success ? 'completed' : 'failed');

    const finalResult = {
      success,
      steps: this.completedSteps,
      iterations: this.iteration,
      errors: this.completedSteps.filter(s => s.error).map(s => s.error as string),
    };
    this.emit({ type: 'run:complete', ...finalResult });
    return finalResult;
  }

  private async createInitialPlan(): Promise<Plan> {
    this.logger.info('Creating initial plan...');
    const plan = await this.planner.createPlan(this.state.getGoal());
    plan.metadata.iteration = 1;
    plan.metadata.partialReplan = false;
    
    for (const step of plan.steps) {
      step.confidence = 0.8;
      step.uncertaintyReason = 'Initial plan, not verified yet';
    }
    this.emit({ type: 'plan:created', plan });
    return plan;
  }

  private async executeIteration(plan: Plan): Promise<IterationResult> {
    const pendingSteps = plan.steps.filter(s => !this.isStepCompleted(s.id));
    const canExecuteSteps = this.getExecutableSteps(pendingSteps, plan.steps);

    if (canExecuteSteps.length === 0 && pendingSteps.length > 0) {
      return {
        iteration: this.iteration,
        completedSteps: this.completedSteps,
        pendingSteps,
        failedStep: undefined,
        shouldContinue: false,
        shouldReplan: true,
        reason: 'No executable steps but pending steps exist - dependency issue',
      };
    }

    for (const step of canExecuteSteps) {
      const execution = await this.executeAndVerifyStep(step, plan.steps);
      
      this.completedSteps.push(execution);
      
      if (execution.status === 'failed') {
        if (this.config.enableReflection) {
          const reflection = await this.reflect(execution, plan);
          
          if (this.shouldReplanBasedOnReflection(reflection)) {
            return {
              iteration: this.iteration,
              completedSteps: this.completedSteps,
              pendingSteps: plan.steps.filter(s => !this.isStepCompleted(s.id)),
              failedStep: execution,
              reflection,
              shouldContinue: true,
              shouldReplan: true,
              reason: 'Reflection suggests replanning needed',
            };
          }
        }

        const remaining = plan.steps.filter(s => !this.isStepCompleted(s.id));
        if (remaining.length === 0) {
          return {
            iteration: this.iteration,
            completedSteps: this.completedSteps,
            pendingSteps: [],
            failedStep: execution,
            shouldContinue: false,
            shouldReplan: false,
            reason: 'All steps done but some failed',
          };
        }
      }
    }

    const stillPending = plan.steps.filter(s => !this.isStepCompleted(s.id));

    return {
      iteration: this.iteration,
      completedSteps: this.completedSteps,
      pendingSteps: stillPending,
      shouldContinue: stillPending.length > 0 && this.iteration < this.config.maxIterations,
      shouldReplan: false,
      reason: stillPending.length > 0 ? 'More steps to process' : 'Iteration complete',
    };
  }

  private async executeAndVerifyStep(step: Step, allSteps: Step[]): Promise<StepExecution> {
    const startTime = Date.now();
    const maxAttempts = this.config.maxRetriesPerStep + 1;
    
    this.logger.info(`Executing step ${step.id}: ${step.objective}`);
    this.emit({ type: 'step:start', step });

    // HITL gate: pause before selectBestFlight to let user review candidates
    if (step.tool === 'selectBestFlight' && this.onEvent) {
      const resolvedInputs = this.resolveStepInputs(step.inputs);
      const waitPromise = new Promise<boolean>(resolve => {
        this.hitlResolvers.set(step.id, resolve);
      });
      this.emit({
        type: 'hitl:pending',
        stepId: step.id,
        data: resolvedInputs,
        question: 'The agent found flight candidates. Approve to compare and select the best one?',
      });
      // Wait up to 60s for user approval, then auto-approve
      const approved = await Promise.race([
        waitPromise,
        new Promise<boolean>(r => setTimeout(() => r(true), 60000)),
      ]);
      if (!approved) {
        return { step, status: 'failed', error: 'User rejected HITL gate', attempts: 1, durationMs: Date.now() - startTime };
      }
    }

    let attempt = 1;
    let lastExecutionResult: any = null;
    let lastVerification: VerificationResult | undefined;

    while (attempt <= maxAttempts) {
      // Resolve variable references ($stepId.result.field) in inputs before executing
      const resolvedStep = { ...step, inputs: this.resolveStepInputs(step.inputs) };

      const preCheck = await this.validatePreExecution(resolvedStep);
      if (!preCheck.valid) {
        this.logger.warn(`Pre-execution validation failed for ${step.id}: ${preCheck.reason}`);
        return {
          step,
          status: 'failed',
          error: `Pre-execution validation failed: ${preCheck.reason}`,
          attempts: attempt,
          durationMs: Date.now() - startTime,
        };
      }

      const result = await this.executor.executeStep(resolvedStep, new Map());
      lastExecutionResult = result;
      // NOTE: Do NOT assign attempt = result.attempts here.
      // result.attempts is the executor's internal retry count (always starts at 1)
      // and would reset our outer loop counter, causing an infinite loop.

      if (result.success) {
        const verification = await this.verifyStepResult(step, result.data);
        lastVerification = verification;
      }

      const context = createDecisionContext(
        step,
        result,
        lastVerification,
        memoryStore,
        attempt,
        maxAttempts
      );

      const decision = this.decisionEngine.decide(context);
      this.decisionHistory.push(decision);

      switch (decision.action) {
        case DecisionAction.CONTINUE:
          if (result.success && lastVerification?.verified) {
            this.logger.info(`Step ${step.id} completed and verified (confidence: ${lastVerification.confidence})`);
            const exec: StepExecution = {
              step,
              status: 'completed',
              result: result.data,
              attempts: attempt,
              durationMs: result.durationMs,
              confidence: decision.confidence,
            };
            this.emit({ type: 'step:complete', execution: exec });
            return exec;
          }
          break;

        case DecisionAction.RETRY:
          this.logger.info(`Decision engine: RETRY for ${step.id} (attempt ${attempt}/${maxAttempts}) - ${decision.reason}`);
          attempt++;
          continue;

        case DecisionAction.REPAIR:
          if (this.config.enableRepair) {
            const repairAttempt = await this.repairEngine.analyzeAndRepair(step, { 
              step, 
              status: 'failed',
              attempts: attempt,
              durationMs: Date.now() - startTime,
            }, lastVerification || { verified: false, confidence: 0, errors: [result.error || 'Unknown error'] });
            
            if (repairAttempt && repairAttempt.success) {
              this.logger.info(`Step ${step.id} repaired via decision engine`);
              const exec: StepExecution = {
                step,
                status: 'repaired',
                result: repairAttempt.result,
                attempts: attempt + 1,
                durationMs: Date.now() - startTime,
                repairedFrom: step.id,
                confidence: (lastVerification?.confidence || 0.7) * 0.8,
              };
              this.emit({ type: 'step:repaired', execution: exec });
              return exec;
            }
          }
          // If repair failed or is disabled, fail this step rather than retrying
          if (attempt >= maxAttempts) break;
          attempt++;
          continue;

        case DecisionAction.SWITCH_TOOL:
          if (decision.alternatives && decision.alternatives.length > 0) {
            const newToolName = decision.alternatives[0];
            this.logger.info(`Decision engine suggests switching to tool: ${newToolName}`);
            step = { ...step, tool: newToolName };
            attempt++;
            continue;
          }
          break;

        case DecisionAction.REPLAN_PARTIAL:
        case DecisionAction.REPLAN_FULL:
          this.logger.warn(`Decision engine suggests ${decision.action} for ${step.id} - ${decision.reason}`);
          return {
            step,
            status: 'failed',
            error: `Decision: ${decision.action} - ${decision.reason}`,
            attempts: attempt,
            durationMs: result.durationMs,
          };

        case DecisionAction.ABORT:
          this.logger.error(`Decision engine decided to ABORT for step ${step.id}: ${decision.reason}`);
          return {
            step,
            status: 'failed',
            error: `Aborted: ${decision.reason}`,
            attempts: attempt,
            durationMs: result.durationMs,
          };
      }

      break;
    }

    this.logger.error(`Step ${step.id} failed after ${attempt} attempts`);
    return {
      step,
      status: 'failed',
      error: lastExecutionResult?.error || 'Max attempts reached',
      attempts: attempt,
      durationMs: Date.now() - startTime,
    };
  }

  private async validatePreExecution(step: Step): Promise<{ valid: boolean; reason?: string }> {
    const tool = this.registry.get(step.tool);
    if (!tool) {
      return { valid: false, reason: `Tool ${step.tool} not found` };
    }

    try {
      // ── Skip Zod validation for variable references ($step_X...) ───────────
      const filteredInputs = { ...step.inputs };
      for (const [key, value] of Object.entries(filteredInputs)) {
        if (typeof value === 'string' && value.startsWith('$')) {
          delete (filteredInputs as any)[key];
        }
      }

      const parsed = tool.parameters.safeParse(filteredInputs);
      if (!parsed.success) {
        // Only report errors for fields that WEREN'T skipped references
        const realErrors = parsed.error.errors.filter(e => {
          const path = e.path[0];
          return ! (typeof step.inputs[path as string] === 'string' && (step.inputs[path as string] as string).startsWith('$'));
        });
        
        if (realErrors.length > 0) {
          return { valid: false, reason: `Invalid inputs: ${realErrors.map(e => e.message).join(', ')}` };
        }
      }
    } catch (error) {
      return { valid: false, reason: `Schema validation error: ${error}` };
    }

    const goalLower = this.state.getGoal().toLowerCase();
    const toolPurpose = this.getToolPurpose(step.tool);
    if (!goalLower.includes(toolPurpose) && !this.isToolRelevant(step.tool, goalLower)) {
      return { valid: false, reason: `Tool ${step.tool} may not be relevant to goal` };
    }

    return { valid: true };
  }

  private getToolPurpose(toolName: string): string {
    const purposes: Record<string, string> = {
      searchFlights: 'flight',
      bookFlight: 'flight',
      searchHotels: 'hotel',
      bookHotel: 'hotel',
      getWeather: 'weather',
      searchWeb: 'search',
      createReminder: 'reminder',
      sendEmail: 'email',
      calculate: 'calculat',
      translateText: 'translat',
      // pipeline orchestration tools — always relevant
      parseIntent: '',
      aggregateFlights: 'flight',
      selectBestFlight: 'flight',
      synthesizeFinalResponse: '',
    };
    return purposes[toolName] ?? toolName;
  }

  private isToolRelevant(toolName: string, goal: string): boolean {
    // Orchestration tools are always considered relevant — they operate on
    // previous step outputs rather than matching raw goal keywords.
    const alwaysRelevant = new Set([
      'parseIntent',
      'aggregateFlights',
      'selectBestFlight',
      'synthesizeFinalResponse',
    ]);
    if (alwaysRelevant.has(toolName)) return true;

    const relevant: Record<string, string[]> = {
      searchFlights: ['flight', 'fly', 'airport', 'sfo', 'lax', 'del', 'bom', 'trip', 'delhi', 'mumbai'],
      bookFlight: ['book', 'flight', 'ticket', 'reserve'],
      searchHotels: ['hotel', 'stay', 'accommodation', 'room'],
      bookHotel: ['hotel', 'book', 'stay'],
      getWeather: ['weather', 'forecast', 'temperature', 'rain'],
      searchWeb: ['search', 'find', 'look up', 'research'],
      calculate: ['calculat', 'compute', 'math', 'percent', '+', '-', '*', '/'],
      translateText: ['translat', 'spanish', 'french', 'german', 'language'],
    };

    const keywords = relevant[toolName] || [];
    return keywords.some(k => goal.toLowerCase().includes(k));
  }

  private getExecutableSteps(pendingSteps: Step[], allSteps: Step[]): Step[] {
    return pendingSteps.filter(step => {
      if (!step.dependsOn || step.dependsOn.length === 0) {
        return true;
      }
      
      return step.dependsOn.every(depId => this.isStepCompleted(depId));
    });
  }

  private isStepCompleted(stepId: string): boolean {
    return this.completedSteps.some(s => s.step.id === stepId && (s.status === 'completed' || s.status === 'repaired'));
  }

  private getPreviousStepResults(dependsOn: string[]): Map<string, unknown> {
    const results = new Map<string, unknown>();
    
    for (const depId of dependsOn) {
      const completed = this.completedSteps.find(s => s.step.id === depId && s.result);
      if (completed) {
        results.set(depId, completed.result);
      }
    }
    
    return results;
  }

  /**
   * Resolve "$stepId.result.field" variable references in step inputs.
   * Supports dot-notation paths of arbitrary depth, e.g. $step_5.result.flights.0.price
   */
  private resolveStepInputs(inputs: Record<string, unknown>): Record<string, unknown> {
    const resolved: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(inputs)) {
      resolved[key] = this.resolveValue(value);
    }
    return resolved;
  }

  private resolveValue(value: unknown): unknown {
    if (typeof value === 'string' && value.startsWith('$')) {
      // Format: $step_X.result.field.subfield...
      const parts = value.slice(1).split('.');
      const stepId = parts[0];           // e.g. "step_5"
      const rest = parts.slice(1);       // e.g. ["result", "flights"]
      const completed = this.completedSteps.find(s => s.step.id === stepId);
      if (!completed) return value;       // unresolved — return original string
      let current: unknown = completed;
      for (const part of rest) {
        if (current === null || current === undefined) break;
        current = (current as Record<string, unknown>)[part];
      }
      return current !== undefined ? current : value;
    }
    if (Array.isArray(value)) {
      return value.map(v => this.resolveValue(v));
    }
    if (value !== null && typeof value === 'object') {
      return this.resolveStepInputs(value as Record<string, unknown>);
    }
    return value;
  }

  private async verifyStepResult(step: Step, result: unknown): Promise<VerificationResult> {
    // The executor already returned success:true. Trust that as the primary
    // verification signal. Using the tool's INPUT schema to validate the OUTPUT
    // was a category error — input schemas describe what goes IN, not what comes OUT.
    if (result !== null && result !== undefined) {
      return {
        verified: true,
        confidence: 0.9,
        errors: undefined,
      };
    }

    return {
      verified: false,
      confidence: 0.3,
      errors: ['Tool returned no result'],
      suggestedFixes: [
        {
          type: 'regenerate_inputs',
          stepId: step.id,
          reason: 'No result returned from tool',
          confidence: 0.4,
        },
      ],
    };
  }

  private async reflect(failedExecution: StepExecution, plan: Plan): Promise<ReflectionResult> {
    this.logger.info(`Reflecting on failed step ${failedExecution.step.id}`);

    const failedSteps = [failedExecution.step.id];
    const failurePatterns: string[] = [];
    const toolReliability = new Map<string, number>();

    if (failedExecution.error) {
      const toolName = failedExecution.step.tool;
      const perf = memoryStore.getToolPerformance(toolName);
      if (perf && perf.reliability < 0.5) {
        failurePatterns.push(`Tool ${toolName} has low reliability (${perf.reliability.toFixed(2)})`);
        toolReliability.set(toolName, perf.reliability);
      }

      if (failedExecution.error.toLowerCase().includes('invalid')) {
        failurePatterns.push('Input validation errors');
      }

      if (failedExecution.attempts > 2) {
        failurePatterns.push('Multiple retry attempts failed');
      }
    }

    const shouldReplan = failurePatterns.length > 0 || 
      (failedExecution.attempts >= 2 && !this.config.enableRepair);

    return {
      failedSteps,
      failurePatterns,
      toolReliability,
      suggestedAdjustments: failurePatterns,
      shouldReplan,
      partialRefinement: !shouldReplan,
    };
  }

  private shouldReplanBasedOnReflection(reflection: ReflectionResult): boolean {
    return reflection.shouldReplan || 
      (reflection.failurePatterns.length > 0 && this.config.enablePartialRefinement === false);
  }

  private async replan(currentPlan: Plan, iterationResult: IterationResult): Promise<Plan> {
    if (this.config.enablePartialRefinement && iterationResult.completedSteps.length > 0) {
      const successfulSteps = iterationResult.completedSteps
        .filter(s => s.status === 'completed' || s.status === 'repaired')
        .map(s => s.step);

      const failedSteps = iterationResult.pendingSteps.filter(p => 
        iterationResult.completedSteps.some(c => c.step.id === p.id && c.status === 'failed')
      );

      const errors = iterationResult.completedSteps
        .filter(s => s.error)
        .map(s => s.error as string);

      const refinement = await this.refiner.refinePlan(
        currentPlan,
        {
          goal: this.state.getGoal(),
          failedSteps,
          successfulSteps,
          errors,
          attemptedFixes: new Map(),
        },
        this.formatToolsForPrompt()
      );

      this.stepVersions.clear();
      for (const step of this.completedSteps) {
        this.stepVersions.set(step.step.id, 1);
      }
      for (const step of refinement.refinedPlan.steps) {
        const current = this.stepVersions.get(step.id) || 0;
        this.stepVersions.set(step.id, current + 1);
      }

      return refinement.refinedPlan;
    }

    this.logger.info('Full replan triggered');
    this.completedSteps = [];
    return this.createInitialPlan();
  }

  private formatToolsForPrompt(): string {
    return this.registry.list()
      .map(t => `- ${t.name}: ${t.description}`)
      .join('\n');
  }
}

export function createAgentLoop(
  goal: string,
  registry: ToolRegistry,
  config?: Partial<AgentLoopConfig>
): AgentLoop {
  return new AgentLoop(goal, registry, config);
}