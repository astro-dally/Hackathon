import React, { useState, useEffect } from 'react';
import { AgentRunState } from '../../types/agent';
import { Activity, Clock, Target, AlertCircle, Zap } from 'lucide-react';

export function StatusBar({ runState }: { runState: AgentRunState }) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Running': return 'text-blue-400 bg-blue-500/10 border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.15)]';
      case 'Recovering': return 'text-amber-400 bg-amber-500/10 border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.15)]';
      case 'Completed': return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.15)]';
      case 'Failed': return 'text-rose-400 bg-rose-500/10 border-rose-500/20 shadow-[0_0_15px_rgba(244,63,94,0.15)]';
      default: return 'text-slate-400 bg-slate-500/10 border-slate-500/20';
    }
  };

  const [runtime, setRuntime] = useState<number>(0);

  useEffect(() => {
    const calculateRuntime = () => {
      if (runState.endTime) {
        return (runState.endTime - runState.startTime) / 1000;
      }
      return (Date.now() - runState.startTime) / 1000;
    };

    setRuntime(calculateRuntime());
    
    if (runState.status === 'Running' || runState.status === 'Recovering') {
      const interval = setInterval(() => {
        setRuntime(calculateRuntime());
      }, 100);
      return () => clearInterval(interval);
    }
  }, [runState.startTime, runState.endTime, runState.status]);

  return (
    <div className="flex items-center justify-between border-b border-white/5 bg-slate-950/40 backdrop-blur-xl px-8 py-5 z-40">
      <div className="flex items-center gap-8">
        <div className="flex items-center gap-4 group">
          <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 group-hover:border-indigo-500/40 transition-colors shadow-inner">
            <Target className="w-5 h-5 text-indigo-400" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">Deployment Goal</h1>
            <p className="text-slate-100 font-bold text-base leading-tight mt-0.5 max-w-md truncate">{runState.goal}</p>
          </div>
        </div>
      </div>
      
      <div className="flex items-center gap-8">
        {/* Status Badge */}
        <div className="flex flex-col items-end">
           <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">System Status</span>
           <div className={`mt-1.5 flex items-center gap-2.5 px-4 py-1.5 rounded-full border text-xs font-bold uppercase tracking-wide transition-all duration-500 ${getStatusColor(runState.status)}`}>
             {runState.status === 'Running' || runState.status === 'Recovering' ? (
                <Activity className="w-3.5 h-3.5 animate-pulse" />
             ) : runState.status === 'Failed' ? (
                <AlertCircle className="w-3.5 h-3.5" />
             ) : (
                <Zap className="w-3.5 h-3.5 fill-current" />
             )}
             {runState.status}
           </div>
        </div>

        <div className="h-10 w-px bg-gradient-to-b from-transparent via-white/10 to-transparent" />

        {/* Runtime Counters */}
        <div className="flex gap-8">
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              <Clock className="w-3 h-3" /> Runtime
            </span>
            <span className="text-slate-100 font-mono mt-1 text-sm font-bold tabular-nums">
              {runtime.toFixed(1)}<span className="text-slate-500 ml-0.5">s</span>
            </span>
          </div>

          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Iteration</span>
            <span className="text-slate-100 font-mono mt-1 text-sm font-bold tabular-nums">
              {runState.iteration}<span className="text-slate-500 mx-1">/</span>{runState.maxIterations}
            </span>
          </div>
        </div>

        <div className="h-10 w-px bg-gradient-to-b from-transparent via-white/10 to-transparent" />

        {/* Global Confidence Progress */}
        <div className="flex flex-col min-w-[160px]">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Global Confidence</span>
          <div className="mt-2.5 flex items-center gap-3">
            <div className="flex-1 h-2 bg-slate-900/50 rounded-full overflow-hidden border border-white/5 ring-1 ring-white/5">
              <div 
                className="h-full bg-gradient-to-r from-blue-600 via-indigo-500 to-cyan-400 rounded-full shadow-[0_0_10px_rgba(99,102,241,0.4)] transition-all duration-1000 ease-out"
                style={{ width: `${runState.globalConfidence * 100}%` }}
              />
            </div>
            <span className="text-xs font-bold font-mono text-indigo-400 tabular-nums">
              {Math.round(runState.globalConfidence * 100)}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
