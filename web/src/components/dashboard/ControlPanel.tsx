import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Terminal, History, Maximize2, Play, Pause, Trash2, Eye } from 'lucide-react';
import { AgentRunState } from '../../types/agent';

interface ControlPanelProps {
  onExecute?: (goal: string) => void;
  isExecuting?: boolean;
  pastRuns?: AgentRunState[];
  onViewRun?: (id: string) => void;
  onDeleteRun?: (id: string) => void;
}

export function ControlPanel({ onExecute, isExecuting, pastRuns = [], onViewRun, onDeleteRun }: ControlPanelProps) {
  const [goal, setGoal] = useState('');

  return (
    <div className="w-72 border-r border-white/10 bg-black/40 backdrop-blur-md flex flex-col h-full hidden lg:flex">
      <div className="p-4 border-b border-white/10 flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-wider text-gray-300 uppercase flex items-center gap-2">
          <Terminal className="w-4 h-4" /> Agent Control
        </h2>
      </div>

      <div className="p-4 flex flex-col gap-6">
        <div>
          <label className="text-xs font-semibold tracking-wider text-gray-500 uppercase mb-2 block">
            New Goal
          </label>
          <textarea 
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            className="w-full bg-black/50 border border-white/10 rounded-lg p-3 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 resize-none h-24 transition-all"
            placeholder="E.g., Analyze logs and create a mitigation plan..."
            disabled={isExecuting}
          />
          <div className="flex gap-2 mt-2">
            <button 
              onClick={() => { if (goal.trim() && onExecute) onExecute(goal.trim()); }}
              disabled={isExecuting || !goal.trim()}
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold py-2 px-4 rounded transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Play className="w-3 h-3 fill-current" /> {isExecuting ? 'Executing...' : 'Execute'}
            </button>
            <button className="bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-bold py-2 px-3 rounded transition-colors border border-gray-600">
              <Pause className="w-3 h-3 fill-current" />
            </button>
          </div>
        </div>

        <div>
           <h3 className="text-xs font-semibold tracking-wider text-gray-500 uppercase mb-3 flex items-center gap-2">
             <History className="text-gray-400 w-3 h-3" /> Run History
           </h3>
           <div className="flex flex-col gap-2 mb-6">
              {pastRuns.length === 0 && (
                <div className="text-xs text-gray-600 italic px-1">No past runs in history.</div>
              )}
              {pastRuns.map((run, i) => {
                const id = run.runId ?? run.goal?.slice(0, 12) ?? `run-${i}`;
                return (
                  <div key={id} className={`group p-3 rounded-lg border hover:bg-white/5 transition-colors ${run.status === 'Running' ? 'border-indigo-500/50 bg-indigo-500/5' : 'bg-transparent border-white/5'}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-mono text-gray-400">{id.slice(0, 12)}</span>
                      <div className="flex items-center gap-2">
                         <div className={`w-2 h-2 rounded-full ${run.status === 'Completed' ? 'bg-green-500' : run.status === 'Failed' ? 'bg-red-500' : 'bg-yellow-500 animate-pulse'}`} />
                      </div>
                    </div>
                    <p className="text-xs text-gray-300 truncate mb-1">{run.goal}</p>
                    
                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                       <button onClick={() => onViewRun?.(id)} className="text-gray-400 hover:text-white transition-colors p-1" title="View Run">
                         <Eye className="w-3.5 h-3.5" />
                       </button>
                       <button onClick={() => onDeleteRun?.(id)} className="text-gray-400 hover:text-red-400 transition-colors p-1" title="Delete Run">
                         <Trash2 className="w-3.5 h-3.5" />
                       </button>
                    </div>
                  </div>
                );
              })}
           </div>

           {/* Memory Reliability Widget */}
           {pastRuns.length > 0 && (
             <div className="mt-8 pt-6 border-t border-white/10">
               <h3 className="text-xs font-semibold tracking-wider text-gray-500 uppercase mb-4 flex items-center gap-2">
                 <Maximize2 className="w-3 h-3 text-emerald-400" /> Tool Intelligence
               </h3>
               <div className="flex flex-col gap-4">
                 {(() => {
                   const stats = new Map<string, { success: number, total: number }>();
                   pastRuns.forEach(run => run.steps.forEach(s => {
                     const existing = stats.get(s.step.tool) || { success: 0, total: 0 };
                     existing.total++;
                     if (s.status === 'completed' || s.status === 'repaired') existing.success++;
                     stats.set(s.step.tool, existing);
                   }));
                   
                   return Array.from(stats.entries())
                    .sort((a, b) => b[1].total - a[1].total)
                    .slice(0, 4)
                    .map(([tool, stat]) => {
                      const rate = (stat.success / stat.total) * 100;
                      return (
                        <div key={tool} className="group">
                          <div className="flex justify-between items-center mb-1.5">
                            <span className="text-[10px] font-mono text-gray-400 group-hover:text-indigo-300 transition-colors">{tool}</span>
                            <span className="text-[10px] font-mono text-gray-500">{Math.round(rate)}%</span>
                          </div>
                          <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${rate}%` }}
                              className={`h-full rounded-full ${rate > 80 ? 'bg-emerald-500' : rate > 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                            />
                          </div>
                        </div>
                      );
                    });
                 })()}
               </div>
             </div>
           )}
        </div>
      </div>
    </div>
  );
}
