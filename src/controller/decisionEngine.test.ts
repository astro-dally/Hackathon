import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  DecisionEngine, 
  FailureType, 
  DecisionAction, 
  classifyFailure, 
  computeConfidence,
  createDecisionContext
} from './decisionEngine.js';
import { MemoryStore } from '../core/memory.js';
import { Step, ExecutionResult, VerificationResult } from '../types/index.js';

describe('Decision Engine Taxonomy', () => {
  it('should classify transient errors', () => {
    const result: ExecutionResult = { 
      stepId: '1', success: false,
      attempts: 1, durationMs: 100, 
      error: 'Network connection timeout' 
    };
    expect(classifyFailure(result)).toBe(FailureType.TRANSIENT_ERROR);
  });

  it('should classify tool failures', () => {
    const result: ExecutionResult = { 
      stepId: '1', success: false,
      attempts: 1, durationMs: 100, 
      error: 'API returned 500 internal tool error' 
    };
    expect(classifyFailure(result)).toBe(FailureType.TOOL_FAILURE);
  });

  it('should classify dependency failures', () => {
    const result: ExecutionResult = { 
      stepId: '1', success: false,
      attempts: 1, durationMs: 100, 
      error: 'dependency failure upstream' 
    };
    expect(classifyFailure(result)).toBe(FailureType.DEPENDENCY_FAILURE);
  });

  it('should classify validation/output errors', () => {
    const result: ExecutionResult = { 
      stepId: '1', success: true,
      attempts: 1, durationMs: 100 
    };
    const verification: VerificationResult = {
      verified: false,
      confidence: 0.8,
      errors: ['invalid schema format']
    };
    expect(classifyFailure(result, verification)).toBe(FailureType.INVALID_OUTPUT);
  });
});

describe('Decision Engine Policies', () => {
  let memory: MemoryStore;
  let engine: DecisionEngine;
  let step: Step;

  beforeEach(() => {
    // mock memory
    memory = {
      getToolSuccessRate: vi.fn(),
      getToolPerformance: vi.fn(),
      getRecentFailures: vi.fn(),
      getAllToolPerformance: vi.fn(),
      addEntry: vi.fn()
    } as unknown as MemoryStore;

    engine = new DecisionEngine({
      confidenceThreshold: 0.6,
      maxRetries: 2,
      maxRepairs: 2,
      toolSwitchThreshold: 0.4
    });

    step = { id: 's1', tool: 'myTool', inputs: {}, objective: 'test' };
  });

  it('TRANSIENT_ERROR -> RETRY', () => {
    const context = createDecisionContext(
      step,
      { stepId: step.id, status: 'failed', error: 'timeout', attempts: 1, durationMs: 100, success: false } as any,
      undefined,
      memory,
      1,
      3
    );
    const decision = engine.decide(context);
    expect(decision.action).toBe(DecisionAction.RETRY);
  });

  it('INVALID_OUTPUT -> REPAIR', () => {
    const context = createDecisionContext(
      step,
      { stepId: step.id, status: 'completed', attempts: 1, durationMs: 100, success: true } as any,
      { verified: false, confidence: 0.8, errors: ['invalid output'] },
      memory,
      1,
      3
    );
    const decision = engine.decide(context);
    expect(decision.action).toBe(DecisionAction.REPAIR);
  });

  it('LOW_CONFIDENCE + first attempt -> REPAIR', () => {
    const context = createDecisionContext(
      step,
      { stepId: step.id, status: 'completed', attempts: 1, durationMs: 100, success: true } as any,
      { verified: true, confidence: 0.3 }, // low confidence
      memory,
      1,
      3
    );
    const decision = engine.decide(context);
    expect(decision.action).toBe(DecisionAction.REPAIR);
  });

  it('LOW_CONFIDENCE + repeated -> REPLAN_PARTIAL', () => {
    const context = createDecisionContext(
      step,
      { stepId: step.id, status: 'completed', attempts: 2, durationMs: 100, success: true } as any,
      { verified: true, confidence: 0.3 }, // low confidence
      memory,
      2,
      3
    );
    const decision = engine.decide(context);
    expect(decision.action).toBe(DecisionAction.REPLAN_PARTIAL);
  });

  it('TOOL_FAILURE + low reliability -> SWITCH_TOOL', () => {
    vi.mocked(memory.getToolSuccessRate).mockReturnValue(0.2); // low reliability
    vi.mocked(memory.getToolPerformance).mockReturnValue({
      toolName: 'myTool', totalExecutions: 10,
      failures: 8, successes: 2, reliability: 0.2, averageDuration: 100, lastExecuted: ''
    });
    vi.mocked(memory.getAllToolPerformance).mockReturnValue([
      { toolName: 'altTool', totalExecutions: 10, failures: 1, successes: 9, reliability: 0.9, averageDuration: 100, lastExecuted: '' }
    ]);

    const context = createDecisionContext(
      step,
      { stepId: step.id, status: 'failed', error: 'api failed', attempts: 1, durationMs: 100, success: false } as any,
      undefined,
      memory,
      1,
      3
    );
    const decision = engine.decide(context);
    expect(decision.action).toBe(DecisionAction.SWITCH_TOOL);
    expect(decision.alternatives).toContain('altTool');
  });

  it('PLAN_ERROR -> REPLAN_FULL', () => {
    const context = createDecisionContext(
      step,
      { stepId: step.id, status: 'failed', error: '', attempts: 1, durationMs: 100, success: false } as any,
      undefined,
      memory,
      1,
      3
    );
    const decision = engine.decide(context);
    expect(decision.action).toBe(DecisionAction.REPLAN_FULL);
  });

  it('Repeated failures max attempts -> ABORT', () => {
    const context = createDecisionContext(
      step,
      { stepId: step.id, status: 'failed', error: 'api error', attempts: 3, durationMs: 100, success: false } as any,
      undefined,
      memory,
      3,
      3
    );
    const decision = engine.decide(context);
    expect(decision.action).toBe(DecisionAction.ABORT);
  });
});
