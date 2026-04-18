'use client';
import React, { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
          steps: [...prev.steps, {
            step: { id: 'think_1', objective: event.thought, tool: '🤔', inputs: {} },
            status: 'running',
            attempts: 1,
            durationMs: 0,
          }],
          logs: [...(prev.logs ?? []), {
            id: `log-think-start-${Date.now()}`, timestamp: new Date().toISOString(),
            type: 'decision', message: `Thinking: ${event.thought}`
          }]
        } : null);
        break;

      case 'think:reason':
        setRunState(prev => prev ? {
          ...prev,
          steps: [...prev.steps, {
            step: { id: 'think_2', objective: event.reasoning, tool: '💭', inputs: {} },
            status: 'completed',
            attempts: 1,
            durationMs: 50,
          }],
          logs: [...(prev.logs ?? []), {
            id: `log-think-reason-${Date.now()}`, timestamp: new Date().toISOString(),
            type: 'info', message: event.reasoning
          }]
        } : null);
        break;

      case 'think:decide':
        setRunState(prev => prev ? {
          ...prev,
          steps: [...prev.steps, {
            step: { id: 'think_3', objective: event.reason, tool: event.tool, inputs: {} },
            status: 'completed',
            attempts: 1,
            durationMs: 100,
          }],
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
        
        // Set final answer if present
        if (state.finalAnswer) {
          setFinalAnswer({ text: state.finalAnswer, source: 'local', confidence: 0.9 });
        }
        break;
      }

      case 'run:complete':
        // Also handle final answer from run:complete event
        if ((event as any).finalAnswer) {
          setFinalAnswer({ text: (event as any).finalAnswer, source: 'local', confidence: 0.9 });
        }
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
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 font-sans overflow-hidden relative">
      {/* Dynamic Background Effects */}
      <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_50%_0%,_#1e1b4b_0%,_transparent_50%)] opacity-40 pointer-events-none" />
      <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_100%_100%,_#0f172a_0%,_transparent_50%)] opacity-40 pointer-events-none" />
      <div className="absolute inset-0 z-0 opacity-[0.03] pointer-events-none mix-blend-overlay" 
           style={{ backgroundImage: 'url("https://grainy-gradients.vercel.app/noise.svg")' }} />

      <div className="relative z-10 flex flex-col h-full">
        <StatusBar runState={displayState} />

        <div className="flex flex-1 overflow-hidden relative">
          <ControlPanel
            onExecute={handleExecute}
            isExecuting={isExecuting}
            pastRuns={history}
            onViewRun={handleViewRun}
            onDeleteRun={handleDeleteRun}
          />

          {/* Main Canvas Area */}
          <main className="flex-1 relative overflow-hidden flex flex-col bg-slate-900/10 backdrop-blur-sm">
            {/* Legend Header */}
            <div className="px-8 py-5 border-b border-white/5 bg-slate-950/20 backdrop-blur-md z-30 flex justify-between items-center shadow-2xl">
              <div className="flex items-center gap-3">
                <div className="w-1 h-4 bg-indigo-500 rounded-full" />
                <h2 className="text-[10px] font-black tracking-[0.3em] text-slate-400 uppercase">Neural Execution Graph</h2>
              </div>
              
              <div className="flex items-center gap-6 text-[10px] font-black tracking-widest uppercase">
                <span className="flex items-center gap-2 text-emerald-400"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" />Success</span>
                <span className="flex items-center gap-2 text-amber-400"><div className="w-1.5 h-1.5 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]" />Retry</span>
                <span className="flex items-center gap-2 text-blue-400"><div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]" />Repair</span>
                <span className="flex items-center gap-2 text-rose-400"><div className="w-1.5 h-1.5 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]" />Fail</span>
                {isExecuting && (
                  <div className="h-4 w-px bg-white/10 mx-2" />
                )}
                {isExecuting && (
                  <span className="flex items-center gap-2 text-indigo-400 animate-pulse">
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.8)]" />Live Channel
                  </span>
                )}
              </div>
            </div>

            {/* Final Answer Overlay Panel */}
            <AnimatePresence>
              {finalAnswer && (
                <motion.div 
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20, scale: 0.95 }}
                  className="absolute top-20 left-1/2 -translate-x-1/2 z-40 w-full max-w-2xl px-6"
                >
                  <div className="glass shadow-2xl rounded-2xl overflow-hidden border border-emerald-500/20">
                    <FinalAnswerPanel 
                      answer={finalAnswer.text} 
                      source={finalAnswer.source as any} 
                      confidence={finalAnswer.confidence} 
                      onClose={() => setFinalAnswer(null)}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex-1 relative min-h-0">
              <ExecutionGraph
                steps={displayState.steps}
                onSelectStep={setSelectedStep}
                selectedStepId={selectedStep?.step.id}
              />
            </div>
          </main>

          <ReasoningFeed logs={displayState.logs} />
        </div>
      </div>

      <StepDetailsDrawer execution={selectedStep} onClose={() => setSelectedStep(null)} />

      {/* HITL Modal Layer */}
      <AnimatePresence>
        {hitl && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[100] backdrop-blur-lg bg-slate-950/60 flex items-center justify-center p-6"
          >
            <HITLModal
              runId={hitl.runId}
              stepId={hitl.stepId}
              question={hitl.question}
              data={hitl.data}
              onResolved={() => setHitl(null)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
