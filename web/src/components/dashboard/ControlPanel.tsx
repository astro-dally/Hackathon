import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Terminal, History, Maximize2, Play, Eye, Trash2, Cpu, Sparkles } from 'lucide-react';
import { AgentRunState } from '../../types/agent';

interface ControlPanelProps {
  onExecute?: (goal: string) => void;
  isExecuting?: boolean;
  pastRuns?: AgentRunState[];
  onViewRun?: (id: string) => void;
  onDeleteRun?: (id: string) => void;
}

export function ControlPanel({ 
  onExecute, 
  isExecuting, 
  pastRuns = [], 
  onViewRun, 
  onDeleteRun 
}: ControlPanelProps) {
  const [goal, setGoal] = useState('');

  return (
    <div className="w-80 border-r border-white/5 bg-slate-950/20 backdrop-blur-xl flex flex-col h-full hidden lg:flex z-30">
      <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
        <h2 className="text-xs font-bold tracking-[0.2em] text-slate-400 uppercase flex items-center gap-2.5">
          <Terminal className="w-4 h-4 text-indigo-400" /> Agent Control
        </h2>
        {isExecuting && (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-indigo-500/10 border border-indigo-500/20">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
            </span>
            <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">Active</span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">
        {/* Goal Input Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-bold tracking-widest text-slate-500 uppercase flex items-center gap-2">
              <Sparkles className="w-3 h-3 text-indigo-400" /> New Directive
            </label>
          </div>
          <div className="relative group">
            <textarea 
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              className="w-full bg-slate-900/40 border border-white/10 rounded-xl p-4 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 resize-none h-32 transition-all shadow-inner group-hover:border-white/20"
              placeholder="e.g. Deploy a cross-region failover strategy for the payment gateway..."
              disabled={isExecuting}
            />
            <div className="absolute bottom-3 right-3">
               <button 
                  onClick={() => { if (goal.trim() && onExecute) { onExecute(goal.trim()); setGoal(''); } }}
                  disabled={isExecuting || !goal.trim()}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white p-2 rounded-lg transition-all shadow-[0_4px_12px_rgba(79,70,229,0.3)] disabled:opacity-0 disabled:scale-90 scale-100 active:scale-95 group-hover:shadow-[0_4px_15px_rgba(79,70,229,0.5)]"
                >
                  <Play className="w-4 h-4 fill-current" />
                </button>
            </div>
          </div>
        </section>

        {/* Run History Section */}
        <section className="space-y-4">
           <h3 className="text-[10px] font-bold tracking-widest text-slate-500 uppercase flex items-center gap-2">
             <History className="text-slate-400 w-3.5 h-3.5" /> History Log
           </h3>
           <div className="space-y-3">
              {pastRuns.length === 0 && (
                <div className="text-[11px] text-slate-600 italic px-2 py-8 text-center border border-dashed border-white/5 rounded-xl bg-white/[0.01]">
                  No recursive operations found.
                </div>
              )}
              {pastRuns.map((run, i) => {
                const id = run.runId ?? run.goal?.slice(0, 12) ?? `run-${i}`;
                const isRunning = run.status === 'Running' || run.status === 'Recovering';
                return (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    key={id} 
                    className={`group relative p-3.5 rounded-xl border transition-all duration-300 cursor-pointer overflow-hidden ${isRunning ? 'border-indigo-500/30 bg-indigo-500/5 shadow-[0_0_15px_rgba(99,102,241,0.1)]' : 'bg-slate-900/20 border-white/5 hover:border-white/10 hover:bg-white/[0.02]'}`}
                    onClick={() => onViewRun?.(id)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-mono text-slate-500 group-hover:text-slate-400 transition-colors">#{id.slice(0, 8).toUpperCase()}</span>
                      <div className={`w-2 h-2 rounded-full ${run.status === 'Completed' ? 'bg-emerald-500' : run.status === 'Failed' ? 'bg-rose-500' : 'bg-indigo-500 animate-pulse'}`} />
                    </div>
                    <p className="text-xs text-slate-300 truncate font-medium group-hover:text-white transition-colors leading-relaxed">{run.goal}</p>
                    
                    <div className="absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-slate-950 to-transparent flex items-center justify-end px-3 opacity-0 group-hover:opacity-100 transition-opacity">
                       <button 
                         onClick={(e) => { e.stopPropagation(); onDeleteRun?.(id); }} 
                         className="p-1.5 rounded-lg bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white transition-all shadow-sm"
                       >
                         <Trash2 className="w-3.5 h-3.5" />
                       </button>
                    </div>
                  </motion.div>
                );
              })}
           </div>
        </section>

        {/* Intelligence Monitor Section */}
        {pastRuns.length > 0 && (
          <section className="space-y-4 pt-4 border-t border-white/5">
            <h3 className="text-[10px] font-bold tracking-widest text-slate-500 uppercase flex items-center gap-2">
              <Cpu className="w-3.5 h-3.5 text-indigo-400" /> Intelligence Matrix
            </h3>
            <div className="space-y-5">
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
                       <div className="flex justify-between items-center mb-2">
                         <span className="text-[10px] font-mono text-slate-500 group-hover:text-indigo-400 transition-colors uppercase font-bold tracking-tighter">{tool}</span>
                         <span className="text-[10px] font-mono text-slate-400 font-bold">{Math.round(rate)}%</span>
                       </div>
                       <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden border border-white/5">
                         <motion.div 
                           initial={{ width: 0 }}
                           animate={{ width: `${rate}%` }}
                           className={`h-full rounded-full transition-all duration-1000 ${rate > 80 ? 'bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]' : rate > 50 ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]' : 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]'}`}
                         />
                       </div>
                     </div>
                   );
                 });
              })()}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

