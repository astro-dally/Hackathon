import { Step, ExecutionResult, VerificationResult, StepExecution, ToolPerformance } from '../types/index.js';
import { MemoryStore } from '../core/memory.js';
import { logger } from '../core/logging.js';

export enum FailureType {
  TRANSIENT_ERROR = 'TRANSIENT_ERROR',
  TOOL_FAILURE = 'TOOL_FAILURE',
  INVALID_OUTPUT = 'INVALID_OUTPUT',
  LOW_CONFIDENCE = 'LOW_CONFIDENCE',
  PLAN_ERROR = 'PLAN_ERROR',
  DEPENDENCY_FAILURE = 'DEPENDENCY_FAILURE',
  UNKNOWN = 'UNKNOWN'
}

export enum DecisionAction {
  CONTINUE = 'CONTINUE',
  RETRY = 'RETRY',
  REPAIR = 'REPAIR',
  REPLAN_PARTIAL = 'REPLAN_PARTIAL',
  REPLAN_FULL = 'REPLAN_FULL',
  SWITCH_TOOL = 'SWITCH_TOOL',
  ABORT = 'ABORT'
}

export interface ConfidenceScore {
  llm: number;
  tool: number;
  input: number;
  historical: number;
  combined: number;
}

export interface DecisionContext {
  step: Step;
  stepResult?: ExecutionResult;
  verification?: VerificationResult;
  confidence: number;
  failureType?: FailureType;
  memory: MemoryStore;
  attempt: number;
  maxAttempts: number;
}

export interface DecisionResult {
  action: DecisionAction;
  reason: string;
  confidence: number;
  alternatives?: string[];
}

export interface DecisionPolicy {
  name: string;
  priority: number;
  condition: (context: DecisionContext) => boolean;
  action: DecisionAction;
  reason: string;
}

export function classifyFailure(
  stepResult?: ExecutionResult,
  verification?: VerificationResult
): FailureType {
  if (!stepResult) {
    return FailureType.UNKNOWN;
  }

  const error = stepResult.error?.toLowerCase() || '';
  
  if (stepResult.attempts >= 1 && !stepResult.success) {
    const transientPatterns = ['timeout', 'network', 'connection', '503', '429', 'rate limit'];
    if (transientPatterns.some(p => error.includes(p))) {
      return FailureType.TRANSIENT_ERROR;
    }
  }

  if (!stepResult.success && error) {
    if (error.includes('dependency') || error.includes('upstream')) {
      return FailureType.DEPENDENCY_FAILURE;
    }
    if (error.includes('api') || error.includes('tool') || error.includes('service')) {
      return FailureType.TOOL_FAILURE;
    }
  }

  if (verification) {
    if (!verification.verified && (verification.errors?.length ?? 0) > 0) {
      const verificationErrors = (verification.errors ?? []).join(' ').toLowerCase();
      if (verificationErrors.includes('schema') || verificationErrors.includes('invalid') || verificationErrors.includes('format')) {
        return FailureType.INVALID_OUTPUT;
      }
    }
    
    if (verification.confidence < 0.5) {
      return FailureType.LOW_CONFIDENCE;
    }
  }

  if (!stepResult.success && !error) {
    return FailureType.PLAN_ERROR;
  }

  return FailureType.UNKNOWN;
}

export function computeConfidence(
  step: Step,
  verification?: VerificationResult,
  memory?: MemoryStore
): ConfidenceScore {
  let llmScore = step.confidence ?? 0.7;
  
  if (verification) {
    llmScore = verification.confidence;
  }

  let toolScore = 0.8;
  if (memory) {
    toolScore = memory.getToolSuccessRate(step.tool);
  }

  const inputKeys = Object.keys(step.inputs);
  let inputScore = inputKeys.length > 0 ? 0.9 : 0.3;
  
  if (step.uncertaintyReason) {
    inputScore *= 0.7;
  }

  let historicalScore = 0.8;
  if (memory) {
    const perf = memory.getToolPerformance(step.tool);
    if (perf && perf.totalExecutions > 5) {
      historicalScore = perf.reliability;
    } else if (!perf) {
      historicalScore = 0.6;
    }
  }

  const weights = {
    llm: 0.35,
    tool: 0.25,
    input: 0.2,
    historical: 0.2
  };

  const combined = 
    llmScore * weights.llm +
    toolScore * weights.tool +
    inputScore * weights.input +
    historicalScore * weights.historical;

  return {
    llm: Math.round(llmScore * 100) / 100,
    tool: Math.round(toolScore * 100) / 100,
    input: Math.round(inputScore * 100) / 100,
    historical: Math.round(historicalScore * 100) / 100,
    combined: Math.round(combined * 100) / 100
  };
}

