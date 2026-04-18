import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ReasoningLogItem } from '../../types/agent';
import { 
  Repeat, 
  Wrench, 
  GitBranch, 
  AlertTriangle, 
  AlertCircle, 
  CheckCircle, 
  Info,
  Terminal,
  Activity,
  Zap
} from 'lucide-react';

export function ReasoningFeed({ logs }: { logs: ReasoningLogItem[] }) {
  const getIcon = (type: string) => {
    switch(type) {
      case 'decision': return <Zap className="w-3.5 h-3.5 text-blue-400" />;
      case 'repair': return <Wrench className="w-3.5 h-3.5 text-indigo-400" />;
      case 'replan': return <GitBranch className="w-3.5 h-3.5 text-purple-400" />;
      case 'error': return <AlertCircle className="w-3.5 h-3.5 text-rose-400" />;
      case 'confidence': return <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />;
      case 'status': return <Activity className="w-3.5 h-3.5 text-slate-400" />;
      default: return <Info className="w-3.5 h-3.5 text-slate-400" />;
    }
  };

  const getColorClasses = (type: string) => {
    switch(type) {
      case 'decision': return 'border-blue-500/20 bg-blue-500/5 shadow-[0_0_15px_rgba(59,130,246,0.05)]';
      case 'repair': return 'border-indigo-500/20 bg-indigo-500/5 shadow-[0_0_15px_rgba(99,102,241,0.05)]';
      case 'replan': return 'border-purple-500/20 bg-purple-500/5 shadow-[0_0_15px_rgba(168,85,247,0.05)]';
      case 'error': return 'border-rose-500/20 bg-rose-500/5 shadow-[0_0_15px_rgba(244,63,94,0.05)]';
      case 'confidence': return 'border-amber-500/20 bg-amber-500/5 shadow-[0_0_15px_rgba(245,158,11,0.05)]';
      default: return 'border-white/5 bg-white/[0.01]';
    }
  };

  return (
    <div className="w-80 border-l border-white/5 bg-slate-950/20 backdrop-blur-xl flex flex-col h-full hidden md:flex z-30">
      <div className="p-6 border-b border-white/5 bg-white/[0.02]">
        <h2 className="text-xs font-bold tracking-[0.2em] text-slate-400 uppercase flex items-center gap-2.5">
          <Terminal className="w-4 h-4 text-indigo-400" /> Reasoning Feed
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        <div className="flex flex-col gap-4">
          <AnimatePresence initial={false}>
            {logs.map((log, idx) => (
              <motion.div
                key={log.id}
                initial={{ opacity: 0, x: 20, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                className={`p-4 rounded-xl border backdrop-blur-md group relative overflow-hidden transition-all duration-300 hover:border-white/10 ${getColorClasses(log.type)}`}
              >
                {/* Visual Accent */}
                <div className={`absolute top-0 left-0 w-1 h-full opacity-40 ${
                  log.type === 'decision' ? 'bg-blue-500' : 
                  log.type === 'error' ? 'bg-rose-500' : 
                  log.type === 'repair' ? 'bg-indigo-500' : 
                  'bg-slate-700'
                }`} />

                <div className="flex items-start gap-3.5 relative z-10">
                  <div className="p-1.5 rounded-lg bg-slate-950/40 border border-white/5 shadow-inner transform group-hover:scale-110 transition-transform duration-300">
                    {getIcon(log.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-[9px] font-black text-slate-500 uppercase tracking-tighter tabular-nums">
                        {log.timestamp.split('T')[1]?.slice(0, 11) || log.timestamp}
                      </span>
                      {log.stepId && (
                        <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full bg-slate-900/60 text-indigo-400 border border-indigo-500/20 uppercase tracking-[0.1em]">
                          {log.stepId}
                        </span>
                      )}
                    </div>
                    <p className="text-[13px] text-slate-200 font-bold leading-snug group-hover:text-white transition-colors">
                      {log.message}
                    </p>
                    {log.details && (
                      <div className="mt-2 text-[11px] text-slate-400 font-medium leading-relaxed bg-black/20 p-2 rounded-lg border border-white/5">
                        {log.details}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          {logs.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 opacity-20 group">
              <div className="w-12 h-px bg-gradient-to-r from-transparent via-white to-transparent mb-4 group-hover:scale-x-150 transition-transform duration-1000" />
              <p className="text-[10px] font-black uppercase tracking-[0.2em]">Listening for telemetry...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
