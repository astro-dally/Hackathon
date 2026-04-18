import React, { useState, useEffect } from 'react';
import { AgentRunState } from '../../types/agent';
import { Activity, Clock, Target, AlertCircle } from 'lucide-react';

export function StatusBar({ runState }: { runState: AgentRunState }) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Running': return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
      case 'Recovering': return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20';
      case 'Completed': return 'text-green-400 bg-green-500/10 border-green-500/20';
      case 'Failed': return 'text-red-400 bg-red-500/10 border-red-500/20';
      default: return 'text-gray-400 bg-gray-500/10 border-gray-500/20';
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
    <div className="flex items-center justify-between border-b border-white/10 bg-black/40 backdrop-blur-md px-6 py-4">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-white/5 border border-white/10">
            <Target className="w-5 h-5 text-gray-300" />
          </div>
          <div>
            <h1 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Current Goal</h1>
            <p className="text-gray-100 font-semibold">{runState.goal}</p>
          </div>
        </div>
      </div>
      
      <div className="flex items-center gap-6">
        <div className="flex flex-col items-end">
           <span className="text-xs text-gray-400 uppercase tracking-wider">Status</span>
           <div className={`mt-1 flex items-center gap-2 px-3 py-1 rounded-full border text-sm font-medium ${getStatusColor(runState.status)}`}>
             {runState.status === 'Running' || runState.status === 'Recovering' ? (
                <Activity className="w-4 h-4 animate-pulse" />
             ) : runState.status === 'Failed' ? (
                <AlertCircle className="w-4 h-4" />
             ) : null}
             {runState.status}
           </div>
        </div>

        <div className="h-10 w-px bg-white/10" />

        <div className="flex flex-col">
          <span className="text-xs text-gray-400 uppercase tracking-wider flex items-center gap-1">
            <Clock className="w-3 h-3" /> Runtime
          </span>
          <span className="text-gray-100 font-mono mt-1 text-sm">
            {runtime.toFixed(1)}s
          </span>
        </div>

        <div className="h-10 w-px bg-white/10" />

        <div className="flex flex-col">
          <span className="text-xs text-gray-400 uppercase tracking-wider">Iteration</span>
          <span className="text-gray-100 font-mono mt-1 text-sm">
            {runState.iteration} / {runState.maxIterations}
          </span>
        </div>

        <div className="h-10 w-px bg-white/10" />

        <div className="flex flex-col min-w-[120px]">
          <span className="text-xs text-gray-400 uppercase tracking-wider">Global Confidence</span>
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-blue-500 to-indigo-400 rounded-full"
                style={{ width: `${runState.globalConfidence * 100}%` }}
              />
            </div>
            <span className="text-xs font-mono text-indigo-300">
              {Math.round(runState.globalConfidence * 100)}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
