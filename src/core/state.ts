import { RunState, ExecutionResult, LogEntry, Plan } from '../types/index.js';

export class StateStore {
  private state: RunState;

  constructor(goal: string) {
    this.state = {
      runId: this.generateRunId(),
      goal,
      currentStep: 0,
      stepResults: new Map(),
      retryCount: 0,
      logs: [],
      status: 'pending',
    };
  }

  private generateRunId(): string {
    return `run_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  getRunId(): string {
    return this.state.runId;
  }

  getGoal(): string {
    return this.state.goal;
  }

  getStatus(): RunState['status'] {
    return this.state.status;
  }

  setStatus(status: RunState['status']): void {
    this.state.status = status;
  }

  getPlan(): Plan | undefined {
    return this.state.plan;
  }

  setPlan(plan: Plan): void {
    this.state.plan = plan;
    this.log('info', `Plan created with ${plan.steps.length} steps`);
  }

  getCurrentStep(): number {
    return this.state.currentStep;
  }

  setCurrentStep(step: number): void {
    this.state.currentStep = step;
  }

  incrementStep(): void {
    this.state.currentStep++;
  }

  getStepResult(stepId: string): ExecutionResult | undefined {
    return this.state.stepResults.get(stepId);
  }

  setStepResult(stepId: string, result: ExecutionResult): void {
    this.state.stepResults.set(stepId, result);
  }

  getRetryCount(): number {
    return this.state.retryCount;
  }

  incrementRetry(): void {
    this.state.retryCount++;
  }

  resetRetry(): void {
    this.state.retryCount = 0;
  }

  getAllStepResults(): Map<string, ExecutionResult> {
    return this.state.stepResults;
  }

  getLogs(): LogEntry[] {
    return [...this.state.logs];
  }

  log(level: LogEntry['level'], message: string, stepId?: string): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      runId: this.state.runId,
      stepId,
    };
    this.state.logs.push(entry);
  }

  getState(): Readonly<RunState> {
    return { ...this.state, stepResults: new Map(this.state.stepResults) };
  }
}