import { NextRequest, NextResponse } from 'next/server';
import { createAgentLoop, ToolRegistry, registerAllTools, builtInTools } from '@agent/index';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const { goal } = await request.json();

    if (!goal) {
      return NextResponse.json({ error: 'Goal is required' }, { status: 400 });
    }

    const startTime = Date.now();
    const registry = new ToolRegistry();
    registerAllTools(registry);

    const loop = createAgentLoop(goal, registry, {
      maxIterations: 5,
      confidenceThreshold: 0.7
    });

    const result = await loop.run();
    
    let globalConfidence = 0;
    if (result.steps && result.steps.length > 0) {
       globalConfidence = result.steps.reduce((acc, s) => acc + (s.confidence || 0.5), 0) / result.steps.length;
    }

    const logs = [
      { id: 'log-1', timestamp: new Date(startTime).toISOString(), type: 'info', message: 'Agent started run', metadata: { goal } },
      ...result.steps.map((step, i) => ({
        id: `log-step-${i}`,
        timestamp: new Date(startTime + (step.durationMs || 500)).toISOString(),
        type: step.status === 'failed' ? 'error' : 'status' as any,
        message: `Step ${step.step.id} [${step.step.tool}]: ${step.status}`,
        stepId: step.step.id,
      }))
    ];

    if (result.errors.length > 0) {
      logs.push({
        id: 'log-err', timestamp: new Date().toISOString(), type: 'error', message: 'Run encountered errors', metadata: { errors: result.errors.join(', ') }
      } as any);
    }

    const frontendState = {
      runId: `run-${Date.now().toString(36)}`,
      goal,
      status: result.success ? 'Completed' : 'Failed',
      startTime,
      endTime: Date.now(),
      iteration: result.iterations,
      maxIterations: 5,
      globalConfidence,
      steps: result.steps as any[], // Accommodate extended properties on frontend
      logs
    };

    return NextResponse.json(frontendState);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    tools: builtInTools.map(t => t.name),
  });
}