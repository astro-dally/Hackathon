import { MemoryEntry, ToolPerformance, Step, StepExecution, ExecutionResult } from '../types/index.js';
import { logger } from '../core/logging.js';

export class MemoryStore {
  private entries: MemoryEntry[] = [];
  private toolPerformance: Map<string, ToolPerformance> = new Map();
  private maxEntries: number = 100;

  addEntry(entry: MemoryEntry): void {
    this.entries.unshift(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries.pop();
    }

    this.updateToolPerformance(entry);
    logger.debug(`Memory: Added entry for run ${entry.runId}`);
  }

  private updateToolPerformance(entry: MemoryEntry): void {
    for (const step of entry.steps) {
      const toolName = step.step.tool;
      const existing = this.toolPerformance.get(toolName) || {
        toolName,
        totalExecutions: 0,
        successes: 0,
        failures: 0,
        averageDuration: 0,
        lastExecuted: '',
        reliability: 1.0,
      };

      existing.totalExecutions++;
      if (step.status === 'completed') {
        existing.successes++;
      } else if (step.status === 'failed') {
        existing.failures++;
      }
      existing.averageDuration = (existing.averageDuration * (existing.totalExecutions - 1) + (step.durationMs || 0)) / existing.totalExecutions;
      existing.lastExecuted = new Date().toISOString();
      existing.reliability = existing.totalExecutions > 0 ? existing.successes / existing.totalExecutions : 1.0;

      this.toolPerformance.set(toolName, existing);
    }
  }

  getToolPerformance(toolName: string): ToolPerformance | undefined {
    return this.toolPerformance.get(toolName);
  }

  getAllToolPerformance(): ToolPerformance[] {
    return Array.from(this.toolPerformance.values());
  }

  getReliableTools(minReliability: number = 0.7): string[] {
    return Array.from(this.toolPerformance.entries())
      .filter(([_, perf]) => perf.reliability >= minReliability)
      .sort((a, b) => b[1].reliability - a[1].reliability)
      .map(([name]) => name);
  }

  getUnreliableTools(maxReliability: number = 0.5): string[] {
    return Array.from(this.toolPerformance.entries())
      .filter(([_, perf]) => perf.reliability < maxReliability && perf.totalExecutions >= 3)
      .map(([name]) => name);
  }

  getToolSuccessRate(toolName: string): number {
    const perf = this.getToolPerformance(toolName);
    return perf ? perf.reliability : 1.0;
  }

  getRecentFailures(toolName: string, limit: number = 5): ExecutionResult[] {
    const failures: ExecutionResult[] = [];
    for (const entry of this.entries) {
      for (const step of entry.steps) {
        if (step.step.tool === toolName && step.status === 'failed') {
          failures.push({
            stepId: step.step.id,
            success: false,
            error: step.error,
            attempts: step.attempts,
            durationMs: step.durationMs
          });
          if (failures.length >= limit) return failures;
        }
      }
    }
    return failures;
  }

  getFailurePatterns(stepType: string): string[] {
    const patterns = new Set<string>();
    for (const entry of this.entries) {
      if (!entry.success) {
        for (const step of entry.steps) {
          if (step.step.tool === stepType && step.status === 'failed' && step.error) {
            patterns.add(step.error);
          }
        }
      }
    }
    return Array.from(patterns);
  }

  getRecentPlans(limit: number = 5): MemoryEntry[] {
    return this.entries.slice(0, limit);
  }

  findSimilarGoal(goal: string): MemoryEntry | undefined {
    const goalLower = goal.toLowerCase();
    return this.entries.find(entry => 
      entry.goal.toLowerCase().includes(goalLower.slice(0, 20)) ||
      goalLower.includes(entry.goal.toLowerCase().slice(0, 20))
    );
  }

  getFailedPatterns(): string[] {
    const patterns: Map<string, number> = new Map();

    for (const entry of this.entries) {
      if (!entry.success) {
        for (const step of entry.steps) {
          if (step.status === 'failed' && step.error) {
            const toolName = step.step.tool;
            patterns.set(toolName, (patterns.get(toolName) || 0) + 1);
          }
        }
      }
    }

    return Array.from(patterns.entries())
      .sort((a, b) => b[1] - a[1])
      .filter(([_, count]) => count >= 2)
      .map(([tool]) => tool);
  }

  getStepsForTool(toolName: string): Step[] {
    const steps: Step[] = [];
    for (const entry of this.entries) {
      for (const step of entry.steps) {
        if (step.step.tool === toolName) {
          steps.push(step.step);
        }
      }
    }
    return steps;
  }

  getCachedResult(toolName: string, inputs: Record<string, unknown>): unknown | undefined {
    const inputsKey = JSON.stringify(inputs);
    
    for (const entry of this.entries.slice(0, 10)) {
      for (const step of entry.steps) {
        if (step.step.tool === toolName && step.status === 'completed') {
          const stepInputsKey = JSON.stringify(step.step.inputs);
          if (stepInputsKey === inputsKey && step.result) {
            logger.debug(`Memory: Cache hit for ${toolName}`);
            return step.result;
          }
        }
      }
    }
    return undefined;
  }

  clear(): void {
    this.entries = [];
    this.toolPerformance.clear();
    logger.info('Memory: Cleared all entries');
  }

  getStats(): { totalRuns: number; successRate: number; toolCount: number } {
    const totalRuns = this.entries.length;
    const successfulRuns = this.entries.filter(e => e.success).length;
    const successRate = totalRuns > 0 ? successfulRuns / totalRuns : 0;
    const toolCount = this.toolPerformance.size;

    return { totalRuns, successRate, toolCount };
  }
}

export const memoryStore = new MemoryStore();