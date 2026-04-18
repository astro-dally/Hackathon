import { Step, Plan } from '../types/index.js';
import { logger } from '../core/logging.js';
import { memoryStore } from '../core/memory.js';

export interface RefinementRequest {
  goal: string;
  failedSteps: Step[];
  successfulSteps: Step[];
  errors: string[];
  attemptedFixes: Map<string, string>;
}

export interface RefinementResult {
  refinedPlan: Plan;
  modifiedSteps: string[];
  removedSteps: string[];
  newSteps: string[];
  partialRefinement: boolean;
  reason: string;
}

export class PlanRefiner {
  constructor(private model: string = 'gemini-2.5-flash') {}

  async refinePlan(
    originalPlan: Plan,
    request: RefinementRequest,
    availableTools: string
  ): Promise<RefinementResult> {
    logger.info(`Refining plan (partial replan) - ${request.failedSteps.length} failed, ${request.successfulSteps.length} successful`);

    const successfulSteps = request.successfulSteps.map(s => ({
      id: s.id,
      objective: s.objective,
      tool: s.tool,
      inputs: s.inputs,
      dependsOn: s.dependsOn,
    }));

    const failedInfo = request.failedSteps.map(s => 
      `- ${s.id}: ${s.objective} (tool: ${s.tool}, error: ${request.errors[request.failedSteps.indexOf(s)] || 'unknown'})`
    ).join('\n');

    const attemptedInfo = Array.from(request.attemptedFixes.entries())
      .map(([stepId, fixType]) => `- ${stepId}: tried ${fixType}`)
      .join('\n');

    const prompt = `You are a plan refinement engine. A previous execution failed and you need to fix only the failed parts while preserving successful ones.

ORIGINAL GOAL: ${request.goal}

SUCCESSFUL STEPS (keep these):
${successfulSteps.map(s => `- ${s.id}: ${s.objective} using ${s.tool}`).join('\n')}

FAILED STEPS (need to fix):
${failedInfo}

ATTEMPTS ALREADY TRIED:
${attemptedInfo}

AVAILABLE TOOLS:
${availableTools}

Your task is to create a REFINED plan that:
1. Keeps all successful steps unchanged
2. Modifies ONLY the failed steps (not regenerate everything)
3. Fix the specific issues (bad inputs, wrong tool, missing steps)
4. If a step keeps failing with the same tool, suggest a different tool

Return ONLY JSON with this structure:
{
  "goal": "${request.goal}",
  "steps": [
    {
      "id": "step_N",
      "objective": "description",
      "tool": "tool_name",
      "inputs": {"param": "value"},
      "dependsOn": ["step_id"]
    }
  ],
  "modifiedSteps": ["step_id", ...],
  "removedSteps": [],
  "newSteps": ["step_id", ...],
  "reason": "why this refinement is better"
}`;

    try {
      const result = await this.callLLM(prompt);
      const parsed = JSON.parse(result);

      const refinedSteps: Step[] = parsed.steps.map((s: any, i: number) => ({
        id: s.id || `step_${i + 1}`,
        objective: s.objective,
        tool: s.tool,
        inputs: s.inputs,
        dependsOn: s.dependsOn,
        confidence: 0.8,
      }));

      const originalIds = new Set(originalPlan.steps.map(s => s.id));
      const modifiedSteps = refinedSteps.filter(s => originalIds.has(s.id)).map(s => s.id);
      const newSteps = refinedSteps.filter(s => !originalIds.has(s.id)).map(s => s.id);

      logger.info(`Refinement complete: ${modifiedSteps.length} modified, ${newSteps.length} new steps`);

      return {
        refinedPlan: {
          goal: request.goal,
          steps: refinedSteps,
          metadata: {
            createdAt: new Date().toISOString(),
            model: this.model,
            iteration: originalPlan.metadata.iteration + 1,
            partialReplan: true,
          },
        },
        modifiedSteps,
        removedSteps: [],
        newSteps,
        partialRefinement: true,
        reason: parsed.reason || 'Partial refinement applied',
      };
    } catch (error) {
      logger.error(`Refinement failed: ${error}, falling back to full replan`);
      return this.createFallbackRefinement(originalPlan, request);
    }
  }

  private async callLLM(prompt: string): Promise<string> {
    const { genAI } = await import('./client.js');
    const model = genAI.getGenerativeModel({ model: this.model });
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON found in response');
    return match[0];
  }

  private createFallbackRefinement(originalPlan: Plan, request: RefinementRequest): RefinementResult {
    const successfulIds = new Set(request.successfulSteps.map(s => s.id));
    const successfulSteps = originalPlan.steps.filter(s => successfulIds.has(s.id));
    
    const failedSteps = request.failedSteps.map((s, i) => ({
      ...s,
      id: `${s.id}_v2`,
      confidence: 0.5,
    }));

    const refinedSteps = [...successfulSteps, ...failedSteps];

    return {
      refinedPlan: {
        goal: request.goal,
        steps: refinedSteps,
        metadata: {
          createdAt: new Date().toISOString(),
          model: this.model,
          iteration: originalPlan.metadata.iteration + 1,
          partialReplan: true,
        },
      },
      modifiedSteps: failedSteps.map(s => s.id),
      removedSteps: [],
      newSteps: failedSteps.map(s => s.id),
      partialRefinement: true,
      reason: 'Fallback refinement - retry failed steps with new version',
    };
  }

  async shouldFullReplan(request: RefinementRequest): Promise<boolean> {
    const failedCount = request.failedSteps.length;
    const totalSteps = failedCount + request.successfulSteps.length;
    
    if (failedCount / totalSteps > 0.5) {
      logger.info('More than 50% failed, recommend full replan');
      return true;
    }

    const unreliableTools = memoryStore.getUnreliableTools(0.5);
    const failedTools = request.failedSteps.map(s => s.tool);
    
    const hasUnreliableFailed = failedTools.some(t => unreliableTools.includes(t));
    if (hasUnreliableFailed) {
      logger.info('Failed steps use unreliable tools, recommend full replan');
      return true;
    }

    const repeatedPatterns = memoryStore.getFailedPatterns();
    const hasPattern = failedTools.some(t => repeatedPatterns.includes(t));
    if (hasPattern) {
      logger.info('Detected failure pattern, recommend full replan');
      return true;
    }

    return false;
  }
}

export function createPlanRefiner(model?: string): PlanRefiner {
  return new PlanRefiner(model);
}