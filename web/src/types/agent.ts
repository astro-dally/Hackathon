export type DecisionAction = 
  | 'CONTINUE'
  | 'RETRY'
  | 'REPAIR'
  | 'REPLAN_PARTIAL'
  | 'REPLAN_FULL'
  | 'SWITCH_TOOL'
  | 'ABORT';

export interface ConfidenceScore {
  llm: number;
  tool: number;
  input: number;
  historical: number;
  combined: number;
}

export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'repaired';

export interface Step {
  id: string;
  objective: string;
  tool: string;
  inputs: Record<string, unknown>;
  dependsOn?: string[];
}

export interface VerificationResult {
  verified: boolean;
  errors?: string[];
  confidence: number;
}

export interface StepExecution {
  step: Step;
  status: StepStatus;
  result?: unknown;
  error?: string;
  attempts: number;
  durationMs: number;
  confidence?: number;
  repairedFrom?: string;
  // Specific properties added for visualization
  decisionTaken?: DecisionAction;
  decisionReason?: string;
  detailedConfidence?: ConfidenceScore;
  verification?: VerificationResult;
}

export interface ReasoningLogItem {
  id: string;
  timestamp: string;
  type: 'status' | 'decision' | 'repair' | 'replan' | 'confidence' | 'error' | 'info';
  message: string;
  stepId?: string;
  details?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentRunState {
  runId: string;
  goal: string;
  status: 'Idle' | 'Running' | 'Recovering' | 'Completed' | 'Failed';
  iteration: number;
  maxIterations: number;
  globalConfidence: number;
  startTime: number;
  endTime?: number;
  steps: StepExecution[];
  logs: ReasoningLogItem[];
}