export class DecisionEngine {
  private policies: DecisionPolicy[];
  private confidenceThreshold: number;
  private maxRetries: number;
  private maxRepairs: number;
  private toolSwitchThreshold: number;

  constructor(config?: {
    confidenceThreshold?: number;
    maxRetries?: number;
    maxRepairs?: number;
    toolSwitchThreshold?: number;
  }) {
    this.confidenceThreshold = config?.confidenceThreshold ?? 0.6;
    this.maxRetries = config?.maxRetries ?? 2;
    this.maxRepairs = config?.maxRepairs ?? 2;
    this.toolSwitchThreshold = config?.toolSwitchThreshold ?? 0.4;
    
    this.policies = this.initializePolicies();
  }

  private initializePolicies(): DecisionPolicy[] {
    return [
      {
        name: 'abort_on_max_attempts',
        priority: 100,
        condition: (ctx: DecisionContext) => ctx.attempt >= ctx.maxAttempts,
        action: DecisionAction.ABORT,
        reason: 'Maximum attempts reached'
      },
      {
        name: 'switch_tool_on_low_reliability',
        priority: 95,
        condition: (ctx: DecisionContext) => {
          if (ctx.failureType === FailureType.TOOL_FAILURE) {
            const reliability = ctx.memory.getToolSuccessRate(ctx.step.tool);
            const perf = ctx.memory.getToolPerformance(ctx.step.tool);
            return perf !== undefined && reliability < this.toolSwitchThreshold;
          }
          return false;
        },
        action: DecisionAction.SWITCH_TOOL,
        reason: 'Tool failure and low historical reliability for this tool'
      },
      {
        name: 'escalate_on_recent_failures',
        priority: 92,
        condition: (ctx: DecisionContext) => {
          if (!ctx.stepResult?.success) {
            const recentFailures = ctx.memory.getRecentFailures(ctx.step.tool, 3);
            return recentFailures.length >= 3;
          }
          return false;
        },
        action: DecisionAction.REPLAN_PARTIAL,
        reason: 'Frequent recent failures for this tool, escalating quickly'
      },
      {
        name: 'replan_full_on_plan_error',
        priority: 85,
        condition: (ctx: DecisionContext) => {
          return ctx.failureType === FailureType.PLAN_ERROR && ctx.attempt >= 1;
        },
        action: DecisionAction.REPLAN_FULL,
        reason: 'Plan logic error detected, full replan required'
      },
      {
        name: 'replan_partial_on_low_confidence_repeated',
        priority: 80,
        condition: (ctx: DecisionContext) => {
          return ctx.failureType === FailureType.LOW_CONFIDENCE && ctx.attempt >= 2;
        },
        action: DecisionAction.REPLAN_PARTIAL,
        reason: 'Low confidence detected multiple times'
      },
      {
        name: 'repair_on_invalid_output',
        priority: 75,
        condition: (ctx: DecisionContext) => {
          return ctx.failureType === FailureType.INVALID_OUTPUT && ctx.attempt < this.maxRepairs;
        },
        action: DecisionAction.REPAIR,
        reason: 'Output validation failed, attempting repair'
      },
      {
        name: 'repair_on_low_confidence_first',
        priority: 70,
        condition: (ctx: DecisionContext) => {
          return ctx.failureType === FailureType.LOW_CONFIDENCE && ctx.attempt === 1;
        },
        action: DecisionAction.REPAIR,
        reason: 'Low confidence on first attempt, trying repair'
      },
      {
        name: 'retry_on_transient_error',
        priority: 60,
        condition: (ctx: DecisionContext) => {
          return ctx.failureType === FailureType.TRANSIENT_ERROR && ctx.attempt < this.maxRetries;
        },
        action: DecisionAction.RETRY,
        reason: 'Transient error detected, retrying with backoff'
      },
      {
        name: 'retry_on_tool_failure',
        priority: 55,
        condition: (ctx: DecisionContext) => {
          return ctx.failureType === FailureType.TOOL_FAILURE && ctx.attempt < this.maxRetries;
        },
        action: DecisionAction.RETRY,
        reason: 'Tool failure, attempting retry'
      },
      {
        name: 'replan_partial_on_failure',
        priority: 50,
        condition: (ctx: DecisionContext) => {
          return !ctx.stepResult?.success && ctx.attempt >= this.maxRetries;
        },
        action: DecisionAction.REPLAN_PARTIAL,
        reason: 'All retries exhausted, partial replan needed'
      },
      {
        name: 'continue_on_success',
        priority: 10,
        condition: (ctx: DecisionContext) => ctx.stepResult?.success === true,
        action: DecisionAction.CONTINUE,
        reason: 'Step completed successfully'
      },
      {
        name: 'default_continue',
        priority: 1,
        condition: () => true,
        action: DecisionAction.CONTINUE,
        reason: 'Default: continue execution'
      }
    ].sort((a, b) => b.priority - a.priority);
  }

