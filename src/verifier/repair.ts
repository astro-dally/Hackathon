import { VerificationResult, FixSuggestion, Step, StepExecution } from '../types/index.js';
import { ToolRegistry } from '../tools/registry.js';
import { logger } from '../core/logging.js';
import { memoryStore } from '../core/memory.js';

export interface RepairAttempt {
  stepId: string;
  attemptType: FixSuggestion['type'];
  newInputs?: Record<string, unknown>;
  newTool?: string;
  success: boolean;
  result?: unknown;
  error?: string;
}

export class RepairEngine {
  constructor(
    private registry: ToolRegistry,
    private maxRepairs: number = 3
  ) {}

  async analyzeAndRepair(
    step: Step,
    execution: StepExecution,
    verification: VerificationResult
  ): Promise<RepairAttempt | null> {
    if (verification.verified) {
      return null;
    }

    logger.info(`Repair engine analyzing failure for step ${step.id}`);

    const suggestions = verification.suggestedFixes || [];
    
    if (suggestions.length === 0) {
      suggestions.push({
        type: 'replan',
        stepId: step.id,
        reason: 'No specific fix suggested, need replan',
        confidence: 0.3,
      });
    }

    for (const suggestion of suggestions) {
      if (suggestion.confidence < 0.3) {
        continue;
      }

      const attempt = await this.applyFix(step, execution, suggestion);
      
      if (attempt.success) {
        logger.info(`Repair successful for ${step.id} using ${suggestion.type}`);
        return attempt;
      }

      logger.warn(`Repair attempt failed for ${step.id}: ${attempt.error}`);
    }

    return {
      stepId: step.id,
      attemptType: 'replan',
      success: false,
      error: 'All repair attempts failed',
    };
  }

  private async applyFix(
    step: Step,
    execution: StepExecution,
    suggestion: FixSuggestion
  ): Promise<RepairAttempt> {
    switch (suggestion.type) {
      case 'regenerate_inputs':
        return this.retryWithNewInputs(step, suggestion.newInputs || {});
      
      case 'switch_tool':
        return this.tryDifferentTool(step, suggestion.newTool || '');
      
      case 'retry':
        return this.retrySameStep(step);
      
      case 'skip':
        return { stepId: step.id, attemptType: 'skip', success: true, result: 'Skipped per suggestion' };
      
      case 'replan':
      default:
        return { stepId: step.id, attemptType: 'replan', success: false, error: 'Need full replan' };
    }
  }

  private async retryWithNewInputs(
    step: Step,
    newInputs: Record<string, unknown>
  ): Promise<RepairAttempt> {
    const tool = this.registry.get(step.tool);
    if (!tool) {
      return { stepId: step.id, attemptType: 'regenerate_inputs', success: false, error: 'Tool not found' };
    }

    try {
      logger.info(`Repair: Retrying ${step.id} with new inputs: ${JSON.stringify(newInputs)}`);
      const result = await tool.execute(newInputs);

      if (result.success) {
        return {
          stepId: step.id,
          attemptType: 'regenerate_inputs',
          success: true,
          result: result.data,
        };
      }

      return {
        stepId: step.id,
        attemptType: 'regenerate_inputs',
        success: false,
        error: result.error,
      };
    } catch (error) {
      return {
        stepId: step.id,
        attemptType: 'regenerate_inputs',
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async tryDifferentTool(
    step: Step,
    newToolName: string
  ): Promise<RepairAttempt> {
    const newTool = this.registry.get(newToolName);
    if (!newTool) {
      return { stepId: step.id, attemptType: 'switch_tool', success: false, error: `Tool ${newToolName} not found` };
    }

    try {
      logger.info(`Repair: Switching ${step.id} from ${step.tool} to ${newToolName}`);
      
      const newInputs = this.adaptInputsForTool(step.inputs, step.tool, newToolName);
      const result = await newTool.execute(newInputs);

      if (result.success) {
        return {
          stepId: step.id,
          attemptType: 'switch_tool',
          success: true,
          result: result.data,
        };
      }

      return {
        stepId: step.id,
        attemptType: 'switch_tool',
        success: false,
        error: result.error,
      };
    } catch (error) {
      return {
        stepId: step.id,
        attemptType: 'switch_tool',
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async retrySameStep(step: Step): Promise<RepairAttempt> {
    return this.retryWithNewInputs(step, step.inputs);
  }

  private adaptInputsForTool(
    originalInputs: Record<string, unknown>,
    fromTool: string,
    toTool: string
  ): Record<string, unknown> {
    const inputMappings: Record<string, Record<string, string>> = {
      'searchFlights': {
        'from': 'origin',
        'to': 'destination',
      },
      'searchHotels': {
        'location': 'location',
      },
    };

    const mapping = inputMappings[toTool];
    if (!mapping) {
      return { ...originalInputs };
    }

    const adapted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(originalInputs)) {
      const newKey = mapping[key] || key;
      adapted[newKey] = value;
    }

    return adapted;
  }

  findAlternativeTools(failedTool: string): string[] {
    const allTools = this.registry.list();
    const unreliable = memoryStore.getUnreliableTools(0.5);
    
    return allTools
      .filter(t => t.name !== failedTool && !unreliable.includes(t.name))
      .map(t => t.name)
      .slice(0, 3);
  }

  generateSmartFix(
    step: Step,
    error: string
  ): Record<string, unknown> {
    const fixedInputs = { ...step.inputs };

    if (error.toLowerCase().includes('invalid') || error.toLowerCase().includes('required')) {
      const tool = this.registry.get(step.tool);
      if (tool) {
        const schema = tool.parameters;
        const shape = (schema as any)._def?.shape;
        if (shape) {
          for (const [key, val] of Object.entries(shape)) {
            if (!fixedInputs[key]) {
              if ((val as any)._def?.typeName === 'ZodString') {
                fixedInputs[key] = 'default_value';
              } else if ((val as any)._def?.typeName === 'ZodNumber') {
                fixedInputs[key] = 0;
              }
            }
          }
        }
      }
    }

    return fixedInputs;
  }
}

export function createRepairEngine(registry: ToolRegistry, maxRepairs?: number): RepairEngine {
  return new RepairEngine(registry, maxRepairs);
}