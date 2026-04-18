import { NextRequest } from 'next/server';
import { ToolRegistry, registerAllTools, AgentLoop, AgentEvent } from '@agent/index';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// In-memory map of running agent loops (keyed by runId) for HITL resolution
const activeLoops = new Map<string, AgentLoop>();

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const goal = searchParams.get('goal');

  if (!goal) {
    return new Response('goal query param required', { status: 400 });
  }

  const runId = `run-${Date.now().toString(36)}`;
  const startTime = Date.now();

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: AgentEvent | { type: string; [key: string]: any }) {
        const data = JSON.stringify({ runId, startTime, ...event });
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      }

      try {
        const registry = new ToolRegistry();
        registerAllTools(registry);

        const loop = new AgentLoop(goal, registry, { 
          maxIterations: 5, 
          confidenceThreshold: 0.7,
          enableReAct: true,
        }, send as any);
        activeLoops.set(runId, loop);

        send({ type: 'run:start', goal, runId });

        const result = await loop.run();

        // Final state for the UI
        let globalConfidence = 0;
        if (result.steps?.length > 0) {
          globalConfidence = result.steps.reduce((acc, s) => acc + (s.confidence || 0.5), 0) / result.steps.length;
        }

        // Generate reasoning logs from events
        const logs = [
          { id: 'log-1', timestamp: new Date(startTime).toISOString(), type: 'info', message: 'Agent started run', metadata: { goal } },
        ];
        
        // Add step results to logs
        for (let i = 0; i < result.steps.length; i++) {
          const step = result.steps[i];
          const stepTime = startTime + (i * 500);
          const statusType = step.status === 'failed' ? 'error' : 'decision';
          logs.push({
            id: `log-step-${i}`,
            timestamp: new Date(stepTime).toISOString(),
            type: statusType as any,
            message: `[${step.step.tool}] ${step.status}`,
            stepId: step.step.id,
            details: step.result ? JSON.stringify(step.result).slice(0, 100) : step.error,
          });
        }
        
        if (result.errors.length > 0) {
          logs.push({ id: 'log-err', timestamp: new Date().toISOString(), type: 'error', message: 'Run encountered errors', details: result.errors.join(', ') } as any);
        }

        send({
          type: 'run:state',
          state: {
            runId,
            goal,
            status: result.success ? 'Completed' : 'Failed',
            startTime,
            endTime: Date.now(),
            iteration: result.iterations,
            maxIterations: 5,
            globalConfidence,
            steps: result.steps,
            logs,
          }
        });

      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        send({ type: 'error', message });
      } finally {
        activeLoops.delete(runId);
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

/** HITL resolution — POST { runId, stepId, approved: boolean } */
export async function POST(request: NextRequest) {
  const { runId, stepId, approved } = await request.json();
  const loop = activeLoops.get(runId);
  if (!loop) return new Response('Run not found', { status: 404 });
  loop.resolveHITL(stepId, approved);
  return new Response('ok');
}
