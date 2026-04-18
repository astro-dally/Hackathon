import { Plan, Step, Tool } from '../types/index.js';
import { ToolRegistry } from '../tools/registry.js';
import { createPlanWithRetry } from './client.js';
import { logger } from '../core/logging.js';

export interface PlannerConfig {
  model?: string;
  maxRetries?: number;
}

export class Planner {
  constructor(
    private registry: ToolRegistry,
    private config: PlannerConfig = {}
  ) {}

  async createPlan(goal: string): Promise<Plan> {
    const availableTools = this.formatToolsForPrompt();

    logger.info(`Creating plan for: ${goal}`);

    const planOutput = await createPlanWithRetry(
      goal,
      availableTools,
      this.config.maxRetries
    );

    const steps: Step[] = planOutput.steps.map((s, i) => ({
      id: s.id || `step_${i + 1}`,
      objective: s.objective,
      tool: s.tool,
      inputs: s.inputs,
      dependsOn: s.dependsOn,
    }));

    const plan: Plan = {
      goal,
      steps,
      metadata: {
        createdAt: new Date().toISOString(),
        model: this.config.model || 'gemini-2.5-flash',
        iteration: 1,
        partialReplan: false,
      },
    };

    logger.info(`Plan created with ${steps.length} steps`);

    return plan;
  }

  private formatToolsForPrompt(): string {
    const tools = this.registry.list();

    return tools
      .map(t => {
        const schema = t.parameters;
        const description = schema._def?.description || t.description;
        return `- ${t.name}: ${description}`;
      })
      .join('\n');
  }
}

export function createPlanner(registry: ToolRegistry, config?: PlannerConfig): Planner {
  return new Planner(registry, config);
}