  decide(context: DecisionContext): DecisionResult {
    logger.debug(`[DecisionEngine] Evaluating for step: ${context.step.id}, attempt: ${context.attempt}, failureType: ${context.failureType || 'none'}`);

    const confidenceScore = computeConfidence(
      context.step,
      context.verification,
      context.memory
    );

    context = { ...context, confidence: confidenceScore.combined };

    for (const policy of this.policies) {
      if (policy.condition(context)) {
        const result: DecisionResult = {
          action: policy.action,
          reason: policy.reason,
          confidence: confidenceScore.combined
        };

        if (policy.action === DecisionAction.SWITCH_TOOL) {
          result.alternatives = this.getAlternativeTools(context);
        }

        logger.info(`[DecisionEngine] Decision: ${policy.action} for ${context.step.id} - ${policy.reason}`);
        
        return result;
      }
    }

    return {
      action: DecisionAction.CONTINUE,
      reason: 'No specific policy matched',
      confidence: confidenceScore.combined
    };
  }

  private getAlternativeTools(context: DecisionContext): string[] {
    const allTools = context.memory.getAllToolPerformance();
    const currentTool = context.step.tool;
    
    return allTools
      .filter((t: ToolPerformance) => t.toolName !== currentTool && t.reliability > this.toolSwitchThreshold)
      .sort((a: ToolPerformance, b: ToolPerformance) => b.reliability - a.reliability)
      .slice(0, 3)
      .map((t: ToolPerformance) => t.toolName);
  }

  addPolicy(policy: DecisionPolicy): void {
    this.policies.push(policy);
    this.policies.sort((a, b) => b.priority - a.priority);
  }

  getPolicyInfo(): { name: string; priority: number }[] {
    return this.policies.map(p => ({ name: p.name, priority: p.priority }));
  }
}

export function createDecisionEngine(config?: {
  confidenceThreshold?: number;
  maxRetries?: number;
  maxRepairs?: number;
  toolSwitchThreshold?: number;
}): DecisionEngine {
  return new DecisionEngine(config);
}

export function createDecisionContext(
  step: Step,
  stepResult: ExecutionResult | undefined,
  verification: VerificationResult | undefined,
  memory: MemoryStore,
  attempt: number,
  maxAttempts: number
): DecisionContext {
  const failureType = classifyFailure(stepResult, verification);
  const confidence = step.confidence ?? 0.7;

  return {
    step,
    stepResult,
    verification,
    confidence,
    failureType,
    memory,
    attempt,
    maxAttempts
  };
}