'use client';
import React, { useState, useRef, useCallback } from 'react';
import { StatusBar } from './StatusBar';
import { ControlPanel } from './ControlPanel';
import { ExecutionGraph } from './ExecutionGraph';
import { ReasoningFeed } from './ReasoningFeed';
import { StepDetailsDrawer } from './StepDetailsDrawer';
import { FinalAnswerPanel } from './FinalAnswerPanel';
import { HITLModal } from './HITLModal';
import { AgentRunState, StepExecution } from '../../types/agent';
import { useMemoryPersistence } from '../../hooks/useMemoryPersistence';

interface HITLState {
  runId: string;
  stepId: string;
  question: string;
  data: any;
}

export function AgentDashboard() {
  const [selectedStep, setSelectedStep] = useState<StepExecution | null>(null);
  const [runState, setRunState] = useState<AgentRunState | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [hitl, setHitl] = useState<HITLState | null>(null);
  const [finalAnswer, setFinalAnswer] = useState<{ text: string; source?: string; confidence?: number } | null>(null);
  const abortRef = useRef<(() => void) | null>(null);

  const { history, addRun, deleteRun } = useMemoryPersistence();

  const handleExecute = useCallback(async (goal: string) => {
    // Cancel any in-progress run
    abortRef.current?.();
    setIsExecuting(true);
    setFinalAnswer(null);
    setHitl(null);

    const runId = `run-${Date.now().toString(36)}`;
    const startTime = Date.now();

    const initialState: AgentRunState = {
      runId,
      goal,
      status: 'Running',
      startTime,
      iteration: 1,
      maxIterations: 5,
      globalConfidence: 0.5,
      steps: [],
      logs: [{ id: 'log-start', timestamp: new Date().toISOString(), type: 'info', message: 'Agent started run', metadata: { goal } }]
    };
    setRunState(initialState);

    const url = `/api/agent-stream?goal=${encodeURIComponent(goal)}`;
    let closed = false;

    // Use fetch + ReadableStream for SSE (works with Next.js)
    try {
      const response = await fetch(url);
      if (!response.body) throw new Error('No response body');

      abortRef.current = () => { closed = true; };

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (!closed) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';

        for (const part of parts) {
          if (!part.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(part.slice(6));
            handleSSEEvent(event, runId, startTime, goal);
          } catch { /* malformed event */ }
        }
      }
    } catch (err) {
      console.error('SSE connection error:', err);
      setRunState(prev => prev ? { ...prev, status: 'Failed' } : null);
    } finally {
      setIsExecuting(false);
    }
  }, []);

  function handleSSEEvent(event: any, runId: string, startTime: number, goal: string) {
    switch (event.type) {
      // ReAct thinking events
      case 'think:start':
        setRunState(prev => prev ? {
          ...prev,
          logs: [...(prev.logs ?? []), {
            id: `log-think-start-${Date.now()}`, timestamp: new Date().toISOString(),
            type: 'decision', message: `Thinking: ${event.thought}`
          }]
        } : null);
        break;

      case 'think:reason':
        setRunState(prev => prev ? {
          ...prev,
          logs: [...(prev.logs ?? []), {
            id: `log-think-reason-${Date.now()}`, timestamp: new Date().toISOString(),
            type: 'info', message: event.reasoning
          }]
        } : null);
        break;

      case 'think:decide':
        setRunState(prev => prev ? {
          ...prev,
          logs: [...(prev.logs ?? []), {
            id: `log-think-decide-${Date.now()}`, timestamp: new Date().toISOString(),
            type: 'decision', message: `Decided: ${event.tool} — ${event.reason}`
          }]
        } : null);
        break;

      case 'plan:created':
        setRunState(prev => prev ? {
          ...prev,
          logs: [...(prev.logs ?? []), {
            id: `log-plan`, timestamp: new Date().toISOString(),
            type: 'info', message: `Plan created with ${event.plan?.steps?.length ?? 0} steps`
          }]
        } : null);
        break;

      case 'step:start':
        setRunState(prev => prev ? {
          ...prev,
          logs: [...(prev.logs ?? []), {
            id: `log-${event.step?.id}-start-${Date.now()}`, 
            timestamp: new Date().toISOString(),
            type: 'status', 
            message: `Starting ${event.step?.id} [${event.step?.tool}]`, 
            stepId: event.step?.id
          }]
        } : null);
        break;

      case 'step:complete':
      case 'step:failed':
      case 'step:repaired': {
        const exec: StepExecution = event.execution;
        setRunState(prev => {
          if (!prev) return null;
          // Deduplicate steps only if identical
          const stepExists = prev.steps.some(s => s.step.id === exec.step.id && s.status === exec.status && JSON.stringify(s.result) === JSON.stringify(exec.result));
          
          return {
            ...prev,
            steps: stepExists ? prev.steps : [...prev.steps, exec],
            logs: [...(prev.logs ?? []), {
              id: `log-${exec.step.id}-${exec.status}-${Date.now()}`, 
              timestamp: new Date().toISOString(),
              type: exec.status === 'failed' ? 'error' : 'status',
              message: `Step ${exec.step.id} [${exec.step.tool}]: ${exec.status}`, 
              stepId: exec.step.id
            }]
          };
        });

        // Extract final answer from synthesizeFinalResponse
        if (exec.step.tool === 'synthesizeFinalResponse') {
          const r = exec.result as any;
          if (r?.finalAnswer) {
            setFinalAnswer({ text: r.finalAnswer, source: r.source, confidence: exec.confidence });
          }
        }
        break;
      }

      case 'hitl:pending':
        setHitl({ runId: event.runId, stepId: event.stepId, question: event.question, data: event.data });
        break;

      case 'run:state': {
        const state = event.state as AgentRunState;
        setRunState(state);
        addRun(state);
        break;
      }

      case 'run:complete':
        setRunState(prev => prev ? { ...prev, status: event.success ? 'Completed' : 'Failed', iteration: event.iterations } : null);
        break;
    }
  }

  const handleViewRun = (id: string) => {
    const run = history.find(r => r.runId === id);
    if (run) {
      setRunState(run);
      setFinalAnswer(null);
      // Restore final answer from run steps if available
      const synthStep = run.steps?.find(s => {
        if (s.step.tool !== 'synthesizeFinalResponse') return false;
        const r = s.result as any;
        return r?.finalAnswer;
      });
      if (synthStep) {
        const r = synthStep.result as any;
        setFinalAnswer({ text: r.finalAnswer, source: r.source, confidence: synthStep.confidence });
      }
    }
  };

  const handleDeleteRun = (id: string) => {
    deleteRun(id);
    if (runState?.runId === id) setRunState(null);
  };

  const displayState = runState || {
    runId: 'idle', goal: 'Awaiting instruction', status: 'Idle',
    iteration: 0, maxIterations: 0, globalConfidence: 0,
    startTime: 0, steps: [], logs: []
  } as AgentRunState;

  return (
    <div className="flex flex-col h-screen bg-neutral-950 text-gray-100 font-sans overflow-hidden">
      <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/20 via-neutral-950 to-neutral-950 pointer-events-none" />

      <div className="relative z-10 flex flex-col h-full">
        <StatusBar runState={displayState} />

        <div className="flex flex-1 overflow-hidden">
          <ControlPanel
            onExecute={handleExecute}
            isExecuting={isExecuting}
            pastRuns={history}
            onViewRun={handleViewRun}
            onDeleteRun={handleDeleteRun}
          />

          {/* Main canvas */}
          <main className="flex-1 relative overflow-hidden flex flex-col bg-black/20">
            <div className="px-6 py-4 border-b border-white/5 bg-black/20 backdrop-blur-sm z-20 flex justify-between items-center shadow-md flex-shrink-0">
              <h2 className="text-sm font-semibold tracking-wider text-gray-300 uppercase">Execution Graph</h2>
              <div className="flex items-center gap-4 text-xs font-mono text-gray-500">
                <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-green-500" />Success</span>
                <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-yellow-500" />Retry/Uncertain</span>
                <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-blue-400" />Repaired</span>
                <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-red-500" />Failed</span>
                {isExecuting && (
                  <span className="flex items-center gap-1.5 text-indigo-400 animate-pulse">
                    <div className="w-2 h-2 rounded-full bg-indigo-400" />Live
                  </span>
                )}
              </div>
            </div>

            {/* Final Answer Panel — shown above graph when available */}
            {finalAnswer && (
              <div className="flex-shrink-0 overflow-y-auto max-h-52">
                <FinalAnswerPanel answer={finalAnswer.text} source={finalAnswer.source as any} confidence={finalAnswer.confidence} />
              </div>
            )}

            <ExecutionGraph
              steps={displayState.steps}
              onSelectStep={setSelectedStep}
              selectedStepId={selectedStep?.step.id}
            />
          </main>

          <ReasoningFeed logs={displayState.logs} />
        </div>
      </div>

      <StepDetailsDrawer execution={selectedStep} onClose={() => setSelectedStep(null)} />

      {/* HITL Modal */}
      {hitl && (
        <div className="absolute inset-0 z-50">
          <HITLModal
            runId={hitl.runId}
            stepId={hitl.stepId}
            question={hitl.question}
            data={hitl.data}
            onResolved={() => setHitl(null)}
          />
        </div>
      )}
    </div>
  );
}
