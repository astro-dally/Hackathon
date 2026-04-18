import { z } from 'zod';

export interface Step {
  id: string;
  objective: string;
  tool: string;
  inputs: Record<string, unknown>;
  dependsOn?: string[];
  confidence?: number;
  uncertaintyReason?: string;
}

export interface Plan {
  goal: string;
  steps: Step[];
  metadata: {
    createdAt: string;
    model: string;
    iteration: number;
    partialReplan?: boolean;
  };
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface Tool {
  name: string;
  description: string;
  parameters: z.ZodSchema;
  execute: (params: unknown) => Promise<ToolResult>;
}

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterFactor: number;
  retryableErrors: Set<string>;
  sameErrorThreshold: number;
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenMaxAttempts: number;
  monitorWindowMs: number;
}

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface VerificationResult {
  verified: boolean;
  errors?: string[];
  warnings?: string[];
  suggestedFixes?: FixSuggestion[];
  confidence: number;
  metadata?: Record<string, unknown>;
}

export interface Verifier {
  verify(input: unknown, output: unknown): Promise<VerificationResult>;
}

export interface ExecutorConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  stepTimeout: number;
  circuitFailureThreshold: number;
  circuitResetTimeoutMs: number;
}

export interface ExecutionResult {
  stepId: string;
  success: boolean;
  data?: unknown;
  error?: string;
  attempts: number;
  durationMs: number;
}

export interface LogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  runId?: string;
  stepId?: string;
}

export interface RunState {
  runId: string;
  goal: string;
  plan?: Plan;
  currentStep: number;
  stepResults: Map<string, ExecutionResult>;
  retryCount: number;
  logs: LogEntry[];
  status: 'pending' | 'running' | 'completed' | 'failed';
}

export interface OrchestratorConfig {
  maxSteps: number;
  maxRetries: number;
  stepTimeout: number;
  enableReplanning: boolean;
  maxIterations: number;
  confidenceThreshold: number;
}

export interface VerificationResult {
  verified: boolean;
  errors?: string[];
  warnings?: string[];
  suggestedFixes?: FixSuggestion[];
  confidence: number;
  metadata?: Record<string, unknown>;
}

export interface FixSuggestion {
  type: 'regenerate_inputs' | 'switch_tool' | 'retry' | 'skip' | 'replan';
  stepId: string;
  newInputs?: Record<string, unknown>;
  newTool?: string;
  reason: string;
  confidence: number;
}

export interface StepExecution {
  step: Step;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'repaired';
  result?: unknown;
  error?: string;
  attempts: number;
  durationMs: number;
  repairedFrom?: string;
  confidence?: number;
}

export interface ToolPerformance {
  toolName: string;
  totalExecutions: number;
  successes: number;
  failures: number;
  averageDuration: number;
  lastExecuted: string;
  reliability: number;
}

export interface MemoryEntry {
  runId: string;
  goal: string;
  plan: Plan;
  steps: StepExecution[];
  success: boolean;
  errors: string[];
  timestamp: string;
}

export interface ReflectionResult {
  failedSteps: string[];
  failurePatterns: string[];
  toolReliability: Map<string, number>;
  suggestedAdjustments: string[];
  shouldReplan: boolean;
  partialRefinement: boolean;
}

export interface AgentLoopConfig {
  maxIterations: number;
  confidenceThreshold: number;
  enablePartialRefinement: boolean;
  enableRepair: boolean;
  enableReflection: boolean;
  maxRepairsPerStep: number;
  maxRetriesPerStep: number;
}

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
  memory: any;
  attempt: number;
  maxAttempts: number;
}

export interface DecisionResult {
  action: DecisionAction;
  reason: string;
  confidence: number;
  alternatives?: string[];
}

export interface IterationResult {
  iteration: number;
  completedSteps: StepExecution[];
  pendingSteps: Step[];
  failedStep?: StepExecution;
  reflection?: ReflectionResult;
  shouldContinue: boolean;
  shouldReplan: boolean;
  reason: string;
}